/* «Cerrar sesión» a la vista, en el pie de la barra lateral. El menú del
   avatar ya lo lleva, pero no se reconocía como menú y el dueño no encontraba
   cómo salir. Hace lo mismo que la entrada del menú: cierra la sesión y vuelve
   a «Entrar». Con la barra plegada (`compact`) queda solo el icono. */

import { Icon } from "../Icon";
import { useAuth } from "../../store/auth";
import { useNav } from "../../store/nav";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNav();
  if (!user) return null;
  return (
    <button
      type="button"
      className="shell-logout"
      title="Cerrar la sesión y volver a «Entrar»"
      aria-label={compact ? "Cerrar sesión" : undefined}
      onClick={() => { if (nav.salir) nav.salir(); else { logout(); nav.go("login"); } }}
    >
      <Icon name="LOGOUT" size={14} />
      {!compact && <span>Cerrar sesión</span>}
    </button>
  );
}
