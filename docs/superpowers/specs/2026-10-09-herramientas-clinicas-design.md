# Herramientas clínicas (E4): ventanas por modalidad, vista de abordaje, MIP local y recorrido del vaso — diseño

Fecha: 2026-10-09. Ámbito: `frontend/` (React 19 + vtk.js 36) y un endpoint nuevo de solo lectura en `backend/`. Cuarto y último subproyecto de la serie E (E1 navegación y orientación → E2 anotaciones persistentes → E3 pantalla limpia y controles → **E4 herramientas clínicas**). Parte de master 271bfaa.

## 1. Propósito

La serie E acordó que E4 empezara por un **inventario de cada herramienta con su propósito** y siguiera con las candidatas: preajustes de ventana para 3DRA/XA, comparación lado a lado, CPR por la línea central, ángulo de abordaje y MIP local del cuello. El inventario (§2) se hizo sobre master 271bfaa y encontró que las ~60 acciones del visor y los paneles tienen un porqué; las debilidades son de **ventana** (tres sistemas que no se hablan y un preajuste que desaparece), de **referencia** (un ángulo sin decir respecto a qué; una gráfica que enseña dónde está el problema pero no lleva allí; tres vistas de cámara sin botón) y de **duplicados** menores.

Decisiones del propietario (2026-10-09): entran los siete puntos propuestos (§3–§9); quedan fuera la comparación lado a lado y el CPR enderezado como imagen (§11).

## 2. Inventario

La tabla completa va al README (§9); aquí lo que E4 corrige, medido en el código:

- **«Vasos» desaparece al segmentar.** `Viewer.tsx:1561` pasa `[threshold_lower, NaN]` cuando no hay vista previa y `windowPresets.ts:26` exige `band[1]` finito: el preajuste existe mientras se ajusta el umbral y se pierde justo cuando el estudio queda segmentado. El límite superior sí existe en el servidor (`GET /api/segment/suggested-band` devuelve `lower/upper/vmin/vmax`), pero solo lo consulta `SegmentPanel`.
- **VOLUMEN habla en TC aunque el estudio sea XA.** `volumePresets.ts` ofrece «CTA», «Vasos CTA», «Cerebro», «Hemorragia», «Hueso», «Tejido blando» en toda modalidad; sus curvas van en el dominio 0–255 del rango robusto, así que en una 3DRA «Hueso» es «lo más brillante» y «Cerebro» no significa nada. El modo MIP no tiene ventana: una rampa fija desde el umbral (`MipView.tsx:176-182`, `379-383`) y el botón derecho solo cambia ventana en COMPUESTO (`MipView.tsx:303`).
- **Tres ventanas independientes:** `mprWl` (cortes y Oblicuo), `volumeWindows[preset]` (COMPUESTO) y la rampa del MIP. Sin gesto ni botón que las lleve al mismo sitio.
- **Ángulo de abordaje sin referencia.** «Ángulo: 37,2°» (`DevicesPanel.tsx:1599`) es la incidencia del corredor respecto al **eje principal del aneurisma**, plegada a 0–90° (`approach.py:211-218`, `report_generator.py:698-711`), con el eje z como reserva si no hay morfometría. La etiqueta no lo dice. No hay forma de poner la cámara ni un corte **a lo largo del corredor**.
- **Vistas inalcanzables.** `StandardView` define `axial_inf`, `coronal_post`, `sagital_izq` (`geometry.ts:122-130`) y `MeshView.setView` las acepta; ningún botón las llama. El comentario de `Viewer.tsx:123` promete «un segundo clic en la misma vista la mira desde el lado opuesto» y no está implementado.
- **La gráfica de calibre no se puede pinchar.** `DiameterChart.tsx` marca el punto más estrecho y no lleva a él. Los puntos de la línea central (`centerline_points.npz`: `points (N,3)`, `radii`) nunca llegan al cliente; la API devuelve la URL del tubo y métricas.
- **MIP sin acotar.** Para ver el cuello en VOLUMEN hay que recortar con LÁMINA o LIBRE a mano; el árbol entero lo tapa en ACUMULADO.
- **Duplicados.** El recorte por ROI de `MeshEditTools` ofrece «Esfera · Caja» y la «Caja de recorte» de la tarjeta siguiente hace lo mismo con tres ejes y vista previa; la edad se escribe en Decisión (`TreatmentPanel`, desde la fecha de nacimiento), ELAPSS y UIATS (`edadDesde`, desde la fecha) y PHASES (`"60"` fijo), con dos copias del mismo cálculo; «Centrar en la lesión» está en el 3D (VISTA ▸ LESIÓN), en Morfometría y en Dispositivos.

