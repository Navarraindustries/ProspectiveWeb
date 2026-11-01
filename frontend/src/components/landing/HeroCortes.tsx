/* HeroCortes — la portada: los cortes axiales reales del caso Zenodo 036
   atados al scroll, que al llegar al corte del aneurisma se funden en el render
   3D de su malla con la ventana de detección encima.

   La sección mide 300 vh y su escenario se queda pegado arriba (sticky, 100 vh):
   el progreso del scroll por la sección elige el corte. Hasta el 85 % recorre
   los 60 fotogramas, así que el último (el de la lesión) llega justo cuando
   empieza el fundido al 3D. El fotograma sale del progreso, no de deltas, y
   solo se pinta uno ya descargado: mientras llega el siguiente se queda el que
   había. Sin bucles propios: `useScroll` de motion da el progreso.

   Con movimiento reducido no hay cortes ni scroll extra: 100 vh con el
   fotograma final (render 3D, balizas y ventana) desde el principio. */

import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "../../motion";
import { Button } from "../Button";
import { MANIFIESTO, fotogramaPara, rutaFotograma, ultimoCargado } from "./heroFrames";
import { BalizasDeteccion, VentanaDeteccion } from "./VentanaDeteccion";

const LEMA = "Planificación neurovascular con datos";
/* Progreso a partir del cual se ve el render 3D en vez de los cortes. */
const UMBRAL_3D = 0.85;

export function HeroCortes({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void }) {
  const reducido = useReducedMotion() ?? false;
  const seccion = useRef<HTMLElement>(null);
  const [objetivo, setObjetivo] = useState(0);
  const [final, setFinal] = useState(false);
  const [cargados, setCargados] = useState<ReadonlySet<number>>(() => new Set());

  const { scrollYProgress } = useScroll({ target: seccion, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setObjetivo(fotogramaPara(p / UMBRAL_3D, MANIFIESTO.count));
    setFinal(p > UMBRAL_3D);
  });

  // Precarga de los 60 cortes al montar; cada uno cuenta cuando ya se puede pintar.
  useEffect(() => {
    if (reducido) return;
    let vivo = true;
    const imagenes = Array.from({ length: MANIFIESTO.count }, (_, i) => {
      const img = new Image();
      const listo = () => {
        if (vivo) setCargados((prev) => new Set(prev).add(i));
      };
      img.onload = () => {
        if (typeof img.decode === "function") img.decode().then(listo, listo);
        else listo();
      };
      img.src = rutaFotograma(i);
      return img;
    });
    return () => {
      vivo = false;
      for (const img of imagenes) img.onload = null;
    };
  }, [reducido]);

  const verFinal = reducido || final;
  const mostrado = ultimoCargado(objetivo, cargados) ?? objetivo;

  return (
    <section
      ref={seccion}
      aria-label="Portada"
      className={reducido ? "hero-cortes hero-cortes--quieto" : "hero-cortes"}
      /* Quieto: 100 vh como mínimo (`.hero-cortes--quieto`), sin altura de scroll extra. */
      style={reducido ? undefined : { height: "300vh" }}
    >
      <div className="hero-cortes__escenario">
        {!reducido && (
          <img className="hero-cortes__corte" src={rutaFotograma(mostrado)} alt="" style={{ opacity: verFinal ? 0 : 1 }} />
        )}

        <div className="hero-cortes__render" style={{ opacity: verFinal ? 1 : 0 }} aria-hidden={!verFinal}>
          <div className="hero-cortes__lienzo">
            <img src="/media/landing/hero-3d.webp" alt="Malla 3D del árbol vascular con la lesión marcada en rojo" />
          </div>
        </div>

        <div className="hero-cortes__velo" />

        {/* Las balizas van en una caja gemela por encima del velo, que si no las apaga. */}
        <div className="hero-cortes__render" style={{ opacity: verFinal ? 1 : 0 }} aria-hidden="true">
          <div className="hero-cortes__lienzo">
            <BalizasDeteccion />
          </div>
        </div>

        <div className="hero-cortes__contenido">
          <div className="hero-cortes__texto">
            <div className="hero-cortes__antetitulo">Cirugía de aneurismas cerebrales</div>
            <h1 className="hero-cortes__titulo">{LEMA}</h1>
            <p className="hero-cortes__subtitulo">
              Carga el DICOM, segmenta la vasculatura en 3D, detecta candidatos, mide, decide la vía y
              prueba el dispositivo. Todo en un solo espacio de trabajo.
            </p>
            <div className="hero-cortes__acciones">
              <Button size="lg" onClick={onEntrar}>Entrar</Button>
              <Button size="lg" variant="secondary" onClick={onCrearCuenta}>Crear cuenta</Button>
              <a className="hero-cortes__ancla" href="#como-funciona">Ver cómo funciona ↓</a>
            </div>
            <div className="hero-cortes__notas">
              <span>Sin instalar nada</span>
              <span aria-hidden="true">·</span>
              <span>Modelo 3D en el navegador</span>
              <span aria-hidden="true">·</span>
              <span>Medidas objetivas en milímetros</span>
            </div>
          </div>

          <div className="hero-cortes__ventana" style={{ opacity: verFinal ? 1 : 0 }} aria-hidden={!verFinal}>
            <VentanaDeteccion />
          </div>
        </div>

        {!reducido && (
          <div className="hero-cortes__rotulo" style={{ opacity: verFinal ? 0 : 1 }}>
            W {MANIFIESTO.window.w} · L {MANIFIESTO.window.l} · corte {MANIFIESTO.sliceOf[mostrado] ?? mostrado + 1}/{MANIFIESTO.total}
          </div>
        )}
      </div>
    </section>
  );
}
