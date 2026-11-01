/* «Cómo funciona»: un riel de pasos con su icono, unidos por una línea que se
   enciende al avanzar el scroll. Horizontal por encima de 1024 y vertical por
   debajo. Con movimiento reducido la línea aparece entera y sin animación. */

import { useRef, useState } from "react";
import { useTableta } from "../../hooks/useEstrecho";
import { STEPS } from "../../pipeline/steps";
import { Icon, type IconName } from "../Icon";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "../../motion";
import { pasosEncendidos } from "./riel";
import { RevelarItem, Seccion } from "./Seccion";

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

const ICONO_PASO: Record<string, IconName> = { upload: "UPLOAD", manufacture: "WORKSHOP" };

export function ComoFunciona() {
  const reducido = useReducedMotion() ?? false;
  const vertical = useTableta();
  const olRef = useRef<HTMLOListElement>(null);
  const [encendidos, setEncendidos] = useState(reducido ? STEPS.length : 0);
  const { scrollYProgress } = useScroll({ target: olRef, offset: ["start 75%", "end 55%"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!reducido) setEncendidos(pasosEncendidos(v, STEPS.length));
  });
  const total = reducido ? STEPS.length : encendidos;
  return (
    <Seccion
      id="como-funciona"
      rotulo="Cómo funciona"
      titulo={`Del estudio al plan, en ${spell(STEPS.length)} pasos y en el orden de la cirugía`}
    >
      <ol ref={olRef} className="riel" data-disposicion={vertical ? "vertical" : "horizontal"}>
        <div className="riel__pista" aria-hidden="true">
          <motion.div
            className="riel__relleno"
            style={reducido ? undefined : vertical ? { scaleY: scrollYProgress } : { scaleX: scrollYProgress }}
          />
        </div>
        {STEPS.map((s, i) => (
          <RevelarItem
            as="li"
            key={s.key}
            className="riel__paso"
            data-encendido={i < total ? "true" : "false"}
          >
            <span className="riel__nodo">
              <Icon name={ICONO_PASO[s.key] ?? s.icon} size={20} />
            </span>
            <span className="riel__num">{String(i + 1).padStart(2, "0")}</span>
            <span className="riel__nombre">{s.label}</span>
            <span className="riel__linea">{LINEA_PASO[s.key] ?? ""}</span>
          </RevelarItem>
        ))}
      </ol>
    </Seccion>
  );
}
