/* Signup — professional self-registration. Creates a pending account that an
   admin must approve. Comparte con «Entrar» el panel de marca y el formulario
   a dos columnas. */

import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { serverErrorText } from "../api/errorText";
import { CONTACTO_ADMIN } from "../lib/contacto";
import { Button } from "../components/Button";
import { FileField } from "../components/FileField";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { AuthBrand } from "../components/shell/AuthBrand";
import { ThemeToggle } from "../components/ThemeToggle";

const SPECIALTIES = [
  "Neurocirugía",
  "Neurorradiología intervencionista",
  "Neurología",
  "Radiología",
  "Anestesiología",
  "Medicina interna",
  "Otra",
];
const POSITIONS = [
  "Neurocirujano/a",
  "Neurorradiólogo/a",
  "Residente de Neurocirugía",
  "Residente de Radiología",
  "Fellow",
  "Médico adjunto",
  "Estudiante de medicina",
  "Investigador/a",
  "Otro",
];

const GROUP_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--muted-foreground)",
  margin: "22px 0 2px",
};

/** F2-11: la frase de la aprobación es la misma que en «Entrar». Se escribe aquí
 *  y no se toma de la respuesta del servidor: el texto es de la interfaz. */
export const AVISO_SOLICITUD =
  "Un administrador revisará la solicitud. No recibirás ningún aviso: vuelve a intentar entrar en unos días.";

type Campo = "full_name" | "username" | "password" | "confirm";

/** Un error por campo, calculado a la vez (F1-49): quien se equivoca en varios
 *  campos los ve todos, cada uno junto al suyo, sin ir de uno en uno. */
function validar(f: { full_name: string; username: string; password: string; confirm: string }): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  if (!f.full_name.trim()) e.full_name = "El nombre completo es obligatorio.";
  if (f.username.trim().length < 3) e.username = "El usuario debe tener al menos 3 caracteres.";
  if (f.password.length < 8) e.password = "La contraseña debe tener al menos 8 caracteres.";
  if (f.password !== f.confirm) e.confirm = "Las contraseñas no coinciden.";
  return e;
}

export function Signup({ onBack, onDone }: { onBack: () => void; onDone: (msg: string) => void }) {
  const [form, setForm] = useState({
    full_name: "", national_id: "", professional_id: "",
    specialty: SPECIALTIES[0], university: "", hospital: "",
    position: POSITIONS[0], orcid: "",
    username: "", password: "", confirm: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [cv, setCv] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [intentado, setIntentado] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Los errores de nombre y usuario aparecen al pulsar enviar (un campo vacío no
  // nace en rojo). Los de contraseña y repetición avisan en vivo en cuanto se
  // escribe en ellos (F1-47), porque ahí el fallo se ve mientras se teclea.
  const errores = validar(form);
  const visible = (c: Campo): string | undefined => {
    if (!errores[c]) return undefined;
    if (intentado) return errores[c];
    if (c === "password") return form.password ? errores[c] : undefined;
    if (c === "confirm") return form.confirm ? errores[c] : undefined;
    return undefined;
  };
  const props = (c: Campo) => ({ invalid: !!visible(c), hint: visible(c) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;

    setBusy(true);
    try {
      await api.signup({
        username: form.username.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim(),
        professional_id: form.professional_id.trim(),
        specialty: form.specialty,
        university: form.university.trim(),
        hospital: form.hospital.trim(),
        position: form.position,
        orcid: form.orcid.trim(),
      }, photo, cv);
      onDone(AVISO_SOLICITUD);
    } catch (err) {
      // F1-50: el mismo aviso de falta de conexión que «Entrar», sin «backend»;
      // con el ApiError 0 del cliente se enseñaba «Sin conexión con el servidor»
      // y con el 500 vacío del proxy, «Error 500».
      setError(serverErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--canvas)" }}>
      <AuthBrand flex="1 1 56%" />

      {/* Form panel — theme-aware, scrollable (the form is long). */}
      <div className="login-form" style={{ flex: "1 1 44%", display: "flex", flexDirection: "column", minWidth: 340, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px clamp(24px, 3.5vw, 60px) 0" }}>
          <button
            onClick={onBack}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-sans)", padding: 0 }}
          >
            ← Volver a Entrar
          </button>
          <ThemeToggle />
        </div>

        <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", padding: "18px clamp(24px, 3.5vw, 60px) 40px" }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "var(--tracking-title)", color: "var(--foreground)" }}>
            Crear cuenta
          </div>
          <div style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 6 }}>
            Regístrate para acceder a PROSPECTIVE.
          </div>

          <form onSubmit={submit}>
            <div style={GROUP_LABEL}>Tus datos</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Input label="Nombre completo *" value={form.full_name} onChange={set("full_name")} placeholder="Dr. …" {...props("full_name")} />
              <Input label="DNI / NIE (opcional)" hint="Solo si tu centro lo pide" value={form.national_id} onChange={set("national_id")} />
              <FileField label="Foto de perfil" accept="image/*" file={photo} onPick={setPhoto} />
            </div>

            <div style={GROUP_LABEL}>Datos profesionales</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Número de colegiado (opcional)" value={form.professional_id} onChange={set("professional_id")} />
              <Select label="Especialidad" options={SPECIALTIES} value={form.specialty} onChange={set("specialty")} />
              <Input label="Universidad" value={form.university} onChange={set("university")} />
              <Input label="Hospital / Centro" value={form.hospital} onChange={set("hospital")} />
              <Select label="Cargo" options={POSITIONS} value={form.position} onChange={set("position")} />
              <Input label="ORCID (opcional)" hint="Identificador de investigador, si lo tienes" value={form.orcid} onChange={set("orcid")} placeholder="0000-0000-0000-0000" />
            </div>
            <div style={{ marginTop: 12 }}>
              <FileField label="Currículum (CV)" accept=".pdf,.doc,.docx" file={cv} onPick={setCv} />
            </div>

            <div style={GROUP_LABEL}>Credenciales de acceso</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Input label="Usuario * (mín. 3)" value={form.username} onChange={set("username")} autoComplete="username" {...props("username")} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="Contraseña * (mín. 8)" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" {...props("password")} />
                <Input label="Repite la contraseña *" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" {...props("confirm")} />
              </div>
            </div>

            <div style={{ marginTop: 18, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--warning-bg)", border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)", color: "var(--warning)", fontSize: 12 }}>
              Tu cuenta quedará <b>pendiente de aprobación</b> hasta que un administrador la active.
              {" "}No recibirás ningún aviso: vuelve a intentar entrar en unos días. Para consultas, escribe a{" "}
              <a href={`mailto:${CONTACTO_ADMIN}`} style={{ color: "inherit", fontWeight: 600 }}>{CONTACTO_ADMIN}</a>
            </div>

            {error && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--destructive)" }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Button type="submit" style={{ flex: 1 }} disabled={busy}>
                {busy ? "Enviando…" : "Enviar solicitud de registro"}
              </Button>
            </div>
          </form>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--muted-foreground)" }}>
            PROSPECTIVE™ Web — Laboratorio de Imagen Médica
          </div>
        </div>
      </div>
    </div>
  );
}
