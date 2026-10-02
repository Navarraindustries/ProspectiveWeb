# Calidad de la detección (D4): vetos con motivo y banco de pruebas — diseño

Fecha: 2026-10-02. Ámbito: `backend/` (detección y evaluación) y el panel de detección en `frontend/`. Cuarto subproyecto de la serie D. Parte de master 230891b.

## 1. Propósito

La detección actual es un consenso de tres canales geométricos sobre la malla del árbol vascular (curvatura, calibre local, cociente calibre/vecindad; `services/aneurysm_detector.py`, `services/aneurysm_consensus.py`), ordenado por el mejor puesto en cualquier canal y con un tope de 5 candidatos. Funciona para la lesión de Case 3 (sale ≤ 3 a resolución nativa) pero nada rechaza un candidato por lo que es: cualquier máximo de un canal entra en la lista. El propietario ve demasiados falsos positivos, en particular bordes y restos de la segmentación, y otros que no sabe clasificar. Solo hay un caso anotado (Case 3, lesión confirmada en el tronco basilar, `GT_BASILAR = [62, 64, 63]` mm), así que cualquier ajuste medido solo contra él se sobreajusta.

Decisiones del propietario (2026-10-02): prioridad a los falsos positivos; medir con Case 3 más casos sintéticos; sin clasificador aprendido ni más anotaciones por ahora.

Resultado buscado:

1. Cada candidato pasa comprobaciones geométricas con motivo; los que caen se muestran aparte como «Descartados» con su razón, no desaparecen.
2. Un banco de pruebas reproducible (Case 3 + sintéticos) con métricas fijas, que primero mide la línea base y luego cada veto, y que falla si un veto quita una lesión.
3. Re-detectar no deja una morfometría apuntando a un candidato que ya no existe o se movió.

## 2. Banco de pruebas (`backend/eval/detection_bench.py`)

- **Casos declarativos** (`BenchCase { name, mesh: Path | generator, lesion_mm: Vec3 | None, expect_rank_max: int | None, expect_fp_max: int }`):
  - `case3_native`: `vessel_tree.vtp` de la sesión «Case 3 revision» a resolución nativa (se localiza por `backend/data/sessions/*/state.txt` con `seg.downsample_factor=1` y el DICOM presente); lesión `[62.1, 63.7, 62.9]`; se salta con `pytest.skip` si no está.
  - `case3_half`: la malla a media resolución (`seg.downsample_factor=2`), generada por la segmentación tubular con `PROSPECTIVE_MEM_BUDGET_MB` bajo si no existe; se salta si no se puede.
  - Sintéticos construidos con el generador `vaso_con_saco` de `test_consensus_and_plane.py` (se extrae a `eval/synthetic.py` y los tests pasan a importarlo de ahí): `tubo_con_saco` (lesión en el saco), `bifurcacion_sin_saco` (Y, sin lesión), `tubo_curvo_sin_saco` (sin lesión), `saco_en_borde` (saco a < 1 mm de la cara de la caja: lesión, el veto de borde NO debe descartarlo si el saco está completo; sí descarta el extremo cortado del tubo), `tubo_mas_isla` (esfera suelta a 15 mm: sin lesión; la isla debe descartarse), `bifurcacion_con_saco_apical` (lesión en el ápice de la Y: el veto de bifurcación NO debe descartarla, porque el saco tiene cuello).
- **Métricas por caso** (`BenchResult`): `lesion_rank` (puesto entre los aceptados, `None` si no aparece), `lesion_distance_mm` (al candidato más cercano, aceptado o descartado), `false_positives` (aceptados a > `LESION_HIT_MM = 8` mm de la lesión, o todos si no hay lesión), `rejected_true` (lesión descartada: fallo grave), `rejected_fp` (descartados que eran falsos), `seconds`.
- **Ejecución**: `python -m eval.detection_bench [--json eval/results/<fecha>.json]` imprime la tabla; `backend/test_detection_bench.py` corre el banco y fija umbrales: `rejected_true == 0` en todos los casos; Case 3 nativa `lesion_rank ≤ 2`; Case 3 media `lesion_rank ≤ 3`; sintéticos con lesión `lesion_rank == 1`; sintéticos sin lesión `false_positives ≤ 1`. Los casos reales llevan `@pytest.mark.slow`.
- **Línea base**: antes de ningún veto se corre el banco y se commitea `eval/results/baseline.json`; el README recoge la tabla. Cada veto se añade con su efecto medido.

## 3. Vetos con motivo (`backend/services/candidate_vetoes.py`)

Funciones puras sobre `(mesh: vtkPolyData del árbol, hit: ConsensusHit, patch: vtkPolyData del parche)` que devuelven `Veto | None`, con `Veto { reason: "borde" | "isla" | "bifurcacion" | "forma"; label: str; detail: str }`. Etiquetas: «Recorte de la malla», «Resto de segmentación», «Unión de ramas», «No es sacular». Se evalúan en ese orden y se queda el primer veto. Umbrales como constantes nombradas al principio del módulo, con el banco como juez.

