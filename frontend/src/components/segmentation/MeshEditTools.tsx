/* Herramientas de malla — refinamiento interactivo tras la segmentación:
   · Recortar malla por ROI caja/esfera (POST /api/mesh-crop)
   Ambas operan sobre vessel_tree.vtp; picking 3D reutiliza la infra del visor. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { SectionLabel, ErrorNote, Card } from "../PanelHead";
import { Slider } from "../Slider";
import type { MeshBounds, MeshHistoryResult } from "../../api/types";
import { usePlanning } from "../../store/planning";

export function MeshEditTools() {
  const {
    sessionId, segmentation,
    pickMode, setPickMode,
    cropCenter, setCropCenter, boxCut: caja, setBoxCut,
    cropRadius: radius, setCropRadius: setRadius,
    cropShape: shape, setCropShape: setShape,
    cropInvert: invert, setCropInvert: setInvert,
    erasePick, setErasePick,
    setSegmentation, setCandidates, setSelectedCandidate,
    setMorphometry, setTreatment, setCenterlineMesh,
  } = usePlanning();

  // Resultado del último clic del borrador. Se enseña siempre: cuando borra,
  // qué borró; cuando no, por qué no.
  const [eraseMsg, setEraseMsg] = useState<string | null>(null);
  const [eraseLeft, setEraseLeft] = useState<number | null>(null);
  // Qué borra el clic: una pieza SUELTA o una región PEGADA.
  //
  // El hueso viene suelto cuando la malla está submuestreada, y entonces basta
  // con quitar la pieza. A resolución completa el peñasco y la base del cráneo
  // TOCAN el árbol, así que son parte del componente mayor y el borrador de
  // piezas no puede con ellos: la propia tarjeta lo dice, «la malla es una
  // sola pieza». Para eso está el modo región.
  const [eraseMode, setEraseMode] = useState<"piece" | "region">("piece");
  const [eraseRadius, setEraseRadius] = useState(6);
  // Cuántas piezas hay ANTES de borrar ninguna: sin esto el borrador no dice
  // si queda algo que quitar, y había que pinchar a ciegas para averiguarlo.
  const [comps, setComps] = useState<{ total: number; largestIsTree: boolean } | null>(null);
  // Corte por plano: una dirección y una altura, sin elegir centro.
  const [bounds, setBounds] = useState<MeshBounds | null>(null);
  const [busy, setBusy] = useState<"crop" | "plane" | "undo" | "redo" | "original" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The edit history as the backend knows it. Asked for on mount so a resumed
  // session — whose browser has no memory of the edits — still offers «Deshacer».
  const [hist, setHist] = useState<MeshHistoryResult>({
    undo_depth: 0, redo_depth: 0, has_original: false, steps: [],
  });



  // El historial se recarga SIEMPRE que cambia la malla, no solo al montar.
  //
  // Antes solo se pedía al montar el panel, que es justo cuando todavía no hay
  // nada que deshacer. Re-segmentar guarda su instantánea, pero eso ocurre
  // desde SegmentPanel y este componente no se enteraba: con doce pasos
  // guardados en el backend, la tarjeta seguía diciendo «sin pasos que
  // deshacer» y los tres botones aparecían apagados. Es decir, el usuario veía
  // que su trabajo era irreversible cuando no lo era.
  const meshUrl = segmentation?.mesh_url;
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api.meshHistory(sessionId)
      .then((h) => { if (alive) setHist(h); })
      .catch(() => { /* no history yet */ });
    return () => { alive = false; };
  }, [sessionId, meshUrl]);

  // Los extremos reales de la malla, para que el deslizador no tenga un
  // recorrido inventado. Se recargan cuando la malla cambia.
  useEffect(() => {
    if (!sessionId || !segmentation) return;
    let vivo = true;
    api.meshBounds(sessionId)
      .then((b) => {
        if (!vivo) return;
        setBounds(b);
      })
      .catch(() => { /* sin límites el deslizador se queda deshabilitado */ });
    return () => { vivo = false; };
  }, [sessionId, segmentation?.mesh_url]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Las piezas de la malla, recontadas cuando la malla cambia.
  useEffect(() => {
    if (!sessionId || !segmentation) { setComps(null); return; }
    let vivo = true;
    api.meshComponents(sessionId)
      .then((c) => { if (vivo) setComps({ total: c.total, largestIsTree: c.largest_is_tree }); })
      .catch(() => { if (vivo) setComps(null); });
    return () => { vivo = false; };
  }, [sessionId, segmentation?.mesh_url]);   // eslint-disable-line react-hooks/exhaustive-deps


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
        if (eraseMode === "region") {
          const res = await api.meshEraseRegion(sessionId, { x, y, z }, eraseRadius);
          if (cancelado) return;
          if (!res.removed_vertices) {
            setEraseMsg(res.warning || "No se borró nada.");
            return;
          }
          setSegmentation(segmentation
            ? { ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces }
            : segmentation);
          setCandidates([]); setSelectedCandidate(0);
          setMorphometry(null); setTreatment(null); setCenterlineMesh(null);
          setEraseMsg(`Borrados ${res.removed_vertices.toLocaleString("es")} vértices.`);
          setEraseLeft(null);
          // El backend guarda la instantánea, pero el panel no se enteraba: la
          // tarjeta seguía diciendo «sin pasos que deshacer» después de borrar,
          // así que parecía que el borrado era irreversible.
          void refreshHistory();
          return;
        }
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
        setComps((c) => (c ? { ...c, total: res.components_left } : c));
        void refreshHistory();
      } catch (err) {
        if (!cancelado) setEraseMsg(err instanceof Error ? err.message : "Error al borrar la pieza");
      }
    })();
    return () => { cancelado = true; };
  }, [erasePick, sessionId, eraseMode, eraseRadius]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Estos dos van AQUÍ, con el resto de hooks, y no junto a la lógica de la
  // caja más abajo: allí quedarían DESPUÉS del `return null` de arriba, y un
  // hook que a veces se ejecuta y a veces no rompe el componente entero
  // («Rendered more hooks than during the previous render»). Ya pasó una vez.
  const [cajaArmada, setCajaArmada] = useState(false);
  useEffect(() => () => setBoxCut(null), [setBoxCut]);

  if (!segmentation) return null;

  // Anything derived from the old mesh is invalid once it changes.
  const clearDownstream = () => {
    setCandidates([]);
    setSelectedCandidate(0);
    setMorphometry(null);
    setTreatment(null);
    setCenterlineMesh(null);
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

  // ── La caja de recorte ────────────────────────────────────────────────── #
  //
  // NO se arma sola. Una caja amarilla permanente alrededor del árbol estorba
  // justo cuando lo que quieres es MIRAR la malla; solo aparece cuando vas a
  // recortar, y se va al terminar o al cancelar.
  const EJE_IDX = { x: 0, y: 1, z: 2 } as const;

  /** Arranca envolviendo la malla entera: así armarla no recorta nada. */
  const resetCaja = () => {
    if (!bounds) return;
    setBoxCut({
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
    });
  };

  const armarCaja = () => { setCajaArmada(true); resetCaja(); };
  const cancelarCaja = () => { setCajaArmada(false); setBoxCut(null); };

  const moverCaja = (eje: "x" | "y" | "z", lado: "min" | "max", v: number) => {
    if (!bounds) return;
    const base = caja ?? {
      min: [bounds.min.x, bounds.min.y, bounds.min.z] as [number, number, number],
      max: [bounds.max.x, bounds.max.y, bounds.max.z] as [number, number, number],
    };
    const i = EJE_IDX[eje];
    const min = [...base.min] as [number, number, number];
    const max = [...base.max] as [number, number, number];
    // Un lado nunca puede cruzar al otro: una caja invertida no recorta, vacía.
    if (lado === "min") min[i] = Math.min(v, max[i]);
    else max[i] = Math.max(v, min[i]);
    setBoxCut({ min, max });
  };

  /** ¿La caja deja algo fuera? Si envuelve la malla entera, no hay recorte. */
  const cajaRecorta = !!(caja && bounds && (
    caja.min[0] > bounds.min.x || caja.max[0] < bounds.max.x ||
    caja.min[1] > bounds.min.y || caja.max[1] < bounds.max.y ||
    caja.min[2] > bounds.min.z || caja.max[2] < bounds.max.z
  ));

  const recortarCaja = async () => {
    if (!sessionId || !caja) return;
    setBusy("crop");
    setError(null);
    setNote(null);
    try {
      // El endpoint habla de centro y semiejes; la caja son límites. Es la
      // misma caja escrita de otra forma.
      const centro = {
        x: (caja.min[0] + caja.max[0]) / 2,
        y: (caja.min[1] + caja.max[1]) / 2,
        z: (caja.min[2] + caja.max[2]) / 2,
      };
      const semi = {
        x: Math.max((caja.max[0] - caja.min[0]) / 2, 0.01),
        y: Math.max((caja.max[1] - caja.min[1]) / 2, 0.01),
        z: Math.max((caja.max[2] - caja.min[2]) / 2, 0.01),
      };
      const res = await api.meshCrop(sessionId, {
        mode: "box", center: centro, half_size: semi, radius: 10, invert: false,
      });
      setSegmentation(segmentation
        ? { ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces }
        : segmentation);
      clearDownstream();
      setBoxCut(null);          // la caja vieja ya no describe la malla nueva
      setCajaArmada(false);
      void refreshHistory();
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
    try {
      const res = await api.meshRestore(sessionId, scope);
      setSegmentation({ ...segmentation, mesh_url: res.mesh_url, vertices: res.vertices, faces: res.faces });
      // The restored mesh is different geometry, so candidates, morphometry and
      // the centreline measured on the edited one no longer describe it.
      clearDownstream();
      void refreshHistory();
      setCropCenter(null);
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


  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <SectionLabel style={{ marginBottom: 10 }}>Herramientas de malla</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14 }}>
        Refina la malla segmentada: borra el ruido o el hueso, y recorta lo que sobra.
      </div>

      {/* ── Borrador de piezas ──────────────────────────────────────────── */}
      {/* Medido en case 3: la malla sale con once piezas y diez son hueso,
          bloques de 228-2948 mm³ a 37-92 mm de la vasculatura. Como vienen enteras y
          separadas, un clic basta: pintar sobre ellas dejaría bordes a medio
          borrar y no haría nada que esto no haga. */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
          Borrador
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          Pincha en el visor y desaparece. <b>Pieza suelta</b> quita la estructura
          entera de un clic, que es como viene el ruido de una malla angiográfica.
          <b> Región pegada</b> sirve cuando el hueso TOCA la vasculatura y por eso forma
          parte de él. Se deshace como cualquier otra edición.
          {comps && (
            <>
              {" "}
              <b>
                {comps.total === 1
                  ? "La malla es una sola pieza: no hay nada suelto que borrar."
                  : `La malla tiene ${comps.total} piezas.`}
              </b>
            </>
          )}
        </div>
        {/* Dos cosas distintas, y el usuario elige cuál. El de piezas no puede
            con el hueso pegado; el de región no necesita que esté suelto. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button
            onClick={() => { setEraseMode("piece"); setEraseMsg(null); }}
            style={{ ...toolBtn(eraseMode === "piece"), flex: 1 }}
          >
            Pieza suelta
          </button>
          <button
            onClick={() => { setEraseMode("region"); setEraseMsg(null); }}
            style={{ ...toolBtn(eraseMode === "region"), flex: 1 }}
          >
            Región pegada
          </button>
        </div>
        {eraseMode === "region" && (
          <div style={{ marginBottom: 8 }}>
            <Slider label="Radio del borrado" min={2} max={40} value={eraseRadius}
                    onChange={setEraseRadius} unit=" mm" />
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginTop: 4 }}>
              El radio se mide en línea recta desde el clic, pero el borrado se
              propaga <b>por la superficie</b>: un vaso que cruza esa bola pero
              se une a la vasculatura por fuera de ella no se toca. Eso es lo que el
              recorte esférico no puede hacer.
            </div>
          </div>
        )}
        <button
          onClick={() => {
            const on = pickMode !== "erase_piece";
            setPickMode(on ? "erase_piece" : null);
            if (on) setEraseMsg(null);
          }}
          style={{ ...toolBtn(pickMode === "erase_piece"), width: "100%" }}
        >
          {pickMode === "erase_piece"
            ? (eraseMode === "region"
                ? "Pincha la zona a borrar… (pulsa para salir)"
                : "Pincha la pieza a borrar… (pulsa para salir)")
            : "Activar borrador"}
        </button>
        {eraseMsg && (
          <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 8, color: "var(--muted-foreground)" }}>
            {eraseMsg}
            {eraseLeft !== null && <> Quedan {eraseLeft} {eraseLeft === 1 ? "pieza" : "piezas"}.</>}
          </div>
        )}
      </Card>

      {/* ── Caja de recorte ─────────────────────────────────────────────── */}
      {/* El corte por plano recortaba la malla SIN DIBUJAR NADA: había que
          deducir dónde cortaba por lo que desaparecía, y solo en un eje cada
          vez. El usuario lo dijo tal cual: «no se ve bien alguna caja o algo
          que muestre que se está cortando en las 3 dimensiones».

          Ahora la caja arranca envolviendo la malla entera —así no recorta
          nada de salida— y cada eje se cierra por los dos lados. Se ve, y las
          tres dimensiones están a la vez. */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
          Caja de recorte
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          La caja empieza envolviendo toda la malla. <b>Cierra cada eje por donde
          quieras</b> y mira el visor: la caja amarilla es lo que se conserva, y
          lo de fuera desaparece en el momento. «Recortar» solo confirma lo que
          ya estás viendo.
        </div>

        {!bounds && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            Cargando los límites de la malla…
          </div>
        )}

        {bounds && !cajaArmada && (
          <Button variant="outline" onClick={armarCaja} style={{ width: "100%" }}>
            Activar la caja
          </Button>
        )}

        {bounds && cajaArmada && (
          <>
            {(["x", "y", "z"] as const).map((eje) => {
              const lo = bounds.min[eje];
              const hi = bounds.max[eje];
              const paso = Math.max(0.1, Math.round((hi - lo) / 200 * 10) / 10);
              return (
                <div key={eje} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>
                    Eje {eje.toUpperCase()}
                  </div>
                  <Slider
                    label="desde" min={lo} max={hi} step={paso}
                    value={caja ? caja.min[EJE_IDX[eje]] : lo}
                    onChange={(v) => moverCaja(eje, "min", v)}
                    unit=" mm"
                  />
                  <Slider
                    label="hasta" min={lo} max={hi} step={paso}
                    value={caja ? caja.max[EJE_IDX[eje]] : hi}
                    onChange={(v) => moverCaja(eje, "max", v)}
                    unit=" mm"
                  />
                </div>
              );
            })}

            <div style={{ display: "flex", gap: 6 }}>
              <Button
                variant="outline"
                onClick={() => void recortarCaja()}
                disabled={busy !== null || !cajaRecorta}
                style={{ flex: 1 }}
              >
                {busy === "crop" ? "Recortando…" : "Recortar"}
              </Button>
              <Button variant="outline" onClick={resetCaja} disabled={busy !== null} style={{ flex: 1 }}>
                Toda la malla
              </Button>
              <Button variant="outline" onClick={cancelarCaja} disabled={busy !== null} style={{ flex: 1 }}>
                Cancelar
              </Button>
            </div>
            {!cajaRecorta && (
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
                La caja envuelve la malla entera: no hay nada que recortar todavía.
              </div>
            )}
          </>
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
            : "Sin pasos que deshacer. En cuanto borres, recortes o vuelvas a segmentar, podrás volver atrás desde aquí."}
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
