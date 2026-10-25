# Pasada completa de los 172 estudios de Zenodo con la receta de los pasos 1–3 (2026-10-18)

Contexto: el informe del 12 de octubre midió Prospective tal cual sobre el dataset entero
(4 de 122 lesiones entre los 5 candidatos, dos tercios de los candidatos en hueso). Los
pasos 1, 2 y 3 (informes del 13 de octubre) se diseñaron y midieron sobre 16 estudios.
Este informe es la misma medida, con la receta completa, sobre los 172 estudios: 82 con
aneurisma (122 lesiones), 90 controles. Todo sigue sin commit.

## 1. Resumen

| | Base (12-10) | **Pasos 1–3 (18-10)** |
|---|---|---|
| Lesiones entre los 5 candidatos (lista oficial) | 4 | **23** |
| Lesiones entre los 10 / en la lista de 40 | 6 / 17 | **29 / 43** |
| Lesiones en el primer puesto | 0 | **4** (013, 028, 084, 108) |
| Estudios con aneurisma con alguna lesión entre los 5 (de 82) | 3 | **22** |
| Candidatos en hueso (HU máx ≥ 700), de 860 | 560 | **206** |
| · en los 90 controles (de 450) / con 3 o más en hueso / los 5 | 298 / 70 / 20 | **124 / 10 / 0** |
| · en los estudios con aneurisma (de 410) | 262 | **82** |
| Candidatos sobre vaso, controles / con aneurisma | 135 / 127 | **288 / 292** |
| Superficie anotada recuperada en la malla (mediana) / lesiones con < 50 % | 0,97 / 31 | **1,00 / 16** |
| Distancia de la lesión al candidato más cercano (mediana) | 20 mm | **13 mm** |
| Estudios con calibre y cociente encendidos | 1 | **40** |
| Candidatos por estudio | 5 en los 172 | 5 en los 172 |

Lo que dice el conjunto, más allá de la mejora:

1. **Hay dos poblaciones.** En los 40 estudios cuya malla pasa la prueba de árbol (pieza
   mayor ≤ 100 cm³ y ≤ 3 mm de espesor; 49 lesiones) la lesión está entre los 5 en 18
   casos y en la lista en 28. En los 132 que no la pasan (73 lesiones, 126 de ellos de
   cabeza y cuello) son 5 y 15. La diferencia es el tipo de examen, no el tamaño de la
   lesión: con cabeza sola, 12 de 38 lesiones entre 5; con cabeza y cuello, 11 de 84.
2. **Los sacos grandes han aparecido** (grandes 9 de 20 entre 5, gigantes 4 de 16; en la
   base 1 y 0), y **siempre por calibre o cociente**, nunca por la curvatura: la puerta de
   Gauss por percentil sigue viendo solo motas sobre ellos (§3.4).
3. **Blister y miliares siguen fuera**: 1 de 39 blister y 0 de 30 miliares entre los 5,
   con 29 de 30 miliares dentro de la malla. Los canales actuales no los ven.
4. **Los controles ya no apuntan al cráneo** (124 de 450 candidatos en hueso, ninguno con
   los 5), pero siguen dando 5 candidatos sobre vaso; la «confianza» mostrada sigue siendo
   el puesto. El criterio absoluto («ninguno») queda donde estaba: para después.

**Actualización 2026-10-19.** El experimento de §4.1 (los 132 estudios sin árbol con calibre
y cociente encendidos sobre las mallas ya guardadas) ha terminado y decide: con los canales
encendidos, en esos 132 estudios las lesiones entre los 5 pasan de 5 a 13 de 73, en lista de
15 a 24, y el hueso en controles baja de 112 a 79 de 415. Sumado a los 40 estudios árbol, que
no cambian, la pasada queda en **31 de 122 entre los 5** (de 23), **52 en la lista** (de 43)
y **163 candidatos en hueso de 860** (de 206). La regla está aplicada en el código
(§4.1); las cifras de la tabla y de §3 son las de la pasada del 18-10, anteriores a ella.

**Actualización 2026-10-20.** Con el recorte intracraneal de §4.4 (la malla se queda con sus
140 mm altos antes de detectar) la pasada medida de los 172 da **44 de 122 entre los 5** (de
31), **53 entre los 10**, **70 en la lista** y **36 de 82 estudios** con la lesión entre los
5; ganan 17 lesiones, pierden 4. Los controles siguen dando 5 candidatos (el hueso en
controles vuelve a 126 de 450): el recorte mejora el puesto, no da el «no hay nada». Siguiente
medida, aplicada y medida el mismo día: un suelo de HU (§4.5; ningún acierto por debajo de
−100 HU de media ni de 200 de máximo). **Pasada completa con el suelo: 45 de 122 entre los
5, 8 en primer puesto, 71 en la lista, 37 de 82 estudios; ninguna lesión baja de puesto.**
Es la cifra oficial a día de hoy.

**Actualización 2026-10-22.** Con la banda de la cabeza también en la segmentación (§4.8;
157 de los 172 estudios se segmentaban reducidos por 2 a 6, ahora por 1 a 3) la pasada
completa da **52 de 122 entre los 5** (de 45), **61 entre los 10**, **75 en la lista**, **12 en
primer puesto** (de 8), **45 de 82 estudios** (de 37) y **8 lesiones fuera de la malla** (de
16), a la mitad de tiempo por estudio (661 → 320 s). Las que bajan de puesto lo hacen por el
diezmado de la copia de curvatura sobre una malla de cabeza 2–8 veces mayor que su tope, no
por la malla (§4.8, punto 3): es el siguiente experimento. Los controles siguen con 5
candidatos. Es la cifra oficial a día de hoy.

**Actualización 2026-10-23.** El experimento del tope de la copia de curvatura (§4.9) está medido al doble y al triple sobre las mismas 172 mallas: **44 y 46 de 122 entre los 5** frente a 52, 67 y 69 en la lista, detección 104 y 146 s por estudio frente a 44. Recupera los sacos grandes por los canales de calibre (la copia de calibre cambia de fuente al subir el tope) y pierde los de menos de 10 mm por las dos vías; el tope se queda en 80 000 y la cifra oficial sigue siendo la del 22-10. Siguiente experimento sobre las mallas guardadas: la copia de calibre desde la malla completa con el tope de curvatura sin tocar.

**Actualización 2026-10-23 (tarde).** La copia de calibre desde la malla completa, aislada (§4.10 a): **51 de 122 entre los 5** frente a 52, misma lista y mismo top 10, 46 estudios frente a 45; entran los sacos grandes y trombosados (004, 086, 116_1) y salen pequeños y medianos (116_2, 144, 109, 018, 185). Reparto, no mejora: no se adopta sola. La regla de sacos de la máscara (§4.10 b) está medida en 7 estudios a nativo (026 del 0 al 49 %, 024 del 4 al 35 %, controles sin cambio), codificada con tests, y la pasada de segmentación de los 172 está en marcha (`zenodo_eval_full_p5_sacos`).

**Actualización 2026-10-24.** Pasada de segmentación de los 172 con la regla de sacos terminada (§4.10 b):
**fuera de la malla 8 → 5** (entran 026, 121 y 024, los grandes trombosados), **52 de 122 entre los 5** (igual),
entre 10 61 → 64, lista 75 → 78, 1.º 12 → 13, 46 de 82 estudios; controles 90/90 con 5; +6 % de segmentación.
Entran 026 (1.º), 121 (2.º) y 019 (37 → 4); salen 027, 033, 088 y 109 por candidatos nuevos de calibre. **Entra**:
cifra oficial 52 / 13 / 78 / 46 / 5 fuera. 093 sigue fuera (cáscaras parciales, máscara idéntica).

## 2. Cómo se ha medido

`backend/scripts/eval_zenodo.py` recorre el mismo camino que la API (carga, umbrales
automáticos, `segment_tubular` con máscara de hueso y banda nativa, `_detect_hits` con el
preset de TC: H·r ≥ 0,7 y orden por área) y guarda por estudio un JSON, la malla
(`meshes/<id>.vtp`) y el volumen reducido (`volumes/<id>.npy`). Lanzador
`backend/data/run_full_p3.ps1`: `--no-reuse --limit 6` por ronda (fuga de ~300 MB por
estudio), un solo proceso VTK a la vez, reanuda sola saltando los JSON con `status: ok`.
Salida `backend/data/zenodo_eval_full_p3` (12 GB). Resumen con `--summary`; tabla y
recuentos por lesión con `backend/scripts/zenodo_lesiones.py` (solo JSON, sin VTK).

Coste: del 14 al 18 de octubre con tres interrupciones (dos suspensiones del PC y una
muerte sin rastro); 0 errores. Por estudio, mediana 16 min: 11,4 min de segmentación
(máximo 47) y 2,2 min de detección (árbol 42 s; sin árbol 151 s, máximo 16 min sobre
2,5 M de vértices). El máximo de 3,5 h de un estudio es reloj de pared con el PC
suspendido. Es lo que tarda la app con una angio-TC de cabeza y cuello.

Comprobación de consistencia: las 13 lesiones de los 16 estudios del banco del paso 3
salen en el mismo puesto que en `zenodo_eval_p3` salvo 096 (7.ª → 2.ª) y 006
(11.ª → 10.ª); la malla se ha segmentado de nuevo y no es idéntica. Los 4 primeros puestos
y las 23 lesiones entre 5 no dependen de ese banco.

