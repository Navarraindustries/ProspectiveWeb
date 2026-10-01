# Coherencia del visor (D1): vista principal explícita, planos coloreados y el volumen como vista — diseño

Fecha: 2026-10-01. Ámbito: `frontend/` (React 19 + vtk.js). Sin cambios de backend. Primer subproyecto de la serie D (D1 coherencia del visor → D2 volumen unificado → D3 clips en 3D), acordada con el propietario el 2026-10-01.

## 1. Propósito

Tres cosas desorientan al profesional en el visor de hoy:

1. No hay una forma explícita de elegir qué vista es la principal: solo el doble clic sobre una celda o arrastrarla, y nada lo anuncia.
2. Los cortes y el 3D no se relacionan visualmente: el 3D no dibuja dónde están los planos de corte, y las líneas de referencia de los cortes son todas ámbar, así que no se sabe qué línea es qué plano ni dónde cae el punto compartido.
3. «Volumen» es un modo que sustituye al 3D de malla dentro de la misma celda, con sus propios datos (un volumen reducido del servidor) y sin relación con los cortes ni con el punto compartido.

Resultado buscado:

- Elegir la vista principal en un gesto visible y repetible, y maximizar cualquier celda con un clic.
- Cada plano de corte tiene un color fijo que se repite en todas partes: el rótulo del corte, sus líneas de referencia en los otros cortes, su rectángulo en el 3D y en el MIP, y el punto compartido se ve en el 3D.
- El volumen deja de ser un modo del 3D: la vista «MIP» pasa a llamarse «VOLUMEN» y ofrece dos modos, **MIP** (el actual) y **COMPUESTO** (el render de color por preajustes), ambos sobre el volumen completo que ya está en el navegador y con los mismos gestos y recorte ligados al punto compartido. En D1 se hace el cambio de vista y el modo COMPUESTO mínimo (preajustes y gestos); la ventana ajustable, el recorte libre y el resto del volumen son D2.

## 2. Vista principal explícita

- Un selector `HudToggleGroup` en la cabecera del visor, a la izquierda, antes de los presets: «PRINCIPAL ▸ 3D · AX · COR · SAG · VOL». Cambiarlo llama a `promote(layout, id)`: la vista elegida sube a principal y la principal baja a su hueco (misma semántica que el doble clic).
- Cada celda secundaria lleva en su esquina superior derecha un botón de maximizar «⤢» (24 px, `title="Hacer principal"`), fuera del asa de arrastre, que también llama a `promote`. En la principal el botón no aparece.
- El doble clic y el arrastre se conservan. Los atajos Alt+1/2/3 siguen eligiendo el preset.
- El modo de selección sobre el 3D (marcar cuello, clip, tijera) sigue forzando el 3D a principal, como hoy; el selector refleja ese estado.
- `PaneId` no cambia: `"scene" | "axial" | "coronal" | "sagital" | "mip"`. El id `"mip"` se conserva en el modelo (migración y claves guardadas intactas); solo cambian el rótulo («VOLUMEN») y el contenido de la vista (sección 4).

## 3. Planos coloreados y punto compartido

**Colores fijos por plano**, definidos una sola vez en `vtk/planeColors.ts` y usados por todos:

| Plano | Color | Variable |
|---|---|---|
| Axial | cian `#4cc9f0` | `--plane-axial` |
| Coronal | verde `#80ed99` | `--plane-coronal` |
| Sagital | naranja `#f4a261` | `--plane-sagital` |

Se eligen para no chocar con los colores con significado ya en uso: ámbar (`--hud-amber`, avisos y traza del MIP), magenta (cuello residual), gris (no alcanzado), verde del saco cerrado y rojo del clip. El verde coronal es más claro y frío que el del saco; si en navegador se confunden, el saco manda y el coronal pasa a `#a7f3d0`.

**Dónde se aplica:**

- `SliceView`: el rótulo del plano (`HudFrame label`) y la marca de esquina llevan el color de su plano; las dos líneas de referencia dejan el ámbar y toman el color del plano que representan (la vertical y la horizontal se corresponden ya con sagital/coronal, coronal/axial, etc. según `planeCfg`). La retícula del punto conserva su color actual.
- `MipView` (futura VOLUMEN): la traza del plano de acumulación toma el color de su plano, en lugar del ámbar.
- `MeshView` recibe una prop nueva `planes?: PlaneOutline[]` con `{ plane, corners: [Vec3 ×4], color }`; dibuja cada plano como un rectángulo de líneas (`vtkPolyData` de 4 segmentos, `lineWidth 1`, opacidad 0,85, sin iluminación, no seleccionable) y un relleno translúcido opcional al 6 % para que se lea como superficie. `Viewer` construye los tres rectángulos a partir de `mprVoxel` y `meta` (extensión del volumen en el plano, como hace `planeTrace.planeCorners`), y los pasa cuando la escena es la malla 3D. Se recalculan al mover cualquier corte.
- Punto compartido en 3D: un marcador esférico pequeño (radio 0,6 mm, color `--hud`) en `focusPoint`/`mprVoxel`, encima de todo, que ya existe como `MeshMarker`; se enseña siempre que haya volumen cargado.
- Interruptor «PLANOS ●/○» en la cabecera (junto a REGLAS), por defecto encendido, recordado en el navegador (`viewer.planesHidden`), y REGLAS ○ también los oculta.

