# Visor clínico, segmentación tubular y mapa de calor del clip — diseño

Fecha: 2026-09-25 · Estado: borrador para revisión

## 1. Propósito

Que un profesional de salud se siente delante de PROSPECTIVE Web y el visor de
estudios se comporte como una estación radiológica: cortes que siguen a la
rueda, cuatro paneles sincronizados (tres planos y un MIP/3D), orientación
siempre visible, una malla vascular que parece lo que es —tubos— y, al colocar
un clip, una lectura en color de si ese clip abraza el cuello con la fuerza y
el tamaño que ese aneurisma pide.

Se divide en tres subproyectos que se implementan en este orden, cada uno con
su propio plan de implementación:

| # | Subproyecto | Qué entrega |
|---|---|---|
| A | Visor 2D/3D en el cliente | Scroll fluido, distribución 1+3+MIP, MIP progresivo, maniquí, sincronizar al punto |
| B | Segmentación tubular y render pulido | Malla estanca, sin hueso pegado, vasos macizos, render limpio |
| C | Mapa de calor del clip | Escalar por vértice en cuello y saco + veredicto de idoneidad del clip |

El orden importa: B produce la malla sobre la que C pinta, y A da el visor
donde B y C se ven.

## 2. Contexto medido (Case 3, 3DRA XA 384³, vóxel 0,32 mm)

| Hecho | Medida |
|---|---|
| Corte PNG en servidor | 8 ms |
| Retraso de la interfaz al hacer scroll | 90 ms de debounce + una `<img>` por corte; 15 ticks → 1 imagen |
| Segmentación media resolución (actual) | ~5 s, 12 776 vértices, 4 314 mm³, 67 aristas de borde |
| Segmentación resolución completa sin techo | 16,6 s (16 núcleos), 123 964 vértices, 11 090 mm³, base de cráneo en bloque |
| Detección | pierde los canales de calibre por encima de 40 000 vértices |
| Orientación del paciente en el DICOM | ausente (Enhanced XA sin `ImageOrientationPatient`) |
| Lesión confirmada (según captura `frontend/Estudios/aneurisma.png`) | pequeña dilatación en la horquilla de una bifurcación del tronco grueso; corresponde al candidato actual **cand-002** (x 62 · y 64 · z 63 mm). **Pendiente de confirmar por el usuario.** |

Restricciones de despliegue (dichas por el usuario): front en AWS Amplify,
back en una instancia Lightsail de 12 USD (1 vCPU, 2 GB RAM), uso por internet.
Las dos consecuencias que gobiernan el diseño:

- El navegador tiene más CPU/GPU que el servidor: todo lo interactivo
  (cortes, ventana/nivel, MIP, oblicuo) va al cliente.
- El servidor no puede tener varias copias float32 de un 384³ (226 MB cada
  una) en memoria: la segmentación trabaja por regiones y por bloques, con
  guardas de memoria explícitas, y en 1 vCPU tardará varias veces lo medido
  aquí, así que hay progreso real y no una barra indeterminada.

## 3. Subproyecto A — Visor 2D/3D en el cliente

### 3.1 Volumen en el navegador

Nuevo endpoint `GET /api/volume/{sid}/chunk/{level}/{z0}-{z1}` que devuelve un
bloque de cortes del volumen como `int16` crudo (little-endian) con gzip
(`GZipMiddleware`, umbral 1 KB). Dos niveles:

- `level=coarse`: el volumen ya existente de 192³ `uint8` (7 MB), que se pide
  entero al abrir el estudio. Con él ya se puede navegar en menos de 2 s.
- `level=full`: el volumen nativo en `int16`, en lonchas de 32 cortes en z
  (para 384³: 12 bloques de ~9,4 MB). El cliente los pide en orden de
  proximidad al corte actual y los va sustituyendo en su textura.

Para volúmenes de más de 150 M vóxeles el nivel `full` se sirve submuestreado
2× en el plano (lo dice la cabecera `X-Level-Stride`) y el cliente marca los
cortes como «resolución reducida»; no se ofrece corte del servidor a
resolución nativa en esta fase.

