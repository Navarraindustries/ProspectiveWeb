# Prospective frente al dataset Zenodo 15697196: hallazgos y correcciones

Fecha: 12 de octubre de 2026. Código evaluado: `master` en bc312ac más los cambios sin commitear de esta semana (traza del detector, `ingest_zenodo.py`, `bench_detector.py`, `eval_zenodo.py`, `zenodo_roi_oracle.py`).

## 1. Resumen

Se ha pasado por Prospective, sin cambiar su funcionamiento, el dataset completo: 172 angio-TC de cabeza (82 con aneurisma, 122 lesiones segmentadas a mano; 90 controles). Resultado tal cual está el software:

- **Detección: 4 de 122 lesiones entre los 5 candidatos** (todas en el puesto 3), 17 en una lista de 40, ninguna primera. Solo 3 de 82 estudios con aneurisma tienen la lesión entre los 5.
- **Siempre 5 candidatos**, también en los 90 controles: 857 de 860 candidatos son falsos, dos tercios de ellos sobre hueso. La «confianza» mostrada vale lo mismo para una lesión que para un falso (0,53).
- **Causa principal: la resolución.** 157 de 172 estudios superan el tope de 90 M de vóxeles y se segmentan reducidos por 2–6 en cada eje (vóxel de 2,3 mm de mediana). Con factor ≥ 4 (100 estudios) el saco no llega a la malla.
- **Segunda causa: el hueso está en la máscara** (el método tubular quita el techo de HU): la pieza mayor pesa 760 cm³, la prueba de «árbol» falla en los 172 y los canales de calibre y cociente, los que ven el grosor, no se ejecutan nunca. Todo recae en la curvatura, que compite con el cráneo.
- **Tercera: las puertas del detector están calibradas en 3DRA.** De las 91 lesiones cuya superficie sí está en la malla, lista 15.
- **Correcciones medidas:** segmentar a resolución nativa en la zona (oráculo con caja de ±30 mm) lleva la lesión principal de 3 a 29 estudios entre 5 (saculares: de 2 a 18 de 30); añadir un techo de 700 HU enciende calibre y cociente en 68 de 82 y ayuda en gigantes y fusiformes (30 entre 5, 7 primeras); la regla H·r ≥ 0,7 del preset XA en TC sube de 4 a 6 lesiones entre 5 y de 17 a 24 en lista sin coste. Los blister (39 lesiones de 1,3–3,6 mm) no los ve ninguna configuración: necesitan otro canal.
- **«Ninguno» no puede ocurrir hoy** porque todos los umbrales son percentiles de la propia malla; el código y la pantalla sí lo soportan. Un criterio absoluto solo tiene sentido después de las tres correcciones anteriores, calibrado sobre los controles.

Los apartados 6–9 tienen el detalle y el orden de ataque. El código de Prospective no se ha tocado salvo un arreglo de borrado (apartado 10).

## 2. El dataset

Zenodo 15697196 (CC-BY): angio-TC de cabeza con el aneurisma segmentado a mano en STL. En disco, en `ProspectiveWeb/Archivos DICOM/` (25 GB): `Studies/<id>/*.dcm`, `Annotations/an_<id>[_k].stl` y `Metadata.csv`.

| | |
|---|---|
| Estudios | 172 (82 con aneurisma, 90 controles) |
| Lesiones anotadas (STL) | 122 (58 estudios con 1, 15 con 2, 4 con 3, 3 con 4, 2 con 5) |
| Tamaño (clase del dataset) | miliar 30 · medio 56 · grande 20 · gigante 16 |
| Tipo | blister 39 · sacular 36 · fusiforme 26 · otros (bifurcación sin tipo) 21 |
| Longitud | mínimo 1,3 mm · mediana 5,3 mm · máximo 65 mm. 40 lesiones de ≤ 3 mm, 59 de ≤ 5 mm, 44 de ≥ 10 mm |
| Arteria | ICA 60 · MCA 32 · basilar 12 · AComA 6 · ACA 8 · PCA 3 · otra 1 |
| Rotos / trombo / calcio / bleb | 9 / 22 / 20 / 27 |
| Grosor de corte | 0,5 mm en 114 estudios; hasta 2 mm |
| Cortes por estudio | mediana 1 006 (136–1 441); 145 de 172 incluyen cabeza y cuello |
| Vóxeles | 157 de 172 estudios superan 90 millones |

