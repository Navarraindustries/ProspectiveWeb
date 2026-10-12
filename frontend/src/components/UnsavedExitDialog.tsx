/* Aviso «Tienes cambios sin guardar» al salir del espacio de trabajo.

   Solo ofrecía «Seguir aquí» o «Salir sin guardar»: para no perder la tarde
   había que cerrar el aviso, buscar «Guardar progreso» y volver a pulsar el
   enlace (F1-110). «Guardar y salir» usa el mismo guardado que ese botón (lo
   presta Workspace al store) y solo navega si salió bien; si falla, el aviso
   se queda abierto y lo dice dentro, porque detrás no se ve la barra. */

import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ARCHIVAR_EN_CASO } from "../lib/textos";

const ERROR_GUARDAR = "No se pudo guardar el progreso. Vuelve a intentarlo o sal sin guardar.";

export function UnsavedExitDialog({ open, hasPatient, attached, onStay, onLeave, saveNow }: {
  open: boolean;
  /** Con paciente fijado el botón que ata la sesión se llama «Archivar en un caso». */
  hasPatient: boolean;
  /** La sesión ya tiene estudio archivado en un caso. */
  attached: boolean;
  onStay: () => void;
  onLeave: () => void;
  saveNow: () => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerrar = (f: () => void) => () => { setError(null); f(); };
  const guardarYSalir = async () => {
    setSaving(true);
    setError(null);
    let ok = false;
    try { ok = await saveNow(); } catch { ok = false; }
    setSaving(false);
    if (ok) onLeave();
    else setError(ERROR_GUARDAR);
  };
  // El mismo nombre que el botón de la barra superior (F1-107).
  const botonCaso = hasPatient ? ARCHIVAR_EN_CASO : "Adjuntar a un caso";
  return (
    <ConfirmDialog
      open={open}
      title="Tienes cambios sin guardar"
      destructive
      busy={saving}
      cancelLabel="Seguir aquí"
      extraLabel={saving ? "Guardando…" : "Guardar y salir"}
      onExtra={() => void guardarYSalir()}
      confirmLabel="Salir sin guardar"
      onCancel={cerrar(onStay)}
      onConfirm={cerrar(onLeave)}
    >
      Esta sesión tiene resultados que no se han guardado. Si sales ahora se
      perderán: usa <b style={{ color: "var(--foreground)" }}>Guardar progreso</b> en
      la barra superior para poder reanudarla después.
      {!attached && (hasPatient ? (
        <> Además no está archivada en ningún caso: con <b style={{ color: "var(--foreground)" }}>{botonCaso}</b> su
        DICOM queda en un caso de este paciente.</>
      ) : (
        <> Además no está adjunta a ningún caso: con <b style={{ color: "var(--foreground)" }}>{botonCaso}</b> queda
        ligada a un paciente y su DICOM archivado.</>
      ))}
      {error && <div role="alert" style={{ marginTop: 10, color: "var(--destructive)", fontWeight: 600 }}>{error}</div>}
    </ConfirmDialog>
  );
}
