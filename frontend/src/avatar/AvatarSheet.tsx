/* Hoja «Tu avatar»: vista previa grande, creador por piezas, qué mostrar
   (avatar o foto de perfil) y guardar. */
import { useEffect, useState, type CSSProperties } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { ErrorNote } from "../components/PanelHead";
import { Sheet } from "../components/Sheet";
import { useAuth } from "../store/auth";
import { AvatarCreator } from "./AvatarCreator";
import { DesdeMiFoto, type ResultadoFoto } from "./DesdeMiFoto";
import { AvatarSvg } from "./AvatarSvg";
import { UserAvatar } from "./UserAvatar";
import { configPorDefecto, type AvatarConfig } from "./config";

type Modo = "avatar" | "foto";

export function AvatarSheet({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, refreshUser } = useAuth();
  const [config, setConfig] = useState<AvatarConfig | null>(null);
  const [modo, setModo] = useState<Modo>("avatar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desdeFoto, setDesdeFoto] = useState(false);

  const tieneFoto = !!user?.has_profile_photo;

  // Al abrir, se parte de lo guardado.
  useEffect(() => {
    if (!open || !user) return;
    setConfig(user.avatar_config ?? configPorDefecto(user.id));
    setModo(user.avatar_mode === "foto" && user.has_profile_photo ? "foto" : "avatar");
    setError(null);
    setDesdeFoto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!user || !config) return <Sheet open={false} onClose={onClose} title="Tu avatar">{null}</Sheet>;

  const guardar = async () => {
    setBusy(true); setError(null);
    try {
      await api.saveAvatar(config, modo);
      await refreshUser();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el avatar");
    } finally {
      setBusy(false);
    }
  };

  const aplicarDesdeFoto = async (r: ResultadoFoto) => {
    setConfig(r.config); setModo(r.mostrar); setDesdeFoto(false);
    if (r.mostrar !== "foto") return;
    setBusy(true); setError(null);
    try {
      if (r.usarRegistro) await api.copyRegistroPhoto();
      else if (r.foto) await api.uploadProfilePhoto(r.foto);
      await refreshUser();
    } catch (e) {
      setModo("avatar");
      setError(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setBusy(false);
    }
  };

  const quitarFoto = async () => {
    setBusy(true); setError(null);
    try {
      await api.deleteProfilePhoto();
      setModo("avatar"); // el servidor ya pasa a «avatar»; el borrador (config) se conserva
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar la foto");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tu avatar" width={460}
      footer={
        <>
          {error && <div style={{ flexBasis: "100%" }}><ErrorNote>{error}</ErrorNote></div>}
          <Button onClick={() => void guardar()} disabled={busy} leadingIcon={<Icon name="SAVE" size={14} />}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </>
      }>
      {desdeFoto ? (
        <DesdeMiFoto base={config} onListo={(r) => void aplicarDesdeFoto(r)} onCancel={() => setDesdeFoto(false)} />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {modo === "foto" && tieneFoto
            ? <UserAvatar user={{ ...user, avatar_mode: "foto" }} self size={160} />
            : <AvatarSvg config={config} size={160} title="Vista previa de tu avatar" />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Mostrar:</span>
          <button type="button" aria-pressed={modo === "avatar"} onClick={() => setModo("avatar")}
            style={pildora(modo === "avatar", false)}>Mi avatar</button>
          <button type="button" aria-pressed={modo === "foto"} disabled={!tieneFoto} onClick={() => setModo("foto")}
            style={pildora(modo === "foto", !tieneFoto)}>Mi foto</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" size="sm" leadingIcon={<Icon name="USER" size={14} />}
            onClick={() => setDesdeFoto(true)}>
            Desde mi foto
          </Button>
          {tieneFoto && (
            <Button variant="destructive-ghost" size="sm" disabled={busy} onClick={() => void quitarFoto()}>
              Quitar mi foto
            </Button>
          )}
        </div>

        <AvatarCreator value={config} onChange={setConfig} />
      </div>
      )}
    </Sheet>
  );
}

function pildora(activa: boolean, deshabilitada: boolean): CSSProperties {
  return {
    minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, color: "var(--foreground)",
    cursor: deshabilitada ? "not-allowed" : "pointer", opacity: deshabilitada ? 0.5 : 1,
    border: `1px solid ${activa ? "var(--primary)" : "var(--border)"}`,
    background: activa ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "var(--btn-outline-bg)",
  };
}
