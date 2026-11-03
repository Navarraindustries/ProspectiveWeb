/* CargaEscaner — «El escáner»: la pantalla de carga que se pone encima de la
   landing cada vez que se entra en ella (también al recargar o con #ancla; no
   se guarda nada).

   Secuencia, siempre en 3 s como mucho:
     1. Escaneo (0–1,6 s): una línea azul barre la pantalla cinco veces y cada
        pasada descubre un fotograma real del hero de Case 3; el último es el
        corte de la lesión. Abajo, el corte que se enseña y el porcentaje de la
        precarga REAL de los fotogramas del hero (la misma que usa HeroCortes:
        no se descargan dos veces). Si la red va lenta el porcentaje acelera
        con el tiempo, así que la secuencia nunca espera a la red.
     2. Lesión (1,6–2,0 s): anillo rojo sobre la lesión y el rótulo del 1.er
        candidato que devolvió el detector.
     3. Logo (2,0–2,5 s): el anillo se encoge hasta un punto azul y aparece la
        marca grande centrada.
     4. Apertura (2,5–3,0 s): un círculo se abre desde el punto y descubre la
        landing real; al acabar, la capa avisa (`onFin`) y la página la quita.

   Cualquier clic, toque, rueda o tecla (y el botón «Saltar») hace la apertura
   rápida. Con movimiento reducido o ahorro de datos: solo la marca sobre
   negro, con un fundido de entrada y otro de salida, en 0,7 s.

   La coreografía es CSS (keyframes en landing.css, con los mismos tiempos que
   las constantes de aquí); los temporizadores de aquí solo cambian la fase,
   avisan a la página y desmontan. Va en un portal a <body>: la landing se
   queda `inert` debajo y la capa sigue siendo operable. */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery, useTramo } from "../../hooks/useEstrecho";
import { cifra } from "../../lib/numero";
import { EASE, fundido, motion, useReducedMotion } from "../../motion";
import { TEXTO_OCULTO } from "../../styles/oculto";
import { Button } from "../Button";
import { LogoIcono } from "../shell/Logo";
import {
  CONSULTA_HERO_QUIETO, DETECCION_CASE3, MANIFIESTO, fotogramasListos, pideAhorroDatos, rutaFotograma,
  suscribirPrecargaHero,
} from "./heroFrames";

/** Comienzo de cada fase, en ms desde que se monta la capa. `fin` es el total. */
export const FASES_MS = { lesion: 1600, logo: 2000, apertura: 2500, fin: 3000 } as const;
/** La apertura rápida al saltar. */
export const SALTO_MS = 240;
/** El porcentaje no llega al 100 % antes de esto aunque la precarga vuele. */
export const MIN_CONTADOR_MS = 1200;
/** Versión breve (movimiento reducido o ahorro de datos). */
export const BREVE_MS = { entrada: 200, salida: 480, fin: 700 } as const;
/** Fotogramas que descubre cada pasada del escaneo; el último es el de la lesión. */
export const CORTES_ESCANEO = [0, 15, 30, 45, MANIFIESTO.lesionFrame] as const;
/** Duración de cada pasada de la línea. */
export const BARRIDO_MS = FASES_MS.lesion / CORTES_ESCANEO.length;
/** Dónde cae la lesión en el fotograma 59, en fracción de la imagen (cuadrada). */
export const LESION_EN_IMAGEN = { x: 0.49, y: 0.5 } as const;
const LADO_IMAGEN = 1024;
const TICK_MS = 50;

export type FaseCarga = "escaneo" | "lesion" | "logo" | "apertura" | "salto" | "breve" | "salida";

const entre01 = (v: number) => Math.min(1, Math.max(0, v));

/** Punto de la pantalla donde cae (fx, fy) de una imagen pintada con
    `object-fit: cover` centrada en un rectángulo de `ancho` × `alto`. */
export function puntoEnCover(
  ancho: number, alto: number, imgAncho: number, imgAlto: number, fx: number, fy: number,
): { x: number; y: number } {
  const s = Math.max(ancho / imgAncho, alto / imgAlto);
  const w = imgAncho * s;
  const h = imgAlto * s;
  return { x: (ancho - w) / 2 + fx * w, y: (alto - h) / 2 + fy * h };
}

/** Radio que cubre toda la pantalla desde (x, y): la distancia a la esquina más lejana. */
export function radioApertura(ancho: number, alto: number, x: number, y: number): number {
  return Math.ceil(Math.hypot(Math.max(x, ancho - x), Math.max(y, alto - y)));
}

/** Progreso que se enseña (0–1) a los `ms` del escaneo con una precarga real
    `real` (0–1): la precarga, sin correr más que un llenado en
    MIN_CONTADOR_MS, y con un suelo que crece con el tiempo y llega a 1 al
    acabar el escaneo. Nunca baja. */
export function progresoMostrado(ms: number, real: number): number {
  const t = entre01(ms / FASES_MS.lesion);
  const precarga = Math.min(entre01(real), Math.max(0, ms) / MIN_CONTADOR_MS);
  return entre01(Math.max(precarga, t * t));
}

