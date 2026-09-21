/* LandingScene — envoltorio de React para una escena Three.js de la landing.

   La clave es que **monta la escena al entrar en pantalla y la desmonta al
   salir**. La landing lleva seis escenas repartidas por el scroll y el hero
   suma dos más: si todas vivieran a la vez habría ocho contextos WebGL abiertos,
   por encima de lo que muchos navegadores conceden —y los que sobran los cierra
   el propio navegador, tumbando escenas al azar—. Además, esta página convive
   con el visor VTK de la aplicación, que necesita el suyo.

   Con la puerta de `IntersectionObserver` nunca hay más de un par vivos, y las
   que quedan fuera de la ventana no gastan GPU. El margen del observador es
   ajustado: suficiente para que la escena esté lista antes de asomar, sin
   arrastrar a montarse a las figuras vecinas que aún quedan lejos. */

import { useEffect, useRef } from "react";
import { mountScene, type SceneFactory } from "./sceneHost";

export function LandingScene({
  factory,
  fov,
  cameraPosition,
  className,
  style,
}: {
  factory: SceneFactory;
  fov?: number;
  cameraPosition?: [number, number, number];
  className?: string;
  style?: React.CSSProperties;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let teardown: (() => void) | null = null;
    const mount = () => { teardown ??= mountScene(host, { factory, fov, cameraPosition }); };
    const unmount = () => { teardown?.(); teardown = null; };

    /* Sin IntersectionObserver (navegadores muy viejos) se monta y ya: es peor
       gastar contexto que no enseñar la escena. */
    if (typeof IntersectionObserver === "undefined") {
      mount();
      return unmount;
    }

    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? mount() : unmount()),
      { rootMargin: "120px 0px" },
    );
    io.observe(host);

    return () => { io.disconnect(); unmount(); };
    // `factory` es un módulo estable importado arriba; no se re-crea por render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} aria-hidden="true" className={className} style={style} />;
}
