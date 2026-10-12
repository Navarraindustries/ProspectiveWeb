/* The morphometry table reports two groups that fail independently.

   The bug this pins: with an open sac mesh the backend nulls the VOLUME group
   but keeps a perfectly good neck. The table gated every field on the combined
   `reliable` flag, so it showed «—» and «sin medir» for a neck of 7.0 mm and a
   DNR of 1.58 — while the 3D legend, which consulted no flag at all, went on
   annotating those same numbers over the scene. One screen, two answers. */

import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const setClinicalSite = vi.fn(async (_sid: string, site: string) =>
  ({ site, cleared: [] as string[], recalculated: [] as string[], pending: [] as string[] }));
vi.mock("../../api/client", () => ({
  api: {
    morphometry: vi.fn().mockRejectedValue(new Error("no auto-run in test")),
    morphometryNeckPlane: vi.fn(),
    longitudinal: vi.fn().mockRejectedValue(new Error("sin seguimiento")),
    setClinicalSite: (sid: string, site: string) => setClinicalSite(sid, site),
  },
}));

import { MorphometryPanel, siteChangeNotice } from "./MorphometryPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { MorphometryResult } from "../../api/types";

/** An open-cap measurement: volume group nulled, neck group measured. */
const openCap: MorphometryResult = {
  volume_mm3: 0, surface_area_mm2: 225.3, eq_sphere_diam_mm: 0,
  max_diameter_mm: 11.0, bbox_w_mm: 8, bbox_h_mm: 6,
  neck_mm: 7.0, dome_height_mm: 7.9,
  dnr: 1.58, ar: 1.13, bf: 1.58,
  compactness: 0, ui: 0, ei: 0, nsi: 0, sr: 0,
  rupture_risk_label: "Moderado",
  reliable: false, volume_valid: false, neck_valid: true,
  neck_source: "auto", neck_tilt_deg: 0, warning: null,
  centroid: { x: 0, y: 0, z: 0 }, principal_axis: [0, 0, 1],
  neck_origin: { x: 0, y: 0, z: 0 },
} as unknown as MorphometryResult;

function withMorphometry(m: MorphometryResult) {
  function Seed({ children }: { children: ReactNode }) {
    const { setSession, setMorphometry, sessionId } = usePlanning();
    useEffect(() => {
      if (!sessionId) { setSession("s1"); setMorphometry(m); }
    }, [sessionId, setSession, setMorphometry]);
    return <>{children}</>;
  }
  return render(
    <PlanningProvider>
      <Seed><MorphometryPanel onNext={() => {}} /></Seed>
    </PlanningProvider>,
  );
}

