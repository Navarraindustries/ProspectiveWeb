# Navegación y orientación (E1): centro de giro, 2×2, Cortes 3D, reproductor y atajos — diseño

Fecha: 2026-10-02. Ámbito: `frontend/` (React 19 + vtk.js). Sin cambios de backend. Primer subproyecto de la serie E (E1 navegación y orientación → E2 anotaciones persistentes → E3 pantalla limpia y controles → E4 herramientas clínicas), acordada con el propietario el 2026-10-02 a partir de su revisión de usabilidad. Parte de master 672e3b4.

## 1. Propósito

Hallazgos medidos en navegador (Case 3, celda VOLUMEN de 530×632 px):

- **Descentrado.** El manipulador de rotación de `MipView` nunca recibe un centro de giro; vtk.js usa (0,0,0), que es una esquina del volumen (origen 0). Tras un giro de 90° el centro del volumen queda a 124 mm del foco y fuera de la celda; tras otro, a 175 mm. Pasar cortes no mueve la cámara. CENTRAR arregla la vista pero el siguiente giro vuelve a desviar. Igual en MIP y COMPUESTO, EJE y LIBRE. El 3D de malla usa el estilo por defecto de vtk y orbita el foco, así que no desvía.
- **Tres planos.** Ninguna vista muestra axial, coronal y sagital a la vez con su cruce; el 3D solo dibuja los rectángulos de D1 sobre la malla.
- **Recorrer cortes.** Solo rueda, flechas e Inicio/Fin con la celda enfocada; la escalera lateral es solo decorativa; no hay cine.
- **Atajos.** Esc, «?», dígitos 1–8 (pasos) y Alt+1/2/3 (presets); nada para sincronía, centrar o reproducir; no hay hoja de atajos.

Decisiones del propietario (2026-10-02): las dos vistas de tres planos (preset 2×2 y modo «Cortes 3D»); reproductor con teclas y cine por celda con espacio; H y P reservadas para E3.

## 2. Centro de giro y recentrado en VOLUMEN (`vtk/orbit.ts`, `MipView.tsx`, `MeshView.tsx`)

- `MipView`: el manipulador `TrackballRotate` recibe `setCenterOfRotation(voxelToMm(mprVoxel, meta))` en cada cambio de `mprVoxel` (y al montar). Girar mantiene el punto compartido fijo en pantalla.
- CENTRAR (`fit`) pasa a encuadrar la **caja visible**: `visibleBounds(bounds, clip)` devuelve la caja recortada según el modo (`eje` + acumulado: desde el inicio hasta `posMm`, o desde `posMm` hasta el final con DESDE EL FINAL; `eje` + lámina: `posMm ± slab`; `libre`: la caja de la mitad conservada del plano, aproximada por los extremos del `clipPolygon` y el lado conservado); el foco se pone en el punto compartido y `resetCamera(visibleBounds)`; el centro de giro se reafirma. En LIBRE sigue devolviendo `offsetMm` a 0 como en D2.
- `MeshView`: «Centrar en la lesión» y `focus(p)` fijan además el centro de giro del estilo (si el estilo por defecto lo expone; si no, se mantiene el orbitaje sobre el foco, que ya es el comportamiento correcto) para que ambas vistas se comporten igual.
- Puro y probado: `visibleBounds`, `rotationCenterMm(mprVoxel, meta)`.

## 3. Preset de distribución 2×2 (`vtk/layout.ts`, `layoutGrid.ts`, `ViewerHeader.tsx`)

- `LayoutPreset` gana `"cuatro"`: rejilla 2×2 con celdas iguales, orden de lectura `main` arriba-izquierda, luego `side[0..2]` (arriba-derecha, abajo-izquierda, abajo-derecha); `side[3]` queda oculta (como en «sola» quedan ocultas las secundarias). Por defecto, al entrar en «cuatro» desde otro preset: AX, COR, SAG, 3D, con VOLUMEN como la oculta; `promote` y «⤢» intercambian como hoy, así «▸ VOL» o «⤢» en VOLUMEN la traen al cuadrante.
- Atajo `Alt+4`. Rótulo «CUATRO» en la cabecera (abreviado «4» bajo 800 px). `mainFraction` no aplica (sin separador) y se conserva para volver a otro preset.
- `loadLayout` acepta el preset nuevo; los valores guardados siguen válidos; ningún cambio de versión de clave.

## 4. Modo «Cortes 3D» de la escena (`Viewer.tsx`, `MeshView.tsx`)

