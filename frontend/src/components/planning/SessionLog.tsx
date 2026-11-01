import type { LogEntry } from "../../pipeline/sessionLog";
import { cifra } from "../../lib/numero";

const dos = (n: number) => String(n).padStart(2, "0");
const hora = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
const segundos = (ms: number) => cifra(ms / 1000, 1);

/** Lo que ha pasado en la sesión, una línea por hecho, en mono. */
export function SessionLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>Aún no ha pasado nada en esta sesión</p>;
  }
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", fontFamily: "var(--font-mono)", fontSize: 12, display: "grid", gap: 4 }}>
      {entries.map((e, i) => (
        <li key={i} style={{ color: "var(--muted-foreground)" }}>
          {[hora(e.at), e.paso, e.texto, e.duracionMs != null ? `${segundos(e.duracionMs)} s` : null].filter(Boolean).join(" · ")}
        </li>
      ))}
    </ol>
  );
}
