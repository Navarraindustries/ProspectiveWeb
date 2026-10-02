# Volumen unificado (D2): plano libre compartido, corte en la cara y ventana por preajuste — diseño

Fecha: 2026-10-02. Ámbito: `frontend/` (React 19 + vtk.js) y una retirada pequeña en `backend/`. Segundo subproyecto de la serie D (D1 coherencia del visor → D2 volumen unificado → D3 clips en 3D). Parte del estado dejado por D1 (fusionado en master 88911c7): vista «VOLUMEN» con modos MIP · COMPUESTO, planos de índice coloreados en todas las vistas, banda de cabecera en `vtk/ViewerHeader.tsx`.

## 1. Propósito

Después de D1 el volumen ya es una vista con la que se trabaja, pero le faltan tres cosas que el profesional pide:

1. Ajustar lo que se ve en COMPUESTO: hoy cada preajuste de tejido es fijo; hace falta nivel y ventana como en los cortes.
2. Recortar el volumen por un plano cualquiera, no solo por los tres ejes, y ver el corte en gris sobre la cara recortada.
3. Que el oblicuo deje de ser una vista aislada: su plano debe ser el mismo que recorta el volumen y debe verse en el 3D y en los cortes, como los planos de índice.

Decisiones del propietario (2026-10-02): ventana y nivel (sin opacidad ni editor de curva); el oblicuo se ve «dentro del volumen» como corte con la imagen pintada en la cara, con un único plano compartido; el plano se orienta con dos ángulos más posición. Sin histograma (no cambia ninguna decisión clínica).

## 2. El plano libre (`vtk/freePlane.ts`, estado en el store)

Estado nuevo en `store/planning.tsx`:

```ts
export interface FreePlane { azimuthDeg: number; elevationDeg: number; offsetMm: number }
export const DEFAULT_FREE_PLANE: FreePlane = { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 };
freePlane: FreePlane; setFreePlane(p: FreePlane): void;   // misma vida que mipMode/mprVoxel (el proveedor se crea por sesión)
```

Geometría, en el marco de índices (vóxel × espaciado, origen 0, el mismo que usan cortes, MIP y rectángulos de D1), en `vtk/freePlane.ts` (puro, probado):

- `normalOf({azimuthDeg, elevationDeg})`, con `a` y `e` en radianes:
  - `n = [ sin(e)·sin(a), sin(e)·cos(a), cos(e) ]` → con `e = 0`, `n = [0,0,1]` (el plano axial de índices que pasa por el punto); la elevación `e` inclina la normal desde `+z` y el azimut `a` elige hacia qué lado (`a = 0` inclina hacia `+y`, `a = 90°` hacia `+x`).
  - `upOf(angles)`: vector «arriba» determinista para el reslice: el `−y` del corte axial girado `e` alrededor del eje `k = (−cos a, sin a, 0)`, el mismo giro que lleva `+z` a `n`. En forma cerrada, `up = [sin(a)·cos(a)·(1 − cos e), −cos e − sin²(a)·(1 − cos e), cos(a)·sin(e)]`; ya es unitario y ortogonal a `n`. Con elevación 0 coincide con el «arriba» del oblicuo actual (−y, la orientación del corte axial) y con azimut 0 con el del oblicuo «EJE X» anterior, `(0, −cos e, sin e)`. Gira menos de 1° por cada 0,5° de azimut en todo el rango, también cerca del coronal (la proyección de `−y` sobre el plano giraba decenas de grados allí). Así el oblicuo no gira solo al mover los ángulos.
  - `rightOf = normalize(up × n)`.
- `originOf(plane, mprVoxel, meta) = voxelToMm(mprVoxel, meta) + n · offsetMm`.
- `clipPolygon(plane, mprVoxel, meta): Vec3[]`: intersección del plano con la caja del volumen `[0, (n−1)·s]` en cada eje: entre 3 y 6 vértices ordenados en sentido antihorario visto desde `n`; `[]` si el plano no corta la caja. Se usa para el polígono en el 3D, la traza en VOLUMEN y el encuadre del oblicuo (sustituye a `sliceExtent` de `ObliqueView`).
- `sliceSegment(plane, mprVoxel, meta, slicePlane, index): [Vec2, Vec2] | null`: segmento de intersección del plano libre con un corte de índice (`axial|coronal|sagital` en `index`), en fracciones `u,v` del corte (mismas convenciones que `planeCfg`), o `null` si son paralelos o no se cortan dentro del corte.

