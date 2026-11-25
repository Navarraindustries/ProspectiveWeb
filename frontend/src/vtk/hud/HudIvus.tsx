/* IVUS virtual de VINI 3D: junto al recorrido por dentro del vaso, el corte
   transversal donde va la cámara (como la imagen de un catéter de IVUS), la
   vista longitudinal del vaso enderezado y las medidas de cada sección.

   Sale de la angio-TC o la 3DRA, no de un ultrasonido: se ve la luz, no la
   pared (con vóxeles de ~0,5 mm la pared intracraneal no se resuelve), y el
   panel lo dice. Arrastrar sobre el corte gira la recta de la vista
   longitudinal; un clic en la vista longitudinal o en el gráfico de
   secciones (P4: área, diámetros o circularidad a lo largo de la línea)
   lleva el recorrido allí. */
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SyntheticEvent } from "react";
import { api } from "../../api/client";
import type { FdSizingResult, IvusBranch, IvusCompareResult, IvusResult } from "../../api/types";
import { cifra } from "../../lib/numero";
import { indexAtArc } from "../centerlineWalk";
import type { GrabFn } from "../captureRenderWindow";
import {
  cambioArea, diferenciaDispositivo, graficoDe, METRICAS_GRAFICO, opcionesQueEncajan, ramasBajo, ramasCerca, zonaDelPlan,
  type MarcaEnLinea, type MetricaGrafico,
} from "../ivusVirtual";
import { coloresDe, pintarCorte, pintarGrafico, pintarL, seccionDe } from "./dibujoIvus";
import type { ProgresoRecorrido } from "./HudRecorrido";
import { pintarPanel, textoStentAqui, textosDelPanel, type CtxPanel } from "./ivusVideo";

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
/* FE-14: la clave lleva también la medida del cuello: con solo la línea, volver
   a medir dejaba el plan del cuello anterior. Y un error no se guarda: antes se
   quedaba fijo hasta recargar la página. */
export function cargarPlan(sessionId: string, clave: string, medida = ""): Promise<Plan> {
  const k = `${sessionId}|${clave}|${medida}`;
  let p = cachePlan.get(k);
  if (!p) {
    p = api.fdSizing(sessionId).then(
      (fd): Plan => ({ fd }),
      (e: unknown): Plan => ({ nota: e instanceof Error ? e.message : "No se pudo dimensionar el flow diverter." }),
    );
    void p.then((r) => { if ("nota" in r) cachePlan.delete(k); });
    cachePlan.set(k, p);
  }
  return p;
}
/* La comparación con el estudio anterior (POST ivus/compare), una por sesión,
   línea y estudio. Un 409 (sin superponer en Seguimiento) se dice tal cual. */
type Comparacion = { comp: IvusCompareResult } | { nota: string };
const cacheComp = new Map<string, Promise<Comparacion>>();
function cargarComparacion(sessionId: string, clave: string, anterior: string): Promise<Comparacion> {
  const k = `${sessionId}|${clave}|${anterior}`;
  let p = cacheComp.get(k);
  if (!p) {
    p = api.ivusCompare(sessionId, anterior).then(
      (comp): Comparacion => ({ comp }),
      (e: unknown): Comparacion => ({ nota: e instanceof Error ? e.message : "No se pudo comparar con el estudio anterior." }),
    );
    void p.then((r) => { if ("nota" in r) cacheComp.delete(k); });
    cacheComp.set(k, p);
  }
  return p;
}
/** Para los tests. */
export function olvidarIvus(): void { cache.clear(); cachePlan.clear(); cacheComp.clear(); }

