/* NavPildora — la navegación de la landing: una pastilla de cristal fija arriba,
   al centro. Marca, cuatro anclas a las secciones y los dos accesos. Al bajar
   más de 40 px se encoge al 90 %; en estrecho (≤ 760 px) las anclas se pliegan
   tras un botón «Menú». */

import { useState } from "react";
import { useMediaQuery } from "../../hooks/useEstrecho";
import { DUR, EASE, motion, useMotionValueEvent, useReducedMotion, useScroll } from "../../motion";
import { glass } from "../../styles/glass";
import { Button } from "../Button";
import { Logo } from "../shell/Logo";

const ENLACES = [
  ["Qué es", "que-es"],
  ["Cómo funciona", "como-funciona"],
  ["Índices", "indices"],
  ["Dispositivos", "dispositivos"],
] as const;

const enlaceStyle = {
  padding: "8px 12px",
  borderRadius: "var(--radius-full)",
  fontSize: 14,
  color: "var(--muted-foreground)",
  textDecoration: "none",
} as const;

export function NavPildora({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void }) {
  const estrecho = useMediaQuery("(max-width: 760px)");
  const reducido = useReducedMotion();
  const [encogida, setEncogida] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setEncogida(y > 40));

  const enlaces = ENLACES.map(([texto, id]) => (
    <a key={id} href={`#${id}`} style={enlaceStyle} onClick={() => setAbierto(false)}>
      {texto}
    </a>
  ));

  return (
    <div style={{ position: "fixed", top: 14, left: 0, right: 0, zIndex: 100, display: "flex", justifyContent: "center", padding: "0 12px", pointerEvents: "none" }}>
      <motion.nav
        aria-label="Principal"
        data-glass
        animate={{ scale: encogida ? 0.9 : 1 }}
        transition={reducido ? { duration: 0 } : { duration: DUR.estado, ease: EASE }}
        style={{
          ...glass("normal"),
          pointerEvents: "auto",
          borderRadius: "var(--radius-full)",
          padding: "6px 8px 6px 18px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          maxWidth: "100%",
          transformOrigin: "top center",
        }}
      >
        <Logo size={26} />
        {!estrecho && <div style={{ display: "flex", gap: 2, margin: "0 8px" }}>{enlaces}</div>}
        <Button variant="secondary" size="sm" onClick={onEntrar}>Entrar</Button>
        <Button size="sm" onClick={onCrearCuenta}>Crear cuenta</Button>
        {estrecho && (
          <Button variant="ghost" size="sm" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
            Menú
          </Button>
        )}
        {estrecho && abierto && (
          <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", padding: "4px 0 8px" }}>{enlaces}</div>
        )}
      </motion.nav>
    </div>
  );
}
