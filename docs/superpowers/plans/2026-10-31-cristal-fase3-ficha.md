# Cristal D · Fase 3 (ficha del paciente en cascada L3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la hoja lateral de la ficha del paciente por una página con URL propia que enseña al paciente como cascada de columnas de cristal (Datos › Casos › Estudios de imagen › Sesiones › Vista previa), conservando todas sus funciones.

**Architecture:** Un campo aditivo en la API de sesiones del paciente (estudio de imagen y caso) permite filtrar sesiones por estudio. La ruta `/app/pacientes/:id` monta `pages/PatientPage.tsx` dentro del `AppShell`; un componente genérico `components/ficha/Cascada.tsx` pinta columnas y lleva el teclado; cada columna es un componente pequeño en `components/ficha/`. La edición y el alta de pacientes salen de `PatientSheet.tsx` a una hoja de formulario `PatientFormSheet.tsx`; el resto de `PatientSheet.tsx` se reparte entre las columnas y el fichero desaparece. El contrato de comportamiento es `pages/PatientSheet.test.tsx`: cada uno de sus casos tiene un equivalente en los tests nuevos.

**Tech Stack:** React 19, react-router-dom data router, vitest + Testing Library; FastAPI + pydantic + pytest en `backend/`; `openapi-typescript` (`npm run gen:api`).

**Spec:** `docs/superpowers/specs/2026-10-31-rediseno-cristal-d-design.md` §5.2, §5.3, §8.3, §8.8, §8.9, §9 fase 3. Tablero: `docs/superpowers/specs/assets/2026-10-31-cristal-d/L3-Pacientes.dc.html`.

## Global Constraints

- Material de la fase 1 (`glass()`, `data-glass`, tokens, `glide`, `lens`, `lensCard`) y shell de la fase 2.
- Commits por lista explícita; nunca `git add -A`; nunca `docs/Informe-Ejecutivo-Zenodo.html`, `frontend/data/`.
- Sin color literal en `pages/`, `components/shell/`, `components/patients/`; la carpeta nueva `components/ficha/` se añade a esa vigilancia en `styles/tokens.test.ts`.
- Único cambio de API permitido: `PatientSessionInfo` gana `case_id: int | None` (de `PlanningSession.study_id`) e `imaging_study_id: int | None`. Sin migración.
- Si corre una pasada del backend en el checkout principal, no se toca ese checkout ni se reinicia su servidor: el trabajo vive en el worktree.
- Todas las funciones de la ficha actual siguen: datos y su edición, casos (editar, eliminar, planificar, subir DICOM), estudios de imagen del caso (abrir, reanudar, borrar), sesiones (reanudar, renombrar en línea, borrar con confirmación, errores 409 literales), «Compartido con» y «Compartir con…», capturas de todo el paciente, pedidos del paciente, eliminar paciente, aviso de cambios sin guardar, derechos (cuenta compartida = solo lectura; creador y admin = edición).
- Galería de capturas: de todo el paciente (§8.8), no por estudio.
- Breakpoints: ≤ 1280 px solo las dos últimas columnas abiertas, con migas para volver.

## Review Focus

1. Sesiones guardadas sin estudio de imagen (`imaging_study_id = null`): aparecen bajo la entrada «Sesiones sin estudio archivado» de la columna Estudios, nunca se pierden (test en la tarea 5).
2. Recargar `/app/pacientes/42` o llegar con Atrás desde el pipeline deja la ficha abierta en el paciente 42; un id inexistente o un 403 enseña el aviso de siempre («Paciente no autorizado» con 403) y un enlace a Pacientes (test en la tarea 2).
3. Cambiar de caso con un estudio y una sesión abiertos: las columnas de la derecha se vacían y se recalculan para el caso nuevo, sin enseñar sesiones del caso anterior (test en la tarea 5).
4. Una cuenta con la que el paciente está compartido no ve lápiz, «Borrar», «Editar datos», «Eliminar caso» ni «Eliminar paciente» en ninguna columna (test en las tareas 4 y 5).
5. Teclado: con el foco en una fila, → abre la columna siguiente y la enfoca; ← vuelve a la anterior sin cerrar nada; Esc en la cascada no navega fuera (test en la tarea 3).

---

### Task 1: Estudio de imagen y caso en las sesiones del paciente (API)

**Files:**
- Modify: `backend/models/patient.py` (`PatientSessionInfo`), `backend/routers/patients.py` (`list_patient_sessions`), el test del backend que cubre `GET /patients/{id}/sessions` (localizar con `grep -rn "sessions" backend/tests | grep -i patient`; si no hay, crear `backend/tests/test_patient_sessions_fields.py`), `frontend/openapi.json`, `frontend/src/api/schema.gen.ts`, `frontend/src/api/types.ts` (`PatientSessionInfo`)