Coherencia comprobada: los 172 identificadores de `Metadata.csv` tienen carpeta, cada fila con aneurisma tiene su STL (`an_008_2.stl` ↔ fila `2_2`) y no sobra ningún STL. Los STL están en coordenadas de paciente; la malla de Prospective nace con origen en (0,0,0), así que se les resta el origen del volumen y se deshace la orientación (comprobado en el estudio 002 en la sesión anterior).

Es un conjunto difícil a propósito: la mitad de las lesiones mide 5 mm o menos, un tercio son blister de 1,3–3,6 mm, y los volúmenes son de cabeza entera (muchos con cuello), con el hueso tocando la vasculatura con contraste.

## 3. Cómo se ha probado

La ingesta por la API (`backend/scripts/ingest_zenodo.py`, sesión del 9 de octubre) deja 1,8 GB por estudio (sesión viva, instantánea con el volumen en float32 y archivo DICOM): con los 44 primeros el disco llegó al 97 %. Para los 172 se ha escrito `backend/scripts/eval_zenodo.py`, que recorre **el mismo camino que el servidor** sin pasar por él:

- carga de la serie principal con `services.dicom_loader.load_series` (SimpleITK/GDCM, igual que `/api/upload`);
- umbrales automáticos con `services.thresholds.compute_auto_thresholds` (en todos los estudios: estrategia `ct_stats`, inferior 150 HU);
- método tubular con la **misma regla de reducción** de `routers.segment`: por encima de 90 millones de vóxeles el volumen se submuestrea por un entero que deje el eje mayor en ≤ 256 (`_half_factor`), y la máscara (`services.vascular_mask.build_vascular_mask`, techo 0, recuperación 3 mm) pasa a superficie con `mask_to_surface` (40 iteraciones, banda 0,05);
- detección con `routers.detect._detect_hits` y el preset de TC de `_detector_for_modality`: curvatura sobre una copia de ≤ 80 000 vértices, calibre y cociente sobre otra de ≤ 40 000 si la pieza mayor «parece un árbol».

Las 44 mallas que el servidor produjo en la ingesta se reutilizan tal cual (son la salida real de la app); las 128 restantes se segmentan con esa receta. Por estudio se guarda la malla y el volumen reducido (`backend/data/zenodo_eval/`), y en el registro JSON: factor de reducción, vértices, piezas y volumen de la pieza mayor; por lesión, el puesto en la lista oficial (5) y en una lista larga (40, mismo orden), el canal, la puerta que tiró la región más cercana si no entra, y la fracción de la superficie del STL que la malla recupera a ≤ 1,5 vóxeles (`surface_recall`); por candidato, la HU media y máxima del volumen reducido en una bola de 2 mm (hueso si la máxima ≥ 700 HU), la distancia a la lesión más cercana y, si viene de curvatura, las métricas de su región. La regla de acierto es la de la app (`routers.ground_truth`): candidato a ≤ máx(5 mm, su diámetro) del centroide del STL.

Dos pasadas adicionales miden correcciones: el detector con otros ajustes sobre las mismas mallas (`--set clave=valor --meshes-from`), y un **oráculo** (`backend/scripts/zenodo_roi_oracle.py`) que segmenta una caja de ±30 mm alrededor de la lesión a la resolución del DICOM, con y sin techo de 700 HU, para medir el techo de una región de interés a resolución nativa. Es un oráculo porque la caja se centra en la respuesta; dice cuánto se ganaría si la región viniera de otro sitio (un clic, un atlas), no lo que la app consigue hoy.

Tests: `test_eval_zenodo.py` (7) y `test_zenodo_roi_oracle.py` (4), más los 34 de la ingesta y el banco.

## 4. Cómo funciona hoy el pipeline, en lo que importa aquí

**Segmentación tubular.** Umbral inferior 150 HU y, en el método tubular, **sin techo** (`routers.segment` pone `upper = 0` porque en 3DRA el techo vaciaba los vasos). La máscara M0 es «todo lo que supera 150 HU, relleno»: en una angio-TC eso incluye el cráneo, la base del cráneo y el peñasco. De ahí se eligen semillas tubulares (percentil 90 de Frangi, ≥ 50 mm³), se crece por histéresis y se recupera lo que queda a ≤ 3 mm del tubo. El hueso tiene aristas que puntúan como tubo y láminas que el veto solo quita en parte: la pieza mayor de la malla resultante es un bloque de cientos de cm³ con los vasos dentro.

