/* Herramientas de malla — refinamiento interactivo tras la segmentación:
   · Crecer desde semillas (region growing, POST /api/segment/grow)
   · Recortar malla por ROI caja/esfera (POST /api/mesh-crop)
   Ambas operan sobre vessel_tree.vtp; picking 3D reutiliza la infra del visor. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { SectionLabel, ErrorNote, Card } from "../PanelHead";
import { Slider } from "../Slider";
import { SEG_LOWER_DEFAULT, SEG_UPPER_DEFAULT } from "./SegmentPanel";
import type { MeshBounds, MeshHistoryResult } from "../../api/types";
import { usePlanning } from "../../store/planning";

export function MeshEditTools() {
  const {
    sessionId, segmentation,
    pickMode, setPickMode,
    growSeeds, setGrowSeeds, cropCenter, setCropCenter,
    cropRadius: radius, setCropRadius: setRadius,
    cropShape: shape, setCropShape: setShape,
    cropInvert: invert, setCropInvert: setInvert,
    mprSeedMode, setMprSeedMode, setPreviewBand,
    erasePick, setErasePick, setPlaneCut,
    setSegmentation, setCandidates, setSelectedCandidate,
    setMorphometry, setTreatment, setCenterlineMesh,
  } = usePlanning();

  const [lower, setLower] = useState(SEG_LOWER_DEFAULT);
  const [upper, setUpper] = useState(SEG_UPPER_DEFAULT);
  const [autoBand, setAutoBand] = useState(true);   // derive band from the seed
  // Resultado del último clic del borrador. Se enseña siempre: cuando borra,
  // qué borró; cuando no, por qué no.
  const [eraseMsg, setEraseMsg] = useState<string | null>(null);
  const [eraseLeft, setEraseLeft] = useState<number | null>(null);
  // Corte por plano: una dirección y una altura, sin elegir centro.
  const [planeAxis, setPlaneAxis] = useState<"x" | "y" | "z">("y");
  const [planeOffset, setPlaneOffset] = useState<number>(0);
  const [planeKeepPos, setPlaneKeepPos] = useState(true);
  const [bounds, setBounds] = useState<MeshBounds | null>(null);
  const [planeMsg, setPlaneMsg] = useState<string | null>(null);
  // La previa NO se arma sola: entrar en Segmentación no puede hacer que
  // media malla desaparezca sin que nadie lo haya pedido. Se arma al tocar
  // el control y se desarma con «Cancelar».
  const [planeArmed, setPlaneArmed] = useState(false);
  const [huRange, setHuRange] = useState<{ min: number; max: number }>({ min: -200, max: 3000 });
  const [busy, setBusy] = useState<"grow" | "crop" | "plane" | "undo" | "redo" | "original" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The edit history as the backend knows it. Asked for on mount so a resumed
  // session — whose browser has no memory of the edits — still offers «Deshacer».
  const [hist, setHist] = useState<MeshHistoryResult>({
    undo_depth: 0, redo_depth: 0, has_original: false, steps: [],
  });

  // Adapt the grow HU band + slider range to this volume's intensity scale
  // (so it works for 3DRA/CT alike, not a fixed HU window).
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api.suggestedBand(sessionId).then((b) => {
      if (!alive) return;
      setLower(Math.round(b.lower));
      setUpper(Math.round(b.upper));
      const pad = Math.max(1, (b.vmax - b.vmin) * 0.05);
      setHuRange({ min: Math.floor(b.vmin - pad), max: Math.ceil(b.vmax + pad) });
    }).catch(() => { /* keep defaults */ });
    return () => { alive = false; };
  }, [sessionId]);

  // Live green tint on the MPR slices for the grow band — so you set the band
  // watching what turns green (vessel yes, bone no) BEFORE regenerating once.
  useEffect(() => {
    if (!segmentation) return;
    const t = setTimeout(() => setPreviewBand([lower, upper]), 140);
    return () => clearTimeout(t);
  }, [lower, upper, segmentation, setPreviewBand]);
  useEffect(() => () => setPreviewBand(null), [setPreviewBand]);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api.meshHistory(sessionId)
      .then((h) => { if (alive) setHist(h); })
      .catch(() => { /* no history yet */ });
    return () => { alive = false; };
  }, [sessionId]);

  // Los extremos reales de la malla, para que el deslizador no tenga un
  // recorrido inventado. Se recargan cuando la malla cambia.
  useEffect(() => {
    if (!sessionId || !segmentation) return;
    let vivo = true;
    api.meshBounds(sessionId)
      .then((b) => {
        if (!vivo) return;
        setBounds(b);
        const lo = b.min[planeAxis], hi = b.max[planeAxis];
        setPlaneOffset((v) => (v >= lo && v <= hi ? v : Math.round((lo + hi) / 2)));
      })
      .catch(() => { /* sin límites el deslizador se queda deshabilitado */ });
    return () => { vivo = false; };
  }, [sessionId, segmentation?.mesh_url]);   // eslint-disable-line react-hooks/exhaustive-deps

  // La previa del corte: el visor recorta el render en vivo con estos tres
  // valores, así que arrastrar el deslizador enseña lo que se va a llevar.
  useEffect(() => {
    if (!bounds || !planeArmed) { setPlaneCut(null); return; }
    setPlaneCut({ axis: planeAxis, offset: planeOffset, keepPositive: planeKeepPos });
  }, [bounds, planeArmed, planeAxis, planeOffset, planeKeepPos, setPlaneCut]);
  useEffect(() => () => setPlaneCut(null), [setPlaneCut]);

  // ── El borrador de un clic ──────────────────────────────────────────── #
  //
  // El visor solo señala el punto; la llamada vive aquí, con el resto de las
  // ediciones de malla, para que deshacer, invalidar la morfometría y refrescar
  // la malla sigan el mismo camino que el recorte y el crecimiento.
  useEffect(() => {
    if (!erasePick || !sessionId) return;
    const [x, y, z] = erasePick;
    setErasePick(null);
    let cancelado = false;
    void (async () => {
      try {
        const res = await api.meshComponentDelete(sessionId, { x, y, z });
        if (cancelado) return;
        if (!res.removed) {
          setEraseMsg(res.warning || "No se borró nada.");
          setEraseLeft(res.components_left);
          return;
        }
        setSegmentation(segmentation
          ? { ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces }
          : segmentation);
        // La pieza que se acaba de borrar puede ser la que sostenía un
        // candidato o una medida: se tiran, igual que tras un recorte.
        setCandidates([]); setSelectedCandidate(0);
        setMorphometry(null); setTreatment(null); setCenterlineMesh(null);
        setEraseMsg(
          `Borrada una pieza de ${res.removed.volume_mm3.toFixed(0)} mm³ ` +
          `(${res.removed.extent_mm.toFixed(0)} mm).`,
        );
        setEraseLeft(res.components_left);
      } catch (err) {
        if (!cancelado) setEraseMsg(err instanceof Error ? err.message : "Error al borrar la pieza");
      }
    })();
    return () => { cancelado = true; };
  }, [erasePick, sessionId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!segmentation) return null;

  // Anything derived from the old mesh is invalid once it changes.
  const clearDownstream = () => {
    setCandidates([]);
    setSelectedCandidate(0);
    setMorphometry(null);
    setTreatment(null);
    setCenterlineMesh(null);
  };

  const runGrow = async () => {
    if (!sessionId || growSeeds.length === 0) return;
    setBusy("grow");
    setError(null);
    setNote(null);
    setPickMode(null);
    setMprSeedMode(false);
    try {
      const res = await api.segmentGrow(sessionId, {
        seeds: growSeeds.map(([x, y, z]) => ({ x, y, z })),
        lower, upper, auto_band: autoBand, smoothing: 5, cleanup: 5,
      });
      setSegmentation({
        mesh_url: res.mesh_url,
        voxel_fraction: null,
        strategy: "grow_from_seeds",
        is_dsa: false,
        vertices: res.vertices,
        faces: res.faces,
        // Region-grow keeps a single connected region by construction.
        kept_fraction: 1, fragments_removed: 0, largest_removed_mm3: 0, downsample_factor: 1, main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0,
      });
      clearDownstream();
      void refreshHistory();
      setGrowSeeds([]);
      // Show the band that was actually used (derived from the seed when auto).
      if (autoBand) { setLower(Math.round(res.band_lower)); setUpper(Math.round(res.band_upper)); }
      const bandTxt = autoBand ? ` · banda auto [${Math.round(res.band_lower)}, ${Math.round(res.band_upper)}]` : "";
      setNote(`Malla regenerada: ${res.vertices.toLocaleString("es")} vértices · ${res.n_voxels.toLocaleString("es")} vóxeles${bandTxt}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en el crecimiento por semillas");
    } finally {
      setBusy(null);
    }
  };

  const runCrop = async () => {
    if (!sessionId || !cropCenter) return;
    setBusy("crop");
    setError(null);
    setNote(null);
    setPickMode(null);
    const [x, y, z] = cropCenter;
    try {
      const res = await api.meshCrop(sessionId, {
        mode: shape,
        center: { x, y, z },
        radius,
        invert,
      });
      setSegmentation({ ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces });
      clearDownstream();
      void refreshHistory();
      setCropCenter(null);
      setNote(`Malla recortada: ${res.vertices.toLocaleString("es")} vértices (${res.removed_vertices.toLocaleString("es")} eliminados).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al recortar la malla");
    } finally {
      setBusy(null);
    }
  };

  const refreshHistory = async () => {
    if (!sessionId) return;
    try { setHist(await api.meshHistory(sessionId)); } catch { /* keep what we have */ }
  };

  const restore = async (scope: "undo" | "redo" | "original") => {
    if (!sessionId) return;
    setBusy(scope);
    setError(null);
    setNote(null);
    setPickMode(null);
    setMprSeedMode(false);
    try {
      const res = await api.meshRestore(sessionId, scope);
      setSegmentation({ ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces });
      // The restored mesh is different geometry, so candidates, morphometry and
      // the centreline measured on the edited one no longer describe it.
      clearDownstream();
      void refreshHistory();
      setCropCenter(null);
      setGrowSeeds([]);
      setNote(
        scope === "original"
          ? `Malla original restaurada: ${res.vertices.toLocaleString("es")} vértices. Vuelve a detectar para medir sobre ella.`
          : scope === "redo"
            ? `Edición rehecha: ${res.vertices.toLocaleString("es")} vértices.`
            : `Edición deshecha: ${res.vertices.toLocaleString("es")} vértices. Quedan ${res.undo_depth} por deshacer.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar la malla");
    } finally {
      setBusy(null);
    }
  };

  const toolBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
    borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
    background: active ? "var(--brand-subtle)" : "var(--card)",
    color: active ? "var(--brand-subtle-foreground)" : "var(--foreground)",
  });

  const cortarPlano = async () => {
    if (!sessionId) return;
    setPlaneMsg(null);
    setBusy("plane");
    try {
      const res = await api.meshPlaneCut(sessionId, {
        axis: planeAxis, offset_mm: planeOffset, keep_positive: planeKeepPos,
      });
      setSegmentation(segmentation
        ? { ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces }
        : segmentation);
      clearDownstream();
      setPlaneArmed(false);
      setPlaneMsg(
        `Fuera ${res.removed_vertices.toLocaleString("es")} vértices. ` +
        (res.components_left === 1
          ? "Queda 1 pieza."
          : `Quedan ${res.components_left} piezas.`),
      );
    } catch (err) {
      setPlaneMsg(err instanceof Error ? err.message : "No se pudo cortar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <SectionLabel style={{ marginBottom: 10 }}>Herramientas de malla</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14 }}>
        Refina la malla segmentada: crece un árbol conectado desde semillas o recorta una región (ruido/hueso).
      </div>

      {/* ── Grow from seeds ─────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
          Crecer desde semillas <span style={{ fontSize: 10, fontWeight: 600, color: "var(--brand-deep)", background: "var(--brand-subtle)", padding: "1px 6px", borderRadius: 999 }}>recomendado con hueso</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          Marca 1–2 semillas <b style={{ color: "var(--foreground)" }}>sobre un vaso en los cortes MPR</b> de abajo
          (donde el vaso se separa del cráneo) y crece solo lo conectado dentro del rango HU: el hueso desconectado queda fuera.
        </div>
        <div
          className="mpr-gone-note"
          style={{
            display: "none", gap: 6, alignItems: "flex-start", marginBottom: 8,
            padding: "8px 10px", borderRadius: "var(--radius-md)",
            background: "var(--warning-bg)", color: "var(--warning)",
            border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
            fontSize: 11, lineHeight: 1.5,
          }}
        >
          <Icon name="STATUS_WARN" size={13} color="var(--warning)" />
          <span>
            La franja de cortes MPR no cabe en esta ventana. Agranda la ventana para
            sembrar sobre los cortes, o usa la opción de semilla sobre la malla 3D.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => { const on = !mprSeedMode; setMprSeedMode(on); if (on) setPickMode(null); }}
            style={toolBtn(mprSeedMode)}
          >
            {mprSeedMode ? `Clic en un vaso (MPR)… (${growSeeds.length})` : `Semilla en cortes MPR (${growSeeds.length})`}
          </button>
          <button
            onClick={() => { setGrowSeeds([]); setMprSeedMode(false); if (pickMode === "grow_seed") setPickMode(null); }}
            disabled={growSeeds.length === 0}
            style={{ ...toolBtn(false), flex: "0 0 auto", opacity: growSeeds.length === 0 ? 0.5 : 1 }}
          >
            Limpiar
          </button>
        </div>
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => { const on = pickMode !== "grow_seed"; setPickMode(on ? "grow_seed" : null); if (on) setMprSeedMode(false); }}
            style={{ ...toolBtn(pickMode === "grow_seed"), width: "100%", fontSize: 11 }}
          >
            {pickMode === "grow_seed" ? "Colocando en la malla 3D…" : "…o semilla en la malla 3D"}
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--foreground)", cursor: "pointer", margin: "2px 0 10px" }}>
          <input type="checkbox" checked={autoBand} onChange={(e) => setAutoBand(e.target.checked)} />
          Banda automática desde la semilla <span style={{ fontSize: 10, color: "var(--brand-deep)" }}>(recomendado)</span>
        </label>
        {autoBand ? (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 12, lineHeight: 1.5 }}>
            La banda se calcula sola a partir de la intensidad del vaso en la semilla (excluye
            hueso/tejido). No necesitas mover los umbrales — solo clica el vaso y regenera.
          </div>
        ) : (
          <div style={{ opacity: 1 }}>
            <Slider label="Umbral inferior" min={huRange.min} max={huRange.max} value={lower} onChange={setLower} unit="" />
            <div style={{ height: 10 }} />
            <Slider label="Umbral superior" min={huRange.min} max={huRange.max} value={upper} onChange={setUpper} unit="" />
            <div style={{ height: 12 }} />
          </div>
        )}
        <Button
          variant="outline"
          onClick={() => void runGrow()}
          disabled={busy !== null || growSeeds.length === 0}
          leadingIcon={<Icon name="GROWTH" />}
          style={{ width: "100%" }}
        >
          {busy === "grow" ? "Creciendo…" : "Regenerar malla desde semillas"}
        </Button>
      </Card>

      {/* ── Borrador de piezas ──────────────────────────────────────────── */}
      {/* Medido en case 3: la malla sale con once piezas y diez son hueso,
          bloques de 228-2948 mm³ a 37-92 mm del árbol. Como vienen enteras y
          separadas, un clic basta: pintar sobre ellas dejaría bordes a medio
          borrar y no haría nada que esto no haga. */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
          Borrar piezas sueltas
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          Pincha una estructura suelta en el visor y desaparece entera. El ruido de
          una malla angiográfica viene en piezas separadas, así que no hace falta
          pintar sobre él. Se deshace como cualquier otra edición.
        </div>
        <button
          onClick={() => {
            const on = pickMode !== "erase_piece";
            setPickMode(on ? "erase_piece" : null);
            if (on) { setMprSeedMode(false); setEraseMsg(null); }
          }}
          style={{ ...toolBtn(pickMode === "erase_piece"), width: "100%" }}
        >
          {pickMode === "erase_piece"
            ? "Pincha la pieza a borrar… (pulsa para salir)"
            : "Activar borrador"}
        </button>
        {eraseMsg && (
          <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 8, color: "var(--muted-foreground)" }}>
            {eraseMsg}
            {eraseLeft !== null && <> Quedan {eraseLeft} {eraseLeft === 1 ? "pieza" : "piezas"}.</>}
          </div>
        )}
      </Card>

      {/* ── Corte por plano ─────────────────────────────────────────────── */}
      {/* El recorte por caja o esfera obliga a acertar un centro a ojo, y para
          quitar la chapa pegada bajo el árbol eso son varios intentos. Un plano
          no tiene centro: una dirección y una altura. */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
          Cortar por un plano
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          Sin elegir centro. <b>Arrastra el deslizador y mira el visor</b>: lo que
          desaparece es exactamente lo que el corte se va a llevar. Prueba un eje;
          si el plano va en la dirección equivocada se ve al instante. «Cortar»
          solo confirma lo que ya estás viendo.
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["x", "y", "z"] as const).map((eje) => (
            <button
              key={eje}
              onClick={() => {
                setPlaneAxis(eje);
                setPlaneArmed(true);
                if (bounds) setPlaneOffset(Math.round((bounds.min[eje] + bounds.max[eje]) / 2));
              }}
              style={toolBtn(planeAxis === eje)}
            >
              Eje {eje.toUpperCase()}
            </button>
          ))}
        </div>

        {bounds ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)", flex: 1 }}>
                Altura del corte
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground)" }}>
                {planeOffset.toFixed(0)} mm
              </span>
            </div>
            <input
              type="range"
              aria-label="Altura del corte"
              min={Math.floor(bounds.min[planeAxis])}
              max={Math.ceil(bounds.max[planeAxis])}
              step={1}
              value={planeOffset}
              onChange={(e) => { setPlaneOffset(Number(e.target.value)); setPlaneArmed(true); }}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted-foreground)", marginBottom: 10 }}>
              <span>{bounds.min[planeAxis].toFixed(0)}</span>
              <span>{bounds.max[planeAxis].toFixed(0)}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10 }}>
            Cargando los límites de la malla…
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={() => { setPlaneKeepPos(true); setPlaneArmed(true); }} style={toolBtn(planeKeepPos)}>
            Conservar arriba
          </button>
          <button onClick={() => { setPlaneKeepPos(false); setPlaneArmed(true); }} style={toolBtn(!planeKeepPos)}>
            Conservar abajo
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outline"
            style={{ flex: 1 }}
            disabled={!bounds || !planeArmed || busy !== null}
            onClick={() => void cortarPlano()}
          >
            {busy === "plane" ? "Cortando…" : "Cortar"}
          </Button>
          {planeArmed && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => { setPlaneArmed(false); setPlaneMsg(null); }}
            >
              Cancelar
            </Button>
          )}
        </div>
        {planeMsg && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
            {planeMsg}
          </div>
        )}
      </Card>

      {/* ── ROI crop ────────────────────────────────────────────────────── */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
          Recortar malla (ROI)
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10 }}>
          Elige un centro y conserva o elimina la geometría dentro de una esfera o caja.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setPickMode(pickMode === "crop_center" ? null : "crop_center")}
            style={toolBtn(pickMode === "crop_center")}
          >
            {pickMode === "crop_center"
              ? "Clic en el visor…"
              : cropCenter
                ? `Centro: (${cropCenter.map((v) => v.toFixed(0)).join(", ")})`
                : "Elegir centro"}
          </button>
          {cropCenter && (
            <button onClick={() => setCropCenter(null)} style={{ ...toolBtn(false), flex: "0 0 auto" }}>
              Quitar
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={() => setShape("sphere")} style={toolBtn(shape === "sphere")}>Esfera</button>
          <button onClick={() => setShape("box")} style={toolBtn(shape === "box")}>Caja</button>
        </div>
        <Slider label={shape === "sphere" ? "Radio" : "Medio-lado"} min={2} max={80} value={radius} onChange={setRadius} unit=" mm" />
        <div style={{ height: 12 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setInvert(false)} style={toolBtn(!invert)}>Conservar dentro</button>
          <button onClick={() => setInvert(true)} style={toolBtn(invert)}>Eliminar dentro</button>
        </div>
        <Button
          variant="outline"
          onClick={() => void runCrop()}
          disabled={busy !== null || !cropCenter}
          leadingIcon={<Icon name="CUT" />}
          style={{ width: "100%" }}
        >
          {busy === "crop" ? "Recortando…" : "Recortar malla"}
        </Button>
      </Card>

      {/* ── Historial de la malla ────────────────────────────────────────── */}
      {/* Recortar, crecer y re-segmentar reescriben vessel_tree.vtp en el sitio.
          Antes, volver atrás de un recorte exigía re-segmentar, y re-segmentar
          borraba todo el refinamiento sin aviso. Ahora las tres son un paso más
          del historial, con nombre. */}
      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
          Historial de la malla
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          {hist.undo_depth > 0
            ? "Volver atrás no re-segmenta: se recupera la malla guardada antes del paso. Deshacer también es reversible."
            : "Sin pasos que deshacer. En cuanto recortes, crezcas o vuelvas a segmentar, podrás volver atrás desde aquí."}
        </div>

        {hist.steps.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
            {hist.steps.map((st, i) => (
              <div
                key={`${st.at}-${i}`}
                style={{
                  display: "flex", alignItems: "baseline", gap: 8, padding: "4px 8px",
                  borderRadius: "var(--radius-sm)", background: "var(--muted)",
                  fontSize: 11, color: "var(--muted-foreground)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>{i + 1}</span>
                <span style={{ flex: 1, color: "var(--foreground)", fontWeight: 600 }}>{st.title}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {st.vertices.toLocaleString("es")} v
                </span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>
              Estados guardados, del más antiguo al más reciente. Deshacer vuelve al último de la lista.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => void restore("undo")}
            disabled={busy !== null || hist.undo_depth === 0}
            style={{ ...toolBtn(false), opacity: hist.undo_depth === 0 || busy !== null ? 0.5 : 1 }}
          >
            {busy === "undo" ? "Deshaciendo…" : "↺ Deshacer"}
          </button>
          <button
            onClick={() => void restore("redo")}
            disabled={busy !== null || hist.redo_depth === 0}
            style={{ ...toolBtn(false), opacity: hist.redo_depth === 0 || busy !== null ? 0.5 : 1 }}
          >
            {busy === "redo" ? "Rehaciendo…" : "↻ Rehacer"}
          </button>
          <button
            onClick={() => void restore("original")}
            disabled={busy !== null || hist.undo_depth === 0}
            style={{ ...toolBtn(false), opacity: hist.undo_depth === 0 || busy !== null ? 0.5 : 1 }}
          >
            {busy === "original" ? "Restaurando…" : "⊘ Al inicio"}
          </button>
        </div>
      </Card>

      {note && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--brand-subtle-foreground, #2f7d5b)", background: "var(--brand-subtle, rgba(54,214,168,0.1))", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
          {note}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