## 3. Resultados

### 3.1 Segmentación

| | |
|---|---|
| Factor de reducción | 1 en 15 estudios · 2 en 28 · 3 en 29 · 4 en 16 · 5 en 68 · 6 en 16 |
| Banda a resolución nativa | aplicada en los 157 estudios con factor > 1 |
| Vértices de la malla | mediana 1,07 M, máximo 2,53 M |
| Pieza mayor | mediana 196 cm³ (base: 760); en los 40 «árbol», 29 cm³ |
| Pasa la prueba de árbol | 40 de 172 (base: 0). No pasan: 124 por volumen (mediana 235 cm³, máximo 639), 8 por espesor > 3 mm |
| Lesiones con < 50 % de la superficie en la malla | 16 de 122 (base 31) |

Las 16 lesiones fuera de la malla: 026 (gigante fusiforme de basilar, factor 1, recall
0,02: sigue siendo la segmentación, ya conocida), 100 (gigante de basilar, factor 5), 121
(grande de basilar, factor 2), 105 (gigante calcificada, 0,47) y 12 medianas o miliares a
factores 3–6 en estudios de cabeza y cuello (015, 049, 050_2, 090_5, 092, 093_4, 102, 104,
111, 117_2, 154_2, 161). La banda nativa no las rescata porque no están en la máscara
gruesa de la que parte (vóxel de 1,5–3 mm): hay que mirarlas una a una.

### 3.2 Detección de las 122 lesiones

| Por tamaño | n | entre 5 | entre 10 | en lista de 40 | base: entre 5 / lista |
|---|---|---|---|---|---|
| miliar | 30 | 0 | 1 | 5 | 0 / 2 |
| medio | 56 | 10 | 14 | 23 | 3 / 10 |
| grande | 20 | 9 | 10 | 11 | 1 / 3 |
| gigante | 16 | 4 | 4 | 4 | 0 / 2 |

| Por tipo | n | entre 5 | entre 10 | en lista | base: entre 5 / lista |
|---|---|---|---|---|---|
| blister | 39 | 1 | 2 | 8 | 0 / 3 |
| sacular | 36 | 11 | 14 | 19 | 3 / 6 |
| fusiforme | 26 | 6 | 7 | 7 | 0 / 3 |
| bifurcación sin tipo | 21 | 5 | 6 | 9 | 1 / 5 |

| Por factor de reducción del estudio | lesiones | entre 5 | en lista | fuera de la malla |
|---|---|---|---|---|
| 1 | 18 | 6 | 10 | 1 |
| 2 | 37 | 8 | 13 | 2 |
| 3 | 33 | 8 | 13 | 3 |
| 4 | 8 | 0 | 0 | 3 |
| 5 | 12 | 1 | 3 | 4 |
| 6 | 14 | 0 | 4 | 3 |

Calcificadas: 20, 6 entre 5 (y ninguna más en lista), 4 fuera de la malla. Trombosadas:
22, 8 entre 5, 3 fuera.

**Motivos del fallo** (79 lesiones sin puesto; «región» = la región de curvatura más
cercana a la lesión):

| Motivo | n | Qué es |
|---|---|---|
| sin región a menos de un diámetro | 17 | 16 están fuera de la malla (§3.1); la otra, 163 (blister de 2,5 mm), tiene la región a 66 mm |
| curvatura media (H·r < 0,7) | 14 | en 13 de ellas H·r es NEGATIVO (§3.4) |
| menos de 8 puntos | 13 | 6 gigantes y 2 grandes de 20–35 mm con regiones de 4–6 puntos (la cúpula es plana para el percentil), y 5 de 3–8 mm a factor 2–5 |
| compacidad < 0,2 | 12 | valores 0,09–0,20; lesiones de 3–11 mm |
| tope de la lista de 40 | 11 | región válida de 10–27 mm² que el orden por área deja por detrás de 40 regiones mayores; no habría entrado en los 5 |
| fusionada con otra | 6 | 5 miliares y un blister a < 10 mm de otra lesión o de un candidato |
| fracción gaussiana positiva < 0,5 | 5 | |
| región válida perdida en el consenso | 1 | 082_3 (cuatro lesiones en el mismo estudio) |

### 3.3 Candidatos y controles

| | |
|---|---|
| Regiones de curvatura por malla / que pasan todas las puertas | mediana 1 720 / 40 (mínimo 16) |
| Candidatos en hueso por control | 0 en 18 controles · 1 en 34 · 2 en 28 · 3 en 6 · 4 en 4 · 5 en 0 |
| Tejido de los 450 candidatos de los controles | vaso 288 · hueso 124 · otro 38 |
| Tejido de los 410 candidatos de los estudios con aneurisma | vaso 292 · hueso 82 · otro 36 |
| Candidatos que son una lesión | 23 de 860 |

### 3.4 Dónde está el límite ahora

**Árbol frente a no árbol.** Estudios con aneurisma, por tipo de examen y por si la malla
pasa la prueba de árbol (lo que enciende calibre y cociente):

| | estudios | lesiones | entre 5 | en lista |
|---|---|---|---|---|
| cabeza sola, árbol | 21 | 30 | 10 | 18 |
| cabeza sola, no árbol | 4 | 8 | 2 | 3 |
| cabeza y cuello, árbol | 12 | 19 | 8 | 10 |
| cabeza y cuello, no árbol | 45 | 65 | 3 | 12 |

Los 132 estudios sin árbol tienen mallas de 0,4–2,5 M de vértices (mediana 1,2 M) con el
árbol del cuello entero, y en ellos solo corre la curvatura sobre la copia de 80 000
vértices. Simulación desde los JSON de qué pasaría con otro tope de volumen
(`MAX_TREE_VOLUME_MM3`, hoy 100 cm³, calibrado en 3DRA intracraneal):

| Tope de volumen | con espesor ≤ 3 mm: estudios que entran (con lesión) · lesiones · en lista · entre 5 | sin regla de espesor |
|---|---|---|
| 150 cm³ | +13 (7) · 8 · 0 · 0 | +29 (15) · 17 · 5 · 3 |
| 200 cm³ | +22 (10) · 14 · 1 · 0 | +46 (22) · 30 · 9 · 4 |
| 300 cm³ | +43 (15) · 23 · 4 · 1 | +87 (39) · 57 · 14 · 5 |
| ≥ 500 cm³ | +49 (15) · 23 · 4 · 1 | +132 (49) · 73 · 15 · 5 |

Subir solo el volumen no abre casi nada porque 83 de los 132 superan también los 3 mm de
espesor equivalente (venas y senos del cuello engordan la pieza). La simulación dice a
quién se le encenderían los canales, no si ayudaría: eso es el experimento de §4.1.

**Sacos grandes.** Las 13 lesiones de ≥ 16 mm que están entre los 5 lo están por calibre
o cociente; las 4 gigantes en lista (019, 031, 086_1, 112) son todas de estudios árbol.
Las gigantes que fallan lo hacen por «menos de 8 puntos» (6) o por curvatura media
negativa (4): la región de curvatura más cercana a una cúpula de 25–35 mm son motas de
4–6 puntos, porque el percentil 85 de Gauss equivale a un radio ≤ 1,3 mm. Confirma con
122 lesiones lo medido con 13 en el paso 3 (§5 bis de aquel informe). La puerta absoluta
`min_gauss_curvature` sigue sin adoptarse: en el paso 3 cada suelo cambiaba qué lesiones
salían y aquí el canal de calibre ya cubre las grandes cuando el árbol está encendido.

**H·r negativo.** En 18 lesiones la región de curvatura más cercana tiene curvatura media
negativa (006, 011_3, 025, 026, 029_1, 031, 088_1, 093_1, 095, 096, 099_2, 110, 113,
116_2, 116_3, 117_2, 161, 185); 13 de ellas son grandes o gigantes y fusiformes. Hipótesis
a comprobar sobre las mallas guardadas: no son normales invertidas sino el cuello o la
silla cóncava junto a una cúpula que el percentil no recoge (misma causa que el punto
anterior). Si fuera orientación de normales, afectaría a toda la malla y no solo a las
grandes.

**Tope de la lista.** Las 11 lesiones «por tope» tienen regiones válidas de 10–27 mm² que
quedan por detrás de 40 regiones más grandes: con el orden por área no habrían entrado en
los 5 aunque la lista fuera más larga. No es un parámetro que tocar; es que una región de
15 mm² no gana a los bultos de bifurcación de un árbol de cabeza y cuello.

**Pequeñas.** 30 miliares (29 en la malla): 7 sin región, 6 fusionadas con una vecina, 4
por compacidad, 3 por Gauss+, 2 por puntos, 2 por tope. 39 blister (diámetro mediano
3,6 mm): 8 en lista, 1 entre 5. Es el límite de la curvatura a 80 000 vértices y de la
fusión a 10 mm; no hay ajuste de puertas que lo cambie sin romper el resto (paso 3).

## 4. Decisiones y lo que sigue

### 4.1 Tope de árbol: experimento terminado y regla cambiada (2026-10-19)

`backend/scripts/exp_tree_gate.py` + `backend/data/run_tree_gate.ps1`: los 132 estudios
sin árbol, con las mallas y volúmenes de esta pasada (`--meshes-from`), con los dos topes
de `services.mesh_components` sin efecto solo en ese proceso. Salida
`backend/data/zenodo_eval_full_p3_tree`; los estudios con lesión fueron primero. Corrió del
18-10 a las 21:40 al 19-10 a las 18:49 (murió una vez con el apagado del PC y se reanudó
sola): 7,6 h de detección, 0 errores; ~4 min por estudio con lesión y 6–7 por control (mallas
de 1–2 M de vértices; el calibre corre sobre la copia de 40 000).

