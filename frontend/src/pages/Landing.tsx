/* Landing — portada pública de PROSPECTIVE (cristal D).
   Un solo scroll: hero de cortes → qué es → cómo funciona → funcionalidades →
   casos reales → índices → dispositivos NAVARRO™ → próximamente → contacto.
   «Entrar» lleva a la aplicación (/app).

   Solo tokens, sin colores escritos a mano; la maquetación vive en
   `styles/landing.css` bajo `.landing-stitch`. Es dark-only: la página fija
   `data-theme="dark"` y no ofrece conmutador de tema. */

import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { FranjaCasos } from "../components/landing/FranjaCasos";
import { HeroCortes } from "../components/landing/HeroCortes";
import { ListaConReglas } from "../components/landing/ListaConReglas";
import { NavPildora } from "../components/landing/NavPildora";
import { useVisible } from "../components/patients/useVisible";
import { Logo } from "../components/shell/Logo";
import { CONTACTO_ADMIN } from "../lib/contacto";
import { cifra } from "../lib/numero";
/* Los cortes de los índices se importan, no se copian: la portada no puede
   volver a decir un umbral distinto del que aplica la aplicación. */
import {
  AR_HIGH, BF_WIDE, DNR_HIGH, EI_MOD, SR_HIGH, UI_HIGH,
} from "../components/morphometry/thresholds";
import { DUR, EASE, motion, useReducedMotion } from "../motion";
import { STEPS } from "../pipeline/steps";
/* El lema único del producto vive en el titular de HeroCortes: una sola vez. */

/* Cada sección entra una vez, con opacidad al aparecer y sin desplazamiento.
   Con movimiento reducido se pinta ya entera. */
function Seccion({ id, rotulo, titulo, children }: {
  id?: string;
  rotulo: string;
  titulo: string;
  children: React.ReactNode;
}) {
  const reducido = useReducedMotion() ?? false;
  const cuerpo = useRef<HTMLDivElement>(null);
  const visible = useVisible(cuerpo, "0px");
  return (
    <section id={id} aria-label={rotulo} className="sec">
      <motion.div
        ref={cuerpo}
        className="sec__cuerpo"
        initial={reducido ? false : { opacity: 0 }}
        animate={{ opacity: visible || reducido ? 1 : 0 }}
        transition={{ duration: DUR.panel, ease: EASE }}
      >
        <header className="sec__cabecera">
          <div className="sec__rotulo">{rotulo}</div>
          <h2 className="sec__titulo">{titulo}</h2>
        </header>
        {children}
      </motion.div>
    </section>
  );
}

/* ── Qué es ─────────────────────────────────────────────────────────────── */
function QueEs() {
  return (
    <Seccion id="que-es" rotulo="Qué es" titulo="Una mesa de quirófano hecha de imagen">
      <div className="sec__dos">
        <div>
          <h3 className="sec__subtitulo">Del DICOM a la decisión</h3>
          <p className="sec__texto">
            Prospective convierte la angiografía del paciente en un modelo 3D medible y propone la vía
            de tratamiento con criterios explícitos.
          </p>
        </div>
        <div>
          <h3 className="sec__subtitulo">Pensada para el servicio</h3>
          <p className="sec__texto">
            Pacientes, casos, estudios y sesiones reanudables: el trabajo del neurocirujano continúa
            donde lo dejó. Puedes registrar al paciente con iniciales o un código.
          </p>
        </div>
      </div>
    </Seccion>
  );
}

/* ── Cómo funciona ──────────────────────────────────────────────────────── */
/* La portada decía «siete pasos» sobre una lista que ya tenía ocho: los
   rótulos salen de `STEPS` y el número se deletrea desde la misma lista. */
