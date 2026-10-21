/* «Cerrar sesión» a la vista, en la barra superior del shell. El menú del
   avatar (abajo en la barra lateral) ya lo lleva, pero en un rail de 40 px el
   avatar no se reconoce como menú y el dueño no encontraba cómo salir. Hace lo
   mismo que la entrada del menú: cierra la sesión y vuelve a «Entrar». */

import { Icon } from "../Icon";
import { useAuth } from "../../store/auth";
import { useNav } from "../../store/nav";

export function LogoutButton() {
  const { user, logout } = useAuth();
  const nav = useNav();
  if (!user) return null;
  return (
    <button
      type="button"
      className="shell-logout"
      title="Cerrar la sesión y volver a «Entrar»"
      onClick={() => { logout(); nav.go("login"); }}
    >
      <Icon name="LOGOUT" size={14} />
      <span>Cerrar sesión</span>
    </button>
  );
}