| 132 estudios sin árbol (49 con lesión, 83 controles; 73 lesiones) | Referencia (solo curvatura) | Calibre y cociente encendidos |
|---|---|---|
| Lesiones entre los 5 / entre los 10 / en la lista de 40 | 5 / 6 / 15 | **13 / 15 / 24** |
| Lesiones en primer puesto | 3 | 3 |
| Estudios con alguna lesión entre los 5 (de 49) | 5 | **10** |
| Candidatos en hueso en controles (de 415) / controles con 3 o más en hueso / los 5 | 112 / 9 / 0 | **79 / 4 / 0** |
| Candidatos en hueso en estudios con aneurisma (de 245) | 45 | **35** |
| Detección mediana, controles / con lesión | 176 s / 95 s | 238 s / 108 s (máximo 790 s) |
| Candidatos por estudio | 5 | 5 |

Qué se mueve, lesión a lesión (clave = fichero STL):

- **Ganan 14.** Casi todas grandes o fusiformes que la curvatura no veía y que entran por
  los canales nuevos: 025 (fusiforme 25 mm), 116_1 (fusiforme 28 mm) y 154_1 (sacular
  30 mm) pasan de fuera de la lista al 2.º puesto por calibre; 088_1 (sacular 20 mm), 088_2,
  095 (fusiforme 15 mm), 099_2 (sacular 20 mm) y 099_3 entran 3.ª por cociente; 016_1 sube
  de 2.ª a 1.ª y 016_2 de 10.ª a 3.ª; 099_1 y 116_2 entran 9.ª; 091 (fusiforme 30 mm) 14.ª
  por calibre; 110 (sacular 25 mm) 18.ª por cociente.
- **Pierden 9**, todas lesiones que solo veía la curvatura y que ahora comparten los puestos
  con dos canales más: 089 (fusiforme 8 mm) sale de los 5 (5.ª → 13.ª), 028 baja de 1.ª a
  2.ª; 087 (12 → 22), 035_4 (13 → 25), 035_2 (18 → 30), 018 (23 → 35), 093_3 (24 → 35),
  090_4 (28 → 40) y 090_3 (34 → fuera) ya estaban fuera de los 5.
- **Las 48 que siguen fuera fallan por lo mismo que antes** (14 sin región, 8 por motas, 8
  por curvatura media, 8 por tope, 4 compacidad, 4 pgf, 2 fusionadas): los canales nuevos
  no las tocan; los sacos ≥ 10 mm que faltan (gigantes de basilar fuera de la malla, H·r
  negativo) siguen en §3.4.
- Por tamaño, entre los 5: medias 5 de 30, grandes 5 de 11, gigantes 2 de 11, miliares 1
  de 21. Por tipo: saculares 4 de 17, fusiformes 4 de 18, blister 2 de 25.

**Decisión y cambio aplicado.** El riesgo que justificaba la puerta (medir cráneo con el
calibre) desapareció con el paso 2: el hueso ya no está en la máscara. Así que los canales
geométricos dejan de apagarse por volumen o espesor de la pieza mayor; lo que sigue
apagándolos es el tamaño de la copia (`MAX_VERTS_GEOMETRIC`, 40 000) y una pieza mayor
menor de 20 mm (`MIN_TREE_EXTENT_MM`). No se ha subido el tope «por modalidad» porque en
3DRA la malla ya pasa la prueba y el resultado no cambia (regresión XA verde, Case 3 e
IM_0055 en el mismo puesto). La prueba de árbol de `mesh_components` sigue mandando en
«quedarse con el árbol» del editor de malla, donde en un bloque no limpia nada.

- `backend/services/aneurysm_consensus.py`: `_geometric_channels_apply` mira el tamaño y la
  diagonal de la pieza mayor, no `looks_like_tree`; comentarios con la medida.
- `backend/routers/detect.py`: comentario de `tree_poly`.
- Tests: `backend/test_canales_en_bloque_ct.py` (nuevo, 3), `test_consensus_and_plane.py`
  (el test del bloque invertido y uno nuevo para la mota), `test_paso2_hueso_ct.py` sin
  cambios. Pasan: paso 2 + componentes + paso 3 + experimento (55), consenso (35), regresión
  XA (6, 7 min).

Lo que NO está medido: una pasada entera con la regla nueva (la cifra de 31/122 es la suma
del experimento sobre mallas guardadas más los 40 árbol sin cambio; la detección es
determinista sobre la misma malla, así que debe coincidir, pero no se ha repetido). El
recorte a la región intracraneal queda como siguiente medida para los 12 medianos y
miliares fuera de malla y para el cuello que compite por los puestos (089, 028).

### 4.2 Lo demás

- **Sacos grandes / `min_gauss_curvature`**: no se adopta (§3.4). El experimento 4.1 cubre
  las grandes y fusiformes de los estudios sin árbol por calibre y cociente; lo que queda
  fuera son las gigantes de basilar sin malla y las de H·r negativo.
- **H·r negativo**: comprobar la hipótesis del cuello cóncavo en 096 y 110 (saculares de
  20–25 mm, recall 1,0) sobre sus `.vtp`, con VTK, después del experimento.
- **Fuera de la malla**: 026 y 100 (gigantes de basilar) son la segmentación conocida; las
  12 medianas y miliares de cabeza y cuello, una a una, antes de tocar la banda.
- **Tope de la lista**: nada que cambiar.
- **Calcificadas**: 6 de 20 entre 5; 4 fuera de la malla por la máscara de hueso (coste ya
  conocido del paso 2). Sin cambio.
- **Blister y miliares**: fuera del alcance de los canales actuales; no se tocan puertas.
- **Comprobación en la app**: pendiente, con un estudio del dataset por la interfaz
  (upload, segmentación, detección), para ver que la pantalla cuenta lo mismo que el banco.
- **Commit**: decisión del usuario; por lista explícita de ficheros, nada de `data/`.

### 4.3 Criterio absoluto en controles (2026-10-19): medido, y no lo hay

Pregunta: ¿algún umbral sobre lo que trae cada candidato permitiría decir «ninguno» en un
control sin perder lesiones? Medido desde los JSON sobre el estado «regla nueva» (40 árbol +
132 del experimento): 860 candidatos, 28 de ellos aciertos (lesión entre los 5), 450 en los
90 controles.

| Lo que trae el candidato | Aciertos (28) | Controles (450) |
|---|---|---|
| Diámetro, mediana | 9,4 mm | 12,8 mm |
| HU en el sitio / HU máx., mediana | 181 / 352 | 200 / 504 |
| Tejido hueso | 5 | 91 |
| Puntuación de la región de curvatura, mediana | 0,49 | 0,46 |
| Dos o más canales coinciden | **17 (61 %)** | **56 (12 %)** |
| · curvatura + canal geométrico | 7 | 11 |
| · calibre + cociente | 10 | 45 |

Ningún umbral de diámetro, HU, tejido o puntuación separa: las distribuciones se solapan
en todos. Lo único que separa es la coincidencia de canales, y como criterio de estudio no
llega: 51 de 90 controles no tienen ningún candidato con dos canales, pero 47 de los 82
estudios con aneurisma sí lo tienen y solo en 16 es la lesión. Filtrar por coincidencia
dejaría 15 de 28 aciertos.

También se simuló reordenar la lista poniendo primero los sitios con dos familias de
canales: entre los 5 bajan de 31 a 25 (027, 036, 086, 095, 115, 126 salen). Ordenar por
número de canales deja 30 entre los 5 y sube los primeros puestos de 4 a 11, pero saca a
095 y 116_1 y mete a 006 y 116_2: cambia qué lesiones salen, no cuántas. No se adopta.

Decisión: la pantalla sigue enseñando los 5 con la confianza por puesto más 0,10 por
familia que coincide (`hit_confidence`), que es lo que los datos sostienen: la coincidencia
es una señal por candidato (5 veces más frecuente en un acierto), no un veredicto por
estudio. Un «ninguno» fiable necesitaría otra señal, no otro umbral sobre estas.

### 4.4 Recorte intracraneal (2026-10-19): medido desde los JSON, en pasada

Dónde están las cosas a lo alto de la malla (eje z, el de corte de la serie; identidad en
los 172 estudios), medido desde el techo de la malla:

| mm por debajo del techo | n | mín | p5 | mediana | p95 | máx |
|---|---|---|---|---|---|---|
| Las 122 lesiones anotadas | 122 | 9 | 19 | 85 | 112 | **121** |
| Aciertos (lesión entre los 5) | 28 | 17 | 21 | 84 | 114 | 115 |
| Candidatos en los 90 controles | 450 | 42 | 123 | **284** | 354 | 424 |
| Candidatos falsos en estudios con aneurisma | 382 | 4 | 55 | 190 | 345 | 388 |

Alto de la malla: cabeza sola 141 mm de mediana (91–229); cabeza y cuello 351 (96–432):
llevan el cuello entero y a menudo el cayado. Las dos lesiones más hondas (087, RMCA, y 098,
RICA, a 120–121 mm) son de estudios de cabeza y cuello. A menos de 130 mm del techo hay solo 26 de los 450
candidatos de control; a más de 140 mm están 415 de 450 (92 %) y 239 de los 382 falsos de
los estudios con aneurisma (63 %).

