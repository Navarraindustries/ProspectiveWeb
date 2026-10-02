# Clips en 3D (D3): manipulador del clip con mapa de calor en vivo, arrastre de planos y regla de la hoja — diseño

Fecha: 2026-10-02. Ámbito: `frontend/` (React 19 + vtk.js) y un cambio pequeño de regla en `backend/services/clip_selection.py`. Tercer subproyecto de la serie D (D1 coherencia del visor → D2 volumen unificado → D3 clips en 3D → D4 calidad de la detección). Parte de master cb1ec8c.

## 1. Propósito

Hoy el clip se coloca tecleando X, Y, Z y una rotación en `DevicesPanel`; la normal no se puede cambiar y nada se arrastra en el 3D. El mapa de calor del subproyecto C dice si la colocación cubre el cuello, pero ajustar la pose a ojo es lento. Además, en cuellos pequeños como el de Case 3 (1,1–1,4 mm) toda hoja del catálogo (mínimo 7 mm) supera tres veces el cuello y la regla «Longitud de hoja» descarta todos los clips, así que no hay ninguno con el que trabajar.

Decisiones del propietario (2026-10-02): lo que importa es colocar y ajustar el clip a mano en el 3D con el mapa de calor en vivo; la calidad de la detección va a D4 y «Usar como lesión» sale de D3; el orden es D3 antes que D4.

Resultado buscado:

1. Arrastrar el clip sobre el cuello en el 3D: desplazar, girar alrededor de la normal e inclinar la normal; el clip se mueve al instante y el mapa de calor y el veredicto se recalculan solos.
2. Arrastrar los planos de corte y el plano libre desde el 3D.
3. Que en cuellos pequeños el catálogo dé clips «Con reservas» en lugar de «Descartado».

## 2. Estado: los clips colocados pasan al store

- `store/planning.tsx` gana `placedClips: PlacedClip[]`, `setPlacedClips`, `selectedClipKey: string | null`, `setSelectedClipKey`, con

```ts
export interface ClipPose { position: Vec3; normal: Vec3; rotation_deg: number }   // mm, marco del paciente (el de las mallas), normal unitaria
export interface PlacedClip extends ClipPose { key: string; clip_id: string; name: string }
```

- `DevicesPanel` deja su `placed` local y lee/escribe `placedClips`; sus campos numéricos (X, Y, Z, Rot°) siguen igual y ganan dos campos de inclinación «Azimut°» y «Elevación°» de la normal respecto al eje principal del cuello (la normal se deriva de ellos con la misma regla que `freePlane.normalOf`, pero en el marco local del cuello: `n = R_cuello · [sin e·sin a, sin e·cos a, cos e]`, con `R_cuello` la rotación que lleva +z al eje principal). Con 0/0 la normal es la de hoy.
- El plan en servidor (`POST /api/clips/plan`), el debounce de 250 ms, la serialización `placing/pendingPlace`, `fieldSeq` y `clearSeq` no cambian: solo cambia de dónde sale la lista. Se reinician con la sesión como `clipField`.

## 3. Movimiento inmediato en el cliente (`vtk/clipPose.ts`)

- Módulo puro con `poseMatrix(pose): number[16]` que reproduce `services/devices.pose_transform`: traslación a `position`, rotación que lleva +z local a `normal` (giro de 180° alrededor de x si son antiparalelas, como VTK), después giro `rotation_deg` alrededor de z local. `poseDelta(from, to) = poseMatrix(to) · poseMatrix(from)⁻¹`.
- `MeshLayer` gana `userMatrix?: number[16]`. La capa `clips` (malla cocida por el servidor en la pose `from` = la última planificada) recibe `poseDelta(from, actual)` mientras la pose del store difiere de la planificada; cuando llega el plan nuevo, `from` pasa a ser la pose nueva y la matriz vuelve a la identidad. El mismo delta se aplica a `clip-body`, `clip-blade-a` y `clip-blade-b` durante el ensayo si está visible.
- El mapa de calor (`clip-field`) se atenúa a opacidad 0,35 mientras la pose del store difiere de la planificada («DESFASADO» en la tarjeta del mapa), y vuelve a 1 cuando llega el campo nuevo. Así el profesional ve el clip moverse en el acto y sabe que el color va unos cientos de milisegundos por detrás.

## 4. Asas del clip en el 3D

- Un «manipulador» por el clip elegido (`selectedClipKey`; por defecto el último colocado; clic sobre el cuerpo de un clip lo elige). Solo cuando la escena 3D de malla está montada y hay clips.
- Tres asas en la capa superior (la del punto de D1: siempre visibles, no afectan al encuadre, `setUseBounds(false)`), con radio en mm derivado de `markerRadiusMm` (≈ 0,9 mm):
  - **Desplazar**: esfera color HUD (`#8CFF9E`) en `position`. Arrastrar la mueve en el plano del cuello (el plano perpendicular a la normal que pasa por `position`); con **Shift**, a lo largo de la normal.
  - **Girar**: anillo ámbar (`--hud-amber`) de radio 3 mm en el plano del cuello, centrado en `position`. Arrastrar cambia `rotation_deg` según el ángulo del puntero alrededor del centro proyectado.
  - **Inclinar**: esfera lavanda (`--plane-libre`) en `position + normal · 6 mm`, unida al centro por una línea. Arrastrar la mueve sobre la esfera de radio 6 mm (intersección rayo–esfera) y la normal se recalcula; se acota a 60° respecto al eje principal del cuello.