**Fuera de D1**: arrastrar un rectángulo en el 3D para mover ese corte (va a D3 con el manipulador del clip), y el plano oblicuo dibujado en 3D (D2).

## 4. El volumen como vista: «VOLUMEN» con modos MIP y COMPUESTO

- La celda `"mip"` se rotula «VOLUMEN». Su HUD gana un `HudToggleGroup` «MIP · COMPUESTO» (arriba a la izquierda, junto a AX·COR·SAG). MIP es el comportamiento actual, sin cambios.
- COMPUESTO reutiliza el mismo `vtkVolumeMapper` y el mismo `vtkImageData` del navegador (el volumen completo, no el reducido del servidor), cambiando el modo de mezcla a composición y aplicando los seis preajustes de `VolumeView` (CTA, Vasos CTA, Cerebro, Hemorragia, Hueso, Tejido blando) traducidos del rango 0–255 al rango real de intensidades (`meta.intensity_range`, p1–p99) para que signifiquen lo mismo. Los preajustes se eligen con un `HudToggleGroup` en la fila inferior. El recorte (acumulado/lámina, eje, rueda = corte, Ctrl+rueda zoom, arrastrar rota, Shift desplaza, CENTRAR) es el mismo que en MIP: el volumen compuesto también «se construye» con el corte.
- La traza del plano de acumulación se dibuja igual en los dos modos.
- El modo «Volumen» de la escena 3D se retira: el conmutador de la escena pasa a «3D · Oblicuo» (el oblicuo se queda donde está hasta D2). `VolumeView.tsx` y `GET /volume/{sid}/raw` quedan sin uso en el frontend: el componente se borra; el endpoint se deja y se marca en el README como sin consumidor (lo quita D2 o se reutiliza).
- Rendimiento: el volumen completo de Case 3 (384³) ya se renderiza en MIP a la frecuencia de pantalla; COMPUESTO con sombreado cuesta más. Si en navegador baja de 20 fps en la celda principal, COMPUESTO usa `setSampleDistance` ×1,5 y sombreado apagado en el preajuste por defecto; se mide y se anota.
- Fuera de D1 (→ D2): ventana ajustable por preajuste, recorte libre con plano orientable, oblicuo dentro del volumen, histograma.

## 5. Capturas

La captura compuesta y la grabación no cambian de mecanismo: la celda «VOLUMEN» se captura como hoy la MIP (registro por `registerCapture`); el estado del visor (`estadoVisor`) añade `volume_mode: "mip" | "compuesto"` y el preajuste, y `planes_hidden`.

## 6. Pruebas

- `planeColors.test.ts`: tres planos, tres colores distintos, ninguno igual a los colores reservados (ámbar, magenta, gris, saco, clip).
- `layout.test.ts` no cambia (el modelo no cambia); `ViewerGrid.test.tsx` añade: el botón «⤢» de una celda secundaria promueve y no existe en la principal; `Viewer`: el selector PRINCIPAL refleja `layout.main` y cambia la distribución (test de Testing Library con el store).
- `planeOutlines.test.ts` (puro): las esquinas de los tres rectángulos para un `mprVoxel` y una `meta` dadas; se mueven con el índice; la del plano del punto pasa por el punto.
- `SliceView`: las líneas de referencia llevan el color del plano correspondiente (test de estilo por `data-plane` en los `div`).
- MIP/VOLUMEN: `volumePresets.test.ts` traduce los puntos de los preajustes de 0–255 al rango real; el conmutador MIP/COMPUESTO cambia el modo de mezcla (test del módulo puro que calcula las funciones de transferencia; lo visual, en navegador).
- Navegador (Case 3): PRINCIPAL cambia la vista grande; «⤢» en cada celda; los tres rectángulos en el 3D se mueven con la rueda en los cortes y coinciden con las trazas del MIP y con las líneas de referencia; PLANOS ○ los quita; VOLUMEN en COMPUESTO con el preajuste «Vasos CTA» enseña el árbol a color y la rueda lo construye; fps anotados; captura compuesta con la celda VOLUMEN.

## 7. Fuera de alcance

D2 (ventana ajustable, recorte libre, oblicuo en volumen, retirar `/volume/raw`), D3 (manipulador 3D del clip, mover cortes arrastrando sus rectángulos, flujo «Usar como lesión»), cambios de backend, distribuciones con nombre.