Simulación desde las listas largas de 40 (quitar los candidatos a más de D mm del techo, sin
volver a detectar), estado «regla nueva»:

| D | entre los 5 | entre los 10 | 1.º | perdidas | controles con < 5 candidatos |
|---|---|---|---|---|---|
| hoy | 31 | 38 | 4 | – | 0 de 90 |
| 130 mm | 40 | 47 | 16 | 0 | 56 |
| **140 mm** | **39** | **47** | **13** | **0** | **47** (1 sin ninguno) |
| 150 mm | 39 | 47 | 12 | 0 | 37 |
| 170 mm | 36 | 47 | 9 | 0 | 23 |

Entran en los 5 con 140 mm: 006 (10.ª → 1.ª), 110 (18.ª → 1.ª), 089 (13.ª → 2.ª), 099_1
(9.ª → 2.ª), 087 (22.ª → 3.ª), 035_4 (25.ª → 4.ª), 090_4 (40.ª → 4.ª), 091 (14.ª → 4.ª): las
que el cuello desplazaba. 140 mm deja 19 mm de margen sobre la lesión más honda; 130 daba un
puesto más con 9 mm de margen y no se toma.

**Cambio aplicado:** `backend/services/head_crop.py` (`crop_to_head`): antes de detectar, la
malla se recorta a los 140 mm altos, medidos desde el percentil 99,5 de z (una mota de ruido
por encima de la cabeza no sube el corte; errar el techo por abajo es seguro, por arriba no).
Si la malla no llega a esa altura (3DRA, cabeza sola) es el mismo objeto y la detección es la
de antes (regresión XA verde). Lo aplica `routers/detect.py::_detect_hits`, así que vale para
la API y para el banco; el registro del banco guarda `head_crop`. Tests en
`backend/test_head_crop.py` (5). Asume que el eje z de la malla es el superior-inferior
(serie axial), documentado en el módulo.

**Pasada hecha (20-10, 12:00):** los 172 con la regla de los canales y el recorte, sobre
las mallas guardadas (`backend/data/run_crop_p3.ps1` → `zenodo_eval_full_p3_crop`; ~14 h con
un apagado del PC por medio; detección 44 s de mediana frente a 132, porque queda el 27 % de
los puntos de mediana). Es una pasada medida, no una suma. Comparada con la del 18-10 y con
el estado «regla nueva» (18-10 más el experimento de §4.1, que es lo que había antes del
recorte):

| | Pasada 18-10 | Regla nueva (suma) | **Regla nueva + recorte** |
|---|---|---|---|
| Lesiones entre los 5 (de 122) | 23 | 31 | **44** |
| Entre los 10 | 29 | 38 | **53** |
| En la lista de 40 | 43 | 52 | **70** |
| En primer puesto | 4 | 4 | 6 |
| Estudios IA con la lesión entre los 5 (de 82) | 22 | 27 | **36** |
| Medianas entre los 5 (de 56) | 10 | 12 | 19 |
| Grandes (de 20) | 9 | 12 | 15 |
| Gigantes (de 16) | 4 | 6 | 8 |
| Miliares (de 30) | 0 | 1 | 2 |
| Blister entre los 5 (de 39) | 1 | – | 4 |
| Candidatos en hueso (de 860) | 206 | 163 | 224 |
| Hueso en controles (de 450) | 124 | 91 | 126 |
| Controles con menos de 5 candidatos | 0 | 0 | 0 |

Ganan 17 lesiones y pierden 4. Ocho de las que entran no estaban ni en la lista de 40 (002,
014, 083 → 1.ª, 093_2, 105 gigante calcificada, 116_3, 130, 163 miliar → 1.ª); el resto
eran las que el cuello desplazaba (006 10.ª → 2.ª, 087 22.ª → 3.ª, 089 13.ª → 3.ª, 091 14.ª →
2.ª, 099_1, 110 18.ª → 3.ª, 116_2, 120, 093_3). Pierden 028 (2.ª → 10.ª), 084 (1.ª → 9.ª),
095 (3.ª → 9.ª) y 086_1 (5.ª → 7.ª).

**Por qué pierden las que pierden.** No es el corte: en las cuatro la lesión queda dentro de
la ventana con margen (028 a 29 mm del corte, 084 a 60 mm; 086 mide 141 mm y el recorte quita
0,4 mm, es ruido de orden). Lo que cambia es la detección de curvatura: la copia de curvatura
se diezma a 80 000 vértices desde la malla recortada, así que la cabeza se ve con 3–4 veces
más resolución (028: 1,05 M → 262 k puntos, diezmado 13× → 3×) y los percentiles de Gauss
(85) y de curvatura media (75) se recalculan solo sobre cabeza. Ese mismo efecto es el que
hace que la curvatura vea 30 lesiones en lista en vez de 24, así que es neto positivo y el
diezmado no se toca.

**Lo que la simulación no veía: los controles siguen con 5 candidatos.** El detector rellena
los cinco huecos con lo que queda de malla, que es cabeza con hueso, y por eso el hueso en
controles vuelve a 126 (la regla nueva lo había bajado a 91). El recorte mejora el puesto de
las lesiones y no da la señal de «aquí no hay nada». Medido sobre los 860 candidatos de esta
pasada, sí hay un suelo que no pierde aciertos: ningún acierto tiene HU medio por debajo de
−74 ni HU máximo por debajo de 251, mientras que 38 candidatos de control y 12 falsos de
estudios IA están por debajo de −100 HU medio (aire, grasa) y 6 + 9 por debajo de 200 HU
máximo. Quitar «HU medio < −100 o HU máximo < 200» deja 30 de los 90 controles con menos de
5 candidatos sin perder ningún acierto; es una señal modesta y es la siguiente medida a probar
(queda sin aplicar). El tejido no separa: 45 de los 51 aciertos están en «vaso», pero
también 251 de los 450 candidatos de control.

**Decisión:** el recorte se queda (ya está en la API y en el banco). La cifra de referencia
pasa a ser **44 de 122 entre los 5, 53 entre los 10, 70 en la lista, 36 de 82 estudios** con
la lesión entre los 5, 224 candidatos en hueso de 860; la pasada de confirmación de la regla
de los canales sola ya no hace falta, esta la incluye.

### 4.5 Suelo de HU (2026-10-20): aplicado

Medido sobre los 860 candidatos de la pasada con recorte (§4.4), en una bola de 2 mm del
volumen con el que se segmentó:

| | Aciertos (a < 10 mm de una lesión) | Falsos en estudios IA | Candidatos de control |
|---|---|---|---|
| n | 51 | 359 | 450 |
| HU medio mínimo | **−74** (086_1, gigante trombosada) | | |
| HU máximo mínimo | **251** | | |
| HU medio < −100 | 0 | 12 | 38 |
| HU máximo < 200 | 0 | 9 | 6 |

Lo que está por debajo de −100 HU de media es aire de los senos o grasa orbitaria; lo que no
llega a 200 HU de máximo son partes blandas sin contraste. Ni el tejido (45 de 51 aciertos en
«vaso», pero también 251 de 450 candidatos de control) ni ningún otro umbral separan (§4.3).

Simulado con los volúmenes guardados sobre las listas de 40 de la pasada con recorte, dos
formas de aplicar el suelo «HU medio < −100 o HU máximo < 200»:

| | Entre los 5 | 1.º | Controles con < 5 | Aciertos perdidos |
|---|---|---|---|---|
| Hoy (§4.4) | 44 | 6 | 0 de 90 | – |
| Quitar de la lista y rellenar los 5 | 45 | 8 | 0 | 0 |
| Quitar solo de los 5, sin rellenar | 44 | 6 | 30 | 0 |

Rellenar es lo honesto: un candidato en aire no es un aneurisma, y el siguiente de la misma
lista ordenada ocupa su sitio (017_1 entra 5.ª; 088_1 y 083 ganan el primer puesto). No
rellenar daría «menos de 5» en 30 controles, pero sería un artefacto de la lista, no una
señal de que no hay nada: el veredicto por estudio sigue sin existir.

**Cambio aplicado:** `backend/services/hu_floor.py` (`drop_air`, `HU_FLOOR_MEAN = −100`,
`HU_FLOOR_MAX = 200`, bola de 2 mm o 1,5 espaciados). `routers/detect.py::_detect_hits` pide
al consenso el doble de sitios, quita los que están en aire con el volumen de la sesión (el
cacheado de la morfometría, mismo marco índice × espaciado) y se queda con los 5 primeros; el
banco le pasa el volumen de la segmentación. Solo en TC: en 3DRA los valores no son HU. Sin
volumen no cambia nada. El registro del banco guarda `hu_floor` (cuántos miró, cuántos quitó
y sus HU). Tests `backend/test_hu_floor.py` (6); regresión XA sin cambio (6). Comprobado por
el camino real en 028: de 23 sitios salen 7 (de −168 a −433 HU de media) y la lesión sube
del 10.º al 7.º puesto.

**Pasada medida** (`backend/data/zenodo_eval_full_p3_hu`, 172/172, 0 errores, 20-10 de
14:21 a 21:14 con el lanzador `run_hu_p3.ps1` sobre las mallas y volúmenes guardados;
detección 42 s de mediana, 3 min por estudio con la carga). La cifra oficial pasa a ser esta:

| | Recorte (§4.4) | Recorte + suelo de HU |
|---|---|---|
| Lesiones entre los 5 (de 122) | 44 | **45** |
| Entre los 10 | 53 | 53 |
| En la lista de 40 | 70 | 71 |
| En primer puesto | 6 | **8** (025, 031 suben de 2.ª) |
| Estudios con la lesión entre los 5 (de 82) | 36 | 37 |
| Lesiones que bajan de puesto | | **0** |
| Candidatos de control por estudio | 5 | 5 (90 de 90) |
| Candidatos en hueso (de 860) | 224 | 230 |
| Candidatos en «otro» tejido (de 860) | 118 | 82 |

El suelo miró 7 647 sitios (el doble de la lista en cada estudio) y quitó 1 148 en 155 de los
172 estudios: HU medio mediano de los quitados −212 (de −2 001 a 173). Exactamente la
simulación: 22 lesiones suben de puesto y ninguna baja; 017_1 entra 5.ª y 082_3 entra en la
lista. Por tamaño entre los 5: miliares 2/30, medianas 20/56, grandes 15/20, gigantes 8/16;
por tipo: blister 4/39, saculares 22/36, fusiformes 13/26, otras 6/21. Los motivos de fallo
de las 51 que siguen fuera de la lista no cambian (sin región 12, fusionadas 11, compacidad
11, curvatura media 9, pocos puntos 6, tope 1), porque el suelo actúa después del detector.
Los controles siguen con 5 candidatos: el suelo limpia la lista, no da el «no hay nada».

### 4.6 El «H·r negativo» de los sacos grandes (2026-10-20): comprobado, no es un fallo de signo

Hipótesis pendiente desde §3.4: 18 lesiones, casi todas grandes o gigantes, tenían como
región más cercana una con curvatura media negativa (H·r de −0,8 a −0,9), y se sospechó del
cuello cóncavo o de normales invertidas. Medido sobre las mallas de curvatura reales de 096
(saco de 21 mm, trombosado y calcificado) y 110 (25 mm, ídem; vóxel de 1,5 × 2,6 mm), por
el mismo camino que el detector (recorte, diezmado a 80 000, 10 pasadas de suavizado,
normales, `vtkCurvatures`), y una esfera de referencia:

| | Esfera r = 10 | 096, puntos del saco (994) | 110, puntos del saco (1 909) |
|---|---|---|---|
| H mediana | +0,101 (1/r = 0,100) | +0,21 (1/R = 0,094) | 0,00 (1/R = 0,079) |
| H > 0 | 100 % | 87 % | 50 % |
| Normales hacia fuera | 100 % | 83 % | 88 % |
| K mediana | 0,0101 (1/r² = 0,0100) | 0,0012 | −0,013 |
| Puntos con K ≥ percentil 85 | – | **2 %** | **6 %** |
| Umbral K del percentil 85 | – | 0,28 (radio ≈ 1,9 mm) | 0,22 (radio ≈ 2,1 mm) |

El signo está bien (la esfera da +1/r y +1/r²) y las normales apuntan hacia fuera. Lo que
pasa es de escala: la puerta de Gauss del percentil 85 solo deja pasar lo que tiene un radio
de unos 2 mm, y una cúpula de 10 mm de radio tiene K = 0,009, treinta veces por debajo. Del
saco de 096 solo pasan el 2 % de los puntos: motas de 20 puntos en las irregularidades de la
luz trombosada, que son tanto cóncavas como convexas, y la mota más cercana a la lesión
resultó cóncava. En 110 la luz segmentada de un saco trombosado con vóxel grueso ni siquiera
es convexa (la mitad de los puntos con H < 0). El H·r negativo es el síntoma, no la causa.

**Decisión:** la curvatura no se toca para esto. Esos sacos son de calibre y cociente, que ya
los dan (con el recorte, 096 es 2.ª por calibre y 110 3.ª por calibre y cociente). Bajar el
percentil de Gauss para que entre la cúpula ya se midió en §4.2 (`min_gauss_curvature`) y
abre la puerta a todo el vaso.

### 4.7 Aviso de `vtkMassProperties` (2026-10-20): quitado

`vtkCleanPolyData` fusiona los puntos coincidentes de cada región y convierte el triángulo
que se queda sin área en una línea; `vtkMassProperties` avisaba «Input data type must be
VTK_TRIANGLE not 3» una vez por región (cientos por detección en una angio-TC). Ahora la
región se queda solo con sus polígonos (`aneurysm_detector._clean_region`): los puntos, sus
arrays y el área son los mismos; los avisos, cero. Test `backend/test_region_sin_lineas.py`
(2); detector (23) y regresión XA (6) sin cambio.

### 4.8 La banda de la cabeza antes de segmentar (2026-10-20): medida y aplicada

Con el recorte (§4.4) y el suelo (§4.5) el detector ya trabaja solo sobre la cabeza, pero la
segmentación seguía mirando el volumen entero: 145 de los 172 estudios son angio-TC de
cabeza y cuello de 350 mm de alto, 157 superan el tope de 90 millones de vóxeles y se
segmentan reducidos por 2 a 6 (`_half_factor`: eje mayor / 256, y el eje mayor es el alto),
y 16 lesiones no llegan a la malla (superficie recuperada < 50 %). Medido sobre los
registros y los volúmenes reducidos guardados:

| | |
|---|---|
| Techo del cráneo en el volumen (primer corte desde arriba con ≥ 2 cm² > 200 HU) | coincide con la piel: mediana 0 mm, máximo 14 |
| Profundidad de las 122 lesiones bajo ese techo | mínima 54 mm, mediana 94, **máxima 120** (098, 110, 011) |
| Estudios en los que el vaso más alto queda > 40 mm bajo el cráneo | 17 (hasta 106 mm: solo se segmentó el polígono) |
| Banda de 150 mm bajo el techo: vóxeles a segmentar | 39,1 G → 18,8 G (**48 %**), ninguna lesión fuera |
| Factor de reducción, hoy → con la banda | {1: 15, 2: 28, 3: 29, 4: 16, 5: 68, 6: 16} → **{1: 54, 2: 97, 3: 21}** |
| Lesiones fuera de la malla cuyo estudio gana resolución | **13 de 16** |

La banda de 150 mm no es casual: a 0,3 mm de corte son 500 cortes, por debajo de los 512
del plano, así que el factor lo decide el plano (2) y no el alto; con 160 mm, 101 estudios
pasarían a factor 3. El techo se busca por hueso y no por piel porque un reposacabezas o
una espuma pasan de −300 HU; medido, hueso y piel coinciden.

**Cambio aplicado:** `backend/services/head_band.py` (`head_band`: solo TC, 150 mm bajo el
techo del cráneo, sin efecto si el volumen es más bajo o no hay hueso) y
`routers/segment.py::segment_tubular`: segmenta `volume[z0:]`, decide la resolución con los
vóxeles de la banda y devuelve la malla trasladada al marco del volumen entero, así que el
visor, la morfometría y el suelo de HU no cambian; `info["head_band"]` lo registra y, con
`keep_volume`, `info["seg_origin_mm"]` dice dónde empieza el volumen reducido. El suelo de HU
y el banco aceptan ese origen (`hu_stats(..., origin)`, `drop_air(..., origin)`,
`_detect_hits(volume=(vol, esp, origen))`); el banco guarda por estudio el volumen de la banda
a ≤ 40 millones de vóxeles (`segment.hu_volume`) en vez del reducido entero. Tests
`backend/test_head_band.py` (10, con la malla en el mismo sitio con y sin banda),
`test_hu_floor.py` (8), tubular (33) sin cambio. La pasada completa con la banda es de
segmentación (la cara, 11 min por estudio hasta ahora): `backend/data/run_band_p4.ps1` →
`data/zenodo_eval_full_p4_band`; lo que se mide es lesiones fuera de la malla (16 → ?),
superficie recuperada, factor y minutos por estudio, y los puestos.

**Pasada medida (2026-10-22, `data/zenodo_eval_full_p4_band`, 172/172, 0 errores).** La banda
hace lo que se le pidió a la segmentación y, de paso, mejora los puestos. Frente a la pasada
del suelo de HU (§4.5, la cifra oficial hasta hoy):

| | Suelo de HU (20-10) | **Banda (22-10)** |
|---|---|---|
| Lesiones entre los 5 / entre los 10 / en la lista de 40 | 45 / 53 / 71 | **52 / 61 / 75** |
| Lesiones en el primer puesto | 8 | **12** |
| Estudios con alguna lesión entre los 5 (de 82) | 37 | **45** |
| Lesiones fuera de la malla (superficie recuperada < 50 %) | 16 | **8** |
| Superficie recuperada (mediana) | 0,997 | 0,997 |
| Factor de reducción | {1: 15, 2: 28, 3: 29, 4: 16, 5: 68, 6: 16} | **{1: 54, 2: 103, 3: 15}** |
| Segmentación por estudio (media / mediana) | 661 / 683 s | **320 / 340 s** |
| Detección por estudio (media) | 44 s | 49 s |
| Candidatos en hueso (HU máx ≥ 700), de 860 / en controles, de 450 | 230 / 131 | **167 / 88** |
| Controles con 5 candidatos | 90 de 90 | 90 de 90 |

Suben de puesto 30 lesiones y bajan 22; entran entre los 5 trece y salen seis. Por grupos
(entre 5 · en lista · fuera de la malla, suelo → banda):

