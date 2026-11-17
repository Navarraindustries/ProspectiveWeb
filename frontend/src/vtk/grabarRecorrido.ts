/* El nombre del vídeo del recorrido por dentro del vaso: fecha y hora, nada
   del paciente (como las capturas y las grabaciones del visor). */

export function nombreVideoRecorrido(mimeType: string, cuando: Date = new Date()): string {
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const d = (n: number) => String(n).padStart(2, "0");
  return `recorrido-vaso-${cuando.getFullYear()}-${d(cuando.getMonth() + 1)}-${d(cuando.getDate())}-${d(cuando.getHours())}${d(cuando.getMinutes())}.${ext}`;
}