## 3. Ventanas por modalidad (`vtk/windowPresets.ts`, `vtk/volumePresets.ts`, `vtk/useVesselBand.ts`, `MipView.tsx`, `vtk/mipReadout.ts`, `store/planning.tsx`, `Viewer.tsx`)

### 3.1 La banda de vasos, una sola fuente

- Hook nuevo `useVesselBand(sessionId, segmentation)` en `vtk/useVesselBand.ts`: pide una vez por sesión `GET /api/segment/suggested-band/{sid}` (caché por `sessionId`, como `useVolumeMeta`) y devuelve `VesselBand = { lo, hi } | null`, con `lo = segmentation?.threshold_lower ?? suggested.lower` y `hi = suggested.vmax` (`vmax` ya es `max(p99.9, upper)`, así que incluye los núcleos brillantes de una DSA). Mientras la petición no ha vuelto, `null`. Un error de red deja `null` y no se reintenta hasta cambiar de sesión.
- El `Viewer` sustituye `[threshold_lower, NaN]` por `previewBand ?? vesselBand` al construir los preajustes de los cortes. La vista previa viva sigue mandando mientras se ajusta el umbral.
- `windowPresets(meta, band)` no cambia de firma; con la banda siempre finita, «Vasos» aparece en XA/3DRA antes y después de segmentar. En TC los presets HU no cambian.

### 3.2 VOLUMEN según la modalidad

`volumePresets.ts` pasa de una lista fija a `volumePresetsFor(modality): VolumePreset[]`:

| Modalidad | Preajustes (en este orden) | Curva | Ventana por defecto |
|---|---|---|---|
| TC (`isHuModality`) | CTA · Vasos CTA · Cerebro · Hemorragia · Hueso · Tejido blando | las actuales | rango robusto (como hoy) |
| XA / 3DRA / otras | **Vasos** · **Todo** | «Vasos» = curva de «Vasos CTA»; «Todo» = curva de «CTA» | «Vasos»: `{ wc: (lo+hi)/2, ww: hi−lo }` de la banda de vasos; «Todo»: rango robusto |

- `VolumePreset` gana `"Vasos" | "Todo"`; `RAW` los define como alias de las curvas existentes (no hay curvas nuevas). `presetToWindow` y `presetToRange` no cambian.
- `defaultVolumeWindow(preset, meta, band)` devuelve la ventana por defecto de la tabla; `MipView` la usa donde hoy usa `defaultWindow([rlo, rhi])`, y «RESTABLECER» vuelve a ella (borra `volumeWindows[preset]`).
- El preajuste inicial del store (`volumePreset`) deja de ser `"Vasos CTA"` fijo: al llegar `meta`, si el preajuste vigente no está en `volumePresetsFor(meta.modality)`, el `Viewer` lo cambia al primero de la lista (`Vasos` en XA, `CTA` en TC). `reset()` del store vuelve a `"Vasos"`; en TC el `Viewer` lo corrige en el primer render con meta.
- Los nombres del HUD: «VASOS», «TODO» (mayúsculas como el resto de la fila); `copy.test.ts` los guarda.

### 3.3 El MIP gana ventana y nivel

- Store: `mipWindow: VolumeWindow | null` y `setMipWindow`. `null` = ventana derivada del umbral, la misma rampa de hoy: `wc = (lo + rhi)/2`, `ww = rhi − lo` (`lo` = umbral acotado al rango). `reset()` y la limpieza por nuevo volumen la ponen a `null`.
- `MipView` en modo MIP construye la rampa desde la ventana efectiva `w = mipWindow ?? derivada`: `ctf` negro en `w.wc − w.ww/2`, gris 0,25 en ese mismo punto y blanco en `w.wc + w.ww/2`; `otf` 0 por debajo, 0,9 al 15 % de la anchura y 1 en el extremo. Con `mipWindow === null` la imagen es idéntica a la actual (prueba de regresión con los mismos puntos).
- El botón derecho arrastra la ventana **también en MIP** (hoy `if (volumeMode !== "compuesto") return`): `windowFromDrag(start, dx, dy, [rlo, rhi])` sobre `mipWindow`. La fila de preajustes de COMPUESTO no aparece en MIP; «RESTABLECER» sí, en los dos modos, y en MIP hace `setMipWindow(null)`.
- Lectura (`mipReadoutLines`): en MIP ampliado la segunda línea pasa de `UMBRAL n` a `UMBRAL n · NIV x · VENT y` cuando `mipWindow` es `null` y a `NIV x · VENT y` cuando el usuario la ha movido (el umbral ya no describe la rampa). En compacto no cambia. El doble clic sobre la lectura restablece, como en los cortes (misma clase `hud-readout br hud-wl`, mismo `WL_TITLE`).
- Capturas: `readHud` ya lee las líneas de la lectura; no hay cambio.

