/* Rótulos y detalle del registro de auditoría (F2-60, F1-100).

   El servidor guarda códigos de acción en inglés o en minúsculas; quien audita
   necesita leerlos en castellano. El código original se conserva en pantalla
   para poder cruzarlo con el servidor. */

const ACCIONES: Record<string, string> = {
  GENESIS: "Inicio de la cadena",
  LOGIN: "Inicio de sesión",
  INTEGRITY_CHECK: "Verificación de integridad",
  SEGMENTATION_COMPLETE: "Segmentación completada",
  TREATMENT_DECISION: "Decisión de tratamiento",
  DEVICE_PLACED: "Dispositivo colocado",
  REPORT_GENERATED: "Informe generado",
  DICOM_SR_GENERATED: "Informe DICOM SR generado",
  DICOM_SEG_GENERATED: "Segmentación DICOM generada",
  PATIENT_DELETED: "Paciente eliminado",
  PATIENT_SHARED: "Paciente compartido",
  CASE_DELETED: "Caso eliminado",
  STUDY_DELETED: "Estudio eliminado",
  USER_DELETED: "Usuario eliminado",
  USER_SIGNUP_REQUESTED: "Solicitud de cuenta",
  USER_APPROVED: "Cuenta aprobada",
  USER_REJECTED: "Cuenta rechazada",
  USER_CREATED: "Cuenta creada",
  USER_ROLE_CHANGED: "Rol cambiado",
  USER_DEACTIVATED: "Cuenta desactivada",
  USER_REACTIVATED: "Cuenta reactivada",
  SESSION_ATTACHED: "Sesión asociada al caso",
  SESSION_SAVED: "Sesión guardada",
  SAVED_SESSION_DELETED: "Sesión guardada eliminada",
  SAVED_SESSION_RENAMED: "Sesión guardada renombrada",
  ANNOTATIONS_DELETED: "Anotaciones eliminadas",
  CAPTURE_SAVED: "Captura guardada",
  CAPTURE_DELETED: "Captura eliminada",
  RECORDING_SAVED: "Grabación guardada",
  LESION_CONFIRMED: "Lesión confirmada",
  LESION_RETRACTED: "Lesión retirada",
  password_change: "Cambio de contraseña",
  password_reset: "Restablecimiento de contraseña",
  clip_order_created: "Pedido de clips creado",
  clip_order_deleted: "Pedido de clips eliminado",
  clip_order_status: "Estado del pedido de clips",
  clip_order_received: "Pedido de clips recibido",
  clip_order_rejected: "Pedido de clips rechazado",
  clip_order_verified: "Pedido de clips verificado",
  clip_order_packet_downloaded: "Paquete del pedido descargado",
  clip_workshop_added: "Taller de clips añadido",
};

export function etiquetaAccion(code: string): string {
  return ACCIONES[code] ?? code;
}

const CLAVES: Record<string, string> = {
  target: "Cuenta", session_id: "Sesión", part_no: "Nº de pieza", role: "Rol", workshop: "Taller",
  username: "Usuario", user_ids: "Usuarios", status: "Estado", reason: "Motivo",
  patient_id: "Paciente", patient: "Paciente", pages: "Páginas", ok: "Correcto", broken: "Bloques rotos",
  label: "Nombre", kind: "Tipo", case: "Caso", capture: "Captura", step: "Paso", study: "Estudio",
  detalle: "Detalle",
};

/** La clave del detalle en castellano; una desconocida pierde los «_» y toma mayúscula inicial. */
export function etiquetaClave(clave: string): string {
  const conocida = CLAVES[clave];
  if (conocida) return conocida;
  const texto = clave.replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function valor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "Sí";
  if (v === false) return "No";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x !== null ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** El `payload_json` como pares clave · valor, con las claves ya en castellano;
 *  lo que no es un objeto JSON se muestra entero para no ocultar nada a quien audita. */
export function detalleDelBloque(payloadJson: string): [string, string][] {
  if (!payloadJson) return [];
  try {
    const p: unknown = JSON.parse(payloadJson);
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return Object.entries(p as Record<string, unknown>).map(([k, v]) => [etiquetaClave(k), valor(v)]);
    }
    return [[etiquetaClave("detalle"), valor(p)]];
  } catch {
    return [[etiquetaClave("detalle"), payloadJson]];
  }
}
