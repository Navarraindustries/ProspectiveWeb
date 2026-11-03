/* Landing — portada pública de PROSPECTIVE (cristal D).
   Un solo scroll: hero de cortes → qué es → cómo funciona → funcionalidades →
   casos reales → índices → dispositivos NAVARRO™ → próximamente → contacto.
   «Entrar» lleva a la aplicación (/app).

   Solo tokens, sin colores escritos a mano; la maquetación vive en
   `styles/landing.css` bajo `.landing-stitch`. Sigue el tema de la aplicación
   (conmutador en la nav); el escenario del hero y la franja de casos se quedan
   en el negro del visor con `data-theme="dark"` acotado a ellos. */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { CargaEscaner } from "../components/landing/CargaEscaner";
import { FranjaCasos } from "../components/landing/FranjaCasos";
import { HeroCortes } from "../components/landing/HeroCortes";
import { NavPildora } from "../components/landing/NavPildora";
import { Revelar } from "../components/landing/Seccion";
import { ComoFunciona } from "../components/landing/SeccionComoFunciona";
import { Dispositivos } from "../components/landing/SeccionDispositivos";
import { Indices } from "../components/landing/SeccionIndices";
import { Funcionalidades } from "../components/landing/SeccionFuncionalidades";
import { Proximamente } from "../components/landing/SeccionProximamente";
import { QueEs } from "../components/landing/SeccionQueEs";
import { Logo } from "../components/shell/Logo";
import { useTramo } from "../hooks/useEstrecho";
import { CONTACTO_ADMIN } from "../lib/contacto";
/* El lema único del producto vive en el titular de HeroCortes: una sola vez. */

/* ── Contacto y pie ─────────────────────────────────────────────────────── */
function Contacto({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void }) {
  return (
    <section id="contacto" aria-labelledby="contacto-titulo" tabIndex={-1} className="sec">
      <Revelar className="sec__cuerpo">
        <div className="contacto" data-glass>
          <div>
            <h2 id="contacto-titulo" className="sec__titulo sec__titulo--contacto">Hablemos de tu servicio</h2>
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

/* ── Pantalla de carga ──────────────────────────────────────────────────── */
/* Mientras está la capa, el documento no se desplaza. `scrollbar-gutter`
   guarda el hueco de la barra para que la página no salte al soltarla. Con
   cuenta: el primero que bloquea guarda lo que había y el último lo devuelve. */
let bloqueosScroll = 0;
let scrollPrevio = { overflow: "", hueco: "" };
function useSinScroll(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    const raiz = document.documentElement;
    if (bloqueosScroll++ === 0) {
      scrollPrevio = { overflow: raiz.style.overflow, hueco: raiz.style.scrollbarGutter };
      raiz.style.overflow = "hidden";
      raiz.style.scrollbarGutter = "stable";
    }
    return () => {
      if (--bloqueosScroll > 0) return;
      raiz.style.overflow = scrollPrevio.overflow;
      raiz.style.scrollbarGutter = scrollPrevio.hueco;
    };
  }, [activo]);
}

/* Con #ancla, lo de siempre: la sección queda arriba (scroll-margin-top deja
   sitio a la nav), sin mover el foco. Se hace al empezar la apertura, debajo de
   la capa, para que el círculo ya descubra la sección. */
function irAlAncla() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  document.getElementById(id)?.scrollIntoView?.({ block: "start" });
}

/* ── Página ─────────────────────────────────────────────────────────────── */
export function Landing() {
  const navigate = useNavigate();
  const entrar = () => navigate("/app");
  const crearCuenta = () => navigate("/app/registro");
  const tramo = useTramo();
  // «El escáner» se pone encima en cada entrada a la portada; no se recuerda nada.
  const [cargando, setCargando] = useState(true);
  const alTerminarCarga = useCallback(() => setCargando(false), []);
  useSinScroll(cargando);
  return (
    <>
    {/* `landing-stitch` trae la maquetación (styles/landing.css). Sin data-theme:
        la portada sigue el tema de la aplicación (ThemeProvider lo pone en <html>);
        solo los escenarios de imagen radiológica fijan el oscuro. Bajo la capa de
        carga va `inert`: ni foco ni clics hasta que se abre. */}
    <div className="landing-stitch" data-tramo={tramo} inert={cargando} style={{ background: "var(--canvas)", minHeight: "100%" }}>
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
    {cargando && <CargaEscaner onAbrir={irAlAncla} onFin={alTerminarCarga} />}
    </>
  );
}
