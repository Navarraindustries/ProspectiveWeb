/* «¿Ha llegado ya a la pantalla?» para no pedir 60 imágenes con JWT de golpe al
   abrir una lista larga de pacientes: cada tarjeta pide la suya cuando se acerca. */

import { useEffect, useState, type RefObject } from "react";

/** `true` en cuanto el elemento entra (con `rootMargin` de adelanto) en el
 *  viewport, y se queda `true`: una imagen ya cargada no se descarta al
 *  desplazarse. Sin IntersectionObserver (jsdom, navegadores viejos) devuelve
 *  `true` de inmediato: mejor pedir todo que no mostrar nada. */
export function useVisible(ref: RefObject<Element | null>, rootMargin = "320px"): boolean {
  const sinObservador = typeof IntersectionObserver === "undefined";
  const [visible, setVisible] = useState(sinObservador);

  useEffect(() => {
    if (visible || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        setVisible(true);
        obs.disconnect();
      }
    }, { rootMargin });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, rootMargin, visible]);

  return visible;
}