**Reducción de resolución.** Por encima de 90 millones de vóxeles no se segmenta «a media resolución» sino por el factor entero que deja el eje mayor en 256: un estudio de 1 171 cortes de 0,5 mm se divide por **5 en los tres ejes** (vóxel de 2,5 mm). 157 de los 172 estudios están por encima del tope; el factor es 5 o más en 84 de ellos. A 2,5 mm un blister de 2 mm no existe y un saco de 5 mm son dos vóxeles.

**Detección.** La malla se decima a 80 000 vértices para la curvatura (una malla de 1 M de vértices pierde 12 de cada 13). Se calcula la curvatura gaussiana y se toman los vértices por encima del **percentil 85 de la propia malla**: siempre el 15 % con más curvatura, sea lo que sea. Sus componentes conexas (1 500–2 000 por cabeza) pasan por puertas en orden: ≥ 8 puntos, radio 1–20 mm, curvatura media por encima del percentil 75 de la malla, fracción gaussiana positiva ≥ 0,5, compacidad ≥ 0,2, esfericidad ≥ 0,35. Las que pasan se puntúan (`score`, una suma ponderada de normalizaciones relativas a esos mismos percentiles y de un factor de tamaño que premia radios de 4 mm), se fusionan las duplicadas y se cortan a 8. El consenso añade calibre y cociente **solo si la pieza mayor pesa menos de 100 cm³ y tiene menos de 3 mm de espesor equivalente** (`mesh_components.looks_like_tree`), ordena por mejor puesto de canal y devuelve 5 (`_MAX_CANDIDATES`). La «confianza» que ve el clínico es el puesto convertido a [0, 1] (1,0; 0,69; 0,53; 0,43; 0,36), no una probabilidad.

Tres consecuencias, que los números del apartado 6 confirman: no hay ningún criterio absoluto (todo es percentil de la malla, así que un cráneo sano produce candidatos con la misma seguridad que una cabeza con un aneurisma); la cúpula compite con todas las aristas del hueso; y lo que mide menos de ~4 vértices en la copia de 80 000 no puede pasar la primera puerta.

## 5. Resultados sobre los 172 estudios

Los 172 se evaluaron sin errores (43 mallas reutilizadas del servidor; el 049 se segmentó de nuevo porque el servidor había registrado 250 cortes de 1 301 y una malla a resolución nativa que su propia regla no permite). Mediana de 101 s por estudio: 9 s la máscara a resolución reducida, 44 s la detección.

### 5.1 Segmentación

| | |
|---|---|
| Factor de reducción aplicado | ×1: 11 estudios · ×2: 32 · ×3: 29 · ×4: 16 · ×5: 68 · ×6: 16 |
| Vóxel con el que se segmentó | mediana 2,26 mm (eje mayor) |
| Vértices de la malla | mediana 91 000 (14 000–1 350 000); 109 de 172 superan los 80 000 y se deciman para la curvatura |
| Pieza mayor de la malla | p10 482 cm³ · mediana 761 cm³ · p90 1 043 cm³ (mínimo 141, máximo 1 577); espesor equivalente mediana 5,3 mm |
| «Parece un árbol» (`looks_like_tree`) | falso en los 172 |
| Canales calibre y cociente | apagados en 171 de 172 |
| Superficie del STL recuperada por la malla | mediana 0,97; por debajo del 50 % en 31 lesiones y del 20 % en 26 |

La recuperación depende casi solo del factor de reducción: con factor 1–3 la mediana es 0,94–1,0; con factor 4, **0,10**; con 5, **0,31**; con 6, **0,0**. Es decir, en los 100 estudios reducidos por 4 o más (34 lesiones) el saco no está en la malla. Matiz de la medida: cuenta los puntos del STL a ≤ 1,5 vóxeles de la malla, así que con vóxeles de 2–3 mm una lesión de 2 mm «se recupera» si está el vaso padre; por eso la cifra de ≤ 3 mm sale alta y a la vez 29 de esas 40 lesiones no tienen ninguna región de curvatura cerca.

El único estudio con calibre y cociente encendidos (026) lo está por un defecto: la prueba de árbol se hace sobre la copia decimada a 40 000 vértices, y al decimar una malla de 1,35 M de vértices la pieza mayor (1 577 cm³) se fragmenta y pasa la prueba.

### 5.2 Detección de las 122 lesiones