El cliente guarda los bloques en la Cache API con clave `sid + mtime del .npy`
para que recargar la página o reanudar no vuelva a descargar.

Meta ampliada (`GET /api/volume/{sid}/meta`): añade `direction` (cosenos de
dirección 3×3 en LPS, o `null`), `orientation_known: bool`, `origin_mm`,
y `intensity_range` robusto (p0.5–p99.9) para inicializar ventana/nivel y las
transferencias del MIP.

`dicom_loader` pasa a conservar la matriz de dirección (SimpleITK ya la lee)
y a escribirla en `_volume_meta.json`. Sin etiquetas, `direction = null`.

### 3.2 Render de cortes con vtk.js

`MprView` deja de ser una `<img>` y pasa a un `vtkImageSlice` + `vtkImageMapper`
sobre un `vtkImageData` compartido (un solo `vtkImageData` por sesión, tres
mappers apuntando a él). Ventana/nivel es una propiedad del `vtkImageProperty`
(instantáneo). El corte se cambia con `mapper.setSlice`. Arrastrar con botón
izquierdo sigue siendo ventana/nivel; botón central o `Shift`+arrastre
desplaza; rueda cambia de corte; `Ctrl`+rueda hace zoom; flechas ↑/↓ cambian
de corte; `Inicio`/`Fin` saltan a los extremos.

Cada panel de corte lleva etiquetas de orientación en los cuatro bordes
(A/P/I/D/S/I) derivadas de `direction` o, si es asumida, entre corchetes
`[A]` y en gris. Barra de escala de 10 mm abajo a la derecha. Líneas de
referencia: en cada plano se dibuja dónde cortan los otros dos (colores fijos:
axial azul, coronal verde, sagital rojo), con el crosshair actual.

El oblicuo se resuelve con `vtkImageResliceMapper` sobre el mismo
`vtkImageData`, con los mismos controles de inclinación y posición; deja de
pedir PNGs al servidor. `render_oblique_png` se conserva para el informe.

El tinte de la banda de umbral (vista previa de segmentación) se implementa
como una segunda capa `vtkImageSlice` con una función de transferencia que
solo es opaca dentro de [inferior, superior]; se actualiza sin red.

### 3.3 Distribución 1+3 y cuarto panel

Se mantiene la distribución actual (panel principal + franja de tres) y se
añade un **cuarto panel** en la franja: MIP. La franja pasa a tener cuatro
celdas del mismo ancho. Cualquier celda se puede **maximizar** con doble clic
(ocupa el panel principal y lo que había en el principal baja a la franja);
doble clic de nuevo restaura. La preferencia se guarda en `localStorage`.

El panel principal muestra por defecto lo que hoy (3D con malla o axial sin
malla). El selector «3D · Volumen · Oblicuo» de la esquina se conserva y
cambia solo el panel principal.

### 3.4 MIP progresivo

El cuarto panel es un `vtkVolume` con `vtkVolumeMapper` en modo
`MAXIMUM_INTENSITY_BLEND` sobre el mismo `vtkImageData`. Dos modos, con un
control en el propio panel:

- **Acumulado** (por defecto): el mapper lleva un plano de recorte en el eje
  del panel principal activo (por defecto z) situado en el corte actual; al
  avanzar cortes el volumen aparece; al retroceder desaparece. Un botón
  invierte el sentido (acumular desde el final).
- **Lámina**: dos planos de recorte a ±N mm del corte actual (N ajustable,
  por defecto 10 mm).

Función de transferencia «Vasos»: rampa de opacidad que empieza en el umbral
inferior de la banda de segmentación (el mismo estado `previewBand` o, si ya
hay malla, `seg.threshold_lower`), no en HU fijos. Presets existentes
(CTA, Cerebro…) quedan solo cuando `modality` es CT.

La cámara del MIP sigue la orientación del plano principal (axial → desde
superior, etc.) salvo que el usuario la rote; «Ajustar» la devuelve.

