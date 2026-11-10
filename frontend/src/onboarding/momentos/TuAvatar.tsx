import { useEffect, useState } from "react";
import { AvatarCreator } from "../../avatar/AvatarCreator";
import { DesdeMiFoto } from "../../avatar/DesdeMiFoto";
import { AvatarSvg } from "../../avatar/AvatarSvg";
import { configPorDefecto, type AvatarConfig } from "../../avatar/config";
import { useGuardarAvatar, type ModoAvatar } from "../../avatar/useGuardarAvatar";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorNote } from "../../components/PanelHead";
import { useAuth } from "../../store/auth";
import { AVATAR } from "../copy";
import type { PropsMomento } from "./tipos";

export function TuAvatar({ registrarAvance }: PropsMomento) {
  const { user } = useAuth();
  const [config, setConfig] = useState<AvatarConfig>(() => user?.avatar_config ?? configPorDefecto(user?.id ?? 0));
  const [modo, setModo] = useState<ModoAvatar>("avatar");
  const [desdeFoto, setDesdeFoto] = useState(false);
  const { vistaPendiente, error, aplicarFoto, guardar } = useGuardarAvatar();

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
            : <AvatarSvg config={config} size={240} title="Vista previa de tu avatar" />}
        </div>
      </div>
      <div className="ob-tarjeta ob-avatar__panel">
        {desdeFoto ? (
          <DesdeMiFoto base={config} onCancel={() => setDesdeFoto(false)}
            onListo={(r) => { setConfig(r.config); setModo(r.mostrar); setDesdeFoto(false); aplicarFoto(r); }} />
        ) : (
          <>
            <AvatarCreator value={config} onChange={setConfig} compacto />
            <Button variant="outline" size="sm" leadingIcon={<Icon name="LOCK" size={14} />}
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
