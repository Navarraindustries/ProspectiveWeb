import { expect, it } from "vitest";
import { nombreVideoRecorrido } from "./grabarRecorrido";

it("el nombre lleva la fecha y la extensión del formato, nada más", () => {
  const cuando = new Date(2026, 10, 17, 9, 5);
  expect(nombreVideoRecorrido("video/mp4", cuando)).toBe("recorrido-vaso-2026-11-17-0905.mp4");
  expect(nombreVideoRecorrido("video/webm", cuando)).toBe("recorrido-vaso-2026-11-17-0905.webm");
});
