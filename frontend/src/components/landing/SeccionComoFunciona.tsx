/* «Cómo funciona»: los pasos con su icono se encienden al avanzar el scroll. Por
   encima de 1024 van en un dial, con el paso actual en el centro; por debajo, en un
   riel vertical. Con movimiento reducido aparece todo encendido y sin animación.

   UNI-132: en escritorio el dial se queda fijo bajo la nav mientras el scroll lo
   avanza, y se suelta en el último paso (ver fijado.ts). En tableta y móvil el
   riel vertical sigue como antes; con movimiento reducido no se fija nada. */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTableta } from "../../hooks/useEstrecho";
import { STEPS } from "../../pipeline/steps";
import { Icon, type IconName } from "../Icon";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "../../motion";
import { pasosEncendidos } from "./riel";
import { ALTO_FIJO, OFFSET_FIJADO, altoRecorrido, escalaDial } from "./fijado";
import { DESFASE_NAV } from "./desplazamiento";
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

const ICONO_PASO: Record<string, IconName> = { manufacture: "WORKSHOP" };

/** Escala del dial según el alto de la pantalla (cabe en el tramo fijo). */
function useEscalaDial(activo: boolean): number {
  const [escala, setEscala] = useState(() => (activo ? escalaDial(window.innerHeight) : 1));
  useEffect(() => {
    if (!activo) return;
    const medir = () => setEscala(escalaDial(window.innerHeight));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [activo]);
  return activo ? escala : 1;
}

export function ComoFunciona() {
  const reducido = useReducedMotion() ?? false;
  const vertical = useTableta();
  const disposicion = vertical ? "vertical" : "horizontal";
  const olRef = useRef<HTMLOListElement>(null);
  const recorridoRef = useRef<HTMLDivElement>(null);
  // El dial se fija en escritorio; el riel vertical y el movimiento reducido, no.
  const fijado = !vertical && !reducido;
  const escala = useEscalaDial(fijado);
  const [encendidos, setEncendidos] = useState(reducido ? STEPS.length : 0);
  // Fijado: el progreso va de 0 a 1 justo en el tramo en que el dial está fijo.
  // Sin fijar (riel vertical): sobre la lista, como siempre.
  const { scrollYProgress } = useScroll(fijado
    ? { target: recorridoRef, offset: [...OFFSET_FIJADO] }
    : { target: olRef, offset: ["start 75%", "end 55%"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!reducido) setEncendidos(pasosEncendidos(v, STEPS.length));
  });
  const total = reducido ? STEPS.length : encendidos;
  const actual = STEPS[Math.max(total - 1, 0)];
  return (
    <Seccion
      id="como-funciona"
      rotulo="Cómo funciona"
      titulo={`Del estudio al plan, en ${spell(STEPS.length)} pasos y en el orden de la cirugía`}
    >
      <Fijador activo={fijado} refRecorrido={recorridoRef}>
      {/* La pista va en el marco, junto al <ol> y no dentro: una lista solo tiene <li>. */}
      <div className="riel__marco" data-disposicion={disposicion}
           style={vertical ? undefined : ({ "--avance": Math.max(total - 1, 0) / STEPS.length, ...(escala < 1 ? { zoom: escala } : {}) } as CSSProperties)}>
        <div className="riel__pista" aria-hidden="true">
          <motion.div
            className="riel__relleno"
            style={reducido ? undefined : vertical ? { scaleY: scrollYProgress } : { scaleX: scrollYProgress }}
          />
        </div>
        <ol ref={olRef} className="riel" data-disposicion={disposicion}>
          {STEPS.map((s, i) => (
            <RevelarItem
              as="li"
              key={s.key}
              className="riel__paso"
              style={{ "--i": i } as CSSProperties}
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
        {/* Repite el paso encendido: la lista ya lo dice, así que no se lee dos veces. */}
        {!vertical && (
          <div className="riel__centro" aria-hidden="true">
            <span className="riel__centro-rotulo">PASO</span>
            <span className="riel__centro-num">{Math.max(total, 1)}</span>
            <span className="riel__centro-nombre">{actual.label}</span>
            <span className="riel__centro-linea">{LINEA_PASO[actual.key] ?? ""}</span>
          </div>
        )}
      </div>
      </Fijador>
    </Seccion>
  );
}

/** El contenedor alto y el tramo fijo del dial; sin fijar, el dial tal cual. */
function Fijador({ activo, refRecorrido, children }: {
  activo: boolean;
  refRecorrido: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  if (!activo) return <>{children}</>;
  return (
    <div ref={refRecorrido} className="riel__recorrido" style={{ position: "relative", height: altoRecorrido(STEPS.length) }}>
      <div
        className="riel__fijo"
        style={{
          position: "sticky",
          top: DESFASE_NAV,
          height: ALTO_FIJO,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
