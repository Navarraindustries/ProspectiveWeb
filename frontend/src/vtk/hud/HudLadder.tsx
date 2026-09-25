import { useEffect, useRef, useState } from "react";
import { ladderTicks } from "./ladder";

/** Cinta vertical de cortes en el borde derecho, como la escalera de altitud. */
export function HudLadder({ count, index }: { count: number; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el); setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const ticks = h > 0 ? ladderTicks(count, index, h) : [];
  return (
    <div ref={ref} style={{ position: "absolute", right: 0, top: 24, bottom: 24, width: 44, overflow: "hidden" }}>
      {ticks.map((t) => (
        <span key={t.index} style={{ position: "absolute", right: 0, top: t.y, width: t.major ? 14 : 7, height: 1, background: "var(--hud-dim)" }}>
          {t.major && <span style={{ position: "absolute", right: 16, top: -6, fontSize: 9, color: "var(--hud-dim)" }}>{t.index + 1}</span>}
        </span>
      ))}
      <span style={{ position: "absolute", right: 4, top: h / 2 - 8, padding: "1px 4px", fontSize: 10, color: "var(--hud)", border: "var(--hud-line) solid var(--hud)", background: "#000" }}>
        {index + 1}
      </span>
    </div>
  );
}
