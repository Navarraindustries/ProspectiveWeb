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
import { useGuardarAvatar } from "./useGuardarAvatar";
import { configPorDefecto, type AvatarConfig } from "./config";

type Modo = "avatar" | "foto";

export function AvatarSheet({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, refreshUser } = useAuth();
  const [config, setConfig] = useState<AvatarConfig | null>(null);
  const [modo, setModo] = useState<Modo>("avatar");
  const [error, setErrorLocal] = useState<string | null>(null);
  const [desdeFoto, setDesdeFoto] = useState(false);
  const { pendiente, vistaPendiente, busy: busyGuardar, error: errorGuardar, setError: setErrorGuardar,
    setPendiente, aplicarFoto, guardar: guardarAvatar } = useGuardarAvatar();
  const [busyQuitar, setBusyQuitar] = useState(false);
  const busy = busyGuardar || busyQuitar;
  const errorVisible = error ?? errorGuardar;
  const setError = (e: string | null) => { setErrorLocal(e); setErrorGuardar(e); };

  const tieneFoto = !!user?.has_profile_photo;

  // Al abrir, se parte de lo guardado.
  useEffect(() => {
    if (!open || !user) return;
    setConfig(user.avatar_config ?? configPorDefecto(user.id));
    setModo(user.avatar_mode === "foto" && user.has_profile_photo ? "foto" : "avatar");
    setError(null);
    setDesdeFoto(false);
    setPendiente(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!user || !config) return <Sheet open={false} onClose={onClose} title="Tu avatar">{null}</Sheet>;

  const guardar = async () => {
    setErrorLocal(null);
    if (await guardarAvatar(config, modo)) onClose();
  };

  const aplicarDesdeFoto = (r: ResultadoFoto) => {
    setConfig(r.config); setModo(r.mostrar); setDesdeFoto(false);
    setErrorLocal(null); aplicarFoto(r);
  };

  const quitarFoto = async () => {
    setBusyQuitar(true); setError(null);
    try {
      await api.deleteProfilePhoto();
      setModo("avatar"); // el servidor ya pasa a «avatar»; el borrador (config) se conserva
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar la foto");
    } finally {
      setBusyQuitar(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tu avatar" width={460}
      footer={desdeFoto ? null : (
        <>
          {errorVisible && <div style={{ flexBasis: "100%" }}><ErrorNote>{errorVisible}</ErrorNote></div>}
          <Button onClick={() => void guardar()} disabled={busy} leadingIcon={<Icon name="SAVE" size={14} />}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </>
      )}>
      {desdeFoto ? (
        <DesdeMiFoto base={config} onListo={aplicarDesdeFoto} onCancel={() => setDesdeFoto(false)} />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {modo === "foto" && vistaPendiente
            ? <img src={vistaPendiente} alt="Vista previa de tu foto" width={160} height={160}
                style={{ borderRadius: "50%", objectFit: "cover" }} />
            : modo === "foto" && tieneFoto
            ? <UserAvatar user={{ ...user, avatar_mode: "foto" }} self size={160} />
            : <AvatarSvg config={config} size={160} title="Vista previa de tu avatar" />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Mostrar:</span>
          <button type="button" aria-pressed={modo === "avatar"} onClick={() => setModo("avatar")}
            style={pildora(modo === "avatar", false)}>Mi avatar</button>
          <button type="button" aria-pressed={modo === "foto"} disabled={!tieneFoto && !pendiente} onClick={() => setModo("foto")}
            style={pildora(modo === "foto", !tieneFoto && !pendiente)}>Mi foto</button>
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
