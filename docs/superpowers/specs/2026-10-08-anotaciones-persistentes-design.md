# Anotaciones persistentes (E2): reglas, ángulos, regiones y marcadores que se guardan — diseño

Fecha: 2026-10-08. Ámbito: `frontend/` (React 19 + vtk.js) y `backend/` (un router nuevo, una sección del informe). Segundo subproyecto de la serie E (E1 navegación y orientación → **E2 anotaciones persistentes** → E3 pantalla limpia y controles → E4 herramientas clínicas). Parte de master 67a140e, que ya integra el trabajo del colaborador (contrato de tipos de la API, permisos por sesión, auditoría, Alembic).

## 1. Propósito

Lo que pidió el propietario el 2026-10-02: «herramientas como reglas para anotaciones, para ángulos, para encerrar hallazgos y que se guarden». Hallazgos medidos en el código (commit 710493d):

- El único instrumento de medida es el calibrador 3D («Mediciones 3D», `components/vessels/MeasurementPanel.tsx`): dos clics sobre la malla, distancia en mm, solo en el paso Morfometría, solo en el 3D, y **nunca se guarda**: `measurements` vive en el store y se pierde al reanudar.
- No hay ángulos, ni regiones, ni marcadores de texto. En los cortes 2D no se puede medir nada; `SliceView` solo reporta clics como fracciones del rectángulo (`onPlaneClick(u, v)`) y los convierte a vóxel entero.
- Las capturas (`composeCapture.ts`) pintan solo el lienzo de vtk, el rótulo y las lecturas de esquina: cualquier superposición SVG o HTML queda fuera de la imagen.
- El informe (`services/report_generator.py`) no tiene sección de mediciones.
- El «mm» de la aplicación es el marco del volumen: vóxel × espaciado con origen 0 (`vtk/geometry.ts`). Mallas, picks y marcadores ya viven ahí; es el marco en el que las anotaciones son exactas y comparables con todo lo demás.

Decisiones del propietario (2026-10-02 y 2026-10-05): las anotaciones viven en la sesión; se ven en cortes y en 3D, en las capturas y en el informe; hay un panel «Anotaciones»; el calibrador 3D se integra en el sistema nuevo; **editar arrastrando puntos queda fuera de E2** (una anotación mal puesta se borra y se rehace).

## 2. Modelo de datos (`vtk/annotations.ts`, `api/types.ts`, `backend/models/annotations.py`)

```ts
type AnnotationKind = "regla" | "angulo" | "region" | "marcador";
interface Annotation {
  id: string;                 // uuid del cliente
  kind: AnnotationKind;
  points: Vec3[];             // mm del marco del volumen; regla 2, ángulo 3 (vértice en medio), región ≥ 3, marcador 1
  plane: { plane: "axial" | "coronal" | "sagital"; index: number } | null;  // dónde se creó; obligatorio en region
  label: string;              // «R1», «A1», «G1», «M1» por defecto; editable
  note: string;               // texto del marcador; vacío en los demás
  visible: boolean;
  created_at: string;         // ISO
  created_by: string;         // usuario; lo pone el servidor al guardar
}
```

- **Valor derivado, no almacenado**: `measure(a)` devuelve `{ kind: "distancia", mm }`, `{ kind: "angulo", deg }` (ángulo en el vértice, 0–180), `{ kind: "area", mm2, perimetroMm }` (polígono plano por la fórmula del cordón, en el plano de la región) o `null` (marcador). El servidor recalcula lo mismo para el informe con las mismas fórmulas (`backend/services/annotations.py`), así cliente e informe no pueden discrepar.
- Puro y probado: `measure`, `nextLabel(kind, existentes)`, `onSlice(a, plane, index, meta)` (§4), `polygonArea`.

## 3. Crear anotaciones (`store/planning.tsx`, `Viewer.tsx`, `SliceView.tsx`, `MeshView.tsx`)