| | |
|---|---|
| Entre los 5 candidatos (lista oficial) | **4 lesiones** (todas en el puesto 3): 027, 096 y las dos del 106 |
| Entre 10 / entre 40 | 6 / 17 |
| En el primer puesto | 0 |
| Estudios con alguna lesión entre los 5 | **3 de 82** (16 de 82 en la lista de 40) |
| Distancia de la lesión al candidato más cercano | mediana 20 mm (cuartiles 12 y 31) |

| Por tamaño | n | entre 5 | en lista de 40 | sin región cerca |
|---|---|---|---|---|
| miliar | 30 | 0 | 2 | 21 |
| medio | 56 | 3 | 10 | 23 |
| grande | 20 | 1 | 3 | 0 |
| gigante | 16 | 0 | 2 | 0 |

| Por tipo | n | entre 5 | en lista de 40 |
|---|---|---|---|
| blister | 39 | 0 | 3 |
| sacular | 36 | 3 | 6 |
| fusiforme | 26 | 0 | 3 |
| bifurcación sin tipo | 21 | 1 | 5 |

Motivos del fallo (105 lesiones sin puesto): sin región de curvatura a menos de un diámetro, 44; compacidad, 21; curvatura media, 17; fracción gaussiana positiva, 10; menos de 8 puntos, 7; tope de 8 candidatos de curvatura, 5; fusionada con otra, 1.

### 5.3 Candidatos y controles

| | |
|---|---|
| Candidatos por estudio | **5 en los 172** |
| Regiones que pasan todas las puertas | mínimo 28, mediana 40 (el tope de la lista larga) de ~1 700 regiones por malla |
| Candidatos que son una lesión | 3 de 860 |
| Falsos positivos por estudio con aneurisma | 4,96 |
| Controles (90): tejido alrededor de sus 450 candidatos | hueso 298 (66 %) · vaso 135 (30 %) · otro 17 |
| Controles con los 5 candidatos en hueso / con 3 o más | 20 / 70 |
| Estudios con aneurisma: tejido de sus 410 candidatos | hueso 262 · vaso 127 · otro 21 |
| «Confianza» mostrada, mediana | lesiones 0,53 · falsos 0,53 |
| Puntuación interna de la región, mediana | lesiones 0,55 · falsos 0,62 |

La confianza que ve el clínico no distingue una lesión de un falso positivo, y la puntuación interna del detector es ligeramente mejor para los falsos.

## 6. Por qué fallan la segmentación y la detección actuales

Por orden de cuánto cuestan, medido sobre las 122 lesiones.

**1. La reducción de resolución borra el saco (34 lesiones, todas las de factor ≥ 4).** El tope de 90 millones de vóxeles no está pensado para angio-TC de cabeza y cuello: 157 de 172 estudios lo superan, y `_half_factor` no divide por 2 sino por lo que haga falta para que el eje mayor quepa en 256. Un estudio de 1 171 cortes a 0,5 mm pasa a vóxeles de 2,5 mm; con 1 301 cortes a 0,3 mm, a 1,8 × 3 mm. La máscara tubular (semillas de ≥ 50 mm³, crecimiento por histéresis) está calibrada en 3DRA a 0,32 mm; a 2,5 mm ni la carótida pasa de dos vóxeles de diámetro. Resultado: recuperación del STL 0,0–0,31 en esos estudios, y 44 lesiones sin ninguna región de curvatura a menos de un diámetro, 29 de ellas de ≤ 3 mm. Además la regla no es reproducible: cuando el servidor anda corto de memoria reduce también por debajo del tope (4 de los 44 estudios ingeridos se redujeron por 2 con 80–88 millones de vóxeles), así que el mismo estudio puede dar mallas distintas según qué más esté corriendo.

**2. El hueso está dentro de la máscara (todos los estudios).** El método tubular quita el techo de HU (`upper = 0`) porque en 3DRA vaciaba los vasos; en angio-TC eso mete en M0 todo el cráneo (≥ 150 HU), y la base del cráneo, el peñasco y las órbitas tocan la carótida con contraste. Las semillas de Frangi y la recuperación a 3 mm no lo separan: la pieza mayor pesa 480–1 040 cm³ y 5,3 mm de espesor, `looks_like_tree` es falso en los 172, y calibre y cociente, los dos canales que en Case 3 encontraban la lesión por grosor, no llegan a ejecutarse. Toda la detección queda en manos de la curvatura, que en una cabeza compite con las aristas del hueso: dos tercios de los candidatos están en hueso.