| Grupo | n | Entre 5 | En lista | Fuera de la malla |
|---|---|---|---|---|
| Con trombo | 22 | 12 → 12 | 15 → 15 | 3 → 4 |
| Sin trombo | 100 | 33 → **40** | 56 → 60 | 13 → **4** |
| < 5 mm | 41 | 2 → 5 | 16 → 16 | 4 → 1 |
| 5–10 mm | 32 | 13 → 12 | 20 → 21 | 5 → 1 |
| 10–25 mm | 33 | 21 → **25** | 24 → 27 | 3 → 4 |
| ≥ 25 mm | 16 | 9 → 10 | 11 → 11 | 4 → 2 |

Y con las clases del conjunto (banda): medianas 22 de 56 entre 5 y 39 en lista; grandes 18
de 20 y 18; gigantes 8 de 16 y 10; miliares 4 de 30 y 8. Saculares 20 de 36, fusiformes 15 de
26, otras 12 de 21, blister 5 de 39. Los motivos de fallo que quedan: compacidad 12, curvatura
media 8, puntos 7, tope 7, fusión 7, sin región 4, tamaño 2.

Lo que la pasada enseña, lesión por lesión:

1. **La malla recupera 11 de las 16 lesiones que faltaban** (015, 049, 050_2, 090_5, 093_4,
   102, 105, 111, 117_2, 154_2, 161): todas en estudios que pasan de factor 4–6 a 2–3. Cinco
   siguen fuera en las dos pasadas (026, gigante de 50 mm; 092 y 104, sacos de 4 y 8 mm con
   el estudio a factor 2 o 3 también con la banda; 100 y 121, trombosados con 68 y 26 % de
   pared por encima de 150 HU) y tres se pierden nuevas: 024, 093_1 y 093_2.
2. **El trombo explica la malla, no el puesto.** En las 22 lesiones trombosadas la angio-TC
   enseña solo la luz; medido el HU de la pared anotada en el volumen de la banda, la
   fracción de pared por encima de 150 HU va del 26 % (121) al 87 % (099_1) y se correlaciona
   0,48 con la fracción de pared que toca la malla. Las de trombo grueso se quedan fuera
   (024: pared a 2,7 mm de la luz, más que la tolerancia), pero el puesto no depende del
   trombo: 025 y 037, trombosadas con un 40 % de pared por encima de 150 HU, salen 1.ª y 2.ª,
   y las 12 trombosadas entre los 5 son las mismas en las dos pasadas. Además, la superficie
   «recuperada» de 024 y 093_1 en las pasadas gruesas (0,99 y 1,00) era un artefacto: a
   factor 2–3 el desenfoque hacía que la malla siguiera la pared anotada; a nativo sigue la
   luz, que es lo que la imagen tiene.
3. **Las que bajan de puesto bajan por el diezmado de la copia de curvatura, no por la
   malla.** 004 (7.º → fuera), 019 (5.º → 37.º), 028 (7.º → fuera), 030 (3.º → fuera), las tres
   pequeñas de 035, 087 (3.º → fuera), 098 (15.º → fuera), 083 (1.º → 6.º) y 013 (1.º → 4.º)
   tienen la superficie recuperada igual (≥ 0,98) en las dos pasadas. Lo que cambia es la
   malla de la cabeza: con la banda tiene 133 000–650 000 vértices, de 2 a 8 veces el tope de
   80 000 de la copia de curvatura (`_CURVATURE_MAX_VERTS`), y la región de la lesión se queda
   con menos puntos (004: 42 → 14; 019: 79 → 25; 028: 177 → 82), que es justo lo que las
   puertas de puntos, compacidad y tope penalizan. Es una sola hipótesis para las 9, y se
   puede medir sobre las mallas guardadas sin volver a segmentar: siguiente experimento,
   tope a 160 000 y a 240 000.
4. **Los controles no cambian**: 90 de 90 siguen con 5 candidatos, con menos hueso (88 de 450).
   La banda mejora dónde mira el detector, no da el «no hay nada» (§4.3).
5. **093: dónde se pierden los dos sacos nuevos (medido fase a fase).** El estudio tiene cinco
   lesiones; a nativo la malla pierde 093_1 (14,5 mm, trombosado) y 093_2 (11,3 mm, 235 HU),
   que la pasada gruesa «tenía». Reproducidas las fases de `build_vascular_mask` sobre la
   banda del 093 a nativo (252 × 512 × 512, mismos parámetros que `segment_tubular`), la
   fracción de puntos de cada STL (pared y un 60 % hacia el centro) que cae en cada fase:

   | Lesión | mm | Núcleo M0 | Puerta V ≥ p40 | Tubo | Final | Pasada |
   |---|---|---|---|---|---|---|
   | 093_1 | 14,5 | 54 % | 9 % | **0 %** | **0 %** | 0,00 |
   | 093_3 | 13,2 | 57 % | 15 % | 15 % | 57 % | 0,99 (2.º) |
   | 093_2 | 11,3 | 61 % | 11 % | **0 %** | **0 %** | 0,07 |
   | 093_4 | 5,1 | 60 % | 58 % | 58 % | 60 % | 1,00 |
   | 093_5 | 3,6 | 64 % | 60 % | 60 % | 64 % | 1,00 |

   Los cinco sacos están en el núcleo (54–64 %, lo mismo que los que sí salen) y su
   componente de M0 toca una semilla, así que ni el umbral ni la máscara de hueso los
   quitan. Se pierden en la **puerta de tubularidad**: un saco de 11–15 mm es una bola, no
   un tubo, y solo el 9–11 % de sus puntos pasa V ≥ p40; con ningún punto en el tubo, la
   recuperación de 3 mm no llega (093_3 entra al tubo por un 15 % y de ahí la recuperación
   lo completa). La pasada gruesa los «tenía» por otra razón: a factor 3 con la regla de
   hueso gruesa (1 200 HU sin margen) la máscara del 093 era de 373 cm³ con 177 semillas
   (27 cm³ y 17 a nativo), un bloque con la base del cráneo dentro, no un árbol; la
   superficie recuperada venía de ese bloque. Es el mismo límite del paso 2 del plan (sacos
   grandes y calcificados): la recuperación necesita una regla para componentes del núcleo
   pegados al tubo por el cuello aunque superen los 3 mm, con el veto de lámina delante.
   Candidatos del mismo tipo: 024 (trombosado, 0,33) y, de las cinco que faltan en las dos
   pasadas, 026 (50 mm) y 121.

Es la **cifra oficial a día de hoy: 52 de 122 entre los 5, 12 en primer puesto, 75 en la lista,
45 de 82 estudios, 8 fuera de la malla.** La pasada se hizo en rondas de 6 estudios
(`backend/data/run_band_p4.ps1`, logs `band_p4_runner.log` y `zenodo_eval_full_p4_band.r<n>.log`)
y murió tres veces por la suspensión del PC (el proceso en segundo plano no sobrevive a la
suspensión; el registro del sistema lo confirma), por lo que los segundos por estudio llevan
algo de ruido de la reanudación; el runner continúa donde iba.

### 4.9 El tope de la copia de curvatura (2026-10-22/23): medido al doble y al triple, descartado

La hipótesis del §4.8 (punto 3) era que las 9 lesiones que bajan de puesto con la banda lo hacen
porque la malla de la cabeza a nativo tiene de 133 000 a 650 000 vértices (tras el recorte
intracraneal: 9 estudios por debajo de 80 000, 16 entre 80 000 y 160 000, 47 entre 160 000 y
320 000, 100 por encima) y el detector calcula la curvatura sobre una copia diezmada a 80 000
(`_CURVATURE_MAX_VERTS`), con lo que la región de cada lesión se queda con menos puntos. Se ha
medido sin volver a segmentar: `scratchpad exp_curv_cap.py <tope>` fija `_CURVATURE_MAX_VERTS`
y `_CHAIN_DECIMATION_FROM` (= 2 × tope) en `routers/detect.py` y lanza `eval_zenodo.py` con
`--meshes-from zenodo_eval_full_p4_band --no-reuse`, en rondas de 12 (`backend/data/run_curv.ps1
-Cap`), sobre las mismas 172 mallas y volúmenes de la pasada del 22-10. Salidas
`backend/data/zenodo_eval_curv_160000` y `zenodo_eval_curv_240000` (172/172 cada una; la segunda
murió una vez por la suspensión del PC y se reanudó). Segmentación idéntica por construcción
(8 fuera de la malla, mismos factores) y controles idénticos (90 de 90 con 5 candidatos).

| | Banda (80 000) | Tope ×2 (160 000) | Tope ×3 (240 000) |
|---|---|---|---|
| Lesiones entre los 5 | **52** | 44 | 46 |
| Entre los 10 / en la lista de 40 | 61 / 75 | 53 / 67 | 51 / 69 |
| En el primer puesto | 12 | 9 | 12 |
| Estudios con alguna lesión entre los 5 (de 82) | 45 | 40 | 41 |
| Suben / bajan de puesto respecto a la banda | — | 16 / 28 | 21 / 30 |
| Entran / salen de los 5 | — | 5 / 13 | 6 / 12 |
| Con trombo (22) / sin trombo (100), entre los 5 | 12 / 40 | 13 / 31 | 13 / 33 |
| < 5 mm (41) / 5–10 (32) / 10–25 (33) / ≥ 25 (16), entre los 5 | 5 / 12 / 25 / 10 | 1 / 9 / 23 / 11 | 4 / 8 / 23 / 11 |
| 5–10 mm en la lista de 40 | 21 | 16 | 18 |
| Detección por estudio, mediana / media (s) | 44 / 49 | 104 / 108 | 146 / 157 |
| Horas de máquina (solo detección) | 2,3 | 5,9 | 8,2 |

