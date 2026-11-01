/* Lectura W/L de un corte: un botón que se ve como las demás lecturas del HUD.

   Con ratón: arrastrar en la imagen cambia la ventana, el doble clic en la
   lectura la restablece y, en la celda no compacta, el desplegable de debajo
   pone un preajuste. En táctil (≤ 1024) no hay doble clic fiable ni sitio para
   el desplegable en las celdas compactas: un toque abre un menú corto con
   «Restablecer» y los preajustes, de 44 px cada entrada (R16). La lectura
   sigue a 10,5 px; la diana de 44 la pone un ::before (hud.css).

   Va a 48 px del borde derecho (`beside-ladder`): a 14 la escalera de cortes
   le pisaba 30 × 13 px (R15). */

import { useEffect, useRef, useState } from "react";
import { WL_TITLE, type WindowPreset } from "../windowPresets";

/** Title de la lectura en táctil: el gesto es otro. */
export const WL_TITLE_TACTIL = "Ventana y nivel · arrastrar en la imagen los cambia · toca para restablecer o elegir un preajuste";

export function HudWl({ texto, tactil, compact, presets, onPreset, onReset }: {
  texto: string;
  tactil: boolean;
  compact?: boolean;
  presets?: WindowPreset[];
  onPreset?: (preset: WindowPreset) => void;
  onReset?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const opciones = (presets ?? []).filter((x) => !x.reset);

  // Fuera de táctil no hay menú (cruzar 1024 px con él abierto lo cierra).
  const visible = abierto && tactil;

  useEffect(() => {
    if (!visible) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [visible]);

  const cerrar = () => { setAbierto(false); boton.current?.focus({ preventScroll: true }); };
  const elegir = (fn: () => void) => { fn(); cerrar(); };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); items[(i - 1 + items.length) % items.length]?.focus(); }
  };

  const parar = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button ref={boton} type="button" className="hud-readout br beside-ladder hud-wl"
        title={tactil ? WL_TITLE_TACTIL : WL_TITLE}
        data-tactil={tactil ? "true" : undefined}
        aria-haspopup={tactil ? "menu" : undefined}
        aria-expanded={tactil ? visible : undefined}
        onMouseDown={parar}
        onClick={tactil ? () => setAbierto((v) => !v) : undefined}
        onDoubleClick={(e) => { e.stopPropagation(); onReset?.(); }}>
        {texto}
      </button>
      {visible && (
        <div ref={menu} role="menu" aria-label="Ventana y nivel" className="hud-wl-menu"
          onMouseDown={parar} onDoubleClick={parar} onKeyDown={onMenuKey}>
          <button type="button" role="menuitem" onClick={() => elegir(() => onReset?.())}>Restablecer</button>
          {opciones.map((x) => (
            <button key={x.name} type="button" role="menuitem" onClick={() => elegir(() => onPreset?.(x))}>
              {`${x.name} · ${Math.round(x.wc)}/${Math.round(x.ww)}`}
            </button>
          ))}
        </div>
      )}
      {/* Preajustes en toda celda no compacta, bajo su lectura: antes solo
          en la principal, y una lateral no tenía cómo cambiar la ventana
          salvo arrastrando. El select es transparente para no tapar la
          imagen; las opciones llevan fondo propio porque lo heredan. En
          táctil lo sustituye el menú de la lectura. */}
      {!compact && !tactil && !!presets?.length && (
        <select className="hud-toggle hud-wl-presets" title="Preajuste de ventana/nivel" value=""
          onChange={(e) => {
            const preset = presets.find((x) => x.name === e.target.value);
            if (preset) onPreset?.(preset);
          }}
          onMouseDown={parar}
          onDoubleClick={parar}>
          <option value="" disabled style={{ background: "var(--viewer-bg)" }}>Preajuste</option>
          {presets.map((x) => (
            <option key={x.name} value={x.name} style={{ background: "var(--viewer-bg)", color: "var(--hud-text)" }}>
              {x.reset ? x.name : `${x.name} · ${Math.round(x.wc)}/${Math.round(x.ww)}`}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
