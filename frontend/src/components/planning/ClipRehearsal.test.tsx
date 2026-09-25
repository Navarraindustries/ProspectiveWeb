/* The rehearsal has to end where the plan puts the clip, and it has to admit
   which part of the motion is assumed. Those two are what make it usable for
   rehearsing rather than merely pretty. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clipAnimation = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    clipAnimation: (...a: unknown[]) => clipAnimation(...a),
    clipRecommendations: vi.fn().mockResolvedValue([]),
    listCustomClips: vi.fn().mockResolvedValue([]),
  },
}));

import { ClipRehearsal, sacFrameFor } from "./ClipRehearsal";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { ClipAnimationResult, MorphometryResult } from "../../api/types";

const anim: ClipAnimationResult = {
  body_url: "/data/anim_body.vtp?v=1",
  blade_a_url: "/data/anim_blade_a.vtp?v=1",
  blade_b_url: "/data/anim_blade_b.vtp?v=1",
  hinge: { x: 0.4, y: 0, z: 0 },
  hinge_axis: [0, 0, 1],
  swing_deg: 21,
  mechanics_assumed: true,
  sac_frames: ["/data/anim_sac_1.vtp", "/data/anim_sac_2.vtp",
               "/data/anim_sac_3.vtp", "/data/anim_sac_4.vtp"],
  sac_frames_note: "Ilustración geométrica.",
  approach_entry: { x: 0, y: 0, z: -24 },
  approach_target: { x: 0, y: 0, z: 0 },
  approach_is_default: true,
  position: { x: 1, y: 2, z: 3 },
  normal: [0, 0, 1],
  rotation_deg: 0,
  clip_name: "NAVARRO™ T1 Recto 10.0 mm",
};

const morpho = {
  neck_origin: { x: 1, y: 2, z: 3 },
  principal_axis: [0, 0, 1],
  centroid: { x: 1, y: 2, z: 5 },
  dome_height_mm: 4,
} as unknown as MorphometryResult;

function withSession(seen: { rehearsal?: unknown } = {}) {
  function Seed({ children }: { children: ReactNode }) {
    const { sessionId, setSession, setMorphometry, clipRehearsal } = usePlanning();
    useEffect(() => {
      if (!sessionId) { setSession("s1"); setMorphometry(morpho); }
    }, [sessionId, setSession, setMorphometry]);
    seen.rehearsal = clipRehearsal;
    return <>{children}</>;
  }
  return render(
    <PlanningProvider>
      <Seed><ClipRehearsal clipId="navarro:t1:0:10.0" clipName="NAVARRO T1 10 mm" /></Seed>
    </PlanningProvider>,
  );
}

beforeEach(() => {
  clipAnimation.mockReset();
  clipAnimation.mockResolvedValue(anim);
});

describe("preparing the rehearsal", () => {
  it("offers it before anything is fetched", async () => {
    withSession();
    expect(await screen.findByRole("button", { name: /Preparar ensayo/ })).toBeInTheDocument();
  });

  it("asks the backend for the clip that is actually selected", async () => {
    withSession();
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    await waitFor(() => expect(clipAnimation).toHaveBeenCalled());
    const [sid, req] = clipAnimation.mock.calls[0] as [string, Record<string, unknown>];
    expect(sid).toBe("s1");
    const placements = req.placements as Array<Record<string, unknown>>;
    expect(placements[0].clip_id).toBe("navarro:t1:0:10.0");
  });

  it("ends the run where the plan puts the clip", async () => {
    // A rehearsal that finished anywhere else would show a manoeuvre the plan
    // does not agree with.
    withSession();
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    await waitFor(() => expect(clipAnimation).toHaveBeenCalled());
    const [, req] = clipAnimation.mock.calls[0] as [string, Record<string, unknown>];
    const placements = req.placements as Array<Record<string, unknown>>;
    expect(placements[0].position).toEqual(morpho.neck_origin);
  });

  it("hands the three moving parts to the viewer", async () => {
    const seen: { rehearsal?: unknown } = {};
    withSession(seen);
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    await waitFor(() => expect(seen.rehearsal).not.toBeNull());
  });
});

describe("what the rehearsal admits", () => {
  it("says the opening is assumed, not specified", async () => {
    // A closed STL records no mechanism; implying otherwise would be a claim
    // about a part nobody has characterised.
    withSession();
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    expect(await screen.findByText(/está supuesta/)).toBeInTheDocument();
    expect(screen.getByText(/no registra el mecanismo/)).toBeInTheDocument();
  });

  it("flags a corridor it invented for want of a marked one", async () => {
    withSession();
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    expect(await screen.findByText("corredor por defecto")).toBeInTheDocument();
    expect(screen.getByText(/Marca Entrada y Diana/)).toBeInTheDocument();
  });

  it("says nothing about a default when the corridor was marked", async () => {
    clipAnimation.mockResolvedValue({ ...anim, approach_is_default: false });
    withSession();
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    await screen.findByText(/apertura 21/);
    expect(screen.queryByText("corredor por defecto")).not.toBeInTheDocument();
  });
});

describe("driving it", () => {
  it("can be played and scrubbed", async () => {
    withSession();
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    expect(await screen.findByRole("button", { name: /Reproducir/ })).toBeInTheDocument();
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(slider).toHaveValue("80");
  });

  it("leaves the rehearsal and puts the scene back", async () => {
    // Otherwise the viewer keeps three loose parts where the placed clip was.
    const seen: { rehearsal?: unknown } = {};
    withSession(seen);
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    await waitFor(() => expect(seen.rehearsal).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Salir del ensayo/ }));
    await waitFor(() => expect(seen.rehearsal).toBeNull());
  });

  it("reports a failure instead of pretending it prepared", async () => {
    clipAnimation.mockRejectedValue(new Error("malla ilegible"));
    withSession();
    fireEvent.click(await screen.findByRole("button", { name: /Preparar ensayo/ }));
    await waitFor(() => expect(screen.getByText(/malla ilegible/)).toBeInTheDocument());
  });
});

/* El saco estrechándose durante el cierre.
 *
 * Pedido como ILUSTRACIÓN: solo geometría, sin propiedades físicas ni mecánicas
 * del clip ni de su material. La deformación no se puede mover con una matriz
 * —es otra geometría por cada momento del cierre, calculada en el backend— así
 * que el ensayo dice qué fotograma toca y el visor lo enseña. */