- **Borde** (`veto_border`): el parche toca una cara de la caja de la malla a < `BORDER_TOL_MM = 1` mm **y** el parche tiene aristas de contorno abierto (`vtkFeatureEdges`, boundary) con longitud total > `OPEN_EDGE_MM = 3` mm. Hoy «on_border» solo manda al final; pasa a descartar. Un saco completo pegado a la cara (sin aristas abiertas) no se descarta.
- **Isla** (`veto_island`): el componente conexo del árbol que contiene el centro del candidato tiene < `ISLAND_FRAC = 0.02` de los vértices del árbol y no es el componente mayor.
- **Bifurcación** (`veto_bifurcation`): en una esfera de radio `BIF_RADIUS_K = 1.5 × radius_mm` (mínimo 3 mm) centrada en el candidato, el número de componentes de la intersección de la malla con la esfera (secciones por donde el vaso entra o sale) es ≥ 3 **y** el parche no tiene cuello (ver forma). Se calcula recortando la malla con la esfera (`vtkClipPolyData` con `vtkSphere`) y contando los contornos de corte (`vtkFeatureEdges` + `vtkConnectivityFilter`).
- **Forma** (`veto_shape`): el parche no tiene cuello: la sección más estrecha a lo largo del eje principal del parche (cortes con `vtkCutter` a 10 alturas entre la base y la cúpula) no es menor que `NECK_RATIO = 0.85 × diámetro máximo del parche`. Un ensanchamiento fusiforme o una curva no tienen cuello; un saco sí. Solo se aplica a parches `region` (los `locator` de los canales geométricos no tienen forma propia y no se vetan por forma).

El orden de los aceptados no cambia (`order_hits` como hoy). Los vetos se aplican después del consenso y antes del tope: el tope de 5 cuenta aceptados.

## 4. Resultado, API y estado

- `models/detection.py`: `AneurysmCandidate` gana `veto: Veto | None`; `AneurysmDetectionResult` gana `rejected: list[AneurysmCandidate]` (vetados, con `veto` relleno, mismo formato, ids `cand-00N` consecutivos después de los aceptados) y `diagnostics` gana `n_rejected` y el recuento por motivo.
- `confidence` no cambia de valor pero el frontend lo etiqueta «Puesto» (es un rango convertido a [0, 1], no una probabilidad); el modelo gana `rank: int`.
- Estado de sesión: `detect.cand_00N.veto_reason` (vacío si aceptado); los vetados también se guardan para poder elegirlos.
- **Re-detectar invalida la morfometría** si el candidato elegido (`detect.selected_candidate`) ya no existe o su centro se movió > `REDETECT_MOVE_MM = 2` mm: entonces se limpian `morpho.*`, el saco y el tratamiento como hace hoy `DELETE /api/detect`, y la respuesta lleva `morphometry_invalidated: true` para que el panel lo diga. Si no se movió, se conserva como hoy.

## 5. Panel (`frontend/src/components/planning/DetectPanel.tsx`)

- Aceptados como hoy; la barra pasa a rotularse «Puesto» y muestra `#rank`.
- Debajo, un desplegable «Descartados (n)» cerrado por defecto; cada fila con id, Ø est., la etiqueta del motivo como chip de aviso y el detalle en `title`. Se pueden elegir (clic → `setSelectedCandidate` sobre la lista combinada); al elegir un descartado, una nota «Descartado por <motivo>: compruébalo en el 3D antes de medir».
- Si la respuesta trae `morphometry_invalidated`, aviso «La morfometría se ha limpiado: el candidato elegido cambió al re-detectar».
- El texto «Lo que se pinta de azul no es el saco» se mantiene.

## 6. Pruebas

- `test_candidate_vetoes.py`: cada veto sobre los sintéticos (`saco_en_borde` → el extremo cortado se veta y el saco no; `tubo_mas_isla` → la isla se veta; `bifurcacion_sin_saco` → la unión se veta; `bifurcacion_con_saco_apical` → el saco no; `tubo_curvo_sin_saco` → forma; `tubo_con_saco` → nada).
- `test_detection_bench.py`: los umbrales de §2 (reales `slow`).
- `test_detect_api*.py`: `rejected` en la respuesta, ids consecutivos, tope sobre aceptados, `morphometry_invalidated` cuando el elegido se mueve.
- Frontend: `DetectPanel.test.tsx` (desplegable, chip de motivo, elegir un descartado, aviso de morfometría, etiqueta «Puesto»).
- Navegador (Case 3): la lista acepta la lesión entre los dos primeros; los descartados aparecen con motivo; elegir uno descartado funciona; re-detectar tras medir avisa si procede.

## 7. Fuera de alcance

Clasificador aprendido; cambiar la resolución de la malla de detección; nuevos canales; anotar más estudios (si el propietario los aporta después, entran al banco como `BenchCase` reales); cambios en morfometría.
