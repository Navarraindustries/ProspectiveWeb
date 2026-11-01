/* «Qué es»: el texto y, al lado, el render oblicuo de Case 3 en un marco de
   cristal con un halo que late sobre la lesión. */

import { glass } from "../../styles/glass";
import { HaloLesion } from "./HaloLesion";
import { RevelarItem, Seccion } from "./Seccion";

export function QueEs() {
  return (
    <Seccion id="que-es" rotulo="Qué es" titulo="Una mesa de quirófano hecha de imagen">
      <div className="que-es">
        <div className="que-es__textos">
          <RevelarItem>
            <h3 className="sec__subtitulo">Del DICOM a la decisión</h3>
            <p className="sec__texto">
              Prospective convierte la angiografía del paciente en un modelo 3D medible y propone la vía
              de tratamiento con criterios explícitos.
            </p>
          </RevelarItem>
          <RevelarItem>
            <h3 className="sec__subtitulo">Pensada para el servicio</h3>
            <p className="sec__texto">
              Pacientes, casos, estudios y sesiones reanudables: el trabajo del neurocirujano continúa
              donde lo dejó. Puedes registrar al paciente con iniciales o un código.
            </p>
          </RevelarItem>
        </div>
        <RevelarItem
          as="figure"
          className="que-es__figura"
          data-glass
          style={{ ...glass("normal"), borderRadius: "var(--radius-xl)" }}
        >
          <div className="que-es__marco" data-theme="dark" data-escenario="oscuro">
            <img
              src="/media/landing/secciones/case3-oblicua.webp"
              width={800}
              height={600}
              loading="lazy"
              decoding="async"
              alt="Malla 3D de Case 3 (3DRA) segmentada por Prospective, con la lesión del tronco basilar marcada en rojo"
            />
            <HaloLesion x={60} y={40} />
          </div>
          <figcaption className="que-es__pie">Case 3 · 3DRA · malla de la segmentación automática</figcaption>
        </RevelarItem>
      </div>
    </Seccion>
  );
}
