/* «Próximamente»: tres tarjetas de cristal con insignia, sin prometer fechas. */

import { glass } from "../../styles/glass";
import { Icon, type IconName } from "../Icon";
import { RevelarItem, Seccion } from "./Seccion";

const ITEMS: { icono: IconName; titulo: string; texto: string }[] = [
  { icono: "CLOUD", titulo: "SkullCloud", texto: "Almacenamiento y colaboración de casos en la nube entre centros." },
  { icono: "VRAR", titulo: "AR / VR", texto: "Exploración inmersiva de la anatomía vascular y el plan quirúrgico." },
  { icono: "CHART", titulo: "Analítica", texto: "Estadísticas agregadas de casos, dispositivos y resultados." },
];

export function Proximamente() {
  return (
    <Seccion id="proximamente" rotulo="Próximamente" titulo="Lo que viene">
      <ul className="proximo">
        {ITEMS.map((i) => (
          <RevelarItem
            key={i.titulo}
            as="li"
            data-glass
            className="proximo__tarjeta tarjeta-lente"
            style={{ ...glass("normal"), borderRadius: "var(--radius-card-lg)" }}
          >
            <div className="proximo__cabecera">
              <span className="proximo__icono"><Icon name={i.icono} size={20} /></span>
              <span className="stitch-label proximo__insignia">Próximamente</span>
            </div>
            <h3 className="proximo__titulo">{i.titulo}</h3>
            <p className="proximo__texto">{i.texto}</p>
          </RevelarItem>
        ))}
      </ul>
    </Seccion>
  );
}
