/* Momento 5 del onboarding: el quirófano en cinco zonas (spec §4.2, §4.4).
   Es una ILUSTRACIÓN fiel del quirófano (no la app real: no hay caso abierto):
   visor con vasos, pastillas superiores, dock de ocho pasos coloreado por
   tramo y panel «PASO 3 · DETECCIÓN». Cinco marcadores numerados; la zona
   activa se enfoca (Foco) y su burbuja se coloca a su lado. El hueco sale de
   getBoundingClientRect de cada zona, así que sirve a cualquier tamaño.
   Foco, marcadores y burbuja van por portal a <body>: el velo y los
   marcadores tienen que estar por encima de la capa de bienvenida.
   Teclado: la burbuja lleva el foco y las flechas; la fila 1–5 de su `extra`
   llega a cualquier zona (los marcadores son para ratón y tacto). */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { Badge } from "../components/Badge";
import { useMovil } from "../hooks/useEstrecho";
import { tramoDePaso, type TramoFlujo } from "../lib/pacientes";
import { STEPS } from "../pipeline/steps";
import { AVISO_PISTAS, ZONAS_QUIROFANO } from "./copy";
import { useOnboarding } from "./OnboardingProvider";
import { Burbuja } from "./tour/Burbuja";
import { Foco } from "./tour/Foco";
import "./quirofano.css";

const PASO_ACTIVO = 3;
const TRAMOS: ReadonlyArray<{ tramo: TramoFlujo; verbo: string }> = [
  { tramo: "preparar", verbo: "Preparar" },
  { tramo: "detectar", verbo: "Detectar" },
  { tramo: "medir", verbo: "Medir" },
  { tramo: "dispositivo", verbo: "Dispositivo" },
  { tramo: "informe", verbo: "Informe" },
];
const NOMBRES_PASO = STEPS.map((s) => s.label);
const pasosDe = (t: TramoFlujo) => STEPS.map((_, i) => i + 1).filter((n) => tramoDePaso(n) === t);
const rangoPasos = (t: TramoFlujo) => {
  const p = pasosDe(t);
  return p.length > 1 ? `pasos ${p[0]} y ${p[p.length - 1]}` : `paso ${p[0]}`;
};

/** Posición del marcador dentro de cada zona (fracción del rectángulo). */
const ANCLA: ReadonlyArray<readonly [number, number]> = [[0.72, 0.5], [1, 0], [0, 0.5], [0, 0], [1, 0]];
const PIN = 44;

/** Margen que se deja libre por arriba y sobre la hoja inferior al traer una zona a la vista. */
const MARGEN_VISTA = 12;

/** Cuánto desplazar (px, positivo = bajar) para que `rect` quede entre el borde superior y
    `limiteAbajo` (el borde de la hoja inferior). Si no cabe entera, se alinea por arriba. */
export function desplazamientoParaVer(rect: { top: number; bottom: number }, limiteAbajo: number, margen = MARGEN_VISTA): number {
  const tope = limiteAbajo - margen;
  if (rect.bottom - rect.top > tope - margen) return rect.top - margen;
  if (rect.bottom > tope) return rect.bottom - tope;
  if (rect.top < margen) return rect.top - margen;
  return 0;
}

/** El antepasado que desplaza (la capa de bienvenida); si no hay, el documento. */
function contenedorConScroll(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

const CANDIDATOS = [
  ["Candidato 1", "saco 5 mm"], ["Candidato 2", "saco 3 mm"], ["Candidato 3", "bifurcación"],
  ["Candidato 4", "saco 2 mm"], ["Candidato 5", "curvatura"],
];

function Vasos() {
  return (
    <svg className="qz-vasos" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="qz-vaso" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--foreground)", stopOpacity: 0.85 }} />
          <stop offset="1" style={{ stopColor: "var(--muted-foreground)", stopOpacity: 0.45 }} />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#qz-vaso)" strokeLinecap="round">
        <path d="M200 290 C 200 240 196 215 190 190 C 184 165 150 150 120 120 C 100 100 90 70 70 40" strokeWidth="10" />
        <path d="M190 190 C 200 160 230 150 260 125 C 285 105 300 75 330 50" strokeWidth="9" />
        <path d="M120 120 C 135 100 160 95 175 70" strokeWidth="6" />
        <path d="M260 125 C 250 100 255 80 245 55" strokeWidth="6" />
        <path d="M150 150 C 130 160 105 165 85 185" strokeWidth="5" />
        <path d="M230 150 C 255 165 285 170 315 195" strokeWidth="5" />
      </g>
      <ellipse cx="176" cy="196" rx="14" ry="12" className="qz-saco" />
      <circle cx="176" cy="196" r="24" className="qz-anillo" />
    </svg>
  );
}