**Interfaces:**
- Produces: `PatientSessionInfo.case_id: int | None = None`, `PatientSessionInfo.imaging_study_id: int | None = None` (backend); en TS `case_id: number | null; imaging_study_id: number | null`.

- [ ] **Step 1: Test del backend:** con un paciente que tiene una sesión con `study_id=3, imaging_study_id=7` y otra con ambos `None`, `GET /api/patients/{id}/sessions` devuelve `case_id == 3, imaging_study_id == 7` en la primera y `None, None` en la segunda.
- [ ] **Step 2: Ver que falla:** `cd backend && .venv/Scripts/python -m pytest <fichero> -q`.
- [ ] **Step 3: Implementar** el campo y su relleno.
- [ ] **Step 4: Ver que pasa;** regenerar `frontend/openapi.json` con `backend/scripts/export_openapi.py` (leer el script para la ruta de salida) y `cd frontend && npm run gen:api`; añadir los dos campos a `types.ts`; `npx tsc -b` limpio y `npx vitest run src/api`.
- [ ] **Step 5: Commit** — «API: las sesiones del paciente dicen su caso y su estudio de imagen».

### Task 2: Ruta de la ficha y entradas

**Files:**
- Create: `frontend/src/pages/PatientPage.tsx` (esqueleto: `AppShell` con migas «Pacientes › <nombre>», carga del paciente con `api.getPatient`, estados de carga, 403 y error), `frontend/src/pages/PatientPage.test.tsx`
- Modify: `frontend/src/store/nav.tsx`, `store/nav.test.ts`, `frontend/src/App.tsx`, `frontend/src/pages/Patients.tsx` (la tarjeta y `?paciente=` navegan a la ruta), `frontend/src/components/CommandPalette.tsx` si recibe `onOpenPatient` desde `App.tsx` (solo el destino cambia)

**Interfaces:**
- Produces en `store/nav.tsx`: `Screen` gana `"patient"`; `SCREEN_PATH.patient = "/app/pacientes"` no se usa para navegar; `patientPath(id: number): string` → `/app/pacientes/${id}`; `patientIdFromPath(pathname: string): number | null` (solo enteros positivos tras `/app/pacientes/`); `screenFromPath("/app/pacientes/42")` → `"patient"`; `screenFromPath("/app/pacientes/abc")` → `"patients"`.
- Produces: `PatientPage({ patientId, onResume, onPlanCase, onOpenStudy, onOpenOrders }: { patientId: number; onResume: (sessionId: string, p: PatientSummary) => void; onPlanCase: (st: StudySummary, p: PatientSummary) => void; onOpenStudy?: (img: StudyCard) => void; onOpenOrders?: (p: PatientSummary) => void })`. `App.tsx` la monta cuando `screen === "patient"`; las migas del pipeline (`onOpenPatient` de `Workspace`), la paleta, Estudios (`onOpenPatient`) y la tarjeta de Pacientes navegan a `patientPath(id)`; `?paciente=<id>` en Pacientes redirige (replace) a la ruta.

- [ ] **Step 1: Tests.** `nav.test.ts`: los cuatro casos de `screenFromPath`/`patientIdFromPath` de arriba y `patientPath(42) === "/app/pacientes/42"`. `PatientPage.test.tsx`: con `api.getPatient` resolviendo «Zenodo, Caso 002» la miga dice «Pacientes» y «Zenodo, Caso 002»; con un 403 aparece «Paciente no autorizado» y un botón «Volver a Pacientes»; pulsar la miga «Pacientes» navega a `/app/pacientes`. En `Patients.test.tsx`: pulsar una tarjeta navega a `/app/pacientes/<id>`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** `npx vitest run src/store src/pages/PatientPage.test.tsx src/pages/Patients.test.tsx src/App.resume.test.tsx` y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Ficha con URL propia: /app/pacientes/:id».

### Task 3: `Cascada` (columnas de cristal con teclado)

**Files:**
- Create: `frontend/src/components/ficha/Cascada.tsx`, `Cascada.test.tsx`, `ficha.css`
- Modify: `frontend/src/styles/tokens.test.ts` (añadir `components/ficha` a los directorios vigilados)

