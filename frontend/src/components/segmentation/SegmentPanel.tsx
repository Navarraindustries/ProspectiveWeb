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
import { SegmentProgress } from "./SegmentProgress";
import { TubularControls, type SegmentMethod } from "./TubularControls";
import { CONNECTION_LOST, useProgress } from "../../api/progress";
import { usePlanning } from "../../store/planning";
import { isHuModality } from "../../vtk/modality";
import type { CeilingCompareResult } from "../../api/types";

/* Fallback si aún no hay volumen para calcular la banda adaptativa. */
export const SEG_LOWER_DEFAULT = 150;
export const SEG_UPPER_DEFAULT = 500;

/* Vista previa en dos etapas. Los submuestreos y las esperas salen de medir el
   coste real sobre un volumen 384³ — ver el efecto que las usa. */
export const PREVIA_BORRADOR_DS = 5;
export const PREVIA_BORRADOR_MS = 90;
export const PREVIA_AFINADO_DS = 2;
export const PREVIA_AFINADO_MS = 550;

export function SegmentPanel({ onNext }: { onNext: () => void }) {
  const planning = usePlanning();
  const { sessionId, series, segmentation, setPreviewBand, setPreviewMeshUrl } = planning;

  // La unidad solo existe en TC; en el resto el umbral es intensidad cruda.
  const isHu = isHuModality(series?.modality);
  const [lower, setLower] = useState(SEG_LOWER_DEFAULT);
  const [upper, setUpper] = useState(SEG_UPPER_DEFAULT);
  // Sin techo: el backend lo desactiva cuando upper <= lower.
  const [sinTecho, setSinTecho] = useState(false);
  // Comparar el techo: la casilla no puede tener un valor por defecto —los dos
  // casos anotados piden lo contrario— y tampoco se puede decidir sola: se
  // midió la regla evidente (quitarlo cuando corta el árbol) y no separa, el
  // techo se lleva puentes en ambos casi por igual, 88 % y 89 %. Así que la
  // app lo prueba de las dos formas y enseña las dos listas.
  const [comparando, setComparando] = useState(false);
  const [comparacion, setComparacion] = useState<CeilingCompareResult | null>(null);
  const [smoothing, setSmoothing] = useState(3);
  const [cleanup, setCleanup] = useState(7);   // level 7 → top-N isolation, mesh limpia
  // Tubular por defecto: el umbral clásico deja láminas de hueso y cáscaras
  // huecas que la detección luego toma por sacos.
  const [method, setMethod] = useState<SegmentMethod>("tubular");
  const [reclaimMm, setReclaimMm] = useState(3);
  // Desmarcada por defecto: media resolución rompe los vasos finos. Antes el
  // panel mandaba `full_resolution: false` y el backend, que lo traduce a
  // `half_resolution = true`, segmentaba el tubular a media resolución sin que
  // nadie lo pidiera.
  const [halfRes, setHalfRes] = useState(false);
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
  // Solo vigila mientras corre la petición: al llegar el resultado `busy` pasa
  // a false y el hook cierra el WebSocket o el sondeo.
  const progress = useProgress(sessionId, busy);
  // El vigilante se rinde con este centinela si pierde el servidor. No es un
  // fallo de la segmentación: el trabajo sigue y el resultado llega por el POST.
  // Se compara por identidad: un `ok: false` que mande el backend es un fallo
  // real del trabajo, no una conexión perdida, y no debe decir «sigue en el
  // servidor».
  const progressLost = progress === CONNECTION_LOST;

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
  /** El método tubular no usa el techo. La vista previa tampoco puede usarlo:
   *  con él enseñaba la banda intermedia —hueso y bordes— y dejaba fuera los
   *  vasos, que son lo más brillante y justo lo que la segmentación va a
   *  sacar. Visto en una 3D-RA: la previa eran cuatro trozos sueltos. */
  const previaSinTecho = sinTecho || method === "tubular";

  // Live 2D tint on the MPR slices (fast, debounced). Only while tuning the
  // initial threshold — after segmenting, the grow panel drives the tint.
  useEffect(() => {
    if (segmentation) return;
    const t = setTimeout(() => setPreviewBand([lower, previaSinTecho ? Number.MAX_SAFE_INTEGER : upper]), 140);
    return () => clearTimeout(t);
  }, [lower, upper, previaSinTecho, segmentation, setPreviewBand]);

  // Vista previa 3D en dos etapas.
  //
  // Antes era una sola, a submuestreo 3, con 420 ms de espera: en un volumen
  // 384³ eso son 107 ms de cálculo y una malla de 21.924 vértices que hay que
  // escribir y transportar. Se siente lento mientras se arrastra el deslizador.
  //
  // Medido sobre ese mismo volumen (en caliente):
  //     ds=1  3.506 ms  596.701 vért
  //     ds=2    394 ms   85.187 vért
  //     ds=3    107 ms   21.924 vért
  //     ds=5     23 ms    4.461 vért
  //
  // De ahí las dos etapas: BORRADOR a ds=5 con 90 ms de espera, que a 23 ms sí
  // se siente inmediato mientras arrastras, y AFINADO a ds=2 cuando sueltas,
  // que es el nivel al que se ven las ramas finas. El afinado se cancela solo
  // si vuelves a mover, así que arrastrar seguido no encola trabajo.
  //
  // La previa NO coincide con la malla final (que va a ds=2 o a resolución
  // completa): sirve para ver dónde cae la banda, no para juzgar el detalle.
  const previaPedida = useRef(0);
  useEffect(() => {
    if (!sessionId || segmentation) return;
    let cancelled = false;
    const mio = ++previaPedida.current;

    const pedir = async (downsample: number) => {
      if (cancelled || mio !== previaPedida.current) return;
      setPreviewing(true);
      try {
        const res = await api.segmentPreview(sessionId, {
          lower, upper: previaSinTecho ? 0 : upper, cleanup, downsample,
        });
        if (!cancelled && mio === previaPedida.current) setPreviewMeshUrl(res.mesh_url);
      } catch {
        if (!cancelled && mio === previaPedida.current) setPreviewMeshUrl(null);  // banda vacía
      } finally {
        if (!cancelled && mio === previaPedida.current) setPreviewing(false);
      }
    };

    const borrador = setTimeout(() => void pedir(PREVIA_BORRADOR_DS), PREVIA_BORRADOR_MS);
    const afinado = setTimeout(() => void pedir(PREVIA_AFINADO_DS), PREVIA_AFINADO_MS);
    return () => { cancelled = true; clearTimeout(borrador); clearTimeout(afinado); };
  }, [lower, upper, previaSinTecho, cleanup, sessionId, segmentation, setPreviewMeshUrl]);

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
      // Las anotaciones se quedan: lo dibujado sobre los cortes sigue valiendo
      // para la próxima malla del mismo volumen.
      planning.resetDownstream();
      setDiscarding(false);
    }
  };

  const compararTecho = async () => {
    if (!sessionId) return;
    setComparando(true);
    setError(null);
    try {
      setComparacion(await api.compareCeiling(sessionId, {
        lower, upper, smoothing, cleanup, main_tree_only: mainTree,
        // Siempre el valor de siempre: la comparación es una prueba rápida del
        // umbral clásico (el único método que usa el techo), y su aviso de
        // «unos dos minutos» se midió así. A resolución nativa serían dos
        // segmentaciones nativas más dos detecciones.
        full_resolution: false,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error comparando el umbral");
    } finally {
      setComparando(false);
    }
  };

  const run = async () => {
    if (!sessionId || !series) return;
    setBusy(true);
    setError(null);
    // Solo resegmentar (ya había malla) cambia aquello a lo que apuntan las
    // anotaciones 3D; la primera segmentación conserva lo medido en los cortes.
    const hadMesh = planning.segmentation !== null;
    try {
      const res = await api.segment({
        session_id: sessionId,
        series_id: series.series_id,
        lower,
        upper: upperEfectivo,
        smoothing,
        cleanup,
        method,
        reclaim_mm: reclaimMm,
        // El umbral clásico con la casilla desmarcada NO manda la bandera: el
        // backend solo aplica su regla de 256 (la de siempre, que diezma los
        // volúmenes grandes) cuando la clave falta. Mandar `false` lo pasaba a
        // resolución nativa —más lento, y un 422 por encima de 120 M vóxeles—
        // sin que nadie lo pidiera. El tubular la manda siempre: su defecto es
        // la resolución nativa.
        ...(method === "tubular" || halfRes ? { half_resolution: halfRes } : {}),
        main_tree_only: mainTree,
      });
      // La malla es OTRA, así que los candidatos, la morfometría y la
      // recomendación medidos sobre la anterior ya no describen nada. Sin
      // esto, resegmentar dejaba en pantalla los candidatos de antes y parecía
      // que la detección no encontraba el aneurisma cuando lo que pasaba es
      // que nadie la había vuelto a lanzar.
      //
      // El ORDEN importa: `resetDownstream` limpia TODO lo que cuelga del
      // DICOM, la propia segmentación incluida. Llamarlo después de guardar la
      // malla nueva la borraba en el mismo render, y el visor —sin malla que
      // pintar— volvía a la vista del DICOM. Lo vio el usuario: «al darle
      // Segmentar no se muestra la malla».
      planning.resetDownstream();
      if (hadMesh) planning.clearAnnotations();
      planning.setSegmentation(res);
      setPreviewBand(null);       // final mesh now shows
      setPreviewMeshUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la segmentación");
    } finally {
      setBusy(false);
    }
  };

  const chooseMethod = (m: SegmentMethod) => {
    setMethod(m);
    // La comparación describe dos mallas del umbral clásico; con otro método
    // ya no dice nada de lo que se va a obtener.
    setComparacion(null);
  };

  const tubular = segmentation?.method === "tubular";
  // Una malla restaurada trae el método y la resolución, pero no las cifras de
  // calidad de aquella ejecución: sin ellas no se afirma «Estanca» ni «0 piezas».
  const hasQuality = segmentation?.boundary_edges != null;
  const boundaryEdges = segmentation?.boundary_edges ?? 0;
  const phases = phaseSummary(segmentation?.phase_seconds);

  return (
    <div className="fade-rise">
      <PanelHead
        title="Segmentación vascular"
        desc="Aísla la vasculatura por su forma tubular (o por umbral) y reconstruye su superficie 3D."
        right={segmentation && <Badge variant="success">Malla lista</Badge>}
      />

      {/* El método va primero: decide qué controles de abajo cuentan (el
          techo y su comparación solo existen para el umbral clásico). */}
      <SectionLabel style={{ marginBottom: 0 }}>Método</SectionLabel>
      <TubularControls method={method} reclaimMm={reclaimMm} onMethod={chooseMethod} onReclaim={setReclaimMm} />

      <SectionLabel style={{ marginTop: 18, marginBottom: 10 }}>
        Umbral de intensidad
        {previewing && !segmentation && (
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>
            · actualizando vista previa…
          </span>
        )}
      </SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
        {method === "tubular"
          ? "Mueve el umbral y observa la vista previa; el método tubular decide luego qué es vaso por su forma, no solo por su brillo."
          : "Mueve los umbrales y observa la vista previa: la malla será lo que quede dentro de la banda."}
      </div>
      <div>
        <Slider label="Umbral inferior" min={range.min} max={range.max} value={lower} onChange={setLower} unit={isHu ? " HU" : ""} />
        <div style={{ height: 14 }} />
        <Slider
          label="Umbral superior"
          min={range.min}
          max={range.max}
          value={upper}
          onChange={setUpper}
          unit={isHu ? " HU" : ""}
          disabled={sinTecho || method === "tubular"}
        />
        {!isHu && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
            Intensidad del volumen, sin unidad física
          </div>
        )}
        {/* El tope del slider sale de `vmax`, que es el percentil 99.9 del
            volumen, así que subirlo «al máximo» NO quita el techo: lo deja
            justo donde estaba. En una 3DRA lo más brillante ES el contraste,
            y el techo corta el vaso donde más denso está. El backend ya sabe
            desactivarlo (`upper <= lower` → sin límite); faltaba poder pedirlo. */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "var(--muted-foreground)", cursor: "pointer" }}>
          <input type="checkbox" checked={previaSinTecho} disabled={method === "tubular"}
                 onChange={(e) => setSinTecho(e.target.checked)} />
          Sin límite superior — conserva todo lo más brillante que el umbral inferior
        </label>
        {method === "tubular" && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.45 }}>
            El método tubular nunca usa el límite superior; la vista previa tampoco.
          </div>
        )}
        {sinTecho && method !== "tubular" && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.45 }}>
            En angiografía con contraste suele ser lo correcto: el techo recorta
            justo los vasos más llenos y puede partir la vasculatura en trozos que
            luego la limpieza descarta. Quítalo si ves ramas cortadas.
          </div>
        )}

        {/* No hay forma de acertar de antemano, así que se prueban las dos.
            Se ofrece también con la malla ya hecha: la duda aparece justo
            entonces, al ver que en la lista de candidatos no está la lesión. */}
        {method === "threshold" && !sinTecho && upper > lower && (
          <Button
            variant="outline"
            onClick={() => void compararTecho()}
            disabled={comparando}
            style={{ width: "100%", marginTop: 8 }}
          >
            {comparando ? "Probando las dos…" : "¿Cuál uso? Probar con y sin techo"}
          </Button>
        )}

        {/* Decirlo ANTES: segmenta y detecta dos veces, y sobre el examen real
            fueron casi dos minutos. Un botón que parece instantáneo y tarda eso
            se acaba pulsando dos veces. */}
        {method === "threshold" && !sinTecho && upper > lower && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 5, lineHeight: 1.45 }}>
            {comparando
              ? "Segmentando y detectando de las dos formas; en un examen de 384³ fueron unos dos minutos."
              : "Tarda el doble que segmentar: lo hace de las dos formas y enseña las dos listas. No cambia la malla."}
          </div>
        )}

        {method === "threshold" && comparacion && (
          <Card style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
              Con techo vs sin techo
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 8 }}>
              {comparacion.note}
            </div>
            {comparacion.candidates.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11, padding: "3px 0" }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--foreground)", minWidth: 52 }}>
                  Ø {c.diameter_mm.toFixed(1)}
                </span>
                <span style={{ color: c.rank_con_techo ? "var(--foreground)" : "var(--muted-foreground)" }}>
                  con techo {c.rank_con_techo ? `#${c.rank_con_techo}` : "—"}
                </span>
                <span style={{ color: c.rank_sin_techo ? "var(--foreground)" : "var(--muted-foreground)" }}>
                  sin techo {c.rank_sin_techo ? `#${c.rank_sin_techo}` : "—"}
                </span>
                {!c.en_ambas && (
                  <span style={{ color: "var(--warning)", fontWeight: 600 }}>solo en una</span>
                )}
              </div>
            ))}
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.45 }}>
              Malla: {comparacion.vertices_con_techo.toLocaleString("es")} vért con techo ·{" "}
              {comparacion.vertices_sin_techo.toLocaleString("es")} sin él. Esto no
              ha cambiado nada todavía: elige y segmenta.
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <Button variant="outline" onClick={() => { setSinTecho(false); setComparacion(null); }} style={{ flex: 1 }}>
                Usar con techo
              </Button>
              <Button variant="outline" onClick={() => { setSinTecho(true); setComparacion(null); }} style={{ flex: 1 }}>
                Usar sin techo
              </Button>
            </div>
          </Card>
        )}
        <div style={{ height: 14 }} />
        <Slider label="Suavizado" min={0} max={10} value={smoothing} onChange={setSmoothing} />
        {/* La máscara tubular ya es un componente: el filtro de fragmentos no
            tiene nada que quitar, así que solo se ofrece con el umbral. */}
        {method === "threshold" ? (
          <>
            <div style={{ height: 14 }} />
            <Slider label="Limpieza" min={0} max={10} value={cleanup} onChange={setCleanup} />
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: -4, marginBottom: 8, lineHeight: 1.45 }}>
              {cleanup === 0
                ? "Sin filtrar: se conserva todo, incluido el ruido."
                : cleanup <= 4
                  ? "Filtra por tamaño: descarta motas y conserva cualquier fragmento que pueda ser un vaso."
                  : "Aísla las estructuras mayores: malla más limpia, pero puede dejar fuera una rama suelta."}
            </div>
          </>
        ) : (
          <div style={{ height: 14 }} />
        )}

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
              Solo la vasculatura principal
            </span>
            <span style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45, marginTop: 2 }}>
              Conserva la estructura conectada mayor y descarta el resto. En
              angiografía esa estructura es la vasculatura y lo que sobra es hueso, que
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
            checked={halfRes}
            onChange={(e) => setHalfRes(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
              Segmentar a media resolución (más rápido)
            </span>
            <span style={{ display: "block", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45, marginTop: 2 }}>
              Rompe los vasos finos; úsalo solo si el servidor tarda demasiado.
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
      {/* Habla de «Limpieza», que solo existe con el umbral clásico. */}
      {method === "threshold" && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          En estudios con hueso/cráneo, el umbral por sí solo no separa el vaso: sube «Limpieza»
          para aislar la vasculatura principal. Si el hueso queda <b style={{ color: "var(--foreground)" }}>pegado
          a la vasculatura</b>, el borrador de región (abajo) lo quita sin tocar los vasos de al lado.
        </div>
      )}

      <PreprocessSection />

      {busy && (
        <>
          {/* Sin conexión no se sabe la fase ni el porcentaje: volver a
              «preparando 0 %» parecería que el trabajo retrocede. */}
          {progressLost
            ? <div style={{ marginTop: 18 }}><ProgressBar /></div>
            : <SegmentProgress state={progress} />}
          {progressLost && (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.45 }}>
              {progress.message}. La segmentación sigue en el servidor; el resultado llegará igualmente.
            </div>
          )}
        </>
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
          {tubular && hasQuality && (
            <Metric
              label="Estanqueidad"
              value={`${boundaryEdges} aristas`}
              badge={boundaryEdges === 0 ? ["Estanca", "success"] : ["Con bordes", "warning"]}
            />
          )}
          {/* What the cleanup threw away. Without this the loss is invisible:
              a whole branch can vanish and the mesh still looks plausible.
              En tubular es la malla final sobre la máscara del umbral. */}
          {/* En tubular la cifra es malla final / máscara del umbral y el filtro
              de fragmentos no corre (`largest_removed_mm3` = 0): el badge
              «Limpio» no diría nada. «del umbral» va en la etiqueta para que
              la unidad no se parta bajo el valor. */}
          {(!tubular || hasQuality) && (
          <Metric
            label={tubular ? "Volumen conservado (del umbral)" : "Volumen conservado"}
            value={(segmentation.kept_fraction * 100).toFixed(1)}
            unit=" %"
            badge={
              tubular
                ? undefined
                : segmentation.largest_removed_mm3 >= 20
                  ? ["Revisar", "warning"]
                  : ["Limpio", "success"]
            }
          />
          )}
          {tubular && hasQuality && (
            <div style={hudLine}>
              {pieces(segmentation.components ?? 0, "pieza", "piezas")} ·{" "}
              {pieces(segmentation.seeds ?? 0, "semilla", "semillas")} · recuperados{" "}
              {mm3(segmentation.reclaimed_mm3)} mm³ · hueso vetado {mm3(segmentation.vetoed_mm3)} mm³
            </div>
          )}
          {tubular && phases && <div style={hudLine}>{phases}</div>}
          {/* El servidor cambió algo de lo pedido (sin semillas → umbral;
              media resolución forzada por memoria). No es un error: la malla
              existe, pero no es la que se pidió, y eso hay que verlo. */}
          {segmentation.fallback_note && (
            <div style={{
              fontSize: 11, lineHeight: 1.5, marginTop: 8, padding: "8px 10px",
              borderRadius: "var(--radius-md)", background: "var(--muted)",
              borderLeft: "3px solid var(--warning)", color: "var(--foreground)",
            }}>
              {segmentation.fallback_note}
            </div>
          )}
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
              Vasculatura principal aislada: fuera {segmentation.main_tree_removed}{" "}
              {segmentation.main_tree_removed === 1 ? "estructura suelta" : "estructuras sueltas"}.
            </div>
          )}
          {segmentation.main_tree_warning && (
            <div style={{
              fontSize: 11, lineHeight: 1.5, marginTop: 8, padding: "8px 10px",
              borderRadius: "var(--radius-md)", background: "var(--muted)",
              borderLeft: "3px solid var(--warning)", color: "var(--foreground)",
            }}>
              <b>No se aisló la vasculatura principal.</b> {segmentation.main_tree_warning}
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

/* Cifras del resultado tubular, en la línea mono del HUD. */
const hudLine = {
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)",
  marginTop: 6, lineHeight: 1.5, letterSpacing: ".02em",
} as const;

function pieces(n: number, one: string, many: string): string {
  return `${n.toLocaleString("es")} ${n === 1 ? one : many}`;
}

function mm3(v: number | undefined): string {
  return Math.round(v ?? 0).toLocaleString("es");
}

/** «total 40 s · tubularidad 13 s · laminaridad 14 s»: dónde se fue el
 *  tiempo. Las fases de menos de un segundo no se listan una a una (en Case 3
 *  eran ocho de quince y llenaban seis líneas); el total va delante. */
function phaseSummary(phases: Record<string, number> | undefined): string {
  if (!phases) return "";
  const secs = (v: number) => `${Math.round(v)}\u00a0s`;
  const { total, ...rest } = phases;
  const entries = Object.entries(rest);
  const slow = entries.filter(([, v]) => v >= 1).map(([name, v]) => `${name} ${secs(v)}`);
  const fast = entries.length - slow.length;
  const parts = [
    ...(total !== undefined ? [`total ${secs(total)}`] : []),
    ...slow,
    ...(fast > 0 ? [`${fast} ${fast === 1 ? "fase" : "fases"} <1\u00a0s`] : []),
  ];
  return parts.join(" · ");
}
