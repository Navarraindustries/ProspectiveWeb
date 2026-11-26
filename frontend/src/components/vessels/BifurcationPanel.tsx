/* Ángulo de bifurcación junto al aneurisma, guiado (backend
   services/angulo_bifurcacion.py): se marcan la arteria madre y las dos ramas
   hijas sobre el 3D (tres clics seguidos), y el servidor traza dos líneas
   centrales madre → hija, con el saco medido fuera para que no atajen por él,
   y mide dónde se separan.

   Guiado y no automático: en 5 aneurismas de bifurcación de Zenodo la red de
   vasos no permitía decidir cuál es la madre y cuáles las hijas (en angio-TC
   salían 5 a 11 vasos alrededor del cuello); quien mira la anatomía lo sabe. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Position3D } from "../../api/types";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Metric } from "../Metric";
import { PanelHead, ErrorNote, SectionLabel } from "../PanelHead";
import { usePlanning, type BifPuntos, type PickMode } from "../../store/planning";
import { cifra, coordenadas } from "../../lib/numero";

type Vec3 = [number, number, number];

const PASOS: { cual: keyof BifPuntos; modo: PickMode; rotulo: string; ayuda: string }[] = [
  { cual: "madre", modo: "bif_madre", rotulo: "Madre", ayuda: "en la arteria de la que salen las ramas, unos milímetros antes de la bifurcación" },
  { cual: "hija1", modo: "bif_hija1", rotulo: "Hija 1", ayuda: "en una rama, unos milímetros pasada la bifurcación" },
  { cual: "hija2", modo: "bif_hija2", rotulo: "Hija 2", ayuda: "en la otra rama" },
];

const pos = (p: Vec3): Position3D => ({ x: p[0], y: p[1], z: p[2] });
const vec = (p: Position3D): Vec3 => [p.x, p.y, p.z];

export function BifurcationPanel() {
  const { sessionId, segmentation, pickMode, setPickMode, bifPuntos, setBifPuntos, bifResultado, setBifResultado } = usePlanning();
  const hasMesh = !!segmentation?.mesh_url;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lo medido en esta sesión (se guarda con ella): al volver a abrirla se ve.
  useEffect(() => {
    if (!sessionId || !hasMesh || bifResultado) return;
    let vivo = true;
    api.leerBifurcacion(sessionId)
      .then((r) => {
        if (!vivo || !r) return;
        setBifResultado(r);
        setBifPuntos({ madre: vec(r.madre), hija1: vec(r.hija_1), hija2: vec(r.hija_2) });
      })
      .catch(() => { /* sin medida guardada se empieza de cero */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hasMesh]);

  const marcando = pickMode === "bif_madre" || pickMode === "bif_hija1" || pickMode === "bif_hija2";
  const completos = !!(bifPuntos.madre && bifPuntos.hija1 && bifPuntos.hija2);

  const empezar = () => {
    setError(null);
    setBifResultado(null);
    setBifPuntos({ madre: null, hija1: null, hija2: null });
    setPickMode("bif_madre");
  };

  const medir = async () => {
    if (!sessionId || !completos) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.medirBifurcacion(sessionId, {
        madre: pos(bifPuntos.madre!), hija_1: pos(bifPuntos.hija1!), hija_2: pos(bifPuntos.hija2!),
      });
      setBifResultado(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo medir el ángulo de bifurcación. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-rise">
      <PanelHead
        title="Ángulo de bifurcación"
        desc="Marca la arteria madre y las dos ramas que salen junto al aneurisma: ángulo entre las ramas y de cada una respecto a la madre."
      />
      {!hasMesh && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "8px 0 14px" }}>
          Segmenta el vaso primero para poder marcar puntos sobre él.
        </div>
      )}

      <SectionLabel>Tres clics sobre el 3D</SectionLabel>
      <ol style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 10px", paddingLeft: 18, lineHeight: 1.5 }}>
        {PASOS.map((p) => (
          <li key={p.cual} style={{ fontWeight: pickMode === p.modo ? 600 : undefined, color: pickMode === p.modo ? "var(--foreground)" : undefined }}>
            <strong>{p.rotulo}</strong>: {p.ayuda}.{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: bifPuntos[p.cual] ? "var(--success)" : undefined }}>
              {bifPuntos[p.cual] ? coordenadas(bifPuntos[p.cual]) : "—"}
            </span>
          </li>
        ))}
      </ol>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Button variant={marcando ? "default" : "outline"} size="sm" style={{ flex: 1 }} disabled={!hasMesh || busy}
                onClick={() => (marcando ? setPickMode(null) : empezar())}
                leadingIcon={<Icon name={completos && !marcando ? "STATUS_OK" : "SEED"} size={14} />}>
          {marcando ? "Clic en el vaso… (Esc cancela)" : completos ? "Volver a marcar" : "Marcar madre e hijas"}
        </Button>
        <Button size="sm" style={{ flex: 1 }} disabled={!completos || busy || marcando} onClick={() => void medir()}>
          {busy ? "Midiendo…" : "Medir ángulo"}
        </Button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {bifResultado && (
        <>
          <SectionLabel>Resultado</SectionLabel>
          <Metric label="Entre las dos hijas" value={cifra(bifResultado.angulo_hijas_deg, 0)} unit="°" />
          <Metric label="Hija 1 respecto a la madre" value={cifra(bifResultado.angulo_hija1_deg, 0)} unit="°" />
          <Metric label="Hija 2 respecto a la madre" value={cifra(bifResultado.angulo_hija2_deg, 0)} unit="°" />
          <Metric label="Ø madre" value={cifra(bifResultado.diametro_madre_mm, 1)} unit=" mm" />
          <Metric label="Ø hijas" value={`${cifra(bifResultado.diametro_hija1_mm, 1)} · ${cifra(bifResultado.diametro_hija2_mm, 1)}`} unit=" mm" />
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
            Respecto a la madre, 0° es seguir recto. Las direcciones se toman
            a {cifra(bifResultado.medido_a_mm, 1)} mm de la bifurcación (dos diámetros de la madre)
            {bifResultado.sin_saco ? ", con las líneas trazadas sin pasar por el saco medido." : ". Sin saco medido: si una línea cruza el aneurisma, mide primero el saco."}
          </div>
        </>
      )}
    </div>
  );
}