**3. La curvatura trabaja sobre una copia de 80 000 vértices.** 109 de 172 mallas se deciman (hasta 17 veces). Una cúpula de 4 mm en una cabeza de 1 M de vértices queda con un puñado de vértices en la copia: 7 lesiones caen por «menos de 8 puntos» y buena parte de las 23 «sin región» con el saco presente en la malla son esto. La decimación también rompe la prueba de árbol (caso 026).

**4. Las puertas de forma están calibradas en 3DRA de un solo caso.** De las 91 lesiones cuya superficie sí está en la malla, el detector lista 15 y pone 4 entre cinco. Entre las 28 de ≥ 10 mm presentes y sin puesto: 15 caen por la curvatura media (su región tiene H·r entre −1,7 y 1,5: muchas regiones incluyen el cuello, que es una silla, o el preset de TC usa un percentil de la malla entera mientras el de XA usa la regla adimensional H·r ≥ 0,7, con la que 7 de esas 15 pasarían), 4 por compacidad (0,08–0,16 frente a un mínimo de 0,20: los sacos grandes y los fusiformes no son compactos), 4 por fracción gaussiana positiva, 4 por «menos de 8 puntos» (gigantes de 30–65 mm, donde la región de alta curvatura es una mota) y 1 por el tope de 8. Las puertas se ajustaron para que la lesión basilar de Case 3 entrara; aquí descartan 40 lesiones que la malla tiene.

**5. El orden no favorece a la lesión aunque entre.** Con 28–40 regiones válidas por malla y 5 plazas, el puesto lo decide una puntuación de normalizaciones relativas a percentiles de la propia malla más un factor de tamaño que premia radios de 4 mm. Las lesiones que entran lo hacen en el puesto 3 o más abajo (ninguna primera); su puntuación mediana (0,55) es menor que la de los falsos (0,62), porque las aristas de hueso tienen más curvatura gaussiana positiva y más «esfericidad» de caja que un saco con cuello.

En resumen: en 100 estudios la lesión no llega a la malla; en los otros 72 llega pero compite con el cráneo con un detector de forma que no la distingue, y los dos canales que miden grosor están apagados.

## 7. Por qué hay tantos falsos positivos

Son 857 de 860 candidatos, y tienen tres causas que se suman:

1. **No hay ningún criterio absoluto.** Umbral gaussiano = percentil 85 de la malla; puerta de curvatura media = percentil 75 de la malla; las normalizaciones del `score` se hacen contra esos mismos percentiles. Un cráneo sano tiene su percentil 85 igual que cualquier otra superficie, así que siempre hay un 15 % de vértices «de alta curvatura», ~1 700 regiones y decenas que pasan las puertas. Los 90 controles dan 5 candidatos cada uno con la misma «confianza» que los estudios con aneurisma.
2. **El hueso está en la malla y tiene más curvatura que un saco.** 66 % de los candidatos de los controles y 64 % de los de los estudios con aneurisma están rodeados de ≥ 700 HU (celdillas mastoideas, senos, órbitas, silla turca, suturas). El 30 % restante está en vaso: codos de la carótida en el sifón y bifurcaciones, que son los sitios donde la curvatura también es alta. Sin calibre ni cociente no hay nada que diga «esto es grueso respecto a su vaso».
3. **La confianza es el puesto.** `hit_confidence` convierte el puesto en 1,0 / 0,69 / 0,53 / 0,43 / 0,36 y la pantalla lo pinta como barra. Así el primer candidato de un control sano siempre luce 1,0. La puntuación interna no serviría mejor: en la lista larga, exigir `score ≥ 0,60` deja 2 de 16 lesiones y aún 5,9 falsos por estudio; `≥ 0,65` deja 0 lesiones y 1,2 falsos.

No es una cuestión de afinar un umbral: con las características actuales (curvatura de una malla con hueso, a 2,5 mm) las lesiones y los falsos se solapan por completo. Hay que cambiar lo que se mide antes de poder decir «no hay nada».

## 8. ¿La detección siempre devuelve cinco candidatos? ¿Puede no devolver ninguno?

**Hoy, en la práctica, siempre cinco.** En los 172 estudios la lista tuvo 5 candidatos; el mínimo de regiones que pasaron todas las puertas fue 28 y la mediana 40 (el tope de la lista larga), de modo que la lista oficial se corta siempre por `_MAX_CANDIDATES = 5` y nunca por falta de material. La causa es la del apartado 7: todos los umbrales son percentiles de la propia malla.