### 3.4 Lo que NO se unifica

`mprWl` (cortes y Oblicuo) sigue separado de las ventanas de VOLUMEN: una rampa de proyección y una ventana de corte no comparten valores útiles. Lo que se unifica es la **fuente** («Vasos» sale de la misma banda en los tres sitios) y el **gesto** (botón derecho y doble clic en todas las vistas de volumen; arrastre izquierdo y doble clic en los cortes).

## 4. Abordaje con referencia y vista (`DevicesPanel.tsx`, `vtk/MeshView.tsx`, `vtk/geometry.ts`, `vtk/freePlane.ts`, `Viewer.tsx`)

### 4.1 Referencia explícita

- `DevicesPanel` (tarjeta Trayectoria): «Ángulo: 37,2°» pasa a «Ángulo respecto al eje del aneurisma: 37,2°», con `title` «Incidencia del corredor sobre el eje principal del saco, de 0° (a lo largo del eje) a 90° (perpendicular)». Si la morfometría no tiene eje (`principal_axis` nulo) el servidor usa el eje z; el panel lo dice: «respecto al eje vertical del estudio (sin eje del aneurisma medido)». El cliente sabe cuál es porque tiene `morphometry?.principal_axis`.
- El informe ya imprime el ángulo; su etiqueta se alinea con la misma frase (`report_generator.py`, solo texto).

### 4.2 Vista de abordaje

- `freePlane.ts` gana `planeFromNormal(n: Vec3): FreePlane`, inversa de `normalOf`: `azimuth = atan2(nx, ny)`, `elevation = acos(nz)`; si la elevación cae fuera de `ELEVATION_RANGE` se usa `−n` (es el mismo plano) y se acota. `offsetMm = 0`. Prueba: `normalOf(planeFromNormal(n)) ≈ ±n` para una rejilla de direcciones.
- `CameraController` (MeshView) gana `lookAlong(dir: Vec3, focal: Vec3, radiusMm: number)`: coloca la cámara en `focal − dir × d` mirando a `focal`, con `d` el que deja un radio `radiusMm` en pantalla (misma cuenta que `frame`), y `viewUp` = el «superior» del paciente (`standardViewInVolume("axial").direction` invertido) proyectado perpendicular a `dir`; si `|dir · superior| > 0,95` se usa «anterior». Reajusta el rango de recorte y las luces, y renderiza.
- Botón **«ABORDAJE»** en el grupo «VISTA ▸» del 3D (`Viewer.tsx renderScene`), solo cuando `trajEntry && trajTarget`: `dir = norm(target − entry)`; llama a `camera.lookAlong(dir, target, lesionFrameRadiusMm(diam))` (el radio de «Centrar en la lesión») y, a la vez, `setFocusMm(target, meta)` y `setFreePlane(planeFromNormal(dir))`, de modo que el Oblicuo —si está visible— enseña la sección perpendicular al corredor en la diana, y VOLUMEN en RECORTE LIBRE recorta por ese mismo plano. Título: «Mirar a lo largo del corredor; el plano Oblicuo se pone perpendicular a él».
- El cine del Oblicuo (plano libre, paso = espaciado mínimo) recorre entonces el corredor en profundidad sin ningún cambio.

## 5. Cámaras completas (`Viewer.tsx`, `vtk/MeshView.tsx`, `vtk/geometry.ts`)

- `CameraController.setView(view)` decide la cara: si la dirección de proyección actual de la cámara coincide con la de `view` (`dot > 0,99`), aplica la vista opuesta (`axial → axial_inf`, `coronal → coronal_post`, `sagital → sagital_izq`); si no, la pedida. `oppositeView(view)` en `geometry.ts` con prueba. La regla se basa en la cámara y no en el último botón pulsado: funciona también después de rotar a mano y volver.
- Títulos: «Vista axial (desde superior; otro clic, desde inferior)», «Vista coronal (desde anterior; otro clic, desde posterior)», «Vista sagital (desde la izquierda; otro clic, desde la derecha)». Las etiquetas AX · COR · SAG no cambian.
- El maniquí de orientación ya sigue a la cámara; nada que hacer.

