/* Creador de avatar por piezas (controlado). Una fila por sección: muestras
   redondas para colores y piel, píldoras para las opciones de texto. «Aleatorio»
   y «Deshacer» (pila interna de cambios) van arriba. `compacto` recoge
   Mascarilla y Fondo tras «Más piezas», que las despliega en el mismo sitio. */
import { useRef, useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import {
  CABEZAS, COLORES_PELO, ETIQUETAS, FONDOS, OJOS, PEINADOS, PIELES, PIJAMAS,
  configAleatoria, type AvatarConfig,
} from "./config";

function Fila({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--tracking-eyebrow)", color: "var(--muted-foreground)" }}>
        {titulo}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

function Muestra({ color, etiqueta, activa, onClick }: { color: string; etiqueta: string; activa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={activa}
      onClick={onClick}
      style={{
        width: 44, height: 44, borderRadius: "50%", background: color, cursor: "pointer",
        border: "1px solid var(--border)",
        boxShadow: activa ? "0 0 0 2px var(--background), 0 0 0 4px var(--foreground)" : "none",
      }}
    />
  );
}

function Pildora({ texto, activa, onClick }: { texto: string; activa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      style={{
        minHeight: 44, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: 13,
        color: "var(--foreground)",
        border: `1px solid ${activa ? "var(--primary)" : "var(--border)"}`,
        background: activa ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "var(--btn-outline-bg)",
      }}
    >
      {texto}
    </button>
  );
}

function igual(a: AvatarConfig, b: AvatarConfig): boolean {
  const ka = Object.keys(a) as (keyof AvatarConfig)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

export function AvatarCreator({ value, onChange, compacto = false }: {
  value: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  compacto?: boolean;
}) {
  const [masPiezas, setMasPiezas] = useState(false);
  const pila = useRef<AvatarConfig[]>([]);
  const [hayPila, setHayPila] = useState(false);

  const cambiar = (c: AvatarConfig) => {
    // Volver a tocar lo ya elegido no es un cambio: ni paso de «Deshacer» ni aviso.
    if (igual(c, value)) return;
    pila.current.push(value);
    setHayPila(true);
    onChange(c);
  };
  const deshacer = () => {
    const prev = pila.current.pop();
    setHayPila(pila.current.length > 0);
    if (prev) onChange(prev);
  };

  const resto = !compacto || masPiezas;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="outline" leadingIcon={<Icon name="REFRESH" size={14} />} onClick={() => cambiar(configAleatoria())}>
          Aleatorio
        </Button>
        <Button variant="outline" leadingIcon={<Icon name="UNDO" size={14} />} disabled={!hayPila} onClick={deshacer}>
          Deshacer
        </Button>
      </div>

      <Fila titulo="Piel">
        {PIELES.map((hex, i) => (
          <Muestra key={i} color={hex} etiqueta={ETIQUETAS.piel[i]} activa={value.piel === i} onClick={() => cambiar({ ...value, piel: i })} />
        ))}
      </Fila>
      <Fila titulo="Peinado">
        {PEINADOS.map((p) => (
          <Pildora key={p} texto={ETIQUETAS.peinado[p as keyof typeof ETIQUETAS.peinado]} activa={value.peinado === p} onClick={() => cambiar({ ...value, peinado: p })} />
        ))}
      </Fila>
      <Fila titulo="Color de pelo">
        {COLORES_PELO.map((c) => (
          <Muestra key={c} color={c} etiqueta={ETIQUETAS.pelo[c as keyof typeof ETIQUETAS.pelo]} activa={value.pelo === c} onClick={() => cambiar({ ...value, pelo: c })} />
        ))}
      </Fila>
      <Fila titulo="Cabeza">
        {CABEZAS.map((c) => (
          <Pildora key={c} texto={ETIQUETAS.cabeza[c as keyof typeof ETIQUETAS.cabeza]} activa={value.cabeza === c} onClick={() => cambiar({ ...value, cabeza: c })} />
        ))}
      </Fila>
      <Fila titulo="Ojos">
        {OJOS.map((o) => (
          <Pildora key={o} texto={ETIQUETAS.ojos[o as keyof typeof ETIQUETAS.ojos]} activa={value.ojos === o} onClick={() => cambiar({ ...value, ojos: o })} />
        ))}
      </Fila>
      {resto && (
        <Fila titulo="Mascarilla">
          <Pildora texto="Sin mascarilla" activa={!value.mascarilla} onClick={() => cambiar({ ...value, mascarilla: false })} />
          <Pildora texto="Con mascarilla" activa={value.mascarilla} onClick={() => cambiar({ ...value, mascarilla: true })} />
        </Fila>
      )}
      <Fila titulo="Pijama">
        {PIJAMAS.map((c) => (
          <Muestra key={c} color={c} etiqueta={ETIQUETAS.pijama[c as keyof typeof ETIQUETAS.pijama]} activa={value.pijama === c} onClick={() => cambiar({ ...value, pijama: c })} />
        ))}
      </Fila>
      {resto && (
        <Fila titulo="Fondo">
          {FONDOS.map((c) => (
            <Muestra key={c} color={c} etiqueta={ETIQUETAS.fondo[c as keyof typeof ETIQUETAS.fondo]} activa={value.fondo === c} onClick={() => cambiar({ ...value, fondo: c })} />
          ))}
        </Fila>
      )}
      {compacto && !masPiezas && (
        <div>
          <Button variant="outline" trailingIcon={<Icon name="CHEVRON_DOWN" size={14} />} onClick={() => setMasPiezas(true)}>
            Más piezas
          </Button>
        </div>
      )}
    </div>
  );
}