export interface HudIvusProps {
  sessionId: string;
  /** Cambia cuando cambia la línea central (se vuelve a pedir el pullback). */
  claveLinea: string;
  /** Cambia cuando cambia la medida del cuello (se vuelve a pedir el plan del flow diverter). */
  claveMedida?: string;
  progreso: ProgresoRecorrido;
  onIrA(mm: number): void;
  onCerrar(): void;
  /** El estudio superpuesto en Seguimiento: con él, el panel puede compararse. */
  anterior?: string | null;
  /** Marcadores de anotación que caen sobre la línea. */
  marcas?: MarcaEnLinea[];
  /** Deja un marcador en la sección donde va el recorrido, con esta nota. */
  onMarcar?(nota: string): void;
  /** La grabación de VINI 3D copia el panel con esto en cada fotograma. */
  registrarCopia?(copiar: GrabFn | null): void;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();
const mm2 = (v: number | null | undefined) => (v == null ? "—" : `${cifra(v, 2)} mm²`);
const mm1 = (v: number | null | undefined) => (v == null ? "—" : cifra(v, 1));
const mm2d = (v: number | null | undefined) => (v == null ? "—" : cifra(v, 2));
const conSigno = (v: number) => `${v < 0 ? "−" : "+"}${cifra(Math.abs(v), 1)}`;

const SIN_MARCAS: MarcaEnLinea[] = [];

export function HudIvus({ sessionId, claveLinea, claveMedida = "", progreso, onIrA, onCerrar, anterior = null, marcas = SIN_MARCAS, onMarcar, registrarCopia }: HudIvusProps) {
  const [pb, setPb] = useState<Pullback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [angulo, setAngulo] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [opcionIdx, setOpcionIdx] = useState(0);
  const [comparar, setComparar] = useState(false);
  const [comparacion, setComparacion] = useState<Comparacion | null>(null);
  const [nota, setNota] = useState<string | null>(null);        // null = sin escribir marcador
  const [metrica, setMetrica] = useState<MetricaGrafico>("area");
  const caja = useRef<HTMLDivElement>(null);
  const corte = useRef<HTMLCanvasElement>(null);
  const largo = useRef<HTMLCanvasElement>(null);
  const grafico = useRef<HTMLCanvasElement>(null);

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
    cargarPlan(sessionId, claveLinea, claveMedida).then((r) => { if (vivo) setPlan(r); });
    return () => { vivo = false; };
  }, [sessionId, claveLinea, claveMedida, sinStent]);
  // Comparar con el estudio anterior: solo cuando se pide (corta otra malla entera).
  useEffect(() => {
    if (!comparar || !anterior) { setComparacion(null); return; }
    let vivo = true;
    setComparacion(null);
    void cargarComparacion(sessionId, claveLinea, anterior).then((r) => { if (vivo) setComparacion(r); });
    return () => { vivo = false; };
  }, [sessionId, claveLinea, anterior, comparar]);
  const comp = comparacion && "comp" in comparacion ? comparacion.comp : null;
  const fd = plan && "fd" in plan ? plan.fd : null;
  const opciones = opcionesQueEncajan(fd);
  const opcion = opciones[opcionIdx] ?? null;

  const arcos = pb?.datos.sections.map((s) => s.arc_mm);
  const i = useSyncExternalStore(progreso.suscribir, () => (arcos?.length ? indexAtArc(arcos, progreso.leer()) : 0));

  useEffect(() => {
    if (!pb || !caja.current) return;
    const col = coloresDe(caja.current);
    const disp = { fd: sinStent ? fd : null, opcion: sinStent ? opcion : null };
    const extra = { previo: comp, marcas };
    if (corte.current) pintarCorte(corte.current, pb.datos, pb.pila, i, angulo, col, disp, extra);
    if (largo.current) pintarL(largo.current, pb.datos, pb.pila, i, angulo, col, disp, extra);
    if (grafico.current) pintarGrafico(grafico.current, pb.datos, i, graficoDe(pb.datos.sections, metrica, comp?.sections), col);
  }, [pb, i, angulo, sinStent, fd, opcion, comp, marcas, metrica]);

  // Para la grabación (UNI-176): el panel entero —corte, cifras, longitudinal,
  // gráfico, MLA, stent o plan, ramas y notas— en la columna del vídeo.
  const leerAhora = useRef({ pb, i, comp, fd, opcion, plan, metrica, sinStent });
  leerAhora.current = { pb, i, comp, fd, opcion, plan, metrica, sinStent };
  useEffect(() => {
    if (!registrarCopia) return;
    const copiar: GrabFn = (ctx, rect) => {
      const a = corte.current, b = largo.current, g = grafico.current;
      const ahora = leerAhora.current;
      if (!a || !b || !g || !ahora.pb || !caja.current) return false;
      const textos = textosDelPanel({
        datos: ahora.pb.datos, i: ahora.i, comp: ahora.comp, metrica: ahora.metrica,
        fd: ahora.sinStent ? ahora.fd : null, opcion: ahora.sinStent ? ahora.opcion : null,
        notaPlan: !ahora.sinStent ? null : !ahora.plan ? "Dimensionando el flow diverter…"
          : "nota" in ahora.plan ? `Plan del flow diverter: ${ahora.plan.nota}` : null,
      });
      pintarPanel(ctx as unknown as CtxPanel, rect, { corte: a, largo: b, grafico: g, anchoLargo: b.width, altoLargo: b.height },
        textos, coloresDe(caja.current));
      return true;
    };
    registrarCopia(copiar);
    return () => registrarCopia(null);
  }, [registrarCopia]);

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
  // UX-29: lo mismo con el teclado. Las vistas solo se manejaban con el puntero.
  const recorrerConTeclas = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!pb) return;
    const n = pb.datos.sections.length;
    const paso = e.shiftKey ? 10 : 1;
    const destino = e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(n - 1, i + paso)
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(0, i - paso)
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (destino === null) return;
    e.preventDefault();
    onIrA(pb.datos.sections[destino].arc_mm);
  };
  const girarConTeclas = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 15 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -15 : 0;
    if (!d) return;
    e.preventDefault();
    setAngulo((a) => (((a + d) % 180) + 180) % 180);
  };

  const s = pb?.datos.sections[i];
  const sm = pb?.datos.summary;
  return (
    <>
    {/* UX-29: en pantallas de 640 px o menos el panel no cabe; antes desaparecía
        sin decir nada. */}
    <p className="hud-ivus-estrecho" role="status">El IVUS virtual necesita más ancho: gira el dispositivo o amplía la ventana.</p>
    <div ref={caja} className="hud-ivus" role="region" aria-label="IVUS virtual" onPointerDown={stop} onDoubleClick={stop} onWheel={stop}>
      <div className="hud-ivus-cabecera">
        <span className="hud-ivus-titulo">IVUS VIRTUAL</span>
        <button type="button" title="Ocultar el IVUS virtual" aria-label="Ocultar el IVUS virtual" onClick={onCerrar}>✕</button>
      </div>
      {error && <p className="hud-ivus-nota" role="alert">{error}</p>}
      {!pb && !error && <p className="hud-ivus-nota" aria-live="polite">Calculando las secciones del vaso…</p>}
      {pb && s && (
        <>
          <canvas ref={corte} className="hud-ivus-corte" role="img" tabIndex={0}
            aria-label={`Corte transversal a ${cifra(s.arc_mm, 1)} mm. Flechas: girar la vista longitudinal`}
            onPointerDown={girar} onPointerMove={girar} onKeyDown={girarConTeclas} />
          <div className="hud-ivus-fila" aria-live="off">
            <span>{`${mm1(s.arc_mm)} mm`}</span>
            {s.in_lesion ? <span className="hud-ivus-aviso">EN LA LESIÓN</span> : s.in_branch ? <span>RAMA</span> : null}
            {ramasCerca(pb.datos.branches, s.arc_mm).map((r, k) => (
              <span key={k} className="hud-ivus-rama">{`Nace una rama Ø ${mm1(r.calibre_mm)} mm`}</span>
            ))}
          </div>
          {s.valid ? (
            <dl className="hud-ivus-medidas">
              <dt>Área</dt><dd>{mm2(s.area_mm2)}</dd>
              <dt>Ø mín · máx</dt><dd><span className="hud-ivus-min">{mm1(s.d_min_mm)}</span>{` · ${mm1(s.d_max_mm)} mm`}</dd>
              <dt>Excentricidad</dt><dd>{s.eccentricity == null ? "—" : cifra(s.eccentricity, 2)}</dd>
              <dt title="Ø por perímetro (P/π) y Ø del mayor círculo que cabe en la luz">Ø perím. · inscrito</dt>
              <dd>{`${mm1(s.d_perimeter_mm)} · `}<span className="hud-ivus-min">{mm1(s.d_inscribed_mm)}</span>{" mm"}</dd>
              <dt title="4πA/P²: 1 es un círculo; baja si la luz está aplastada o tiene entrantes">Circularidad</dt>
              <dd>{s.circularity == null ? "—" : cifra(s.circularity, 2)}</dd>
              {comp && (
                <>
                  <dt>Antes</dt>
                  <dd>{textoAntes(s, comp, i)}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="hud-ivus-nota">Aquí la malla no rodea la línea central: sin medidas.</p>
          )}
          <canvas ref={largo} className="hud-ivus-largo" role="img" tabIndex={0} title="Clic (o flechas) para llevar el recorrido a esa sección"
            aria-label="Vista longitudinal del vaso enderezado. Flechas: sección anterior o siguiente; con Shift, de diez en diez"
            onPointerDown={irA} onPointerMove={irA} onKeyDown={recorrerConTeclas} />
          <div className="hud-ivus-metricas" role="group" aria-label="Medida del gráfico de secciones">
            {METRICAS_GRAFICO.map((m) => (
              <button key={m.id} type="button" aria-pressed={metrica === m.id} onClick={() => setMetrica(m.id)}>{m.rotulo}</button>
            ))}
            <span className="hud-ivus-leyenda">{leyendaGrafico(metrica, !!comp)}</span>
          </div>
          <canvas ref={grafico} className="hud-ivus-grafico" role="img" title="Clic para llevar el recorrido a esa sección"
            aria-label={`Gráfico de secciones: ${METRICAS_GRAFICO.find((m) => m.id === metrica)?.rotulo} a lo largo de la línea`}
            onPointerDown={irA} onPointerMove={irA} />
          {sm ? (
            <div className="hud-ivus-resumen">
              <button type="button" className="hud-ivus-mla" title="Llevar el recorrido a la sección más estrecha"
                onClick={() => onIrA(sm.mla_arc_mm)}>
                {/* UX-27: la sigla, desplegada al pasar por encima (en el vídeo no cabe). */}
                <abbr title="Área luminal mínima" style={{ textDecoration: "none" }}>MLA</abbr>{` ${mm2(sm.mla_mm2)} a ${mm1(sm.mla_arc_mm)} mm`}
              </button>
              <span>{`Ref. prox ${mm2(sm.ref_prox_mm2)} · dist ${mm2(sm.ref_dist_mm2)}`}</span>
              <span>{sm.area_stenosis_pct == null ? "Estenosis de área: sin referencia" : `Estenosis de área ${cifra(sm.area_stenosis_pct, 0)} %`}</span>
              {comp?.summary && <span>{`Antes: MLA ${mm2(comp.summary.mla_mm2)} a ${mm1(comp.summary.mla_arc_mm)} mm`}</span>}
            </div>
          ) : (
            <p className="hud-ivus-nota">{pb.datos.note || "Sin resumen."}</p>
          )}
          {anterior && (
            <div className="hud-ivus-dispositivo">
              <button type="button" aria-pressed={comparar} onClick={() => setComparar((c) => !c)}
                title="El estudio superpuesto en Seguimiento, cortado con esta misma línea">
                {comparar ? "Quitar la comparación" : "Comparar con el estudio anterior"}
              </button>
              {comparar && !comparacion && <span aria-live="polite">Cortando el estudio anterior…</span>}
              {comparacion && "nota" in comparacion && <span className="hud-ivus-aviso" role="alert">{comparacion.nota}</span>}
              {comp && <span className="hud-ivus-pie">{`Discontinuo: el estudio anterior. Un cambio de diámetro menor que ${mm2d(comp.noise_mm)} mm (el ruido de la superposición) no se distingue.`}</span>}
            </div>
          )}
          <div className="hud-ivus-marcas">
            {nota === null ? (
              onMarcar && (
                <button type="button" onClick={() => setNota("")} title="Deja un marcador con una nota donde va el recorrido; entra en el informe">
                  Marcar aquí
                </button>
              )
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); onMarcar?.(nota.trim()); setNota(null); }}>
                <input aria-label="Nota del marcador" autoFocus maxLength={200} value={nota} placeholder={`Nota a ${mm1(s.arc_mm)} mm`}
                  onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setNota(null); }} />
                <button type="submit">Guardar</button>
                <button type="button" onClick={() => setNota(null)}>Cancelar</button>
              </form>
            )}
            {marcas.map((m) => (
              <button key={m.id} type="button" className="hud-ivus-marca" title={m.nota || m.etiqueta} onClick={() => onIrA(m.arc_mm)}>
                {`${m.etiqueta} · ${mm1(m.arc_mm)} mm`}
              </button>
            ))}
          </div>
          {pb.datos.stent ? (
            <BloqueStent datos={pb.datos} i={i} onIrA={onIrA} />
          ) : (
            <BloquePlan plan={plan} fd={fd} opciones={opciones} opcionIdx={opcionIdx} setOpcionIdx={setOpcionIdx}
              arcMm={s.arc_mm} vasoMm={s.valid ? s.d_eq_mm : null} ramas={pb.datos.branches} sueloMm={pb.datos.branch_floor_mm} onIrA={onIrA} />
          )}
          <p className="hud-ivus-pie">Calculado sobre la imagen: muestra la luz, no la pared.</p>
        </>
      )}
    </div>
    </>
  );
}