### 3.5 Maniquí de orientación

`vtkOrientationMarkerWidget` en la esquina inferior derecha del panel 3D y del
MIP. Actor compuesto: `vtkAnnotatedCubeActor` con caras A/P/D/I/S/I más una
figura humana de baja resolución (cabeza y torso, ~600 triángulos, en
`frontend/public/models/maniqui.vtp`) alineada con el cubo y con la cara
marcada. Gira con la cámara del panel en que vive.

Cuando `orientation_known = false` el maniquí se dibuja en gris con el rótulo
«orientación asumida» y aparece un control «Fijar orientación» en el visor:
el usuario elige, para el volumen tal como se ve en el axial, qué borde es
anterior y si el primer corte es superior o inferior. Se guarda en el estado
de sesión (`dicom.orientation_manual`) y a partir de ahí todos los paneles,
etiquetas y el maniquí lo usan. Con TC la dirección viene del DICOM y el
control no aparece.

### 3.6 Sincronizar todas las vistas al punto

Interruptor «Sincronizar al punto» (icono de cadena) en la barra del visor,
activado por defecto. El estado compartido es un único punto en mm de mundo
(`focusPoint`) en el store, del que se derivan el vóxel del crosshair
(`mm / spacing`, porque las mallas están en vóxel·spacing con origen 0) y el
punto focal de las cámaras 3D y MIP. Fuentes que lo mueven cuando está activo:

- clic en cualquier corte (ya existe como crosshair),
- cualquier pick 3D (cuello, ápice, medida, centro de recorte…),
- seleccionar un candidato en Detección (su `center_mm`),
- entrar en Morfometría o Dispositivos con un saco medido (su `neck_origin`),
- el botón «Centrar en la lesión» que se añade a esos dos paneles.

Efecto: los tres planos saltan al vóxel; la cámara 3D y el MIP mueven su
punto focal al punto **sin cambiar la distancia ni la orientación** (no hay
zoom automático, que desorienta), salvo «Centrar en la lesión», que además
encuadra a 30 mm.

Con el interruptor apagado el crosshair sigue enlazando solo los tres planos,
como ahora.

### 3.7 Errores y degradación

- Si el bloque `full` falla o tarda, el visor sigue con `coarse` y lo dice en
  el rótulo del panel («resolución reducida · cargando 4/12»).
- Sin WebGL2 el visor cae al modo actual (PNG del servidor) con un aviso.
- La descarga se cancela al cambiar de sesión (AbortController).

### 3.8 Pruebas

- Unitarias (vitest): conversión mm↔vóxel con y sin flip de z; derivación de
  etiquetas de orientación desde `direction` y desde la orientación manual;
  orden de petición de bloques por proximidad; estado `focusPoint` → índices
  de los tres planos.
- Backend (pytest): `chunk` devuelve el tamaño exacto y los bytes correctos
  de un volumen sintético; `stride` para volúmenes grandes; `direction` en
  meta para un CT sintético con IOP y `null` sin él.
- Manual con Case 3: 30 ticks de rueda en 1 s deben producir ≥ 25 fotogramas
  distintos (se mide con el mismo script de la revisión); MIP acumulado
  coherente con el índice; maniquí gira con la cámara.

## 4. Subproyecto B — Segmentación tubular y render pulido

### 4.1 Diagnóstico

Hoy la máscara es `banda ∩ volumen` y marching cubes va sobre un binario a
media resolución. Tres defectos con causa clara:

1. **Vasos huecos** («se ven vacíos»): el techo de la banda descarta el núcleo
   más brillante del vaso lleno de contraste, y queda una cáscara abierta.
2. **Hueso pegado** (peñasco, base de cráneo): comparte intensidad con el
   contraste; ni umbral ni «árbol principal» lo separan cuando toca al árbol.
3. **Superficie abollada y con huecos**: binario submuestreado 2× + suavizado
   corto; 67 aristas de borde; triángulos alargados.

### 4.2 Pipeline nuevo (`services/segmentation.py`, `services/vesselness.py`)