- Lectura de esquina del 3D mientras hay manipulador: «CLIP <nombre> · X Y Z mm · ROT n° · AZ n° · EL n°».
- **Escape** durante un arrastre devuelve la pose de antes de empezar. **Doble clic** en el asa de desplazar vuelve a la colocación automática (`neckPlacement`).

## 5. Controlador de arrastre (`vtk/dragController.ts` + `MeshView`)

- Puro y probado: `screenToPlane(camera, viewport, px, plane{origin, normal}) → Vec3 | null` (rayo desde la cámara, perspectiva u ortográfica, intersección con el plano), `screenToAxis(camera, viewport, px, axis{origin, dir}) → t` (punto del eje más cercano al rayo), `screenToSphere(camera, viewport, px, sphere{center, r}) → Vec3 | null` (intersección rayo–esfera, la más cercana), `angleAround(camera, viewport, px, center, normal) → rad`.
- En `MeshView`: una prop `handles?: Handle[]` con `{ id, kind: "sphere" | "ring" | "square", pos, normal?, radiusMm, color }` dibujados en la capa superior, y `onHandleDrag?: (id, phase: "start" | "move" | "end" | "cancel", px: [number, number], modifiers) => void`. En `pointerdown` con botón izquierdo se hace un pick con `vtkCellPicker` **sobre el renderer superior** (los actores de las asas sí son seleccionables; el resto de la capa no); si hay asa, se desactiva el interactor de cámara (`interactor.setEnabled(false)` o el estilo), se captura el puntero y se emiten `move` con `pointermove`, `end` con `pointerup`/pérdida de captura, `cancel` con Escape; al terminar se reactiva la cámara. Sin asa bajo el puntero todo sigue como hoy (cámara, picking de clic).
- `Viewer` traduce cada `move` a una pose con las funciones puras (el plano del cuello para desplazar, el eje de la normal con Shift, el ángulo para girar, la esfera para inclinar) y escribe `setPlacedClips`; el debounce de `DevicesPanel` hace el resto.

## 6. Arrastrar los planos

- Cada contorno de plano (`PlaneOutline`) gana un asa cuadrada (`kind: "square"`, 1,2 mm, color del plano) en el centro del polígono; se dibuja con las asas del clip en la capa superior y solo cuando los contornos se ven (reglas de D1/D2: PLANOS ●, REGLAS ●, y el plano libre solo en Oblicuo o LIBRE).
- Arrastrar el asa mueve el plano a lo largo de su normal: para un plano de índice, `screenToAxis` sobre el eje del plano → índice redondeado (`mprVoxel.x|y|z`, acotado a `0..n−1`); para el plano libre, `offsetMm` (acotado con `clampOffsetToBox`). La superficie del plano sigue sin ser seleccionable para no robarle el arrastre a la cámara.

## 7. Regla de la hoja (`backend/services/clip_selection.py`)

- La rama «sobredimensionada» (`hoja / cuello > BLADE_MAX_RATIO`) pasa de FAIL a WARN con etiqueta «Hoja larga para el cuello» y nota que indica el cociente. El FAIL se mantiene cuando la hoja es más corta que el cuello aplastado (`bl < req.mm`). `COVERAGE_COMFORTABLE_HI` y el WARN existente no cambian.
- Efecto: en cuellos < 2,3 mm el catálogo NAVARRO da «Con reservas» en vez de «Descartado» y el profesional puede manipular un clip real. Documentado en el README como regla provisional, igual que la banda de fuerza.

## 8. Capturas

`estadoVisor` añade `placed_clips` (lista de poses con `key`, `clip_id`) y `selected_clip`. Nada más cambia.

## 9. Pruebas

- `clipPose.test.ts`: `poseMatrix` coincide con casos calculados a mano (normal +z y rotación 0 = traslación; normal −z = giro 180° alrededor de x; normal +x; rotación 90°), `poseDelta(p, p)` = identidad, `poseDelta` compone bien.
- `dragController.test.ts`: con una cámara ortográfica y otra en perspectiva conocidas, `screenToPlane`, `screenToAxis`, `screenToSphere` (sin intersección → `null`) y `angleAround` devuelven los valores esperados; cambio de signo al cruzar el centro.
- `store/planning.test.tsx`: `placedClips`/`selectedClipKey` por defecto, setters y reinicio con la sesión.
- `DevicesPanel`: los campos de azimut/elevación derivan la normal como `freePlane.normalOf` en el marco del cuello (función pura `neckFrameNormal` probada).
- Backend `test_clip_selection*.py`: la hoja larga da WARN y no FAIL; la hoja corta sigue dando FAIL.
- Navegador (Case 3): colocar un clip, arrastrarlo por el cuello y ver el ghost moverse al instante y el mapa de calor y el veredicto actualizarse tras soltar; girar con el anillo; inclinar con la esfera lavanda; Shift desplaza por la normal; Escape; doble clic recoloca; arrastrar las asas de los planos mueve los cortes y el plano libre; la cámara sigue rotando fuera de las asas; captura con `placed_clips`.

## 10. Fuera de alcance

«Usar como lesión» y la calidad de la detección (D4); abrir/cerrar la mordida desde el manipulador (lo hace la animación de ensayo); manipular varios clips a la vez; simulación mecánica real; cambios en la banda de fuerza; arrastrar la superficie de los planos.