/** Número de corte (de MANIFIESTO.total) que se enseña a los `ms` del escaneo. */
export function corteMostrado(ms: number): number {
  const t = entre01(ms / FASES_MS.lesion);
  return MANIFIESTO.sliceOf[Math.round(t * (MANIFIESTO.count - 1))];
}

/** «CANDIDATO 1 · ≈3,7 MM», del candidato que coincide con la lesión. */
export function rotuloCandidato(): string {
  const c = DETECCION_CASE3.find((d) => d.lesion) ?? DETECCION_CASE3[0];
  return `CANDIDATO ${c.puesto} · ≈${cifra(c.diametroMm, 1)} MM`;
}

function geometria() {
  const ancho = typeof window === "undefined" ? 1280 : window.innerWidth;
  const alto = typeof window === "undefined" ? 800 : window.innerHeight;
  const { x, y } = puntoEnCover(ancho, alto, LADO_IMAGEN, LADO_IMAGEN, LESION_EN_IMAGEN.x, LESION_EN_IMAGEN.y);
  return { x: Math.round(x), y: Math.round(y), r: radioApertura(ancho, alto, x, y) };
}

/* La marca grande: icono D de 120 px y «Prospective™» en Sora 56 px, con la
   firma debajo. Los tamaños bajan con clamp en landing.css para caber a 360. */
function MarcaGrande() {
  return (
    <span className="carga-escaner__marca" data-logo="">
      <LogoIcono size={120} variante="linea" />
      <span className="carga-escaner__nombre">
        <span className="carga-escaner__producto">
          Prospective<sup aria-hidden="true">™</sup>
        </span>
        <span className="carga-escaner__firma">por SkullApp</span>
      </span>
    </span>
  );
}

export interface CargaEscanerProps {
  /** Empieza la apertura (la landing empieza a verse): aquí la página resuelve el #ancla. */
  onAbrir?: () => void;
  /** La capa ha terminado: la página la desmonta y suelta la landing. */
  onFin: () => void;
}