Entrada: volumen nativo (z,y,x) float32 memmap, `spacing`, banda
[inferior, superior], nivel de limpieza, nivel de suavizado.

1. **Región de interés.** Máscara gruesa `vol ≥ inferior` submuestreada 4×;
   caja envolvente dilatada 5 mm. Todo lo demás se recorta antes de cualquier
   filtro. En Case 3 la ROI es ~55 % del volumen.
2. **Relleno del núcleo.** Máscara `M0 = vol ≥ inferior` (sin techo). El techo
   deja de ser un filtro de vaso: si el usuario lo mantiene, se aplica solo
   como `vol ≤ superior` **después** del relleno de huecos 3D
   (`scipy.ndimage.binary_fill_holes`), de modo que un vaso cuyo centro supera
   el techo sigue macizo. Resultado: tubos llenos.
3. **Vesselness.** `sitk.ObjectnessMeasureImageFilter` (Frangi, objeto
   tubular, α 0,5 · β 0,5 · γ derivado del p95 de la norma del Hessiano) en
   escalas σ = {0,3; 0,6; 1,0; 1,6; 2,5} mm, calculado **por bloques en z de
   48 cortes con 8 de solape** sobre la ROI, en float32, guardando solo el
   máximo por vóxel (uint8 normalizado). Coste de memoria acotado a ~6 copias
   del bloque, no del volumen.
4. **Máscara de vaso.** `Mv = M0 ∧ (V ≥ tV)` donde `tV` es el percentil 60 de
   V dentro de `M0` (adaptativo, no una constante). Esto quita láminas y
   bloques: el Hessiano de una lámina tiene una sola dirección de alta
   curvatura y Frangi la penaliza.
5. **Histéresis por conectividad.** Semillas = componentes de
   `M0 ∧ (V ≥ p90 de V en M0)` de más de 50 mm³ (los troncos gruesos). La
   máscara final es lo conectado a una semilla dentro de `Mv ∨ (M0 ∧ V ≥ p40)`
   (crecimiento con umbral más permisivo desde un núcleo estricto). El
   usuario puede añadir una semilla pinchando (reutiliza el pick 3D existente)
   cuando una rama queda fuera; la interfaz lo dice en el mismo aviso de
   «volumen conservado» que ya existe.
6. **Cierre suave.** `binary_closing` de 1 vóxel y `binary_fill_holes` final.
7. **Superficie.** Se suaviza la máscara con gaussiana σ = 0,7 vóxel a float y
   marching cubes a iso 0,5 (superficie sub-vóxel, sin escalones). Luego
   `vtkWindowedSincPolyDataFilter` 40 iteraciones · pass band 0,05 ·
   `BoundarySmoothingOff` · `NormalizeCoordinatesOn`; `vtkFillHolesFilter`
   (hasta 4 mm); `vtkQuadricDecimation` al 60 % conservando normales;
   `vtkPolyDataNormals` con splitting off y ángulo 60°; eliminación de
   componentes < 2 mm³ (ya existe). Criterio de aceptación: 0 aristas de
   borde y relación de aspecto mediana < 1,45.
8. **Dos mallas.** `vessel_tree.vtp` (completa, para medir) y
   `vessel_tree_display.vtp` (decimada a ≤ 40 000 vértices, para visor y
   detección). La detección consume la de visualización, de modo que los
   canales de calibre vuelven a ejecutarse; la morfometría y el corte de
   cuello usan la completa. Todas las herramientas que hoy leen
   `vessel_tree.vtp` para dibujar (recorte, borrador, previa) escriben en las
   dos.
9. **Resolución completa por defecto.** La casilla se invierte: «Segmentar a
   media resolución (más rápido)» apagada por defecto. Guardas: si la ROI
   supera 90 M vóxeles se fuerza media resolución y se dice por qué.

La **vista previa** mientras se mueven los deslizadores no cambia de
algoritmo (sigue siendo umbral + top-N a ds 5/2): es para ver dónde cae la
banda, y ahora lo dice el chip.

### 4.3 Progreso