**Interfaces:**
- Produces: `interface ColumnaCascada { key: string; titulo: string; ancho?: number; contenido: ReactNode }`; `Cascada({ columnas, onVolver }: { columnas: ColumnaCascada[]; onVolver: (hastaIndice: number) => void })`. Cada columna es un `section` de cristal (`glass("normal")` + `data-glass`, radio `--radius-xl`) con `aria-label={titulo}` y cabecera con el título en rótulo mono; anchos por defecto 320 (primera), 300 (intermedias) y el resto del espacio la última; separación 12 px; desplazamiento horizontal con imán (`scroll-snap-type: x proximity`) si no caben; al añadirse una columna, se desplaza hasta mostrarla. Teclado (sobre la cascada, `onKeyDown`): → mueve el foco al primer elemento enfocable de la columna siguiente; ← a la anterior; las columnas usan `role="listbox"`/`option` o botones en lista (lo decide cada columna; la cascada solo mueve el foco entre `section`). ≤ 1280 px (`matchMedia`): solo las dos últimas columnas visibles y, encima, migas con los títulos de las anteriores (cada miga llama `onVolver(i)`).

- [ ] **Step 1: Tests:** con tres columnas, cada una se pinta como `region` con su nombre; con el foco dentro de la primera, `ArrowRight` deja el foco dentro de la segunda y `ArrowLeft` lo devuelve; con `matchMedia("(max-width: 1280px)")` a `true` y cuatro columnas solo se ven las dos últimas y hay migas con las dos primeras; pulsar la primera miga llama `onVolver(0)`; cada columna tiene `data-glass`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Ficha: componente de cascada de columnas con teclado».

### Task 4: Hoja de formulario del paciente y columna Datos

**Files:**
- Create: `frontend/src/components/PatientFormSheet.tsx`, `PatientFormSheet.test.tsx`, `frontend/src/components/ficha/ColumnaDatos.tsx`, `ColumnaDatos.test.tsx`
- Modify: `frontend/src/pages/Patients.tsx` («Nuevo paciente» abre `PatientFormSheet` en modo alta), `frontend/src/pages/PatientPage.tsx`

**Interfaces:**
- Produces: `PatientFormSheet({ open, patient, onClose, onSaved }: { open: boolean; patient: PatientDetail | null /* null = alta */; onClose: () => void; onSaved: (creado?: PatientSummary) => void })` — el formulario actual de `PatientSheet.tsx` (campos, ayudas de Apellidos y Antecedentes, Sexo sin dato, Notas como área de texto, edad junto a la fecha de nacimiento, «Guardar cambios»/«Crear paciente» con el motivo de apagado, aviso de descartar cambios) en una `Sheet` de 460 px; solo lectura si la cuenta no tiene derechos (sin botón de guardar). El tipo del detalle es el que hoy devuelve `api.getPatient` (leerlo en `api/types.ts`).
- Produces: `ColumnaDatos({ patient, summary, puedeEditar, seccion, onSeccion, onEditar, onNuevoCaso, onEliminado })` donde `seccion: "casos" | "capturas"` y `onSeccion(s)` cambia lo que se abre a la derecha. Contenido: nombre (título 20), HC en mono, sexo y edad, institución, antecedentes resumidos; «Editar datos» (abre `PatientFormSheet`), «Nuevo caso»; **«Compartido con»** (lista con nombre y rol, «Compartir con…» solo para creador o admin, abre la hoja de compartir actual); tres entradas con contador: «Casos · n» (`onSeccion("casos")`, abierta por defecto), «Capturas · n» (`onSeccion("capturas")`), «Pedidos de clip» (llama `onOpenOrders`); al pie, «Eliminar paciente» con la confirmación actual (`DeleteConfirm`, que se mueve aquí) solo para creador o admin.

- [ ] **Step 1: Tests** (migrando los de `PatientSheet.test.tsx` de los bloques «datos del paciente», «Compartido con», «eliminar el paciente desde la ficha», «derechos sobre los datos del paciente», «salir de la ficha con cambios sin guardar» en lo que toca al formulario, y el alta a 460 px de «ficha en dos columnas…»): mismas aserciones de texto y rol, ahora contra `PatientFormSheet` o `ColumnaDatos`. Nuevo: «Casos · 2» y «Capturas · 5» con los contadores de los datos simulados; una cuenta compartida no ve «Editar datos» ni «Eliminar paciente».
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** los ficheros nuevos y `src/pages/Patients.test.tsx`; `npx tsc -b`.
- [ ] **Step 5: Commit** — «Ficha: hoja de formulario del paciente y columna Datos».

### Task 5: Columnas Casos, Estudios de imagen, Sesiones y Vista previa

**Files:**
- Create: `frontend/src/components/ficha/ColumnaCasos.tsx`, `ColumnaEstudios.tsx`, `ColumnaSesiones.tsx`, `VistaPrevia.tsx`, y un test por fichero
- Modify: `frontend/src/pages/PatientPage.tsx` (compone la cascada con el estado `casoId`, `estudioId | "sin-estudio"`, `sesionId`)