function Dock() {
  return (
    <div className="qz-dock" aria-hidden="true">
      {STEPS.map((_, i) => {
        const n = i + 1;
        const estado = n < PASO_ACTIVO ? "hecho" : n === PASO_ACTIVO ? "activo" : "pendiente";
        return (
          <span key={n} className="qz-paso" data-paso={n} data-estado={estado} title={NOMBRES_PASO[i]}
            style={{ "--qz-c": `var(--tramo-${tramoDePaso(n)})` } as CSSProperties}>
            {estado === "hecho" ? "✓" : n}
          </span>
        );
      })}
    </div>
  );
}

function Ilustracion({ refs, movil, altoHoja = 0 }: { refs: MutableRefObject<(HTMLElement | null)[]>; movil: boolean; altoHoja?: number }) {
  const ref = (i: number) => (el: HTMLElement | null) => { refs.current[i] = el; };
  return (
    <div className="qz" data-movil={movil || undefined} role="group" aria-label="Maqueta del quirófano"
      style={movil && altoHoja > 0 ? ({ "--qz-hoja": `${altoHoja}px` } as CSSProperties) : undefined}>
      <div className="qz__visor" ref={ref(0)}>
        <Vasos />
        <div className="qz__arriba" aria-hidden="true">
          <div className="qz-pastilla qz-pastilla--donde" ref={ref(3)}>
            <span className="qz-flecha">←</span>
            <span className="qz-ruta">Pacientes › Paciente de práctica (HC 0001) › Caso 1</span>
            <span className="qz-riesgo">Riesgo bajo</span>
          </div>
          <div className="qz-pastilla qz-pastilla--guardar" ref={ref(4)}>
            <span className="qz-guardado">Guardado</span>
            <span>Captura</span>
            <span>Grabar</span>
            <span>Archivar en un caso</span>
            <span className="qz-primario">Guardar progreso</span>
            <kbd>⌘K</kbd>
          </div>
        </div>
        <div className="qz__vistas" aria-hidden="true">
          <div className="qz-segmentos"><span>3D</span><span>Cortes 3D</span><span>Oblicuo</span><span className="qz-malla">MALLA ●</span></div>
          <div className="qz-segmentos qz-segmentos--desde">
            <span>DESDE ▸</span><span>ENCUADRAR</span><span>ARRIBA</span><span>DELANTE</span><span>LADO</span><span>CANDIDATO</span><span>ABORDAJE</span>
          </div>
        </div>
        <span className="qz__ejemplo"><Badge variant="brand">Ejemplo</Badge></span>
        <div ref={ref(1)} className="qz__zona-dock"><Dock /></div>
      </div>
      <aside className="qz-panel" ref={ref(2)} aria-hidden="true">
        <h3 className="qz-panel__cab">PASO 3 · DETECCIÓN</h3>
        <ul className="qz-panel__lista">
          {CANDIDATOS.map(([nombre, detalle], i) => (
            <li key={nombre} className="qz-cand" data-primero={i === 0 || undefined}>
              <span className="qz-cand__nombre">{nombre}</span>
              <span className="qz-cand__detalle">{detalle}</span>
            </li>
          ))}
        </ul>
        <div className="qz-panel__pie"><span>Anotaciones ▸</span><span>Registro ▸</span></div>
      </aside>
    </div>
  );
}

function FilaTramos() {
  return (
    <>
      <ol className="qz-tramos" aria-label="Los cinco tramos">
        {TRAMOS.map(({ tramo, verbo }) => (
          <li key={tramo} style={{ "--qz-c": `var(--tramo-${tramo})` } as CSSProperties}>
            <span className="qz-tramos__punto" aria-hidden="true" />
            <span><strong>{verbo}</strong> · {rangoPasos(tramo)}: {pasosDe(tramo).map((n) => NOMBRES_PASO[n - 1]).join(", ")}</span>
          </li>
        ))}
      </ol>
      <p className="qz-aviso">{AVISO_PISTAS}</p>
    </>
  );
}