Rangos: azimut −180..180, elevación −89..89 (el «arriba» no degenera en ese rango; el límite solo mantiene legible la orientación del corte), `offsetMm` libre pero acotado a la caja al usarlo. Se reinicia con la sesión como el resto del estado del visor.

## 3. Vista Oblicuo (`vtk/ObliqueView.tsx`)

- Deja de tener estado propio de plano: lee `freePlane` y `mprVoxel` del store y escribe con `setFreePlane`. El `vtkPlane` del `vtkImageResliceMapper` se construye con `normalOf`/`originOf`; la cámara con `upOf` y `rightOf`.
- Controles (fila inferior, misma estética que hoy): dos deslizadores «AZIMUT» (−180..180, paso 1) y «ELEVACIÓN» (−89..89, paso 1) con su cifra; **arrastrar con el botón derecho** cambia azimut (horizontal, 0,5°/px) y elevación (vertical, 0,5°/px); **rueda** = `offsetMm ± spacing mínimo` por paso; **CENTRAR** = `offsetMm = 0`; **AJUSTAR** encuadra el polígono de `clipPolygon`; **arrastrar con el botón izquierdo** sigue siendo ventana/nivel (`mprWl`, compartida con los cortes); Ctrl+rueda zoom. Desaparecen el deslizador de inclinación y el conmutador EJE X / EJE Y.
- Lectura de esquina: «AZ 20° · EL −10° · +3,2 mm».
- Sin WebGL2, `ObliqueMprView` (oblicuo de servidor con inclinación + eje) sigue como hoy, sin plano compartido: modo degradado documentado en el README. No se toca `/slice-oblique`.

## 4. VOLUMEN: recorte libre y corte en la cara (`vtk/MipView.tsx`)

- Conmutador nuevo «RECORTE ▸ EJE · LIBRE» junto a AX·COR·SAG (en LIBRE el grupo AX·COR·SAG se atenúa; sigue decidiendo la cámara estándar de CENTRAR). Estado `clipMode: "eje" | "libre"` en el store (por defecto `"eje"`).
- **EJE**: todo como en D1.
- **LIBRE**: el recorte usa `freePlane`: en ACUMULADO un `vtkPlane` con origen `originOf` y normal `−n` (o `+n` con DESDE EL FINAL); en LÁMINA dos planos a `±mipSlabMm` a lo largo de `n`. La **rueda** mueve `offsetMm` (paso = espaciado mínimo) en lugar del índice del corte; CENTRAR vuelve a `offsetMm = 0` y recoloca la cámara. Vale en MIP y en COMPUESTO.
- **Corte en la cara**: en LIBRE se añade al mismo renderer un `vtkImageSlice` con `vtkImageResliceMapper.setSlicePlane` en el plano libre (`setSlabThickness` 0, interpolación lineal), ventana/nivel = `mprWl` (como los cortes), `setPickable(false)`, `setUseBounds(false)`. Como la geometría opaca se dibuja antes que el volumen, el corte se ve donde el tejido recortado es transparente y los vasos por delante lo tapan: es la cara del corte. Interruptor «CARA ●/○» (store `cutFaceVisible`, por defecto ●). En LÁMINA la cara se coloca en el plano central.
- La traza del plano (ámbar en D1 pasó a color de plano) en LIBRE usa `clipPolygon` proyectado (en LÁMINA, los dos polígonos a ±slab), con el color del plano libre (§6). La regla de canto (`EDGE_ON_DEG`) se mantiene.
- Rendimiento: un actor de reslice más no cambia el coste del volumen; se mide igual que en D1 (objetivo ≥ 20 fps en la celda principal con Case 3 en COMPUESTO + LIBRE + CARA).

## 5. Ventana y nivel por preajuste (`vtk/volumePresets.ts`, `MipView.tsx`)

- Hoy `presetToRange(preset, [lo, hi])` lleva los puntos 0–255 a `intensity_range`. Pasa a `presetToWindow(preset, { wc, ww })`: `x ↦ (wc − ww/2) + x/255 · ww`; `ww` se acota a ≥ 1. `defaultWindow(meta)` = centro y anchura de `intensity_range` (es decir, el comportamiento de D1 es el valor por defecto).
- Store: `volumeWindows: Partial<Record<VolumePreset, { wc: number; ww: number }>>` (vacío = por defecto), `setVolumeWindow(preset, w | null)`. Se reinicia con la sesión. Cada preajuste recuerda su ventana mientras dure la sesión.
- Gestos en VOLUMEN (solo COMPUESTO): **arrastrar con el botón derecho** cambia nivel (vertical) y ventana (horizontal) con la misma sensibilidad que `SliceView`; el arrastre izquierdo sigue rotando. Botón «RESTABLECER» en la fila de preajustes vuelve al valor por defecto del preajuste activo. Lectura en la esquina bajo «COMPUESTO · <PREAJUSTE>»: «NIV 2200 · VENT 1800» (cifras enteras).
- En MIP no cambia nada (su transferencia sigue dependiendo del umbral de segmentación).