**Interfaces:**
- Consumes: `api.patientStudies(patientId)` (casos), el listado de estudios de imagen por caso que usa hoy `StudyGallery` (`pages/Studies.tsx`; reutilizar su llamada a la API, no el componente entero), `api.patientSessions(patientId)` con `case_id`/`imaging_study_id` (tarea 1), `api.renameSavedSession`, `api.deleteSavedSession`, `api.deleteImagingStudy`, `api.deleteStudy`, `NuevoEstudioSheet` (editar caso), `Cascada` (tarea 3).
- Produces:
  - `ColumnaCasos`: filas con diagnóstico (o «Caso sin diagnóstico»), fecha, tipo, región y lateralidad, «Imágenes: …» con la regla actual de angio/pangio; acciones por caso: «Planificar este caso», «Subir DICOM de este paciente» (con la regla actual de pedir caso si no hay), «Editar caso», «Eliminar caso» (con derechos). Seleccionar un caso abre Estudios.
  - `ColumnaEstudios`: estudios de imagen del caso (miniatura, modalidad, fecha, cortes, nº de sesiones); al final, si hay sesiones del caso con `imaging_study_id === null`, la entrada «Sesiones sin estudio archivado»; acciones «Abrir estudio» (`onOpenStudy`), «Borrar estudio» (con derechos). Seleccionar abre Sesiones.
  - `ColumnaSesiones`: sesiones cuyo `imaging_study_id` es el estudio elegido (o `null` con «sin estudio» y `case_id` del caso); cada fila con paso, fecha y hora local, tamaño, etiqueta sin repetir el nombre del paciente; renombrar en línea (lápiz, Intro, Escape cancela sin cerrar nada), «Borrar» con confirmación por nombre y el 409 literal bajo la fila; con derechos. Seleccionar abre Vista previa.
  - `VistaPrevia`: miniatura del estudio (o «Sin vista previa»), paso, Ø máximo y riesgo si los hay, «Reanudar» (primario; `onResume(session_id, summary)`).
  - Al cambiar de caso se limpian estudio y sesión; al cambiar de estudio se limpia la sesión.

- [ ] **Step 1: Tests** (migrando los bloques «acciones de arriba», «casos», «sesiones guardadas», «derechos sobre los guardados», «restos de F2-30…», «imágenes diagnósticas del caso» y «salir de la ficha con cambios sin guardar» en lo que toca a planificar): mismas aserciones contra las columnas nuevas. Nuevos: una sesión con `imaging_study_id: null` del caso aparece al elegir «Sesiones sin estudio archivado»; con el estudio A y una sesión abiertos, elegir otro caso deja Sesiones y Vista previa sin pintar; «Reanudar» en la vista previa llama `onResume("s-1", summary)`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver que pasan** y `npx tsc -b`.
- [ ] **Step 5: Commit** — «Ficha: casos, estudios de imagen, sesiones y vista previa en cascada».

### Task 6: Capturas, pedidos y retirada de la hoja antigua

**Files:**
- Modify: `frontend/src/pages/PatientPage.tsx` (con `seccion === "capturas"`, a la derecha de Datos una sola columna ancha con `CaptureGallery patientId`; «Pedidos de clip» llama `onOpenOrders`), `frontend/src/pages/Patients.tsx` (ya no importa `PatientSheet`)
- Delete: `frontend/src/pages/PatientSheet.tsx`, `frontend/src/pages/PatientSheet.test.tsx` (solo cuando cada `it` suyo tenga equivalente; tabla de correspondencia en el informe de la tarea)

**Interfaces:**
- Consumes: `CaptureGallery` (sin cambios), `ColumnaDatos.onSeccion`.

- [ ] **Step 1: Tests** en `PatientPage.test.tsx`: pulsar «Capturas · n» enseña la galería (texto que ya prueba `CaptureGallery.test.tsx`, p. ej. el vacío que explica cómo se hacen) y oculta Casos; volver a «Casos · n» la recupera; «Pedidos de clip» llama `onOpenOrders(summary)`.
- [ ] **Step 2: Ver que fallan.**
- [ ] **Step 3: Implementar y borrar** la hoja antigua; `grep -rn "PatientSheet" frontend/src` debe devolver solo `PatientFormSheet`.
- [ ] **Step 4:** `npx vitest run src/pages src/components` y `npx tsc -b` verdes.
- [ ] **Step 5: Commit** — «Ficha: capturas de todo el paciente y pedidos; se retira la hoja antigua».

### Task 7: Cierre de la fase

- [ ] **Step 1:** `npx vitest run` completo, `npx tsc -b`, y la suite de backend de pacientes (`.venv/Scripts/python -m pytest backend/tests -q -k patient`) verdes.
- [ ] **Step 2:** Nota «Fase 3 completada el …» en §9 del documento de diseño, con desviaciones.
- [ ] **Step 3: Commit** — «Diseño: fase 3 del cristal D completada».
