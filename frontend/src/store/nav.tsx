/* Navigation context — lets any component (e.g. the Topbar) change the active
   screen without prop-drilling.

   Every screen has a URL under /app. Before this the active screen lived in a
   `useState`, so the browser's Back button walked out of the application
   entirely, a refresh always landed on the patient list, and there was no link
   to send a colleague. The Router keeps `screen` and the location in sync. */

import { createContext, useContext } from "react";

export type Screen = "login" | "signup" | "patients" | "studies" | "workspace" | "orders" | "workshops" | "pending" | "audit" | "users";

/** Screen → path segment under /app. Spanish, because the UI is. */
export const SCREEN_PATH: Record<Screen, string> = {
  login: "/app/entrar",
  signup: "/app/registro",
  patients: "/app/pacientes",
  studies: "/app/estudios",
  orders: "/app/pedidos",
  workshops: "/app/talleres",
  workspace: "/app/sesion",
  pending: "/app/cuentas-pendientes",
  users: "/app/usuarios",
  audit: "/app/auditoria",
};

/* Rutas antiguas que siguen en marcadores y enlaces enviados. Se reconocen
   aquí; el Router, al ver que el camino no es el de la pantalla, lo corrige con
   `replace` (F2: «Solicitudes» pasó a llamarse «Cuentas pendientes»). */
const LEGACY_PATH: Record<string, Screen> = {
  "/app/solicitudes": "pending",
};

const PATH_SCREEN: Record<string, Screen> = {
  ...LEGACY_PATH,
  ...(Object.fromEntries(
    Object.entries(SCREEN_PATH).map(([s, p]) => [p, s as Screen]),
  ) as Record<string, Screen>),
};

/** Which screen a pathname names; `patients` is the landing screen of /app. */
export function screenFromPath(pathname: string): Screen {
  const clean = pathname.replace(/\/+$/, "") || "/app";
  return PATH_SCREEN[clean] ?? "patients";
}

interface Nav {
  screen: Screen;
  go: (s: Screen) => void;
}

const NavContext = createContext<Nav>({ screen: "login", go: () => {} });

export const NavProvider = NavContext.Provider;

export function useNav(): Nav {
  return useContext(NavContext);
}