Se implementa el WebSocket `/ws/progress/{sid}` que la documentación ya
anuncia y no existe: la segmentación publica fases («ROI», «vesselness 3/8»,
«superficie», «decimación») con porcentaje. El panel muestra fase y
porcentaje. Sin WebSocket (proxy que no lo pasa) se cae a `GET
/api/progress/{sid}` cada segundo.

### 4.4 Render en vtk.js

- Material del árbol: ambient 0,15 · diffuse 0,85 · specular 0,25 · specular
  power 24 · interpolación Phong; dos luces (key al 100 % y fill al 35 % desde
  el lado opuesto) que siguen la cámara.
- Translucidez con `renderer.setUseDepthPeeling(true)` (4 pasadas), de modo
  que el árbol al 45 % no muestre artefactos de orden.
- Saco y dispositivos con `setBackfaceCulling(false)` y borde de silueta
  opcional (`vtkOutlineFilter` no; se usa un segundo actor en representación
  wireframe con opacidad 0,15 solo sobre el saco, para leer su contorno).
- Fondo negro se mantiene; se añade un degradado sutil solo en el panel 3D
  (opción en preferencias, apagada por defecto).

### 4.5 Validación en Case 3

Métricas que el plan debe registrar antes y después, sobre la misma banda:

| Métrica | Actual | Objetivo |
|---|---|---|
| Aristas de borde | 67 | 0 |
| Volumen de hueso conservado (piezas > 3 mm de espesor eq.) | bloques del peñasco | 0 piezas |
| Relación de aspecto mediana | 1,62 | < 1,45 |
| La lesión (cand-002 según la captura) aparece en la lista corta | sí (puesto 2) | sí, puesto ≤ 3 |
| Tiempo en el equipo de desarrollo | 5 s / 17 s | < 40 s |

Si en 1 vCPU el paso de vesselness supera 3 min sobre Case 3, se reduce el
número de escalas a 3 y se documenta.

### 4.6 Pruebas

- pytest con fantomas sintéticos: tubo de 2 mm con núcleo por encima del
  techo → malla estanca y volumen ± 10 % del analítico; tubo + lámina de
  0,3 mm en contacto → la lámina no sobrevive; dos tubos separados → solo
  el que tiene semilla; guardas de memoria (ROI grande → media resolución).
- `test_detector_case3.py` se amplía con la malla de visualización nueva y
  la posición confirmada de la lesión.

## 5. Subproyecto C — Mapa de calor del clip

### 5.1 Qué representa

Un escalar por vértice sobre el saco cerrado (`aneurysm_sac.vtp`) más un
anillo de vaso de 1,5 × cuello alrededor del plano, para cada colocación de
clip. Tres lecturas, una por canal, y una escala de color con leyenda:

1. **Cobertura** (categórico): vértice del contorno de cuello dentro del
   espacio entre hojas → cubierto (verde); fuera del alcance de la hoja →
   cuello residual (magenta); saco más allá de la punta de la hoja → no
   alcanzado (gris rayado).
2. **Presión estimada** (continuo): `p = F_cierre / A_contacto`, con
   `F_cierre` la fuerza nominal del catálogo (o la banda: se usa el mínimo,
   que es el caso desfavorable) y `A_contacto` el área de los triángulos del
   anillo de cuello que quedan entre las dos hojas proyectadas. Se compara
   con la ventana `force_window(neck_mm)` de `clip_selection` convertida a
   presión con la misma área: por debajo de `acceptable_lo` azul
   («insuficiente»), dentro de la óptima verde, entre óptima y aceptable
   ámbar, por encima de `acceptable_hi` rojo («exceso»). El color se aplica a
   la zona cubierta; fuera de ella manda el canal 1.
3. **Idoneidad del clip** (veredicto, no color): longitud de hoja frente a
   cuello + margen (reutiliza `clip_selection`), apertura de mordaza frente a
   espesor del cuello en el plano, fuerza frente a ventana. Se muestra en una
   tarjeta bajo el visor y en el panel de dispositivos, con el detalle
   numérico de cada criterio.

