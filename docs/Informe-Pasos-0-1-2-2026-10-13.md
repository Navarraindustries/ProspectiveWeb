# Pasos 0, 1 y 2 del plan Zenodo — implementación y medida (2026-10-13)

Encargo: «vamos con el 0, 1 y 2», con la condición de que Case 3 e IM_0055 (3DRA) sigan
funcionando igual. Todo lo que sigue está en el repositorio sin commit; nada se ha
desplegado.

## 1. Qué se ha hecho

**Paso 0 — red de seguridad.**
- `backend/scripts/regresion_xa.py` recorre Case 3 e IM_0055 por el camino tubular del
  servidor y la detección, y escribe `backend/data/regresion_xa/<etiqueta>.json`. Línea
  base (`base.json`): Case 3 107 186 vértices, lesión **1.ª de 14** (curvatura); IM_0055
  104 841 vértices, lesión **1.ª de 17** (curvatura + cociente). `--compare base` imprime
  las diferencias y sale con 1 si una lesión baja de puesto.
- `backend/test_regresion_xa.py` (lento): lesión entre los 5 y en los 3 primeros, en la
  malla entera y en el árbol, en los dos casos.
- La receta tubular del servidor se ha extraído a **`routers.segment.segment_tubular`**; la
  API, el banco `eval_zenodo.py` y la regresión llaman a la misma función.
- Tras TODOS los cambios de abajo (`--label final2 --compare base`): **«sin diferencias»**
  en Case 3 e IM_0055: mismas mallas, mismos 5 candidatos, misma lesión 1.ª.

**Paso 2 — hueso fuera en TC** (enrutado por modalidad; XA/3DRA no cambia).
- `tubular_ceiling(modality, requested, lower)`: techo 700 HU en CT, ninguno en XA. La
  interfaz lo recibe en `suggested-band.tubular_upper`, lo enseña y la previa lo usa.
- **`MaskParams.bone_hu`**: los componentes > 700 HU de ≥ 500 mm³ (el cráneo, nunca una
  calcificación) se quitan de la máscara con un margen de 1,5 mm por eje. Es lo que de
  verdad saca el cráneo (§3). En la pasada gruesa de un volumen reducido la regla es
  otra: 1 200 HU, sin margen y sin techo (§3, punto 3).
- `consensus(..., tree_poly=)`: si hay árbol se decide sobre la malla completa (bug 026).
- Tests: `test_paso2_hueso_ct.py` (14), frontend `SegmentPanel.test.tsx` (+2).

**Paso 1 — resolución nativa en la banda del árbol** (`services/band_refine.py`).
- Cuando el volumen se reduce (factor 2–6), la máscara reducida solo localiza el árbol; una
  banda de 5 mm a su alrededor se vuelve a segmentar a resolución nativa por baldosas de
  128³ con halo de 12 vóxeles (≈ 140 MB de pico por baldosa, independiente del tamaño del
  estudio), sembradas por el tubo grueso (`build_vascular_mask(seed_mask=)`). La malla sale
  de esa máscara nativa, en coordenadas del volumen entero. A factor 1 no se ejecuta.
- Tests: `test_paso1_banda_nativa.py` (10). Banco: `eval_zenodo.py --no-band` lo apaga.

## 2. Medida sobre 16 estudios (10 con lesión = 13 lesiones, 6 controles)

`base` es la evaluación del informe anterior. `p2b` = hueso sin banda; `p12e` = hueso +
banda con la regla gruesa definitiva; `p12e_v1` = las mallas de `p12e` con la puerta de
curvatura media absoluta H·r ≥ 0,7 (la de XA) en vez del percentil 75. Comparación con
`backend/data/compare_pasos.py`.

| | base | p2b | p12e | p12e_v1 |
|---|---|---|---|---|
| Pieza mayor de la malla (mediana) | 637 cm³ | 56 cm³ | 75 cm³ | 75 cm³ |
| Estudios con árbol reconocido (calibre y cociente encendidos) | 0/16 | 9/16 | 7/16 | 7/16 |
| Candidatos en hueso, controles | 24/30 | 9/30 | 7/30 | 8/30 |
| Candidatos en hueso, estudios con lesión | 26/50 | 4/50 | 5/50 | 5/50 |
| Superficie anotada recuperada (mediana) | 0,99 | 0,92 | **1,0** | **1,0** |
| Lesiones entre los 5 | **4** | 1 | 1 | 2 |
| Lesiones entre los 10 | 6 | 1 | 3 | **6** |
| Lesiones en la lista de 40 | **10** | 3 | 4 | 9 |
| Segundos por estudio (mediana) | 104 | 59 | 390 | 114 (solo detección) |

**Lectura.** La malla es otra: deja de ser la cabeza (637 → 75 cm³), el hueso casi
desaparece de los candidatos (50 de 80 → 13 de 80) y **las 13 lesiones salvo una están en
la malla nativa** (recall mediana 1,0; 026, gigante fusiforme basilar, es la única fuera).
La detección, con sus puertas de siempre, es peor sobre esa malla; con la única puerta
absoluta que ya usa XA vuelve a la línea base en lista y en top 10, y queda por debajo en
top 5 (2 frente a 4). Lo que la frena ya no es el hueso ni la resolución, sino el
ranking: cuatro lesiones quedan en los puestos 5, 6, 6 y 7.

Por lesión (`p12e_v1`):

