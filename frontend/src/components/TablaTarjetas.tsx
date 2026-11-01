/* Tabla de la oficina reutilizable (Pedidos, Usuarios, Cuentas pendientes,
   Auditoría). En ≥ 641 px es una tabla de cristal de verdad (<table>, <th
   scope="col">) a todo el ancho y sin scroll horizontal: las celdas cortan el
   texto largo por cualquier punto y solo las marcadas `sinPartir` no se parten.
   En ≤ 640 px pasa a una lista de tarjetas: un título, los datos rotulados en
   <dl> y un pie con las acciones. La fila (o tarjeta) puede ser pulsable por
   clic, Intro o Espacio, sin robar el clic a los controles que lleve dentro. */
import { Fragment, useId, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useMovil } from "../hooks/useEstrecho";
import { glass } from "../styles/glass";
import "../styles/office.css";
import { Icon } from "./Icon";

export interface ColumnaTabla<T> {
  id: string;
  /** Cabecera en tabla; rótulo del dato en tarjeta. */
  titulo: string;
  celda: (fila: T) => ReactNode;
  /** En tarjeta: "titulo" (cabeza, una por tabla), "dato" (rótulo · valor; por defecto), "pie" (abajo: acciones), "oculta". */
  enTarjeta?: "titulo" | "dato" | "pie" | "oculta";
  alinear?: "inicio" | "fin";
  /** white-space: nowrap (fechas, códigos, acciones). */
  sinPartir?: boolean;
  /** Ancho CSS de la columna en la tabla («1%» encoge a su contenido). */
  ancho?: string;
}

export interface TablaTarjetasProps<T> {
  filas: readonly T[];
  columnas: readonly ColumnaTabla<T>[];
  clave: (fila: T) => string | number;
  /** Nombre accesible de la tabla o de la lista. */
  rotulo: string;
  /** Fila pulsable: cursor, hover de cristal, chevron final, Intro/Espacio. */
  onFila?: (fila: T) => void;
  seleccionada?: (fila: T) => boolean;
  claseFila?: (fila: T) => string | undefined;
  /** Desplegado bajo la fila (tabla: <tr class="fila-detalle">; tarjeta: dentro de ella). */
  detalle?: (fila: T) => ReactNode | null;
  /** Sustituye al cuerpo cuando no hay filas (vacío, error, carga). */
  vacio?: ReactNode;
}

/** Controles que tienen su propia acción: un clic en ellos no abre la fila. */
const INTERACTIVOS = "button, a, input, select, textarea, [role='menuitem'], [role='switch']";

const CABECERA: CSSProperties = { padding: "10px 14px" };
const CELDA: CSSProperties = { padding: "13px 14px", fontSize: 13, verticalAlign: "top", minWidth: 0 };

function estiloCelda<T>(c: ColumnaTabla<T>): CSSProperties {
  return {
    ...CELDA,
    textAlign: c.alinear === "fin" ? "right" : "left",
    ...(c.sinPartir ? { whiteSpace: "nowrap" } : { overflowWrap: "anywhere" }),
  };
}

/** Manejadores de una fila o tarjeta pulsable (o nada si no lo es). */
function pulsable<T>(fila: T, onFila: ((fila: T) => void) | undefined) {
  if (!onFila) return {};
  return {
    tabIndex: 0,
    "data-pulsable": "",
    onClick: (e: MouseEvent<HTMLElement>) => {
      const control = (e.target as Element).closest(INTERACTIVOS);
      if (control && control !== e.currentTarget) return;
      onFila(fila);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      onFila(fila);
    },
  };
}

export function TablaTarjetas<T>(p: TablaTarjetasProps<T>) {
  const { filas, columnas, clave, rotulo, onFila, seleccionada, claseFila, detalle, vacio } = p;
  const movil = useMovil();
  const base = useId();
  const idDetalle = (fila: T) => `${base}-detalle-${clave(fila)}`;

  if (movil) {
    if (filas.length === 0 && vacio !== undefined) return <div data-vista="tarjetas">{vacio}</div>;
    const titulo = columnas.find((c) => c.enTarjeta === "titulo");
    const datos = columnas.filter((c) => (c.enTarjeta ?? "dato") === "dato");
    const pie = columnas.filter((c) => c.enTarjeta === "pie");
    return (
      <ul role="list" aria-label={rotulo} className="tt-tarjetas" data-vista="tarjetas">
        {filas.map((fila) => {
          const sel = seleccionada?.(fila) ?? false;
          const desplegado = detalle?.(fila) ?? null;
          const estilo = glass("normal");
          return (
            <li
              key={clave(fila)}
              data-glass
              className={["tt-tarjeta", claseFila?.(fila)].filter(Boolean).join(" ")}
              data-seleccionada={sel ? "true" : undefined}
              aria-current={sel ? "true" : undefined}
              style={sel ? { ...estilo, boxShadow: `inset 2px 0 0 var(--primary), ${estilo.boxShadow}` } : estilo}
              {...pulsable(fila, onFila)}
            >
              {titulo && <div className="tt-tarjeta-titulo">{titulo.celda(fila)}</div>}
              {datos.length > 0 && (
                <dl>
                  {datos.map((c) => (
                    <Fragment key={c.id}>
                      <dt>{c.titulo}</dt>
                      <dd style={c.sinPartir ? { whiteSpace: "nowrap" } : undefined}>{c.celda(fila)}</dd>
                    </Fragment>
                  ))}
                </dl>
              )}
              {desplegado !== null && <div className="tt-tarjeta-detalle">{desplegado}</div>}
              {pie.length > 0 && (
                <div className="tt-tarjeta-pie">
                  {pie.map((c) => <Fragment key={c.id}>{c.celda(fila)}</Fragment>)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  const nCols = columnas.length + (onFila ? 1 : 0);
  return (
    <div data-vista="tabla" data-glass style={{ ...glass("dense"), borderRadius: "var(--radius-card-lg)" }}>
      {filas.length === 0 && vacio !== undefined ? vacio : (
        <table className="tabla-oficina" aria-label={rotulo} style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  style={{ ...CABECERA, textAlign: c.alinear === "fin" ? "right" : "left", width: c.ancho }}
                >
                  {c.titulo}
                </th>
              ))}
              {onFila && <td aria-hidden="true" style={{ width: "1%" }} />}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const sel = seleccionada?.(fila) ?? false;
              const desplegado = detalle?.(fila) ?? null;
              const id = idDetalle(fila);
              return (
                <Fragment key={clave(fila)}>
                  <tr
                    className={claseFila?.(fila)}
                    data-seleccionada={sel ? "true" : undefined}
                    aria-current={sel ? "true" : undefined}
                    aria-expanded={detalle && onFila ? desplegado !== null : undefined}
                    aria-controls={desplegado !== null ? id : undefined}
                    {...pulsable(fila, onFila)}
                  >
                    {columnas.map((c) => <td key={c.id} style={estiloCelda(c)}>{c.celda(fila)}</td>)}
                    {onFila && (
                      <td aria-hidden="true" style={{ ...CELDA, width: "1%", color: "var(--muted-foreground)" }}>
                        <Icon name="CHEVRON_RIGHT" size={14} />
                      </td>
                    )}
                  </tr>
                  {desplegado !== null && (
                    <tr className="fila-detalle" id={id}>
                      <td colSpan={nCols} style={{ ...CELDA, overflowWrap: "anywhere" }}>{desplegado}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
