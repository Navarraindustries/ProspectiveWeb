/* Login — el vídeo de marca a pantalla completa (UNI-133) y, encima, la columna
   de marca a la izquierda y la ventana del formulario a la derecha, centradas
   juntas. Autenticación real con JWT. */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Icon } from "../components/Icon";
import { Logo } from "../components/shell/Logo";
import { useTableta } from "../hooks/useEstrecho";
import { AuthBrand, BARRA_SOBRE_VIDEO, ColumnaMarca, REJILLA_MARCA } from "../components/shell/AuthBrand";
import { AuthWindow } from "../components/shell/AuthWindow";
import { Ambiente } from "../components/Ambiente";
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
  const tableta = useTableta();
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
    <Ambiente>
      {/* Desde 1024 px el vídeo cubre la pantalla, fijo, por debajo de todo; en
          tableta y móvil no se pinta y la ventana va sobre el Ambiente. */}
      {!tableta && <AuthBrand />}
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100dvh" }}>
        {/* Zona del formulario: la ventana de cristal, centrada. */}
        <div className="login-form" style={{ flex: "1 1 100%", display: "flex", flexDirection: "column", padding: tableta ? "0 16px" : "0 32px", minWidth: "0px" }}>
          {/* Sobre el vídeo, la barra va con los tokens del tema oscuro en los dos
              temas. En escritorio el logotipo no va aquí: encabeza la columna de marca. */}
          <div {...(tableta ? {} : BARRA_SOBRE_VIDEO)} style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, paddingTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: tableta ? 1 : undefined, justifyContent: "space-between" }}>
              <Button variant="ghost" size={tableta ? "md" : "sm"} leadingIcon={<Icon name="BACK" />} onClick={() => navigate("/")}>
                Página principal
              </Button>
              <ThemeToggle size={tableta ? "lg" : "md"} />
            </div>
          </div>
          {tableta && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 16 }}>
              <Logo variante="linea" size={32} />
            </div>
          )}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 0" }}>
            {/* Escritorio: la columna de marca a la izquierda y la ventana a la derecha. */}
            <div style={tableta ? { width: "100%", display: "flex", justifyContent: "center" } : { ...REJILLA_MARCA, alignItems: "center" }}>
            {!tableta && <ColumnaMarca alLogo={() => navigate("/")} />}
            <div className={shake ? "shake" : undefined} style={{ width: "100%", maxWidth: 440 }}>
              <AuthWindow titulo="Iniciar sesión" subtitulo="Accede con tu cuenta de Prospective.">
                {notice && (
                  <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--success-bg)", border: "1px solid color-mix(in srgb, var(--success) 40%, transparent)", color: "var(--success)", fontSize: 13 }}>
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
                  <Button type="submit" style={{ marginTop: 6, width: "100%", height: "var(--control-md)" }} disabled={busy || !user || !pass}>
                    {busy ? "Verificando…" : "Entrar"}
                  </Button>
                </form>
                {/* F1-1: no hay recuperación automática de contraseña; sin esta línea
                    quien la olvida no sabe que existe un camino ni cuál. */}
                <p style={{ marginTop: 16, marginBottom: 0, textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
                  ¿Olvidaste la contraseña? Un administrador puede restablecerla: escribe a{" "}
                  <a href={`mailto:${CONTACTO_ADMIN}`} style={{ color: "var(--brand-deep)", fontWeight: 600 }}>{CONTACTO_ADMIN}</a>
                </p>
                {/* F2-11: la misma frase, literal, en «Entrar» y tras «Crear cuenta»; el
                    servidor no envía notificaciones, así que se dice con claridad. */}
                <p style={{ marginTop: 16, marginBottom: 0, textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
                  Si tu cuenta aún no está aprobada, no recibirás ningún aviso: vuelve a intentar entrar más tarde.
                </p>
                <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
                  ¿No tienes cuenta?{" "}
                  <Button type="button" variant="link" onClick={onSignup}>Crear cuenta</Button>
                </div>
              </AuthWindow>
            </div>
            </div>
          </div>
          <div {...(tableta ? {} : BARRA_SOBRE_VIDEO)} style={{ textAlign: "center", paddingBottom: 24, fontSize: 13, color: "var(--muted-foreground)" }}>
            Prospective™ Web — Laboratorio de Imagen Médica
          </div>
        </div>
      </div>
    </Ambiente>
  );
}