**Puede devolver cero, pero solo por accidente.** El código lo contempla: `AneurysmDetector.detect` devuelve una lista vacía si ningún vértice supera el umbral gaussiano (imposible con un percentil) o si todas las regiones caen en alguna puerta; `consensus` devolvería entonces solo lo que diga calibre (apagado en TC); `POST /detect` escribe `detect.n_candidates = 0`, y la pantalla de detección muestra «No se encontraron candidatos aneurismáticos en la malla» con el diagnóstico de regiones. Ocurre en mallas minúsculas o degeneradas (una tapa, un fragmento), no en una cabeza.

**Lo que haría falta para que «ninguno» signifique «no hay aneurisma».** Un criterio absoluto, calibrado sobre los 90 controles, que deje fuera lo que no supera cierta evidencia. Con las características de hoy no existe: cualquier umbral de puntuación que baje los falsos por debajo de 1–2 por estudio deja fuera todas las lesiones (apartado 7). Así que el orden correcto es (1) que el saco esté en la malla (resolución), (2) que el hueso no esté (techo de HU o veto), (3) que calibre y cociente vuelvan a ejecutarse, y entonces (4) fijar sobre los controles un umbral por canal y de acuerdo entre canales, y devolver una lista vacía cuando nada lo supere. Mientras tanto, la lista corta debería presentarse como lo que es (apartado 9, punto 5).

## 9. Correcciones, en orden de rendimiento por esfuerzo

Cada una con la evidencia medida en este dataset. Las cifras del oráculo son sobre la lesión principal de cada estudio con aneurisma.

### 9.1 Segmentar a resolución nativa donde importa (la corrección principal)

**Evidencia (oráculo, caja de ±30 mm alrededor de la lesión principal de los 82 estudios, misma máscara y mismo detector, 144 s por estudio):**

| Lesión principal (82) | Cabeza entera, hoy | Caja a resolución nativa | Caja nativa + techo 700 HU |
|---|---|---|---|
| Entre los 5 candidatos | 3 | **29** | **30** |
| En el primer puesto | 0 | 6 | 7 |
| En la lista de 40 | 13 | 41 | 43 |
| Calibre y cociente encendidos | 0 | 59 | 68 |
| Pieza mayor «parece un árbol» | 0 | 60 | 68 |
| Candidatos en hueso (de 410) | — | 167 | 193 |

| Por tamaño (entre 5 / en lista / n) | entera | nativa | nativa + techo |
|---|---|---|---|
| miliar | 0 / 0 / 12 | 2 / 5 / 12 | 1 / 3 / 12 |
| medio | 2 / 8 / 37 | 11 / 18 / 37 | 10 / 18 / 37 |
| grande | 1 / 3 / 19 | 12 / 12 / 19 | 12 / 14 / 19 |
| gigante | 0 / 2 / 14 | 4 / 6 / 14 | 7 / 8 / 14 |

| Por tipo | entera | nativa | nativa + techo |
|---|---|---|---|
| sacular | 2 / 5 / 30 | **18 / 22 / 30** | 18 / 22 / 30 |
| fusiforme | 0 / 3 / 22 | 6 / 8 / 22 | 7 / 12 / 22 |
| bifurcación sin tipo | 1 / 4 / 15 | 5 / 10 / 15 | 5 / 8 / 15 |
| blister | 0 / 1 / 15 | 0 / 1 / 15 | 0 / 1 / 15 |

Solo con resolución nativa en la zona, y sin tocar el detector, la lesión principal pasa de estar entre 5 en 3 estudios a estarlo en 29; en los saculares, de 2 a 18 de 30. Los fallos que quedan en la caja nativa son sobre todo «menos de 8 puntos» (24): blister y miliares, y los gigantes fusiformes de 40–65 mm, que no forman cúpula.

**Qué cambiar.** No es viable cargar 341 M de vóxeles a resolución nativa en float32 con Frangi en 2 GB, pero tampoco hace falta:
- Mantener la pasada reducida solo para **localizar el árbol** (semillas y tubo), y volver a correr la máscara a resolución nativa **únicamente en la banda del árbol** (máscara dilatada unos 5 mm): es un 3–5 % del volumen. Frangi ya se calcula por lonchas (`FRANGI_SLAB = 64`), así que el cambio es acotar el dominio, no reescribir el método.
- Sustituir la regla de `_half_factor` (eje mayor ≤ 256) por un factor que respete un vóxel máximo en mm (por ejemplo 1,0 mm): a 0,5 mm es ×2, nunca ×5. Y que el factor dependa solo del volumen, no de la memoria libre del momento (hoy el mismo estudio sale distinto según lo que corra al lado); si no cabe, decirlo y parar, no degradar en silencio.
- Enseñar en la pantalla de segmentación el vóxel efectivo con el que se ha segmentado («2,5 mm: lesiones de menos de 5 mm no serán visibles»). Hoy el aviso solo dice «media resolución».

