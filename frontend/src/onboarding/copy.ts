/* Textos del onboarding. Cada explicación lleva cuatro campos cortos (qué es,
   cómo, cuándo, por qué) con un tope de caracteres: si no cabe, se recorta el
   texto, nunca el límite (spec 2026-11-09 §1). Sin lenguaje de juego. */

export interface Explicacion {
  titulo: string;
  como: string;
  cuando: string;
  porque: string;
}

export const LIMITES = { titulo: 45, como: 110, cuando: 90, porque: 90 } as const;

export type ParadaPacientes =
  | "secciones" | "crear" | "prueba" | "avisos" | "buscar"
  | "tarjeta" | "ficha" | "hoy" | "atajos";

export const PARADAS_PACIENTES: Record<ParadaPacientes, Explicacion> = {
  secciones: {
    titulo: "Tus secciones",
    como: "Toca una sección para ir a ella; fija la barra con Alt+B.",
    cuando: "Para saltar entre pacientes, estudios, pedidos de clips y talleres.",
    porque: "Todo lo clínico está a un toque, sin buscar.",
  },
  crear: {
    titulo: "Todo empieza con un paciente",
    como: "«Nuevo paciente» crea su ficha; «Nuevo caso» le cuelga un caso.",
    cuando: "Antes de subir cualquier estudio de alguien real.",
    porque: "El caso guarda juntos DICOM, sesiones y capturas.",
  },
  prueba: {
    titulo: "Probar sin paciente",
    como: "«Prueba rápida sin paciente»: subes un DICOM y planificas ya.",
    cuando: "Para enseñar la app o mirar un estudio suelto.",
    porque: "No ensucias la lista; luego puedes archivarlo en un caso.",
  },
  avisos: {
    titulo: "Avisos clínicos",
    como: "Pulsa «Ver» y vas directo al caso.",
    cuando: "Cuando aparezca un chip aquí arriba.",
    porque: "Lo urgente no se pierde entre pacientes.",
  },
  buscar: {
    titulo: "Encuentra a cualquiera",
    como: "Escribe nombre o número de historia en «Buscar paciente o HC…».",
    cuando: "Cuando la lista crezca.",
    porque: "La lista va por actividad; buscar es lo más rápido.",
  },
  tarjeta: {
    titulo: "La tarjeta del paciente",
    como: "El botón cambia solo: Planificar, Reanudar o Informe.",
    cuando: "Para retomar justo donde lo dejaste.",
    porque: "Ves paso, riesgo y progreso sin abrir nada.",
  },
  ficha: {
    titulo: "La ficha del paciente",
    como: "Toca la tarjeta: las columnas se abren hacia la derecha.",
    cuando: "Para ver casos, estudios de imagen y sesiones guardadas.",
    porque: "Todo su historial en una sola pantalla.",
  },
  hoy: {
    titulo: "Tu día",
    como: "Mira «Hoy», la actividad reciente y los accesos.",
    cuando: "Al empezar la jornada.",
    porque: "Sabes qué está en curso sin abrir pacientes.",
  },
  atajos: {
    titulo: "Atajos y tu menú",
    como: "Ctrl+K (⌘K en Mac) abre la paleta de mandos; tu menú: avatar, contraseña y este recorrido.",
    cuando: "Cuando quieras ir rápido o repasar.",
    porque: "Menos clics; el recorrido siempre está a mano.",
  },
};

/** En el orden de la ilustración: visor, pasos, panel, dónde estás, guardar. */
export const ZONAS_QUIROFANO: Explicacion[] = [
  {
    titulo: "El visor",
    como: "Arrastra para rotar, rueda para acercar; arriba eliges vista y desde dónde mirar.",
    cuando: "Siempre: es tu mesa de trabajo.",
    porque: "Lo que ves cambia con cada paso.",
  },
  {
    titulo: "Los pasos",
    como: "Toca un número del dock o pulsa 1–8.",
    cuando: "Para avanzar por el flujo o volver atrás.",
    porque: "8 pasos en 5 tramos: preparar, detectar, medir, dispositivo, informe.",
  },
  {
    titulo: "El panel del paso",
    como: "A la derecha; pliégalo con P.",
    cuando: "Para hacer lo propio de cada paso.",
    porque: "Solo ves lo que necesitas en ese momento.",
  },
  {
    titulo: "Dónde estás",
    como: "Arriba a la izquierda: paciente, caso y riesgo; la flecha vuelve a Pacientes.",
    cuando: "Cuando dudes de qué caso tienes abierto.",
    porque: "Evita trabajar sobre el paciente equivocado.",
  },
  {
    titulo: "Guardar y atajos",
    como: "«Guardar progreso» crea una sesión; «Captura» y «Grabar» guardan imagen o vídeo.",
    cuando: "Antes de salir o al terminar algo importante.",
    porque: "Lo retomas luego con «Reanudar» desde la ficha.",
  },
];

/** Aviso al final de la zona 2. */
export const AVISO_PISTAS = "Cuando entres a cada paso, te saldrá una pista corta.";