**Resultado: pierde en los dos tamaños y el tope se queda en 80 000.** Lo que enseña, lesión a
lesión (`scratchpad cmp_dirs.py zenodo_eval_full_p4_band zenodo_eval_curv_<tope>`):

1. **Gana justo donde la hipótesis lo preveía, pero no por la curvatura.** Los sacos grandes y
   trombosados entran: 004 (28,5 mm, trombo, calcificado) pasa de fuera de la lista al 4.º
   (×2) y 5.º (×3); 020 (24,6 mm, trombo) de fuera al 1.º en los dos; 086 (30 mm) del 7.º al
   4.º; 116_1 (32,8 mm) de fuera al 7.º. Pero el candidato que los coloca viene de los canales
   de **calibre y cociente**, no de la curvatura (`candidates[].channels`), y la región de
   curvatura de 004 tiene 14 puntos con la banda y 4 con los topes. La razón está en
   `_CHAIN_DECIMATION_FROM`: la copia de calibre (38 000 vértices) sale de la copia de
   curvatura cuando la malla supera 2 × tope y de la malla completa si no; al subir el tope,
   los 47 estudios de 160 000–320 000 vértices (×2) y los 77 de 240 000–480 000 (×3) cambian
   de fuente para el calibre. 086 (172 863 vértices tras el recorte) y 004 (300 287) están en
   ese tramo. El experimento movía dos cosas a la vez; la que gana es la segunda.
2. **Pierde en los sacos de menos de 10 mm, y por las dos vías.** Por la curvatura: la región no
   crece con el tope, cambia de forma impredecible. 018 (9,6 mm, 5.º con la banda por
   curvatura) tiene 79 puntos a 80 000, 8 a 160 000 y 23 a 240 000, y cae al 27.º y 21.º; 089
   (7,7 mm, 1.º por los tres canales) pasa de 16 puntos a 123 (fundida con el vaso, motivo
   `merged`) y a 72, y cae a fuera de la lista y al 13.º; 090 pierde sus dos sacos en lista;
   017_2 y 022 caen por compacidad a ×2. Por el calibre: 116_3 (24 mm, 5.º por calibre) y 161
   (27 mm, trombo, 5.º por calibre) salen de la lista con los dos topes. Entre 5 y 10 mm la
   lista de 40 baja de 21 a 16 y 18.
3. **El orden entre candidatos depende de cómo cae el diezmado sobre cada lesión**, no del
   número de vértices: con la misma malla y tres diezmados, 16 suben y 28 bajan (×2),
   21 y 30 (×3); 088 (20 mm) es 1.º con la banda, 7.º a ×2 y 1.º a ×3; 017_2 es 4.º,
   fuera de la lista y 1.º. Es la misma inestabilidad medida en 3DRA (17 vértices de 12 776
   mueven la lesión del puesto 1 al 4) y la razón de no prometer el primer puesto.
4. **Coste.** La detección pasa de 44 a 104 y 146 s de mediana por estudio
   (la copia de curvatura de 240 000 vértices sobre una malla de 500 000 llega a 15 GB de RAM
   en este portátil), y el coste por estudio con todas las medidas subiría de 6,5 a 7,5 y 8 min.

Lo que sigue de aquí, sin segmentar: (a) **aislar la segunda variable**: `_CURVATURE_MAX_VERTS`
en 80 000 y la copia de calibre siempre desde la malla completa (o `_CHAIN_DECIMATION_FROM`
muy alto), sobre las mismas mallas; si 004, 020 y 086 entran sin que salgan 116_3 y 161, es
una medida que sí entra; (b) en el banco de puertas (paso 3 del plan), una fusión de regiones
que dependa de la densidad de vértices de la copia, y un tope en función del tamaño de la
pieza, medidos con la traza por región. La cifra oficial sigue siendo la de la banda
(§4.8): 52 de 122 entre los 5.

### 4.10 La copia de calibre desde la malla completa (2026-10-23): medida, neutra, no adoptada; y la regla de sacos

**(a) La segunda variable del §4.9, aislada.** `scratchpad exp_calibre_full.py` deja
`_CURVATURE_MAX_VERTS` en 80 000 y pone `_CHAIN_DECIMATION_FROM` fuera de alcance, de modo que
la copia de calibre (38 000 vértices) sale siempre de la malla completa y nunca de la copia de
curvatura; el resto del detector no cambia. Misma mecánica que el §4.9 (`--meshes-from
zenodo_eval_full_p4_band --no-reuse`, rondas de 12 con el runner genérico `backend/data/run_exp.ps1`),
salida `backend/data/zenodo_eval_calibre_full` (172/172, 9:46–13:43). Segmentación y controles
idénticos por construcción (8 fuera de la malla, 90 de 90 controles con 5 candidatos).

| | Banda (§4.8) | Calibre desde la malla completa |
|---|---|---|
| Lesiones entre los 5 | **52** | 51 |
| Entre los 10 / en la lista de 40 | 61 / 75 | 61 / 75 |
| En el primer puesto | 12 | 12 |
| Estudios con alguna lesión entre los 5 (de 82) | 45 | 46 |
| Suben / bajan de puesto | — | 9 / 17 |
| Entran / salen de los 5 | — | 3 / 4 |
| Con trombo (22) / sin trombo (100), entre los 5 | 12 / 40 | 14 / 37 |
| < 5 mm (41) / 5–10 (32) / 10–25 (33) / ≥ 25 (16), entre los 5 | 5 / 12 / 25 / 10 | 3 / 12 / 24 / 12 |
| ≥ 25 mm en la lista de 40 | 11 | 13 |
| Detección por estudio, media (s) | 49 | 65 |
| Horas de máquina (solo detección) | 2,3 | 3,1 |

Lo que enseña (`scratchpad cmp_dirs.py zenodo_eval_full_p4_band zenodo_eval_calibre_full`):

1. **La lectura del §4.9 era correcta: los sacos grandes entran por el calibre, con la curvatura
   intacta.** 004 (28,5 mm, trombo, calcificado) pasa de fuera de la lista al 4.º; 086 (30 mm,
   trombo) del 7.º al 5.º; 116_1 (32,8 mm) de fuera al 8.º; 161 (27 mm, trombo) del 5.º al 4.º;
   082 (5,2 mm) del 38.º al 4.º. Con trombo pasan de 12 a 14 entre los 5 y los ≥ 25 mm de 10 a 12
   (de 11 a 13 en la lista). 020 (24,6 mm), que entraba con los topes del §4.9, aquí no entra: su
   ganancia venía del diezmado de curvatura, no del calibre.
2. **Pero la copia de calibre nueva también cambia regiones que ya estaban bien.** 116_2 (24 mm,
   5.º por calibre) sale de la lista (su región se queda sin puntos: motivo `points`) y 144
   (4,9 mm, 14.º) sale por curvatura media; 018 (9,6 mm) baja del 5.º al 6.º, 109 (3,6 mm) del
   5.º al 8.º, 185 (4,2 mm) del 5.º al 6.º; 011 (3 mm) del 8.º al 14.º, 083 del 6.º al 9.º, 090 del
   9.º al 12.º, 110 (25 mm, trombo) del 2.º al 4.º. Los menores de 5 mm pasan de 5 a 3 entre los 5.
3. **Neto: 52 → 51 entre los 5, misma lista y mismo top 10, un estudio más con lesión entre los 5
   (45 → 46), 16 s más de detección por estudio.** Es un cambio de reparto (gana en grandes y
   trombosados, pierde en pequeños), no una mejora, y **no se adopta sola**. Queda como pieza para
   el banco de puertas (paso 3 del plan): conservar las dos copias de calibre y fundir sus
   candidatos, de modo que 004/086/116_1 entren sin que 116_2/144/109 salgan; medido con la traza
   por región antes de tocar `routers/detect.py`.

**(b) La regla de sacos en la máscara (paso 2 del §4.8), medida y codificada.** El diagnóstico a
resolución nativa sobre la máscara reproducida fase a fase (`scratchpad diag_sac.py`,
`diag_blob.py`, `diag_geo.py`) dice qué son los sacos que se pierden:

- Los de **093** (14,5 y 11,3 mm, trombo) no son bolas: están dentro de un mismo componente
  ramificado de 5,8 cm³ del resto (M0 fuera de la máscara) que toca la máscara por el 1 % de su
  superficie; la mitad de sus vóxeles pasan la puerta de tubularidad pero no conectan con ninguna
  semilla. Un crecimiento geodésico por dentro de M0 desde la máscara los alcanza solo a 15–20 mm
  (093_2: 53–61 % de sus puntos; 093_1 no se alcanza ni a 20 mm) y se trae 4–7 cm³ por estudio de
  material con pinta de vaso en más de mil piezas. Descartado.