- `PickMode` gana `anot_regla`, `anot_angulo`, `anot_region`, `anot_marcador`; `measure` desaparece. El store gana `annotations: Annotation[]`, `setAnnotations` (marca la sesión sucia con `touch`), `annotationDraft: Vec3[]` (puntos ya puestos del que se está creando), `selectedAnnotation: string | null`.
- **En 3D**: cada clic sobre la malla (`onPick`) añade un punto al borrador; el borrador se dibuja con los `markers`/`lines` existentes en color pendiente. Regla y marcador se cierran solos al completar sus puntos; ángulo al tercero; región no se crea en 3D (su área necesita un plano).
- **En los cortes**: `SliceView` reporta además `onPlaneClickMm(p: Vec3)` con precisión subvóxel: `u, v` → mm del plano con `box.mmPerPx` y el índice del corte (`vtk/sliceCoords.ts`, puro: `uvToMm`, `mmToUv`). El clic en modo anotación no mueve el crosshair. La región se cierra pinchando el primer punto (radio 8 px), con doble clic o con Intro; Esc cancela el borrador; Retroceso quita el último punto.
- **Marcador**: un clic coloca el punto y el panel enfoca el campo de texto de la nota; Intro lo cierra.
- Al cerrar una anotación: `label = nextLabel`, `plane` = el corte donde se hizo (o `null` en 3D), `visible = true`, se añade al store, se selecciona en el panel y el modo se desarma (como el calibrador actual). Guardado §6.

## 4. Verlas en todas las vistas (`SliceView.tsx`, `MeshView.tsx`, `Viewer.tsx`, `vtk/annotationOverlay.ts`)

- **Cortes 2D**: una capa SVG `.hud-anot` dentro de `HudFrame` (no es `hud-decor`: REGLAS ○ no la oculta; la ocultación es por anotación o con «Ocultar todas» del panel). `onSlice(a, plane, index, meta)` decide si se dibuja: todos sus puntos a ≤ 0,5 × espaciado del plano del corte (la región solo en su plano e índice exactos). Regla: segmento con extremos y rótulo «R1 · 12,4 mm» en el punto medio; ángulo: dos segmentos y arco con «A1 · 63°» en el vértice; región: polígono cerrado con relleno al 15 % y «G1 · 48 mm²»; marcador: punto con «M1 · nota». La proyección mm → px sale de `mmToUv` y del `box` de la celda; en celdas compactas solo el rótulo corto («R1»). La seleccionada en el panel se dibuja con trazo doble.
- **3D**: las anotaciones visibles entran en `lines`/`markers` de `MeshView` (tubo y bolas con las proporciones de `markerSize.ts`, color propio por tipo); la región se dibuja como polilínea cerrada. Los rótulos van en una capa SVG sobre el 3D posicionada con `worldToDisplay` (el patrón de `planeTrace.ts` en `MipView`), reposicionada en cada `onModified` de la cámara.
- **VOLUMEN y Oblicuo**: solo muestran lo que ya dibujan sus trazas (nada nuevo en E2); ver §9.
- Colores: regla ámbar, ángulo cian, región verde, marcador magenta; constantes en `vtk/planeColors.ts` junto a los de los planos.

## 5. Panel «Anotaciones» (`components/annotations/AnnotationsPanel.tsx`, `pages/Workspace.tsx`)

- Siempre visible, en la columna derecha debajo del panel del paso, como `Collapsible` plegado por defecto con el número de anotaciones en el título («Anotaciones · 3»). Sustituye a «Mediciones 3D» del paso Morfometría.
- Fila de herramientas: **Regla (R) · Ángulo (A) · Región (G) · Marcador (T)**; el botón activo queda pulsado; al activar uno la pista de la celda dice qué hacer («Regla: dos clics en un corte o en la malla»). El modo de pinchado de anotación desactiva los otros modos (cuello, tijeras…) y viceversa.
- Lista: icono por tipo, nombre editable al pinchar, valor con unidad, corte de origen («AX 152» o «3D»), ojo de visibilidad, «Ir» (lleva el punto compartido al centroide y, si tiene plano, ese corte a su índice) y borrar (Supr sobre la seleccionada). «Ocultar todas / Mostrar todas» y «Exportar CSV» (nombre, tipo, valor, unidad, corte, nota, puntos en mm). Vacío: «Sin anotaciones. Elige una herramienta y pincha en un corte o en la malla».
- Las notas de los marcadores se editan en la propia fila.

## 6. Guardado y recuperación (`backend/routers/annotations.py`, `App.tsx`, `services/report_generator.py`)