- El conmutador de la escena pasa a «3D · Cortes 3D · Oblicuo» (`viewMode: "default" | "slices3d" | "oblique"`).
- En `slices3d`, `MeshView` recibe `slicePlanes: { plane: Plane; index: number }[]` (los tres) y dibuja cada uno como `vtkImageSlice` + `vtkImageResliceMapper` fijo al plano de índice (eje y posición en mm, como la cara del corte de D2), con ventana `mprWl`, interpolación lineal, no seleccionables, `setUseBounds(false)`; se cruzan en el punto compartido; el punto sigue en la capa superior de D1; los contornos de color de D1 bordean cada imagen; las asas cuadradas de D3 permiten arrastrar cada plano.
- La malla se muestra al 35 % de opacidad con interruptor «MALLA ●/○» (store `slices3dMeshVisible`, por defecto ●); el saco, el clip y el mapa de calor siguen sus reglas actuales.
- Rendimiento: tres reslices sobre el volumen que ya está en memoria; objetivo ≥ 30 fps en Case 3 en la celda principal; si baja de 20, se reduce la resolución del reslice (`setSlabThickness` 0 y `setOutputDimensionality` 2 ya son el mínimo; la alternativa es muestrear a la mitad con `vtkImageReslice` previo).
- Captura: `estadoVisor.scene_mode`; la celda se captura como hoy el 3D.

## 5. Reproductor de cortes (`vtk/cine.ts`, `hud/HudLadder.tsx`, `SliceView.tsx`, `MipView.tsx`, `ObliqueView.tsx`)

- **Escalera** arrastrable y clicable: clic → ese índice; arrastre vertical → índice proporcional (la escalera ya mapea índice↔px en `ladder.ts`); `data-plane` conservado. Visible solo si REGLAS ● como hoy.
- **Teclas** con la celda enfocada: flechas ±1 (existente), Re Pág/Av Pág ±10, Inicio/Fin (existente), **espacio** reproduce/para; `+`/`−` velocidad del cine. En VOLUMEN las teclas mueven el índice del eje activo (o `offsetMm` en LIBRE, paso = espaciado); en Oblicuo, `offsetMm`.
- **Cine**: store `cine: { pane: PaneId; fps: number; bounce: true } | null`; un `requestAnimationFrame`/`setInterval` en `Viewer` avanza `mprVoxel` (o el offset) a `fps` (defecto 8, rango 1–30, pref `viewer.cineFps`), ida y vuelta al llegar al extremo; se para con espacio, Escape, al arrastrar en esa celda, al cambiar de celda enfocada o de paso. Barra mínima en la esquina inferior de la celda: «◀ ▶ ⏸ 152/384 · 8 fps», botones clicables; en celdas compactas solo «▶/⏸ i/n».
- Puro y probado: `nextIndex(i, dir, n, bounce)`, `clampFps`, `stepFromKey(key)`.

## 6. Atajos y hoja de atajos (`vtk/shortcuts.ts`, `Workspace.tsx`, `ViewerHeader.tsx`)

- Tabla única `SHORTCUTS: { keys: string; action: string; scope: "visor" | "celda" | "flujo" }[]` que alimenta los manejadores y la hoja. Nuevos: **S** SINCRO; **C** CENTRAR de la celda enfocada (3D: AJUSTAR); **Alt+4** preset CUATRO; espacio/Re Pág/Av Pág/+/− del reproductor. Reservadas (E3): H, P. Se respetan los existentes (Esc, «?», 1–8, Alt+1/2/3) y nunca actúan con el foco en un campo de texto.
- «?» abre una tarjeta «Atajos» (hoja modal ligera, cierra con Esc o «?») generada desde `SHORTCUTS`, agrupada por ámbito; sustituye a la pista efímera actual.
- Test: la tabla no tiene teclas duplicadas en el mismo ámbito ni choca con las de los pasos.

## 7. Capturas

`estadoVisor` añade `scene_mode`, `slices3d_mesh_visible`, `cine` (celda y fps o `null`); el preset `cuatro` entra por `layout`. La captura compuesta recorre las cuatro celdas del 2×2 con su geometría real como hace con los demás presets.

## 8. Pruebas

- `orbit.test.ts`: `visibleBounds` en acumulado (ambos sentidos), lámina y libre; `rotationCenterMm`.
- `layout.test.ts`: preset `cuatro` (orden, oculta, `promote`, `loadLayout`), `layoutGrid` plantilla 2×2, `layoutShortcuts` Alt+4.
- `cine.test.ts`: `nextIndex` con rebote en ambos extremos, `clampFps`, `stepFromKey`.
- `shortcuts.test.ts`: sin duplicados por ámbito; H y P ausentes; «?» presente.
- `HudLadder.test.tsx`: clic y arrastre emiten el índice correcto.
- `ViewerHeader.test.tsx`: CUATRO y Alt+4.
- Navegador (Case 3): girar 90° dos veces y pasar 20 cortes en VOLUMEN sin que el punto salga del encuadre; CENTRAR encuadra lo visible en acumulado, lámina y libre; preset CUATRO y «▸ VOL»; Cortes 3D con malla al 35 %, arrastre de planos y fps anotados; cine con espacio en corte, VOLUMEN y oblicuo, parada por Escape y por arrastre; hoja de atajos.

## 9. Fuera de alcance

Anotaciones (E2); HUD de tres niveles y panel plegable (E3); herramientas clínicas nuevas (E4); cine global sincronizado; cambios de backend; renombrar los grupos AX·COR·SAG (E3).
