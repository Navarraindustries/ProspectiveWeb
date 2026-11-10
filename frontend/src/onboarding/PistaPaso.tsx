/* Pista de primera vez de un paso del quirófano: una burbuja pequeña de cristal
   junto a la cabecera «PASO N · …» del panel. NO es modal: no atrapa el foco ni
   toca flechas, Intro o números (los usan el visor y el dock); solo Esc la
   cierra, y cuenta como «Entendido». No roba el foco al aparecer.

   Se muestra si las pistas están activas, el paso no está visto, no hay un
   marcado en curso, no hay ninguna hoja abierta y el onboarding no está activo.
   Las hojas avisan al abrirse y cerrarse (`suscribirHojas`), así que la pista
   se oculta y vuelve sin esperar a otro render. Al cambiar de paso con la
   pista abierta, la anterior queda como vista. */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button } from "../components/Button";
import { isSheetOpen, suscribirHojas } from "../components/Sheet";
import { useEstrecho } from "../hooks/useEstrecho";
import { usePlanning } from "../store/planning";
import { glass } from "../styles/glass";
import { PISTAS_PASO, PISTAS_UI } from "./copy";
import { useOnboarding } from "./OnboardingProvider";
import { ContenidoExplicacion } from "./tour/ContenidoExplicacion";
import "./tour/tour.css";

const ANCHO = 320, HUECO = 12;

/** El marcado en curso; fuera del proveedor de planificación (pantallas sueltas, tests) no hay ninguno. */
function usePickMode() {
  try { return usePlanning().pickMode ?? null; } catch { return null; }
}

export function PistaPaso({ paso }: { paso: number }) {
  const { estado, activo, marcarPista, setPistasActivas } = useOnboarding();
  const pickMode = usePickMode();
  const hojaAbierta = useSyncExternalStore(suscribirHojas, isSheetOpen, () => false);
  const estrecho = useEstrecho();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const explicacion = PISTAS_PASO[paso as keyof typeof PISTAS_PASO];
  const vistas = estado.pistas_vistas ?? [];
  const visible = !!explicacion && estado.pistas_activas && !vistas.includes(paso)
    && pickMode === null && !hojaAbierta && !activo;

  // Cambiar de paso con la pista abierta la da por vista.
  const previo = useRef({ paso, visible });
  useEffect(() => {
    if (previo.current.paso !== paso && previo.current.visible) void marcarPista(previo.current.paso);
    previo.current = { paso, visible };
  });

  useEffect(() => {
    if (!visible) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      void marcarPista(paso);
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [visible, paso, marcarPista]);

  // Ancla: la cabecera del paso; se mide al mostrar y al cambiar el tamaño.
  useLayoutEffect(() => {
    if (!visible) return;
    const medir = () => setRect(document.querySelector('[data-tour="cabecera-paso"]')?.getBoundingClientRect() ?? null);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [visible, paso, estrecho]);

  if (!visible) return null;

  // Panel flotante: la pista cae a su izquierda, a la altura de la cabecera.
  // Panel en hoja inferior (estrecho/móvil): arriba, para no tapar el visor ni sus controles.
  const sitio: CSSProperties = estrecho || !rect
    ? { top: 72, left: 12, right: 12, marginInline: "auto" }
    : { top: Math.max(12, rect.top), left: Math.max(12, rect.left - ANCHO - HUECO) };

  return createPortal(
    <div
      role="note"
      aria-label={`Pista: ${explicacion.titulo}`}
      data-glass=""
      data-pista-paso={paso}
      className="tour-pista"
      style={{ ...glass("dense"), ...sitio }}
    >
      <span className="tour-solo-lectores" aria-live="polite">{`Pista del paso ${paso}: ${explicacion.titulo}`}</span>
      <ContenidoExplicacion explicacion={explicacion} />
      <div className="tour-acciones">
        <Button style={{ minHeight: 44 }} onClick={() => void marcarPista(paso)}>{PISTAS_UI.entendido}</Button>
        <Button variant="ghost" style={{ minHeight: 44 }} onClick={() => void setPistasActivas(false)}>{PISTAS_UI.noMostrar}</Button>
      </div>
    </div>,
    document.body,
  );
}