Se etiqueta siempre como **estimación geométrica**: fuerza de catálogo
repartida sobre área de contacto; no modela pared, deformación ni
deslizamiento. La simulación mecánica queda para la fase siguiente y este
diseño deja el escalar como una capa más (`ClipFieldLayer`) para que la
sustituya sin tocar el visor.

### 5.2 Backend

`POST /api/clips/field/{sid}` con las mismas colocaciones que `/clips/plan`
(se llama automáticamente después de colocar y al cambiar posición/giro con
debounce de 250 ms). Devuelve:

```json
{
  "field_mesh_url": ".../clip_field.vtp?v=…",
  "scalars": {"coverage": "uint8", "pressure_ratio": "float32"},
  "summary": {
    "covered_pct": 92.0, "residual_pct": 8.0, "unreached_pct": 0.0,
    "pressure_g_mm2": 14.3, "window_g_mm2": [10.1, 11.6, 17.4, 21.8],
    "verdict": "ok|warn|fail", "criteria": [ … como en clip_selection … ]
  }
}
```

`services/clip_field.py`: toma `aneurysm_sac.vtp`, el anillo de vaso (corte
esférico del árbol de radio 1,5 × cuello menos el saco), la geometría del
clip en mundo (`_clip_geometry_for` + `pose_transform`, ya existentes) y el
plano de cuello. Para cada vértice: distancia con signo a los dos planos de
hoja (las hojas se modelan como los dos paralelepípedos que ya construye
`make_clip_shaped`, con su trayectoria angulada o de bayoneta), proyección
sobre el eje de la hoja para saber si está dentro de su longitud, y a partir
de ahí los dos escalares. Se escribe un único `.vtp` con dos arrays de puntos.

Sin catálogo (como en la instalación revisada) la fuerza es la del clip a
fabricar (`manufacture.closing_force_g`) y el veredicto lo dice.

### 5.3 Frontend

`MeshView` admite capas con `scalarArray` y `colorMap` (`vtkColorTransferFunction`
por capa); `Viewer` añade la capa `ClipFieldLayer` cuando hay resultado y
dibuja la leyenda (barra de color con las cuatro marcas de la ventana y las
tres categorías). El interruptor «Mapa de calor» vive en la pestaña
«Colocar» y en la barra del visor; por defecto encendido al colocar.

El ensayo de colocación (`ClipRehearsal`) no cambia: el campo se calcula para
la pose final.

### 5.4 Pruebas

- pytest con un saco esférico sintético y un clip recto: cobertura 100 % con
  hoja ≥ cuello + 1 mm y `residual > 0` con hoja corta; presión ∝ 1/área;
  veredicto sigue a la ventana de fuerza.
- vitest: leyenda y colormap a partir de un `summary` fijo; la capa se
  retira al limpiar clips.
- Manual en Case 3 con el clip a fabricar: mover el clip 2 mm fuera del
  cuello debe pintar cuello residual; girarlo 90° debe cambiar la cobertura.

## 6. Cambios transversales

- `frontend/Estudios/` (109 MB de DICOM) entra en `.gitignore`; el estudio de
  prueba se documenta en el README con su ruta local.
- El texto «tarda minutos» de resolución completa se sustituye por el tiempo
  estimado a partir del tamaño del volumen y la última segmentación de la
  sesión.
- Los presets de ventana en HU se muestran solo con `modality = CT`; para XA
  se ofrecen «Auto», «Vasos» (banda) y «Todo» (p0.5–p99.9).
- El plano de cuello automático que falla («no se aísla un saco válido»)
  prueba automáticamente desplazamientos de ±1 y ±2 mm a lo largo del eje
  antes de rendirse, y dice cuál usó. Es un arreglo pequeño y entra en B.

## 6 bis. Estética: HUD de caza

