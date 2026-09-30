# Grabación del visor y vistas ocultables — diseño

Fecha: 2026-09-30 · Estado: implementado

## Qué se pidió

1. Que el profesional pueda **grabar la pantalla de PROSPECTIVE** como hace las
   capturas, y guardar y descargar el vídeo. Usos: presentar la planificación a
   colegas, documentar el caso y docencia — los tres.
2. Poder **ocultar y volver a mostrar las reglas y marcos verdes** del HUD.
3. Poder **ocultar y volver a mostrar la franja de cortes** (axial, coronal,
   sagital y MIP), dejando solo la vista principal.

## Decisiones

- **Se graba el visor, no la pantalla.** `getDisplayMedia` graba lo que el
  usuario elija, barra superior incluida, que lleva el nombre del paciente. Un
  vídeo se reenvía sin pensarlo. Cada fotograma se compone como la captura
  (`paintFrame`, compartido con `composeCapture`): paneles visibles en su
  sitio + lecturas del HUD, sin datos del paciente.
- **Sin audio** (decisión del usuario): la voz del profesional en el estudio
  del paciente es otra cuestión.
- **Al parar, se descarga y se guarda** en el estudio de imagen como una
  captura más (`case_captures.media_type = video/*`). Sin estudio archivado,
  solo se descarga y se avisa.
- **MP4 (H.264) si el navegador lo graba** (Chrome/Edge); si no, WebM. Sin
  conversión en servidor. 2,5 Mbit/s, tope 3 min (se para sola y avisa), tope
  de 80 MB en el servidor, tipo comprobado por los bytes.
- **REGLAS oculta solo la decoración** (opción a del usuario): esquinas, cinta
  de rumbo, escalera de cortes, retícula y líneas de referencia. Se quedan las
  letras de orientación, el número de corte, las medidas y los avisos de
  seguridad (ORIENTACIÓN ASUMIDA, instrucciones de marcado).
- **CORTES y REGLAS se recuerdan en el navegador** de cada profesional
  (`localStorage`); no son datos del caso. Capturas y grabaciones salen como
  se ve el visor.

## Cómo funciona

- `captureRenderWindow` gana `grab(ctx, rect)`: dibuja la ventana de vtk.js y
  copia su lienzo a un contexto 2D **en la misma tarea**, porque vtk.js crea el
  contexto WebGL con `preserveDrawingBuffer: false`.
- `viewerRecorder.startRecording` pinta cada fotograma en un lienzo propio y lo
  graba con `MediaRecorder` desde `canvas.captureStream()`.
- **Temporizador y no `requestAnimationFrame`.** Medido en el navegador: con la
  pestaña oculta rAF no se llama nunca (0 veces en 2 s) y el vídeo salía vacío
  (20 KB para 27 s). Con `setInterval` la grabación sigue, a ~1 fps en una
  pestaña oculta y a 30 fps en una visible.
- El visor publica en el store `viewerRecording` (`read()` por fotograma +
  `state()`), una sola vez y leyendo por refs, como `captureCase`.
- Backend: `POST /api/captures/video` (multipart), `GET /api/captures/{id}/video`,
  columnas `media_type` y `duration_s` con migración `ADD COLUMN`. `/image` de
  una grabación y `/video` de una captura dan 404. El informe PDF salta los
  vídeos y el selector de capturas del informe no los ofrece.

## Verificado

- Backend: `test_grabaciones.py` (14) + suite completa.
- Frontend: grabadora con dobles, botón, galería, selector, preferencias y qué
  es decoración + suite completa.
- Navegador real (Chrome 154, sesión de Cerón): grabación de 15 s guardada en el
  estudio; ffmpeg la decodifica como H.264 1092×748 y los fotogramas enseñan la
  malla girando con el HUD y sin marcos. La grabación de prueba se borró.

## Lo que no se pudo medir

La tasa real de 30 fps: la ventana de automatización estaba oculta y el
navegador limita ahí el temporizador a una vez por segundo.
