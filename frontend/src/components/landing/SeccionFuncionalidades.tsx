/* «Funcionalidades»: rejilla bento de cristal. Tres tarjetas grandes con la
   imagen real del producto y seis pequeñas con icono y una línea. */

import { glass } from "../../styles/glass";
import { Icon, type IconName } from "../Icon";
import { HaloLesion } from "./HaloLesion";
import { RevelarItem, Seccion } from "./Seccion";

type Imagen = { src: string; ancho: number; alto: number; alt: string; halo?: boolean };
type Tarjeta =
  | { area: string; titulo: string; linea: string; imagen: Imagen }
  | { area: string; titulo: string; linea: string; icono: IconName };

const TARJETAS: Tarjeta[] = [
  {
    area: "seg", titulo: "Segmentación 3D automática",
    linea: "El árbol vascular sale del DICOM sin pintarlo a mano.",
    imagen: { src: "/media/landing/secciones/case3-frontal.webp", ancho: 800, alto: 600, alt: "Árbol vascular completo de Case 3 visto de frente" },
  },
  { area: "morfo", titulo: "Morfometría del saco y del cuello", linea: "Cuello, altura, Ø máximo e índices de forma, en milímetros.", icono: "STEP_MORPHO" },
  { area: "motor", titulo: "Motor de decisión: PHASES, JSDB y geometría", linea: "Tres criterios por separado; ninguno se esconde en una puntuación.", icono: "STEP_PLAN" },
  {
    area: "detec", titulo: "Detección por calibre, cociente y curvatura",
    linea: "Candidatos numerados; cada uno dice qué canal lo encontró.",
    imagen: { src: "/media/landing/secciones/case3-saco.webp", ancho: 800, alto: 600, alt: "Primer plano de la lesión del tronco basilar de Case 3, marcada en rojo", halo: true },
  },
  { area: "prueba", titulo: "Prueba de clips, coils y stents", linea: "Sobre la malla del paciente, antes de entrar a quirófano.", icono: "CLIPS" },
  { area: "informe", titulo: "Informe clínico", linea: "Medidas, decisión y dispositivo en un documento.", icono: "STEP_EXPORT" },
  {
    area: "clip", titulo: "Clip a medida para fabricar",
    linea: "La mordaza se ajusta al cuello medido y el pedido va al taller.",
    imagen: { src: "/media/landing/clips/navarro-t4-fenestrado.webp", ancho: 600, alto: 600, alt: "Clip NAVARRO™ T4 fenestrado" },
  },
  { area: "sesiones", titulo: "Sesiones guardadas", linea: "Se reanudan en el paso donde se dejaron.", icono: "SAVE" },
  { area: "pacientes", titulo: "Pacientes, casos y estudios", linea: "Ordenados como trabaja el servicio.", icono: "PATIENTS" },
];

export function Funcionalidades() {
  return (
    <Seccion id="funcionalidades" rotulo="Funcionalidades" titulo="Lo que hay dentro">
      <ul className="bento">
        {TARJETAS.map((t) => (
          <RevelarItem
            key={t.area}
            as="li"
            data-glass
            data-area={t.area}
            className={`bento__tarjeta ${"imagen" in t ? "bento__tarjeta--grande" : "bento__tarjeta--pequena"}`}
            style={{ ...glass("normal"), borderRadius: "var(--radius-card-lg)" }}
          >
            {"imagen" in t ? (
              <div className="bento__imagen" data-theme="dark">
                <img
                  src={t.imagen.src}
                  width={t.imagen.ancho}
                  height={t.imagen.alto}
                  loading="lazy"
                  decoding="async"
                  alt={t.imagen.alt}
                />
                {t.imagen.halo && <HaloLesion x={50} y={50} />}
              </div>
            ) : (
              <span className="bento__icono"><Icon name={t.icono} size={20} /></span>
            )}
            <div className="bento__texto">
              <h3 className="bento__titulo">{t.titulo}</h3>
              <p className="bento__linea">{t.linea}</p>
            </div>
          </RevelarItem>
        ))}
      </ul>
      <p className="sec__nota">
        Cada resultado dice de dónde viene y cuánto se puede confiar en él. La herramienta propone; el
        cirujano decide.
      </p>
    </Seccion>
  );
}
