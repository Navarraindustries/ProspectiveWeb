/* Textos que más de una pantalla repite y que deben decir lo mismo.

   «Archivar en un caso» es el nombre del botón que ata la sesión a un caso; los
   avisos de captura y de vídeo lo nombran para que quien lee sepa qué pulsar.
   Una sola constante evita que el aviso mande a un botón que se llama distinto. */
export const ARCHIVAR_EN_CASO = "Archivar en un caso";

/* Sin caso la descarga es lo esperado, no un fallo: el aviso explica por qué la
   imagen o el vídeo no quedan en la ficha y qué hacer para que queden. Da el
   nombre del archivo para poder encontrarlo entre las descargas (fila 30 del
   triaje F3): el nombre es la fecha y la hora, nada del paciente. */
export const sinCasoAviso = (que: "Captura descargada" | "Vídeo descargado", archivo: string) =>
  `${que} en la carpeta de descargas como «${archivo}». No queda en la ficha porque la sesión no tiene caso: «${ARCHIVAR_EN_CASO}».`;
