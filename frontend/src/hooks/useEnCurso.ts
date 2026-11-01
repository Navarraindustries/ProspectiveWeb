/* Estado «en curso» de una acción asíncrona lanzada desde un botón (Reanudar,
   Abrir informe): el botón enseña «Abriendo…» y no admite un segundo clic hasta
   que la promesa se resuelve o se rechaza. */

import { useCallback, useEffect, useRef, useState } from "react";

export function useEnCurso(): [enCurso: boolean, lanzar: (accion: () => unknown) => void] {
  const [enCurso, setEnCurso] = useState(false);
  // Ref aparte del estado: dos clics en el mismo turno ven el estado viejo.
  const ocupado = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const lanzar = useCallback((accion: () => unknown) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setEnCurso(true);
    const fin = () => {
      ocupado.current = false;
      if (montado.current) setEnCurso(false);
    };
    let p: Promise<unknown>;
    try { p = Promise.resolve(accion()); } catch (e) { p = Promise.reject(e); }
    // El error lo gestiona quien lanza (toast en App); aquí solo se libera el botón.
    p.then(fin, fin);
  }, []);

  return [enCurso, lanzar];
}