/* El stent desplegado por la línea (Dispositivos): su aposición donde va el
   recorrido y a lo largo de todo él. Mismos números que el mapa 3D. */
function BloqueStent({ datos, i, onIrA }: { datos: IvusResult; i: number; onIrA(mm: number): void }) {
  const st = datos.stent!;
  // La misma frase que el vídeo (ivusVideo): una sola fuente.
  const aqui = textoStentAqui(datos.sections[i], st);
  return (
    <div className="hud-ivus-dispositivo">
      <span className="hud-ivus-titulo">STENT DESPLEGADO</span>
      <span>{aqui}</span>
      {/* «en un corte»: Dispositivos resume el mismo dato con percentiles de
          toda la pared y da cifras algo menores; así se ve por qué. */}
      <span>{`Separado en ${mm1(st.gap_length_mm)} mm (máx. en un corte ${mm2d(st.max_gap_mm)} mm) · comprimido en ${mm1(st.compressed_length_mm)} mm`}</span>
      <span>{`Anclajes: prox. ${mm2d(st.proximal_gap_mm)} · dist. ${mm2d(st.distal_gap_mm)} mm de separación`}</span>
      {st.neck_length_mm > 0 && <span>{`Sin pared (cuello o saco): ${mm1(st.neck_length_mm)} mm; no es mala aposición`}</span>}
      <AvisoRamas ramas={ramasBajo(datos.branches, st.from_arc_mm, st.to_arc_mm)} sueloMm={datos.branch_floor_mm} onIrA={onIrA} />
      <button type="button" title="Llevar el recorrido al principio del stent" onClick={() => onIrA(st.from_arc_mm)}>Ir al anclaje proximal</button>
      <span className="hud-ivus-pie">{`Rojo: separado · azul: comprimido. Por debajo de ${mm2d(st.noise_mm)} mm (un vóxel) no se distingue.`}</span>
    </div>
  );
}