describe("qué fotograma del saco constreñido toca", () => {
  it("mientras el clip baja, ninguno", () => {
    // Enseñar el saco ya deformado durante el recorrido diría que el clip
    // aprieta antes de llegar.
    expect(sacFrameFor(0, 4)).toBeNull();
    expect(sacFrameFor(-0.2, 4)).toBeNull();
  });

  it("recorre los fotogramas conforme se cierra", () => {
    expect(sacFrameFor(0.1, 4)).toBe(0);
    expect(sacFrameFor(0.5, 4)).toBe(1);
    expect(sacFrameFor(0.8, 4)).toBe(3);
    expect(sacFrameFor(1, 4)).toBe(3);
  });

  it("no se pasa del último aunque el reloj se pase", () => {
    expect(sacFrameFor(2.5, 4)).toBe(3);
  });

  it("sin fotogramas —no hay saco aislado— no se enseña nada", () => {
    expect(sacFrameFor(1, 0)).toBeNull();
  });
});

/* Colocar y verificar con un ensayo abierto.
 *
 * Mientras hay ensayo el visor enseña sus tres piezas EN LUGAR del clip
 * colocado, así que si las piezas se quedan donde las dejó el recorrido,
 * «Colocar y verificar» no cambia nada en pantalla y parece que el clip no se
 * coloca. Reportado así por el usuario probando el caso real. */
describe("al colocar el clip con el ensayo abierto", () => {
  function conPiezas(seen: { matrices: Record<string, number[] | null> }) {
    function Seed({ children }: { children: ReactNode }) {
      const { sessionId, setSession, setMorphometry, registerClipParts, setDeviceMesh } = usePlanning();
      useEffect(() => {
        if (sessionId) return;
        setSession("s1");
        setMorphometry(morpho);
        registerClipParts({
          has: () => true,
          setMatrix: (id, m) => { seen.matrices[id] = m; },
          render: () => {},
        });
      }, [sessionId, setSession, setMorphometry, registerClipParts]);
      return (
        <>
          <button type="button" onClick={() => setDeviceMesh("clips", "/data/clips.vtp?v=9")}>
            colocar-de-mentira
          </button>
          {children}
        </>
      );
    }
    return render(
      <PlanningProvider>
        <Seed><ClipRehearsal clipId="navarro:t1:0:10.0" clipName="NAVARRO T1 10 mm" /></Seed>
      </PlanningProvider>,
    );
  }

  it("sienta las piezas en la pose del plan", async () => {
    const seen = { matrices: {} as Record<string, number[] | null> };
    conPiezas(seen);
    fireEvent.click(await screen.findByText("Preparar ensayo"));
    await screen.findByText(/Momento de la maniobra/);

    // Recién preparado, el clip está en la entrada del corredor (z = −24).
    const entrada = seen.matrices["clip-body"];
    expect(entrada).toBeTruthy();
    expect(entrada![14]).toBeCloseTo(-24, 3);

    fireEvent.click(screen.getByText("colocar-de-mentira"));

    // Colocado: las piezas se sientan donde el plan pone el clip (1, 2, 3).
    await waitFor(() => {
      const m = seen.matrices["clip-body"]!;
      expect([m[12], m[13], m[14]]).toEqual([1, 2, 3]);
    });
    // Y la maniobra queda contada como terminada: cerrando, no entrando.
    expect(screen.getByText(/Cerrando sobre el cuello/)).toBeInTheDocument();
  });

  it("abrir el ensayo sobre un clip ya colocado no se salta el recorrido", () => {
    // Si sentara siempre que hay clip colocado, preparar el ensayo despues de
    // haberlo colocado empezaria por el final y no habria nada que ver.
    const seen = { matrices: {} as Record<string, number[] | null> };
    conPiezas(seen);
    fireEvent.click(screen.getByText("colocar-de-mentira"));
    return (async () => {
      fireEvent.click(await screen.findByText("Preparar ensayo"));
      await screen.findByText(/Momento de la maniobra/);
      expect(seen.matrices["clip-body"]![14]).toBeCloseTo(-24, 3);
      expect(screen.getByText(/Entrando por el corredor/)).toBeInTheDocument();
    })();
  });
});
