/* Iconografía de PROSPECTIVE: SVG propios dibujados a mano en una rejilla de 16.
   Antes eran glifos Unicode: cambiaban de peso y métrica según la fuente del
   sistema y no había manera de ilustrar conceptos nuevos (pedidos, taller…).
   Un trazo de 1,5 con extremos redondos y currentColor hereda el color del
   texto y se lee igual a 16 px en cualquier plataforma. */

import type { CSSProperties } from "react";

// Círculo como trazo, para mantener un solo <path> por icono.
const c = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const PATHS = {
  // Pasos del flujo
  STEP_PATIENT: "M3 3h10v10H3z",
  STEP_SEGMENT: `${c(8, 8, 5.5)}M8 5v6M5 8h6`,
  STEP_DETECT: `${c(8, 8, 5.5)}${c(8, 8, 2)}`,
  STEP_MORPHO: "M12 3H4l4 5-4 5h8",
  STEP_PLAN: "M8 2v12M2 8h12",
  STEP_EXPORT: "M3 3h10v10H3zM5.5 8h5",
  // Navegación y acciones globales
  HOME: "M2 8l6-5 6 5M4 7v6h8V7",
  EDIT: "M3 13l.5-3L10.5 3 13 5.5 6 12.5zM9 4.5L11.5 7",
  FOLDER: "M2 4.5h4l1.5 1.5H14v6.5H2z",
  DOC: "M3 4h10M3 8h10M3 12h7",
  SAVE: "M3 3h8l2 2v8H3zM5.5 3v3h4V3M5.5 13V9h5v4",
  PRINT: "M4.5 6V2.5h7V6M4.5 11.5h-2V6h11v5.5h-2M4.5 9.5h7v4h-7z",
  ATTACH: "M12.5 7.5L8 12a3 3 0 01-4.2-4.2l5-5a2 2 0 013 3L7 10.5a1 1 0 01-1.5-1.5L10 4.5",
  LINK: "M7 9a2.5 2.5 0 003.5 0l2-2A2.5 2.5 0 009 3.5L8 4.5M9 7a2.5 2.5 0 00-3.5 0l-2 2A2.5 2.5 0 007 12.5l1-1",
  REFRESH: "M13 8a5 5 0 11-1.5-3.5M13 2.5v3h-3",
  CLEAR: `${c(8, 8, 5.5)}M4 12L12 4`,
  UNDO: "M3 7h6a3.5 3.5 0 010 7H6M3 7l3-3M3 7l3 3",
  LOCK: "M4 7.5h8V14H4zM5.5 7.5V5a2.5 2.5 0 015 0v2.5",
  SEARCH: `${c(7, 7, 4.5)}M10.5 10.5L14 14`,
  AUDIT: "M4 2.5h8v11H4zM6 6h4M6 8.5h4M6 11h2",
  USER: `${c(8, 5.5, 2.5)}M3 14c0-3 2.2-4.5 5-4.5s5 1.5 5 4.5`,
  USERS: `${c(6, 5.5, 2.2)}M1.8 13.5c0-2.6 1.9-4 4.2-4s4.2 1.4 4.2 4M10.5 3.5a2.2 2.2 0 010 4.2M12 9.8c1.3.5 2.2 1.7 2.2 3.7`,
  // Barra lateral de planificación 3D
  CLIPS: `M5 2.5l6 7M11 2.5l-6 7${c(4.5, 12, 1.5)}${c(11.5, 12, 1.5)}`,
  FLOW_DIV: "M8 14V8M8 8L3.5 3M8 8l4.5-5M3.5 3v3M3.5 3h3M12.5 3v3M12.5 3h-3",
  STENT: "M5 2.5h6v11H5zM5 5.5h6M5 8h6M5 10.5h6",
  STENT_CL: "M5 2.5h6v11H5zM8 2.5v11",
  TRAJECTORY: "M2.5 13.5C5 13.5 4 4 8 4s3 9.5 5.5 9.5",
  CENTERLINE: "M2 9c2-4 3.5-4 5 0s3 4 5 0l2-2",
  MEASURE: "M2 8h12M2 5.5v5M14 5.5v5",
  CUT: "M3 3l10 10M3 13L13 3",
  SETTINGS: "M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6M10 3v4M6 9v4",
  // Médico / intraprocedimiento
  CLIP_PLACE: "M8 2.5v9M4.5 8L8 11.5 11.5 8M3 14h10",
  SEED: `${c(8, 8, 5.5)}${c(8, 8, 1)}`,
  GROWTH: "M8 13.5v-9M4.5 8L8 4.5 11.5 8M3 2.5h10",
  COIL: `${c(8, 6.5, 4.5)}M8 11v3M5.5 6.5a2.5 2.5 0 015 0`,
  BRAIN: "M8 3.5v9M8 4.5C8 3 6.5 2.5 5.5 3 4 3 3 4.5 3.5 6 2.5 6.8 2.5 8.5 3.5 9.2 3 10.8 4.2 12.5 5.8 12.5 7 13 8 12.5 8 11.5M8 4.5c0-1.5 1.5-2 2.5-1.5 1.5 0 2.5 1.5 2 3 1 .8 1 2.5 0 3.2.5 1.6-.7 3.3-2.3 3.3C9 13 8 12.5 8 11.5",
  // Visor
  CAMERA: `M2 5h3l1-1.5h4L11 5h3v8H2z${c(8, 8.5, 2.2)}`,
  RECORD: c(8, 8, 4.5),
  STOP: "M4.5 4.5h7v7h-7z",
  VIDEO: "M5 3.5l8 4.5-8 4.5z",
  MARK_PERF: "M8 2.5v11M2.5 8h11M4.5 4.5l7 7M11.5 4.5l-7 7",
  ANNOTATION: "M2.5 3h11v7.5H8l-3 3v-3H2.5z",
  ANGLE_MEAS: "M3 13.5h10M3 13.5L11 4M6.5 13.5a4 4 0 00-1-2.7",
  MEDICAL_SIGN: "M6 2.5h4V6h3.5v4H10v3.5H6V10H2.5V6H6z",
  // Visibilidad / MPR
  EYE: `M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8z${c(8, 8, 2)}`,
  EYE_HIDDEN: "M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8zM3 13L13 3",
  MPR_VIEW: "M2.5 2.5h11v11h-11zM8 2.5v11M2.5 8h11",
  OBLIQUE: "M8 2l6 6-6 6-6-6z",
  // Tema
  THEME_LIGHT: `${c(8, 8, 3)}M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1`,
  THEME_DARK: "M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z",
  // Estado
  STATUS_OK: "M3 8.5l3.5 3.5L13 4.5",
  STATUS_WARN: "M8 2.5L14 13H2zM8 6.5v3M8 11.5v.01",
  STATUS_FAIL: "M4 4l8 8M12 4l-8 8",
  WAIT: `${c(8, 8, 6)}M8 4.5V8l2.2 1.5`,
  HINT: `${c(8, 8, 5.5)}M8 7.5V11M8 5v.01`,
  // Contacto / web / meta
  MAIL: "M2 3.5h12v9H2zM2 4.5l6 4.5 6-4.5",
  PHONE: "M4 2.5h3l1 3-1.8 1.2a7 7 0 003.1 3.1L10.5 8l3 1v3a1.5 1.5 0 01-1.5 1.5A9.5 9.5 0 012.5 4 1.5 1.5 0 014 2.5z",
  GLOBE: `${c(8, 8, 6)}M2 8h12M8 2c2 2 2.5 4 2.5 6S10 12 8 14M8 2C6 4 5.5 6 5.5 8S6 12 8 14`,
  PIN: `M8 14.5s4.5-4.2 4.5-7.5a4.5 4.5 0 00-9 0c0 3.3 4.5 7.5 4.5 7.5z${c(8, 7, 1.6)}`,
  INFO: `${c(8, 8, 5.5)}M8 7.5V11M8 5v.01`,
  BOOK: "M3 2.5h8.5A1.5 1.5 0 0113 4v9.5H4.5A1.5 1.5 0 013 12zM3 12a1.5 1.5 0 011.5-1.5H13",
  CHART: "M2.5 13.5h11M4.5 13V8M8 13V3.5M11.5 13V6",
  CLOUD: "M4.5 12.5a3 3 0 01-.4-6A4 4 0 0112 7a2.8 2.8 0 01-.5 5.5z",
  SPARKLE: "M8 2c.5 3.5 2.5 5.5 6 6-3.5.5-5.5 2.5-6 6-.5-3.5-2.5-5.5-6-6 3.5-.5 5.5-2.5 6-6z",
  VRAR: "M2 5.5h12V11h-3.5L9 9H7l-1.5 2H2z",
  SHIELD: "M8 2l5 1.8v4C13 11 10.8 13 8 14 5.2 13 3 11 3 7.8v-4z",
  DATABASE: "M3 4c0-1 2.2-1.8 5-1.8S13 3 13 4s-2.2 1.8-5 1.8S3 5 3 4zM3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8S13 9 13 8",
  ARROW_RIGHT: "M2.5 8h11M9.5 4l4 4-4 4",
  ARROW_UP_RIGHT: "M4.5 11.5l7-7M5.5 4.5h6v6",
  RULER: "M1.5 6h13v4h-13zM4.5 6v2M7.5 6v2.5M10.5 6v2M13 6v1",
  TARGET: `${c(8, 8, 6)}${c(8, 8, 3)}`,
  // Gestión (F2)
  PATIENTS: `${c(6, 5, 2.2)}M1.8 13c0-2.5 1.8-3.8 4.2-3.8s4.2 1.3 4.2 3.8M12 6v5M9.5 8.5h5`,
  STUDIES: "M2.5 2.5h11v11h-11zM2.5 6h11M6 6v7.5",
  ORDER: "M4 2.5h8v11H4zM6.5 2.5v-1h3v1M6 7h4M6 10h2.5",
  WORKSHOP: "M13 3.5a3.2 3.2 0 01-4.3 3.8L4 12a1.4 1.4 0 01-2-2l4.7-4.7A3.2 3.2 0 0110.5 1.5L8.7 3.3l.8 1.9 1.9.8z",
  // Reloj de arena: «cuenta por revisar», distinto del reloj de WAIT (espera de una tarea).
  PENDING: "M4 2.5h8M4 13.5h8M4.5 2.5c0 3 3.5 3.5 3.5 5.5S4.5 10.5 4.5 13.5M11.5 2.5c0 3-3.5 3.5-3.5 5.5s3.5 2.5 3.5 5.5",
  SHARE: `${c(4, 8, 1.7)}${c(12, 3.8, 1.7)}${c(12, 12.2, 1.7)}M5.5 7.1l5-2.4M5.5 8.9l5 2.4`,
  RESUME: "M4.5 3l8 5-8 5z",
  OPEN: "M9 2.5h4.5V7M13.5 2.5l-6 6M11 9.5v4H2.5V5h4",
  DELETE: "M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.7 9h6.6l.7-9M6.8 7v4M9.2 7v4",
  RENAME: "M2.5 13.5h11M3.5 10.5L4 8l6-6 2 2-6 6z",
  UPLOAD: "M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 10.5v3h11v-3",
  LOGOUT: "M6.5 2.5h-4v11h4M6 8h8M11 5l3 3-3 3",
  PASSWORD: `${c(5, 8, 2.5)}M7.5 8H14M12 8v2.5`,
  MENU: "M2.5 4h11M2.5 8h11M2.5 12h11",
  FILTER: "M2 3h12L9.5 8.5V13l-3-1.5V8.5z",
  EXPORT: "M8 2.5v8M4.5 7L8 10.5 11.5 7M2.5 13.5h11",
  PLUS: "M8 3v10M3 8h10",
  CLOSE: "M3.5 3.5l9 9M12.5 3.5l-9 9",
  BACK: "M13.5 8h-11M6.5 4l-4 4 4 4",
  CHEVRON_RIGHT: "M6 3l5 5-5 5",
  CHEVRON_DOWN: "M3 6l5 5 5-5",
} satisfies Record<string, string>;

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

// Grabar y detener se leen como formas rellenas; el resto es de contorno.
const FILLED: ReadonlySet<IconName> = new Set<IconName>(["RECORD", "STOP"]);

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, color, style }: IconProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={FILLED.has(name) ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: color ?? "currentColor", flexShrink: 0, userSelect: "none", ...style }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
