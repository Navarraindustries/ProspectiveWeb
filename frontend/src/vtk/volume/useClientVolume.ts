/* useClientVolume — una copia del volumen en el navegador, como vtkImageData.

   Dos niveles y un solo objeto visible a la vez: el grueso llega en ~2 s y
   permite navegar; el completo se construye cuando han llegado TODOS sus
   bloques y sustituye al grueso de golpe. Reemplazar el vtkImageData por
   bloques obligaría a resubir la textura entera (226 MB para 384³) doce
   veces; un solo cambio es lo que no da tirones. */

import { useEffect, useRef, useState } from "react";
import type vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import type { VolumeMeta } from "../../api/types";
import { loadCoarse, loadFull } from "./volumeLoader";

// vtk.js se carga aquí bajo demanda (import dinámico de imageData.ts), no en
// el nivel superior: este hook vive en Viewer, que no debe arrastrar vtk.js
// al paquete de entrada.

export function useClientVolume(sid: string | null, meta: VolumeMeta | null, currentZ: number) {
  const [image, setImage] = useState<vtkImageData | null>(null);
  const [level, setLevel] = useState<"coarse" | "full" | null>(null);
  // Stride en el plano del nivel visible: el completo lo lleva >1 en volúmenes
  // muy grandes y el visor lo rotula como resolución reducida.
  const [stride, setStride] = useState(1);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El corte actual solo decide el ORDEN de los bloques al empezar; cambiar
  // de corte no reinicia la descarga.
  const startZ = useRef(currentZ);
  startZ.current = currentZ;

  useEffect(() => {
    setImage(null); setLevel(null); setStride(1); setProgress(null); setError(null);
    if (!sid || !meta) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const coarse = await loadCoarse(sid, meta, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const { toImageData } = await import("./imageData");
        if (ctrl.signal.aborted) return;
        setImage(toImageData(coarse)); setLevel("coarse"); setStride(coarse.stride);
        const full = await loadFull(sid, meta, startZ.current, ctrl.signal, (done, total) => {
          if (!ctrl.signal.aborted) setProgress({ done, total });
        });
        if (ctrl.signal.aborted) return;
        setImage(toImageData(full)); setLevel("full"); setStride(full.stride); setProgress(null);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        // Sin el completo se sigue con el grueso; el rótulo lo dirá.
        setError(err instanceof Error ? err.message : "No se pudo descargar el volumen");
        setProgress(null);
      }
    })();
    return () => { ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, meta?.cache_key]);

  return { image, level, stride, progress, error };
}
