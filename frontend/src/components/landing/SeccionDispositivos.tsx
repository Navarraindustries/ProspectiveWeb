/* «Dispositivos NAVARRO™»: las cuatro series de clip, con el render de cada una
   en una ficha de cristal. Los datos son los que ya dice la landing. */

import { glass } from "../../styles/glass";
import { lensCard, motion, useReducedMotion } from "../../motion";
import { RevelarItem, Seccion } from "./Seccion";

const SERIES: { nombre: string; detalle?: string; src: string; alt: string }[] = [
  { nombre: "T1 recto", src: "/media/landing/clips/navarro-t1-recto.webp", alt: "Clip NAVARRO™ T1 recto" },
  { nombre: "T2 curvo", src: "/media/landing/clips/navarro-t2-curvo.webp", alt: "Clip NAVARRO™ T2 curvo" },
  { nombre: "T3 angulado", detalle: "15–90°", src: "/media/landing/clips/navarro-t3-angulado-45.webp", alt: "Clip NAVARRO™ T3 angulado" },
  { nombre: "T4 fenestrado", detalle: "ventana 3 · 5 · 7 mm", src: "/media/landing/clips/navarro-t4-fenestrado.webp", alt: "Clip NAVARRO™ T4 fenestrado" },
];

export function Dispositivos() {
  const reducido = useReducedMotion() ?? false;
  return (
    <Seccion id="dispositivos" rotulo="Dispositivos NAVARRO™" titulo="Cuatro series, fabricadas bajo pedido">
      <p className="sec__texto sec__texto--ancho">
        Se fabrican en taller a partir del pedido. Prospective elige la serie y ajusta la mordaza al
        cuello medido.
      </p>
      <ul className="series">
        {SERIES.map((s) => (
          <RevelarItem key={s.nombre} as="li" className="series__item">
            <motion.div
              className="series__ficha"
              data-glass
              style={{ ...glass("normal"), borderRadius: "var(--radius-card-lg)" }}
              whileHover={reducido ? undefined : lensCard.whileHover}
              transition={lensCard.transition}
            >
              <img src={s.src} width={600} height={600} loading="lazy" decoding="async" alt={s.alt} />
              <div className="series__nombre">{s.nombre}</div>
              {s.detalle && <div className="series__detalle">{s.detalle}</div>}
            </motion.div>
          </RevelarItem>
        ))}
      </ul>
    </Seccion>
  );
}
