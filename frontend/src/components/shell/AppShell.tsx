/* AppShell (shell C, F2): la única carcasa de las pantallas de gestión.

   Barra lateral de cristal a la izquierda, barra superior de 56 px con la miga
   y las acciones del contexto, y el contenido transparente sobre el `Ambiente`. Cada pantalla
   se envuelve a sí misma (`<AppShell crumbs actions>…</AppShell>`) para que la
   acción viva junto al estado que la habilita. El espacio de trabajo no la usa
   en F2: conserva su barra superior y su carril. */

import type { ReactNode } from "react";
import { Ambiente } from "../Ambiente";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import type { Crumb } from "./TopBar";
import { useShellState } from "./useShellState";
import "./shell.css";

export function AppShell({ crumbs, subtitle, status, actions, children }: {
  crumbs?: Crumb[];
  subtitle?: ReactNode;
  /** Hueco antes de las acciones (estado de guardado del pipeline, fase 3). */
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const state = useShellState();
  // Fija, la barra ocupa su columna (240 px) y el contenido se reparte el
  // resto; expandida solo por el ratón o Alt+B se superpone al contenido, para
  // que cruzarla no mueva la tabla que hay debajo. Por eso la rejilla mira
  // `pinned` y el ancho de la barra mira `expanded`.
  return (
    <Ambiente>
      <div className="shell" data-pinned={state.pinned ? "true" : "false"}>
        <SideNav state={state} />
        <div className="shell-body">
          <TopBar crumbs={crumbs} subtitle={subtitle} status={status} actions={actions} />
          <main className="shell-main">{children}</main>
        </div>
      </div>
    </Ambiente>
  );
}