- `GET /api/annotations/{session_id}` → `{ annotations: Annotation[] }`; `PUT /api/annotations/{session_id}` con la lista entera (es pequeña) → la guarda en `data/sessions/<id>/annotations.json` y devuelve la lista con `created_by` puesto. El fichero vive en la carpeta de la sesión: viaja con «Guardar progreso» (snapshot) y vuelve con «Reanudar» (rehydrate) sin tocar `state.txt` ni la base de datos.
- Seguridad del colaborador: router incluido con `_private`, `require_session(db, user, session_id)`, `valid_session_id`; validación Pydantic (2/3/≥3/1 puntos por tipo, `plane` obligatorio en región, `label` ≤ 40 y `note` ≤ 500 caracteres, máximo 200 anotaciones). Auditoría solo cuando la lista guardada tiene **menos** elementos que la anterior (`ACT_ANNOTATIONS_DELETE`, con los ids borrados): borrar es lo irreversible; crear y renombrar no se auditan.
- Cliente: `api.getAnnotations(sid)`, `api.putAnnotations(sid, list)`; `contract.check.ts` y `openapi.json` regenerados. Guardado automático con 600 ms de espera tras cada cambio (crear, renombrar, ocultar, borrar, nota), con indicador en el título del panel («guardando…» / «sin guardar» si falla); `saveProgress` espera a que termine. `resumeSession` (`App.tsx`) carga la lista tras la morfometría; `resetDownstream` la vacía solo al cambiar de malla (resegmentar), y `reset()` siempre.

## 7. Capturas e informe

- **Capturas**: `composeCapture.ts` gana primitivas vectoriales (`line`, `polygon`, `text` con fondo) y pinta las anotaciones visibles de cada celda con la misma proyección que el SVG: `estadoVisor` lleva `annotations_visible: n`. En el 3D la captura del lienzo ya incluye tubos y bolas; los rótulos se pintan igual que en 2D.
- **Informe**: `ReportData.annotations` se lee de `annotations.json`; `_section_annotations` (tras `_section_trajectory`) con tabla Nombre · Tipo · Valor · Corte · Nota, y una línea «Sin anotaciones» si no hay. El valor lo calcula el servidor (§2).

## 8. Atajos (`vtk/shortcuts.ts`, `hud/ShortcutsSheet.tsx`, `README.md`)

Ámbito visor: **R** regla, **A** ángulo, **G** región, **T** marcador (texto); **Supr** borra la anotación seleccionada; **Retroceso** quita el último punto del borrador; **Esc** cancela el borrador (y ya desarma los modos). Nunca con el foco en un campo de texto (regla existente). H y P siguen reservadas para E3. La hoja «?» y la tabla del README los listan.

## 9. Fuera de alcance

Editar arrastrando puntos; crear anotaciones en Oblicuo o VOLUMEN (solo las muestran si ya dibujan trazas; en E2 no dibujan ninguna); exportar en coordenadas LPS del paciente (`origin_mm`/`direction` de `VolumeMeta` quedan para E4); anotaciones compartidas entre sesiones o usuarios; dibujar anotaciones en el render de servidor de la escena del informe (la captura del navegador ya las trae); medidas sobre el volumen (densidad, perfil).

## 10. Pruebas

- `annotations.test.ts`: `measure` por tipo (regla, ángulo recto y obtuso, área de un cuadrado y de un polígono no convexo, perímetro), `nextLabel`, `onSlice` con tolerancia (dentro, justo fuera, región en otro índice).
- `sliceCoords.test.ts`: `uvToMm`/`mmToUv` ida y vuelta en los tres planos, incluida la inversión `v = 1 − f(z)` de coronal y sagital.
- `planning.test.tsx`: estado inicial, `setAnnotations` marca sucio, `resetDownstream`/`reset`.
- `AnnotationsPanel.test.tsx`: herramientas arman el modo, lista con valor y unidad, renombrar, ojo, borrar con Supr, CSV.
- `SliceView.test.tsx`: una regla en el corte se dibuja con su rótulo y desaparece a dos cortes de distancia; clic en modo anotación no mueve el crosshair.
- `composeCapture.test.ts`: las primitivas pintan sobre un `Ctx2D` falso.
- Backend: `test_annotations_api.py` (401 sin usuario, 403 de otro paciente, 404 de sesión inválida, validación por tipo, PUT/GET ida y vuelta, el fichero viaja en snapshot/restore, auditoría solo al borrar), `test_report_annotations.py` (la sección entra en el PDF con los valores del servidor), `test_openapi_contract.py` en verde tras regenerar.
- Navegador (Case 3): regla en axial y en 3D, ángulo en coronal, región en sagital, marcador con nota; se ven en el corte y en el 3D; «Guardar progreso», reanudar y están todas; captura con la regla pintada; PDF con la tabla; R/A/G/T/Supr/Esc.