/* Sin stent: el dimensionado del flow diverter sobre la línea (el mismo de
   Dispositivos): anclajes, cuello y la opción del catálogo elegida, con su
   diámetro nominal frente al vaso donde va el recorrido. */
function BloquePlan({ plan, fd, opciones, opcionIdx, setOpcionIdx, arcMm, vasoMm, ramas, sueloMm, onIrA }: {
  plan: Plan | null; fd: FdSizingResult | null; opciones: ReturnType<typeof opcionesQueEncajan>;
  opcionIdx: number; setOpcionIdx(i: number): void; arcMm: number; vasoMm: number | null | undefined;
  ramas?: IvusBranch[]; sueloMm?: number | null; onIrA?(mm: number): void;
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
      {opcion && (opcion.deployed_length_mm != null ? (
        <span>{`Etiquetada ${cifra(opcion.length_mm, 0)} mm; en este vaso se despliega a ~${cifra(opcion.deployed_length_mm, 0)} mm`}</span>
      ) : (
        <span>{`Longitud etiquetada ${cifra(opcion.length_mm, 0)} mm; desplegado puede llegar a ~${cifra(opcion.elongated_length_mm, 0)} mm`}</span>
      ))}
      {opcion?.neck_coverage_pct != null && (
        <span>{`En el cuello: cobertura ~${cifra(opcion.neck_coverage_pct, 0)} %${opcion.neck_pore_density != null ? ` · ${cifra(opcion.neck_pore_density, 0)} poros/mm²` : ""}`}</span>
      )}
      {fd.multiple_devices && <span className="hud-ivus-aviso">Los anclajes difieren mucho: valorar más de un dispositivo.</span>}
      {opcion && <AvisoRamas ramas={ramasBajo(ramas, opcion.deploy_arc_mm[0], opcion.deploy_arc_mm[1])} sueloMm={sueloMm} onIrA={onIrA} />}
      <span className="hud-ivus-pie">Ámbar: cuello · franja inferior: despliegue. Para ver la aposición real, despliega el stent en Dispositivos.</span>
    </div>
  );
}

