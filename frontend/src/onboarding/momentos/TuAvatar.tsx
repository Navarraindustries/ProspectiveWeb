import { useEffect, useState } from "react";
import { AvatarCreator } from "../../avatar/AvatarCreator";
import { pildora } from "../../avatar/AvatarSheet";
import { DesdeMiFoto } from "../../avatar/DesdeMiFoto";
import { AvatarSvg } from "../../avatar/AvatarSvg";
import { configPorDefecto, type AvatarConfig } from "../../avatar/config";
import { useGuardarAvatar, type ModoAvatar } from "../../avatar/useGuardarAvatar";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorNote } from "../../components/PanelHead";
import { UserAvatar } from "../../avatar/UserAvatar";
import { useAuth } from "../../store/auth";
import { AVATAR } from "../copy";
import type { PropsMomento } from "./tipos";

export function TuAvatar({ registrarAvance }: PropsMomento) {
  const { user } = useAuth();
  const [config, setConfig] = useState<AvatarConfig>(() => user?.avatar_config ?? configPorDefecto(user?.id ?? 0));
  // Se parte de lo guardado, como en la hoja «Tu avatar»: quien muestra su foto no la pierde al avanzar.
  const [modo, setModo] = useState<ModoAvatar>(user?.avatar_mode === "foto" && user.has_profile_photo ? "foto" : "avatar");
  const [desdeFoto, setDesdeFoto] = useState(false);
  const { pendiente, vistaPendiente, error, aplicarFoto, guardar } = useGuardarAvatar();
  // «Mi foto» solo si hay una que mostrar: la guardada o la recién elegida (aún sin subir).
  const hayFoto = !!user?.has_profile_photo || !!pendiente;

  // «Siguiente» guarda antes de avanzar; si falla, se queda y avisa.
  useEffect(() => {
    registrarAvance(() => guardar(config, modo));
    return () => registrarAvance(null);
  }, [registrarAvance, guardar, config, modo]);

  return (
    <div className="ob-avatar">
      <div className="ob-avatar__vista">
        <h1 className="ob-titulo">{AVATAR.titulo}</h1>
        <p className="ob-sub">{AVATAR.linea}</p>
        <div className="ob-avatar__retrato">
          {modo === "foto" && vistaPendiente
            ? <img src={vistaPendiente} alt="Vista previa de tu foto" width={240} height={240}
                style={{ borderRadius: "50%", objectFit: "cover" }} />
            : modo === "foto" && user?.has_profile_photo
            ? <UserAvatar user={{ ...user, avatar_mode: "foto" }} self size={240} />
            : <AvatarSvg config={config} size={240} title="Vista previa de tu avatar" />}
        </div>
      </div>
      <div className="ob-tarjeta ob-avatar__panel">
        {desdeFoto ? (
          <DesdeMiFoto base={config} onCancel={() => setDesdeFoto(false)}
            onListo={(r) => { setConfig(r.config); setModo(r.mostrar); setDesdeFoto(false); aplicarFoto(r); }} />
        ) : (
          <>
            <div className="ob-avatar__mostrar" role="group" aria-label="Qué ven los demás"
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" aria-pressed={modo === "avatar"} onClick={() => setModo("avatar")}
                style={pildora(modo === "avatar", false)}>{AVATAR.mostrarAvatar}</button>
              <button type="button" aria-pressed={modo === "foto"} disabled={!hayFoto} onClick={() => setModo("foto")}
                style={pildora(modo === "foto", !hayFoto)}>{AVATAR.mostrarFoto}</button>
            </div>
            <AvatarCreator value={config} onChange={setConfig} compacto />
            <Button variant="outline" leadingIcon={<Icon name="LOCK" size={14} />}
              onClick={() => setDesdeFoto(true)}>
              {AVATAR.desdeFoto}
            </Button>
            {error && <ErrorNote>{error}</ErrorNote>}
          </>
        )}
      </div>
    </div>
  );
}
