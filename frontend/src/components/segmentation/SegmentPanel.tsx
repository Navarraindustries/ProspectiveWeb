/* Paso 2 — Segmentación vascular. POST /api/segment.

   Umbral ADAPTATIVO por percentil: la banda de arranque y el rango de los
   sliders se derivan de la distribución de intensidad DEL PROPIO volumen (una
   sola regla universal, no presets por modalidad), así arrancan en el sitio
   correcto para cualquier escala (TC HU, 3DRA crudo, RM). El clínico la afina
   viendo la malla 3D formándose casi en tiempo real (vista previa gruesa) y el
   tinte verde en los cortes MPR. */

import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Metric } from "../Metric";
import { PanelHead, SectionLabel, ErrorNote, Card } from "../PanelHead";
import { ProgressBar } from "../ProgressBar";
import { Slider } from "../Slider";
import { MeshEditTools } from "./MeshEditTools";
import { PreprocessSection } from "./PreprocessSection";
import { usePlanning } from "../../store/planning";

/* Fallback si aún no hay volumen para calcular la banda adaptativa. */
export const SEG_LOWER_DEFAULT = 150;
export const SEG_UPPER_DEFAULT = 500;

export function SegmentPanel({ onNext }: { onNext: () => void }) {
  const planning = usePlanning();
  const { sessionId, series, segmentation, setPreviewBand, setPreviewMeshUrl } = planning;

  const [lower, setLower] = useState(SEG_LOWER_DEFAULT);
  const [upper, setUpper] = useState(SEG_UPPER_DEFAULT);
  // Sin techo: el backend lo desactiva cuando upper <= lower.
  const [sinTecho, setSinTecho] = useState(false);
  const [smoothing, setSmoothing] = useState(3);
  const [cleanup, setCleanup] = useState(7);   // level 7 → top-N isolation, mesh limpia
  // Off by default: on a 384³ study this is minutes instead of seconds.
  const [fullRes, setFullRes] = useState(false);
  // Marcada por defecto: en angiografía el componente mayor ES el árbol y el
  // resto es hueso, medido en los dos estudios XA del proyecto. En angio-TC el
  // backend se niega y lo explica, así que dejarla puesta no rompe nada.
  const [mainTree, setMainTree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Slider range + suggested band, adapted to this volume's intensity scale.
  const [range, setRange] = useState<{ min: number; max: number }>({ min: -500, max: 3000 });
  const suggested = useRef<{ lower: number; upper: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // La banda adaptada describe el VOLUMEN, no la malla, así que se pide
  // siempre que cambia la sesión.
  //
  // Antes esto llevaba `if (!sessionId || segmentation) return;`, y volver al
  // paso con una malla ya hecha dejaba el panel en los valores de reserva, que
  // son de TC: inferior 150 y un rango −500…3000. Sobre una 3DRA cuyo p99 es
  // 1499, segmentar con 150 mete el tejido blando y el cráneo entero. El
  // usuario no tenía forma de verlo: los sliders enseñaban números plausibles
  // que no tenían nada que ver con su volumen.
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api.suggestedBand(sessionId).then((b) => {
      if (!alive) return;
      suggested.current = { lower: b.lower, upper: b.upper };
      // Los límites del slider salen del volumen siempre. El valor elegido
      // sólo se pisa si el usuario no lo ha tocado —sigue en la reserva—,
      // para no deshacer un ajuste deliberado al volver al paso.
      setLower((cur) => (cur === SEG_LOWER_DEFAULT ? Math.round(b.lower) : cur));
      setUpper((cur) => (cur === SEG_UPPER_DEFAULT ? Math.round(b.upper) : cur));
      const pad = Math.max(1, (b.vmax - b.vmin) * 0.05);
      setRange({ min: Math.floor(b.vmin - pad), max: Math.ceil(b.vmax + pad) });
    }).catch(() => { /* keep fallback defaults */ });
    return () => { alive = false; };
  }, [sessionId]);

  /** Lo que se manda al backend: 0 desactiva el techo. */
  const upperEfectivo = sinTecho ? 0 : upper;

  // Live 2D tint on the MPR slices (fast, debounced). Only while tuning the
  // initial threshold — after segmenting, the grow panel drives the tint.
  useEffect(() => {
    if (segmentation) return;
    const t = setTimeout(() => setPreviewBand([lower, sinTecho ? Number.MAX_SAFE_INTEGER : upper]), 140);
    return () => clearTimeout(t);
  }, [lower, upper, sinTecho, segmentation, setPreviewBand]);

  // Live 3D coarse-mesh preview (debounced) — the "casi en tiempo real" of the
  // desktop: shows the vascular tree forming as the sliders move.
  useEffect(() => {
    if (!sessionId || segmentation) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api.segmentPreview(sessionId, { lower, upper: upperEfectivo, cleanup, downsample: 3 });
        if (!cancelled) setPreviewMeshUrl(res.mesh_url);
      } catch {
        if (!cancelled) setPreviewMeshUrl(null);   // empty band → no mesh
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 420);
    return () => { cancelled = true; clearTimeout(t); };
  }, [lower, upper, upperEfectivo, cleanup, sessionId, segmentation, setPreviewMeshUrl]);

  // Clear the previews when leaving the segmentation step.
  useEffect(() => () => { setPreviewBand(null); setPreviewMeshUrl(null); }, [setPreviewBand, setPreviewMeshUrl]);

  const resetBand = () => {
    const s = suggested.current;
    setLower(Math.round(s ? s.lower : SEG_LOWER_DEFAULT));
    setUpper(Math.round(s ? s.upper : SEG_UPPER_DEFAULT));
  };

  // Going back to threshold tuning after a bad segmentation. Without this the
  // only way out was to re-segment blind: the finished mesh hid the live 3D
  // preview and the MPR tint, which are exactly the feedback you need to pick a
  // better band. Detection state goes too — it describes the discarded mesh.
  const discard = async () => {
    setDiscarding(true);
    setError(null);
    try {
      if (sessionId) await api.clearDetection(sessionId);
    } catch {
      /* Best effort: the next detection run overwrites this state anyway. */
    } finally {
      planning.setSegmentation(null);
      planning.resetDownstream();
      setDiscarding(false);
    }
  };

  const run = async () => {
    if (!sessionId || !series) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.segment({
        session_id: sessionId,
        series_id: series.series_id,
        lower,
        upper: upperEfectivo,
        smoothing,
        cleanup,
        full_resolution: fullRes,
        main_tree_only: mainTree,
      });
      planning.setSegmentation(res);
      setPreviewBand(null);       // final mesh now shows
      setPreviewMeshUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la segmentación");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-rise">
      <PanelHead
        title="Segmentación vascular"
        desc="Aísla el árbol vascular por umbral de intensidad y reconstruye su superficie 3D."
        right={segmentation && <Badge variant="success">Malla lista</Badge>}
      />

      <SectionLabel style={{ marginBottom: 10 }}>
        Umbral de intensidad
        {previewing && !segmentation && (
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>
            · actualizando vista previa…
          </span>
        )}
      </SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
        Banda de arranque adaptada a este volumen. Mueve los sliders y observa la
        malla 3D formándose (vista previa) y el tinte verde en los cortes MPR.
      </div>
      <div>
        <Slider label="Umbral inferior" min={range.min} max={range.max} value={lower} onChange={setLower} unit="" />
        <div style={{ height: 14 }} />
        <Slider
          label="Umbral superior"
          min={range.min}
          max={range.max}
          value={upper}
          onChange={setUpper}
          unit=""
          disabled={sinTecho}
        />
        {/* El tope del slider sale de `vmax`, que es el percentil 99.9 del
            volumen, así que subirlo «al máximo» NO quita el techo: lo deja
            justo donde estaba. En una 3DRA lo más brillante ES el contraste,
            y el techo corta el vaso donde más denso está. El backend ya sabe
            desactivarlo (`upper <= lower` → sin límite); faltaba poder pedirlo. */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "var(--muted-foreground)", cursor: "pointer" }}>
          <input type="checkbox" checked={sinTecho} onChange={(e) => setSinTecho(e.target.checked)} />
          Sin límite superior — conserva todo lo más brillante que el umbral inferior
        </label>
        {sinTecho && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.45 }}>
            En angiografía con contraste suele ser lo correcto: el techo recorta
            justo los vasos más llenos y puede partir el árbol en trozos que
            luego la limpieza descarta. Quítalo si ves ramas cortadas.
          </div>
        )}
        <div style={{ height: 14 }} />
        <Slider label="Suavizado" min={0} max={10} value={smoothing} onChange={setSmoothing} />
        <div style={{ height: 14 }} />
        <Slider label="Limpieza" min={0} max={10} value={cleanup} onChange={setCleanup} />
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: -4, marginBottom: 8, lineHeight: 1.45 }}>
          {cleanup === 0
            ? "Sin filtrar: se conserva todo, incluido el ruido."
            : cleanup <= 4
              ? "Filtra por tamaño: descarta motas y conserva cualquier fragmento que pueda ser un vaso."
              : "Aísla las estructuras mayores: malla más limpia, pero puede dejar fuera una rama suelta."}
        </div>

        {/* Los huecos en los vasos finos vienen sobre todo de segmentar el
            volumen a la mitad de su resolución. */}
        {/* El hueso no se quita con el umbral: medido en case 3, el 99 % del
            hueso cae DENTRO del rango de intensidad del propio árbol, y el
            mejor umbral posible conservaría el 61 % del árbol dejando aún el
            4,9 % del hueso. Lo que sí los separa es que no se tocan. */}
        <label
          style={{
            display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
            padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)", background: "var(--card)",
          }}
        >
          <input
            type="checkbox"
            checked={mainTree}
            onChange={(e) => setMainTree(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
              Solo el árbol principal
            </span>
            <span style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45, marginTop: 2 }}>
              Conserva la estructura conectada mayor y descarta el resto. En
              angiografía esa estructura es el árbol y lo que sobra es hueso, que
              el umbral no puede quitar porque comparte brillo con el contraste.
              En angio-TC no se aplica —allí todo está conectado— y lo avisa.
            </span>
          </span>
        </label>

        <label
          style={{
            display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
            padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)", background: "var(--card)",
          }}
        >
          <input
            type="checkbox"
            checked={fullRes}
            onChange={(e) => setFullRes(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
              Resolución completa
            </span>
            <span style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45, marginTop: 2 }}>
              Los volúmenes grandes se segmentan a la mitad de su resolución, y eso
              parte los vasos finos: la malla sale con huecos. Marcando esto se usa
              el volumen íntegro — tarda minutos en vez de segundos.
            </span>
          </span>
        </label>
      </div>
      <div style={{ marginTop: 6, textAlign: "right" }}>
        <button
          onClick={resetBand}
          style={{ background: "transparent", border: "none", color: "var(--brand-deep)", fontSize: 11, cursor: "pointer", padding: 0 }}
        >
          Restablecer banda sugerida
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
        En estudios con hueso/cráneo, el umbral por sí solo no separa el vaso: sube «Limpieza»
        para aislar el árbol principal. Si el hueso queda <b style={{ color: "var(--foreground)" }}>pegado
        al árbol</b>, el borrador de región (abajo) lo quita sin tocar los vasos de al lado.
      </div>

      <PreprocessSection />

      {busy && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 6 }}>
            Ejecutando Marching Cubes…
          </div>
          <ProgressBar />
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {segmentation && (
        <Card style={{ marginTop: 16 }}>
          <Metric label="Vértices" value={segmentation.vertices.toLocaleString("es")} />
          <Metric label="Caras" value={segmentation.faces.toLocaleString("es")} />
          <Metric label="Salida" value={segmentation.mesh_url.split("/").pop() ?? ""} />
          {segmentation.voxel_fraction !== null && (
            <Metric
              label="Fracción de vóxeles"
              value={(segmentation.voxel_fraction * 100).toFixed(1)}
              unit=" %"
              badge={segmentation.voxel_fraction > 0.15 ? ["Permisivo", "warning"] : ["OK", "success"]}
            />
          )}
          <Metric
            label="Resolución de la malla"
            value={segmentation.downsample_factor > 1
              ? `1/${segmentation.downsample_factor}`
              : "completa"}
            badge={segmentation.downsample_factor > 1
              ? ["Submuestreada", "warning"]
              : ["Nativa", "success"]}
          />
          {/* What the cleanup threw away. Without this the loss is invisible:
              a whole branch can vanish and the mesh still looks plausible. */}
          <Metric
            label="Volumen conservado"
            value={(segmentation.kept_fraction * 100).toFixed(1)}
            unit=" %"
            badge={
              segmentation.largest_removed_mm3 >= 20
                ? ["Revisar", "warning"]
                : ["Limpio", "success"]
            }
          />
          {segmentation.fragments_removed > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
              Se descartaron {segmentation.fragments_removed.toLocaleString("es")} fragmentos
              sueltos; el mayor medía {segmentation.largest_removed_mm3.toFixed(1)} mm³.
              {segmentation.largest_removed_mm3 >= 20 && (
                <> Un fragmento de ese tamaño puede ser un segmento de vaso desconectado:
                baja la limpieza si echas en falta alguna rama.</>
              )}
            </div>
          )}

          {/* Lo que hizo —o no— «Solo el árbol principal». Cuando se niega,
              decir por qué: un botón que no hace nada en silencio deja al
              usuario pensando que la aplicación está rota. */}
          {segmentation.main_tree_applied && segmentation.main_tree_removed > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
              Árbol principal aislado: fuera {segmentation.main_tree_removed}{" "}
              {segmentation.main_tree_removed === 1 ? "estructura suelta" : "estructuras sueltas"}.
            </div>
          )}
          {segmentation.main_tree_warning && (
            <div style={{
              fontSize: 11, lineHeight: 1.5, marginTop: 8, padding: "8px 10px",
              borderRadius: "var(--radius-md)", background: "var(--muted)",
              borderLeft: "3px solid var(--warning)", color: "var(--foreground)",
            }}>
              <b>No se aisló el árbol principal.</b> {segmentation.main_tree_warning}
            </div>
          )}
        </Card>
      )}

      <MeshEditTools />

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Button
          variant={segmentation ? "outline" : "default"}
          onClick={() => void run()}
          disabled={busy || discarding || !sessionId}
          leadingIcon={<Icon name="GROWTH" />}
          style={{ flex: 1 }}
        >
          {segmentation ? "Re-segmentar" : "Segmentar"}
        </Button>
        {segmentation && (
          <Button onClick={onNext} trailingIcon={<Icon name="STEP_DETECT" />}>
            Detectar
          </Button>
        )}
      </div>
      {segmentation && (
        <Button
          variant="ghost"
          style={{ marginTop: 8, width: "100%" }}
          disabled={busy || discarding}
          onClick={() => void discard()}
          leadingIcon={<Icon name="CLEAR" size={14} />}
        >
          {discarding ? "Descartando…" : "Descartar malla y volver a los umbrales"}
        </Button>
      )}
    </div>
  );
}