/** Pistas de primera vez, una por paso (clave = posición 1–8). */
export const PISTAS_PASO: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, Explicacion> = {
  1: {
    titulo: "Sube el estudio",
    como: "Arrastra la carpeta o el ZIP del DICOM.",
    cuando: "Al empezar un caso.",
    porque: "Todo el análisis sale de esta serie.",
  },
  2: {
    titulo: "El árbol vascular",
    como: "Revisa la malla; ajusta el umbral si falta o sobra vaso.",
    cuando: "Justo después de cargar.",
    porque: "Medidas y detección dependen de esta malla.",
  },
  3: {
    titulo: "Cinco candidatos",
    como: "Toca cada uno y acepta solo los que sean lesión.",
    cuando: "Antes de medir.",
    porque: "La lista siempre trae 5: no es un veredicto.",
  },
  4: {
    titulo: "Mide el aneurisma",
    como: "Marca cuello y saco sobre la malla.",
    cuando: "Con la lesión aceptada.",
    porque: "Cuello, saco y cociente alimentan la decisión.",
  },
  5: {
    titulo: "Decisión terapéutica",
    como: "Indica estado y contexto clínico; verás PHASES o JSDB según el caso, y la geometría.",
    cuando: "Antes de elegir dispositivo.",
    porque: "Propone clipaje o endovascular con escalas publicadas; decides tú.",
  },
  6: {
    titulo: "Prueba un clip",
    como: "Elige uno y mira cómo cierra el cuello.",
    cuando: "Cuando ya tienes las medidas.",
    porque: "Ves el resultado antes de entrar a quirófano.",
  },
  7: {
    titulo: "Clip a medida (opcional)",
    como: "Revisa la especificación, descarga el dossier y registra el pedido al taller.",
    cuando: "Si ningún clip de catálogo encaja.",
    porque: "La pieza tarda semanas; el informe no espera.",
  },
  8: {
    titulo: "El informe",
    como: "Revisa y exporta el PDF.",
    cuando: "Al cerrar la planificación.",
    porque: "Deja constancia y se comparte con el equipo.",
  },
};

/** «En 20 segundos»: una tarjeta por tramo (color `--tramo-*`). */
export const TRAMOS_INTRO: ReadonlyArray<{
  tramo: "preparar" | "detectar" | "medir" | "dispositivo";
  verbo: string;
  linea: string;
}> = [
  { tramo: "preparar", verbo: "Preparar", linea: "Sube el DICOM y saca el árbol vascular en 3D." },
  { tramo: "detectar", verbo: "Detectar", linea: "Cinco candidatos a lesión; tú aceptas los que lo sean." },
  { tramo: "medir", verbo: "Medir", linea: "Cuello, saco y cociente, y la decisión apoyada en escalas publicadas." },
  { tramo: "dispositivo", verbo: "Dispositivo", linea: "Prueba clips sobre el cuello y cierra con el informe en PDF." },
];

export const PRIMEROS_PASOS: ReadonlyArray<{
  texto: string;
  /** Dónde ocurre, legible. */
  lugar: string;
  accion: "nuevo-paciente" | "nuevo-caso" | "subir-dicom" | "prueba-rapida";
  cta: string;
}> = [
  { texto: "Crear tu primer paciente", lugar: "Pacientes · Nuevo paciente", accion: "nuevo-paciente", cta: "Nuevo paciente" },
  { texto: "Colgarle un caso", lugar: "Pacientes · Nuevo caso", accion: "nuevo-caso", cta: "Nuevo caso" },
  { texto: "Subir su DICOM y planificar", lugar: "Ficha del paciente · Planificar", accion: "subir-dicom", cta: "Planificar" },
  { texto: "¿Solo probar? Prueba rápida sin paciente", lugar: "Pacientes · Prueba rápida sin paciente", accion: "prueba-rapida", cta: "Prueba rápida" },
];

export const HOLA = {
  saludo: (nombre: string) => `Hola, ${nombre}.`,
  subtitulo: "Te enseñamos Prospective en 4 minutos.",
  agenda: ["Tu avatar", "El panel de pacientes", "El quirófano en 5 zonas"],
  empezar: "Empezar",
  ahoraNo: "Ahora no",
  saltar: "Saltar todo",
} as const;

export const AVATAR = {
  titulo: "Tu avatar",
  linea: "Así te verán en Prospective. Puedes cambiarlo cuando quieras desde tu menú.",
  desdeFoto: "Desde mi foto",
  mostrarFoto: "Mostrar mi foto",
  mostrarAvatar: "Mostrar mi avatar",
  masPiezas: "Más piezas",
} as const;

export const INTRO = {
  titulo: "En 20 segundos",
  cierre: "Ahora te enseñamos dónde está cada cosa.",
} as const;

export const LISTO = {
  saludo: (nombre: string) => `Listo, ${nombre}`,
  primerosPasos: "Primeros pasos sugeridos",
  irPacientes: "Ir a mis pacientes",
  repetir: "Repetir el recorrido",
} as const;