Pedido por el usuario al aprobar el diseño: que el visor se lea como el
head-up display de un avión de combate. Alcance: el visor y todo lo que se
superpone a la imagen (paneles de corte, MIP, 3D, leyendas, avisos de marcado,
controles de cámara y de distribución). El resto de la aplicación (pacientes,
formularios, paneles laterales) conserva su sistema de diseño; solo hereda el
color de acento del visor para que los dos mundos no choquen.

Reglas, para que «HUD» signifique lo mismo en cada pantalla:

- **Un solo color de acento fosforescente**, `--hud: #8CFF9E` (verde HUD), con
  variante atenuada al 55 % para lo secundario; ámbar `#FFC857` para avisos
  y el rojo actual para fallos. Fondo negro puro. Contraste mínimo 4,5:1
  sobre negro. El color nunca es el único canal: cada aviso lleva texto.
- **Tipografía monoespaciada** (JetBrains Mono, ya en `assets/fonts`) para
  todo lo que es lectura de instrumento: índice de corte, W/L, medidas,
  coordenadas, porcentaje de carga. Rótulos en mayúsculas pequeñas con
  espaciado 0,08 em.
- **Trazo fino, sin rellenos.** Se retiran las píldoras redondeadas con fondo
  semitransparente. Los grupos de botones se dibujan como texto entre
  corchetes (`[ 3D ]  VOLUMEN  OBLICUO`), el activo en acento pleno y con
  subrayado de 1 px; el resto atenuado.
- **Marcas de esquina** en cada panel (cuatro ángulos de 12 px, 1 px de
  trazo) que se iluminan en el panel activo.
- **Retícula HUD** en lugar del crosshair actual: dos ejes de 1 px con hueco
  central de 14 px y marcas cada 10 mm (usa la escala real del corte), con el
  vóxel actual escrito junto al centro.
- **Escalera de cortes** en el borde derecho de cada panel de corte: cinta
  vertical con marcas y el índice actual en una ventana, como la escalera de
  altitud; se desplaza al hacer scroll. En el MIP la misma cinta marca hasta
  dónde se ha acumulado.
- **Cinta de rumbo** en el borde superior del panel 3D y del MIP: azimut y
  elevación de la cámara en grados respecto a la orientación del paciente,
  con las letras A · D · P · I en su sitio; gira con la cámara y complementa
  al maniquí.
- **Lecturas fijas por esquina**: arriba-izquierda escena y paso; arriba-
  derecha modo y distribución; abajo-izquierda índice/orientación y escala;
  abajo-derecha W/L. Sin pistas de uso permanentes («arrastra para rotar»):
  se muestran 3 s al entrar y al pulsar `?`.
- **Sin efectos que ensucien la imagen**: nada de scanlines, ruido, brillo
  ni parpadeo sobre el área de la imagen. El acento solo vive en las capas
  de superposición.
- **Mapa de calor del clip**: la barra de leyenda se dibuja como escala de
  instrumento (marcas y valores en mono, sin degradado en la propia barra;
  el degradado va en la malla).

Se implementa como una capa de componentes de superposición
(`frontend/src/vtk/hud/`: `HudFrame`, `HudReticle`, `HudLadder`,
`HudHeadingTape`, `HudReadout`, `HudToggleGroup`) con tokens en
`styles/tokens/colors.css`, y sustituye a los estilos en línea que hoy tienen
`Viewer.tsx` y `MprView.tsx`. Entra en el subproyecto A y lo usan B y C.

## 7. Fuera de alcance

Simulación mecánica de pared y clip (fase siguiente); soporte de más de un
estudio por sesión; cambios en informe PDF más allá de incluir la captura del
mapa de calor; catálogo de clips (vacío en esta instalación).

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Lightsail 1 vCPU/2 GB no aguanta vesselness a resolución completa | ROI + bloques + guardas; medir en una instancia igual antes de cerrar B |
| 113 MB de volumen por internet | Coarse primero, bloques por proximidad, Cache API, gzip; stride 2 en TC grandes |
| Un solo caso con lesión conocida | Fantomas sintéticos para cada regla; la validación clínica queda declarada como pendiente |
| Orientación asumida en 3DRA | Maniquí en gris y ajuste manual guardado en sesión |
