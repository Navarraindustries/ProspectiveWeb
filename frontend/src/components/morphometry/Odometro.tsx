// Cifra que rueda hasta su valor. Al MONTARSE pinta el valor final de golpe
// (sin rodar: el panel puede abrirse con la medida ya hecha, y los lectores de
// pantalla y los tests ven el número desde el primer render); solo rueda
// cuando `value` CAMBIA con el componente montado, que es cuando llega una
// medida nueva (p. ej. tras marcar a mano). Con movimiento reducido, de golpe.

import { useEffect, useRef, useState } from "react";
import { EASE, animate, useReducedMotion } from "../../motion";

export function Odometro({ value, decimals, duracionMs = 600, sep = "," }: {
  value: number | null;
  decimals: number;
  duracionMs?: number;
  /** Separador decimal: la coma de siempre; el panel conserva el punto de su tabla. */
  sep?: "," | ".";
}) {
  const reducido = useReducedMotion();
  const [shown, setShown] = useState<number | null>(value);
  const prev = useRef<number | null>(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (value === null || reducido || from === value) { setShown(value); return; }
    const ctl = animate(from ?? 0, value, {
      duration: duracionMs / 1000, ease: EASE, onUpdate: setShown,
      onComplete: () => setShown(value),
    });
    return () => ctl.stop();
  }, [value, reducido, duracionMs]);

  if (shown === null) return <span data-odometro>—</span>;
  const txt = shown.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
  return <span data-odometro>{sep === "." ? txt.replace(",", ".") : txt}</span>;
}
