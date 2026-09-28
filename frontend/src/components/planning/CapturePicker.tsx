/* Elegir qué capturas entran en el informe, y en qué orden.

   El informe no mete todas las capturas del caso ni escoge por su cuenta: las
   elige el profesional. Y el ORDEN es suyo también —son su relato del caso,
   no un volcado por fecha—, así que se numeran conforme se marcan y el PDF
   las enseña en ese orden, no en el de la lista.

   Las miniaturas necesitan el JWT, así que van por blob y URL de objeto, que
   se sueltan al desmontar: son memoria del navegador. */

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../api/client";
import type { CaptureOut } from "../../api/types";
import { SectionLabel } from "../PanelHead";

export function CapturePicker({
  imagingStudyId, caseId, value, onChange,
}: {
  imagingStudyId?: number | null;
  caseId?: number | null;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [rows, setRows] = useState<CaptureOut[] | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const urlsRef = useRef<Record<number, string>>({});
  urlsRef.current = urls;

  const cargar = useCallback(async () => {
    if (caseId == null && imagingStudyId == null) { setRows([]); return; }
    try {
      // Por caso cuando se sabe: un informe cubre el caso, y puede querer una
      // imagen del TAC inicial junto a otra de la angiografía de control.
      setRows(await api.listCaptures(
        caseId != null ? { caseId } : { imagingStudyId: imagingStudyId ?? undefined },
      ));
    } catch {
      setRows([]);   // sin capturas que ofrecer; el informe sale igual
    }
  }, [caseId, imagingStudyId]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    if (!rows) return;
    let vivo = true;
    (async () => {
      for (const r of rows) {
        if (urlsRef.current[r.id]) continue;
        try {
          const url = await api.captureObjectUrl(r.id);
          if (!vivo) { URL.revokeObjectURL(url); return; }
          setUrls((u) => ({ ...u, [r.id]: url }));
        } catch { /* una miniatura que no carga no impide elegirla */ }
      }
    })();
    return () => { vivo = false; };
  }, [rows]);

  useEffect(() => () => {
    for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
  }, []);

  const alternar = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  if (rows === null) return <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Cargando capturas…</div>;
  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
        No hay capturas guardadas en este caso. Se hacen con el botón «Captura» del visor,
        en cualquier paso, y desde aquí se elige cuáles entran en el informe.
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>Capturas en el informe ({value.length} de {rows.length})</SectionLabel>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "2px 0 8px", lineHeight: 1.5 }}>
        Salen en el orden en que las marques, con su rótulo y de dónde se tomaron.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {rows.map((c) => {
          const pos = value.indexOf(c.id);
          const elegida = pos >= 0;
          return (
            <label key={c.id}
              style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                padding: 6, borderRadius: "var(--radius-md)",
                border: `1px solid ${elegida ? "var(--brand-deep)" : "var(--border)"}`,
                background: elegida ? "var(--brand-subtle)" : "transparent",
              }}>
              <input type="checkbox" checked={elegida} onChange={() => alternar(c.id)} />
              <span aria-hidden="true" style={{
                width: 18, textAlign: "center", fontSize: 11, fontWeight: 700,
                fontFamily: "var(--font-mono)", color: elegida ? "var(--brand-deep)" : "var(--muted-foreground)",
              }}>
                {elegida ? pos + 1 : "·"}
              </span>
              {urls[c.id] ? (
                <img src={urls[c.id]} alt=""
                  style={{ width: 64, height: 40, objectFit: "cover", background: "#000", borderRadius: 3, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 64, height: 40, background: "#000", borderRadius: 3, flexShrink: 0 }} />
              )}
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 12, color: "var(--foreground)", lineHeight: 1.3, wordBreak: "break-word" }}>
                  {c.label}
                </span>
                <span style={{ display: "block", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>
                  {c.step} · {new Date(c.created_at).toLocaleDateString()}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
