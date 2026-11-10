/* Tarjeta de paciente de mentira para el recorrido (spec §4.2, parada 6): solo
   se pinta mientras dura el recorrido y la lista está vacía. Copia la forma de
   PatientCard sin su lógica: no pide imágenes, no abre nada y no escribe en la
   base de datos. Lleva el rótulo «Ejemplo» para que nadie la tome por real. */

import { Badge } from "../components/Badge";
import { Icon } from "../components/Icon";
import { STEPS } from "../pipeline/steps";
import "../components/patients/patients.css";
import "./onboarding.css";

const PASO = 4; // Morfometría: a media planificación, con «Reanudar» en el botón.

export function TarjetaEjemplo() {
  const paso = STEPS[PASO - 1];
  return (
    <article
      data-tour="tarjeta-ejemplo"
      className="pt-card ob-ejemplo"
      data-glass
      aria-label="Paciente de ejemplo (solo durante el recorrido)"
    >
      <span className="ob-ejemplo__rotulo"><Badge variant="brand">Ejemplo</Badge></span>
      <div className="pt-card-media pt-card-media--tenue">
        <Icon name={paso.icon} size={32} />
        <span className="pt-card-pill" data-glass>{`Paso ${PASO} · ${paso.label}`}</span>
      </div>
      <div className="pt-card-body">
        <h3 className="pt-card-name">Paciente de ejemplo</h3>
        <p className="pt-card-meta">HC000000 · F · 58 años</p>
        <div className="pt-card-badges"><Badge variant="warning">Riesgo moderado</Badge></div>
        <div className="pt-card-bar" aria-hidden="true">
          <span style={{ width: `${(PASO / STEPS.length) * 100}%` }} />
        </div>
      </div>
      <div className="pt-card-foot">
        <span>Última sesión hace 2 días</span>
        <span className="ob-ejemplo__accion" aria-hidden="true">
          <Icon name="RESUME" size={14} />Reanudar
        </span>
      </div>
    </article>
  );
}