| Estudio | Lesión | base | p12e_v1 | Qué pasa |
|---|---|---|---|---|
| 027 | middle | 3.ª | 5.ª | calibre 2.º, cociente 3.º; compite con bifurcaciones |
| 096 | large, calcificado | 3.ª | 7.ª | vuelve con la regla gruesa a 1 200 HU |
| 106 | middle ×2 | 3.ª, 3.ª | 14.ª, 14.ª | regiones perfectas (esfericidad 0,98/0,94), curvatura 6.ª |
| 006 | large | 22.ª | 10.ª | mejora |
| 019 | giant, trombosado | 8.ª | **2.ª** | mejora |
| 028 | middle, factor 5 | 32.ª | **6.ª** | la banda la recupera (recall 0 → 1,0) |
| 016 | middle ×2 | fuera, 13.ª | 6.ª, 19.ª | vuelven tras la regla gruesa (§3) |
| 018 | middle | 11.ª | fuera (`compactness` 0,19) | umbral 0,2 |
| 033 | middle ×2 | 7.ª, fuera | fuera (`merged`, tope 40) | la fusión y el tope de regiones |
| 026 | giant, fusiforme | fuera | fuera de la malla | la recuperación a 3 mm no alcanza un saco gigante |

## 3. Lo que se ha aprendido midiendo

1. **El techo tras rellenar no saca el hueso en TC.** El cortical queda envuelto por su
   cáscara de volumen parcial (150–700 HU) y se conserva como «centro de vaso dentro de
   pared». Con techo solo (pasada descartada): pieza mayor 246 → 195 cm³ en 027, 4 de 5
   candidatos en hueso, lesiones fuera.
2. **La máscara de hueso sí** (`scripts/exp_hueso_ct.py`, 027 nativo): 20,7 cm³ de máscara,
   árbol de 16 cm³, tres canales encendidos, 0 de 5 en hueso. Con margen 1,0 mm vuelve el
   hueso; con techo encima no cambia nada; con erosión de 1 mm (para conservar paredes
   calcificadas) vuelve el cráneo fino (25 → 101 cm³). Parámetros disponibles
   (`bone_margin_mm`, `bone_erode_mm`); producción: 1,5 mm y 0.
3. **A resolución reducida el vóxel mezcla vaso y hueso.** Con la regla nativa (700 HU,
   margen, techo) la pasada gruesa cortaba la carótida en el canal petroso y la
   circulación anterior entera quedaba sin semillas: 016 perdía sus dos lesiones de la
   ACM, y 096 su pared calcificada. Medido en 016 a factor 3: el margen no era la causa
   (sin margen, igual); con 1 200 HU vuelven (0,39/0,41 de la lesión en la máscara, igual
   que sin máscara de hueso) y el cráneo sigue fuera (136 cm³ frente a 582); y el techo
   de 700 las volvía a quitar (con el núcleo de hueso fuera, el borde del hueco cuenta
   como exterior). Regla gruesa definitiva: `CT_BONE_HU_COARSE` = 1 200, sin margen, sin
   techo; las baldosas nativas usan 700 HU, 1,5 mm y techo 700.
4. **El detector está calibrado para la malla con hueso.** Sus puertas de curvatura son
   percentiles de la malla, y en un árbol limpio de vasos finos el percentil sube: 8 de
   13 lesiones caían por `mean_curv` con H·r entre 0,81 y 1,22. Con H·r ≥ 0,7 vuelven
   todas; lo que queda es el ranking (candidatos de calibre y bifurcaciones por delante),
   la compacidad 0,2 (018) y el tope de 40 regiones (033).
5. **Tiempo.** La banda cuesta: 390 s por estudio (mediana) frente a 104, y 21–26 min en
   cabeza y cuello a factor 5–6. Casi todo se va en la detección sobre mallas de 0,4–1 M
   de vértices (decimación a 80 k + curvatura), no en la segmentación por baldosas.

## 4. Estado y siguiente paso

- Pasos 0, 1 y 2 implementados, probados (37 tests nuevos, 48 del método tubular
  adaptados, 32 del panel) y sin efecto sobre la 3DRA. **Suite completa de backend:
  1 671 pasan, 1 omitido** (la sesión de Case 3 no está en disco), 22 min. El único
  fallo que destapó era un fantasma de 800 HU en `test_volume_chunks.py` que ahora cae
  por el techo de TC; de paso el 422 del método tubular dice la verdad cuando lo que
  vacía la máscara es el techo y no el umbral inferior (antes aconsejaba «baja el
  umbral» con el volumen por encima del umbral).
- Como está, **la malla ya es la que el detector necesita**; para que la detección lo
  aproveche hace falta el paso 3 (puerta de curvatura absoluta —ya medida—, compacidad
  0,1, tope de regiones, y el ranking: hoy el consenso prima calibre y cociente sobre una
  región de curvatura perfecta). Es cambio de detector, no de segmentación.
- Dos decisiones del banco: la recuperación en TC (3 mm es de 3DRA; con el hueso fuera,
  un radio mayor devolvería el gigante fusiforme de 026) y el coste de la banda (reducir
  la detección sobre mallas de 1 M de vértices antes de evaluar los 172: ≈ 30 h de
  máquina tal como está).
- Ficheros: `backend/routers/segment.py` (`segment_tubular`, `tubular_ceiling`, `CT_BONE_HU`,
  `CT_BONE_HU_COARSE`), `backend/services/vascular_mask.py` (`bone_mask`, `seed_mask`),
  `backend/services/band_refine.py`, `backend/services/aneurysm_consensus.py` (`tree_poly`),
  `backend/scripts/regresion_xa.py`, `backend/scripts/exp_hueso_ct.py`,
  `backend/data/compare_pasos.py`, runners `backend/data/run_*.ps1`, resultados
  `backend/data/zenodo_eval_p2b`, `_p12b`, `_p12b_v1`, `_p12e`, `_p12e_v1`.
