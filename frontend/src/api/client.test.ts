/* The API client's credential handling — the part that decides whether the app
   stays usable when a token dies mid-study. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError, GET_TIMEOUT_MS, LONG_TIMEOUT_MS, RESTORE_TIMEOUT_MS, api, hasSession, markSession,
  onServerDown, resetServerHealth,
  retryLastFailed, setUnauthorizedHandler,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("expired credentials", () => {
  beforeEach(() => {
    localStorage.clear();
    markSession(true);
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
    expect(hasSession()).toBe(false);
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
    expect(hasSession()).toBe(true);
  });

  it("surfaces the server's message rather than a bare status code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "La contraseña actual no es correcta." }, 400),
    );
    await expect(api.changePassword("x", "yyyyyyyy")).rejects.toThrow(
      "La contraseña actual no es correcta.",
    );
  });

  it("no manda ningún token: la sesión va en la cookie httpOnly", async () => {
    // El JWT en localStorage lo podía leer cualquier script de la página.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse([]));
    await api.listPatients();
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
    expect(init.credentials).toBe("same-origin");
    expect(Object.keys(localStorage).some((k) => /token/i.test(k))).toBe(false);
  });

  it("lo que cambia algo lleva el token CSRF de la cookie", async () => {
    document.cookie = "prospective_csrf=abc123";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await api.deletePatient(1);
    const headers = new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("X-CSRF-Token")).toBe("abc123");
    document.cookie = "prospective_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
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

/* Familia T (F1-24, F1-25, F1-26): el servidor caído se ve. La auditoría vio
   morir el backend tras reanudar y el cliente decía «Failed to fetch» en el
   panel que tocara, o nada: un «CARGANDO…» para siempre. */
describe("servidor que cae o no responde", () => {
  beforeEach(() => {
    resetServerHealth();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetServerHealth();
  });

  it("un fetch que no llega al servidor es un ApiError 0 en castellano", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.listPatients().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe("Sin conexión con el servidor");
  });

  it("dos fallos de conexión seguidos activan el aviso; uno solo no", async () => {
    const aviso = vi.fn();
    const quitar = onServerDown(aviso);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await api.listPatients().catch(() => {});
    expect(aviso).not.toHaveBeenCalled();
    await api.listPatients().catch(() => {});
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenLastCalledWith(true);

    // Vuelve: el aviso se retira con la primera respuesta.
    fetchSpy.mockResolvedValue(jsonResponse([]));
    await api.listPatients();
    expect(aviso).toHaveBeenLastCalledWith(false);
    quitar();
  });

  it("un fallo y luego una respuesta no avisan", async () => {
    const aviso = vi.fn();
    const quitar = onServerDown(aviso);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("x"));
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    fetchSpy.mockRejectedValueOnce(new TypeError("x"));
    await api.listPatients().catch(() => {});
    await api.listPatients();
    await api.listPatients().catch(() => {});
    expect(aviso).not.toHaveBeenCalled();
    quitar();
  });

  it("el 500 vacío que da el proxy con el backend caído cuenta como caída", async () => {
    const aviso = vi.fn();
    const quitar = onServerDown(aviso);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 500 }));
    await api.listPatients().catch(() => {});
    await api.listPatients().catch(() => {});
    expect(aviso).toHaveBeenCalledWith(true);
    quitar();
  });

  it("un 500 con explicación del servidor no es un servidor caído", async () => {
    // El servidor contestó: decir «no responde» sería mentir, y el panel ya
    // enseña su explicación (p. ej. el corredor que falló en el proceso hijo).
    const aviso = vi.fn();
    const quitar = onServerDown(aviso);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ detail: "El cálculo del corredor falló en el servidor" }, 500));
    await api.listPatients().catch(() => {});
    await api.listPatients().catch(() => {});
    expect(aviso).not.toHaveBeenCalled();
    quitar();
  });

  it("restaurar sin respuesta corta tras el límite con un ApiError 0", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_p, init) =>
      new Promise((_res, rej) => {
        (init as RequestInit).signal?.addEventListener("abort", () =>
          rej(new DOMException("aborted", "AbortError")));
      }));
    const p = api.restoreSession("abc").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS + 10);
    const err = await p;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });
});

/* Revisión de la tarea 6: el «Reintentar» de la banda no repite escrituras, el
   500 vacío del proxy se reconoce como «no responde», y un servidor colgado
   (el supervisor con el puerto, sin contestar) también salta. */
describe("servidor caído · revisión", () => {
  beforeEach(() => { resetServerHealth(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetServerHealth();
  });

  it("tras un POST fallido, «Reintentar» sondea con un GET y nunca reenvía el POST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("x"));
    await api.restoreSession("abc").catch(() => {});
    fetchSpy.mockResolvedValueOnce(jsonResponse({ username: "admin" }));
    await expect(retryLastFailed()).resolves.toBe("probed");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![0]).toBe("/api/auth/me");
    const init = fetchSpy.mock.calls[1]![1] as RequestInit;
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  it("tras un GET fallido, «Reintentar» lo repite", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("x"));
    await api.listPatients().catch(() => {});
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    await expect(retryLastFailed()).resolves.toBe("replayed");
    expect(fetchSpy.mock.calls[1]![0]).toBe("/api/patients");
  });

  it("fromServer: falso sin conexión y en el 500 vacío del proxy; cierto si el servidor explica", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("x"));
    const sinConexion = (await api.listPatients().catch((e: unknown) => e)) as ApiError;
    expect(sinConexion.fromServer).toBe(false);

    fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));
    const proxy = (await api.listPatients().catch((e: unknown) => e)) as ApiError;
    expect(proxy.status).toBe(500);
    expect(proxy.fromServer).toBe(false);

    fetchSpy.mockResolvedValueOnce(jsonResponse({ detail: "El cálculo falló" }, 500));
    const servidor = (await api.listPatients().catch((e: unknown) => e)) as ApiError;
    expect(servidor.fromServer).toBe(true);
  });

  it("una petición que nunca vuelve se corta tras el límite y la segunda activa el aviso", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_p, init) =>
      new Promise((_res, rej) => {
        (init as RequestInit).signal?.addEventListener("abort", () =>
          rej(new DOMException("aborted", "AbortError")));
      }));
    const aviso = vi.fn();
    const quitar = onServerDown(aviso);

    const p1 = api.listPatients().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(GET_TIMEOUT_MS + 10);
    const e1 = (await p1) as ApiError;
    expect(e1).toBeInstanceOf(ApiError);
    expect(e1.status).toBe(0);
    expect(e1.message).toBe("El servidor no responde");
    expect(e1.fromServer).toBe(false);
    expect(aviso).not.toHaveBeenCalled();

    const p2 = api.listPatients().catch(() => {});
    await vi.advanceTimersByTimeAsync(GET_TIMEOUT_MS + 10);
    await p2;
    expect(aviso).toHaveBeenCalledWith(true);
    quitar();
  });

  it("los POST largos tienen su propio límite, mayor que el de las lecturas", () => {
    expect(LONG_TIMEOUT_MS).toBeGreaterThan(GET_TIMEOUT_MS);
  });
});
