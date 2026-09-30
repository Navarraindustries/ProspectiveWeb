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
   principal no era la malla.

   GRABAR es otra cosa. `captureNextImage` codifica un PNG y lo devuelve en
   una promesa: a 30 fotogramas por segundo y cinco paneles no da. Para vídeo
   está `grab`: dibuja la ventana y copia su lienzo a un contexto 2D EN LA
   MISMA TAREA, antes de que el navegador componga y descarte el búfer. Es
   síncrono y no codifica nada. */

export type Rect = { x: number; y: number; w: number; h: number };

/** Copia el panel, recién dibujado, al contexto dado. False si no pudo. */
export type GrabFn = (ctx: CanvasRenderingContext2D, rect: Rect) => boolean;

export type CaptureFn = (() => Promise<string | null>) & {
  /** Solo en las capturas de ventanas de vtk: lo que usa el grabador. */
  grab?: GrabFn;
};

/** Lo mínimo que se le pide a una ventana de vtk.js para capturarla. */
export interface CapturableWindow {
  getApiSpecificRenderWindow?: () => {
    captureNextImage?: (fmt: string) => Promise<string>;
    getCanvas?: () => HTMLCanvasElement | null;
  } | null;
}

/** Una función que devuelve el PNG (data URL) de esa ventana, o null, y que
 *  además sabe copiarse a un lienzo 2D para grabar (`grab`).
 *
 *  `render` tiene que dibujar de verdad: la promesa de `captureNextImage` no
 *  se resuelve hasta que hay un render, así que sin ella se queda colgada. */
export function captureRenderWindow(win: CapturableWindow | (() => CapturableWindow | null), render: () => void): CaptureFn {
  const ventana = () => (typeof win === "function" ? win() : win);
  const capture: CaptureFn = async () => {
    try {
      const api = ventana()?.getApiSpecificRenderWindow?.();
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
  capture.grab = (ctx, rect) => {
    try {
      const canvas = ventana()?.getApiSpecificRenderWindow?.()?.getCanvas?.();
      if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
      render();
      ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h);
      return true;
    } catch {
      return false;   // un panel que no se deja copiar deja su hueco en negro
    }
  };
  return capture;
}