export function QuirofanoZonas({ onFin, onAtras }: { onFin: () => void; onAtras?: () => void }) {
  const { terminar } = useOnboarding();
  const movil = useMovil();
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [zona, setZona] = useState(0);
  const [rects, setRects] = useState<(DOMRect | null)[]>([]);
  const hecho = useRef(false);
  const total = ZONAS_QUIROFANO.length;

  const medir = useCallback(() => {
    setRects(ZONAS_QUIROFANO.map((_, i) => refs.current[i]?.getBoundingClientRect() ?? null));
  }, []);
  useLayoutEffect(() => { medir(); }, [medir, zona, movil]);
  useEffect(() => {
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    refs.current.forEach((el) => el && ro?.observe(el));
    return () => { window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); ro?.disconnect(); };
  }, [medir]);
  // En móvil la burbuja es una hoja inferior que tapa el final de la pantalla: la zona
  // activa se trae a la vista POR ENCIMA de la hoja (no basta «nearest»: el panel del
  // paso quedaba debajo). La maqueta deja abajo tanto hueco como mide la hoja.
  const [altoHoja, setAltoHoja] = useState(0);
  useEffect(() => {
    if (!movil) return;
    const el = refs.current[zona];
    if (!el) return;
    const hoja = Math.round(document.querySelector<HTMLElement>(".tour-burbuja")?.getBoundingClientRect().height ?? 0);
    setAltoHoja(hoja);
    // También ya, en el DOM: si esta hoja es más alta que la anterior, el hueco de abajo
    // tiene que existir antes de desplazar o el desplazamiento se quedaría corto.
    if (hoja > 0) el.closest<HTMLElement>(".qz")?.style.setProperty("--qz-hoja", `${hoja}px`);
    const delta = desplazamientoParaVer(el.getBoundingClientRect(), window.innerHeight - hoja);
    if (!delta) return;
    const caja = contenedorConScroll(el);
    const suave = !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (typeof caja.scrollBy === "function") caja.scrollBy({ top: delta, behavior: suave ? "smooth" : "auto" });
    else caja.scrollTop += delta;
  }, [zona, movil]);

  const acabar = useCallback(() => {
    if (hecho.current) return;
    hecho.current = true;
    onFin();
  }, [onFin]);
  const saltar = useCallback(() => {
    if (hecho.current) return;
    hecho.current = true;
    void terminar("saltado");
  }, [terminar]);
  const siguiente = () => (zona >= total - 1 ? acabar() : setZona(zona + 1));

  const extra = (
    <>
      <div className="qz-zonas" role="group" aria-label="Zonas del quirófano">
        {ZONAS_QUIROFANO.map((z, i) => (
          <button key={z.titulo} type="button" className="qz-zonas__boton" aria-label={`Zona ${i + 1}: ${z.titulo}`}
            aria-pressed={i === zona} onClick={() => setZona(i)}>{i + 1}</button>
        ))}
      </div>
      {zona === 1 && <FilaTramos />}
    </>
  );

  const rect = rects[zona] ?? null;
  return (
    <>
      <Ilustracion refs={refs} movil={movil} altoHoja={altoHoja} />
      {createPortal(
        <>
          <Foco rect={rect} />
          {rects.map((r, i) => {
            if (!r) return null;
            const [fx, fy] = ANCLA[i];
            const estilo = { left: r.left + r.width * fx - PIN / 2, top: r.top + r.height * fy - PIN / 2 };
            return (
              <button key={i} type="button" className="qz-pin" data-activo={i === zona} style={estilo}
                aria-label={`Marcador de la zona ${i + 1}`} tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} onClick={() => { setZona(i); document.querySelector<HTMLElement>(".tour-burbuja")?.focus(); }}>
                <span aria-hidden="true">{i + 1}</span>
              </button>
            );
          })}
          <Burbuja
            explicacion={ZONAS_QUIROFANO[zona]}
            indice={zona}
            total={total}
            onSiguiente={siguiente}
            onAnterior={() => (zona === 0 ? onAtras?.() : setZona(zona - 1))}
            anteriorEnPrimera={!!onAtras}
            onSaltar={saltar}
            extra={extra}
            rect={rect}
            etiquetaSiguiente="Siguiente"
          />
        </>,
        document.body,
      )}
    </>
  );
}
