/* Barra superior del shell (F2): 56 px en vidrio con la miga de pan y el
   subtítulo a la izquierda y, a la derecha, el estado, las acciones que declara
   la pantalla, el tema y el avatar-menú. «Cerrar sesión» vive en la barra lateral y también
   en el menú del avatar. En tableta no hay subtítulo; en móvil el tema va al «⋯» y el
   control propio (`extra`) baja a una fila entera.

   La miga solo lleva destinos reales («Pacientes / segura, Juan», «Usuarios»):
   «Administración» no es una pantalla y no aparece; ese rótulo vive en el grupo
   de la barra lateral. Los segmentos con `onClick` navegan; el último es la
   pantalla actual. */

import type { ReactNode } from "react";
import { Button } from "../Button";
import { Icon } from "../Icon";
import type { IconName } from "../Icon";
import { MenuMas } from "../MenuMas";
import type { ItemMenu } from "../MenuMas";
import { useTramo } from "../../hooks/useEstrecho";
import { ThemeToggle } from "../ThemeToggle";
import { useThemeContext } from "../../store/theme";
import { UserMenu } from "./UserMenu";
import { glass } from "../../styles/glass";
import { openCommandPalette } from "../../lib/commands";
import { atajoPaleta, rotuloPaleta, teclasPaleta } from "../../lib/plataforma";

/** Un segmento de la miga: rótulo y, si lleva destino, adónde va. */
export interface Crumb {
  label: string;
  onClick?: () => void;
  /** Dato atenuado junto al rótulo (p. ej. la HC del paciente); solo lo pinta el quirófano. */
  detail?: string;
}

/** Una acción de la barra: la principal conserva su texto; las demás se
    encogen a icono (≤ 1280) o pasan al menú «⋯» (móvil). */
export interface AccionBarra {
  id: string;
  /** Texto visible y nombre accesible. */
  label: string;
  icon: IconName;
  onClick?: () => void;
  /** Enlace (descarga) con aspecto de botón: <a target="_blank" rel="noreferrer">. */
  href?: string;
  /** Como mucho una: variante «default»; las demás «outline». */
  principal?: boolean;
  /** Tooltip; si falta, label. */
  title?: string;
  disabled?: boolean;
  /** `onClick` abre una hoja o un diálogo que toma el foco: desde el menú «⋯» no se devuelve al botón. */
  abreDialogo?: boolean;
  /** Objetivo del recorrido del onboarding: las acciones seguidas con el mismo valor
      van juntas en una caja `data-tour`. En móvil solo se pintan las principales (el resto
      va al «⋯»), así que la caja lleva solo esas; el recorrido la junta con el «⋯». */
  tour?: string;
}

/** Agrupa las acciones seguidas que comparten `tour`; las que no lo llevan van solas. */
function porTour(lista: AccionBarra[]): AccionBarra[][] {
  const grupos: AccionBarra[][] = [];
  for (const a of lista) {
    const ultimo = grupos[grupos.length - 1];
    if (a.tour && ultimo && ultimo[0].tour === a.tour) ultimo.push(a);
    else grupos.push([a]);
  }
  return grupos;
}

function Accion({ a, soloIcono, tam }: { a: AccionBarra; soloIcono: boolean; tam: "sm" | "md" }) {
  const lado = tam === "md" ? "var(--control-md)" : "var(--control-sm)";
  const icono = <Icon name={a.icon} size={tam === "md" ? 16 : 14} />;
  const nombre = soloIcono ? a.label : undefined;
  if (a.href) {
    return (
      <a
        href={a.disabled ? undefined : a.href}
        target="_blank"
        rel="noreferrer"
        className="shell-accion"
        data-variant="outline"
        data-size={tam}
        aria-label={nombre}
        aria-disabled={a.disabled || undefined}
        title={a.title ?? (soloIcono ? a.label : undefined)}
        style={soloIcono ? { width: lado, padding: 0, gap: 0 } : undefined}
      >
        {icono}
        {!soloIcono && a.label}
      </a>
    );
  }
  return (
    <Button
      size={tam}
      variant={a.principal ? "default" : "outline"}
      leadingIcon={icono}
      onClick={a.onClick}
      disabled={a.disabled}
      aria-label={nombre}
      title={a.title ?? (soloIcono ? a.label : undefined)}
      style={soloIcono ? { width: lado, padding: 0, gap: 0 } : undefined}
    >
      {!soloIcono && a.label}
    </Button>
  );
}

