/* «Desde mi foto»: la foto se decodifica y se lee en un canvas local. Solo sale
   del navegador si la persona elige «Mi foto», y entonces la sube quien llama.
   Esc cierra este panel (no la hoja ni el recorrido que lo contienen): la raíz
   lleva `data-escape-propio` para que la capa de bienvenida lo deje pasar. */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { ErrorNote } from "../components/PanelHead";
import { useAuth } from "../store/auth";
import { AvatarCreator } from "./AvatarCreator";
import { AvatarSvg } from "./AvatarSvg";
import "./avatar.css";
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
const ZOOM_MIN = 1, ZOOM_MAX = 4;
const entreZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/** Desplazamiento acotado: el centro del óvalo nunca sale de la imagen. Si ya cabe, el mismo objeto. */
export function acotarDesplazamiento(o: { x: number; y: number }, ancho: number, alto: number, escala: number) {
  const mx = (ancho * escala) / 2, my = (alto * escala) / 2;
  const x = Math.max(-mx, Math.min(mx, o.x)), y = Math.max(-my, Math.min(my, o.y));
  return x === o.x && y === o.y ? o : { x, y };
}

/** Píxeles del canvas por píxel CSS: el visor se encoge con `max-width: 100%` en pantallas estrechas. */
export function pixelesPorCss(c: { width: number; clientWidth: number }): number {
  return c.clientWidth > 0 ? c.width / c.clientWidth : 1;
}

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
  const [arrastrando, setArrastrando] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const miniatura = useRef<HTMLCanvasElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const idEntrada = useId();
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pinza = useRef<number | null>(null);
  // Un solo lienzo con la imagen por foto: arrastrar y hacer zoom solo redibujan, no copian la foto entera.
  const fuente = useRef<{ img: ImageData; lienzo: HTMLCanvasElement } | null>(null);
  const lienzoDe = useCallback((d: ImageData): HTMLCanvasElement | null => {
    if (fuente.current?.img === d) return fuente.current.lienzo;
    const c = document.createElement("canvas");
    c.width = d.width; c.height = d.height;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = c.getContext("2d"); } catch { ctx = null; }
    if (!ctx) return null;
    ctx.putImageData(d, 0, 0);
    fuente.current = { img: d, lienzo: c };
    return c;
  }, []);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const escala = img ? (V / Math.min(img.width, img.height)) * zoom : 1;

  // Al alejar, el desplazamiento que valía con más zoom puede sacar el óvalo de la foto: se vuelve a acotar.
  useEffect(() => {
    if (img) setOff((o) => acotarDesplazamiento(o, img.width, img.height, escala));
  }, [img, escala]);

  // Esc cierra «Desde mi foto» y nada más: se atiende en captura y no sigue hacia la hoja o el recorrido.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      onCancelRef.current();
    };
    window.addEventListener("keydown", alPulsar, true);
    return () => window.removeEventListener("keydown", alPulsar, true);
  }, []);

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
    const tmp = lienzoDe(img);
    if (!tmp) return;
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
  }, [img, off, escala, lienzoDe]);

  // Rueda = zoom. React registra «wheel» como pasivo: sin un escuchador propio no
  // se puede impedir que la misma rueda desplace también la hoja.
  const visor = !!img && !config;
  useEffect(() => {
    const c = canvas.current;
    if (!visor || !c) return;
    const alRodar = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => entreZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    };
    c.addEventListener("wheel", alRodar, { passive: false });
    return () => c.removeEventListener("wheel", alRodar);
  }, [visor]);

  // Miniatura de «Mi foto»: el óvalo encuadrado, dibujado en local.
  useEffect(() => {
    const c = miniatura.current;
    if (!c || !img || !guia || !config) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = c.getContext("2d"); } catch { ctx = null; }
    if (!ctx) return;
    const tmp = lienzoDe(img);
    if (!tmp) return;
    const lado = 2 * Math.max(guia.rx, guia.ry);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(tmp, guia.cx - lado / 2, guia.cy - lado / 2, lado, lado, 0, 0, c.width, c.height);
  }, [img, guia, config, lienzoDe]);

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

  const acotar = (x: number, y: number) => (img ? acotarDesplazamiento({ x, y }, img.width, img.height, escala) : { x, y });

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
      if (previa) setZoom((z) => entreZoom(z * (d / previa)));
      pinza.current = d;
      return;
    }
    // El puntero se mueve en px CSS; el desplazamiento vive en px del canvas.
    const k = pixelesPorCss(e.currentTarget as HTMLCanvasElement);
    setOff((o) => acotar(o.x + (nuevo.x - p.x) * k, o.y + (nuevo.y - p.y) * k));
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

  const paso = !img ? 1 : !config ? 2 : 3;
  const PASOS = ["Elige tu foto", "Encuadra tu cara", "Ajusta y elige"];

  return (
    <div data-escape-propio="" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ol className="dmf-pasos" aria-label="Pasos" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {PASOS.map((t, i) => (
          <li key={t} className="dmf-paso" aria-current={paso === i + 1 ? "step" : undefined}
            data-estado={paso === i + 1 ? "actual" : paso > i + 1 ? "hecho" : "pendiente"}>
            <span className="dmf-paso__n" aria-hidden="true">{i + 1}</span>{t}
          </li>
        ))}
      </ol>

      {/* Sin `capture`: en el móvil abriría directamente la cámara frontal, sin galería;
          accept="image/*" ya ofrece las dos cosas. El input es invisible: lo dibuja la zona. */}
      <input ref={entrada} id={idEntrada} className="dmf-oculto" type="file" accept="image/*"
        aria-label="Elegir una foto"
        onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ""; }} />

      {!img && (
        <label htmlFor={idEntrada} className="dmf-zona" data-arrastrando={arrastrando}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); void elegir(e.dataTransfer.files?.[0]); }}>
          <span className="dmf-zona__icono" aria-hidden="true"><Icon name="UPLOAD" size={22} /></span>
          <span className="dmf-zona__titulo">Elige una foto</span>
          <span className="dmf-zona__sub">o arrástrala aquí · JPG o PNG, hasta 6 MB</span>
        </label>
      )}
      {!img && (
        <p className="dmf-aviso">
          <Icon name="LOCK" size={14} />
          <span>La foto se lee aquí, en tu equipo. No se sube nada salvo que al final elijas «Mi foto».</span>
        </p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      {img && !config && (
        <>
          <p className="dmf-instruccion">Arrastra la foto para centrar tu cara en el óvalo y acerca con el zoom.</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <canvas ref={canvas} width={V} height={V} aria-label="Encaja tu cara en el óvalo"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ width: V, maxWidth: "100%", touchAction: "none", borderRadius: 16, cursor: "grab",
                background: "var(--muted)", border: "1px solid var(--border)" }} />
          </div>
          <label className="dmf-zoom">
            Zoom
            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={zoom} aria-label="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))} />
            <span className="dmf-zoom__valor" aria-hidden="true">{zoom.toFixed(1).replace(".", ",")}×</span>
          </label>
        </>
      )}

      {config && img && guia && (
        <>
          <div className="dmf-previa">
            <AvatarSvg config={config} size={72} title="Vista previa de tu avatar" />
            <div>
              <strong>Así quedarías</strong>
              <span>Hemos tomado el tono de piel y el color de pelo de tu foto. Cambia lo que quieras.</span>
            </div>
          </div>
          <AvatarCreator value={config} onChange={setConfig} compacto />
          <div role="group" aria-labelledby="dmf-q" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <strong id="dmf-q" style={{ fontSize: 14 }}>¿Qué quieres que vean los demás?</strong>
            <div className="dmf-opciones">
              <Opcion titulo="Mi avatar" sub="Se guarda solo el dibujo. Tu foto se descarta."
                activa={eleccion === "avatar"} onClick={() => setEleccion("avatar")}
                miniatura={<AvatarSvg config={config} size={44} />} />
              <Opcion titulo="Mi foto" sub="Se sube tu foto recortada a Prospective al guardar."
                activa={eleccion === "foto"} onClick={() => setEleccion("foto")}
                miniatura={<canvas ref={miniatura} width={88} height={88} style={{ width: 44, height: 44 }} />} />
              {user?.has_photo && (
                <Opcion titulo="Usar la foto de mi registro" sub="Se copia la foto que enviaste al pedir la cuenta."
                  activa={eleccion === "registro"} onClick={() => setEleccion("registro")}
                  miniatura={<Icon name="USER" size={20} />} />
              )}
            </div>
            <p className="dmf-aviso">
              <Icon name="LOCK" size={14} />
              <span>Tu foto nunca se envía a servicios externos.</span>
            </p>
          </div>
        </>
      )}

      {/* En estrecho, «Cambiar foto» va en su propia fila y «Cancelar» + la acción principal, juntas debajo. */}
      <div className="dmf-acciones">
        {img && (
          <Button variant="ghost" className="dmf-acciones__cambiar" leadingIcon={<Icon name="UPLOAD" size={14} />}
            onClick={() => entrada.current?.click()}>
            Cambiar foto
          </Button>
        )}
        <span className="dmf-acciones__fin">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          {img && !config && (
            <Button onClick={leer} leadingIcon={<Icon name="SPARKLE" size={14} />}>Leer colores</Button>
          )}
          {config && (
            <Button onClick={() => void terminar()} disabled={busy}>Listo</Button>
          )}
        </span>
      </div>
    </div>
  );
}

function Opcion({ titulo, sub, activa, onClick, miniatura }: {
  titulo: string; sub: string; activa: boolean; onClick: () => void; miniatura: ReactNode;
}) {
  const id = useId();
  return (
    <button type="button" className="dmf-opcion" aria-pressed={activa} aria-label={titulo}
      aria-describedby={id} onClick={onClick}>
      <span className="dmf-opcion__miniatura" aria-hidden="true">{miniatura}</span>
      <span className="dmf-opcion__texto">
        <span className="dmf-opcion__titulo">{titulo}</span>
        <span className="dmf-opcion__sub" id={id}>{sub}</span>
      </span>
      <span className="dmf-opcion__marca" aria-hidden="true" />
    </button>
  );
}
