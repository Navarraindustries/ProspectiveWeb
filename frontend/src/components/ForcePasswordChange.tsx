/* Cambio obligatorio de la contraseña inicial.

   Una cuenta creada con una contraseña conocida (admin / admin123) no puede
   hacer nada hasta cambiarla: el servidor responde 403 a todo lo demás. Esta
   pantalla es lo único que se ve mientras tanto, para que el 403 no aparezca
   como un error suelto en cada panel. */

import { useState } from "react";
import { api } from "../api/client";
import { serverErrorText } from "../api/errorText";
import { useAuth } from "../store/auth";
import { Button } from "./Button";
import { Input } from "./Input";
import { ErrorNote } from "./PanelHead";
import { Entorno } from "./Entorno";
import { AuthWindow } from "./shell/AuthWindow";

const MIN_LEN = 8;

export function ForcePasswordChange() {
  const { user, logout, refreshUser } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_LEN;
  const mismatch = repeat.length > 0 && next !== repeat;
  const sameAsOld = next.length > 0 && next === current;
  const canSubmit = !busy && current.length > 0 && next.length >= MIN_LEN && next === repeat && !sameAsOld;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      await refreshUser();
    } catch (e) {
      // F1-51: aquí llegaban «Failed to fetch» y «Error 500» tal cual; ahora
      // dicen lo mismo que «Entrar» cuando el servidor no contesta o no explica.
      setError(serverErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Entorno>
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, background: "var(--canvas)" }}>
        <AuthWindow titulo="Cambia la contraseña asignada">
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {/* F1b-4: aquí se llega tras el alta por un administrador, tras un
                restablecimiento y, en la cuenta admin de serie, con la contraseña
                de instalación; el servidor no distingue los casos (solo guarda que
                hay que cambiarla), así que el texto vale para todos. */}
            <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5, margin: "0 0 16px" }}>
              La cuenta <b style={{ color: "var(--foreground)" }}>{user?.username}</b> tiene una contraseña que
              no eligió y que conoce otra persona. Hasta que la cambies no se puede usar la aplicación.
            </p>
            <Input label="Contraseña actual" type="password" value={current}
                   onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <div style={{ height: 10 }} />
            <Input label={`Nueva contraseña (mín. ${MIN_LEN})`} type="password" value={next}
                   onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <div style={{ height: 10 }} />
            <Input label="Repite la nueva contraseña" type="password" value={repeat}
                   onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            <ErrorNote>
              {tooShort ? `Mínimo ${MIN_LEN} caracteres.`
                : sameAsOld ? "La nueva contraseña debe ser distinta de la actual."
                : mismatch ? "Las dos contraseñas no coinciden." : error}
            </ErrorNote>
            <Button type="submit" style={{ width: "100%", marginTop: 16 }} disabled={!canSubmit}>
              {busy ? "Guardando…" : "Cambiar contraseña y continuar"}
            </Button>
            <Button type="button" variant="ghost" style={{ width: "100%", marginTop: 8 }} onClick={logout}>
              Cerrar sesión
            </Button>
          </form>
        </AuthWindow>
      </div>
    </Entorno>
  );
}
