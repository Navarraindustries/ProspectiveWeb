/* PROSPECTIVE Web — root: splash → Login/Signup → Pacientes → Sesión → Solicitudes. */

import { ForcePasswordChange } from "./components/ForcePasswordChange";
import { useCallback, useEffect, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api/client";
import type { PatientSummary, StudyCard, StudySummary } from "./api/types";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Patients } from "./pages/Patients";
import { Studies } from "./pages/Studies";
import { Workspace } from "./pages/Workspace";
import { PendingRequests } from "./pages/PendingRequests";
import { UsersAdmin } from "./pages/UsersAdmin";
import { AuditTrail } from "./pages/AuditTrail";
import { VideoSplash } from "./components/VideoSplash";
import { LoadingScreen } from "./components/LoadingScreen";
import { UnsavedExitDialog } from "./components/UnsavedExitDialog";
import { AuthProvider, useAuth } from "./store/auth";
import { PlanningProvider, usePlanning } from "./store/planning";
import { NavProvider, SCREEN_PATH, screenFromPath } from "./store/nav";
import { ClipOrdersPage } from "./pages/ClipOrders";
import { WorkshopsPage } from "./pages/Workshops";
import type { Screen } from "./store/nav";
import { rehydrateSession } from "./resume";
import { restoreFailure } from "./restoreFailure";
import { ServerDownBanner } from "./components/ServerDownBanner";
import { MORPHO_INVALIDATED } from "./components/planning/detectCopy";

