/* AppShell (shell C, F2): la única carcasa de las pantallas de gestión.

   Barra lateral de iconos a la izquierda, barra superior de 48 px con la miga
   y las acciones del contexto, y el contenido sobre `--canvas`. Cada pantalla
   se envuelve a sí misma (`<AppShell crumbs actions>…</AppShell>`) para que la
   acción viva junto al estado que la habilita. El espacio de trabajo no la usa
   en F2: conserva su Topbar y su carril. */

import type { ReactNode } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import type { Crumb } from "./TopBar";
import { useShellState } from "./useShellState";
import "./shell.css";

export function AppShell({ crumbs, actions, children }: {
  crumbs?: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const state = useShellState();
  // Fija, la barra ocupa su columna (220 px) y el contenido se reparte el
  // resto; expandida solo por el ratón o Alt+B se superpone al contenido, para
  // que cruzarla no mueva la tabla que hay debajo. Por eso la rejilla mira
  // `pinned` y el ancho de la barra mira `expanded`.
  return (
    <div className="shell" data-pinned={state.pinned ? "true" : "false"}>
      <SideNav state={state} />
      <div className="shell-body">
        <TopBar crumbs={crumbs} actions={actions} />
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
