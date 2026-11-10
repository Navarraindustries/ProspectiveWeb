/* Avatar de una persona: su foto de perfil (si eligió «foto» y la tiene) o el
   avatar dibujado. Nunca la foto del registro. */
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

export function UserAvatar({ user, size, self = false }: { user: UserAvatarUser; size: number; self?: boolean }) {
  const quiereFoto = user.avatar_mode === "foto" && !!user.has_profile_photo;
  const rev = user.profile_photo_rev ?? null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!quiereFoto) { setUrl(null); return; }
    let created: string | null = null;
    let alive = true;
    (self ? api.myProfilePhotoObjectUrl(rev) : api.userProfilePhotoObjectUrl(user.id, rev))
      .then((u) => { if (alive) { created = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [quiereFoto, self, user.id, rev]);

  const nombre = user.full_name;
  return (
    <span className="shell-avatar" style={{ width: size, height: size }}>
      {quiereFoto && url
        ? <img src={url} alt={nombre} />
        : <AvatarSvg config={user.avatar_config ?? configPorDefecto(user.id)} size={size} title={nombre} />}
    </span>
  );
}