function Router() {
  const { user, ready, expiredNotice } = useAuth();
  const planning = usePlanning();
  const location = useLocation();
  const navigate = useNavigate();
  // The URL is the source of truth for which screen is showing, so Back/Forward,
  // a refresh and a shared link all land where the user expects.
  const screen = screenFromPath(location.pathname);
  const setScreen = useCallback(
    (s: Screen) => navigate(SCREEN_PATH[s]),
    [navigate],
  );
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  // Paciente por el que se abre el registro de pedidos, cuando se llega desde su ficha.
  const [ordersPatient, setOrdersPatient] = useState<PatientSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // «Reintentar» del aviso de una restauración fallida (F1-25): el aviso se
  // queda hasta que se pulse, en vez de borrarse a los tres segundos.
  const [toastRetry, setToastRetry] = useState<{ forText: string; run: () => void } | null>(null);
  // Solo vale para el aviso al que pertenece: otro aviso posterior no lo hereda.
  const retryHere = toastRetry && toastRetry.forText === toast ? toastRetry.run : null;
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [loadingIn, setLoadingIn] = useState(false);
  const [resumeStep, setResumeStep] = useState(0);
  // Leaving the pipeline throws the session away: the store resets on the next
  // patient. Saving is manual, so an accidental click on the logo — or on the
  // browser's Back button — used to cost an entire analysis without a word.
  const dirtyWorkspace = screen === "workspace" && planning.dirty;

  // useBlocker catches EVERY router navigation, including Back/Forward, which a
  // hand-rolled guard around our own click handlers could never see.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyWorkspace && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirtyWorkspace) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyWorkspace]);

  // When logged out, only login/signup are reachable.
  const loggedOut: Screen = screen === "signup" ? "signup" : "login";
  const effective: Screen = user ? (screen === "login" || screen === "signup" ? "patients" : screen) : loggedOut;

  // Keep the URL honest when the effective screen differs from the one the path
  // names — a logged-out visitor deep-linking to /app/sesion, or bare /app.
  // `replace`, not push: this correction must not become a Back destination.
  useEffect(() => {
    if (!ready) return;
    if (SCREEN_PATH[effective] !== location.pathname) {
      navigate(SCREEN_PATH[effective], { replace: true });
    }
  }, [ready, effective, location.pathname, navigate]);

  if (!ready) return null; // restoring stored token
  // Con la contraseña inicial el servidor responde 403 a todo: una sola
  // pantalla que lo dice, en vez de un error en cada panel.
  if (user?.must_change_password) return <ForcePasswordChange />;

  const openPatient = (p: PatientSummary) => {
    planning.reset();
    planning.setPatient(p);
    setPatient(p);
    setResumeStep(0);
    setScreen("workspace");
  };

  // Empezar sin paciente: subir el DICOM y usar el pipeline ya, y decidir
  // después si se guarda («Adjuntar a un caso», en la barra del pipeline).
  const startWithoutPatient = () => {
    planning.reset();
    setPatient(null);
    setResumeStep(0);
    setScreen("workspace");
  };

  // Enter the pipeline for a clinical case: patient + case are known upfront, so
  // the upload panel no longer has to ask which case the DICOM belongs to.
  const planCase = (study: StudySummary, p: PatientSummary) => {
    planning.reset();
    planning.setPatient(p);
    planning.setCase(study.id, study.dx_principal || study.description || `Caso ${study.id}`);
    setPatient(p);
    setResumeStep(0);
    setScreen("workspace");
  };

  // Open an archived study from the gallery: its DICOM is copied back into a
  // fresh session and the pipeline starts at step 1 with the volume loaded.
  const openStudy = async (study: StudyCard) => {
    setToast("Abriendo estudio…");
    try {
      const r = await api.openStudy(study.id);
      const patients = await api.listPatients();
      const p = patients.find((x) => x.id === study.patient_id) ?? null;
      planning.reset();
      planning.setPatient(p);
      planning.setCase(study.case_id || null, study.dx_principal || study.description);
      planning.setImagingStudyId(study.id);
      setPatient(p);
      planning.setSession(r.session_id);
      // The backend already activated the best series; mirror it so step 1 shows
      // the study (without this the panel looks empty and "Continuar" is off).
      planning.setSeries(r.series[0] ?? null);
      planning.setSeriesList(r.series);
      setResumeStep(0);
      setToast(null);
      setScreen("workspace");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "No se pudo abrir el estudio");
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Resume a saved study session: restore its files into a fresh live session,
  // rehydrate the store from what came back (src/resume.ts), and open the
  // workspace at the step it was saved on.
  const resumeSession = async (sessionId: string, p: PatientSummary) => {
    setToastRetry(null);
    setToast("Restaurando sesión…");
    try {
      const r = await api.restoreSession(sessionId);
      planning.reset();
      // Hasta que llegue su lista, el [] del store no es el de la sesión.
      planning.setAnnotationsLoadState("pendiente");
      planning.setPatient(p);
      setPatient(p);
      // Todo lo que vuelve con la sesión —también la decisión, el corredor, los
      // clips editables, la ventana y los enlaces del informe— y sin rehacer la
      // detección (familia S). Deja la sesión sin cambios pendientes.
      const { step, invalidated } = await rehydrateSession(planning, r);
      setResumeStep(step);
      if (invalidated) {
        setToast(MORPHO_INVALIDATED);
        setTimeout(() => setToast(null), 5000);
      } else {
        setToast(null);
      }
      setScreen("workspace");
    } catch (e) {
      // Sin respuesta (pasado el límite del cliente) o con la copia caída en
      // el servidor, la guardada sigue en disco: se dice y se ofrece repetir.
      const { text, retry } = restoreFailure(e);
      setToast(text);
      if (retry) setToastRetry({ forText: text, run: () => void resumeSession(sessionId, p) });
      else setTimeout(() => setToast(null), 3000);
    }
  };

  // Resuming straight from a gallery card: the card knows its session, but
  // resumeSession needs the patient record the workspace header reads from.
  const resumeStudySession = async (study: StudyCard) => {
    if (!study.resumable_session_id) return void openStudy(study);
    try {
      const patients = await api.listPatients();
      const p = patients.find((x) => x.id === study.patient_id);
      if (!p) {
        setToast("No se encontró el paciente de este estudio");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      await resumeSession(study.resumable_session_id, p);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "No se pudo reanudar la sesión");
      setTimeout(() => setToast(null), 3000);
    }
  };

  const finish = () => {
    setToast("✓ Sesión guardada y vinculada al paciente");
    setTimeout(() => {
      setToast(null);
      setScreen("patients");
    }, 1600);
  };

  let view;
  if (effective === "login")
    // A session that expired mid-study explains itself on the login screen.
    view = (
      <Login
        onLogin={() => { setLoadingIn(true); setScreen("patients"); }}
        onSignup={() => setScreen("signup")}
        notice={loginNotice ?? expiredNotice}
      />
    );
  else if (effective === "signup")
    view = (
      <Signup
        onBack={() => { setLoginNotice(null); setScreen("login"); }}
        onDone={(msg) => { setLoginNotice(msg); setScreen("login"); }}
      />
    );
  else if (effective === "patients")
    view = (
      <Patients
        onOpenPatient={openPatient}
        onResume={resumeSession}
        onPlanCase={planCase}
        onStartWithoutPatient={startWithoutPatient}
        onOpenStudy={(s) => void openStudy(s)}
        onOpenPending={() => setScreen("pending")}
        onOpenOrders={(p) => { setOrdersPatient(p); setScreen("orders"); }}
      />
    );
  else if (effective === "studies")
    view = (
      <Studies
        onOpen={(s) => void openStudy(s)}
        onResume={(s) => void resumeStudySession(s)}
        onBack={() => setScreen("patients")}
      />
    );
  else if (effective === "orders")
    view = (
      <ClipOrdersPage
        patientFilter={ordersPatient}
        onClearPatient={() => setOrdersPatient(null)}
      />
    );
  else if (effective === "workshops") view = <WorkshopsPage />;
  else if (effective === "pending") view = <PendingRequests onBack={() => setScreen("patients")} />;
  else if (effective === "users") view = <UsersAdmin onBack={() => setScreen("patients")} />;
  else if (effective === "audit") view = <AuditTrail onBack={() => setScreen("patients")} />;
  else
    view = (
      <Workspace
        patient={patient}
        initialStep={resumeStep}
        onBack={() => setScreen("patients")}
        onOpenPatient={() => navigate(`${SCREEN_PATH.patients}?paciente=${patient?.id ?? ""}`)}
        onFinish={finish}
      />
    );

  return (
    <NavProvider value={{ screen: effective, go: setScreen }}>
    <div style={{ height: "100%", position: "relative" }}>
      {view}
      {loadingIn && <LoadingScreen onDone={() => setLoadingIn(false)} />}
      <UnsavedExitDialog
        open={blocker.state === "blocked"}
        hasPatient={!!(planning.patient ?? patient)}
        attached={!!planning.imagingStudyId}
        onStay={() => blocker.reset?.()}
        onLeave={() => blocker.proceed?.()}
        saveNow={planning.saveNow}
      />
      <ServerDownBanner />
      {toast && (
        <div
          role={retryHere ? "alert" : undefined}
          style={{
            position: "fixed",
            top: 76,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            background: "var(--foreground)",
            color: "var(--background)",
            padding: "12px 22px",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {toast}
          {retryHere && (
            <>
              <button
                type="button"
                onClick={() => { setToastRetry(null); retryHere(); }}
                style={{ marginLeft: 14, background: "transparent", color: "inherit", border: "1px solid currentColor", borderRadius: "var(--radius-sm)", padding: "3px 10px", font: "inherit", cursor: "pointer" }}
              >
                Reintentar
              </button>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => { setToastRetry(null); setToast(null); }}
                style={{ marginLeft: 6, background: "transparent", color: "inherit", border: "none", font: "inherit", cursor: "pointer" }}
              >
                ×
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </NavProvider>
  );
}

const SPLASH_KEY = "prospective.splashShown";

export default function App() {
  // El splash de intro se ve una sola vez por sesión, en la primera página que se
  // cargue (la landing lo muestra si entras por "/"; aquí si entras directo a /app).
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(SPLASH_KEY) === "1");

  return (
    <AuthProvider>
      <PlanningProvider>
        {!dismissed && (
          <VideoSplash
            onDone={() => {
              sessionStorage.setItem(SPLASH_KEY, "1");
              setDismissed(true);
            }}
          />
        )}
        <Router />
      </PlanningProvider>
    </AuthProvider>
  );
}
