/* Las acciones de «Primeros pasos»: las usan la pantalla «Listo» y la tarjeta
   de Pacientes, para que hagan exactamente lo mismo. */

import { useNavigate } from "react-router-dom";
import { getCommands } from "../lib/commands";
import { SCREEN_PATH } from "../store/nav";
import type { PRIMEROS_PASOS } from "./copy";

export type AccionPrimerosPasos = (typeof PRIMEROS_PASOS)[number]["accion"];

export function usePrimerosPasos(): (accion: AccionPrimerosPasos) => void {
  const navigate = useNavigate();
  return (accion) => {
    const pacientes = SCREEN_PATH.patients;
    if (accion === "nuevo-paciente") navigate(`${pacientes}?nuevo=paciente`);
    else if (accion === "nuevo-caso") navigate(`${pacientes}?nuevo=caso`);
    else if (accion === "prueba-rapida") {
      const cmd = getCommands().find((c) => c.id === "prueba-rapida" && !c.disabled);
      if (cmd) cmd.run(); else navigate(pacientes);
    } else navigate(pacientes);
  };
}