const NUM_WORD = ["cero", "uno", "dos", "tres", "cuatro", "cinco",
                  "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];
const spell = (n: number): string => NUM_WORD[n] ?? String(n);

const LINEA_PASO: Record<string, string> = {
  upload: "Estudio del paciente",
  segment: "Árbol vascular 3D",
  detect: "Candidatos numerados",
  morpho: "Cuello, domo, Ø máximo",
  treatment: "Clip o endovascular",
  devices: "Clips, coils, stents",
  manufacture: "Clip a medida",
  report: "Documento clínico",
};

function ComoFunciona() {
  return (
    <Seccion
      id="como-funciona"
      rotulo="Cómo funciona"
      titulo={`Del estudio al plan, en ${spell(STEPS.length)} pasos y en el orden de la cirugía`}
    >
      <ol className="pasos">
        {STEPS.map((s, i) => (
          <li key={s.key} className="pasos__paso" data-glass>
            <div className="pasos__num">{String(i + 1).padStart(2, "0")}</div>
            <div className="pasos__nombre">{s.label}</div>
            <div className="pasos__linea">{LINEA_PASO[s.key] ?? ""}</div>
          </li>
        ))}
      </ol>
    </Seccion>
  );
}

/* ── Funcionalidades ────────────────────────────────────────────────────── */
const FUNCIONALIDADES = [
  "Segmentación 3D automática",
  "Detección por calibre, cociente y curvatura",
  "Morfometría del saco y del cuello",
  "Motor de decisión: PHASES, JSDB y geometría",
  "Prueba de clips, coils y stents",
  "Clip a medida para fabricar",
  "Informe clínico",
  "Sesiones guardadas",
  "Pacientes, casos y estudios",
];

function Funcionalidades() {
  return (
    <Seccion id="funcionalidades" rotulo="Funcionalidades" titulo="Lo que hay dentro">
      <ListaConReglas columnas={2} items={FUNCIONALIDADES.map((titulo) => ({ titulo }))} />
      <p className="sec__nota">
        Cada resultado dice de dónde viene y cuánto se puede confiar en él. La herramienta propone; el
        cirujano decide.
      </p>
    </Seccion>
  );
}

/* ── Índices morfométricos ──────────────────────────────────────────────── */
// Cada corte con coma decimal y sus decimales (2,0 y no 2), vía lib/numero.
function Indices() {
  // El texto del BF estaba invertido (F1-162): un BF alto es un cuello
  // relativamente estrecho, nunca lo contrario. El NSI no tiene corte.
  const metricas: [string, string, string][] = [
    ["DNR", "Relación domo-cuello (DNR)", `Ø máx / cuello · riesgo ↑ si ≥ ${cifra(DNR_HIGH, 1)}`],
    ["AR", "Relación de aspecto (AR)", `altura de domo / cuello · riesgo ↑ si ≥ ${cifra(AR_HIGH, 1)}`],
    ["BF", "Factor de cuello (BF)", `Ø domo / cuello · cuello estrecho si > ${cifra(BF_WIDE, 1)}`],
    ["UI", "Índice de ondulación (UI)", `irregularidad del domo · alto si ≥ ${cifra(UI_HIGH, 2)}`],
    ["EI", "Índice de elipticidad (EI)", `desviación elíptica · alto si ≥ ${cifra(EI_MOD, 2)}`],
    ["NSI", "Índice de no esfericidad (NSI)", "1 − esfericidad de Wadell · sin corte"],
    ["SR", "Relación de tamaño (SR)", `Ø máx / arteria madre · alto si ≥ ${cifra(SR_HIGH, 1)}`],
    ["PHASES", "Riesgo en aneurismas no rotos", "escala de Greving et al., Lancet Neurology 2014"],
  ];
  return (
    <Seccion id="indices" rotulo="Índices morfométricos" titulo="Ocho números que describen el saco">
      <ListaConReglas
        items={metricas.map(([abbr, titulo, detalle]) => ({ titulo, detalle, cifra: abbr }))}
      />
      <p className="sec__nota">
        Cuello, altura máxima y forma del saco. El sistema traduce las siglas a un nivel de riesgo
        (bajo · moderado · alto). Referencias: Greving 2014 · Dhar 2008 · Raghavan 2005 · Wadell.
      </p>
    </Seccion>
  );
}

/* ── Dispositivos NAVARRO™ ──────────────────────────────────────────────── */
const trazo = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
} as const;

