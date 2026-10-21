/* Las secciones de la barra lateral (shell C, F2).

   Una sola lista para la barra, la miga y cualquier atajo: antes el menú de
   usuario, la portada de pacientes y la barra superior nombraban las secciones
   cada uno por su cuenta y no coincidían («Solicitudes», «Cuentas pendientes»).
   El grupo «admin» solo se pinta con `role === "admin"`. */

import type { IconName } from "../Icon";
import type { Screen } from "../../store/nav";

export interface Section {
  key: Screen;
  label: string;
  icon: IconName;
  group: "clinica" | "admin";
}

export const SECTIONS: Section[] = [
  { key: "patients", label: "Pacientes", icon: "PATIENTS", group: "clinica" },
  { key: "studies", label: "Estudios", icon: "STUDIES", group: "clinica" },
  { key: "orders", label: "Pedidos de clips", icon: "ORDER", group: "clinica" },
  { key: "workshops", label: "Talleres", icon: "WORKSHOP", group: "clinica" },
  { key: "users", label: "Usuarios", icon: "USERS", group: "admin" },
  { key: "pending", label: "Cuentas pendientes", icon: "PENDING", group: "admin" },
  { key: "audit", label: "Auditoría", icon: "AUDIT", group: "admin" },
];

/** Rótulo del grupo de administración; la miga nunca lo lleva (no es destino). */
export const ADMIN_GROUP_LABEL = "Administración";
