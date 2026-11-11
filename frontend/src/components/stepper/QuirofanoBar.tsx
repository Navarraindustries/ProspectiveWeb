/* Pastillas superiores del pipeline (F4): dos píldoras de cristal flotando
   sobre el visor, sin barra que ocupe ancho. A la izquierda, volver, las migas
   y el riesgo; a la derecha, estado, acciones, ⌘K, tema y usuario. Miden 48 px
   a 16 px del borde: caben en la banda superior (72) y no invaden la zona libre.
   Van en una sola fila flex: en portátiles (1280–1366) dos píldoras absolutas
   se solapaban; ahora la izquierda encoge (las migas se recortan con elipsis)
   y la derecha conserva su ancho. En táctil la miga empieza en el paciente
   (Volver ya lleva a Pacientes) y en móvil no hay miga: solo Volver. */

import type { CSSProperties, ReactNode } from "react";
import { Badge, riskVariant } from "../Badge";
import { Icon } from "../Icon";
import { UserMenu } from "../shell/UserMenu";
import type { Crumb } from "../shell/TopBar";
import { glass } from "../../styles/glass";
import { openCommandPalette } from "../../lib/commands";
import { atajoPaleta, rotuloPaleta, teclasPaleta } from "../../lib/plataforma";
import { OBJETIVO_TACTIL_PX } from "../../pipeline/puntosCorte";
import { TEXTO_OCULTO } from "../../styles/oculto";
import { useEstrecho } from "../../hooks/useEstrecho";
import { PUNTOS_CORTE } from "../../styles/puntosCorte";
import "../shell/shell.css";

/** Hasta este ancho los botones de acción de la píldora derecha enseñan solo el icono. */
export const CONSULTA_SOLO_ICONO = `(max-width: ${PUNTOS_CORTE.compacto}px)`;

/** Rótulo de un botón de acción: con texto, o solo el icono con el texto como
 *  nombre accesible y, de tooltip, la explicación si la hay (o el texto). Se esparce sobre `<Button>`. */
export function rotuloAccion(soloIcono: boolean, texto: string, title?: string) {
  return soloIcono
    ? { "aria-label": texto, title: title ?? texto, children: undefined }
    : { title, children: texto };
}

/** Estilo de un botón de acción de solo icono en táctil: cuadrado del objetivo
 *  táctil (el relleno de «md» lo haría más ancho que alto). Workspace y
 *  RecordButton lo comparten. */
export function estiloAccion(size: "sm" | "md", soloIcono: boolean): CSSProperties | undefined {
  return size === "md" && soloIcono ? { padding: 0, width: OBJETIVO_TACTIL_PX } : undefined;
}

const FILA: CSSProperties = {
  position: "absolute",
  top: 16,
  left: 24,
  right: 24,
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  // La fila cruza la banda de lado a lado: solo las píldoras reciben el puntero.
  pointerEvents: "none",
};

const PASTILLA: CSSProperties = {
  height: 48,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 12px",
  borderRadius: "var(--radius-full)",
  boxShadow: "var(--glass-highlight)",
  pointerEvents: "auto",
};

/** Tamaño de pantalla de la barra: ancho (≥ 1025), táctil (641–1024), móvil (≤ 640). */
export type ModoBarra = "ancho" | "tactil" | "movil";

export function QuirofanoBar({ crumbs, onBack, riskLabel, status, actions, modo = "ancho" }: {
  crumbs: Crumb[];
  onBack: () => void;
  riskLabel?: string | null;
  status?: ReactNode;
  actions?: ReactNode;
  modo?: ModoBarra;
}) {
  const movil = modo === "movil";
  const tactil = modo !== "ancho";
  // Hasta 1280 px la HC no va aparte: a 768–1025 se quedaba entera mientras
  // el nombre del paciente caía a 0 px (R14). Pasa al title del nombre.
  const hcEnTitulo = useEstrecho();
  // Móvil: sin miga (el caso ya se ve en la hoja; a 390 la miga pisaba
  // «Volver», R13). En los demás, sin la primera miga, «Pacientes», que repite
  // el botón «Volver a Pacientes» (R14 en táctil; auditoría F3 en ancho).
  const migas = movil ? [] : crumbs.length > 1 ? crumbs.slice(1) : crumbs;
  const pastilla: CSSProperties = movil ? { ...PASTILLA, gap: 6, padding: "0 6px" } : PASTILLA;
  const fila: CSSProperties = movil ? { ...FILA, left: 12, right: 12, gap: 8 } : FILA;
  return (
    <div style={fila} data-modo={modo} data-quirofano-bar>
      <div style={{ ...glass("normal"), ...pastilla, flex: "0 1 auto", minWidth: 0 }} data-glass>
        <button
          type="button"
          aria-label="Volver a Pacientes"
          title="Volver a Pacientes"
          onClick={onBack}
          className="shell-cmdk"
          style={tactil
            ? { width: OBJETIVO_TACTIL_PX, height: OBJETIVO_TACTIL_PX, padding: 0, flexShrink: 0 }
            : { width: "var(--control-sm)", padding: 0, flexShrink: 0 }}
        >
          <Icon name="BACK" size={14} />
        </button>
        {migas.length > 0 && (
          <nav aria-label="Miga de pan" className="shell-crumbs">
            <ol>
              {migas.map((c, i) => {
                const last = i === migas.length - 1;
                const hcOculta = !!c.detail && hcEnTitulo;
                const titulo = hcOculta ? `${c.label} · HC ${c.detail}` : c.label;
                const hcLector = hcOculta && <span style={TEXTO_OCULTO}> · HC {c.detail}</span>;
                return (
                  <li key={i}>
                    {i > 0 && (
                      <span className="shell-crumb-sep" aria-hidden>
                        <Icon name="CHEVRON_RIGHT" size={12} />
                      </span>
                    )}
                    {c.onClick ? (
                      <button type="button" className="shell-crumb shell-crumb-link" title={titulo} onClick={c.onClick}>
                        {c.label}{hcLector}
                      </button>
                    ) : (
                      <span className="shell-crumb" title={titulo} aria-current={last ? "page" : undefined}>
                        {c.label}{hcLector}
                      </span>
                    )}
                    {c.detail && !hcOculta && (
                      <span className="shell-crumb-detail" title={`HC ${c.detail}`}>
                        <span style={TEXTO_OCULTO}>HC </span>
                        {c.detail}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {riskLabel && !movil && <Badge variant={riskVariant(riskLabel)}>{riskLabel}</Badge>}
      </div>
      <div style={{ ...glass("normal"), ...pastilla, flex: "none" }} data-glass>
        {status}
        {actions}
        {tactil ? (
          <button type="button" className="shell-cmdk" aria-label="Más acciones" title="Más acciones: paleta de mandos" onClick={openCommandPalette}
                  style={{ width: OBJETIVO_TACTIL_PX, height: OBJETIVO_TACTIL_PX, padding: 0 }}>
            <Icon name="MENU" size={OBJETIVO_TACTIL_PX / 2} />
          </button>
        ) : (
          <>
            <button type="button" className="shell-cmdk" aria-label={rotuloPaleta()} aria-keyshortcuts={teclasPaleta()} title={`Paleta de mandos (${atajoPaleta()})`} onClick={openCommandPalette}>
              {atajoPaleta()}
            </button>
          </>
        )}
        <UserMenu />
      </div>
    </div>
  );
}