export function TopBar({ crumbs, subtitle, status, acciones, extra, onAbrirSecciones, seccionesAbiertas = false }: {
  crumbs?: Crumb[];
  subtitle?: ReactNode;
  status?: ReactNode;
  acciones?: AccionBarra[];
  /** Control propio de la pantalla (buscador…), antes de las acciones. */
  extra?: ReactNode;
  /** Si viene (móvil), pinta al principio el botón que abre el cajón de secciones. */
  onAbrirSecciones?: () => void;
  seccionesAbiertas?: boolean;
}) {
  const tramo = useTramo();
  const movil = tramo === "movil";
  const tableta = tramo === "tableta" || movil;
  const estrecho = tramo === "estrecho" || tableta;
  const tam = tableta ? "md" : "sm";
  const lista = acciones ?? [];
  const secundarias = lista.filter((a) => !a.principal);
  const { theme, toggle } = useThemeContext();
  // En móvil el tema también va al «⋯» (R4): cuatro botones no caben en 347 px.
  const itemsMenu: ItemMenu[] = movil
    ? [
        ...secundarias.map((a): ItemMenu => ({ id: a.id, label: a.label, icon: a.icon, href: a.href, onSelect: a.onClick, disabled: a.disabled, abreDialogo: a.abreDialogo })),
        { id: "paleta", label: "Paleta de mandos", icon: "SEARCH", onSelect: openCommandPalette, separadoAntes: secundarias.length > 0 },
        theme === "light"
          ? { id: "tema", label: "Cambiar a tema oscuro", icon: "THEME_DARK", onSelect: toggle }
          : { id: "tema", label: "Cambiar a tema claro", icon: "THEME_LIGHT", onSelect: toggle },
      ]
    : [];
  // En móvil solo se pinta el último segmento de la miga. El subtítulo solo
  // por encima de 1024: en tableta le quitaba el sitio al título (R2).
  const migas = crumbs && movil ? crumbs.slice(-1) : crumbs;
  // …y el tramo anterior con destino queda como flecha de vuelta: sin ella, en
  // móvil la ficha no tenía más salida que el cajón o el «Atrás» del navegador.
  const vuelta = movil && crumbs ? crumbs.slice(0, -1).reverse().find((c) => c.onClick) : undefined;
  const extraNodo = extra ? <div className="shell-extra">{extra}</div> : null;
  return (
    <header className="shell-top" style={{ ...glass("normal"), borderWidth: "0 0 1px", boxShadow: "var(--glass-highlight)" }} data-glass>
      {onAbrirSecciones && (
        <button
          type="button"
          className="shell-top-menu"
          data-abrir-secciones
          aria-label="Abrir las secciones"
          aria-expanded={seccionesAbiertas}
          aria-controls="shell-cajon"
          data-tour="nav-hamburguesa"
          onClick={onAbrirSecciones}
        >
          <Icon name="MENU" size={18} />
        </button>
      )}
      {vuelta && (
        <button type="button" className="shell-top-menu" aria-label={`Volver a ${vuelta.label}`} title={`Volver a ${vuelta.label}`} onClick={vuelta.onClick}>
          <Icon name="BACK" size={18} />
        </button>
      )}
      {migas && migas.length > 0 && (
        <nav aria-label="Miga de pan" className="shell-crumbs">
          <ol>
            {migas.map((c, i) => {
              const last = i === migas.length - 1;
              return (
                <li key={i}>
                  {i > 0 && (
                    <span className="shell-crumb-sep" aria-hidden>
                      <Icon name="CHEVRON_RIGHT" size={12} />
                    </span>
                  )}
                  {c.onClick ? (
                    <button type="button" className="shell-crumb shell-crumb-link" title={c.label} onClick={c.onClick}>
                      {c.label}
                    </button>
                  ) : (
                    <span className="shell-crumb" title={c.label} aria-current={last ? "page" : undefined}>
                      {c.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {subtitle && !tableta && <span className="shell-subtitle" title={typeof subtitle === "string" ? subtitle : undefined}>{subtitle}</span>}
      <div className="shell-actions">
        {status}
        {!movil && extraNodo}
        {porTour(lista.filter((a) => !movil || a.principal)).map((grupo) => {
          const botones = grupo.map((a) => (
            <Accion key={a.id} a={a} soloIcono={movil || (estrecho && !a.principal) || (tableta && !!extra && !!a.principal)} tam={tam} />
          ));
          const tour = grupo[0].tour;
          return tour
            ? <span key={`tour-${grupo[0].id}`} className="shell-grupo" data-tour={tour}>{botones}</span>
            : botones[0];
        })}
        {movil && <span className="shell-grupo" data-tour="acciones-mas"><MenuMas items={itemsMenu} tactil /></span>}
        {/* ⌘K, tema y menú de usuario: una caja para el foco del recorrido (parada «Atajos»).
            En móvil solo queda el avatar: el recorrido lo junta con el «⋯», donde va la paleta. */}
        <span className="shell-grupo" data-tour={movil ? "usuario" : "atajos"}>
          {!movil && (
            <button
              type="button"
              className="shell-cmdk"
              aria-label={rotuloPaleta()}
              aria-keyshortcuts={teclasPaleta()}
              title={`Paleta de mandos (${atajoPaleta()})`}
              onClick={openCommandPalette}
            >
              {atajoPaleta()}
            </button>
          )}
          {!movil && <ThemeToggle size={tableta ? "lg" : "sm"} />}
          <UserMenu />
        </span>
      </div>
      {/* Móvil: el buscador va en su propia fila, a todo el ancho (R3). */}
      {movil && extraNodo}
    </header>
  );
}
