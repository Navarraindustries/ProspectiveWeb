/* The API client's credential handling — the part that decides whether the app
   stays usable when a token dies mid-study. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, getToken, setToken, setUnauthorizedHandler } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("expired credentials", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken("un-token-valido");
  });
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
  });

  it("ends the session once when any endpoint answers 401", async () => {
    // Regression: a 401 surfaced as an error inside whichever panel made the
    // call, so the user kept clicking with a dead token instead of being sent
    // back to the login screen.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Authentication required" }, 401),
    );

    await expect(api.listPatients()).rejects.toThrow();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
  });

  it("does not end the session when the login itself is rejected", async () => {
    // A wrong password is a 401 too. Treating it as an expiry would wipe the
    // token of whoever is already signed in and show a misleading notice.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Credenciales incorrectas" }, 401),
    );

    await expect(api.login("admin", "mal")).rejects.toThrow("Credenciales incorrectas");

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getToken()).toBe("un-token-valido");
  });

  it("surfaces the server's message rather than a bare status code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "La contraseña actual no es correcta." }, 400),
    );
    await expect(api.changePassword("x", "yyyyyyyy")).rejects.toThrow(
      "La contraseña actual no es correcta.",
    );
  });

  it("sends the bearer token on authenticated calls", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse([]));
    await api.listPatients();
    const headers = new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer un-token-valido");
  });

  it("handles a 204 with no body instead of failing to parse it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.deletePatient(1)).resolves.toBeUndefined();
  });
});

describe("segmentación en segundo plano", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lanza el trabajo y pregunta hasta que el resultado está listo", async () => {
    // Una sola petición de minutos acababa en 504 detrás de un proxy, con la
    // malla sustituida en el servidor y el panel diciendo que había fallado.
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ status: "accepted" }, 202))
      .mockResolvedValueOnce(jsonResponse({ detail: "sigue en curso" }, 409))
      .mockResolvedValueOnce(jsonResponse({ mesh_url: "/data/m.vtp", vertices: 9 }));

    const r = await api.segment({ session_id: "s1" } as never, 0);

    expect(r.mesh_url).toBe("/data/m.vtp");
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe("/api/segment?background=true");
    expect(urls[1]).toBe("/api/segment/result/s1");
    expect(urls).toHaveLength(3);
  });

  it("devuelve el error del trabajo en vez de seguir preguntando", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ status: "accepted" }, 202))
      .mockResolvedValueOnce(jsonResponse({ detail: "Umbral imposible" }, 422));
    await expect(api.segment({ session_id: "s1" } as never, 0)).rejects.toThrow("Umbral imposible");
  });
});

describe("token CSRF", () => {
  afterEach(() => {
    document.cookie = "prospective_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    vi.restoreAllMocks();
  });

  it("devuelve la cookie del login en la cabecera de lo que cambia algo", async () => {
    document.cookie = "prospective_csrf=abc123; path=/";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await api.deletePatient(1);
    const headers = new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("X-CSRF-Token")).toBe("abc123");
  });

  it("no la manda en una lectura", async () => {
    document.cookie = "prospective_csrf=abc123; path=/";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));
    await api.listPatients();
    const headers = new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("X-CSRF-Token")).toBeNull();
  });
});
