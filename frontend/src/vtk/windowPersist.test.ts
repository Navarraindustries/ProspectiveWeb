/* F1-248: la ventana y el nivel se guardaban solo en el navegador y reanudar
   volvía a la del DICOM. El visor la manda al servidor al soltar el arrastre:
   con un rebote de 500 ms, un arrastre es UNA petición con el valor final. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWindowSaver } from "./windowPersist";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("guardar la ventana con la sesión", () => {
  it("un arrastre entero manda solo el último valor, 500 ms después", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const saver = createWindowSaver(send);
    saver.push("s1", { wc: 40, ww: 400 });
    saver.push("s1", { wc: 60, ww: 420 });
    saver.push("s1", { wc: 80, ww: 450 });
    vi.advanceTimersByTime(499);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("s1", { wc: 80, ww: 450 });
  });

  it("no repite la ventana que ya mandó", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const saver = createWindowSaver(send);
    saver.push("s1", { wc: 80, ww: 450 });
    vi.advanceTimersByTime(500);
    saver.push("s1", { wc: 80, ww: 450 });
    vi.advanceTimersByTime(500);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("cancelar (cambio de sesión, desmontar) no manda lo pendiente", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const saver = createWindowSaver(send);
    saver.push("s1", { wc: 10, ww: 100 });
    saver.cancel();
    vi.advanceTimersByTime(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it("un fallo del servidor no rompe nada y se puede volver a mandar", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("caído")).mockResolvedValue(undefined);
    const saver = createWindowSaver(send);
    saver.push("s1", { wc: 10, ww: 100 });
    await vi.advanceTimersByTimeAsync(500);
    saver.push("s1", { wc: 10, ww: 100 });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
