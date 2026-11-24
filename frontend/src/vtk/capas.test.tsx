/* UNI-175: «Capas». Cada capa se oculta y vuelve, ocultar no toca nada más
   que lo que se ve, y la cabecera avisa de lo que está oculto. */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { conCapa, contarOcultas, estadoCapas, textoOcultas, type Capa, type CapasPresentes } from "./capas";
import { CapasControl } from "./hud/CapasControl";

const todas: CapasPresentes = { cuello: true, medidas: true, linea: true, saco: true, dispositivos: true };

describe("el estado de las capas", () => {
  it("de entrada todo se ve, salvo las medidas, que son opcionales y no cuentan como ocultas", () => {
    const e = estadoCapas(new Set(), todas, false);
    expect(e.filter((c) => c.visible).map((c) => c.id)).toEqual(["cuello", "linea", "saco", "dispositivos"]);
    expect(contarOcultas(e)).toBe(0);
  });

  it("cada capa se oculta y vuelve", () => {
    for (const capa of ["cuello", "linea", "saco", "dispositivos"] as Capa[]) {
      const oculta = conCapa(new Set(), capa, false);
      expect(estadoCapas(oculta, todas, false).find((c) => c.id === capa)!.visible).toBe(false);
      const vuelta = conCapa(oculta, capa, true);
      expect(estadoCapas(vuelta, todas, false).find((c) => c.id === capa)!.visible).toBe(true);
    }
  });

  it("solo cuenta lo oculto que existe en la escena", () => {
    const ocultas = new Set<Capa>(["linea", "dispositivos"]);
    expect(contarOcultas(estadoCapas(ocultas, todas, false))).toBe(2);
    expect(contarOcultas(estadoCapas(ocultas, { ...todas, linea: false }, false))).toBe(1);
    expect(textoOcultas(1)).toBe("1 capa oculta");
    expect(textoOcultas(2)).toBe("2 capas ocultas");
  });

  it("no modifica el conjunto de antes", () => {
    const antes = new Set<Capa>(["saco"]);
    conCapa(antes, "linea", false);
    expect([...antes]).toEqual(["saco"]);
  });
});

function Probar({ onMedidas = () => {} }: { onMedidas?: (v: boolean) => void }) {
  const [ocultas, setOcultas] = useState<Set<Capa>>(new Set());
  const [medidas, setMedidas] = useState(false);
  return (
    <CapasControl capas={estadoCapas(ocultas, { ...todas, linea: false }, medidas)}
      onChange={(c, v) => {
        if (c === "medidas") { setMedidas(v); onMedidas(v); } else setOcultas((o) => conCapa(o, c, v));
      }} />
  );
}

describe("el control de la cabecera", () => {
  it("despliega una casilla por capa; la que no existe en el paso sale apagada", () => {
    render(<Probar />);
    fireEvent.click(screen.getByRole("button", { name: /CAPAS/ }));
    expect(screen.getByRole("checkbox", { name: "Marcas del cuello" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Medidas" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Línea central" })).toBeDisabled();
    expect(screen.getByText(/las medidas, el plan y el informe siguen igual/)).toBeInTheDocument();
  });

  it("con una capa oculta lo dice en la cabecera, y deja de decirlo al volver a mostrarla", () => {
    render(<Probar />);
    expect(screen.queryByTestId("capas-ocultas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /CAPAS/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Dispositivos" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Saco aislado" }));
    expect(screen.getByTestId("capas-ocultas")).toHaveTextContent("2 CAPAS OCULTAS");
    fireEvent.click(screen.getByRole("checkbox", { name: "Dispositivos" }));
    expect(screen.getByTestId("capas-ocultas")).toHaveTextContent("1 CAPA OCULTA");
    fireEvent.click(screen.getByRole("checkbox", { name: "Saco aislado" }));
    expect(screen.queryByTestId("capas-ocultas")).toBeNull();
  });

  it("«Medidas» enciende la misma casilla que Morfometría y no cuenta como oculta", () => {
    const onMedidas = vi.fn();
    render(<Probar onMedidas={onMedidas} />);
    fireEvent.click(screen.getByRole("button", { name: /CAPAS/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Medidas" }));
    expect(onMedidas).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId("capas-ocultas")).toBeNull();
  });

  it("Escape y un clic fuera lo pliegan", () => {
    render(<div><Probar /><button type="button">fuera</button></div>);
    fireEvent.click(screen.getByRole("button", { name: /CAPAS/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Capas de la escena 3D" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /CAPAS/ }));
    fireEvent.pointerDown(screen.getByText("fuera"));
    expect(screen.queryByRole("group", { name: "Capas de la escena 3D" })).toBeNull();
  });
});
