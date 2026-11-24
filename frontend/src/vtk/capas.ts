/* UNI-175: «Capas», qué se ve en la escena 3D.

   Al presentar se enseña primero la anatomía limpia, luego las medidas y al
   final los dispositivos. Antes solo se podía quitar parte (la casilla de las
   anotaciones 3D en Morfometría, el nivel de textos, CALOR); las marcas del
   cuello, la línea central, el saco y los dispositivos se veían siempre.

   Ocultar solo cambia lo que se ve: ni la medida, ni el plan, ni el informe.
   Por eso el estado vive en el visor y no se guarda con la sesión, y la
   cabecera dice cuántas capas hay ocultas: nadie debe dar por quitado un clip
   que solo está escondido. */

export type Capa = "cuello" | "medidas" | "linea" | "saco" | "dispositivos";

export interface CapaInfo { id: Capa; rotulo: string; titulo: string }

export const CAPAS: CapaInfo[] = [
  { id: "cuello", rotulo: "Marcas del cuello", titulo: "Borde, punto del cuello y ápice marcados" },
  { id: "medidas", rotulo: "Medidas", titulo: "Las líneas del cuello, la altura del domo y el Ø máximo (la casilla de Morfometría)" },
  { id: "linea", rotulo: "Línea central", titulo: "La línea central del vaso" },
  { id: "saco", rotulo: "Saco aislado", titulo: "El saco medido (o su mapa de calor del clip)" },
  { id: "dispositivos", rotulo: "Dispositivos", titulo: "Stent, clips y coils colocados" },
];

/** Lo que hay ahora en la escena, para no ofrecer capas que no existen. */
export interface CapasPresentes {
  cuello: boolean;
  medidas: boolean;
  linea: boolean;
  saco: boolean;
  dispositivos: boolean;
}

/** Una fila del control: la capa, si existe ahora y si se ve. */
export interface EstadoCapa extends CapaInfo { disponible: boolean; visible: boolean }

/** `medidas` va aparte: es la casilla de Morfometría (apagada de entrada),
 *  no una capa que se esconda. Las demás se ven salvo que estén en `ocultas`. */
export function estadoCapas(ocultas: ReadonlySet<Capa>, presentes: CapasPresentes, medidasVisibles: boolean): EstadoCapa[] {
  return CAPAS.map((c) => ({
    ...c,
    disponible: presentes[c.id],
    visible: c.id === "medidas" ? medidasVisibles : !ocultas.has(c.id),
  }));
}

/** Cuántas capas que están en la escena se han escondido. Las medidas no
 *  cuentan: apagadas es como vienen. */
export function contarOcultas(estado: EstadoCapa[]): number {
  return estado.filter((c) => c.id !== "medidas" && c.disponible && !c.visible).length;
}

export function textoOcultas(n: number): string {
  return n === 1 ? "1 capa oculta" : `${n} capas ocultas`;
}

/** Ocultar o mostrar una capa: un conjunto nuevo, el de antes no se toca. */
export function conCapa(ocultas: ReadonlySet<Capa>, capa: Capa, visible: boolean): Set<Capa> {
  const out = new Set(ocultas);
  if (visible) out.delete(capa);
  else out.add(capa);
  return out;
}
