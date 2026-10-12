/* F1-25: «Restaurando sesión…» se quedaba para siempre con el servidor caído.
   Pasado el límite (ApiError 0) se dice que no responde y se ofrece «Reintentar». */
import { describe, expect, it } from "vitest";
import { ApiError } from "./api/client";
import { RESTORE_NO_SERVER, restoreFailure } from "./restoreFailure";

describe("restoreFailure", () => {
  it("sin respuesta: el texto del anexo y se puede reintentar", () => {
    expect(RESTORE_NO_SERVER).toBe("No se pudo restaurar; el servidor no responde");
    expect(restoreFailure(new ApiError(0, "Sin conexión con el servidor")))
      .toEqual({ text: RESTORE_NO_SERVER, retry: true });
  });
  it("un 500 del servidor enseña su explicación y se puede reintentar", () => {
    expect(restoreFailure(new ApiError(500, "No se pudo restaurar la sesión: el proceso que la copiaba se cayó.")))
      .toEqual({ text: "No se pudo restaurar la sesión: el proceso que la copiaba se cayó.", retry: true });
  });
  it("un 409 (archivos purgados) no se arregla reintentando", () => {
    expect(restoreFailure(new ApiError(409, "La sesión existe pero sus archivos ya no están")))
      .toEqual({ text: "La sesión existe pero sus archivos ya no están", retry: false });
  });
});
