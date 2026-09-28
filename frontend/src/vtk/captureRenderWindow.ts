/* Sacar un PNG de una ventana de render de vtk.js.

   No vale leer el lienzo cuando a uno le apetece: vtk.js crea el contexto con
   `preserveDrawingBuffer: false` (Rendering/OpenGL/RenderWindow), así que el
   búfer se descarta en cuanto el navegador compone el fotograma y un
   `canvas.toDataURL()` posterior devuelve negro. La forma sostenida es pedir
   la imagen del SIGUIENTE render y provocarlo: eso es `captureNextImage`.

   Lo mismo sirve para `vtkFullScreenRenderWindow` y para
   `vtkGenericRenderWindow`: las dos publican la ventana específica de la API
   por `getApiSpecificRenderWindow()`. Estaba escrito a mano dentro de
   MeshView, y los otros tres visores —cortes, MIP y oblicuo— no sabían
   capturarse, así que el informe salía sin imagen en cuanto el panel
   principal no era la malla. */

export type CaptureFn = () => Promise<string | null>;

/** Lo mínimo que se le pide a una ventana de vtk.js para capturarla. */
export interface CapturableWindow {
  getApiSpecificRenderWindow?: () => { captureNextImage?: (fmt: string) => Promise<string> } | null;
}

/** Una función que devuelve el PNG (data URL) de esa ventana, o null.
 *
 *  `render` tiene que dibujar de verdad: la promesa de `captureNextImage` no
 *  se resuelve hasta que hay un render, así que sin ella se queda colgada. */
export function captureRenderWindow(win: CapturableWindow, render: () => void): CaptureFn {
  return async () => {
    try {
      const api = win.getApiSpecificRenderWindow?.();
      if (!api?.captureNextImage) return null;
      const pendiente = api.captureNextImage("image/png");
      render();
      return await pendiente;
    } catch (err) {
      // Una captura fallida no puede tumbar lo que la pidió: el informe y la
      // galería siguen sin esa imagen.
      console.warn("captura de la ventana de vtk fallida", err);
      return null;
    }
  };
}