describe("an open sac mesh with a valid neck", () => {
  it("still shows the neck it measured", async () => {
    withMorphometry(openCap);
    expect(await screen.findByText("7.0")).toBeInTheDocument();
  });

  it("still shows the dome height and the neck-derived ratios", async () => {
    withMorphometry(openCap);
    expect(await screen.findByText("7.9")).toBeInTheDocument();
    // DNR and BF share a definition (Ø máx / cuello), so 1.58 appears twice.
    expect(screen.getAllByText("1.58").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1.13")).toBeInTheDocument();   // AR
  });

  it("hides the volume it could not measure", async () => {
    withMorphometry(openCap);
    await screen.findByText("7.0");
    // Surface area survives an open mesh; the enclosed volume does not.
    expect(screen.getByText("225.3")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });
});

describe("a degenerate neck on a closed sac", () => {
  const badNeck = {
    ...openCap, volume_mm3: 310.2, eq_sphere_diam_mm: 8.4, compactness: 0.72,
    neck_mm: 0, dome_height_mm: 0, dnr: 0, ar: 0, bf: 0,
    volume_valid: true, neck_valid: false,
  } as unknown as MorphometryResult;

  it("shows the volume and hides only the neck group", async () => {
    withMorphometry(badNeck);
    expect(await screen.findByText("310.2")).toBeInTheDocument();
    // The neck-derived rows must not report the zeros they were nulled to.
    expect(screen.getAllByText("sin medir").length).toBeGreaterThanOrEqual(3);
  });
});

describe("a fully valid measurement", () => {
  const good = {
    ...openCap, volume_mm3: 310.2, eq_sphere_diam_mm: 8.4, compactness: 0.72,
    reliable: true, volume_valid: true, neck_valid: true,
  } as unknown as MorphometryResult;

  it("reports both groups with no «sin medir» badges", async () => {
    withMorphometry(good);
    expect(await screen.findByText("7.0")).toBeInTheDocument();
    expect(screen.getByText("310.2")).toBeInTheDocument();
    expect(screen.queryByText("sin medir")).not.toBeInTheDocument();
  });
});

describe("SR con el cuello estimado", () => {
  // El SR se divide por la arteria madre, medida justo bajo el cuello: con un
  // cuello automático esa referencia es frágil y la cifra no puede salir con
  // un «Alto» que parezca un hallazgo.
  const conSr = (neck_source: "auto" | "manual", sr: number) => ({
    ...openCap, sr, neck_source,
    volume_mm3: 310.2, reliable: true, volume_valid: true, neck_valid: true,
  } as unknown as MorphometryResult);

  const indices = async () => fireEvent.click(await screen.findByText("Índices"));

  it("lo marca orientativo y dice por qué", async () => {
    withMorphometry(conSr("auto", 3.6));
    await indices();
    expect(await screen.findByText("orientativo")).toBeInTheDocument();
    expect(screen.queryByText("Alto")).not.toBeInTheDocument();
    expect(screen.getByText(/SR orientativo: el cuello está estimado/)).toBeInTheDocument();
  });

  it("con el borde marcado a mano vuelve a valorarlo", async () => {
    withMorphometry(conSr("manual", 3.6));
    await indices();
    expect(await screen.findByText("3.60")).toBeInTheDocument();
    expect(screen.queryByText("orientativo")).not.toBeInTheDocument();
    expect(screen.queryByText(/SR orientativo/)).not.toBeInTheDocument();
  });
});

describe("la pestaña PHASES", () => {
  it("dice junto a la cifra que es una referencia poblacional", async () => {
    // En series externas PHASES discrimina mal; dicho solo en el informe, nadie
    // lo leía delante del número.
    withMorphometry(openCap);
    fireEvent.click(await screen.findByText("PHASES"));
    expect(await screen.findByText(/referencia poblacional, no una predicción/)).toBeInTheDocument();
  });
});

describe("partes finas que inflan el Ø máximo", () => {
  const inflado = {
    ...openCap, max_diameter_mm: 8.7, body_max_diameter_mm: 5.0,
    reliable: true, volume_valid: true, neck_valid: true,
    warning: "El saco aislado incluye partes finas (ramas o ruido) que inflan el Ø máximo: 8.7 mm frente a 5.0 mm del cuerpo del aneurisma.",
  } as unknown as MorphometryResult;

  it("enseña el aviso aunque el cuello sea válido, y la cifra del cuerpo", async () => {
    // El aviso solo salía con el cuello inválido: este, y los de «cuello mayor
    // que el saco» o el del recorte, llegaban y no se veían.
    withMorphometry(inflado);
    expect(await screen.findByText(/inflan el Ø máximo/)).toBeInTheDocument();
    expect(screen.getByText("Ø máximo del cuerpo (sin ramas finas)")).toBeInTheDocument();
    expect(screen.getByText("5.0")).toBeInTheDocument();
  });
});

/* F1-13 / F1-157: el Ø máximo salía como cifra firme aunque estuviera a medio
   milímetro del corte de 10 mm, o midiera vaso padre. */
describe("el Ø máximo junto a un corte", () => {
  const cerca = { ...openCap, max_diameter_mm: 9.5 } as unknown as MorphometryResult;

  it("9,5 mm muestra el aviso de corte", async () => {
    withMorphometry(cerca);
    expect(await screen.findByText(/junto al corte de 10 mm/)).toBeInTheDocument();
  });

  it("11,0 mm no avisa", async () => {
    withMorphometry(openCap);
    await screen.findByText("7.0");
    expect(screen.queryByText(/junto al corte/)).not.toBeInTheDocument();
  });

  it("dice si el Ø del cuerpo cae al otro lado del corte", async () => {
    withMorphometry({ ...openCap, max_diameter_mm: 10.9, body_max_diameter_mm: 9.5 } as unknown as MorphometryResult);
    expect((await screen.findByText(/junto al corte de 10 mm/)).textContent).toContain("Ø del cuerpo (9,5 mm)");
  });

  it("con el saco hasta el límite del recorte, las medidas son provisionales", async () => {
    withMorphometry({
      ...openCap,
      warning: "El saco aislado llega hasta el límite del recorte: el plano de cuello dejó entrar vaso padre, así que Ø máximo, volumen y los índices describen arteria además de aneurisma.",
    } as unknown as MorphometryResult);
    await screen.findByText("7.0");
    expect(screen.getAllByText("provisional").length).toBeGreaterThanOrEqual(1);
  });
});

/* F1-151 / F1-68: «Riesgo Alto» se leía como riesgo de rotura (PHASES), y es una
   etiqueta de forma. */
describe("el riesgo morfométrico", () => {
  it("la fila «Riesgo morfométrico (forma)» existe y no dice «PHASES»", async () => {
    withMorphometry(openCap);
    const rotulo = await screen.findByText("Riesgo morfométrico (forma)");
    const fila = rotulo.closest("[data-fila-riesgo]") as HTMLElement;
    expect(fila).not.toBeNull();
    expect(fila.textContent).toContain("Moderado");
    expect(fila.textContent).not.toContain("PHASES");
  });

  it("la insignia de cabecera dice «morfométrico»", async () => {
    withMorphometry(openCap);
    expect(await screen.findByText("Riesgo morfométrico moderado")).toBeInTheDocument();
  });

  it("malla abierta sin índices muestra «Sin medir»", async () => {
    withMorphometry({ ...openCap, neck_valid: false, volume_valid: false } as unknown as MorphometryResult);
    await screen.findByText("Riesgo morfométrico (forma)");
    expect(screen.getAllByText("Sin medir").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Riesgo morfométrico moderado")).not.toBeInTheDocument();
  });
});

/* F1-162: la insignia decía «Cuello ancho» con un BF alto, que es justo el
   cuello relativamente estrecho. */
describe("el sentido del BF", () => {
  it("BF 1,65 dice «Cuello estrecho»", async () => {
    withMorphometry({ ...openCap, bf: 1.65 } as unknown as MorphometryResult);
    expect(await screen.findByText("Cuello estrecho")).toBeInTheDocument();
    expect(screen.queryByText("Cuello ancho")).not.toBeInTheDocument();
  });

  it("BF 5 no dice «Cuello ancho»", async () => {
    withMorphometry({ ...openCap, bf: 5 } as unknown as MorphometryResult);
    await screen.findByText("7.0");
    expect(screen.queryByText("Cuello ancho")).not.toBeInTheDocument();
  });
});

/* F1-160 / F1-161: la insignia y la etiqueta de riesgo cortaban en sitios
   distintos, y el corte no se veía. */
describe("un umbral por índice, a la vista", () => {
  it("el DNR lleva su umbral y su fuente en el tooltip", async () => {
    withMorphometry(openCap);
    const fila = (await screen.findByText("DNR")).closest("[title]") as HTMLElement;
    expect(fila.title).toContain("1,6");
    expect(fila.title).toContain("2,0");
  });

  it("el AR lleva su umbral en el tooltip", async () => {
    withMorphometry(openCap);
    const fila = (await screen.findByText("AR")).closest("[title]") as HTMLElement;
    expect(fila.title).toContain("1,2");
    expect(fila.title).toContain("1,6");
  });

  it("«Undulación» pasa a «Ondulación» (F1-163)", async () => {
    withMorphometry({ ...openCap, volume_valid: true } as unknown as MorphometryResult);
    fireEvent.click(await screen.findByText("Índices"));
    expect(await screen.findByText("UI · Ondulación")).toBeInTheDocument();
  });
});

/* F1-165: la localización se pedía en PHASES, ELAPSS, UIATS y Decisión, con
   cuatro listas y cuatro valores por defecto. Ahora se elige una vez. */
describe("la localización, una sola vez", () => {
  it("hay un único «Localización» y PHASES no tiene selector propio", async () => {
    withMorphometry(openCap);
    await screen.findByText("7.0");
    expect(screen.getAllByLabelText("Localización")).toHaveLength(1);
    fireEvent.click(screen.getByText("PHASES"));
    await screen.findByText(/referencia poblacional/);
    expect(screen.getAllByLabelText("Localización")).toHaveLength(1);
    expect(screen.getByText("Elige la localización en Morfometría")).toBeInTheDocument();
  });

  it("elegirla la guarda con la sesión y PHASES la hereda", async () => {
    withMorphometry(openCap);
    await screen.findByText("7.0");
    fireEvent.change(screen.getByLabelText("Localización"),
      { target: { value: "Tronco basilar" } });
    expect(setClinicalSite).toHaveBeenCalledWith("s1", "Tronco basilar");
    fireEvent.click(screen.getByText("PHASES"));
    await screen.findByText(/referencia poblacional/);
    expect(screen.queryByText("Elige la localización en Morfometría")).not.toBeInTheDocument();
    expect(screen.getByText("Tronco basilar", { selector: "b" })).toBeInTheDocument();
  });
});

/* F1-174: «Basilar (punta, tronco o AICA)» juntaba tres sitios con perforantes
   distintas. El menú ofrece los tres; el valor antiguo solo aparece si una
   sesión guardada lo trae, y pide precisarlo en vez de traducirse solo. */
describe("punta, tronco y AICA por separado", () => {
  const opciones = () => Array.from(
    (screen.getByLabelText("Localización") as HTMLSelectElement).options).map((o) => o.text);

  it("el menú ofrece las tres y no la entrada que las juntaba", async () => {
    withMorphometry(openCap);
    await screen.findByText("7.0");
    expect(opciones()).toEqual(expect.arrayContaining(["Punta basilar", "Tronco basilar", "AICA"]));
    expect(opciones().some((t) => t.startsWith("Basilar"))).toBe(false);
  });

  it("una sesión con el valor antiguo lo enseña sin precisar y ofrece las tres", async () => {
    withMorphometry({ ...openCap, site: "Basilar (punta, tronco o AICA)" } as MorphometryResult);
    await screen.findByText("7.0");
    const sel = screen.getByLabelText("Localización") as HTMLSelectElement;
    expect(sel.value).toBe("Basilar (punta, tronco o AICA)");
    expect(sel.options[sel.selectedIndex]!.text)
      .toBe("Basilar (sin precisar: elige punta, tronco o AICA)");
    expect(opciones()).toEqual(expect.arrayContaining(["Punta basilar", "Tronco basilar", "AICA"]));
    // No se ha guardado nada por abrir la pantalla: la traducción no es automática.
    expect(setClinicalSite).not.toHaveBeenCalledWith("s1", "Punta basilar");
  });
});

/* Revisión de la Tarea 2: cambiar la localización borraba en silencio. Ahora
   el servidor recalcula lo que cambia de categoría y la pantalla dice qué ha
   pasado con cada cosa. */
describe("cambiar la localización lo dice", () => {
  it("nombra lo borrado, lo recalculado y lo que queda sin categoría", () => {
    expect(siteChangeNotice({ cleared: ["Decisión"], recalculated: ["PHASES", "UIATS"], pending: [] }))
      .toBe("Se ha borrado: Decisión — vuelve a calcularla. Recalculados con la nueva localización: PHASES, UIATS.");
    expect(siteChangeNotice({ cleared: [], recalculated: [], pending: ["PHASES", "ELAPSS"] }))
      .toContain("Sin categoría para esta localización: PHASES, ELAPSS.");
    expect(siteChangeNotice({ cleared: [], recalculated: [], pending: [] })).toBe("");
  });

  it("el mensaje aparece bajo el selector", async () => {
    setClinicalSite.mockResolvedValueOnce(
      { site: "Tronco basilar", cleared: ["Decisión"], recalculated: ["PHASES"], pending: [] });
    withMorphometry(openCap);
    await screen.findByText("7.0");
    fireEvent.change(screen.getByLabelText("Localización"),
      { target: { value: "Tronco basilar" } });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se ha borrado: Decisión — vuelve a calcularla. Recalculados con la nueva localización: PHASES.");
  });
});
