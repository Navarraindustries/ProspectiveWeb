/* Lo que ocupa un archivo, para leerlo de un vistazo.

   F2-73: cada sesión guardada es una copia completa (unos 342 MB) y la ficha
   no lo decía; quien acumulaba siete no sabía por qué borrar las viejas.
   Unidades de 1024 —las que da el explorador de archivos— y coma decimal de
   es-ES: «342 MB», «1,2 GB». Por debajo de 10 un decimal, porque «1 GB» y
   «1,4 GB» no son lo mismo; de 10 en adelante el decimal ya no cambia nada. */

const UNIDADES = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let valor = bytes;
  let u = 0;
  while (valor >= 1024 && u < UNIDADES.length - 1) {
    valor /= 1024;
    u += 1;
  }
  // Los bytes sueltos no tienen decimales: «512 B», nunca «512,0 B».
  const decimales = u > 0 && valor < 10 ? 1 : 0;
  const texto = new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimales, useGrouping: false }).format(valor);
  return `${texto} ${UNIDADES[u]}`;
}