export function CargaEscaner({ onAbrir, onFin }: CargaEscanerProps) {
  const tramo = useTramo();
  const reducidoConsulta = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reducidoMotion = useReducedMotion() ?? false;
  const datosReducidos = useMediaQuery("(prefers-reduced-data: reduce)");
  const heroQuieto = useMediaQuery(CONSULTA_HERO_QUIETO);
  // El modo se decide al montar: cambiarlo a media secuencia la rompería.
  const [breve] = useState(() => reducidoConsulta || reducidoMotion || datosReducidos || pideAhorroDatos());
  // Con el hero animado, el porcentaje sigue los 60 fotogramas que precarga él;
  // con el hero quieto (no los precarga), solo los cinco que enseña la capa.
  const [conPrecargaHero] = useState(() => !heroQuieto);

  const [fase, setFase] = useState<FaseCarga>(breve ? "breve" : "escaneo");
  const [ms, setMs] = useState(0);
  // Sin la precarga del hero: los cinco fotogramas de la capa (los que ya estén, cuentan).
  const [vistos] = useState(() => new Set<number>(CORTES_ESCANEO.filter((f) => fotogramasListos().has(f))));
  const [real, setReal] = useState(() => (conPrecargaHero ? 0 : vistos.size / CORTES_ESCANEO.length));
  const [geo, setGeo] = useState(geometria);

  const avisos = useRef({ onAbrir, onFin });
  useEffect(() => { avisos.current = { onAbrir, onFin }; });
  const faseActual = useRef(fase);
  const cambiarFase = useCallback((f: FaseCarga) => {
    faseActual.current = f;
    setFase(f);
  }, []);
  const abierta = useRef(false);
  const terminada = useRef(false);
  const relojes = useRef(new Set<ReturnType<typeof setTimeout>>());

  const programar = useCallback((retardo: number, f: () => void) => {
    const id = setTimeout(() => { relojes.current.delete(id); f(); }, retardo);
    relojes.current.add(id);
  }, []);

  const abrir = useCallback(() => {
    if (abierta.current) return;
    abierta.current = true;
    avisos.current.onAbrir?.();
  }, []);

  const terminar = useCallback(() => {
    if (terminada.current) return;
    terminada.current = true;
    abrir();
    for (const id of relojes.current) clearTimeout(id);
    relojes.current.clear();
    avisos.current.onFin();
  }, [abrir]);

  const saltar = useCallback(() => {
    if (terminada.current) return;
    const f = faseActual.current;
    if (f === "salto") return;
    // Ya se está abriendo (o es la versión breve): fuera sin más.
    if (breve || f === "apertura" || f === "salida") { terminar(); return; }
    for (const id of relojes.current) clearTimeout(id);
    relojes.current.clear();
    cambiarFase("salto");
    abrir();
    programar(SALTO_MS, terminar);
  }, [abrir, breve, cambiarFase, programar, terminar]);

  // La secuencia: solo fases, avisos y el desmontaje; el dibujo lo lleva el CSS.
  useEffect(() => {
    const relojesVivos = relojes.current;
    let pulso: ReturnType<typeof setInterval> | undefined;
    if (breve) {
      programar(BREVE_MS.salida, () => { cambiarFase("salida"); abrir(); });
      programar(BREVE_MS.fin, terminar);
    } else {
      const t0 = performance.now();
      pulso = setInterval(() => {
        const d = performance.now() - t0;
        setMs(Math.min(d, FASES_MS.lesion));
        if (d >= FASES_MS.lesion) clearInterval(pulso);
      }, TICK_MS);
      programar(FASES_MS.lesion, () => { setMs(FASES_MS.lesion); cambiarFase("lesion"); });
      programar(FASES_MS.logo, () => cambiarFase("logo"));
      programar(FASES_MS.apertura, () => { cambiarFase("apertura"); abrir(); });
      programar(FASES_MS.fin, terminar);
    }
    return () => {
      clearInterval(pulso);
      for (const id of relojesVivos) clearTimeout(id);
      relojesVivos.clear();
    };
  }, [abrir, breve, cambiarFase, programar, terminar]);

  // Cualquier clic, toque, rueda o tecla salta.
  useEffect(() => {
    const opciones = { passive: true } as const;
    window.addEventListener("pointerdown", saltar, opciones);
    window.addEventListener("click", saltar, opciones);
    window.addEventListener("wheel", saltar, opciones);
    window.addEventListener("keydown", saltar);
    return () => {
      window.removeEventListener("pointerdown", saltar);
      window.removeEventListener("click", saltar);
      window.removeEventListener("wheel", saltar);
      window.removeEventListener("keydown", saltar);
    };
  }, [saltar]);

  // La posición de la lesión depende de cómo recorta `cover` la pantalla.
  useEffect(() => {
    const alCambiar = () => setGeo(geometria());
    window.addEventListener("resize", alCambiar);
    return () => window.removeEventListener("resize", alCambiar);
  }, []);

  // Progreso real: la precarga compartida con el hero.
  useEffect(() => {
    if (breve || !conPrecargaHero) return;
    return suscribirPrecargaHero(() => setReal(fotogramasListos().size / MANIFIESTO.count));
  }, [breve, conPrecargaHero]);

  const alCargarCorte = (f: number) => {
    if (conPrecargaHero) return;
    vistos.add(f);
    setReal(vistos.size / CORTES_ESCANEO.length);
  };

  const pct = Math.floor(progresoMostrado(ms, real) * 100);
  const estilo = {
    "--carga-x": `${geo.x}px`,
    "--carga-y": `${geo.y}px`,
    "--carga-iris-fin": `${geo.r}px`,
  } as CSSProperties;
  const transicionBreve = { duration: BREVE_MS.entrada / 1000, ease: EASE };

  return createPortal(
    <motion.div
      className="carga-escaner"
      data-theme="dark"
      data-escenario="oscuro"
      data-tramo={tramo}
      data-modo={breve ? "breve" : "completo"}
      data-fase={fase}
      style={estilo}
      {...(breve ? { initial: { opacity: 1 }, animate: { opacity: fase === "salida" ? 0 : 1 }, transition: transicionBreve } : {})}
    >
      <div role="status" style={TEXTO_OCULTO}>Cargando Prospective</div>

      {breve ? (
        <motion.div
          className="carga-escaner__decorado"
          aria-hidden="true"
          variants={fundido}
          initial="initial"
          animate="animate"
          transition={transicionBreve}
        >
          <MarcaGrande />
        </motion.div>
      ) : (
        <div className="carga-escaner__decorado" aria-hidden="true">
          {CORTES_ESCANEO.map((f, k) => (
            <img
              key={f}
              className="carga-escaner__corte"
              src={rutaFotograma(f)}
              alt=""
              decoding="async"
              data-fotograma={f}
              style={{ "--k": k } as CSSProperties}
              onLoad={() => alCargarCorte(f)}
            />
          ))}
          <div className="carga-escaner__barrido" />
          <span className="carga-escaner__hud carga-escaner__hud--titulo">PROSPECTIVE · CASE 3 · 3DRA</span>
          <div className="carga-escaner__anillo" />
          <span className="carga-escaner__rotulo">{rotuloCandidato()}</span>
          <div className="carga-escaner__logo"><MarcaGrande /></div>
        </div>
      )}

      <div className="carga-escaner__pie">
        {!breve && (
          <span className="carga-escaner__hud carga-escaner__hud--corte" aria-hidden="true">
            CORTE {corteMostrado(ms)} / {MANIFIESTO.total}
          </span>
        )}
        <Button variant="secondary" size="md" className="carga-escaner__saltar" onClick={saltar}>Saltar</Button>
        {!breve && (
          <span className="carga-escaner__hud carga-escaner__hud--cifra" aria-hidden="true">{pct}{" "}%</span>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
