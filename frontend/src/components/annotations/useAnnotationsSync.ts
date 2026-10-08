/* Guardado automático de las anotaciones en la sesión viva.

   Cada cambio de la lista se guarda 600 ms después del último: una regla se
   cierra con dos clics y un renombrado son varias teclas, y un PUT por tecla
   no aporta nada. Lo que llega del servidor (reanudar, o la lista devuelta con
   el autor) no se vuelve a mandar: se reconoce por referencia. */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { api } from "../../api/client";
import type { Annotation } from "../../vtk/annotations";

export type AnnotationsSync = "guardado" | "guardando" | "error";

const DEBOUNCE_MS = 600;

/** Guarda `annotations` 600 ms después del último cambio; expone una promesa
 *  para esperar al vuelo («Guardar progreso» la espera antes de su POST). */
export function useAnnotationsSync(
  sessionId: string | null,
  annotations: Annotation[],
  setSync: (s: AnnotationsSync) => void,
  /** La última lista leída del servidor (store: annotationsLoadedRef). */
  loadedRef: RefObject<Annotation[] | null>,
  /** Escribe en el store sin ensuciar ni disparar otro PUT (setAnnotationsLoaded). */
  setLoaded: (a: Annotation[]) => void,
): { flush: () => Promise<void> } {
  // La primera lista (la del montaje) ya es la de la sesión: no se guarda.
  const lastSaved = useRef<Annotation[] | null>(annotations);
  // Lo último entregado a un PUT, para que flush no repita uno que ya vuela.
  const sent = useRef<Annotation[] | null>(null);
  const sid = useRef(sessionId);
  const latest = useRef(annotations);
  latest.current = annotations;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Los PUT van en fila: dos a la vez podrían llegar al revés y dejar en disco
  // la lista vieja.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const queued = useRef(0);

  const put = useCallback((session: string, list: Annotation[]) => {
    sent.current = list;
    queued.current += 1;
    const run = chain.current.then(async () => {
      try {
        const saved = await api.putAnnotations(session, list);
        if (sid.current !== session) return;   // la sesión cambió mientras volaba
        lastSaved.current = list;
        // El servidor pone el autor: vuelve al store, salvo que el usuario haya
        // seguido editando (pisaría su cambio; el próximo PUT lo traerá).
        const authorChanged = saved.length === list.length
          && saved.some((s, i) => s.created_by !== list[i].created_by);
        if (authorChanged && latest.current === list) {
          lastSaved.current = saved;
          setLoaded(saved);
        }
      } catch {
        if (sid.current !== session) return;
        // Que flush lo reintente: el store sigue teniendo la lista del usuario.
        if (sent.current === list) sent.current = null;
        queued.current -= 1;
        setSync("error");
        return;
      }
      queued.current -= 1;
      if (queued.current === 0 && !timer.current) setSync("guardado");
    });
    chain.current = run;
    return run;
  }, [setSync, setLoaded]);

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    if (sid.current !== sessionId) {
      // Sesión nueva (o ninguna): lo que hay es su punto de partida. Un PUT
      // pendiente de la anterior se descarta: su lista ya no está en el store.
      sid.current = sessionId;
      cancelTimer();
      sent.current = null;
      queued.current = 0;
      lastSaved.current = annotations;
      setSync("guardado");
      return;
    }
    if (!sessionId) return;
    if (annotations === lastSaved.current || annotations === loadedRef.current) return;
    setSync("guardando");
    cancelTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      void put(sessionId, latest.current);
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, annotations]);

  const flush = useCallback(async () => {
    cancelTimer();
    const s = sid.current, list = latest.current;
    if (s && list !== lastSaved.current && list !== loadedRef.current && list !== sent.current) {
      void put(s, list);
    }
    await chain.current;
  }, [put, loadedRef]);

  // Salir del espacio de trabajo antes de los 600 ms no puede perder el cambio.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { if (timer.current) void flushRef.current(); }, []);

  return { flush };
}
