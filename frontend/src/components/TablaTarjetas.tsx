/* Tabla de la oficina reutilizable (Pedidos, Usuarios, Cuentas pendientes,
   Auditoría). En ≥ 641 px es una tabla de cristal de verdad (<table>, <th
   scope="col">, la celda que identifica la fila en <th scope="row">) a todo el
   ancho y sin scroll de la página: las celdas cortan el texto largo por cualquier
   punto y solo las marcadas `sinPartir` no se parten. Red de seguridad: si aun
   así no cupiera, la tabla se desplaza dentro de su caja (`.tt-tabla-caja`). En ≤ 640 px pasa a una
   lista de tarjetas: un título, los datos rotulados en <dl> y un pie con las
   acciones. Si la fila es pulsable, su control accesible es un <button> real en
   la celda que la identifica (o en el título de la tarjeta), con aria-expanded y
   aria-controls si hay detalle; la fila entera responde además al clic del
   ratón, sin robárselo a los controles que lleve dentro. */
import { Fragment, useId, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useMovil, useTableta } from "../hooks/useEstrecho";
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
  /** Fila pulsable: botón en la celda que la identifica, clic de ratón en toda la fila, hover de cristal, chevron final. */
  onFila?: (fila: T) => void;
  seleccionada?: (fila: T) => boolean;
  claseFila?: (fila: T) => string | undefined;
  /** Desplegado bajo la fila (tabla: <tr class="fila-detalle">; tarjeta: dentro de ella). */
  detalle?: (fila: T) => ReactNode | null;
  /** Sustituye al cuerpo cuando no hay filas (vacío, error, carga). */
  vacio?: ReactNode;
  /** Hasta qué ancho se muestran tarjetas: "movil" (≤ 640, por defecto) o "tableta" (≤ 1024, para tablas con demasiadas columnas). */
  tarjetasHasta?: "movil" | "tableta";
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

/** Clic de ratón en cualquier punto de una fila o tarjeta pulsable (el
    teclado va por el botón de la celda que la identifica). Un clic o toque
    dentro del detalle desplegado de una tarjeta no la pliega: se lee o se
    selecciona su texto. */
function pulsable<T>(fila: T, onFila: ((fila: T) => void) | undefined) {
  if (!onFila) return {};
  return {
    "data-pulsable": "",
    onClick: (e: MouseEvent<HTMLElement>) => {
      const objetivo = e.target as Element;
      const control = objetivo.closest(INTERACTIVOS);
      if (control && control !== e.currentTarget) return;
      if (objetivo.closest(".tt-tarjeta-detalle")) return;
      onFila(fila);
    },
  };
}

/** La columna que identifica la fila: la de título de tarjeta o, si no hay,
    la primera que se muestra como dato. */
function columnaIdentidad<T>(columnas: readonly ColumnaTabla<T>[]): ColumnaTabla<T> | undefined {
  return columnas.find((c) => c.enTarjeta === "titulo")
    ?? columnas.find((c) => (c.enTarjeta ?? "dato") === "dato")
    ?? columnas[0];
}

export function TablaTarjetas<T>(p: TablaTarjetasProps<T>) {
  const { filas, columnas, clave, rotulo, onFila, seleccionada, claseFila, detalle, vacio, tarjetasHasta = "movil" } = p;
  const esMovil = useMovil();
  const esTableta = useTableta();
  const movil = tarjetasHasta === "tableta" ? esTableta : esMovil;
  const base = useId();
  const idDetalle = (fila: T) => `${base}-detalle-${clave(fila)}`;
  const identidad = columnaIdentidad(columnas);

  /** El contenido de la celda identificadora, dentro del botón si la fila es pulsable. */
  const control = (fila: T, contenido: ReactNode, desplegado: ReactNode | null) => {
    if (!onFila) return contenido;
    return (
      <button
        type="button"
        className="tt-fila-boton"
        onClick={() => onFila(fila)}
        aria-expanded={detalle ? desplegado !== null : undefined}
        aria-controls={desplegado !== null ? idDetalle(fila) : undefined}
      >
        {contenido}
      </button>
    );
  };

  if (movil) {
    if (filas.length === 0 && vacio !== undefined) return <div data-vista="tarjetas">{vacio}</div>;
    // Sin columna de título, una tarjeta pulsable toma por título la que identifica la fila.
    const titulo = columnas.find((c) => c.enTarjeta === "titulo") ?? (onFila ? identidad : undefined);
    const datos = columnas.filter((c) => c !== titulo && (c.enTarjeta ?? "dato") === "dato");
    const pie = columnas.filter((c) => c.enTarjeta === "pie");
    return (
      <ul role="list" aria-label={rotulo} className="tt-tarjetas" data-vista="tarjetas">
        {filas.map((fila) => {
          const sel = seleccionada?.(fila) ?? false;
          const desplegado = detalle?.(fila) ?? null;
          return (
            <li
              key={clave(fila)}
              data-glass
              className={["tt-tarjeta", claseFila?.(fila)].filter(Boolean).join(" ")}
              data-seleccionada={sel ? "true" : undefined}
              aria-current={sel ? "true" : undefined}
              style={sel ? { ...glass("normal"), boxShadow: `inset 2px 0 0 var(--primary), ${glass("normal").boxShadow}` } : glass("normal")}
              {...pulsable(fila, onFila)}
            >
              {titulo && <div className="tt-tarjeta-titulo">{control(fila, titulo.celda(fila), desplegado)}</div>}
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
              {desplegado !== null && <div className="tt-tarjeta-detalle" id={idDetalle(fila)}>{desplegado}</div>}
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
    <div data-vista="tabla" data-glass className="tt-tabla-caja" style={{ ...glass("dense"), borderRadius: "var(--radius-card-lg)" }}>
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
              return (
                <Fragment key={clave(fila)}>
                  <tr
                    className={claseFila?.(fila)}
                    data-seleccionada={sel ? "true" : undefined}
                    aria-current={sel ? "true" : undefined}
                    {...pulsable(fila, onFila)}
                  >
                    {columnas.map((c) => c === identidad ? (
                      <th key={c.id} scope="row" style={{ ...estiloCelda(c), fontWeight: "inherit", overflowWrap: "normal", wordBreak: "normal", minWidth: "12ch" }}>
                        {control(fila, c.celda(fila), desplegado)}
                      </th>
                    ) : (
                      <td key={c.id} style={estiloCelda(c)}>{c.celda(fila)}</td>
                    ))}
                    {onFila && (
                      <td
                        aria-hidden="true"
                        className="tt-chevron"
                        data-abierto={detalle ? String(desplegado !== null) : undefined}
                        style={{ ...CELDA, width: "1%", color: "var(--muted-foreground)" }}
                      >
                        <Icon name="CHEVRON_RIGHT" size={14} />
                      </td>
                    )}
                  </tr>
                  {desplegado !== null && (
                    <tr className="fila-detalle" id={idDetalle(fila)}>
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