## 6. Coherencia con D1: el plano libre en todas las vistas

- Color propio en `planeColors.ts`: `PLANE_HEX.libre = "#c77dff"` (lavanda; no choca con los reservados ni con los tres planos). `Plane` sigue siendo el tipo de los cortes; se añade `type OutlinePlane = Plane | "libre"` para los contornos.
- **3D** (`MeshView` prop `planes`): `PlaneOutline.corners` pasa de 4 a `Vec3[]` (≥ 3) y las líneas/relleno se construyen con N vértices; `planeOutlines` devuelve el polígono libre como cuarto elemento cuando procede.
- **Cortes** (`SliceView`): un SVG superpuesto (como la traza del MIP) dibuja el segmento de `sliceSegment` con el color lavanda, grosor 1, opacidad 0,85. Las tres líneas de referencia de índice no cambian.
- **VOLUMEN**: la traza del recorte en LIBRE (§4).
- **Cuándo se ve**: solo si la escena está en Oblicuo o VOLUMEN está en recorte LIBRE (`showFreePlane = viewMode === "oblique" || clipMode === "libre"`), para no ensuciar el caso normal; PLANOS ○ y REGLAS ○ lo ocultan como a los demás.

## 7. Retirar `GET /volume/{sid}/raw`

- Backend: se eliminan `get_volume_raw` (`routers/mpr.py`) y `get_volume_raw_uint8` (`services/mpr.py`), conservando cualquier helper que `volume_coarse_int16` comparta; se eliminan sus tres tests en `test_mpr_advanced.py` (import, servicio, endpoint 200/404). El resto de `test_mpr_advanced.py` sigue.
- Frontend: se elimina `volumeRawUrl` de `api/client.ts`.
- README: desaparece la nota «sin consumidor» y se describe el estado final.

## 8. Capturas

`estadoVisor` añade `free_plane: { azimuth_deg, elevation_deg, offset_mm }`, `clip_mode`, `cut_face_visible` y `volume_window: { wc, ww } | null` (la del preajuste activo). La captura de VOLUMEN y del oblicuo no cambia de mecanismo.

## 9. Pruebas

- `freePlane.test.ts`: `normalOf` (0/0 → +z; elevación 90 acotada; azimut gira alrededor de z), `upOf` ortogonal y estable, `clipPolygon` (plano axial → 4 vértices = rectángulo de D1; plano diagonal por el centro → 6 vértices; plano fuera de la caja → `[]`; orden antihorario), `sliceSegment` (paralelo → `null`; corte axial con plano inclinado → segmento dentro de `[0,1]²`).
- `volumePresets.test.ts`: `presetToWindow` con la ventana por defecto reproduce `presetToRange` de D1 punto a punto; `ww` acotada; `defaultWindow(meta)`.
- `store/planning.test.tsx`: valores por defecto y setters de `freePlane`, `clipMode`, `cutFaceVisible`, `volumeWindows`.
- `planeOutlines.test.ts`: cuarto contorno solo cuando `showFreePlane`; N vértices.
- `ObliqueView`: test de controles sobre un stub (deslizadores escriben al store; rueda mueve `offsetMm`; CENTRAR lo pone a 0) si el patrón del repo lo permite; si no, navegador.
- Backend: `test_mpr_advanced.py` sin las tres pruebas del raw y en verde.
- Navegador (Case 3): mover el plano en Oblicuo y verlo moverse en VOLUMEN (LIBRE), en el 3D y como segmento en los cortes; rueda en VOLUMEN LIBRE mueve el mismo plano; CARA ○/●; ventana por preajuste con el botón derecho y RESTABLECER; fps en COMPUESTO + LIBRE + CARA; captura con los campos nuevos.

## 10. Fuera de alcance

Mover el plano arrastrándolo en el 3D (D3, con el manipulador del clip); oblicuo de servidor con el plano compartido; histograma; opacidad global por preajuste; cambios en la captura compuesta más allá de los campos; otras rutas del backend.