## 6. MIP local del cuello (`MipView.tsx`, `vtk/orbit.ts`, `vtk/localBox.ts`, `store/planning.tsx`)

- Store: `mipLocal: boolean`, `setMipLocal`; `false` al cambiar de volumen.
- Centro y tamaño: `localBox(lesion: Vec3, diameterMm: number): Bounds6` en `vtk/localBox.ts`, un cubo centrado en la lesión (cuello medido o candidato elegido, lo mismo que «Centrar en la lesión») de medio lado `lesionFrameRadiusMm(diameterMm)` (2,5 × Ø, entre 6 y 15 mm), acotado a los límites del volumen. Prueba pura.
- Planos de recorte (`vtkVolumeMapper` de vtk.js admite **6**, `vClipPlaneNormals[6]`): en RECORTE EJE la caja aporta sus seis planos y **el eje de recorte se funde con ella**: en ACUMULADO el plano del corte sustituye a la cara de la caja del mismo lado (`min(cara, corte)` o `max`, según `reverse`); en LÁMINA los dos planos de la lámina sustituyen a las dos caras de ese eje. Total: siempre 6. En RECORTE LIBRE la caja no cabe (6 + 1 ó 2): el botón «LOCAL» se deshabilita con título «Solo con RECORTE EJE».
- `ClipState` gana `box?: Bounds6`; `visibleBounds`/`visiblePoints` intersecan con ella para que «ENCUADRAR» y el centro de rotación encuadren lo visible de verdad. Prueba en `orbit.test.ts`.
- Botón **«LOCAL ●/○»** junto a «RECORTE ▸» en la fila de controles de VOLUMEN (`hud-toggle`, se oculta en esencial y limpio como el resto), visible solo cuando hay lesión. Al encenderlo se llama a «ENCUADRAR». Lectura compacta y ampliada: la línea del corte lleva el sufijo ` · LOCAL` cuando está activo (`mipReadoutLines` recibe `local?: boolean`).
- Vale igual en MIP y en COMPUESTO: los planos van al mapper, no al modo.

## 7. Recorrido por la línea central (`backend/routers/centerline.py`, `backend/models/centerline.py`, `api/client.ts`, `api/types.ts`, `store/planning.tsx`, `components/vessels/DiameterChart.tsx`, `CenterlinePanel.tsx`, `Viewer.tsx`, `ObliqueView.tsx`)

### 7.1 Los puntos llegan al cliente

- Endpoint nuevo privado `GET /api/centerline/{session_id}/points` → `CenterlinePoints { points: Position3D[], radii_mm: number[], arc_mm: number[] }` leído de `centerline_points.npz` (misma lectura tolerante que `get_centerline`; 404 si no hay línea central). `arc_mm` es la longitud acumulada (`[0, …, arc_length_mm]`). Redondeo a 0,01 mm. Contrato regenerado (`openapi.json`, `schema.gen.ts`, `contract.check.ts`); prueba de router con un `npz` sintético.
- Store: `centerline: { points: Vec3[]; radiiMm: number[]; arcMm: number[] } | null`, `setCenterline`. Se carga en `CenterlinePanel` tras extraer (y al reanudar, cuando `GET /api/centerline` responde) y se vacía en «Descartar» y en los mismos puntos que `centerlineMesh` (nuevo volumen, resegmentación).
- `vtk/centerlineWalk.ts` (puro): `tangentAt(points, i)` (diferencias centradas, extremos hacia dentro), `indexAtArc(arcMm, mm)` (búsqueda binaria), `nearestIndex(points, p)`.

### 7.2 La gráfica lleva al sitio

- `DiameterChart` recibe `onPick?(arcMm: number)` y `cursorArcMm?: number | null`. Clic o arrastre sobre el área del trazado llama a `onPick` con la posición en mm (inversa de `sx`); una línea vertical fina marca `cursorArcMm`. `role="img"` pasa a un `<svg>` con `tabIndex` y ← → que mueven un paso de muestra, para que sea accesible con teclado.
- `CenterlinePanel`: `onPick(mm)` → `i = indexAtArc(arcMm, mm)`; `setFocusMm(points[i], meta)` y `setFreePlane(planeFromNormal(tangentAt(points, i)))`. El punto compartido viaja a esa sección y el Oblicuo queda perpendicular al vaso allí. `cursorArcMm` = `arcMm[nearestIndex(points, focoMm)]` cuando el foco está a ≤ 2 mm de la línea; si no, `null`.

