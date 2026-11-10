/* Estado del onboarding: única fuente para el flujo de bienvenida y las pistas.
   El estado vive en el servidor (`user.onboarding`); aquí se serializan las
   escrituras (siempre el objeto completo, sobre el último estado conocido) y
   se decide el arranque automático.

   Fuera del proveedor, `useOnboarding()` devuelve un valor INERTE (nada se
   activa ni se guarda), para que componentes como el menú de usuario puedan
   renderizarse en tests sin envolverlos. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { OnboardingState } from "../api/types";
import { useAuth } from "../store/auth";
import { FlujoOnboarding } from "./FlujoOnboarding";

export type Momento = "hola" | "avatar" | "intro" | "pacientes" | "quirofano" | "listo";

export interface OnboardingApi {
  estado: OnboardingState;
  activo: boolean;
  momento: Momento | null;
  empezar(): void;
  ir(m: Momento): void;
  terminar(como: "completado" | "saltado"): Promise<void>;
  marcarPista(paso: number): Promise<void>;
  setPistasActivas(v: boolean): Promise<void>;
  reiniciarPistas(): Promise<void>;
  cerrarTarjeta(): Promise<void>;
  descartarInvitacion(): Promise<void>;
}

const POR_DEFECTO: OnboardingState = {
  estado: "pendiente", fecha: null, pistas_vistas: [], pistas_activas: true, tarjeta_cerrada: false,
};

const completar = (s: OnboardingState | undefined): OnboardingState => ({ ...POR_DEFECTO, ...(s ?? {}) });

const INERTE: OnboardingApi = {
  estado: POR_DEFECTO,
  activo: false,
  momento: null,
  empezar: () => {},
  ir: () => {},
  terminar: async () => {},
  marcarPista: async () => {},
  setPistasActivas: async () => {},
  reiniciarPistas: async () => {},
  cerrarTarjeta: async () => {},
  descartarInvitacion: async () => {},
};

const OnboardingContext = createContext<OnboardingApi>(INERTE);

export function useOnboarding(): OnboardingApi {
  return useContext(OnboardingContext);
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const delServidor = completar(user?.onboarding);
  const [estado, setEstado] = useState<OnboardingState>(delServidor);
  const [momento, setMomento] = useState<Momento | null>(null);
  const ultimo = useRef<OnboardingState>(estado); // último estado pedido (base de la siguiente escritura)
  const cola = useRef<Promise<void>>(Promise.resolve());
  const pendientes = useRef(0);
  const arrancado = useRef(false); // una vez por carga de página, aunque StrictMode repita el efecto

  // Si el servidor trae otro estado y no hay escrituras en vuelo, lo adoptamos.
  const clave = JSON.stringify(delServidor);
  useEffect(() => {
    if (pendientes.current > 0) return;
    const nuevo = JSON.parse(clave) as OnboardingState;
    ultimo.current = nuevo;
    setEstado(nuevo);
  }, [clave]);

  const escribir = useCallback((cambio: (s: OnboardingState) => OnboardingState): Promise<void> => {
    const siguiente = cambio(ultimo.current);
    ultimo.current = siguiente;
    setEstado(siguiente);
    pendientes.current += 1;
    const tarea = cola.current.then(async () => {
      try {
        await api.saveOnboarding(siguiente);
        await refreshUser();
      } catch {
        // Sin red o sin servidor: el flujo sigue; el estado se reintentará en la siguiente escritura.
      } finally {
        pendientes.current -= 1;
      }
    });
    cola.current = tarea;
    return tarea;
  }, [refreshUser]);

  const empezar = useCallback(() => {
    setMomento("hola");
    // Cerrar la pestaña a medias no relanza: se guarda «saltado» ya; al terminar bien se sobrescribe.
    void escribir((s) => ({ ...s, estado: "saltado", fecha: new Date().toISOString() }));
  }, [escribir]);

  useEffect(() => {
    if (arrancado.current || delServidor.estado !== "pendiente") return;
    arrancado.current = true;
    empezar();
  }, [delServidor.estado, empezar]);

  const terminar = useCallback((como: "completado" | "saltado") => {
    setMomento(null);
    return escribir((s) => ({ ...s, estado: como, fecha: new Date().toISOString() }));
  }, [escribir]);

  const valor = useMemo<OnboardingApi>(() => ({
    estado,
    activo: momento !== null,
    momento,
    empezar,
    ir: setMomento,
    terminar,
    marcarPista: (paso) => escribir((s) => {
      const vistas = s.pistas_vistas ?? [];
      return vistas.includes(paso) ? s : { ...s, pistas_vistas: [...vistas, paso].sort((a, b) => a - b) };
    }),
    setPistasActivas: (v) => escribir((s) => ({ ...s, pistas_activas: v })),
    reiniciarPistas: () => escribir((s) => ({ ...s, pistas_vistas: [] })),
    cerrarTarjeta: () => escribir((s) => ({ ...s, tarjeta_cerrada: true })),
    descartarInvitacion: () => escribir((s) => ({ ...s, estado: "saltado", fecha: new Date().toISOString() })),
  }), [estado, momento, empezar, terminar, escribir]);

  return (
    <OnboardingContext.Provider value={valor}>
      {children}
      <FlujoOnboarding />
    </OnboardingContext.Provider>
  );
}
