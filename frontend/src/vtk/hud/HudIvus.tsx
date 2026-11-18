/* IVUS virtual de VINI 3D: junto al recorrido por dentro del vaso, el corte
   transversal donde va la cámara (como la imagen de un catéter de IVUS), la
   vista longitudinal del vaso enderezado y las medidas de cada sección.

   Sale de la angio-TC o la 3DRA, no de un ultrasonido: se ve la luz, no la
   pared (con vóxeles de ~0,5 mm la pared intracraneal no se resuelve), y el
   panel lo dice. Arrastrar sobre el corte gira la recta de la vista
   longitudinal; un clic en la vista longitudinal lleva el recorrido allí. */
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react";
import { api } from "../../api/client";
import type { FdSizingResult, IvusResult } from "../../api/types";
import { cifra } from "../../lib/numero";
import { indexAtArc } from "../centerlineWalk";
import { diferenciaDispositivo, estadoDeSeccion, opcionesQueEncajan, zonaDelPlan } from "../ivusVirtual";
import { coloresDe, pintarCorte, pintarL, seccionDe } from "./dibujoIvus";
import type { ProgresoRecorrido } from "./HudRecorrido";

interface Pullback { datos: IvusResult; pila: Uint8Array }

/* Un pullback por sesión y línea: abrir y cerrar el panel no lo vuelve a pedir. */
const cache = new Map<string, Promise<Pullback>>();
function cargar(sessionId: string, clave: string): Promise<Pullback> {
  const k = `${sessionId}|${clave}`;
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      const datos = await api.ivusVirtual(sessionId);
      return { datos, pila: await api.ivusStack(datos.stack_url) };
    })();
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}
/* El plan del flow diverter (POST fd-sizing), también uno por sesión y línea.
   Sin morfometría el servidor contesta 422 con lo que falta: se dice tal cual. */
type Plan = { fd: FdSizingResult } | { nota: string };
const cachePlan = new Map<string, Promise<Plan>>();
function cargarPlan(sessionId: string, clave: string): Promise<Plan> {
  const k = `${sessionId}|${clave}`;
  let p = cachePlan.get(k);
  if (!p) {
    p = api.fdSizing(sessionId).then(
      (fd): Plan => ({ fd }),
      (e: unknown): Plan => ({ nota: e instanceof Error ? e.message : "No se pudo dimensionar el flow diverter." }),
    );
    cachePlan.set(k, p);
  }
  return p;
}
/** Para los tests. */
export function olvidarIvus(): void { cache.clear(); cachePlan.clear(); }

