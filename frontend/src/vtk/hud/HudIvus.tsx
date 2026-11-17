/* IVUS virtual de VINI 3D: junto al recorrido por dentro del vaso, el corte
   transversal donde va la cámara (como la imagen de un catéter de IVUS), la
   vista longitudinal del vaso enderezado y las medidas de cada sección.

   Sale de la angio-TC o la 3DRA, no de un ultrasonido: se ve la luz, no la
   pared (con vóxeles de ~0,5 mm la pared intracraneal no se resuelve), y el
   panel lo dice. Arrastrar sobre el corte gira la recta de la vista
   longitudinal; un clic en la vista longitudinal lleva el recorrido allí. */
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react";
import { api } from "../../api/client";
import type { IvusResult } from "../../api/types";
import { cifra } from "../../lib/numero";
import { indexAtArc } from "../centerlineWalk";
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
/** Para los tests. */
export function olvidarIvus(): void { cache.clear(); }

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

export function HudIvus({ sessionId, claveLinea, progreso, onIrA, onCerrar }: HudIvusProps) {
  const [pb, setPb] = useState<Pullback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [angulo, setAngulo] = useState(0);
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

  const arcos = pb?.datos.sections.map((s) => s.arc_mm);
  const i = useSyncExternalStore(progreso.suscribir, () => (arcos?.length ? indexAtArc(arcos, progreso.leer()) : 0));

  useEffect(() => {
    if (!pb || !caja.current) return;
    const col = coloresDe(caja.current);
    if (corte.current) pintarCorte(corte.current, pb.datos, pb.pila, i, angulo, col);
    if (largo.current) pintarL(largo.current, pb.datos, pb.pila, i, angulo, col);
  }, [pb, i, angulo]);

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
          <p className="hud-ivus-pie">Calculado sobre la imagen: muestra la luz, no la pared.</p>
        </>
      )}
    </div>
  );
}
