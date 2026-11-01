/* AppShell de pega para los tests de página: pinta el subtítulo, el estado, el
   control `extra` y las `acciones` con texto (el tramo ancho), sin la barra real. */
import type { ReactNode } from "react";
import { Button } from "../components/Button";
import type { AccionBarra } from "../components/shell/TopBar";

export function ShellMock(p: { subtitle?: ReactNode; status?: ReactNode; extra?: ReactNode; acciones?: AccionBarra[]; children?: ReactNode }) {
  return (
    <>
      <header>
        {p.subtitle}
        {p.status}
        {p.extra}
        {(p.acciones ?? []).map((a) =>
          a.href ? (
            <a key={a.id} href={a.href} target="_blank" rel="noreferrer" title={a.title}>{a.label}</a>
          ) : (
            <Button key={a.id} variant={a.principal ? "default" : "outline"} title={a.title} disabled={a.disabled} onClick={a.onClick}>{a.label}</Button>
          ),
        )}
      </header>
      {p.children}
    </>
  );
}