const SERIES: { nombre: string; detalle?: string; dibujo: React.ReactNode }[] = [
  { nombre: "T1 recta", dibujo: <path d="M12 58L58 12M18 64L64 18" /> },
  { nombre: "T2 curva", dibujo: <path d="M10 60C14 30 40 14 62 14M18 64C22 38 44 24 64 22" /> },
  { nombre: "T3 angulada", detalle: "15–90°", dibujo: <path d="M10 62L36 34L62 34M18 66L40 44L64 44" /> },
  {
    nombre: "T4 fenestrada",
    detalle: "3 · 5 · 7 mm",
    dibujo: (
      <>
        <path d="M12 58L58 12M18 64L64 18" />
        <circle cx="38" cy="38" r="6" />
      </>
    ),
  },
];

function Dispositivos() {
  return (
    <Seccion id="dispositivos" rotulo="Dispositivos NAVARRO™" titulo="Cuatro series, fabricadas bajo pedido">
      <p className="sec__texto sec__texto--ancho">
        Se fabrican en taller a partir del pedido. Prospective elige la serie y ajusta la mordaza al
        cuello medido.
      </p>
      <div className="series">
        {SERIES.map((s) => (
          <div key={s.nombre} className="series__ficha" data-glass>
            <svg width="70" height="70" viewBox="0 0 70 70" aria-hidden="true" {...trazo}>
              {s.dibujo}
            </svg>
            <div className="series__nombre">{s.nombre}</div>
            {s.detalle && <div className="series__detalle">{s.detalle}</div>}
          </div>
        ))}
      </div>
    </Seccion>
  );
}

/* ── Próximamente ───────────────────────────────────────────────────────── */
function Proximamente() {
  const items = [
    ["SkullCloud", "Almacenamiento y colaboración de casos en la nube entre centros."],
    ["AR / VR", "Exploración inmersiva de la anatomía vascular y el plan quirúrgico."],
    ["Analítica", "Estadísticas agregadas de casos, dispositivos y resultados."],
  ];
  return (
    <Seccion id="proximamente" rotulo="Próximamente" titulo="Lo que viene">
      <ListaConReglas
        items={items.map(([titulo, detalle]) => ({
          titulo,
          detalle,
          cifra: <span className="stitch-label">Próximamente</span>,
        }))}
      />
    </Seccion>
  );
}

/* ── Contacto y pie ─────────────────────────────────────────────────────── */
function Contacto({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void }) {
  return (
    <section id="contacto" aria-label="Contacto" className="sec">
      <div className="sec__cuerpo">
        <div className="contacto" data-glass>
          <div>
            <h2 className="sec__titulo sec__titulo--contacto">Hablemos de tu servicio</h2>
            <p className="sec__texto">
              Escríbenos para una demostración con tus propios estudios:{" "}
              <a href={`mailto:${CONTACTO_ADMIN}`}>{CONTACTO_ADMIN}</a>
            </p>
          </div>
          <div className="contacto__acciones">
            <Button size="lg" variant="secondary" onClick={onCrearCuenta}>Crear cuenta</Button>
            <Button size="lg" onClick={onEntrar}>Entrar</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pie() {
  return (
    <footer className="pie">
      <Logo />
      <div className="pie__aviso">
        <div>SkullApp · Laboratorio de Imagen Médica</div>
        <div>Herramienta de apoyo a la decisión clínica. No sustituye el criterio del cirujano.</div>
      </div>
    </footer>
  );
}

/* ── Página ─────────────────────────────────────────────────────────────── */
export function Landing() {
  const navigate = useNavigate();
  const entrar = () => navigate("/app");
  const crearCuenta = () => navigate("/app/registro");
  return (
    /* `landing-stitch` trae la maquetación (styles/landing.css) y
       `data-theme="dark"` la ancla en oscuro: la landing no debe seguir el tema
       que el usuario eligió para /app. */
    <div className="landing-stitch" data-theme="dark" style={{ background: "var(--canvas)", minHeight: "100%" }}>
      <NavPildora onEntrar={entrar} onCrearCuenta={crearCuenta} />
      <HeroCortes onEntrar={entrar} onCrearCuenta={crearCuenta} />
      <QueEs />
      <ComoFunciona />
      <Funcionalidades />
      <FranjaCasos />
      <Indices />
      <Dispositivos />
      <Proximamente />
      <Contacto onEntrar={entrar} onCrearCuenta={crearCuenta} />
      <Pie />
    </div>
  );
}
