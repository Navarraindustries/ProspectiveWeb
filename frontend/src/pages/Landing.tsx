/* Landing — portada pública de PROSPECTIVE (cristal D).
   Un solo scroll: hero de cortes → qué es → cómo funciona → funcionalidades →
   casos reales → índices → dispositivos NAVARRO™ → próximamente → contacto.
   «Entrar» lleva a la aplicación (/app).

   Solo tokens, sin colores escritos a mano; la maquetación vive en
   `styles/landing.css` bajo `.landing-stitch`. Es dark-only: la página fija
   `data-theme="dark"` y no ofrece conmutador de tema. */

import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { FranjaCasos } from "../components/landing/FranjaCasos";
import { HeroCortes } from "../components/landing/HeroCortes";
import { ListaConReglas } from "../components/landing/ListaConReglas";
import { NavPildora } from "../components/landing/NavPildora";
import { Revelar, Seccion } from "../components/landing/Seccion";
import { ComoFunciona } from "../components/landing/SeccionComoFunciona";
import { Indices } from "../components/landing/SeccionIndices";
import { Funcionalidades } from "../components/landing/SeccionFuncionalidades";
import { QueEs } from "../components/landing/SeccionQueEs";
import { Logo } from "../components/shell/Logo";
import { useTramo } from "../hooks/useEstrecho";
import { CONTACTO_ADMIN } from "../lib/contacto";
/* El lema único del producto vive en el titular de HeroCortes: una sola vez. */

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
    <section id="contacto" aria-label="Contacto" tabIndex={-1} className="sec">
      <Revelar className="sec__cuerpo">
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
      </Revelar>
    </section>
  );
}

function Pie() {
  return (
    <footer className="pie">
      <Logo variante="linea" size={32} />
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
  const tramo = useTramo();
  return (
    /* `landing-stitch` trae la maquetación (styles/landing.css) y
       `data-theme="dark"` la ancla en oscuro: la landing no debe seguir el tema
       que el usuario eligió para /app. */
    <div className="landing-stitch" data-theme="dark" data-tramo={tramo} style={{ background: "var(--canvas)", minHeight: "100%" }}>
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
