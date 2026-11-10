/* Avatar de una persona: su foto de perfil (si eligió «foto» y la tiene) o el
   avatar dibujado. Nunca la foto del registro.
   `decorativo`: el nombre ya está escrito al lado (fila de una lista, cabecera de
   un menú); el avatar se oculta a los lectores de pantalla para no decirlo dos veces. */
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AvatarConfig } from "../api/types";
import { AvatarSvg } from "./AvatarSvg";
import { configPorDefecto } from "./config";

export interface UserAvatarUser {
  id: number;
  full_name: string;
  avatar_config?: AvatarConfig | null;
  avatar_mode?: "avatar" | "foto";
  has_profile_photo?: boolean;
  /** Cambia al sustituir la foto: vuelve a pedirla aunque nada más haya cambiado. */
  profile_photo_rev?: number | null;
}

export function UserAvatar({ user, size, self = false, decorativo = false }: {
  user: UserAvatarUser;
  size: number;
  self?: boolean;
  decorativo?: boolean;
}) {
  const quiereFoto = user.avatar_mode === "foto" && !!user.has_profile_photo;
  const rev = user.profile_photo_rev ?? null;
  // De quién es la foto cargada: si la fila se recicla para otra persona (u otra
  // revisión), la URL anterior deja de valer en el mismo render, sin parpadeo.
  const clave = `${self ? "yo" : "otro"}|${user.id}|${rev ?? ""}`;
  const [cargada, setCargada] = useState<{ clave: string; url: string } | null>(null);
  const url = cargada && cargada.clave === clave ? cargada.url : null;

  useEffect(() => {
    setCargada(null);
    if (!quiereFoto) return;
    let created: string | null = null;
    let alive = true;
    (self ? api.myProfilePhotoObjectUrl(rev) : api.userProfilePhotoObjectUrl(user.id, rev))
      .then((u) => { if (alive) { created = u; setCargada({ clave, url: u }); } else URL.revokeObjectURL(u); })
      .catch(() => { if (alive) setCargada(null); });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [quiereFoto, self, user.id, rev, clave]);

  const nombre = decorativo ? undefined : user.full_name;
  return (
    <span className="shell-avatar" style={{ width: size, height: size }} aria-hidden={decorativo || undefined}>
      {quiereFoto && url
        ? <img src={url} alt={nombre ?? ""} />
        : <AvatarSvg config={user.avatar_config ?? configPorDefecto(user.id)} size={size} title={nombre} />}
    </span>
  );
}