export interface HudIvusProps {
  sessionId: string;
  /** Cambia cuando cambia la línea central (se vuelve a pedir el pullback). */
  claveLinea: string;
  progreso: ProgresoRecorrido;
  onIrA(mm: number): void;
  onCerrar(): void;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();
const mm2 = (v: number | null | undefined) => (v == null ? "—" : `${cifra(v, 2)} mm²`);
const mm1 = (v: number | null | undefined) => (v == null ? "—" : cifra(v, 1));
const mm2d = (v: number | null | undefined) => (v == null ? "—" : cifra(v, 2));
const conSigno = (v: number) => `${v < 0 ? "−" : "+"}${cifra(Math.abs(v), 1)}`;

export function HudIvus({ sessionId, claveLinea, progreso, onIrA, onCerrar }: HudIvusProps) {
  const [pb, setPb] = useState<Pullback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [angulo, setAngulo] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [opcionIdx, setOpcionIdx] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const corte = useRef<HTMLCanvasElement>(null);
  const largo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let vivo = true;
    setPb(null); setError(null);
    cargar(sessionId, claveLinea)
      .then((r) => { if (vivo) setPb(r); })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudo calcular el IVUS virtual"); });
    return () => { vivo = false; };
  }, [sessionId, claveLinea]);
  // El plan solo hace falta si no hay stent desplegado (con stent se ve el real).
  const sinStent = !!pb && !pb.datos.stent;
  useEffect(() => {
    if (!sinStent) return;
    let vivo = true;
    setPlan(null); setOpcionIdx(0);
    cargarPlan(sessionId, claveLinea).then((r) => { if (vivo) setPlan(r); });
    return () => { vivo = false; };
  }, [sessionId, claveLinea, sinStent]);
  const fd = plan && "fd" in plan ? plan.fd : null;
  const opciones = opcionesQueEncajan(fd);
  const opcion = opciones[opcionIdx] ?? null;

  const arcos = pb?.datos.sections.map((s) => s.arc_mm);
  const i = useSyncExternalStore(progreso.suscribir, () => (arcos?.length ? indexAtArc(arcos, progreso.leer()) : 0));

  useEffect(() => {
    if (!pb || !caja.current) return;
    const col = coloresDe(caja.current);
    const disp = { fd: sinStent ? fd : null, opcion: sinStent ? opcion : null };
    if (corte.current) pintarCorte(corte.current, pb.datos, pb.pila, i, angulo, col, disp);
    if (largo.current) pintarL(largo.current, pb.datos, pb.pila, i, angulo, col, disp);
  }, [pb, i, angulo, sinStent, fd, opcion]);

  // Arrastrar sobre el corte: la recta de la vista longitudinal apunta al puntero.
  const girar = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture?.(e.pointerId);
    else if (!(e.buttons & 1)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const a = (Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2) * 180) / Math.PI;
    setAngulo(((Math.round(a) % 180) + 180) % 180);
  };
  const irA = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pb) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture?.(e.pointerId);
    else if (!(e.buttons & 1)) return;
    const r = e.currentTarget.getBoundingClientRect();
    onIrA(pb.datos.sections[seccionDe(e.clientX - r.left, pb.datos.n_sections, r.width)].arc_mm);
  };

  const s = pb?.datos.sections[i];
  const sm = pb?.datos.summary;
  return (
    <div ref={caja} className="hud-ivus" role="region" aria-label="IVUS virtual" onPointerDown={stop} onDoubleClick={stop} onWheel={stop}>
      <div className="hud-ivus-cabecera">
        <span className="hud-ivus-titulo">IVUS VIRTUAL</span>
        <button type="button" title="Ocultar el IVUS virtual" aria-label="Ocultar el IVUS virtual" onClick={onCerrar}>✕</button>
      </div>
      {error && <p className="hud-ivus-nota" role="alert">{error}</p>}
      {!pb && !error && <p className="hud-ivus-nota" aria-live="polite">Calculando las secciones del vaso…</p>}
      {pb && s && (
        <>
          <canvas ref={corte} className="hud-ivus-corte" aria-label={`Corte transversal a ${cifra(s.arc_mm, 1)} mm`} role="img"
            onPointerDown={girar} onPointerMove={girar} />
          <div className="hud-ivus-fila" aria-live="off">
            <span>{`${mm1(s.arc_mm)} mm`}</span>
            {s.in_lesion ? <span className="hud-ivus-aviso">EN LA LESIÓN</span> : s.in_branch ? <span>RAMA</span> : null}
          </div>
          {s.valid ? (
            <dl className="hud-ivus-medidas">
              <dt>Área</dt><dd>{mm2(s.area_mm2)}</dd>
              <dt>Ø mín · máx</dt><dd><span className="hud-ivus-min">{mm1(s.d_min_mm)}</span>{` · ${mm1(s.d_max_mm)} mm`}</dd>
              <dt>Excentricidad</dt><dd>{s.eccentricity == null ? "—" : cifra(s.eccentricity, 2)}</dd>
            </dl>
          ) : (
            <p className="hud-ivus-nota">Aquí la malla no rodea la línea central: sin medidas.</p>
          )}
          <canvas ref={largo} className="hud-ivus-largo" role="img" title="Clic para llevar el recorrido a esa sección"
            aria-label="Vista longitudinal del vaso enderezado" onPointerDown={irA} onPointerMove={irA} />
          {sm ? (
            <div className="hud-ivus-resumen">
              <button type="button" className="hud-ivus-mla" title="Llevar el recorrido a la sección más estrecha"
                onClick={() => onIrA(sm.mla_arc_mm)}>
                {`MLA ${mm2(sm.mla_mm2)} a ${mm1(sm.mla_arc_mm)} mm`}
              </button>
              <span>{`Ref. prox ${mm2(sm.ref_prox_mm2)} · dist ${mm2(sm.ref_dist_mm2)}`}</span>
              <span>{sm.area_stenosis_pct == null ? "Estenosis de área: sin referencia" : `Estenosis de área ${cifra(sm.area_stenosis_pct, 0)} %`}</span>
            </div>
          ) : (
            <p className="hud-ivus-nota">{pb.datos.note || "Sin resumen."}</p>
          )}
          {pb.datos.stent ? (
            <BloqueStent datos={pb.datos} i={i} onIrA={onIrA} />
          ) : (
            <BloquePlan plan={plan} fd={fd} opciones={opciones} opcionIdx={opcionIdx} setOpcionIdx={setOpcionIdx}
              arcMm={s.arc_mm} vasoMm={s.valid ? s.d_eq_mm : null} />
          )}
          <p className="hud-ivus-pie">Calculado sobre la imagen: muestra la luz, no la pared.</p>
        </>
      )}
    </div>
  );
}

/* El stent desplegado por la línea (Dispositivos): su aposición donde va el
   recorrido y a lo largo de todo él. Mismos números que el mapa 3D. */
