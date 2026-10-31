/* Tarjeta de paciente del panel (spec §4.2): captura o vista previa, paso donde
   quedó la sesión, riesgo, quién lo comparte y un botón con la acción que toca. */

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { api } from "../../api/client";
import type { PatientSummary } from "../../api/types";
import { fechaHora } from "../../lib/fecha";
import { accionPrincipal, pasoDeTarjeta, tiempoRelativo } from "../../lib/pacientes";
import { STEPS, clampStep } from "../../pipeline/steps";
import { Badge, riskVariant } from "../Badge";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { ageFromDob } from "../patientAge";
import { useVisible } from "./useVisible";
import "./patients.css";

interface Props {
  patient: PatientSummary;
  onOpen: (p: PatientSummary) => void;
  onResume: (sessionId: string, p: PatientSummary) => void;
  onPlan: (p: PatientSummary) => void;
}

type Fuente = "captura" | "vista" | "ninguna";

/** Imagen de la tarjeta. Va por blob porque la API exige el JWT. Si una fuente
 *  falla (captura borrada, estudio sin miniatura) se pasa a la siguiente en
 *  silencio: una tarjeta con un aviso de error por imagen asusta más de lo que
 *  informa, y el icono del paso ya cubre el hueco. */
function useImagen(p: PatientSummary, activo: boolean): string | null {
  // La URL y las fuentes fallidas llevan la clave de los ids con que se pidieron:
  // tras guardar, borrar o crear un caso `load()` trae otros ids con la tarjeta
  // ya montada, y sin la clave se enseñaría el blob revocado de la captura
  // anterior y una fuente que falló antes seguiría descartada.
  const clave = `${p.last_capture_id ?? ""}|${p.last_imaging_study_id ?? ""}`;
  const [cargada, setCargada] = useState<{ clave: string; url: string } | null>(null);
  const [fallo, setFallo] = useState<{ clave: string; fuentes: Fuente[] }>({ clave, fuentes: [] });
  const fallidas = fallo.clave === clave ? fallo.fuentes : [];

  const fuente: Fuente =
    p.last_capture_id !== null && !fallidas.includes("captura") ? "captura"
    : p.last_imaging_study_id !== null && !fallidas.includes("vista") ? "vista"
    : "ninguna";

  useEffect(() => {
    if (!activo || fuente === "ninguna") return;
    let vivo = true;
    let creada: string | null = null;
    const pedir = fuente === "captura"
      ? api.captureObjectUrl(p.last_capture_id as number)
      : api.studyThumbnailObjectUrl(p.last_imaging_study_id as number);
    pedir
      .then((u) => { if (vivo) { creada = u; setCargada({ clave, url: u }); } else URL.revokeObjectURL(u); })
      .catch(() => {
        if (vivo) setFallo((f) => ({ clave, fuentes: [...(f.clave === clave ? f.fuentes : []), fuente] }));
      });
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [activo, fuente, clave, p.last_capture_id, p.last_imaging_study_id]);

  return fuente === "ninguna" || cargada?.clave !== clave ? null : cargada.url;
}

export function PatientCard({ patient: p, onOpen, onResume, onPlan }: Props) {
  const raiz = useRef<HTMLElement>(null);
  const visible = useVisible(raiz);
  const imagen = useImagen(p, visible);

  const paso = pasoDeTarjeta(p.last_session_step);
  const accion = accionPrincipal(p);
  const edad = ageFromDob(p.dob);
  // El número del dueño ya trae su prefijo («HC234523»): se muestra tal cual.
  const hc = p.hospital_id || "—";
  const fraccion = paso ? paso.n / STEPS.length : 0;
  const icono = STEPS[clampStep(p.last_session_step ?? 0)].icon;
  const ultimo = paso?.n === STEPS.length;

  const pie = p.last_session_at
    ? { texto: `Última sesión ${tiempoRelativo(p.last_session_at)}`, fecha: p.last_session_at }
    : { texto: `Alta ${tiempoRelativo(p.created_at)}`, fecha: p.created_at };

  // Intro/Espacio solo cuando el foco está en la tarjeta: sobre el botón la
  // tecla pertenece al botón y abrir la ficha además lo desharía.
  const alTeclear = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(p);
    }
  };

  const alActuar = (e: MouseEvent) => {
    e.stopPropagation();
    if (accion === "planificar") onPlan(p);
    else onResume(p.last_session_id as string, p);
  };

  const textoBoton = accion === "reanudar" ? "Reanudar" : accion === "abrir-informe" ? "Abrir informe" : "Planificar";
  const iconoBoton = accion === "reanudar" ? "RESUME" : accion === "abrir-informe" ? "OPEN" : "STEP_PLAN";

  return (
    <article
      ref={raiz}
      role="article"
      tabIndex={0}
      aria-label={`${p.full_name}, ${hc}`}
      className="pt-card"
      onClick={() => onOpen(p)}
      onKeyDown={alTeclear}
    >
      {/* Sin captura o sin sesión el bloque va atenuado (spec §4.2): el icono es un hueco, no un dato. */}
      <div className={`pt-card-media${imagen && paso ? "" : " pt-card-media--tenue"}`}>
        {imagen ? <img src={imagen} alt="" /> : <Icon name={icono} size={32} />}
        <span className="pt-card-pill">{paso ? `Paso ${paso.n} · ${paso.label}` : "Sin sesión"}</span>
      </div>

      <div className="pt-card-body">
        <h3 className="pt-card-name">{p.full_name}</h3>
        <p className="pt-card-meta">
          {hc}{p.sex ? ` · ${p.sex}` : ""}{edad ? ` · ${edad} años` : ""}
        </p>

        <div className="pt-card-badges">
          {p.last_risk_label && <Badge variant={riskVariant(p.last_risk_label)}>{`Riesgo ${p.last_risk_label.toLowerCase()}`}</Badge>}
          {p.is_shared_with_me && <Badge variant="muted">Compartido contigo</Badge>}
          {p.shared_with_count > 0 && <Badge variant="muted">{`Compartido con ${p.shared_with_count}`}</Badge>}
        </div>

        <div
          className={`pt-card-bar${ultimo ? " pt-card-bar-done" : ""}`}
          role="progressbar"
          aria-label="Avance del flujo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(fraccion * 100)}
        >
          <span style={{ width: `${fraccion * 100}%` }} />
        </div>
      </div>

      <div className="pt-card-foot">
        <span title={fechaHora(pie.fecha)}>{pie.texto}</span>
        <Button size="sm" variant={accion === "planificar" ? "outline" : "default"} leadingIcon={<Icon name={iconoBoton} size={14} />} onClick={alActuar}>
          {textoBoton}
        </Button>
      </div>
    </article>
  );
}