- El gigante de **026** (50 mm, 11 cm³, recall 0,02) es una bola maciza a 3,1 mm de la máscara:
  fuera del alcance de la recuperación de 3 mm y sin conexión por M0. El de **024** (20 mm, trombo,
  recall 0,33) es una bola parcial. El de **121** (23 mm, trombo, recall 0,01) a nativo ya tiene el
  46 % de sus puntos en la máscara: su pérdida es el factor 2 del banco, no la puerta.

**Regla de bola**, fase 7 de `build_vascular_mask` (`services/vascular_mask.py`, tras el cierre):
el resto se abre 1,5 mm por eje (`sac_open_mm`: quita láminas, pared fina y ramas finas), cada
núcleo que sobrevive con diámetro equivalente ≥ 5 mm (`sac_min_d_mm`) se reconstruye dentro del
resto y se pega si está a ≤ 5 mm de la máscara (`sac_reach_mm`) y menos de la mitad de sus
vóxeles puntúan como lámina (`sac_plate_max`, con `PLATE_RATIO`). Todo se evalúa en la caja de
cada bola, no en el volumen entero. Medida sobre las máscaras reales guardadas (3–16 s por
estudio): 026 pasa del 0 al 49 % de los puntos del saco (+11,3 cm³), 024 del 4 al 35 % (+0,6 cm³),
093 y 121 sin cambio, y en los controles 001, 003 y 045 no admite ninguna bola (0 cm³). Cuatro
parámetros nuevos en `MaskParams` (a 0 apagan la fase), dos claves nuevas en las estadísticas
(`sac_blobs`, `sac_vox`), fase «sacos» en el contrato de fases de la interfaz, tests en
`backend/test_sacos_mascara.py` (bola a 2 mm entra, a 8 mm no, pequeña no, alcance, tubo solo
no cambia, apagada reproduce la máscara anterior, fallback con claves). Suite de la máscara y del
método tubular: 93 pasan.

**Con la banda de la cabeza (factor > 1), la fase va en la pasada gruesa y las baldosas sólo rematan.**
La primera versión corría la fase entera en cada baldosa nativa (`refine_in_band` llama a
`build_vascular_mask` por baldosa con la máscara gruesa como semilla), y en cada baldosa el «resto»
son todos los vasos que en esa baldosa no tienen semilla: decenas de candidatos por baldosa, cada
uno con su transformada de distancia. Medido en Zenodo 010 (factor 2, 41 baldosas): 286 → 802 s de
banda con la máscara idéntica al vóxel (881 365). Por eso, con semillas externas la fase sólo mira los
núcleos que tocan las semillas (`_sac_blobs(..., within=seed_mask)`): la pasada gruesa, que ve el
volumen entero, decide qué bolas entran, y la baldosa nativa las rehace a su resolución (sembradas,
su parte tubular crece en la fase 4, la recuperación trae lo que está a 3 mm y la fase 7 remata).
Comprobado con un fantasma a factor 2 (`TestConSemillasExternas`): la bola que decide la pasada gruesa
vuelve a nativo con más del 85 % de sus vóxeles, y una bola sin semilla no se mira. Límite de la
regla: la apertura es una caja de 1,5 mm de semilado, que a una esfera le quita unos 2,6 mm de radio;
una bola de 10 mm deja un núcleo justo en los 5 mm de diámetro equivalente, así que la regla ve
sacos de unos 11 mm en adelante (los perdidos que importan miden 20 y 50 mm).
Pasada de segmentación de los 172 con la regla: `backend/data/run_sacos_p5.ps1` →
`zenodo_eval_full_p5_sacos`, del 23-10 15:38 al 24-10 18:41 (20,9 h de máquina registradas; murió una
vez con la suspensión del PC y se relanzó donde iba).

**Resultado sobre los 172 (banda → sacos), misma herramienta de medida (`cmp_dirs.py`):**

| | banda (22-10) | regla de sacos (24-10) |
|---|---|---|
| fuera de la malla (recall < 0,5) | 8 | **5** |
| entre los 5 | 52 | **52** |
| entre los 10 | 61 | **64** |
| en la lista de 40 | 75 | **78** |
| en primer puesto | 12 | **13** |
| estudios con la lesión entre los 5 | 45 de 82 | **46** |
| controles con 5 candidatos | 90/90 | 90/90 |
| con trombo (22) entre 5 / en lista / fuera | 12 / 15 / 4 | 14 / 16 / 2 |
| sin trombo (100) | 40 / 60 / 4 | 38 / 62 / 3 |
| < 5 mm (41) | 5 / 16 / 1 | 4 / 17 / 1 |
| 5–10 mm (32) | 12 / 21 / 1 | 12 / 21 / 1 |
| 10–25 mm (33) | 25 / 27 / 4 | 25 / 28 / 2 |
| ≥ 25 mm (16) | 10 / 11 / 2 | 11 / 12 / 1 |
| factores | 54 × 1, 103 × 2, 15 × 3 | iguales |
| segmentación / detección (s por estudio, mediana) | 320 / 49 | 339 / 57 |
| candidatos en hueso (de 860) | 167 | 159 |

Segmentación: ninguna lesión pierde cobertura; tres de las 8 que estaban fuera entran: **026 (50 mm,
gigante) 0,02 → 0,91, 121 (23 mm, trombo) 0,01 → 1,00 y 024 (20 mm, trombo) 0,33 → 0,74**. Quedan
fuera 5: 092 (4 mm), 093_1 (14 mm, trombo) y 093_2 (11 mm), 100 (42 mm, trombo) y 104 (8 mm). La máscara
de 093 es idéntica a la de la banda (26 971 mm³): sus dos sacos son cáscaras parciales (§4.10 b,
diagnóstico) y la regla no tiene bola que recuperar. La máscara no cambia en 79 estudios, crece una
mediana de 0,12 cm³ y más de 5 cm³ en 6 (máximo 11,3): lo que entra son bolas sueltas, no vasos.

Detección: 18 lesiones cambian de puesto (10 suben, 7 bajan). Entran entre los 5 **026 (fuera → 1.º),
121 (fuera → 2.º) y 019 (21 mm, trombo, 37 → 4)**, y suben 161 (27 mm, trombo y calcio, 5 → 1), 116_3
(24 mm, 5 → 2) y 163 (2,5 mm, 4 → 1); 024 entra en la malla pero su región cae por la curvatura media.
Salen 027 (12 mm, 5 → 10), 033_2 (12 mm, 2 → 8), 088_2 (4 mm, 1 → 4) y 109_2 (3,6 mm, 5 → 8), y baja
038 (1 → 2). En los cuatro que salen la máscara crece 0,6–3 cm³ y los candidatos nuevos de 8–10 mm
ganan la copia de calibre en sitios sin lesión: es el mismo reparto grandes ↔ pequeños de la copia de
calibre (§4.10 a), pero aquí viene con la segmentación a favor y con todas las cifras agregadas iguales
o mejores. Coste: +6 % de segmentación (19 s por estudio) y +8 s de detección (mallas algo mayores).

**Veredicto: entra.** Es la primera medida desde la banda que mueve la segmentación (8 → 5 fuera, y las
tres que entran son las grandes trombosadas que el informe del 22 señalaba), no baja ninguna cifra
agregada ni ningún grupo salvo < 5 mm entre 5 (5 → 4, por el orden de candidatos: 088 y 109 siguen en
la lista con toda su superficie) y los controles no admiten ninguna bola. Cifra oficial: **52 de 122
entre los 5, 13 en primer puesto, 78 en lista, 46 de 82 estudios, 5 fuera de la malla**.

## 5. Código y datos de esta pasada

- `backend/scripts/zenodo_lesiones.py`: tabla por lesión y recuentos de una pasada a partir
  de los JSON (`--out`, `--sin-tabla`).
- `backend/scripts/exp_tree_gate.py`, `backend/data/run_tree_gate.ps1`: el experimento 4.1.
- `backend/data/run_full_p3.ps1`: una ronda sin progreso ya no para la pasada (pausa de
  2 min y hasta 3 rondas seguidas), porque una suspensión del PC mataba el proceso en
  marcha y el siguiente moría al arrancar.
- `backend/services/vtk_output.py` + import en `services/segmentation.py` +
  `backend/test_vtk_output_window.py`: en Windows, VTK 9.6 abre una ventana
  «vtkOutputWindow» que no responde al primer aviso en un proceso sin consola, con
  cualquier `DisplayMode` (medido); se sustituye la instancia por la base, que escribe en
  stderr. El aviso que la disparaba (`vtkMassProperties ... must be VTK_TRIANGLE not 3`,
  triángulos degenerados en líneas tras `vtkCleanPolyData` en las regiones) es inocuo para
  los números y queda por quitar en `services/aneurysm_detector.py`.
- Datos: `backend/data/zenodo_eval_full_p3/` (JSON, `meshes/`, `volumes/`, `summary.json`),
  logs `full_p3_runner.log` y `zenodo_eval_full_p3.r<n>.log|.err`. Gitignorado.

## Anexo: cómo repetir

```bash
cd ProspectiveWeb/backend
Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','data\run_full_p3.ps1' -WindowStyle Hidden
.venv/Scripts/python scripts/eval_zenodo.py --summary --out data/zenodo_eval_full_p3
.venv/Scripts/python scripts/zenodo_lesiones.py --out data/zenodo_eval_full_p3
Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','data\run_tree_gate.ps1' -WindowStyle Hidden
.venv/Scripts/python scripts/exp_tree_gate.py --summary
.venv/Scripts/python scripts/zenodo_lesiones.py --out data/zenodo_eval_full_p3_tree
```
