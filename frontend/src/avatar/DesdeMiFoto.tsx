/* «Desde mi foto»: la foto se decodifica y se lee en un canvas local. Solo sale
   del navegador si la persona elige «Mi foto», y entonces la sube quien llama. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "../components/Button";
import { ErrorNote } from "../components/PanelHead";
import { useAuth } from "../store/auth";
import { AvatarCreator } from "./AvatarCreator";
import { leerRasgos, decodificarLocal, recortarLocal, MAX_BYTES, type Guia } from "./desdeFoto";
import type { AvatarConfig } from "./config";

export type ResultadoFoto = {
  config: AvatarConfig;
  mostrar: "avatar" | "foto";
  foto: Blob | null;
  /** Se eligió la foto del registro: no hay nada que subir, basta copiarla. */
  usarRegistro?: boolean;
};

type Eleccion = "avatar" | "foto" | "registro";
const V = 300; // lado del visor en px
const OVALO = { rx: 0.32 * V, ry: 0.42 * V };
const MSG_ILEGIBLE = "No hemos podido leer esa imagen. Prueba con un JPG o PNG.";

export function DesdeMiFoto({ base, onListo, onCancel, decodificar = decodificarLocal, recortar = recortarLocal }: {
  base: AvatarConfig;
  onListo: (r: ResultadoFoto) => void;
  onCancel: () => void;
  /** Inyectables para pruebas (jsdom no decodifica imágenes). */
  decodificar?: (f: File) => Promise<ImageData>;
  recortar?: (img: ImageData, guia: Guia) => Promise<Blob>;
}) {
  const { user } = useAuth();
  const [img, setImg] = useState<ImageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [config, setConfig] = useState<AvatarConfig | null>(null);
  const [eleccion, setEleccion] = useState<Eleccion>("avatar");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pinza = useRef<number | null>(null);

  const escala = img ? (V / Math.min(img.width, img.height)) * zoom : 1;

  /** Óvalo del visor expresado en píxeles de la imagen. */
  const guia = useMemo<Guia | null>(() => img && ({
    cx: img.width / 2 - off.x / escala, cy: img.height / 2 - off.y / escala,
    rx: OVALO.rx / escala, ry: OVALO.ry / escala,
  }), [img, off, escala]);

  // Dibujo del visor (en jsdom no hay contexto 2D: se omite).
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = c.getContext("2d"); } catch { ctx = null; }
    if (!ctx) return;
    const tmp = document.createElement("canvas");
    tmp.width = img.width; tmp.height = img.height;
    tmp.getContext("2d")?.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, V, V);
    ctx.drawImage(tmp, V / 2 + off.x - (img.width * escala) / 2, V / 2 + off.y - (img.height * escala) / 2,
      img.width * escala, img.height * escala);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, V, V);
    ctx.ellipse(V / 2, V / 2, OVALO.rx, OVALO.ry, 0, 0, Math.PI * 2);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(V / 2, V / 2, OVALO.rx, OVALO.ry, 0, 0, Math.PI * 2); ctx.stroke();
  }, [img, off, escala]);

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setImg(null); setConfig(null);
    if (f.size > MAX_BYTES) { setError("La foto supera 6 MB."); return; }
    // Algunos selectores de Android entregan el fichero sin tipo: entonces se intenta
    // decodificar y solo si falla se avisa. Un tipo declarado que no es imagen, fuera.
    if (f.type !== "" && !f.type.startsWith("image/")) { setError(MSG_ILEGIBLE); return; }
    try {
      const d = await decodificar(f);
      setImg(d); setZoom(1); setOff({ x: 0, y: 0 });
    } catch {
      setError(MSG_ILEGIBLE);
    }
  };

  const leer = () => {
    if (!img || !guia) return;
    const r = leerRasgos(img, guia);
    setConfig({ ...base, piel: r.piel, pelo: r.pelo as AvatarConfig["pelo"] });
  };

  const acotar = (x: number, y: number) => {
    if (!img) return { x, y };
    const mx = (img.width * escala) / 2, my = (img.height * escala) / 2;
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  const onDown = (e: React.PointerEvent) => {
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    pinza.current = null;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = punteros.current.get(e.pointerId);
    if (!p) return;
    const nuevo = { x: e.clientX, y: e.clientY };
    punteros.current.set(e.pointerId, nuevo);
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const previa = pinza.current;
      if (previa) setZoom((z) => Math.max(1, Math.min(4, z * (d / previa))));
      pinza.current = d;
      return;
    }
    setOff((o) => acotar(o.x + nuevo.x - p.x, o.y + nuevo.y - p.y));
  };
  const onUp = (e: React.PointerEvent) => { punteros.current.delete(e.pointerId); pinza.current = null; };

  const terminar = async () => {
    if (!config || !img || !guia) return;
    setBusy(true); setError(null);
    try {
      if (eleccion === "avatar") onListo({ config, mostrar: "avatar", foto: null });
      else if (eleccion === "registro") onListo({ config, mostrar: "foto", foto: null, usarRegistro: true });
      else onListo({ config, mostrar: "foto", foto: await recortar(img, guia) });
    } catch {
      setError("No hemos podido preparar la foto. Prueba con otra.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Sin `capture`: en el móvil abriría directamente la cámara frontal, sin galería;
          accept="image/*" ya ofrece las dos cosas. */}
      <input type="file" accept="image/*"
        aria-label="Elegir una foto" onChange={(e) => void elegir(e.target.files?.[0])}
        style={{ minHeight: 44, fontSize: 13, color: "var(--foreground)" }} />
      {error && <ErrorNote>{error}</ErrorNote>}

      {img && !config && (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <canvas ref={canvas} width={V} height={V} aria-label="Encaja tu cara en el óvalo"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onWheel={(e) => setZoom((z) => Math.max(1, Math.min(4, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))))}
              style={{ width: V, maxWidth: "100%", touchAction: "none", borderRadius: 12, cursor: "grab",
                background: "var(--muted)" }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--muted-foreground)" }}>
            Zoom
            <input type="range" min={1} max={4} step={0.05} value={zoom} aria-label="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1, minHeight: 44 }} />
          </label>
          <Button onClick={leer}>Leer colores</Button>
        </>
      )}

      {config && (
        <>
          <AvatarCreator value={config} onChange={setConfig} compacto />
          <div role="group" aria-labelledby="dmf-q" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <strong id="dmf-q" style={{ fontSize: 14 }}>¿Qué quieres que vean los demás?</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" aria-pressed={eleccion === "avatar"} onClick={() => setEleccion("avatar")}
                style={pildora(eleccion === "avatar")}>Mi avatar</button>
              <button type="button" aria-pressed={eleccion === "foto"} onClick={() => setEleccion("foto")}
                style={pildora(eleccion === "foto")}>Mi foto</button>
              {user?.has_photo && (
                <button type="button" aria-pressed={eleccion === "registro"} onClick={() => setEleccion("registro")}
                  style={pildora(eleccion === "registro")}>Usar la foto de mi registro</button>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
              Tu foto nunca se envía a servicios externos.
            </p>
          </div>
          <Button onClick={() => void terminar()} disabled={busy}>Listo</Button>
        </>
      )}

      <Button variant="outline" onClick={onCancel}>Cancelar</Button>
    </div>
  );
}

function pildora(activa: boolean): CSSProperties {
  return {
    minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, color: "var(--foreground)", cursor: "pointer",
    border: `1px solid ${activa ? "var(--primary)" : "var(--border)"}`,
    background: activa ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "var(--btn-outline-bg)",
  };
}
