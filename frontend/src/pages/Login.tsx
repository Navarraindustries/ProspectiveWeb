/* Login — panel de marca + formulario. Autenticación real con JWT. */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Icon } from "../components/Icon";
import { AuthBrand } from "../components/shell/AuthBrand";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../store/auth";
import { ApiError } from "../api/client";
import { serverErrorText } from "../api/errorText";
import { CONTACTO_ADMIN } from "../lib/contacto";

/** Qué decirle a quien no pudo entrar.
 *
 *  Si el servidor contestó, se repite lo que dijo: un 403 explica por qué la
 *  cuenta no puede entrar, un 429 cuánto queda de bloqueo, un 422 qué campo
 *  no vale. El aviso de conexión queda para cuando NO hubo respuesta (fetch
 *  falló): antes se enseñaba para cualquier código que no fuera 401 o 403, y
 *  decía «¿está el backend en marcha?» de un backend que acababa de contestar.
 *  Cuando el cuerpo no traía detalle, `ApiError.message` es «Error NNN»; eso
 *  no le dice nada a un médico, así que se reescribe.
 *
 *  F1-41: sin respuesta (sin red, el límite, o el 500 vacío del proxy con el
 *  backend caído) el aviso ya no habla de «backend»: dice que el servidor no
 *  responde y a quién avisar. Desde la Tarea 6 el cliente lanza ApiError 0
 *  en vez de TypeError, así que la clase sola ya no distingue el caso. */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 401) {
    // Al quinto fallo se bloquea la entrada quince minutos; avisar del último
    // intento evita que alguien que duda de su contraseña se quede fuera sin
    // saber que estaba a uno.
    const left = (err.data as { remaining_attempts?: number } | undefined)?.remaining_attempts;
    return left === 1
      ? "Credenciales incorrectas. Te queda un intento antes del bloqueo temporal."
      : "Credenciales incorrectas";
  }
  return serverErrorText(err);
}

export function Login({ onLogin, onSignup, notice }: { onLogin: () => void; onSignup: () => void; notice?: string | null }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  // El temporizador que quita el temblor sobrevivía a la pantalla: si se salía
  // (o la prueba terminaba) antes de 500 ms, `setShake` caía sobre un componente
  // desmontado y Vitest lo contaba como error sin manejar, a veces sí y a veces no.
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(user, pass);
      onLogin();
    } catch (err) {
      setError(loginErrorMessage(err));
      setShake(true);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--canvas)" }}>
      <AuthBrand flex="1 1 62%" />

      {/* Form panel */}
      <div className="login-form" style={{ flex: "1 1 38%", display: "flex", flexDirection: "column", padding: "0 clamp(24px, 4vw, 72px)", minWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 24 }}>
          <button
            onClick={() => navigate("/")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-sans)", padding: 0 }}
          >
            ← Página principal
          </button>
          <ThemeToggle />
        </div>
        <div
          className={shake ? "shake" : undefined}
          style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 380, width: "100%", margin: "0 auto" }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "var(--tracking-title)", color: "var(--foreground)" }}>
            Iniciar sesión
          </div>
          <div style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 6, marginBottom: 28 }}>
            Introduce tus credenciales para acceder a la plataforma.
          </div>
          {notice && (
            <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--success-bg)", border: "1px solid color-mix(in srgb, var(--success) 40%, transparent)", color: "var(--success)", fontSize: 12 }}>
              {notice}
            </div>
          )}
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label="Usuario"
              icon={<Icon name="USER" />}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="tu usuario"
              autoComplete="username"
              invalid={!!error}
            />
            <Input
              label="Contraseña"
              icon={<Icon name="LOCK" />}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              invalid={!!error}
              hint={error ?? undefined}
            />
            <Button type="submit" size="lg" style={{ marginTop: 6 }} disabled={busy || !user || !pass}>
              {busy ? "Verificando…" : "Entrar"}
            </Button>
          </form>
          {/* F1-1: no hay recuperación automática de contraseña; sin esta línea
              quien la olvida no sabe que existe un camino ni cuál. */}
          <p style={{ marginTop: 16, marginBottom: 0, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>
            ¿Olvidaste la contraseña? Un administrador puede restablecerla: escribe a{" "}
            <a href={`mailto:${CONTACTO_ADMIN}`} style={{ color: "var(--brand-deep)", fontWeight: 600 }}>{CONTACTO_ADMIN}</a>
          </p>
          {/* F2-11: la misma frase, literal, en «Entrar» y tras «Crear cuenta»; el
              servidor no envía notificaciones, así que se dice con claridad. */}
          <p style={{ marginTop: 16, marginBottom: 0, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>
            Si tu cuenta aún no está aprobada, no recibirás ningún aviso: vuelve a intentar entrar más tarde.
          </p>
          <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
            ¿No tienes cuenta?{" "}
            <button
              type="button"
              onClick={onSignup}
              style={{ background: "transparent", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 }}
            >
              Crear cuenta
            </button>
          </div>
        </div>
        <div style={{ textAlign: "center", paddingBottom: 24, fontSize: 11, color: "var(--muted-foreground)" }}>
          PROSPECTIVE™ Web — Laboratorio de Imagen Médica
        </div>
      </div>
    </div>
  );
}