### 7.3 Cine por el vaso

- `CineTarget` gana `{ kind: "vessel" }`. En el Oblicuo (`pane === "scene"`, `viewMode === "oblique"`), cuando `centerline` existe y el modo de recorrido es «VASO», el cine recorre los puntos: `cinePosition = { index: nearestIndex(points, foco), count: points.length }`; cada paso hace `setMprVoxel(mmToVoxel(points[i]))` y `setFreePlane(planeFromNormal(tangentAt(points, i)))`. Las teclas ↑/↓, Re Pág/Av Pág, Inicio/Fin y la barra del cine funcionan sin cambios porque pasan por `cineMove`/`cinePosition`.
- Control: grupo «RECORRIDO ▸ PLANO · VASO» en la fila de controles del Oblicuo (`hud-controls`), visible solo con línea central. Store `obliqueWalk: "plano" | "vaso"`, que vuelve a «plano» al vaciarse `centerline`. Lectura del Oblicuo en «VASO»: `VASO 37/120 · Ø 3,1 mm` (índice 1-based y diámetro `2 × radiiMm[i]` con coma) en lugar de `AZ · EL`.
- Los puntos de la línea central están en el marco del volumen (mm), igual que `focusPoint`, así que no hay conversión LPS.

## 8. Limpieza de duplicados (`MeshEditTools.tsx`, `store/planning.tsx`, `components/patientAge.ts`, `PhasesCalculator.tsx`, `ElapssCalculator.tsx`, `UiatsCalculator.tsx`, `TreatmentPanel.tsx`, `MorphometryPanel.tsx`, `DevicesPanel.tsx`, `CenterOnLesionButton.tsx`)

- **Una caja.** El recorte por ROI pierde «Caja»: queda «Esfera» con su radio (`cropShape` y `setCropShape` salen del store; `runCrop` envía `mode: "sphere"`; `MeshView.cropPreview.shape` sigue admitiendo ambas por si el servidor las devuelve, pero el cliente solo manda esfera). El texto de la tarjeta dice que para recortar por caja está la «Caja de recorte» de abajo. Se borra la prueba del botón «Caja» y se añade la del texto.
- **La edad, una vez.** `components/patientAge.ts` exporta `ageFromDob(dob?: string | null): string` (la versión de `UiatsCalculator`, que resta un año si no ha llegado el cumpleaños); `TreatmentPanel`, `ElapssCalculator` y `UiatsCalculator` la importan y borran sus copias. `PhasesCalculator` parte de `ageFromDob(patient?.dob)` en lugar de `"60"`; sin fecha de nacimiento el campo queda vacío y «Calcular» se deshabilita hasta que haya edad (como UIATS). Sigue siendo editable en los cuatro sitios: es un dato de entrada, no una preferencia; lo que se quita es el valor inventado y el código repetido.
- **«Centrar en la lesión» en un sitio y una tecla.** `CenterOnLesionButton` desaparece de Morfometría y Dispositivos (y el componente se borra); queda «VISTA ▸ LESIÓN» en el 3D, y se añade el atajo **L** (`center-lesion`, ámbito visor) para alcanzarlo con el panel plegado o el HUD en esencial/limpio. Hoja de atajos y README actualizados.

## 9. Inventario en el README (`README.md`)

Sección nueva «Herramientas del visor y de los paneles», después de «Atajos de teclado»: una tabla por zona (banda de cabecera, celda 3D, cortes, Oblicuo, VOLUMEN, panel de cada paso) con tres columnas: herramienta, qué hace y cuándo usarla. Incluye las piezas nuevas de E4 (VASOS/TODO, ABORDAJE, LOCAL, RECORRIDO, gráfica clicable, segundo clic de cámara). Sin historia ni justificación: eso ya está en las secciones de cada subproyecto.

## 10. Atajos, HUD y capturas

