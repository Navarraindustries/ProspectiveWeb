/* «Fijar orientación»: para un 3DRA/XA sin ImageOrientationPatient, el
   usuario dice cómo ve el axial (qué borde es anterior, si el primer corte es
   el más superior). Se aplica al instante en el visor (store) y se guarda en
   el estado de sesión (PUT), que es lo que vuelve al reanudarla. No toca los
   datos: solo etiquetas, cinta de rumbo y maniquí. */

import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { ErrorNote } from "../components/PanelHead";
import { Select } from "../components/Select";
import { Sheet } from "../components/Sheet";
import { DEFAULT_MANUAL_ORIENTATION, type ManualOrientation } from "./geometry";

const EDGE_OPTIONS = [
  { value: "top", label: "Arriba" },
  { value: "right", label: "A la derecha" },
  { value: "bottom", label: "Abajo" },
  { value: "left", label: "A la izquierda" },
];
const FIRST_SLICE_OPTIONS = [
  { value: "inf", label: "El más inferior" },
  { value: "sup", label: "El más superior" },
];

export function OrientationSheet({ open, onClose, sessionId, current, onApply }: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  /** Lo que el visor asume ahora mismo: el diálogo arranca ahí. */
  current: ManualOrientation | null;
  /** null devuelve el visor a la orientación asumida (restablecer tras un fallo). */
  onApply: (m: ManualOrientation | null) => void;
}) {
  const start = current ?? DEFAULT_MANUAL_ORIENTATION;
  const [anteriorEdge, setAnteriorEdge] = useState(start.anteriorEdge);
  const [firstSliceSuperior, setFirstSliceSuperior] = useState(start.firstSliceSuperior);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre, parte de lo vigente, no de lo que se tocó y se
  // descartó la vez anterior.
  useEffect(() => {
    if (!open) return;
    setAnteriorEdge(start.anteriorEdge);
    setFirstSliceSuperior(start.firstSliceSuperior);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = async () => {
    setBusy(true);
    setError(null);
    const m: ManualOrientation = { anteriorEdge, firstSliceSuperior };
    // Primero el visor: las etiquetas cambian aunque la red tarde.
    const previous = current;
    onApply(m);
    try {
      await api.setOrientation(sessionId, { anterior_edge: anteriorEdge, first_slice_superior: firstSliceSuperior });
      onClose();
    } catch {
      // Si no se guardó, no puede quedarse en pantalla: sin corchetes parecería
      // conocida y al reanudar la sesión volvería la anterior.
      onApply(previous);
      setError("No se guardó la orientación; se ha restablecido la anterior");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Fijar orientación" width={400}>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5 }}>
        Este volumen no trae la orientación del paciente en el DICOM. Indica cómo
        se ve el axial y las etiquetas, la cinta de rumbo y el maniquí dejarán de
        ser una suposición. Los datos no cambian.
      </div>
      <Select label="En el axial, el borde anterior está…" options={EDGE_OPTIONS} value={anteriorEdge}
        onChange={(e) => setAnteriorEdge(e.target.value as ManualOrientation["anteriorEdge"])} />
      <div style={{ height: 10 }} />
      <Select label="El primer corte es…" options={FIRST_SLICE_OPTIONS} value={firstSliceSuperior ? "sup" : "inf"}
        onChange={(e) => setFirstSliceSuperior(e.target.value === "sup")} />
      <ErrorNote>{error}</ErrorNote>
      <div style={{ height: 16 }} />
      <Button onClick={() => void apply()} disabled={busy}>Aplicar</Button>
    </Sheet>
  );
}
