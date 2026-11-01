/* Landing — portada pública de PROSPECTIVE (cristal D).
   Un solo scroll: hero de cortes → qué es → cómo funciona → funcionalidades →
   casos reales → índices → dispositivos NAVARRO™ → próximamente → contacto.
   «Entrar» lleva a la aplicación (/app).

   Solo tokens, sin colores escritos a mano; la maquetación vive en
   `styles/landing.css` bajo `.landing-stitch`. Sigue el tema de la aplicación
   (conmutador en la nav); el escenario del hero y la franja de casos se quedan
   en el negro del visor con `data-theme="dark"` acotado a ellos. */

import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
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
    /* `landing-stitch` trae la maquetación (styles/landing.css). Sin data-theme:
       la portada sigue el tema de la aplicación (ThemeProvider lo pone en <html>);
       solo los escenarios de imagen radiológica fijan el oscuro. */
    <div className="landing-stitch" data-tramo={tramo} style={{ background: "var(--canvas)", minHeight: "100%" }}>
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