/** Qué es cada curva del gráfico de secciones (los colores, como en el corte). */
function leyendaGrafico(m: MetricaGrafico, conAntes: boolean): ReactNode {
  if (m === "diametros") {
    return <>máx · <span className="hud-ivus-titulo">perímetro</span> · <span className="hud-ivus-min">inscrito</span></>;
  }
  if (m === "circularidad") return "1 = círculo";
  return conAntes ? "mm² · discontinuo: antes" : "mm²";
}

/** «Antes: 6,12 mm² (−8 %)»: la misma sección en el estudio anterior. */
function textoAntes(s: IvusResult["sections"][number], comp: IvusCompareResult, i: number): string {
  const ant = comp.sections[i];
  if (!ant?.valid) return "sin sección";
  const d = cambioArea(s, ant);
  return `${mm2(ant.area_mm2)}${d == null ? "" : ` (${d >= 0 ? "+" : "−"}${cifra(Math.abs(d), 0)} %)`}`;
}

/* Las ramas visibles que quedan bajo el dispositivo: lo que más importa de un
   flow diverter es qué orígenes tapa. Las perforantes no se ven: se dice. */
function AvisoRamas({ ramas, sueloMm, onIrA }: { ramas: IvusBranch[]; sueloMm?: number | null; onIrA?(mm: number): void }) {
  const perforantes = sueloMm ? `Las perforantes (menos de ${mm1(sueloMm)} mm) no se ven en la imagen.` : "";
  if (!ramas.length) return <span className="hud-ivus-pie">{`Ninguna rama visible bajo el dispositivo. ${perforantes}`}</span>;
  return (
    <span className="hud-ivus-aviso" role="status">
      {`${ramas.length} rama${ramas.length > 1 ? "s" : ""} visible${ramas.length > 1 ? "s" : ""} bajo el dispositivo: `}
      {ramas.map((r, k) => (
        <button key={k} type="button" className="hud-ivus-enlace" disabled={!onIrA} onClick={() => onIrA?.(r.arc_mm)}>
          {`${mm1(r.arc_mm)} mm (Ø ${mm1(r.calibre_mm)})`}
        </button>
      ))}
      {perforantes && ` ${perforantes}`}
    </span>
  );
}