### 9.2 Dejar el hueso fuera de la máscara en TC

**Evidencia (oráculo, techo de 700 HU aplicado tras el relleno, tabla de 9.1):** sobre la caja nativa el techo sube poco la detección (29 → 30 entre 5, 41 → 43 en lista, 6 → 7 primeras) pero cambia lo que hay debajo: la pieza mayor «parece un árbol» en 68 estudios en vez de 60 y mide 28 cm³ de mediana (frente a 760 en la cabeza entera), con lo que calibre y cociente corren en 68 de 82. Donde más se nota es en los gigantes (4 → 7 entre 5) y fusiformes (8 → 12 en lista): son los que la curvatura no ve y el grosor sí. Dos matices: en la caja quedan trozos de hueso trabecular (< 700 HU) y los candidatos en hueso no bajan (167 → 193 de 410, porque el calibre ahora también elige piezas de hueso gruesas); y en cabeza entera el efecto del techo no se ha medido, porque allí el problema previo es la resolución.

**Qué cambiar.** En `routers.segment`, cuando la modalidad es CT, no anular el techo: pasar `upper` ≈ 700 HU a `MaskParams` (el relleno previo conserva el interior de los vasos más brillantes, que es lo que el techo rompía en 3DRA). Complementos: un veto por componente (una pieza con HU máxima > 1 000 y espesor > 3 mm es hueso) y hacer la prueba `looks_like_tree` sobre la malla completa, no sobre la copia decimada (caso 026). Con el hueso fuera, calibre y cociente se encienden solos y la pieza mayor baja de 760 cm³ a decenas.

### 9.3 Puertas del detector para TC

**Evidencia (pasada v1, `min_mean_curv_radius = 0,7` como en XA, mismas mallas):** lesiones entre 5 de 4 a **6**, en la lista de 40 de 17 a **24**, estudios con la lesión entre 5 de 3 a **5**; caídas por curvatura media de 17 a 12; ninguna lesión pierde el puesto salvo una (028, blister, de 32 a fuera). Ganan sobre todo las grandes (3 de 20 entre 5, 7 en lista) y las gigantes (5 en lista). Los falsos positivos de los controles no cambian de naturaleza (hueso 304 de 450).

**Pasada v3 (lo anterior más `min_points = 4`):** entre 5 se queda en 6, pero la lista de 40 sube a **26** (dos lesiones más del 116, gigantes fusiformes que caían por «menos de 8 puntos») y las regiones válidas por malla suben (mínimo 34). Coste: el 027 baja del puesto 3 al 4 y tres lesiones se mueven uno o dos puestos dentro de la lista; en los controles el tejido de los candidatos no cambia (hueso 306 de 450). Es decir, bajar `min_points` solo sirve si la malla no está decimada: el problema real es el apartado 9.1.

**Qué cambiar.** (a) Usar la regla adimensional H·r ≥ 0,7 también en el preset de TC. (b) Escalar `min_points` con la decimación: 8 puntos en una copia de 80 000 vértices de una malla de 1 M son 100 puntos en la original; o calcular la curvatura por trozos sin decimar. (c) Compacidad mínima 0,20 → 0,10 y fracción gaussiana 0,50 → 0,45 (recuperarían hasta 20 lesiones presentes en la malla; medir el coste en los controles con `eval_zenodo.py --set`). (d) Tope del detector de curvatura de 8 a 12–16 (5 lesiones caen por el tope) y no fusionar regiones a menos de un diámetro del saco (1 caso). Son ajustes de una línea cada uno y se miden en 3 h de máquina.

### 9.4 Criterio absoluto y «sin candidatos»

Solo después de 9.1–9.3. Con calibre y cociente activos y el hueso fuera, calibrar sobre los 90 controles: umbral de cociente (grosor relativo al anillo) y de acuerdo entre familias, elegido para ≤ 1 falso por control; devolver lista vacía cuando nada lo supere, y mostrar «sin candidatos» como un resultado real, no como un error. Medir la sensibilidad resultante sobre las 122 lesiones antes de activarlo.