- Atajo nuevo: **L** → «Centrar en la lesión» (si hay lesión). Sin cambios en el resto; `RESERVED_KEYS` sigue vacío. `shortcuts.test.ts` y `ShortcutsSheet` lo recogen.
- Todo control nuevo lleva `hud-toggle` o `hud-controls` y por tanto desaparece en esencial y limpio; las lecturas nuevas (` · LOCAL`, `VASO n/N · Ø`) van en `hud-readout` y se ocultan solo en limpio.
- Capturas y grabaciones: `readHud` lee las lecturas tal cual; la caja LOCAL y la vista de abordaje son estado de la cámara y de los planos, que la captura ya refleja. No hay campos nuevos en `ComposeInput`.
- Estado guardado: nada de E4 se persiste en el servidor salvo lo que ya existía (trayectoria, línea central). `mipWindow`, `mipLocal`, `obliqueWalk` y `centerline` viven en el store y se reconstruyen al reanudar (la línea central se vuelve a pedir).

## 11. Fuera de alcance

- **Comparación lado a lado de dos estudios.** El store es de una sesión; `PaneId` no sabe de una segunda. Existe la superposición de seguimiento del colaborador (`FollowupOverlay`). Subproyecto propio.
- **CPR enderezado como imagen.** Necesita un reslice curvo en el servidor (`services/mpr.py` es la plantilla); §7 cubre el uso clínico —inspeccionar el vaso sección a sección— con el Oblicuo perpendicular al vaso.
- Preajustes de ventana adicionales para XA («Alto contraste» y similares): dos bastan hasta que alguien pida el tercero.
- Local en RECORTE LIBRE (límite de seis planos). Si hiciera falta, la alternativa es recortar la imagen (`vtkImageCropFilter`) en vez de usar planos; queda anotado.
- Puntos de la línea central en el informe o en CSV.

## 12. Pruebas

Vitest + Testing Library en `frontend/`; pytest en `backend/` (un archivo por proceso).

- `windowPresets.test.ts`: «Vasos» presente en XA con banda finita antes y después de segmentar; ausente sin banda.
- `useVesselBand.test.ts`: caché por sesión, `lo` desde `threshold_lower` cuando existe, `null` en error.
- `volumePresets.test.ts`: `volumePresetsFor` por modalidad; `defaultVolumeWindow` de «Vasos» = banda; alias de curvas idénticos a los originales.
- `MipView` (pruebas puras en `mipReadout.test.ts` y una suite `MipView.ventana.test.tsx` con el mapper falso): rampa idéntica con `mipWindow === null`; arrastre derecho en MIP cambia `mipWindow`; RESTABLECER la anula; lectura `UMBRAL · NIV · VENT` vs `NIV · VENT`; sufijo ` · LOCAL`.
- `freePlane.test.ts`: `planeFromNormal` ida y vuelta.
- `geometry.test.ts`: `oppositeView`. `MeshView`/`Viewer`: segundo clic en AX da `axial_inf` (prueba con `CameraController` falso que expone la dirección).
- `localBox.test.ts`, `orbit.test.ts` (`box` en `visibleBounds`), y una prueba de que en EJE siempre se añaden exactamente 6 planos con LOCAL.
- `centerlineWalk.test.ts`: tangentes, `indexAtArc`, `nearestIndex`.
- `DiameterChart.test.tsx`: clic llama a `onPick` con el mm correcto; cursor dibujado; teclado.
- `Viewer`/`ObliqueView`: `cineTarget` «vessel» mueve foco y plano; «RECORRIDO» solo con línea central; vuelve a «plano» al descartar.
- `MeshEditTools.test.tsx`: sin botón «Caja»; `runCrop` manda `sphere`.
- `patientAge.test.ts`; `PhasesCalculator.test.tsx` (vacío sin fecha, deshabilitado).
- `shortcuts.test.ts` (L), `copy.test.ts` (VASOS, TODO, ABORDAJE, LOCAL, RECORRIDO, PLANO, VASO).
- Backend: `test_centerline_points.py` (npz sintético → puntos, radios, arco; 404 sin línea), `test_openapi_contract.py` regenerado.
- Lista manual en el navegador (Case 3, XA): «Vasos» en el menú de los cortes tras segmentar; VOLUMEN arranca en VASOS; botón derecho en MIP; ABORDAJE con trayectoria marcada mira por el corredor y el Oblicuo queda perpendicular; AX dos veces; LOCAL recorta al cuello y ENCUADRAR lo encuadra; clic en la gráfica mueve el punto; cine VASO en el Oblicuo; PHASES con la edad del paciente; L centra.
