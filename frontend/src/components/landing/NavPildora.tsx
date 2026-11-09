/* NavPildora — la navegación de la landing: una pastilla de cristal fija arriba,
   al centro. Marca, cuatro anclas a las secciones y los accesos. Al bajar más
   de 40 px se encoge al 90 %. Hasta 1024 px las anclas se pliegan tras un botón
   «Menú» (accesos de 44 px); hasta 640 px la marca es compacta, queda solo
   «Entrar» y un menú de icono, y «Crear cuenta» y el tema van en el panel. El
   panel se cierra con Escape (y devuelve el foco al botón), al tocar fuera y al
   hacer scroll. Los enlaces desplazan con animación y el de la sección activa
   lleva aria-current y una píldora deslizante (`layoutId`; sin deslizar con
   movimiento reducido). El color de los enlaces vive en una clase
   (`.landing-nav__enlace`), así que reaccionan al pasar el ratón y al foco. */

import { useEffect, useId, useRef, useState } from "react";
import { useMediaQuery, useMovil } from "../../hooks/useEstrecho";
import { DUR, EASE, motion, useMotionValueEvent, useReducedMotion, useScroll } from "../../motion";
import { glass } from "../../styles/glass";
import { CONSULTA } from "../../styles/puntosCorte";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Logo } from "../shell/Logo";
import { ThemeToggle } from "../ThemeToggle";
import { useIrASeccion } from "./desplazamiento";
import { useSeccionActiva } from "./useSeccionActiva";

const ENLACES = [
  ["Qué es", "que-es"],
  ["Cómo funciona", "como-funciona"],
  ["Índices", "indices"],
  ["Dispositivos", "dispositivos"],
] as const;

const IDS = ENLACES.map(([, id]) => id);

/* Con las anclas desplegadas la pastilla mide ~810 px (marca ~170 + enlaces
   ~360 + accesos ~200 + huecos ~80); con el tema y los accesos de 44 px a 1024
   ya no cabe con margen para la escala 0,9: se pliega en vez de partirse. */
export const NAV_PLEGADA = CONSULTA.tableta;

export function NavPildora({ onEntrar, onCrearCuenta }: { onEntrar: () => void; onCrearCuenta: () => void }) {
  const estrecho = useMediaQuery(NAV_PLEGADA);
  const movil = useMovil();
  const irA = useIrASeccion();
  const activa = useSeccionActiva(IDS);
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

  const enlaces = ENLACES.map(([texto, id]) => {
    const esActiva = activa === id;
    return (
      <a
        key={id}
        href={`#${id}`}
        className={`landing-nav__enlace${estrecho && esActiva ? " landing-nav__enlace--activo" : ""}`}
        aria-current={esActiva ? "location" : undefined}
        onClick={(e) => {
          setAbierto(false);
          irA(e, id);
        }}
      >
        {!estrecho && esActiva && (
          <motion.span
            layoutId="landing-nav-activa"
            className="landing-nav__activa"
            aria-hidden
            transition={reducido ? { duration: 0 } : { duration: DUR.estado, ease: EASE }}
          />
        )}
        {texto}
      </a>
    );
  });
  const tamano = estrecho ? "md" : "sm";

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
        {movil ? (
          // El icono compacto ya se anuncia «Prospective».
          <Logo variante="linea" size={26} compact destello />
        ) : (
          <Logo variante="linea" size={26} destello />
        )}
        {!estrecho && <div style={{ display: "flex", gap: 2, margin: "0 8px" }}>{enlaces}</div>}
        <Button variant="secondary" size={tamano} onClick={onEntrar}>Entrar</Button>
        {!movil && <Button size={tamano} onClick={onCrearCuenta}>Crear cuenta</Button>}
        {!movil && <ThemeToggle size={estrecho ? "lg" : "md"} />}
        {estrecho && (
          <Button
            id={idMenu}
            variant="ghost"
            size="md"
            aria-expanded={abierto}
            aria-controls={idPanel}
            aria-label={movil ? "Menú" : undefined}
            onClick={() => setAbierto((v) => !v)}
          >
            {movil ? <Icon name="MENU" /> : "Menú"}
          </Button>
        )}
        {/* Siempre montado al plegar, para que `aria-controls` apunte a algo; `hidden` lo pliega. */}
        {estrecho && (
          <div
            id={idPanel}
            className="landing-nav__panel"
            hidden={!abierto}
            style={{ flexBasis: "100%", display: abierto ? "flex" : "none", flexDirection: "column", padding: "4px 0 8px" }}
          >
            {enlaces}
            {movil && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, paddingTop: 8 }}>
                <Button size="md" style={{ width: "100%" }} onClick={onCrearCuenta}>Crear cuenta</Button>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <ThemeToggle size="lg" />
                </div>
              </div>
            )}
          </div>
        )}
      </motion.nav>
    </div>
  );
}
