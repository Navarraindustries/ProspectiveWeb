/* La ventana de vtk.js a pantalla completa solo escucha `window.resize`.
   Cuando lo que cambia es el RECUADRO —ocultar o mostrar los cortes con
   «CORTES», abrir un panel— el lienzo se quedaba con el tamaño anterior:
   la escena ocupaba media altura, en blanco, y dejaba de responder hasta
   cambiar de paso. Los cortes 2D ya vigilaban su recuadro; esto hace lo mismo
   para la escena 3D y el volumen. */

export interface Resizable {
  resize(): void;
  getRenderWindow(): { render(): void };
}

/** Redimensiona y repinta `fsrw` cada vez que cambia el tamaño de `container`.
 *  Devuelve la función que deja de vigilarlo. */
export function followContainer(container: HTMLElement, fsrw: Resizable): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  let frame = 0;
  const ro = new ResizeObserver(() => {
    // Un cambio de recuadro dispara varias notificaciones seguidas: basta con
    // la última, en el siguiente cuadro.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // Con el recuadro a 0 (mientras la escena se reconstruye, o plegado)
      // no se toca nada: vtk.js calcula el aspecto como 0/0 y el siguiente
      // resetCamera deja la cámara en NaN — pantalla negra y «AZ NaN°» al
      // desplegar el stent. Cuando vuelva a tener tamaño llegará otro aviso.
      const r = container.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      try {
        fsrw.resize();
        fsrw.getRenderWindow().render();
      } catch { /* la ventana ya se borró */ }
    });
  });
  ro.observe(container);
  return () => { cancelAnimationFrame(frame); ro.disconnect(); };
}
