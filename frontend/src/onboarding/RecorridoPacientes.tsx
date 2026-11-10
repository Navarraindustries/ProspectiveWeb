/* Momento 4 del onboarding: recorrido con focos sobre la página REAL de
   Pacientes (spec §4.2, §4.5). Navega allí, espera a que la lista haya cargado
   y entonces fija las paradas: las opcionales sin objetivo (avisos, «Hoy» en
   móvil) se quitan ya, para que el contador diga 8 y no 9. El texto se adapta
   al rol (Administración) y a si se ven las pestañas.
   Salir de Pacientes a medias (Atrás, un enlace dentro del foco) termina el
   onboarding como «saltado» y retira el velo en el acto. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { SCREEN_PATH } from "../store/nav";
import { PARADAS_PACIENTES } from "./copy";
import { useOnboarding } from "./OnboardingProvider";
import { Burbuja } from "./tour/Burbuja";
import { Foco } from "./tour/Foco";
import { resolverObjetivo } from "./tour/resolverObjetivo";
import { useRecorrido, type Parada } from "./tour/useRecorrido";
import "./onboarding.css";

/** Frases que solo se añaden si aplican (caben en el tope de «Cómo» con su base). */
export const LINEA_ADMIN = " Como admin, abajo tienes «Administración».";
export const LINEA_PESTANAS = " Las pestañas filtran: míos o compartidos.";

const ESQUEMA_FICHA = ["Paciente", "Casos", "Estudios de imagen", "Sesiones guardadas", "Vista previa"];
/** Cada cuánto se mira si la página ya está lista, y cuánto se espera como mucho. */
const SONDEO_MS = 50;
const ESPERA_MAX_MS = 4000;

function EsquemaFicha() {
  return (
    <ol className="ob-esquema" aria-label="Cómo se organiza la ficha">
      {ESQUEMA_FICHA.map((t) => <li key={t}>{t}</li>)}
    </ol>
  );
}

function construirParadas(admin: boolean, conPestanas: boolean): Parada[] {
  const P = PARADAS_PACIENTES;
  const tarjeta = ["tarjeta-0", "tarjeta-ejemplo"];
  const todas: Parada[] = [
    { id: "secciones", objetivos: ["nav-secciones", "nav-hamburguesa"],
      explicacion: admin ? { ...P.secciones, como: P.secciones.como + LINEA_ADMIN } : P.secciones },
    { id: "crear", objetivos: ["acciones-crear", "acciones-mas"], explicacion: P.crear },
    { id: "prueba", objetivos: ["accion-prueba", "acciones-mas"], explicacion: P.prueba },
    { id: "avisos", objetivos: ["avisos"], explicacion: P.avisos, opcional: true },
    { id: "buscar", objetivos: ["buscar"],
      explicacion: conPestanas ? { ...P.buscar, como: P.buscar.como + LINEA_PESTANAS } : P.buscar },
    { id: "tarjeta", objetivos: tarjeta, explicacion: P.tarjeta },
    { id: "ficha", objetivos: tarjeta, explicacion: P.ficha, extra: <EsquemaFicha /> },
    { id: "hoy", objetivos: ["hoy"], explicacion: P.hoy, opcional: true },
    { id: "atajos", objetivos: ["atajos", "acciones-mas"], explicacion: P.atajos },
  ];
  // Lo opcional que no está ahora no cuenta en «Parada N de M».
  return todas.filter((p) => !p.opcional || resolverObjetivo(p.objetivos) !== null);
}

/** La página de Pacientes ya pintó su lista (no quedan esqueletos de carga). */
function paginaLista(): boolean {
  return !!document.querySelector('[data-tour="buscar"]') && !document.querySelector('.pt-grid[aria-busy="true"]');
}

const esPacientes = (ruta: string) => ruta.replace(/\/+$/, "") === SCREEN_PATH.patients;

export function RecorridoPacientes({ onFin }: { onFin: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { terminar } = useOnboarding();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const enPacientes = esPacientes(pathname);
  const [paradas, setParadas] = useState<Parada[] | null>(null);
  const [acabado, setAcabado] = useState(false);
  const hecho = useRef(false);
  const navegado = useRef(false);

  const acabar = useCallback((como: "completado" | "saltado") => {
    if (hecho.current) return;
    hecho.current = true;
    setAcabado(true);
    if (como === "completado") onFin();
    else void terminar("saltado");
  }, [onFin, terminar]);

  // Una sola vez: ir a Pacientes si no se está ya (la ficha /app/pacientes/<id> no vale).
  useEffect(() => {
    if (navegado.current) return;
    navegado.current = true;
    if (!enPacientes) navigate(SCREEN_PATH.patients);
  }, [enPacientes, navigate]);

  // En Pacientes, esperar a que la lista cargue (o a que pase el tope) y fijar las paradas.
  useEffect(() => {
    if (paradas || acabado || !enPacientes) return;
    const inicio = Date.now();
    const id = window.setInterval(() => {
      if (!paginaLista() && Date.now() - inicio < ESPERA_MAX_MS) return;
      window.clearInterval(id);
      const conPestanas = !!document.querySelector('[data-tour="buscar"] [role="tablist"]');
      setParadas(construirParadas(admin, conPestanas));
    }, SONDEO_MS);
    return () => window.clearInterval(id);
  }, [paradas, acabado, enPacientes, admin]);

  // Ya en marcha, cualquier salida de Pacientes cierra el onboarding.
  useEffect(() => {
    if (paradas && !enPacientes) acabar("saltado");
  }, [paradas, enPacientes, acabar]);

  if (acabado || !paradas || !enPacientes) return null;
  return <Focos paradas={paradas} onTerminar={acabar} />;
}

function Focos({ paradas, onTerminar }: { paradas: Parada[]; onTerminar: (como: "completado" | "saltado") => void }) {
  const r = useRecorrido(paradas, { onTerminar });
  return (
    <>
      <Foco rect={r.rect} />
      <Burbuja
        explicacion={r.parada.explicacion}
        indice={r.indice}
        total={r.total}
        onSiguiente={r.siguiente}
        onAnterior={r.anterior}
        onSaltar={r.saltar}
        extra={r.parada.extra}
        rect={r.rect}
      />
    </>
  );
}