### 9.5 Honestidad de la pantalla mientras tanto

- Quitar la barra de «confianza» o relabelarla como «puesto»: hoy el primer candidato de un control sano luce 1,0.
- Mostrar junto a cada candidato el tejido alrededor (HU media y máxima del volumen reducido en 2 mm: «hueso» / «vaso») y el vóxel efectivo de la malla. Es lo que ha permitido aquí ver que dos tercios son hueso, y el clínico lo descartaría de un vistazo.
- Decir en la pantalla de detección que la lista son los 5 sitios con más curvatura de la malla y que no implica que haya aneurisma.

### 9.6 Lesiones pequeñas y blister

Ni el oráculo a resolución nativa las ve (0 de 15 blister entre 5 con la caja nativa, con o sin techo; miliares 1–2 de 12): un abombamiento de 2 mm sobre una carótida de 4 mm no forma una región de curvatura gaussiana con 8 puntos, y «menos de 8 puntos» es el motivo dominante que queda en la caja (24 de 41 fallos). Para ellas hace falta otro canal (diferencia de calibre local a lo largo de la línea central, o un detector sobre el volumen), no otro umbral. Es trabajo de investigación, no de ajuste, y conviene decirlo así en la documentación del producto: hoy la herramienta no detecta blister ni miliares.

### 9.7 Infraestructura

- La ingesta deja 1,8 GB por estudio; el grueso es `_volume.npy` en float32 en la instantánea. Guardarlo en int16 (la mitad) o no incluirlo en el guardado y reconstruirlo del DICOM al reanudar.
- La purga de sesiones vivas solo corre con el servidor arrancado: con el servidor parado se acumularon 35 GB.
- VTK/SimpleITK retienen ~300 MB por estudio en un proceso largo; el servidor en producción debería reiniciarse (o segmentar en un subproceso) cada N segmentaciones.

## 10. Lo que se ha cambiado en el código (sin commitear)

- `backend/scripts/eval_zenodo.py` + `backend/test_eval_zenodo.py` (7 tests): evaluación completa descrita en el apartado 3, con caché de malla y volumen reducido, `--set`, `--meshes-from`, `--shard`, `--limit` y `--summary`.
- `backend/scripts/zenodo_roi_oracle.py` + `backend/test_zenodo_roi_oracle.py` (4 tests): el oráculo de caja a resolución nativa, con y sin techo de HU.
- `backend/scripts/ingest_zenodo.py`: la carpeta por defecto del dataset es ahora `Archivos DICOM/` (donde está el zip completo extraído).
- `backend/services/aneurysm_detector.py`: traza opcional por región (`trace_regions`, `RegionTrace`), sin cambio de resultado (sesión anterior; 55 tests de regresión verdes).
- `backend/routers/patients.py`: borrar un paciente o un caso con confirmaciones de verdad de terreno ya no da 500 (sesión anterior; 2 tests).
- `README.md`: documentación de los tres scripts.
- Operativo: he ejecutado la purga de sesiones vivas caducadas que el servidor hace al arrancar (132 sesiones de 78 h, 35 GB) porque el disco estaba al 98 %. Los procesos de evaluación retienen ~300 MB por estudio (VTK/SimpleITK) y se reinician cada 8–15 estudios desde un lanzador; es el mismo motivo por el que el servidor conviene reiniciarlo tras muchas segmentaciones seguidas.

Ningún cambio toca el comportamiento de la app salvo el arreglo del borrado.

## Anexo: cómo repetir

```bash
cd ProspectiveWeb/backend
.venv/Scripts/python -u scripts/eval_zenodo.py --shard 0/2        # y 1/2 en otro proceso
.venv/Scripts/python scripts/eval_zenodo.py --summary
.venv/Scripts/python scripts/eval_zenodo.py --set min_mean_curv_radius=0.7 \
    --meshes-from data/zenodo_eval --out data/zenodo_eval_v1
.venv/Scripts/python -u scripts/zenodo_roi_oracle.py --radius 30
.venv/Scripts/python scripts/zenodo_roi_oracle.py --summary
```

Registros: `backend/data/zenodo_eval/<id>.json` (y `meshes/`, `volumes/`), `backend/data/zenodo_eval_v*/`, `backend/data/zenodo_roi/`. Todo gitignorado.
