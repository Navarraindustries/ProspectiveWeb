/* HeroCortes — la portada: los cortes axiales reales de Case 3 (3DRA)
   atados al scroll, que al llegar al corte del aneurisma se funden en el render
   3D de su malla con la ventana de detección encima.

   La sección mide 300 vh y su escenario se queda pegado arriba (sticky, 100 vh):
   el progreso del scroll por la sección elige el corte. Hasta el 85 % recorre
   los 60 fotogramas, así que el último (el de la lesión) llega justo cuando
   empieza el fundido al 3D. El fotograma sale del progreso, no de deltas, y
   solo se pinta uno ya descargado: mientras llega el siguiente se queda el que
   había. Sin bucles propios: `useScroll` de motion da el progreso.

   Disposición quieta: 100 vh como mínimo, sin cortes ni scroll extra, con el
   fotograma final (render 3D, balizas y ventana) desde el principio y en flujo
   normal, así que nada se recorta. La toma con movimiento reducido, hasta
   1024 de ancho y en pantallas bajas (`CONSULTA_HERO_QUIETO`: en móvil y
   tableta va en una columna, texto arriba y ventana debajo) y con ahorro de
   datos (no se descargan los 60 cortes).

   La ventana de detección está siempre en el árbol de accesibilidad: con
   movimiento solo se apaga a la vista hasta el 85 %, y un lector de pantalla
   que no recorre el scroll la oye igual. */

import { useEffect, useRef, useState } from "react";
import { cifra } from "../../lib/numero";
import { useMediaQuery } from "../../hooks/useEstrecho";
import { useMotionValueEvent, useReducedMotion, useScroll } from "../../motion";
import { Button } from "../Button";
import {
  CONSULTA_HERO_QUIETO, GROSOR_LOSA_MM, MANIFIESTO, fotogramaPara, fotogramasListos, pideAhorroDatos, rutaFotograma,
  suscribirPrecargaHero, ultimoCargado,
} from "./heroFrames";
import { useIrASeccion } from "./desplazamiento";
import { BalizasDeteccion, VentanaDeteccion } from "./VentanaDeteccion";

const LEMA = "Planificación neurovascular con datos";
/* Progreso a partir del cual se ve el render 3D en vez de los cortes. */
const UMBRAL_3D = 0.85;

export function HeroCortes({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void }) {
  const reducido = useReducedMotion() ?? false;
  const irA = useIrASeccion();
  const pequena = useMediaQuery(CONSULTA_HERO_QUIETO);
  const datosReducidos = useMediaQuery("(prefers-reduced-data: reduce)");
  const [ahorro] = useState(pideAhorroDatos);
  const quieto = reducido || pequena || datosReducidos || ahorro;

  const seccion = useRef<HTMLElement>(null);
  const [objetivo, setObjetivo] = useState(0);
  const [final, setFinal] = useState(false);
  const [cargados, setCargados] = useState<ReadonlySet<number>>(() => new Set(fotogramasListos()));

  const { scrollYProgress } = useScroll({ target: seccion, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setObjetivo(fotogramaPara(p / UMBRAL_3D, MANIFIESTO.count));
    setFinal(p > UMBRAL_3D);
  });

  // Precarga en orden (el 0 primero) solo con el hero animado. Es la compartida
  // con la pantalla de carga: si ya la había arrancado ella, se engancha.
  useEffect(() => {
    if (quieto) return;
    return suscribirPrecargaHero((i) => {
      setCargados((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
    });
  }, [quieto]);

  const verFinal = quieto || final;
  const mostrado = ultimoCargado(objetivo, cargados) ?? objetivo;

  return (
    <section
      ref={seccion}
      aria-label="Portada"
      className={quieto ? "hero-cortes hero-cortes--quieto" : "hero-cortes"}
      /* Quieto: 100 vh como mínimo (`.hero-cortes--quieto`), sin altura de scroll extra. */
      style={quieto ? undefined : { height: "300vh" }}
    >
      {/* Escenario radiológico: negro del visor en los dos temas, con el oscuro acotado
          aquí para que velo, texto, botones y ventana de detección sigan claros sobre
          negro. En el tema claro, por encima de 1024, es una pantalla con radio (landing.css). */}
      <div className="hero-cortes__escenario" data-theme="dark" data-escenario="oscuro">
        {!quieto && (
          <img className="hero-cortes__corte" src={rutaFotograma(mostrado)} alt="" style={{ opacity: verFinal ? 0 : 1 }} />
        )}

        <div className="hero-cortes__render" style={{ opacity: verFinal ? 1 : 0 }}>
          <div className="hero-cortes__lienzo">
            <img src="/media/landing/hero-3d.webp" alt="Malla 3D del árbol vascular de Case 3 (3DRA) con la lesión del tronco basilar marcada en rojo" />
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
              <a className="hero-cortes__ancla" href="#como-funciona" onClick={(e) => irA(e, "como-funciona")}>Ver cómo funciona ↓</a>
            </div>
            <div className="hero-cortes__notas">
              <span>Sin instalar nada</span>
              <span aria-hidden="true">·</span>
              <span>Modelo 3D en el navegador</span>
              <span aria-hidden="true">·</span>
              <span>Medidas objetivas en milímetros</span>
            </div>
          </div>

          <div className="hero-cortes__ventana" style={{ opacity: verFinal ? 1 : 0 }}>
            <VentanaDeteccion />
          </div>
        </div>

        {!quieto && (
          <div className="hero-cortes__rotulo" style={{ opacity: verFinal ? 0 : 1 }}>
            W {MANIFIESTO.window.w} · L {MANIFIESTO.window.l} · MIP {cifra(GROSOR_LOSA_MM, 1)} mm · corte {MANIFIESTO.sliceOf[mostrado] ?? mostrado + 1}/{MANIFIESTO.total}
          </div>
        )}
      </div>
    </section>
  );
}
