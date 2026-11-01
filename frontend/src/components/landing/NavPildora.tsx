/* NavPildora — la navegación de la landing: una pastilla de cristal fija arriba,
   al centro. Marca, cuatro anclas a las secciones y los dos accesos. Al bajar
   más de 40 px se encoge al 90 %; en estrecho (≤ 900 px) las anclas se pliegan
   tras un botón «Menú» y la marca queda en su versión compacta, para que la
   pastilla quepa en una fila a 390 px. El panel plegado se cierra con Escape (y
   devuelve el foco al botón), al tocar fuera y al hacer scroll. Los enlaces llevan su color en una clase
   (`.landing-nav__enlace`), así que reaccionan al pasar el ratón y al foco. */

import { useEffect, useId, useRef, useState } from "react";
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

/* Anchura natural de la pastilla con las anclas desplegadas: marca con
   subtítulo (~170 px) + cuatro enlaces (~360) + Entrar y Crear cuenta (~200) +
   huecos y relleno (~80) ≈ 810 px. Por debajo de 900 px (con margen para la
   escala 0,9 y el tamaño de letra del usuario) ya se pliega en vez de partirse en dos filas. */
export const NAV_PLEGADA = "(max-width: 900px)";

export function NavPildora({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void }) {
  const estrecho = useMediaQuery(NAV_PLEGADA);
  const reducido = useReducedMotion();
  const [encogida, setEncogida] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setEncogida(y > 40));

  const navRef = useRef<HTMLElement>(null);
  const idPanel = useId();
  const idMenu = useId();
  const panelAbierto = estrecho && abierto;

  // Escape cierra el panel y devuelve el foco al botón «Menú».
  useEffect(() => {
    if (!panelAbierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      document.getElementById(idMenu)?.focus();
    };
    // Tocar fuera de la pastilla o desplazar la página también pliega el menú.
    const alTocarFuera = (e: PointerEvent) => {
      if (e.target instanceof Node && navRef.current?.contains(e.target)) return;
      setAbierto(false);
    };
    const alDesplazar = () => setAbierto(false);
    document.addEventListener("keydown", alPulsar);
    document.addEventListener("pointerdown", alTocarFuera);
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.removeEventListener("pointerdown", alTocarFuera);
      window.removeEventListener("scroll", alDesplazar);
    };
  }, [panelAbierto, idMenu]);

  const enlaces = ENLACES.map(([texto, id]) => (
    <a key={id} href={`#${id}`} className="landing-nav__enlace" onClick={() => setAbierto(false)}>
      {texto}
    </a>
  ));

  return (
    <div style={{ position: "fixed", top: 14, left: 0, right: 0, zIndex: 100, display: "flex", justifyContent: "center", padding: "0 12px", pointerEvents: "none" }}>
      <motion.nav
        ref={navRef}
        aria-label="Principal"
        data-glass
        animate={{ scale: encogida ? 0.9 : 1 }}
        transition={reducido ? { duration: 0 } : { duration: DUR.estado, ease: EASE }}
        style={{
          ...glass("normal"),
          pointerEvents: "auto",
          borderRadius: panelAbierto ? "var(--radius-xl)" : "var(--radius-full)",
          padding: estrecho ? "6px 8px 6px 12px" : "6px 8px 6px 18px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          maxWidth: "100%",
          transformOrigin: "top center",
        }}
      >
        {estrecho ? (
          // El icono compacto ya se anuncia «Prospective».
          <Logo variante="linea" size={26} compact />
        ) : (
          <Logo variante="linea" size={26} />
        )}
        {!estrecho && <div style={{ display: "flex", gap: 2, margin: "0 8px" }}>{enlaces}</div>}
        <Button variant="secondary" size="sm" onClick={onEntrar}>Entrar</Button>
        <Button size="sm" onClick={onCrearCuenta}>Crear cuenta</Button>
        {estrecho && (
          <Button
            id={idMenu}
            variant="ghost"
            size="sm"
            aria-expanded={abierto}
            aria-controls={idPanel}
            onClick={() => setAbierto((v) => !v)}
          >
            Menú
          </Button>
        )}
        {/* Siempre montado en estrecho, para que `aria-controls` apunte a algo; `hidden` lo pliega. */}
        {estrecho && (
          <div
            id={idPanel}
            className="landing-nav__panel"
            hidden={!abierto}
            style={{ flexBasis: "100%", display: abierto ? "flex" : "none", flexDirection: "column", padding: "4px 0 8px" }}
          >
            {enlaces}
          </div>
        )}
      </motion.nav>
    </div>
  );
}
