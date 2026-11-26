/* Historial de la malla: deshacer, rehacer y volver a la malla de la segmentación.
 *
 * Vive aparte de las herramientas de malla porque se usa en dos sitios: dentro
 * de ellas, en Segmentación, y en la columna de los pasos que vienen después.
 * Antes solo estaba en Segmentación, y para quitar un recorte hecho para medir
 * había que volver dos pasos atrás («esa opción de devolverse debería estar
 * presente en todos los pasos, no solo en el de segmentación»). */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api/client";
import { Card, ErrorNote } from "../PanelHead";
import type { MeshHistoryResult } from "../../api/types";
import { usePlanning } from "../../store/planning";
import { olvidarIvus } from "../../vtk/hud/HudIvus";

type Scope = "undo" | "redo" | "original";

const ROTULO: Record<Scope, string> = {
  undo: "↺ Deshacer",
  redo: "↻ Rehacer",
  original: "⊘ Al inicio",
};

const OCUPADO: Record<Scope, string> = {
  undo: "Deshaciendo…",
  redo: "Rehaciendo…",
  original: "Restaurando…",
};

const CONFIRMA: Record<Scope, string> = {
  undo: "Sí, deshacer",
  redo: "Sí, rehacer",
  original: "Sí, volver al inicio",
};

const toolBtn =(activo: boolean, apagado: boolean): CSSProperties => ({
  flex: 1, padding: "6px 10px", fontSize: 12, fontWeight: 600,
  cursor: apagado ? "default" : "pointer",
  borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  background: activo ? "var(--brand-subtle)" : "var(--glass)",
  color: activo ? "var(--brand-subtle-foreground)" : "var(--foreground)",
  opacity: apagado ? 0.5 : 1,
});

export function MeshHistoryCard({
  aviso,
  onRestored,
  version = 0,
  sinTitulo = false,
}: {
  /** Si se da, restaurar pide confirmación con este texto: fuera de
   *  Segmentación, volver atrás tira la detección y la morfometría. */
  aviso?: string;
  /** Tras restaurar, con la malla nueva ya puesta. */
  onRestored?: () => void;
  /** Súbelo tras una edición para que el historial se vuelva a pedir aunque
   *  la URL de la malla no cambie. */
  version?: number;
  /** Dentro de un plegable que ya lleva el título. */
  sinTitulo?: boolean;
}) {
  const {
    sessionId, segmentation, setSegmentation, setPickMode, setCropCenter, olvidarLoDeLaMalla,
  } = usePlanning();

  // Lo que el backend sabe del historial. Se pide al montar —una sesión
  // reanudada no recuerda sus ediciones en el navegador— y SIEMPRE que cambia
  // la malla: antes solo se pedía al montar y, con doce pasos guardados, la
  // tarjeta decía «sin pasos que deshacer».
  const [hist, setHist] = useState<MeshHistoryResult>({
    undo_depth: 0, redo_depth: 0, has_original: false, steps: [],
  });
  const [busy, setBusy] = useState<Scope | null>(null);
  const [pendiente, setPendiente] = useState<Scope | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meshUrl = segmentation?.mesh_url;
  useEffect(() => {
    if (!sessionId) return;
    let vivo = true;
    api.meshHistory(sessionId)
      .then((h) => { if (vivo) setHist(h); })
      .catch(() => { /* sin historial todavía */ });
    return () => { vivo = false; };
  }, [sessionId, meshUrl, version]);

  if (!segmentation) return null;

  const restore = async (scope: Scope) => {
    if (!sessionId) return;
    setPendiente(null);
    setBusy(scope);
    setError(null);
    setNote(null);
    setPickMode(null);
    try {
      const res = await api.meshRestore(sessionId, scope);
      setSegmentation({ ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces });
      // La malla restaurada es otra geometría: los candidatos, la morfometría,
      // la línea central y los dispositivos medidos sobre la editada ya no la
      // describen. Sin quitar los dispositivos, el campo del clip seguía vivo
      // (CALOR ● en la barra) y stent y clip reaparecían en Dispositivos
      // colocados sobre la malla de antes (Case 3, 22-11).
      // FE-11: con la misma acción que el recorte y el servidor; antes aquí
      // se quedaban el clip editable, su campo y los perforantes.
      olvidarLoDeLaMalla();
      olvidarIvus();
      setCropCenter(null);
      try { setHist(await api.meshHistory(sessionId)); } catch { /* queda el de antes */ }
      setNote(
        scope === "original"
          ? `Malla original restaurada: ${res.vertices.toLocaleString("es")} vértices. Vuelve a detectar para medir sobre ella.`
          : scope === "redo"
            ? `Edición rehecha: ${res.vertices.toLocaleString("es")} vértices.`
            : `Edición deshecha: ${res.vertices.toLocaleString("es")} vértices. Quedan ${res.undo_depth} por deshacer.`,
      );
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar la malla. Vuelve a intentarlo.");
    } finally {
      setBusy(null);
    }
  };

  const pedir = (scope: Scope) => {
    if (aviso) setPendiente(scope);
    else void restore(scope);
  };

  const sinPasos = { undo: hist.undo_depth === 0, redo: hist.redo_depth === 0, original: hist.undo_depth === 0 };

  return (
    <Card style={sinTitulo ? undefined : { marginTop: 12 }}>
      {!sinTitulo && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>
          Historial de la malla
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
        {hist.undo_depth > 0
          ? "Volver atrás no re-segmenta: se recupera la malla guardada antes del paso. Deshacer también es reversible."
          : "Sin pasos que deshacer. En cuanto borres, recortes o vuelvas a segmentar, podrás volver atrás desde aquí."}
      </div>

      {hist.steps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
          {hist.steps.map((st, i) => (
            <div
              key={`${st.at}-${i}`}
              style={{
                display: "flex", alignItems: "baseline", gap: 8, padding: "4px 8px",
                borderRadius: "var(--radius-sm)", background: "var(--glass-hover)",
                fontSize: 12, color: "var(--muted-foreground)",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>{i + 1}</span>
              <span style={{ flex: 1, color: "var(--foreground)", fontWeight: 600 }}>{st.title}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {st.vertices.toLocaleString("es")} v
              </span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
            Estados guardados, del más antiguo al más reciente. Deshacer vuelve al último de la lista.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {(["undo", "redo", "original"] as const).map((scope) => {
          const apagado = busy !== null || sinPasos[scope];
          return (
            <button
              key={scope}
              onClick={() => pedir(scope)}
              disabled={apagado}
              style={toolBtn(pendiente === scope, apagado)}
            >
              {busy === scope ? OCUPADO[scope] : ROTULO[scope]}
            </button>
          );
        })}
      </div>

      {/* Fuera de Segmentación, restaurar se lleva lo medido: se pregunta
          antes, en el sitio, sin diálogo modal. */}
      {pendiente && aviso && (
        <div
          role="alert"
          style={{
            marginTop: 10, padding: "8px 10px", fontSize: 12, lineHeight: 1.5,
            border: "1px solid var(--warning, #c9a227)", borderRadius: "var(--radius-md)",
            color: "var(--foreground)", background: "var(--glass)",
          }}
        >
          {aviso}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => void restore(pendiente)} style={toolBtn(true, false)}>
              {CONFIRMA[pendiente]}
            </button>
            <button onClick={() => setPendiente(null)} style={toolBtn(false, false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {note && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--brand-subtle-foreground, #2f7d5b)", background: "var(--brand-subtle, rgba(54,214,168,0.1))", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
          {note}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}
