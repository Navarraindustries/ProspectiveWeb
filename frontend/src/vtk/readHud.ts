/* Lo que el HUD de un panel está diciendo AHORA MISMO, leído del DOM.

   La captura tiene que llevar el índice de corte, la ventana/nivel, el rumbo
   y los avisos. Todo eso ya está calculado y escrito en pantalla por quien
   sabe: cada panel decide sus propias lecturas. Volver a derivarlas aquí
   sería una segunda fuente que se separa de la primera en cuanto alguien
   añada una línea — y la imagen diría algo distinto de lo que se veía.

   Así que se leen. Es una dependencia del marcado (`hud.css`: `.hud-label`,
   `.hud-readout` y su esquina en la clase), y por eso está aislada aquí y
   con pruebas: si el HUD cambia de clases, rompe esto y no la captura entera.

   Los saltos de línea salen de que `.hud-readout` es `white-space: pre` y
   `HudReadout` separa sus líneas con "\n". */

import type { Corner } from "./composeCapture";

export interface PaneHud {
  label?: string;
  readouts: { at: Corner; lines: string[] }[];
}

const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

/** El rótulo y las lecturas de un panel, tal y como se están viendo. */
export function readPaneHud(el: Element | null | undefined): PaneHud {
  if (!el) return { readouts: [] };
  const label = el.querySelector(".hud-label")?.textContent?.trim() || undefined;
  const readouts: { at: Corner; lines: string[] }[] = [];
  for (const nodo of Array.from(el.querySelectorAll(".hud-readout"))) {
    const at = CORNERS.find((c) => nodo.classList.contains(c));
    if (!at) continue;
    const lines = (nodo.textContent ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length) readouts.push({ at, lines });
  }
  return { label, readouts };
}

/** La lectura de rumbo del visor («AZ 12° · EL -20°»), si está en pantalla.
 *
 *  Con la orientación asumida el visor la escribe entre corchetes; se copia
 *  tal cual, porque una orientación inventada no puede parecer medida dentro
 *  de una imagen que alguien va a enseñar. */
export function readHeading(root: Element | null | undefined): string | undefined {
  const t = root?.querySelector('[data-testid="heading-readout"]')?.textContent?.trim();
  return t || undefined;
}
