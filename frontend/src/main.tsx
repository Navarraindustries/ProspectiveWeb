import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { MotionConfig } from "./motion";
import { Landing } from "./pages/Landing";
import { ThemeProvider } from "./store/theme";
import "./styles/index.css";
import { SelectorTipografia } from "./tipografia/SelectorTipografia";
import { iniciar as iniciarTipografia } from "./tipografia/variantes";

// A DATA router (createBrowserRouter), not <BrowserRouter>: only this flavour
// supports useBlocker, which is what lets the workspace stop the browser's Back
// button when the session has unsaved results. With the old router a Back press
// walked out of the application and the work was gone without a prompt.
const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/app/*", element: <App /> },
]);

// UNI-135: variantes tipográficas para decidir, solo con ?tipografia=a|b|c.
const tipografia = iniciarTipografia();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {/* La regla global de base.css solo frena CSS; esto frena también el movimiento de JS. */}
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
        <SelectorTipografia inicial={tipografia} />
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>
);
