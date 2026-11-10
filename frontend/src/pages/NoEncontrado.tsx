/* Página para una dirección que no existe y para un fallo al pintar.

   Sin ella, React Router enseñaba su pantalla de desarrollo («Unexpected
   Application Error! 404 Not Found»), en inglés y sin un solo enlace: quien
   llegaba por un enlace mal copiado, o sufría un fallo, no tenía por dónde
   seguir salvo editar la barra de direcciones. */

import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { Button } from "../components/Button";
import { Logo } from "../components/shell/Logo";
import { CONTACTO_ADMIN } from "../lib/contacto";

function Marco({ titulo, children, acciones }: { titulo: string; children: React.ReactNode; acciones: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "32px 16px",
        textAlign: "center",
        background: "var(--canvas)",
        color: "var(--foreground)",
      }}
    >
      <Logo variante="linea" size={36} />
      <h1 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 600 }}>{titulo}</h1>
      <p style={{ margin: 0, maxWidth: 460, fontSize: 14, color: "var(--muted-foreground)" }}>{children}</p>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 8 }}>{acciones}</div>
    </main>
  );
}

/** Ruta comodín: la dirección no corresponde a ninguna pantalla. */
export function NoEncontrado() {
  const navigate = useNavigate();
  return (
    <Marco
      titulo="Esta página no existe"
      acciones={
        <>
          <Button variant="secondary" onClick={() => navigate("/")}>Página principal</Button>
          <Button onClick={() => navigate("/app")}>Ir a Prospective</Button>
        </>
      }
    >
      La dirección puede estar mal escrita o el enlace ser antiguo.
    </Marco>
  );
}

/** `errorElement` de las rutas: algo falló al pintar la pantalla. */
export function ErrorDeRuta() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NoEncontrado />;
  return (
    <Marco
      titulo="Algo ha fallado en esta pantalla"
      acciones={
        <>
          {/* Navegación completa, no del router: el estado que provocó el fallo se descarta. */}
          <Button variant="secondary" onClick={() => window.location.assign("/app")}>Ir a Pacientes</Button>
          <Button onClick={() => window.location.reload()}>Recargar la página</Button>
        </>
      }
    >
      Lo que hayas guardado sigue a salvo. Recarga la página; si vuelve a pasar, escribe a{" "}
      <a href={`mailto:${CONTACTO_ADMIN}`} style={{ color: "var(--brand-deep)", fontWeight: 600 }}>{CONTACTO_ADMIN}</a>.
    </Marco>
  );
}