function BloqueStent({ datos, i, onIrA }: { datos: IvusResult; i: number; onIrA(mm: number): void }) {
  const st = datos.stent!;
  const s = datos.sections[i];
  const aqui = (() => {
    if (!s.stent) return `Aquí no hay stent: va de ${mm1(st.from_arc_mm)} a ${mm1(st.to_arc_mm)} mm.`;
    switch (estadoDeSeccion(s, st.noise_mm)) {
      case "separado": return `Aquí: separado ${mm2d(s.stent.max_gap_mm)} mm de la pared.`;
      case "comprimido": return `Aquí: comprimido ${mm2d(s.stent.max_compression_mm)} mm (el nominal es mayor que el vaso).`;
      case "cuello": return s.in_lesion ? "Aquí: dentro de la lesión (no hay pared)." : "Aquí: frente al cuello (no hay pared).";
      default: return "Aquí: en contacto con la pared.";
    }
  })();
  return (
    <div className="hud-ivus-dispositivo">
      <span className="hud-ivus-titulo">STENT DESPLEGADO</span>
      <span>{aqui}</span>
      <span>{`Separado en ${mm1(st.gap_length_mm)} mm (máx. ${mm2d(st.max_gap_mm)} mm) · comprimido en ${mm1(st.compressed_length_mm)} mm`}</span>
      <span>{`Anclajes: prox. ${mm2d(st.proximal_gap_mm)} · dist. ${mm2d(st.distal_gap_mm)} mm de separación`}</span>
      {st.neck_length_mm > 0 && <span>{`Sin pared (cuello o saco): ${mm1(st.neck_length_mm)} mm; no es mala aposición`}</span>}
      <button type="button" title="Llevar el recorrido al principio del stent" onClick={() => onIrA(st.from_arc_mm)}>Ir al anclaje proximal</button>
      <span className="hud-ivus-pie">{`Rojo: separado · azul: comprimido. Por debajo de ${mm2d(st.noise_mm)} mm (un vóxel) no se distingue.`}</span>
    </div>
  );
}

/* Sin stent: el dimensionado del flow diverter sobre la línea (el mismo de
   Dispositivos): anclajes, cuello y la opción del catálogo elegida, con su
   diámetro nominal frente al vaso donde va el recorrido. */
function BloquePlan({ plan, fd, opciones, opcionIdx, setOpcionIdx, arcMm, vasoMm }: {
  plan: Plan | null; fd: FdSizingResult | null; opciones: ReturnType<typeof opcionesQueEncajan>;
  opcionIdx: number; setOpcionIdx(i: number): void; arcMm: number; vasoMm: number | null | undefined;
}) {
  if (!plan) return <p className="hud-ivus-nota">Dimensionando el flow diverter…</p>;
  if (!fd) return <p className="hud-ivus-nota">{`Plan del flow diverter: ${"nota" in plan ? plan.nota : ""}`}</p>;
  const opcion = opciones[opcionIdx] ?? null;
  const zona = zonaDelPlan(arcMm, fd, opcion);
  const dif = opcion ? diferenciaDispositivo(opcion.diameter_mm, vasoMm) : null;
  return (
    <div className="hud-ivus-dispositivo">
      <span className="hud-ivus-titulo">PLAN DE FLOW DIVERTER</span>
      {opciones.length ? (
        <select aria-label="Dispositivo del catálogo" value={opcionIdx} onChange={(e) => setOpcionIdx(Number(e.target.value))}>
          {opciones.map((o, k) => (
            <option key={`${o.device_id}-${k}`} value={k}>{`${o.name} ${cifra(o.diameter_mm, 2)} × ${cifra(o.length_mm, 0)} mm`}</option>
          ))}
        </select>
      ) : (
        <span className="hud-ivus-aviso">Ninguna medida del catálogo encaja.</span>
      )}
      <span>{`Anclajes Ø ${fd.proximal.diameter_mm > 0 ? mm2d(fd.proximal.diameter_mm) : "—"} · ${fd.distal.diameter_mm > 0 ? mm2d(fd.distal.diameter_mm) : "—"} mm · cuello ${mm1(Math.abs(fd.neck_arc_mm[1] - fd.neck_arc_mm[0]))} mm`}</span>
      {opcion && zona && (
        <span>{`Aquí (${zona}): Ø ${mm2d(opcion.diameter_mm)} frente a vaso ${mm2d(vasoMm)} mm${dif == null ? "" : ` (${conSigno(dif)})`}`}</span>
      )}
      {opcion && <span>{`Longitud etiquetada ${cifra(opcion.length_mm, 0)} mm; desplegado puede llegar a ~${cifra(opcion.elongated_length_mm, 0)} mm`}</span>}
      {fd.multiple_devices && <span className="hud-ivus-aviso">Los anclajes difieren mucho: valorar más de un dispositivo.</span>}
      <span className="hud-ivus-pie">Ámbar: cuello · franja inferior: despliegue. Para ver la aposición real, despliega el stent en Dispositivos.</span>
    </div>
  );
}
