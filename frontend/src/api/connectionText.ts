/* Los dos textos de «el servidor no contesta», en un solo sitio.

   Los usan el cliente (api/client.ts, al convertir un fallo de `fetch` o el
   límite en ApiError 0) y LoadState (components/LoadState.tsx, al traducir un
   fallo de carga). LoadState no puede importarlos del cliente: las pruebas de
   cada página simulan `../api/client` con `vi.mock`, y con la simulación esas
   constantes desaparecen. Este módulo no importa nada, así que se puede
   importar en cualquier prueba; antes había dos copias que podían divergir. */

/** Lo que se ve cuando la petición ni siquiera llega al servidor. */
export const SIN_CONEXION = "Sin conexión con el servidor";
/** Lo que se ve cuando llegó pero no contesta dentro del límite, o cuando el
 *  proxy devuelve un 5xx vacío con el backend caído. */
export const NO_RESPONDE = "El servidor no responde";
