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

**Actualización 2026-10-27 (tarde).** Lo que no es de detección: las mallas de los 172 no son árboles limpios
(mediana 66 piezas; el SOPORTE DE CABEZA del escáner es la pieza mayor en 1 de cada 4 estudios y en 016/017 está
conectado al árbol). Regla de la ENVOLVENTE DE LA CABEZA (§4.18, `services/head_mask.py`): aire > −300 HU,
apertura 4 mm, componente mayor, envolvente convexa por corte; lo de fuera pasa a aire antes de la máscara. En
016 y 017 la máscara baja de 113 a 18 y de 150 a 31 cm³, la pieza mayor vuelve a ser árbol y las lesiones siguen
al 98–100 %. Tests verdes (5 nuevos, 97 de la receta). Aplicarla poniendo aire fuera o restringiendo M0 antes de
los percentiles vacía la máscara (004: 146 → 3 cm³; los percentiles de semillas estaban sostenidos por el
soporte): se restringe M0 DESPUÉS de los percentiles (004: 30,7 cm³, lesión en 4.º, antes fuera). **Pasada
completa de segmentación en marcha** desde las 14:37 (`zenodo_eval_full_p6_head`, ~20 h).

**Actualización 2026-10-30.** Canal de «saco pequeño» con cuota del 5.º puesto, medido en el banco y confirmado
con pasada real (§4.20): las regiones de 3–5 mm con curvatura de esfera, esfericidad y convexidad altas se ordenan
por forma (no por área, que las deja en los puestos 11–40) y, si ninguna está entre los 5, la mejor pasa al 5.º.
El canal no vota: con puestos propios ganaba entre 5 pero quitaba el 1.º a 105, 107, 108 y 126. **71 de 122 entre
los 5** (de 68), **80 entre 10** (de 74), 24 en 1.º, 96 en lista, 59 de 82 estudios; ninguna banda baja; controles
90/90 con 5, hueso en controles 117 → 111 de 450; sin coste de tiempo. Suben ocho (011_1, 022, 034, 083, 106_1/2,
113, 115_1) y seis ceden un puesto (al 5.º o al 6.º); por banda de tamaño no baja nada, por grupo clínico un puesto:
121 (23 mm, trombosado) y dos bifurcaciones sin tipo pasan del 5.º al 6.º (grandes 19 → 18, con trombo 17 → 16,
tipo «otro» 14 → 11 entre los 5; las tres entre los 10). **Nueva referencia de detección 71 / 80 / 24 / 96 / 59, 5
fuera.** Regresión XA sin diferencias. El 5.º candidato de la lista puede ser el sitio de la cuota.

**Actualización 2026-10-29.** Dos puertas del canal de curvatura medidas en el banco sobre las mallas de la
envolvente y confirmadas con pasada real (§4.19): a una región muy convexa (pgf ≥ 0,75) con curvatura de esfera
(H·r ≤ 1,5) le basta compacidad 0,10 (la fija de 0,2 tiraba la cúpula de sacos de 14–25 mm), y la curvatura
media se mira en valor absoluto cuando pgf ≥ 0,75 (la luz interior de un saco trombosado es cóncava). Las
versiones sin condición reparten; estas no bajan ninguna cifra en ninguna banda. **68 de 122 entre los 5** (de
67), 74 entre 10, **24 en 1.º** (de 21), 96 en lista, 57 de 82 estudios; controles 90/90 con 5, hueso en
controles 115 → 117 de 450; sin coste de tiempo. La hipótesis previa (radio de acuerdo del consenso, fusión de
cúpulas partidas) se midió y no mueve nada. **Nueva referencia de detección 68 / 74 / 24 / 96 / 57, 5 fuera.**
Regresión XA sin diferencias. Siguiente: fusión del consenso con el sitio más cercano (no el primero) y un canal
propio para sacos pequeños con región a la escala de 4 mm que el tope de 40 corta.

**Actualización 2026-10-28.** Pasada de segmentación de los 172 con la **envolvente de la cabeza** (§4.18)
terminada: la máscara pasa de 111 a 34 cm³ de mediana, 80 estudios en 20–40 cm³ (eran 16), 15 por encima de 60
(eran 128), «parece árbol» 126 → 169, pieza mayor > 60 cm³ 51 → 8, ningún recubrimiento de lesión baja, 5 fuera
de malla (igual), segmentación 339 → 211 s. Detección sobre esas mallas: **67 de 122 entre los 5** (eran 63), 73
entre 10, **21 en 1.º** (eran 31), 94 en lista, 56 de 82 estudios; controles 90/90 con 5, hueso en controles 92 →
115. El primer puesto se pierde por la copia de curvatura (la malla tiene la mitad de vértices y el diezmado a
80 000 es la mitad de fuerte: las cúpulas grandes se parten en 2–3 candidatos): experimento del tope a 40 000
sobre estas mallas medido a 40 000 y 60 000 en los 28 estudios que se mueven: 40 000 devuelve los 13 primeros
puestos pero pierde 3 entre 5 (pequeñas y trombosadas) y 4 en lista; 60 000 pierde por los dos lados. El tope se
queda en 80 000. **La envolvente ENTRA; nueva referencia de detección 67 / 73 / 21 / 94 / 56, 5 fuera**, con el
primer puesto como coste declarado. Las 4 máscaras que se vacían son controles con poco contraste cuyo «árbol»
era soporte y tabiques; las 15 que siguen > 60 cm³ son cráneo dentro de la cabeza (siguiente frente). Regresión XA
sin diferencias.

**Actualización 2026-10-27.** Fusión por cajas y segunda escala del suelo (§4.17) adoptadas por decisión del
usuario el 26 por la noche y confirmadas con pasada real de detección (`zenodo_eval_fusion`, 172/172, 5,5 h):
**63 de 122 entre los 5** (igual), 69 entre 10 (igual), **31 en 1.º** (eran 30), **88 en lista** (eran 82),
**56 de 82 estudios** (igual); 5 fuera de malla; controles 90/90 con 5 (hueso 92/450, era 94); 121/122 puestos
iguales al banco. Entran 7 en la lista (017_2 al 10.º), 012_2 y 107 suben al 1.º, 163 baja del 1.º al 2.º,
111 del 10.º al 11.º y 082_2 sale de la lista mientras entran 082_1 y 082_3. Detección 65 → 97 s por estudio.
Cifra oficial: **63 / 69 / 31 / 88 / 56; 5 fuera de malla**. Regresión XA: sin diferencias (27-10, 11:42).

**Actualización 2026-10-26.** Banco: fusión por tamaño (§4.12), resolución (§4.13), techo de HU (§4.14)
y segunda escala del suelo (§4.15) medidas y no adoptadas (ninguna mueve los 61). **Orden del canal de
curvatura por área × pgf** (§4.16): las regiones de vaso que van por delante de una lesión tienen menos pgf
(0,62 frente a 0,70); confirmado con pasada real de detección sobre las mallas de sacos: **63 de 122 entre
los 5** (eran 61), 69 entre 10, **30 en 1.º** (eran 28), 82 en lista, **56 de 82 estudios**; **ninguna lesión
baja**; controles 90/90 con 5 (hueso 94/450 igual); 121/122 puestos iguales al banco. **Entra**: preset de TC
`order_by="area_pgf"` desde el 26-10 por la tarde, con test (83 verdes) y regresión XA verde.

**Actualización 2026-10-25.** Banco de puertas sobre los 172 (§4.12): las puertas del paso 3 no mueven
nada; el **suelo absoluto de curvatura gaussiana** (`min_gauss_curvature=0.028`, esfera de 6 mm, en lugar
del percentil 85) confirmado con pasada real de detección sobre las mallas de sacos: **61 de 122 entre los
5** (eran 52), 68 entre 10, **28 en 1.º** (eran 13), 81 en lista, **54 de 82 estudios**; controles 90/90 con 5;
hueso 159 → 156 de 860; detección 57 → 52 s. Entran los grandes trombosados 004, 020 y 086; bajan 16
pequeñas de 3–7 mm por fusión con la región del vaso vecino. **Entra**: en el preset de TC desde el 25-10 por la tarde; el barrido de 5 y 7 mm
(ambas 58 entre 5) confirma que 6 mm es el óptimo de los tres.

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

### 4.11 La puerta de curvatura media (2026-10-24, tarde): no es la que retiene a nadie

Primera puerta del banco del paso 3, sobre los registros y las mallas de la pasada de sacos
(§4.10 b). Ocho lesiones tienen «curvatura media» como primer motivo de rechazo (la región de
curvatura más cercana cae en `H·r < 0,7`). Vistas una a una (`lesions[].region` del registro):

| lesión | mm | trombo | H·r | puntos | área mm² | comp. | pgf | dist. mm |
|---|---|---|---|---|---|---|---|---|
| 004 | 28,5 | sí | 0,65 | 14 | 7,3 | 0,30 | 0,71 | 2,7 |
| 024 | 20,4 | sí | 0,62 | 11 | — | 0,15 | 0,73 | 4,2 |
| 029_2 | 5,6 | — | 0,68 | 11 | 2,6 | 0,32 | 0,91 | 2,0 |
| 034 | 3,0 | — | 0,64 | 14 | 6,8 | 0,31 | 0,93 | 0,5 |
| 085_3 | 3,3 | — | 0,41 | 9 | — | 0,23 | 0,22 | 1,0 |
| 011_3 | 4,4 | — | −1,03 | 39 | — | 0,22 | 0,69 | 2,3 |
| 116_4 | 32,8 | — | −2,45 | 15 | — | 0,16 | 0,60 | 5,1 |
| 118 | 4,5 | — | −0,84 | 14 | — | 0,25 | 0,50 | 2,7 |

Tres son inalcanzables por esta puerta porque la región más cercana es cóncava (H·r negativo:
no es el saco, es el vaso de al lado) y 085_3 cae después por fracción gaussiana (0,22). Las
cuatro restantes están entre 0,62 y 0,68, justo bajo el 0,7, y las 40 lesiones con puesto
tienen H·r de 0,49 a 2 (percentil 10: 0,76): bajar a 0,6 parece gratis. **Medido con el banco
(`--set min_mean_curv_radius=0.6`, mismas mallas, estudios 004, 029 y 034):** las tres pasan la
puerta y mueren en la siguiente. 004 y 029_2 caen por el **tope de la lista** («cap»: la región
pasa todas las puertas pero con 7,3 y 2,6 mm² queda detrás de 40 regiones mayores con
`order_by="area"`); 034 se **fusiona** con una región vecina a menos de 10 mm. Con la fusión a
5 mm además (`merge_dist_mm=5`): 004 y 029 siguen en el tope, 034 sigue fusionada, y en 004 el
reparto cambia (dos candidatos nuevos de calibre a 10–11 mm de la lesión, sin acierto). 024
pasaría la puerta y caería por compacidad (0,15 < 0,20).

Lo que esto enseña es de dónde vienen esas regiones: en los sacos grandes (004 de 28 mm, 024 de
20) la región de curvatura es un **parche de 11–14 puntos y 7 mm²** sobre un saco de cientos de
mm², no el saco; el percentil de Gauss no forma regiones sobre cúpulas de ese radio (§4.6), y
esos sacos los dan los canales de calibre (004 entró 4.º con la copia de calibre, §4.10 a). En
los pequeños (029_2, 034) la región es correcta pero pequeña, y en la lista ordenada por área
pierde contra el vaso. Las 13 lesiones que hoy caen por «cap» o «merged» son lo mismo: regiones
válidas de 3,4 a 9,4 mm² con H·r 0,72–1,13 (029_1, 033_1, 035_2/3, 085_1, 090_2/4, 093_4, 097,
103, 126_2/3, 154_2). **Veredicto: la puerta de curvatura media no se toca** (bajarla a 0,6 no
mete ninguna lesión y añade regiones que compiten por los 40 puestos: en 004, 29 más). La
palanca que sí tocaría a esas 16 lesiones es el orden y la fusión de las regiones pequeñas, y
eso se mide con el banco de reglas puras (`scripts/exp_p3_detector.py`, volcado único de todas
las regiones y evaluación en segundos), que hay que volver a apuntar a las mallas de la pasada
de sacos y poner al día con el recorte (§4.4) y el suelo de HU (§4.5) antes de fiarse de él.
Registros de las pruebas: `backend/data/zenodo_eval_mc06` y `zenodo_eval_mc06_m5` (3 estudios).

### 4.12 El banco de puertas sobre los 172 (2026-10-25): la palanca es el umbral de Gauss, no las puertas

El banco de reglas puras del paso 3 (`scripts/exp_p3_detector.py`) se ha reescrito como
`scripts/gate_bench.py` y puesto al día con todo lo que la cadena de producción hace desde
entonces: recorte intracraneal (§4.4), copia de calibre encadenada y tope de árbol (§4.3), suelo
de HU (§4.5). `dump` recorre las mallas guardadas de una pasada una sola vez (diezmado idéntico
al de `_detect_hits`, calibre local, y el detector con **todas las puertas abiertas** para guardar
cada región con sus medidas, a dos escalas de Gauss: percentil 85 y suelo absoluto K ≥ 0,028
mm⁻²); `eval` aplica después las puertas, el orden, la fusión, el tope, el consenso y el suelo
de HU en segundos por variante. Volcado de los 172 estudios de la pasada de sacos (§4.10 b):
7,5 h en rondas de 10 (`data/run_gates.ps1`); evaluación de 20 variantes, 25 min. Antes de
fiarse de él: la variante `actual` reproduce los **122 de 122 puestos** de la pasada real
(`eval --check`), y los 90 controles salen con 5 candidatos en todas las variantes.

| variante | entre 5 | entre 10 | 1.º | lista | estudios | hueso ctl | hueso IA |
|---|---|---|---|---|---|---|---|
| actual (pasada de sacos) | 52 | 64 | 13 | 78 | 46 | 86/450 | 73/410 |
| sin suelo de HU | 51 | 63 | 8 | 77 | 45 | 83 | 73 |
| H·r ≥ 0,6 | 53 | 65 | 14 | 79 | 47 | 85 | 72 |
| fusión 5 mm / 7 mm | 53 / 53 | 65 / 65 | 14 / 14 | 79 / 78 | 47 / 47 | 86 / 86 | 73 / 72 |
| tope 60 / 80 | 52 / 52 | 63 / 63 | 13 / 13 | 77 / 77 | 46 / 46 | 87 / 87 | 72 / 71 |
| orden score / sin tamaño | 51 / 46 | 62 / 57 | 13 / 6 | 80 / 77 | 46 / 40 | 80 / 69 | 72 / 57 |
| orden n / H·r / pgf·comp | 51 / 48 / 50 | 60 / 57 / 58 | 12 / 8 / 9 | 72 / 72 / 76 | 45 / 42 / 44 | 83 / 82 / 81 | 65 / 58 / 64 |
| compacidad 0,15 / 0,10 | 50 / 46 | 64 / 59 | 14 / 17 | 76 / 76 | 44 / 40 | 91 / 94 | 71 / 62 |
| pgf ≥ 0,40 | 51 | 64 | 13 | 78 | 46 | 88 | 72 |
| mínimo 4 puntos | 52 | 64 | 13 | 79 | 46 | 86 | 74 |
| anillo del cociente por radio | 56 | 65 | 12 | 78 | 49 | 89 | 71 |
| dos escalas (p85 + K como 2.º canal) | 56 | 66 | 25 | 81 | 49 | 89 | 76 |
| **suelo absoluto K ≥ 0,028 (k6)** | **61** | **68** | **28** | **81** | **54** | 94 | **62** |

Las puertas del paso 3 confirman §4.11: ninguna mueve más de una lesión en ningún sentido
(H·r 0,6 mete la 020 en 1.º y nada más; fusión a 5 mm, la misma 020 y 14 puestos movidos), y los
órdenes alternativos y la compacidad baja pierden. **Lo que cambia el cuadro es el umbral de la
curvatura gaussiana.** El detector forma las regiones con un percentil de K sobre la malla
(85 en el preset de TC): un umbral relativo que depende de cuánta malla haya y de cuánto vaso
fino tenga. Sustituirlo por un suelo absoluto K ≥ 0,028 mm⁻² (la curvatura gaussiana de una
esfera de 6 mm de radio) sube de 52 a 61 entre 5, de 64 a 68 entre 10, de 13 a 28 en primer
puesto y de 46 a 54 estudios; la lista pasa de 78 a 81. La razón se ve en las regiones del
volcado: con el percentil, en los sacos de 10–30 mm la región de curvatura era un parche de
10–40 puntos y 7 mm² (§4.11); con el suelo absoluto es **el saco entero** (100–500 puntos,
50–200 mm², a 0,3 mm de la lesión), y el canal de curvatura coincide con calibre y cociente,
que es lo que el consenso premia. Es, de nuevo, la escala del percentil de Gauss (§4.6), ahora
corregida en origen y no por el lado de la puerta de curvatura media.

| k6 frente a actual | < 5 mm (40) | 5–10 mm (33) | 10–25 mm (32) | ≥ 25 mm (17) | con trombo (22) |
|---|---|---|---|---|---|
| entre 5 | 4 → 8 | 12 → 12 | 24 → 27 | 12 → 14 | 14 → 17 |
| entre 10 | 8 → 12 | 16 → 13 | 27 → 29 | 13 → 14 | 16 → 18 |
| en lista | 16 → 18 | 22 → 20 | 27 → 29 | 13 → 14 | 16 → 18 |

Lesión a lesión: **ganan 15** (entran o suben a los 5): 004 (28 mm, trombo) → 5.º, 020 (25 mm,
trombo) → 3.º, 086_1 (30 mm, trombo) 7.º → 1.º, 027 10.º → 1.º, 028 → 1.º, 090_2 → 1.º, 012_2 →
2.º, 126_2 y 126_3 → 2.º, 107 10.º → 2.º, 050_2 6.º → 3.º, 030_2 → 4.º, 118 → 4.º, 034 → 7.º,
085_1/085_3, 029_1, 090_4 y 154_2 entran en lista; y catorce que ya estaban entre los 5 suben al
1.º (002, 013, 014, 023, 035_1, 036, 037, 038, 050_1, 093_3, 096, 102, 112, 121). **Pierden 16**,
casi todas de 3–7 mm: 099_3 (2.º → fuera), 017_2 (3.º → fuera), 163 (1.º → 7.º), 126_1 (3.º →
14.º), 106_1/106_2 (6.º → 28.º), y 012_1, 032, 035_4, 082_2/3/4, 090_3, 093_5, 117_2 y 144, que
estaban entre el 9 y el 38 y salen de la lista. El motivo dominante es el reverso de la ganancia:
con regiones más grandes, la de la lesión pequeña se **fusiona** con la vecina a menos de 10 mm
(082_3, 090_3, 093_5, 106_1, a 0,2–0,7 mm de su lesión), deja de ser compacta (017_2, 082_4) o
compite con más regiones válidas por los 40 puestos (082_2 pasa las puertas y no entra). El
tramo 5–10 mm es el único que baja (16 → 13 entre 10). Hueso en los candidatos: controles 86 →
94 de 450, estudios con lesión 73 → 62 de 410; controles siempre con 5 candidatos.

**Combinaciones sobre k6** (mismo volcado, para recuperar las pequeñas): fusión a 5 o 7 mm
60/68/30/83/53; tope 60, H·r 0,6 y 4 puntos no cambian nada; compacidad 0,15 → 61/69/34/88/52
(mete 7 en lista y 6 más en 1.º, pero reparte: 019 4.º → 15.º, 017_1 1.º → 8.º, 113 y 085_2
fuera); anillo por radio → 63/67/28/80/56 (030_2 y 033_2 suben, 109_2 sale); p85 como segundo
canal → 61/72/26/83/52 (recupera 017_2 → 4.º, 106_1/2 → 9.º, 163 → 2.º y 126_1 → 5.º, pero 004
baja a 6.º, 020 a 5.º y dos estudios pierden el top 5); orden por score, 51. Ninguna domina a k6
en todas las medidas: la segunda escala y la compacidad 0,15 mejoran la cola (entre 10, lista) a
costa de la cabeza (1.º, estudios), que es lo que el usuario mira. **k6 solo** es además un cambio
de un parámetro con un significado físico (sacos de radio ≤ 6 mm forman región siempre; por
encima, los dan calibre y cociente) y no una combinación ajustada a la muestra.

**Confirmación con el detector real (25-10, 07:29–10:44):** pasada de detección sobre las 172 mallas
guardadas con `--set min_gauss_curvature=0.028` (`zenodo_eval_k6`, 172/172, 3,2 h, 52 s de
detección por estudio frente a 57 de la pasada de sacos). Coincide con el banco en **121 de 122
puestos** (113: 19 en la pasada, 20 en el banco). **CIFRA OFICIAL: 61 de 122 entre 5, 68 entre
10, 28 en 1.º, 81 en la lista, 54 de 82 estudios**; controles 90/90 con 5 candidatos; hueso
156/860 (controles 94/450, con lesión 62/410). Por clase del dataset: miliares 5/30, medios
24/56, grandes 19/20, gigantes 13/16; blister 7/39, saculares 22/36, fusiformes 19/26. Entran
en los 5: 004, 020, 028, 012_2, 030_2, 118, 090_2, 126_2, 126_3 (de fuera de la lista) y 027,
107, 086_1, 050_2 (suben); salen de los 5: 163, 126_1, 017_2, 099_3; bajan de tramo 16 en
total. **Barrido del suelo (25-10, 10:44–15:10 de volcado, evaluación en minutos):** esferas de 7 mm
(`k0.02`) y 5 mm (`k0.04`) en el mismo banco, sobre los 172.

| suelo de K | entre 5 | entre 10 | 1.º | lista | estudios | hueso ctl | hueso IA |
|---|---|---|---|---|---|---|---|
| percentil 85 (actual) | 52 | 64 | 13 | 78 | 46 | 86 | 73 |
| 0,020 (esfera de 7 mm) | 58 | 66 | **32** | 80 | 50 | 90 | 63 |
| **0,028 (esfera de 6 mm)** | **61** | **68** | 28 | 81 | **54** | 94 | **62** |
| 0,040 (esfera de 5 mm) | 58 | 66 | 22 | **82** | 50 | **84** | 67 |

La de 6 mm gana en las medidas de cabeza (entre 5, entre 10, estudios). Con 7 mm la región
crece hasta comerse el cuello y los dos grandes trombosados que k6 había metido vuelven a caer
(004 por compacidad, 019 por el tope), junto con 185, 113, 154_2 y 085_3; recupera 033_1, 082_3
y 090_3 y sube cuatro más al 1.º (32), pero con trombo baja de 17 a 15 y ≥ 25 mm de 14 a 13. Con
5 mm el umbral deja fuera también a 004 y 019 y a tres pequeñas que k6 ponía entre los 5 (028
1.º → fuera, 118 4.º → fuera, 011_1); recupera 090_3 (1.º), 163 (1.º), 082_1/082_2 y 024 (29.º),
alarga la lista a 82 y mete menos hueso en controles (84), pero pierde dos estudios. **Se queda
0,028.** Por tamaño (k7 / k6 / k5, entre 5): < 5 mm 7 / 8 / 8; 5–10 mm 12 / 12 / 11; 10–25 mm 26 /
27 / 26; ≥ 25 mm 13 / 14 / 13; con trombo 15 / 17 / 15. Salida: `backend/data/exp_gates_eval_sweep.out`.

**Llevado al código (25-10, 15:30):** `min_gauss_curvature=0.028` en el preset de TC de
`routers/detect.py::_detector_for_modality` (el percentil 85 queda como respaldo si el suelo se
pone a None; XA sigue con su percentil), fijado en `test_paso3_detector.py` (el preset de TC lleva
el suelo y el de XA no). Suites del detector: 83 verdes, 1 omitido. Regresión XA
(`scripts/regresion_xa.py --label tras-suelo-gauss --compare final2`, 25-10 15:40): Case 3 e IM_0055
segmentados de cero (107 186 y 104 841 vértices, umbrales 1471 y 1499, como en la línea base) y la lesión
**1.ª de 5 en los dos**, malla entera y solo árbol, igual que en `final2` y `p3_final`. La única diferencia con
esas líneas base (13–14 de octubre) es el número de candidatos devueltos, 14–17 → 5, que es el tope de la lista
(`hits[:top]`) introducido el 20-10 con la fusión de los cambios del compañero (8704cd7), no el preset: XA sigue sin suelo de Gauss.

**Fusión de duplicados proporcional al tamaño (25-10, 21:40, solo banco).** De las 16 que bajan con el
suelo, el motivo de la región más cercana se reparte: 4 fusionadas con una región vecina mayor dentro de
los 10 mm fijos (082_3, 090_3, 093_5, 106_1), 3 que pasan todas las puertas pero quedan tarde en la
lista (082_2, 106_2, 126_1), 4 con una región de 4–5 puntos (012_1, 035_4, 117_2, 099_3), 2 que
fallan compacidad porque el saco y el vaso forman una sola región al umbral (017_2, 082_4) y 3 la
curvatura media (032, 144, 163). La fusión solo toca las 4 primeras, y la fija a 5 o 7 mm ya recuperó
2 (puestos 31–36) perdiendo 185 (5 → 10). Se midieron en el banco cinco fusiones por tamaño de región
(`gate_bench.py`, campo `merge`: suma de radios ajustados, suma de semiextensiones de caja, mayor
extensión de caja, las dos últimas con suelo 3 y 5 mm) sobre k6:

| Variante | Entre 5 | Entre 10 | 1.º | Lista | Estudios | Hueso ctl | Cambios respecto a k6 |
|---|---|---|---|---|---|---|---|
| k6 (fijo 10 mm) | 61 | 68 | 28 | 81 | 54 | 94 | — |
| suma de radios ajustados | 60 | 68 | 30 | 84 | 53 | 96 | +032, 082_3, 090_3 (puestos 32–40); pierde 185 (5 → 10) |
| **suma de semiextensiones (≥ 3 mm)** | **61** | **68** | **30** | **83** | **54** | **93** | 012_2 y 107 pasan de 2.º a 1.º; entran 082_3 (35) y 090_3 (32); **ninguna baja** |
| suma de semiextensiones (≥ 5 mm) | 61 | 68 | 30 | 83 | 54 | 92 | igual que la anterior |
| mayor extensión (≥ 3 o 5 mm) | 60 | 67 | 30 | 81 | 53 | 94 | pierde 019 (21 mm trombosado, 3 → fuera): el saco se funde con el vaso |

La suma de semiextensiones de caja es la única que no pierde nada: mismos 61 entre 5, dos primeros
puestos más y dos lesiones más en lista (al final), controles iguales (90 de 90 con 5, hueso 94 → 93).
Es una mejora pequeña y geométricamente más limpia que los 10 mm fijos (dos regiones son la misma si
sus cajas se solapan), pero **no mueve la cifra principal** y exigiría tocar `aneurysm_detector.py`
(la deduplicación del paso 7) y una pasada real de 3 h para confirmarla. **Queda medida y sin adoptar
por ahora**; si se adopta, que sea junto con la siguiente medida para confirmar las dos en una sola
pasada. Las 12 restantes de las 16 no las toca ninguna fusión: las de 4–5 puntos y las de compacidad
piden otra cosa (diezmado o umbral local), no una regla de lista. Salida:
`backend/data/exp_gates_eval_merge.out`.

### 4.13 La resolución de la malla de curvatura con el suelo absoluto (2026-10-26, solo banco)

Con el percentil, subir el tope de la malla de curvatura de 80 000 a 160 000 vértices perdió
(§4.9: 52 → 44) porque el umbral relativo subía con los vasos finos. Con el suelo absoluto el
umbral no depende de la resolución, y las lesiones que quedan con regiones de 4–5 puntos o con el
saco fundido con el vaso son las que más resolución piden; así que se volvió a medir, esta vez en
el banco. `gate_bench.py dump --curv-cap 160000 --reuse data/exp_gates --only-ia` vuelca la malla
de curvatura a 160 000 vértices para los 82 estudios con lesión reutilizando la malla geométrica,
el árbol y el calibre del volcado base (solo cambia la curvatura): 2 min por estudio, 2,6 h
(`data/run_gates_c160.ps1`, salida `data/exp_gates_c160/`). Las regiones se copian al volcado
base como escala «c160» y el banco las combina de tres maneras (`exp_gates_eval_c160.out`,
`exp_gates_eval_2res.out`, `exp_gates_eval_union.out`; controles no volcados, hueso solo en
estudios con lesión):

| Variante (todas con K ≥ 0,028) | Entre 5 | Entre 10 | 1.º | Lista | Estudios | Hueso IA | Cambios respecto a k6 |
|---|---|---|---|---|---|---|---|
| k6, curvatura a 80 000 (preset) | 61 | 68 | 28 | 81 | 54 | 62 | — |
| curvatura a 160 000 en lugar de 80 000 | 57 | 64 | 26 | 77 | 50 | 70 | gana 9 (022 → 4, 033_1 → 1, 109_2 → 1, 087, 093_5, 116_4, 117_2, 144, 024) y pierde 14 (004 y 019 fuera, 086_1 1 → 7, 090_2 1 → fuera, 120, 126_2, 126_3…) |
| 80 000 + 160 000 como segundo canal («forma») | 63 | 72 | 23 | 82 | 55 | 62 | el segundo canal reparte la evidencia de un mismo sitio entre dos candidatos: 1.º 28 → 23 |
| 160 000 + 80 000 como segundo canal | 62 | 71 | 26 | 82 | 54 | 69 | ídem; pierde 004 (5 → 6) |
| **unión en un solo canal** (regiones de las dos resoluciones, mismas puertas, orden por área, dedup) | 62 | 70 | 32 | 80 | 54 | 69 | gana 033_1 (→ 4), 109_2 (→ 4), 022 (→ 10), 087, 116_4; **019 (21 mm trombosado) 3 → 8**, 029_1, 085_2, 090_4 y 113 fuera |
| unión + fusión por semiextensiones | 62 | 70 | 34 | 81 | 54 | 67 | como la anterior; 113 se queda (25); 6 lesiones más en 1.º (008_1, 012_2, 084, 107, 116_1/2/3, 118), 023 1 → 2, 090_2 1 → 4 |
| unión + fusión fija 5 mm | 61 | 70 | 34 | 82 | 53 | 67 | pierde un estudio |

Lectura. (a) A 160 000 solo, el suelo absoluto no basta: los sacos grandes trombosados (004, 019,
086_1) pierden su región o su puesto, porque a más resolución la región del saco compite con más
regiones de vaso de área parecida y la fusión de 10 mm la engulle (004: 4 puntos; 019: región
correcta a 1,8 mm pero 4.ª del canal). (b) Como segundo canal, las dos resoluciones ganan entre
5 y entre 10 pero destrozan el primer puesto: un candidato nuevo a 8 mm del sitio se lleva el pico
de calibre o de cociente que antes sumaba al candidato de la lesión. (c) La unión en un solo canal
es la combinación limpia y la única que mejora el primer puesto (28 → 34 con la fusión por
semiextensiones), con +1 entre 5 y +2 entre 10, misma lista y mismos estudios; pero saca a 019 del
top 5 y a tres pequeñas de la lista, sube el hueso entre los candidatos de los estudios con lesión
(62 → 67 de 410) y costaría **el doble de tiempo de detección** (dos mallas de curvatura, 52 → ~110 s
por estudio) y un cambio en `_detect_hits`. **Medida y sin adoptar**: es un reparto con saldo +1,
no una palanca. Lo que sí deja claro el experimento es que la resolución reparte: las pequeñas
(< 10 mm) quieren 160 000 y las grandes trombosadas 80 000, lo que vuelve a apuntar al tope según
tamaño de pieza (§4.9), ahora medible en el banco con los dos volcados.

**Tope según el tamaño de la pieza (26-10, 08:00): descartado sin volcar nada.** Con las filas por
lesión de los dos volcados se simula elegir por estudio 80 000 o 160 000 según los vértices de la
malla recortada (de 100 000 a 800 000, en los dos sentidos): ningún umbral pasa de 61 entre 5, y el
mejor reparto posible por estudio (oráculo que elige en cada estudio la resolución que más lesiones
mete entre 5, cota superior que ninguna regla alcanza) da 64 / 70 / 30 / 82 / 56. Los estudios que
ganan a 160 000 (033 con 187 000 vértices, 109 con 316 000, 022 con 370 000) y los que pierden (120
con 120 000, 086 con 173 000, 126 con 279 000, 004 con 300 000, 019 con 348 000, 090 con 480 000)
están mezclados en tamaño: la resolución que conviene depende de la lesión, no de la pieza, y la
pieza es lo único que el detector conoce antes de buscar. Script `cap_por_tamano.py` (scratchpad).

### 4.14 Techo de HU sobre los candidatos (2026-10-26): el hueso entre los 5 no quita puestos a las lesiones

Tras la máscara de hueso y el suelo de HU, 62 de los 410 candidatos entre los 5 de los estudios con
lesión y 94 de 450 en controles siguen en hueso (máximo ≥ 700 HU en la bola de 2 mm). Se midió la
HU de los 6 450 candidatos de la lista larga de k6 (media y máximo en bolas de 2 y 4 mm) y se
simuló quitar los que superan un techo, recalculando los puestos (`techo_hu.py`,
`techo_hu_eval.py`, scratchpad):

| Techo (bola de 2 mm salvo indicación) | Entre 5 | Entre 10 | 1.º | Lista | Lesiones quitadas | Hueso entre 5 (IA / ctl) |
|---|---|---|---|---|---|---|
| ninguno | 58* | 65 | 28 | 77 | 0 | 62/410 · 94/450 |
| máximo ≥ 700 (la etiqueta «hueso») | 58 | 64 | 29 | 74 | 3 (020 trombosado 3.º, 033_2, 163) | 0 · 0 |
| máximo ≥ 1 200 | 58 | 66 | 28 | 77 | 0 | 53 · 85 |
| media ≥ 400 | 53 | 59 | 26 | 70 | 7 | 43 · 75 |
| media ≥ 600 | 57 | 63 | 27 | 74 | 3 | 58 · 91 |
| bola de 4 mm, máximo ≥ 700 | 53 | 58 | 33 | 63 | 14 | 0 · 0 |
| bola de 4 mm, media ≥ 500 | 58 | 65 | 28 | 77 | 0 | 60 · 93 |

\* 58 y no 61 porque aquí cada candidato cuenta una vez aunque case con dos lesiones (106_1/106_2,
126_2/126_3); la comparación es entre filas de esta tabla.

Quitar todo lo etiquetado como hueso deja los 5 primeros sin hueso, pero **no sube ni una lesión
entre los 5**: los candidatos que suben a ocupar los huecos son vaso, no lesión, porque las lesiones
que faltan no están más abajo en la lista (41 de las 61 que faltan no tienen ningún candidato; de
las 20 que sí, la mitad va del 11 en adelante). Y se lleva por delante a 020 (24,5 mm trombosado,
3.º, máximo 1 176 HU por la calcificación de la pared), 033_2 y 163. Las HU de las lesiones se
solapan con las del resto de candidatos (mediana del máximo 374 frente a 434 en los no-lesión):
siete lesiones tienen media ≥ 400 HU en la bola. El único techo sin coste, máximo ≥ 1 200 HU,
quita 9 candidatos de hueso entre los 5 en estudios con lesión y 9 en controles, cosmético.
**No entra.** El hueso entre los 5 es un problema de presentación, no de puesto: lo que sube la
cifra es formar la región de las 41 que no tienen candidato (compacidad 11, curvatura media 9,
4–5 puntos 8, pgf 5, fusión 4), y eso es el umbral, no la lista.

### 4.15 Dos escalas del suelo en la misma malla (2026-10-26, 12:30): sin pérdidas, sin subir la cifra

La unión de resoluciones (§4.13) ganaba pequeñas y perdía grandes porque cambiaba la malla. La
misma mecánica sin cambiar la malla: un segundo suelo de Gauss más alto (esfera de 4,7 mm,
K ≥ 0,045, o de 4,1 mm, K ≥ 0,06) sobre la misma malla de 80 000 vértices, cuyas regiones son el
núcleo más curvado de cada saco; donde la región de 6 mm se funde con el vaso y cae en compacidad,
el núcleo fino sobrevive; donde la de 6 mm ya es buena, la fina se funde en ella (unión en un solo
canal, §4.13). Volcado de las dos escalas sobre los 172 (`run_gates_k2.ps1`, 4 h con una
suspensión del PC) y evaluación sobre los 172 (`exp_gates_eval_k2.out`):

| Variante | Entre 5 | Entre 10 | 1.º | Lista | Estudios | Hueso ctl / IA |
|---|---|---|---|---|---|---|
| k6 (esfera de 6 mm, preset) | 61 | 68 | 28 | 81 | 54 | 94 / 62 |
| esfera de 4,7 mm sola | 60 | 66 | 24 | 85 | 51 | 88 / 66 |
| esfera de 4,1 mm sola | 51 | 60 | 15 | 84 | 45 | 94 / 72 |
| 6 mm ∪ 4,7 mm, un canal | 60 | 70 | 29 | 88 | 53 | 95 / 66 |
| 6 mm ∪ 4,1 mm, un canal | 61 | 68 | 29 | 85 | 54 | 91 / 66 |
| 6 mm ∪ 4,7 mm + fusión por cajas | 60 | 70 | 30 | 90 | 53 | 91 / 65 |
| **6 mm ∪ 4,1 mm + fusión por cajas** | **61** | **68** | **30** | **89** | **54** | 89 / 66 |
| 4,1 mm como segundo canal | 61 | 69 | 27 | 86 | 53 | 95 / 65 |

La unión 6 mm ∪ 4,1 mm con fusión por cajas es la primera variante del banco que **no baja ninguna
lesión** y mejora algo: entre 5 y estudios iguales, 2 lesiones más en 1.º (012_2, 107), 8 más en
lista (017_2 al 13, 087 al 17, 097 al 22, 033_1, 082_1, 082_3, 090_3, 090_5 del 33 al 38), hueso en
controles 94 → 89. El motivo «compacidad» de la región más cercana baja de 11 a 9 y «fusión» de 4 a
0: la mecánica es la prevista, pero el núcleo fino de las fundidas entra del 13 en adelante, no entre
los 5, porque la región fina es pequeña y el orden es por área. Con 4,7 mm el núcleo es mayor y
sube más (082_1 y 082_2 al 8), pero saca a 004 del top 5 (5 → 7). Coste: un segundo umbral y
otra pasada de componentes sobre la misma malla, segundos por estudio, sin segmentar ni decimar.
**Medida y sin adoptar como palanca** (no mueve la cifra principal); es candidata a entrar junto
con la fusión por cajas (§4.12) si alguna vez se cambia el canal de curvatura, porque las dos son
gratis y no pierden nada. Lesión a lesión: `k6_vs_actual.py k6 k6_u4_mse exp_gates_eval_k2.out`.

### 4.16 El orden del canal de curvatura: área × pgf (2026-10-26, 16:00): 61 → 63 sin bajar ninguna

Con el suelo absoluto, 70 de las 122 lesiones tienen una región que pasa todas las puertas, pero
solo 45 quedan entre las 5 primeras del canal (orden por área): delante van regiones de vaso con
más área. Se compararon los rasgos de las 70 regiones de lesión con los de las 458 regiones que van
por delante de alguna (`orden_curvatura.py`, scratchpad): la lesión tiene más fracción de curvatura
gaussiana positiva (pgf, mediana 0,70 frente a 0,62), más esfericidad (0,77 frente a 0,65), menos
alargamiento de caja (1,29 frente a 1,53), menor coeficiente de variación de K (2,7 frente a 4,0) y,
curiosamente, **menos** H·r (1,34 frente a 1,66: los bultos de bifurcación son más convexos que la
cúpula de un saco). El área sigue siendo el rasgo que más separa (mediana 56 frente a 47 mm²,
p75 114 frente a 65). Doce claves de orden sobre el canal solo, y después las tres mejores en el
banco completo (consenso y suelo de HU, 172 estudios, `exp_gates_eval_orden.out` y `_orden2.out`):

| Orden del canal (sobre k6) | Entre 5 | Entre 10 | 1.º | Lista | Estudios | Hueso ctl / IA | Baja alguna |
|---|---|---|---|---|---|---|---|
| área (preset) | 61 | 68 | 28 | 81 | 54 | 94 / 62 | — |
| **área × pgf** | **63** | **69** | **30** | **82** | **56** | 94 / 64 | **ninguna** |
| área × esfericidad × pgf | 62 | 68 | 29 | 82 | 55 | 100 / 62 | 118 (4 → 13) |
| √área × esfericidad × pgf | 61 | 70 | 31 | 84 | 54 | 99 / 63 | 004 (5 → 6) |
| área × pgf + fusión por cajas | 63 | 68 | 32 | 83 | 56 | 95 / 65 | ninguna |
| área × pgf + fusión por cajas + unión con 4,1 mm | 63 | 69 | 31 | 88 | 56 | 92 / 68 | ninguna |

Área × pgf es la primera clave que gana sin perder: suben 034 (7 → 5) y 163 (7 → 1), 018 y 118
pasan del 4.º al 1.º, 084 del 2.º al 1.º, 111 del 13 al 10, y las que bajan lo hacen un puesto
dentro del top 5 (023 y 086_1 del 1.º al 2.º). La razón es la que decía el rasgo: la cúpula de un
saco es casi toda convexa (pgf alto) y una curva o bifurcación de vaso, que también pasa el suelo,
no. Esfericidad y raíz del área dan más primeros puestos pero mueven lesiones fuera del top 5. Con
la fusión por cajas y la unión de escalas encima (§4.12, §4.15) se mantiene el 63 y crecen primeros
puestos y lista. **Pasada real de confirmación en marcha desde las 16:02** (`exp_apgf.py`,
`--set order_by=area_pgf` sobre las mallas de `zenodo_eval_full_p5_sacos`, salida
`zenodo_eval_apgf`, ~3 h), con solo el cambio de orden para atribuirlo limpio; `order_by="area_pgf"`
añadido a `AneurysmDetector._order_key` (el preset sigue en «area» hasta confirmar).

**Confirmado (26-10, 20:07; 172/172, 4,0 h de reloj con la aplicación arrancada en el mismo portátil):**
`zenodo_eval_apgf` = **63 de 122 entre los 5** (61), 69 entre 10 (68), **30 en 1.º** (28), 82 en lista (81),
**56 de 82 estudios** (54); 5 fuera de malla (mismas mallas); controles 90/90 con 5 candidatos y hueso 94/450
igual; en estudios con lesión 62 → 64 de 410. Suben 15, bajan 7 (todas un puesto dentro de su tramo: 023 y
086_1 del 1.º al 2.º, 016_2 y 031 del 2.º al 3.º, 011_1 del 6.º al 7.º, 029_1 y 090_4 dos puestos en la cola);
entran en el top 5 034 (7 → 5) y 163 (7 → 1); al 1.º 018 (4 → 1), 118 (4 → 1) y 084 (2 → 1); 082_2 entra en
la lista (40). Por tamaño entre 5: < 5 mm 8 → 10, resto igual; miliares 5 → 7 de 30, blister 7 → 9 de 39;
con trombo 17/22 igual. **121 de 122 puestos iguales a la predicción del banco** (113: 19 en la pasada, 20 en
el banco). Detección 65 s de media por estudio (52 el día 25): el orden no añade cálculo; la diferencia es la
carga del portátil durante la pasada (mediana 50 → 55 s). Lesión a lesión: `cmp_dirs.py zenodo_eval_k6
zenodo_eval_apgf`.

**Llevado al código (26-10, 20:30):** `order_by="area_pgf"` en el preset de TC de
`routers/detect.py::_detector_for_modality` (XA sigue con «score»), fijado en `test_paso3_detector.py`;
suites del detector 83 verdes, 1 omitido. Regresión XA (`scripts/regresion_xa.py --label tras-orden-apgf
--compare tras-suelo-gauss`): Case 3 e IM_0055 con la lesión 1.ª de 5, malla entera y solo árbol, sin
diferencias con la línea base del 25 (XA no usa el orden nuevo). Cifra oficial: **63 / 69 / 30 / 82 / 56; 5
fuera de malla**.

### 4.17 Fusión por cajas y segunda escala del suelo (2026-10-26/27): adoptadas, 63 / 69 / 31 / 88 / 56

Decisión del usuario el 26-10 por la noche («adoptemos la medida en fusión»), sobre lo medido en
§4.12 (fusión según el tamaño de las regiones: la de cajas no baja nada), §4.15 (segunda escala del
suelo: la unión 6 mm + 4,1 mm no baja nada) y §4.16 (orden): la variante `k6_o_apgf_u4_mse` del banco
(63 / 69 / 31 / 88 / 56) es la combinación de las tres que más alarga la lista sin tocar los 63 ni los
56 estudios. Se adoptan las dos juntas porque la fusión sola (`k6_o_apgf_mse`) deja el top 10 en 68 (la
111 pasa del 10.º al 11.º) y la escala sola (`k6_o_apgf_u4`) deja el 1.º en 30.

**Lo que cambia en `services/aneurysm_detector.py` (y solo en el preset de TC de `routers/detect.py`):**

- **Fusión por cajas** (`merge_by="extent"`, `merge_min_mm=3.0`; antes `merge_dist_mm=10` fijo): dos
  candidatos se funden si distan menos que la media del lado mayor de sus dos cajas (`extent_mm`, nuevo en
  `AneurysmCandidate`), con un mínimo de 3 mm. Una región de 4 mm ya no la engulle una de vaso a 9 mm;
  dos regiones de 20 mm que se solapan siguen fundiéndose. XA conserva la fusión fija (`merge_by="fixed"`).
- **Segunda escala** (`gauss_floor_2=0.06`, K de una esfera de 4,1 mm; solo cuando hay suelo absoluto):
  las regiones conexas por encima del segundo suelo se añaden **detrás** de las del suelo principal en la
  misma lista (`regions_above(floor)` por cada suelo; `n_regions_total` cuenta las dos), pasan las mismas
  puertas, se ordenan con la misma clave (`area_pgf`) y se deduplican con la misma fusión. `gauss_threshold`
  del resultado sigue siendo el suelo principal; con el percentil (XA) el segundo suelo se ignora.
- Tests nuevos `TestFusionPorCajasYSegundaEscala` en `test_paso3_detector.py` (preset de TC y de XA; radio
  de fusión por cajas frente a fijo; regiones de la segunda escala detrás y sin efecto con percentil):
  86 verdes, 1 omitido en las seis suites del detector. Comprobación previa sobre 4 estudios (012, 107,
  163, 016) idéntica al banco.

**Pasada real de confirmación** (`exp_fusion.py` del scratchpad: `eval_zenodo --meshes-from
zenodo_eval_full_p5_sacos`, preset tal cual, sin `--set`; salida `zenodo_eval_fusion`). Lanzada el 26-10
a las 21:55, parada por la suspensión del portátil a los 100 estudios (~01:00), relanzada el 27-10 a las
09:07 donde iba y terminada a las 11:32; 5,5 h de máquina registradas.

| | Orden área × pgf (26-10) | **+ fusión por cajas + 4,1 mm (27-10)** | Banco `k6_o_apgf_u4_mse` |
|---|---|---|---|
| Entre los 5 | 63 | **63** | 63 |
| Entre los 10 | 69 | **69** | 69 |
| En primer puesto | 30 | **31** | 31 |
| En la lista de 40 | 82 | **88** | 88 |
| Estudios con la lesión entre 5 (de 82) | 56 | **56** | 56 |
| Fuera de la malla | 5 | 5 (mismas mallas) | — |
| Controles con 5 candidatos | 90 / 90 | **90 / 90** | — |
| Hueso: controles / con lesión / total | 94 / 64 / 158 | 92 / 68 / 160 | 92 / 68 |
| Detección, media / mediana por estudio | 65 / 55 s | **97 / 94 s** | — |

**121 de 122 puestos iguales a la predicción del banco** (113: 19.º en la pasada, 20.º en el banco; mismo
tramo). Cambian de puesto 22 lesiones (`cmp_dirs.py zenodo_eval_apgf zenodo_eval_fusion`):

- **Entran en la lista 7**, todas con la región fina de la segunda escala: 017_2 (3,5 mm) al 10.º, 087
  (7,5 mm) al 16.º, 097 (3,4 mm) al 20.º, 033_1 (5,5 mm) al 26.º, 082_1 (7,7 mm) y 090_3 (4,3 mm) al 29.º,
  082_3 (5,2 mm) al 31.º. Por tamaño en lista: < 5 mm 20 → 22, 5–10 mm 19 → 23.
- **Suben 5**: 012_2 (6 mm) y 107 (3,8 mm) del 2.º al 1.º, 004 (28 mm, trombo) del 5.º al 4.º, 115_1 del 4.º
  al 3.º, 126_1 del 14.º al 13.º.
- **Bajan 10**, dos de ellas cruzando una línea en el borde del tramo: 111 (5,6 mm) del 10.º al 11.º y 082_2
  (4,7 mm) del 40.º fuera de la lista (su estudio pasa de 1 a 2 lesiones en lista con 082_1 y 082_3). Las
  otras ocho, dentro del tramo: 163 (2,5 mm) del 1.º al 2.º, 083 del 6.º al 8.º, 022 23 → 24, 090_4 20 → 21,
  085_3 22 → 24, 154_2 24 → 29, 085_2 30 → 35, 029_1 31 → 38. Ninguna sale del top 5 ni ningún estudio pierde
  su lesión entre los 5.
- Entre los 5 por grupo, idéntico al 26 (trombo 17/22, ≥ 25 mm 13/16, < 5 mm 10/41, miliares 7/30,
  blister 9/39); entre los 10: < 5 mm 12 → 13 (017_2), 5–10 mm 14 → 13 (111).

**Coste:** la detección pasa de 65 a 97 s de media por estudio (mediana 55 → 94; mediana de la diferencia
por estudio +30 s, cuartiles +10 / +58). Es el segundo umbral con su conectividad sobre la copia de curvatura
de 80 000 vértices y más regiones pasando las puertas; no es carga del portátil (la pasada corrió de noche y
por la mañana sin la aplicación arrancada). Es el precio de 6 lesiones más en la lista larga y una más en
primer puesto, con los 63 y los 56 intactos: unos 7 min por estudio en total (5,7 de segmentación).

**Aviso `vtkMassProperties` (§4.7):** reaparece en 3 rondas de esta pasada y en 6 de la del 26 (164 avisos en
una ronda), así que no lo trae la segunda escala; `_clean_region` quita las líneas pero algún camino sigue
entregando celdas que no son triángulos. Inocuo para las cifras. LOCALIZADO y quitado el 27-10 (12:00): venía de `services/mesh_components.py::_measure` (prueba de árbol de `aneurysm_consensus` y `components_info` del banco), donde `vtkTriangleFilter` dejaba pasar las líneas que `vtkCleanPolyData` hace de los triángulos sin área; ahora se mide solo sobre los polígonos (`PassLinesOff` del filtro no las quita en VTK 9.6); 0 avisos en 146 (eran 92), suites del detector y de componentes verdes, sin cambio de cifras: área y volumen de una línea son 0.

**Regresión XA** (`scripts/regresion_xa.py --label tras-fusion --compare tras-orden-apgf`): Case 3 e IM_0055 con la lesión 1.ª de 5, malla entera y solo árbol, sin diferencias con la línea base del 26 (XA conserva fusión fija y sin segunda escala); terminada el 27-10 a las 11:42.

Cifra oficial desde el 27-10: **63 / 69 / 31 / 88 / 56; 5 fuera de malla**. Lo que sigue no es de detección:
las mallas no son árboles limpios (mediana 66 piezas, soporte de cabeza del escáner como pieza mayor en 016 y
017), y eso solo lo cambia la segmentación: hoja de contacto de las 172 mallas guardadas y la regla «lo que no
está dentro de la cabeza no es vaso».

### 4.18 La envolvente de la cabeza (2026-10-27/28): «lo que no está dentro de la cabeza no es vaso», aplicada y medida en los 172

**De dónde sale.** El 26-10, al enseñar los casos en primer puesto, el usuario vio modelos ruidosos: «se ve hasta
la placa del aparato que rodea la cabeza». Medido el 27-10 sobre lo guardado de la pasada de sacos, sin segmentar:

- *Registros* (`components_info` de los 172): mediana 66 piezas por malla; la pieza mayor es el 56 % de los
  vértices de mediana y menos de la mitad en 57 estudios; 46 de 172 con la pieza mayor que la propia app
  diagnostica «no es un árbol» (espesor ≥ 3,4 mm o bloque ≥ 190 cm³); máscara mediana 111 cm³ (un árbol
  intracraneal son 10–20).
- *Renders* (`render_meshes.py`, tres vistas por malla, pieza mayor en rojo, 172 en 12 min; hojas de contacto
  `hoja_01..18.png` en el scratchpad): el SOPORTE DE CABEZA del escáner (una cuna curva de 2–5 mm de grosor o dos
  placas laterales, > 150 HU) está en la malla en la mayoría de los estudios y es la pieza MAYOR en 004, 005, 011,
  015, 016, 017, 025, 039 y 041 (y a medias en 028, 038, 040). Con el soporte como pieza mayor, el prefiltro del
  detector (componentes < 5 % de la mayor) borra ramas reales y la prueba de árbol falla.
- *Mallas sobre volúmenes* (`head_mask_test.py`): en 016 el soporte está CONECTADO al árbol en la malla (una
  misma pieza con el 33 % de sus puntos fuera de la piel), en 017 también (36 % de la segunda pieza). Y hay una
  segunda contaminación, dentro de la cabeza: tabiques finos de los senos paranasales y las celdas mastoideas
  (hueso de volumen parcial que la máscara de hueso no quita; en 036 el 10 % de la pieza mayor).

**La regla** (`services/head_mask.py`, sin pesos): cabeza = todo lo que no es aire (> −300 HU) → apertura de 4 mm
(separa una lámina de un bloque; en 016 las dos placas de 71 y 43 cm³ desaparecen y la cabeza queda en 2 532 cm³)
→ componente mayor → envolvente CONVEXA corte a corte (los senos y las órbitas son aire abierto al exterior que
el relleno de agujeros no cierra; la cabeza es convexa). Se calcula a ~3 mm de vóxel (décimas de segundo) en
`segment_tubular`, tras la banda, y la máscara vascular se RESTRINGE a ella (`build_vascular_mask(within=…)`:
M0 ∧ dentro, también en cada baldosa de la banda nativa vía `refine_in_band(inside=…)`), **después** de calcular
los percentiles de tubularidad sobre todo M0. Solo en TC; no se aplica si la «cabeza» no llega a 400 cm³.
`info["head_mask"]` guarda cabeza y tejido fuera en cm³; `stats["outside_vox"]`, lo que M0 pierde.

**Dos formas de aplicarla que NO valen, medidas en 004 (14:00–14:30):** (a) poner aire (−1 024 HU) fuera de la
envolvente en el volumen; (b) restringir M0 antes de los percentiles. Las dos dejan 004 en 2,9 cm³ con 4 semillas
(era 146 cm³ con 52) y la lesión FUERA de la malla; con (a) la pasada completa se paró a los 18 estudios (003,
004 y 005 a 3–7 cm³) y se borró. La causa es la misma en las dos: los umbrales de semilla (p90) y crecimiento
(p40) son percentiles de la tubularidad DENTRO de M0, y en 004 el soporte era 112 de los 146 cm³ de M0, con
tubularidad baja: mantenía los percentiles bajos y los vasos los superaban de sobra. Sin el soporte en la
población, p90 y p40 suben y los vasos ya no los alcanzan. Es decir, hasta hoy la receta estaba calibrada en
parte por la contaminación. Con los percentiles de siempre (sobre todo M0) y la restricción después, 004 queda
en 30,7 cm³ con 47 semillas, pieza mayor árbol de 17,6 cm³ y la lesión en la malla (4.º puesto, antes fuera de
la lista). Los percentiles como umbral relativo quedan apuntados como la siguiente cosa a revisar en la máscara.
Tests `test_head_mask.py` (fantoma: esfera con cráneo, seno abierto, vaso, cuna separada y placa pegada; 5 verdes)
y las 8 suites que usan la receta (97 verdes, regresión XA incluida).

**Medida antes de la pasada.** Sobre las mallas guardadas, con la envolvente calculada de los volúmenes de la
pasada (7 estudios, 12 lesiones): las 12 lesiones al 100 % dentro; pieza mayor de 036 (vasos) 1 % fuera, control
001 1,5 % fuera; en 016 y 017 la parte de soporte de las piezas grandes, fuera. Segmentados desde el DICOM con la
regla (`zenodo_eval_head_test`, 016 y 017):

| | 016 sacos | **016 envolvente** | 017 sacos | **017 envolvente** |
|---|---|---|---|---|
| Máscara | 112,8 cm³ | **18,3 cm³** | 150,2 cm³ | **31,1 cm³** |
| Piezas | 67 | 72 (más pequeñas) | 32 | **15** |
| Pieza mayor | 57,7 cm³ · 3,45 mm · no árbol | **6,4 cm³ · 1,16 mm · árbol** | 114,4 cm³ · 1,84 mm · no árbol | **27,4 cm³ · 1,52 mm · árbol** |
| Vértices | 421 980 | 150 319 | 656 245 | 176 912 |
| Lesiones (recall) | 0,99 / 0,99 | 0,99 / 0,98 | 1,00 / 0,98 | 1,00 / 0,98 |
| Puesto | 1.º / 2.º | 2.º / 3.º | 1.º / 3.º | 4.º / 1.º |
| Cabeza / tejido fuera | — | 2 731 / 160 cm³ | — | 2 349 / 222 cm³ |
| Segmentación | 371 s | 342 s | 270 s | 310 s |

Los renders de 016 y 017 (`render_head_test/`) ya no tienen soporte: en 017 el árbol es el 92 % de la malla.
Los puestos de las lesiones se mueven (la malla es otra y el detector compara contra otras regiones): eso lo
decide la pasada de los 172, no dos estudios.

**Pasada completa TERMINADA** (27-10 14:37 → 28-10 13:36, con una parada por apagado del PC de 00:50 a 08:08;
`zenodo_eval_full_p6_head`, 172/172, segmentación desde el DICOM). Contraste estudio a estudio contra la pasada
de sacos (segmentación) y contra la de fusión (detección: mismas mallas de sacos, mismo detector); la tabla de
los 172 volúmenes está en `docs/zenodo-envolvente-volumenes-2026-10-28.csv` (máscara, pieza mayor, árbol,
piezas, semillas, segundos, cabeza y tejido fuera, candidatos y puestos, antes y después).

**Segmentación (172 estudios, sacos → envolvente).**

| | Sacos | **Envolvente** |
|---|---|---|
| Máscara, mediana (media) | 111 (119) cm³ | **34 (38) cm³** |
| Máscaras < 10 / 10–20 / 20–40 / 40–60 / > 60 cm³ | 0 / 8 / 16 / 20 / 128 | **6 / 25 / 80 / 46 / 15** |
| Pieza mayor, mediana | 39 cm³ | **22 cm³** |
| Pieza mayor > 60 cm³ / < 10 cm³ | 51 / 11 | **8 / 30** |
| «Parece árbol» | 126 | **169** |
| Piezas, mediana | 66 | 64 |
| Semillas, mediana | 42 | 31 |
| Vértices, mediana | 387 000 | **167 000** |
| Lesiones cuyo recubrimiento baja > 5 % | — | **0** |
| Lesiones fuera de la malla | 5 | 5 |
| Segmentación, mediana | 339 s | **211 s** |
| Envolvente aplicada; cabeza / tejido fuera, mediana | — | 172; 2 839 / 140 cm³ |

Las máscaras convergen a la escala de un árbol: 80 de 172 en 20–40 cm³ (eran 16) y 15 por encima de 60 (eran
128). Ninguna sube. Las 10 mayores bajadas son de 183–198 cm³ (134, 088, 124, 195, 078, 056, 077, 039, 148,
186): soporte entero. Los 8 estudios con el soporte como pieza mayor de §4.18 pasan todos a árbol (015: 174 →
15 cm³; 039: 194 → 27; 041: 140 → 8).

*Las 15 que siguen por encima de 60 cm³* (022 79, 062 65, 066 63, 068 72, 072 126, 084 148, 085 75, 116 93,
117 61, 123 159, 127 73, 138 66, 156 75, 157 70, 180 136; renders en `render_cmp/head/`): en 084, 123 y 180 la
pieza mayor sigue siendo un bloque de 129–152 cm³ DENTRO de la cabeza, y es el cráneo entero (bóveda y base) que
la máscara de hueso no quita, con el árbol dentro; en 072 es el macizo facial. Es el siguiente frente, hueso,
no soporte: la envolvente no lo toca porque está dentro.

*Las 6 que quedan por debajo de 10 cm³* (050 12,6 → 8,2; 078 205 → 9,7; 095 10,2 → 8,6; 141 74,5 → 9,2; 181
92,5 → 0,3; 188 140 → 3,5). 050 y 095 ya eran pequeñas y sus lesiones siguen al 100 % y en 1.º–2.º / 1.º. Las
otras cuatro son controles y se diagnosticaron reproduciendo la pasada gruesa de 181 sobre el volumen guardado
(`diag_181.py`): de las 18 semillas de antes, 16 estaban enteras en el soporte y las dos de dentro dan 6,8 cm³;
la «pieza mayor» de 54 cm³ de antes era el 90 % tabiques de la base del cráneo (senos, celdas mastoideas) y el
resto soporte. Son estudios con poco contraste: tejido en 180–600 HU dentro de la cabeza y lejos del hueso
5,7–11,9 cm³ (001, 003, 045 y 002: 15–22), percentil 99,5 de las partes blandas 178–240 HU (223–309). Lo que
tenían antes no era árbol; la envolvente no ha quitado vaso.

**Detección (122 lesiones, fusión → envolvente).**

| | Fusión (mallas de sacos) | **Envolvente** |
|---|---|---|
| Entre los 5 | 63 | **67** |
| Entre los 10 | 69 | **73** |
| En 1.º | 31 | **21** |
| En la lista | 88 | **94** |
| Estudios con acierto (de 82) | 56 | 56 |
| Fuera de la malla | 5 | 5 |
| Controles con 5 candidatos | 90/90 | 90/90 |
| Candidatos en hueso en controles (de 450) / sobre vaso | 92 / 321 | 115 / 293 |
| Detección, mediana | 94 s | **60 s** |
| < 5 mm (41): entre 5 / lista | 10 / 22 | **12 / 26** |
| 5–10 mm (32) | 12 / 23 | **15 / 24** |
| ≥ 10 mm (49) | 41 / 43 | 40 / 44 |
| Miliares (30) / blister (39) / saculares (36) / fusiformes (26) / otros (21), entre 5 | 7 / 9 / 22 / 19 / 13 | 8 / 11 / 24 / 18 / 14 |
| Gigantes (16) / grandes (20) / medianos (56), entre 5 | 13 / 19 / 24 | 11 / 19 / 29 |
| Con trombo (22) / calcificados (20), entre 5 | 17 / 17 | 16 / 16 |

Entran 9 entre los 5 (017_2 de 3,5 mm del 10.º al 3.º; 024, el gran trombosado, de «sin puntos» al 4.º; 033_2;
035_4 y 115_2 de 3 mm, sin región antes; 082_1 y 082_2; 087; 099_3) y salen 5 (019, fusiforme trombosado de
21 mm, 3.º → fuera por compacidad; 034, 3 mm, 5.º → 10.º; 086_1, fusiforme de 30 mm, 2.º → 9.º con la región
reducida a 4 puntos; 090_2, 3 mm, 1.º → fuera por compacidad; 116_2, fusiforme de 20 mm, 2.º → 7.º). Los
fusiformes grandes pierden: su región ya no es una cúpula.

**El primer puesto baja de 31 a 21 y es un efecto del detector, no de la malla.** Pierden el 1.º 12 lesiones
(017_1, 018, 037, 038, 051, 089, 090_2, 102, 105, 118, 121, 161) y lo ganan 2 (023 y 163). En 10 de las 12
el nuevo 1.º es una región de **curvatura** sobre vaso a 31–86 mm de la lesión, y en 6 (037, 038, 102, 105,
121, 161, lesiones de 14–30 mm) la cúpula de la lesión aparece **partida en 2–3 candidatos** (puestos 2 y 3,
o 2, 3 y 5) donde antes era una sola región en 1.º. La causa está en la copia de curvatura: se diezma a 80 000
vértices, y la malla tiene ahora la mitad de vértices (mediana 387 000 → 167 000) porque ya no lleva el
soporte; el diezmado es la mitad de fuerte, las regiones de curvatura se afinan, las cúpulas grandes se parten
y las curvas de vaso compiten. Es el mismo mecanismo que hizo perder al tope doble y triple (§4.9), al revés.
Lo mismo explica el hueso en controles (92 → 115 de 450): con el soporte fuera y más detalle, los 5 candidatos
de los controles caen más en cráneo. **Experimento en marcha** sobre las mallas de la envolvente, sin segmentar:
tope de la copia de curvatura a 40 000 (`exp_curv_cap_head.py`, `data/run_head_cap.ps1` →
`zenodo_eval_head_cap_40000`), que devuelve al árbol el diezmado relativo que tenía cuando la mitad de los
vértices eran soporte. Primero sobre los 26 estudios que se mueven, luego los 172 si recupera.


**El tope de la copia de curvatura sobre las mallas limpias, medido (28-10, 14:39–16:48).** Sobre los 28 estudios
que se mueven (los 25 con lesiones que cambian de puesto entre fusión y envolvente, más los controles 001, 003
y 045), detección sin segmentar con el tope a 40 000 y a 60 000 (`zenodo_eval_head_cap_40000` y `_60000`):

| 28 estudios (45 lesiones) | Fusión (80 000, con soporte) | **Envolvente, 80 000** | Envolvente, 60 000 | Envolvente, 40 000 |
|---|---|---|---|---|
| Entre los 5 | 23 | **27** | 25 | 24 |
| · < 10 mm / ≥ 10 mm | 9 / 14 | 14 / 13 | 11 / 14 | 10 / 14 |
| Entre los 10 | 26 | **32** | 29 | 30 |
| En 1.º | 13 | 3 | 9 | **13** |
| En la lista | 33 | **40** | 36 | 36 |
| Estudios con acierto | 21 | 21 | 19 | 20 |
| Hueso en los 3 controles | 4 | 4 | 5 | 4 |
| Detección, mediana | 87 s | 62 s | 58 s | 37 s |

Es el reparto de §4.9, al revés y sin punto intermedio: con 40 000 vuelven al 1.º los sacos grandes (018, 033_2,
037, 086_1, 089, 099_2, 102, 121, 161) y la detección baja a 37 s, pero las pequeñas y trombosadas que el modelo
limpio había traído pierden su región (017_2 de 3,5 mm, 024 de 20 mm con trombo y 035_4 de 3 mm; 051 del 5.º
al 13.º). Con 60 000 se pierde por los dos lados (25 entre 5, 9 en 1.º, 19 estudios) y los puestos saltan sin
orden entre topes (087: 3.º → 19.º → 2.º; 115_2: 2.º → 24.º → 2.º): el puesto entre candidatos depende de
unos cientos de vértices, como ya se sabía de los dos casos XA. **El tope se queda en 80 000.**

**Veredicto.** La envolvente ENTRA. Como segmentación no baja nada y el modelo que ve el médico pasa a ser el
árbol (169 de 172 «parece árbol»; 80 estudios entre 20 y 40 cm³). Como detección, sobre esos modelos: **67 de
122 entre los 5** (de 63), **73 entre 10** (de 69), **94 en la lista** (de 88), **56 de 82 estudios** (igual),
5 fuera de la malla (igual), controles 90/90 con 5, 60 s de detección (de 94); el coste es el **primer puesto, 31 →
21**, que no se recupera con el tope sin perder entre 5, y que de todos modos nunca se ha podido prometer. El
hueso en controles sube de 92 a 115 de 450 (de 321 a 293 sobre vaso): con el soporte fuera, los 5 candidatos
de un control caen más en el cráneo que sigue dentro del modelo (084, 123, 180…), y ese es el siguiente frente.
Nueva referencia de detección: **67 / 73 / 21 / 94 / 56; 5 fuera**. Regresión XA sin diferencias.

### 4.19 Dos puertas del canal de curvatura sobre el modelo limpio (2026-10-29): 67 / 73 / 21 / 94 / 56 → 68 / 74 / 24 / 96 / 57

**De dónde sale.** Con la envolvente adoptada (§4.18) quedaban 55 lesiones fuera de los 5 y el primer puesto había
bajado de 31 a 21. El desglose de las 55 sobre la pasada: 27 en la lista pero atrás (6 en 6–10, 21 en 11–40, casi
todas < 10 mm y por el canal de curvatura), 23 con región pero tirada por una puerta (tope 5, compacidad 7,
curvatura media 6, puntos 3, fusión 1, sin región 1) y 5 fuera de la malla. Para medir reglas en minutos y no en
horas se volcó el banco de puertas (§4.12) sobre las mallas de la envolvente: `data/run_gates.ps1 -Src
zenodo_eval_full_p6_head -Out exp_gates_head` (172 estudios, tres escalas de Gauss: percentil 85, K ≥ 0,028 y
K ≥ 0,06; 28-10 17:44 → 29-10 13:07, en rondas de 6 estudios porque el proceso de volcado retiene 1,5 GB por
estudio). La variante que calca el detector real (K ≥ 0,028 + unión con 0,06, orden área × pgf, fusión por
cajas) reproduce 89 de los 122 puestos de la pasada; las 33 diferencias son del diezmado no determinista de las
dos copias (la copia de curvatura del volcado no es la de la pasada), y por eso cada regla se mide primero contra
la referencia del propio banco y después con una pasada real.

**Lo que NO era.** La hipótesis de la mañana era el radio de acuerdo del consenso: en 7 de las 12 lesiones que
perdieron el 1.º (037, 038, 089, 102, 105, 121, 161, cúpulas de 8–30 mm) el sitio sigue siendo 1.º de calibre
y de cociente pero sin la familia «forma», y el empate lo gana una región de curvatura del vaso a 36–86 mm. Un
acuerdo proporcional al radio (máx(8 mm, k × radio mayor), k de 0,75 a 1,5) no mueve ni un puesto en los 172,
ni la fusión de regiones por esfera (dos trozos de la misma cúpula tienen el mismo radio ajustado), ni la suma de
claves al fundir (1.º +1 pero 3 lesiones fuera de la lista), ni el tope del canal a 60 (006 sale de la lista: más
sitios de curvatura en el consenso empujan la cola de los 40). Lo que pasa de verdad se ve región a región:

| Lesión | Región de curvatura de la cúpula (mallas limpias) | Puerta que la tira |
|---|---|---|
| 038 (14 mm) | 124 puntos, 64 mm², pgf 0,81, H·r 1,00, esfericidad 0,51, **compacidad 0,18** | compacidad (0,2) |
| 051 (7,7 mm) | 14 puntos, pgf 0,86, H·r 0,96, **compacidad 0,19** | compacidad (0,2) |
| 025 (25 mm) | 36 puntos, pgf 0,89, H·r ≈ 1, **compacidad 0,14–0,18** (tres trozos) | compacidad (0,2) |
| 037 (21 mm, trombosado) | 170 puntos, 109 mm², pgf 0,75, **H·r = −1,34** | curvatura media (signo) |

La cúpula de un saco grande sale con compacidad 0,10–0,19 (compacidad = área / esfera de la caja: una cúpula
partida o alargada no llena su caja) y la puerta fija de 0,2 la tira. En el 037 la región es la **luz interior**
del saco trombosado: en la malla de curvatura, alrededor de la lesión la curvatura media es negativa (mediana
−0,27 a < 5 mm, 0,45 en el resto de la malla) y el 30 % de las normales apuntan hacia dentro: una cúpula cóncava.

**Las dos puertas, y por qué condicionadas.** Relajar la compacidad a 0,15 a secas reparte (en 59 estudios: 1.º
11 → 14 pero 018 del 3.º al 9.º y 016 del 1.º al 2.º): entran regiones de vaso de 100–230 mm² con pgf 0,58–0,69
que, con el orden por área, adelantan a lesiones. Con compacidad 0,10 solo si pgf ≥ 0,80 entraban aún en 085
regiones de 134–153 mm² con pgf 0,81–0,86 pero **H·r 2,0–2,2** (radio ajustado 7,7 mm, esfericidad 0,45: un
tramo de vaso grueso, no una esfera) y la lesión de 085 pasaba del 7.º al 13.º. Una cúpula tiene H·r ≈ 1 (038:
1,00; 051: 0,96; 025: ≈ 1). De ahí la regla: **a una región muy convexa (pgf ≥ 0,75) con curvatura de esfera
(H·r ≤ 1,5) le basta compacidad 0,10**. Y para el signo: **la curvatura media se mira en valor absoluto cuando
pgf ≥ 0,75**; sin la condición de pgf entran sillas cóncavas de bifurcación (109: tres regiones con pgf 0,58–0,72
y H·r −1,1 a −3,0) y una lesión de 3 mm sale de la lista. Medido en el banco sobre los 172, contra su referencia
(62 / 69 / 17 / 91 / 53; hueso en los 5 de los controles 108 de 450):

| Variante (banco, 172) | Entre 5 | Entre 10 | 1.º | Lista | Estudios | Baja alguna banda |
|---|---|---|---|---|---|---|
| Referencia del banco | 62 | 69 | 17 | 91 | 53 | — |
| Acuerdo ∝ radio (0,75–1,5) / fusión por esfera | 62 | 69 | 17 | 91 | 53 | no mueve nada |
| Compacidad 0,10 si pgf ≥ 0,75 y H·r ≤ 1,5 | 62 | 69 | 22 | 92 | 53 | no |
| \|H·r\| si pgf ≥ 0,75 | 63 | 70 | 19 | 92 | 53 | no |
| **Las dos juntas** | **63** | **70** | **25** | **93** | 53 | **no** (hueso ctl 110) |
| Las dos con pgf ≥ 0,70 en la compacidad | 64 | 70 | 27 | 94 | 54 | sí: 109_2 (3 mm) sale de la lista |
| Las dos con pgf ≥ 0,80 en el signo | 63 | 70 | 23 | 93 | 53 | no, pero sin 037 |

Entra la combinación con 0,75 en las dos: la de 0,70 gana dos primeros (035_1, 086_1) a cambio de una lesión
fuera de la lista, y el criterio es que no baje nada en ninguna banda. Código: `AneurysmDetector(compactness_lax,
compactness_lax_pgf, compactness_lax_hr_max, mean_curv_abs_pgf)` en `services/aneurysm_detector.py`, activadas
solo en el preset de TC de `routers/detect.py` (XA y el detector por defecto siguen igual); tres tests en
`test_paso3_detector.py` (preset; la compacidad relajada solo con convexidad y curvatura de esfera, probada con
una esfera entera y una puerta fija de 1,01; el valor absoluto solo con convexidad alta, probado con la malla
invertida con `vtkReverseSense`).

**Pasada real** (`data/run_puertas.ps1` → `zenodo_eval_puertas`: detección sobre las mallas y volúmenes guardados
de la envolvente, 29-10 13:20 → 17:47; tabla por lesión en `docs/zenodo-puertas-lesiones-2026-10-29.csv`), frente
a la pasada de la envolvente (mismas mallas):

| Medida | Envolvente (28-10) | Con las dos puertas (29-10) |
|---|---|---|
| Lesiones entre los 5 / entre los 10 | 67 / 73 | **68 / 74** |
| En primer puesto | 21 | **24** |
| En la lista de 40 | 94 | **96** |
| Estudios con lesión entre los 5 | 56 de 82 | **57** |
| Fuera de la malla | 5 | 5 |
| < 5 mm: entre 5 / entre 10 / 1.º / lista | 12 / 15 / 3 / 26 | 12 / 15 / 3 / 26 |
| 5–10 mm | 15 / 16 / 4 / 24 | 15 / 17 / 5 / 26 |
| ≥ 10 mm | 40 / 42 / 14 / 44 | 41 / 42 / 16 / 44 |
| Controles con 5 candidatos | 90 de 90 | 90 de 90 |
| Hueso en los 5 de los controles | 115 de 450 | 117 de 450 |
| Segundos de detección (mediana) | 60 (en la pasada completa) | 77 (en modo mallas guardadas; la de fusión, en ese mismo modo, 94) |

Suben: 008_2 (9 mm) de fuera de la lista al 1.º, 037 (21 mm, trombosado) del 3.º al 1.º, 038 (14 mm) del 2.º
al 1.º, 091 (30 mm) del 3.º al 1.º, 086_1 (30 mm) del 9.º al 2.º, 082_3 (5 mm) de fuera al 17.º. Bajan dos, y
ninguna por las puertas: 025 (25 mm) del 1.º al 2.º porque ahora los **tres** primeros sitios están sobre el saco
(a 9–13 mm de su centro, calibre 1.º + curvatura, cociente 1.º + curvatura, cociente 2.º) y el emparejamiento
con la lesión escoge el segundo; y 115_1 (9,9 mm) del 3.º al 10.º porque su puesto de **calibre** pasa del 2.º al
6.º y pierde el voto de cociente, canales que las puertas no tocan: es el diezmado no determinista de la copia
geométrica, que en este modo se vuelve a calcular. El resto de movimientos son de uno o dos puestos en la cola de
la lista. Las puertas son comparaciones sobre números que ya se calculaban: no añaden coste.

**Veredicto.** Las dos puertas ENTRAN. Nueva referencia de detección: **68 / 74 / 24 / 96 / 57; 5 fuera**; controles
90/90 con 5. Regresión XA (Case 3 e IM_0055, preset XA sin cambios): sin diferencias.

**Lo que queda, visto desde el banco con las puertas puestas** (59 lesiones fuera de los 5 en la referencia del
banco): 23 en la lista en puestos 11–40 (10 de < 5 mm, 11 de 5–10), 7 en 6–10, **4 con región propia de saco
pequeño a la escala de 4 mm (029_1, 098, 101, 154_2: H·r ≈ 1, esfericidad 0,6–0,75) pero cortadas por el tope
de 40 del canal de curvatura**, 7 con la región tirada por compacidad con pgf 0,64–0,71 (justo bajo el 0,75), 7 por
curvatura media (planas con H·r 0,3–0,6, o cóncavas con pgf bajo), 6 regiones de 4–6 puntos y las 5 fuera de
malla. Dos medidas concretas salen de aquí: (1) el consenso funde un pico de calibre con el **primer** sitio a
≤ 8 mm en el orden de la lista, no con el más cercano, y reparte votos entre dos sitios vecinos; (2) los sacos
pequeños que forman región propia quedan detrás por el orden por área: no es una puerta, es un canal propio
(«saco pequeño»: región con H·r ≈ 1 y esfericidad alta, ordenada por esfericidad) con su cuota en el consenso.

### 4.20 Canal de «saco pequeño» con cuota del 5.º puesto (2026-10-30): 68 / 74 / 24 / 96 / 57 → 71 / 80 / 24 / 96 / 59

**De dónde sale.** El desglose de §4.19 dejaba dos grupos que no son de puertas: 23 lesiones en la lista pero en los
puestos 11–40 (casi todas < 10 mm, por el canal de curvatura) y 4 sacos pequeños (029_1, 098, 101, 154_2) con
región propia a la escala de 4 mm, H·r ≈ 1 y esfericidad 0,6–0,75, cortados por el tope de 40 del canal. Las dos
cosas tienen la misma causa: el canal de curvatura ordena por área × pgf (§4.16), y un saco de 3–5 mm tiene
10–30 mm² de cúpula frente a los 100–200 mm² de una región de vaso convexa. No es una puerta (la región existe y
pasa las puertas): es el orden. Y cambiar el orden del canal reparte (§4.16 ya lo midió). De ahí un canal propio.

**El canal.** Entre las regiones que ya pasan las puertas del canal de curvatura, antes de la fusión y del tope,
«saco pequeño» es la que tiene radio ajustado ≤ 3,5 mm, curvatura de esfera (0,7 ≤ H·r ≤ 1,3), esfericidad
≥ 0,6, compacidad ≥ 0,3 y pgf ≥ 0,7. Se ordenan por **esfericidad × pgf** (forma, no tamaño), se funden con la
misma regla de cajas del canal y se quedan las 10 primeras (`AneurysmDetector(small_sac_channel, small_sac_top,
small_sac_r_max, small_sac_hr, small_sac_sphericity, small_sac_compactness, small_sac_pgf)`;
`DetectionResult.small_sacs`). En el consenso cada una se une al sitio ya existente a ≤ 8 mm o abre uno nuevo con
la etiqueta `saco`. **El canal no vota**: no entra en el orden (el mejor puesto y la suma de puestos se calculan
sin él), no cuenta como familia salvo que sea el único canal del sitio, y su confianza va detrás de cualquier
canal que vote. Lo único que hace es la **cuota**: si entre los 5 primeros no hay ningún sitio del canal, el mejor
que lleve la etiqueta pasa al 5.º puesto y los de detrás bajan uno (`_apply_small_sac_quota`, `small_sac_quota=5`,
solo en el preset de TC). Es decir: el 5.º candidato de la lista puede ser «el mejor saco pequeño», y así hay que
enseñarlo.

**Por qué no vota.** Se midió en el banco de puertas (§4.19, variante `real_mix2` con las dos puertas como
referencia: 63 / 70 / 25 / 93 / 53 en los 172):

| Variante (banco, 172) | Entre 5 | Entre 10 | 1.º | Lista | Estudios | Qué pasa |
|---|---|---|---|---|---|---|
| Referencia (dos puertas) | 63 | 70 | 25 | 93 | 53 | — |
| Fusión del consenso con el sitio más cercano (no el primero) | 63 | 71 | 25 | 93 | 53 | reparte: 110 2.º → 1.º pero 011_1 11.º → 29.º y 014 1.º → 3.º |
| Canal con puestos propios y familia «saco» | 68 | 77 | 22 | 94 | 56 | reparte: 105, 107, 108, 126_2/3 pierden el 1.º |
| Ídem con esfericidad ≥ 0,7 | 65 | 76 | 23 | 93 | 55 | ídem (126, 108) |
| Puestos propios desde el 2.º / 3.º / 4.º | 63 | 76 / 74 / 70 | 23 | 94 | 53 | solo gana entre 10; 126 pierde el 1.º |
| Cuota del 5.º, votando | 65 | 74 | 23 | 93 | 55 | 126_2/3 pierden el 1.º |
| **Cuota del 5.º, sin votar** | **65** | **74** | **25** | **93** | **55** | **ninguna banda baja**; hueso en controles 110 → 111 |
| Cuota del 4.º, sin votar | 65 | 74 | 25 | 93 | 55 | 016_2, 018, 030, 033_2, 087 bajan un puesto |
| Cuota del 5.º sin votar, esfericidad ≥ 0,7 | 65 | 75 | 25 | 93 | 54 | 033_1 entra al 5.º pero 085_1 sale (7.º → 8.º), un estudio menos |

Con puestos propios el canal gana entre 5 y entre 10 pero mueve el 1.º: un saco de 3 mm del vaso adelanta al
sitio de la lesión en 105, 107, 108 y 126 porque suma una familia. Con la cuota sin voto el canal solo rellena el
5.º: gana lo mismo entre 5 (+2 en el banco) y no toca los cuatro primeros. Entra esa. Tests en
`test_saco_pequeno.py` (preset de TC lo lleva, XA y el detector por defecto no; el canal elige por forma y radio
sobre un vaso con dos esferas; el canal no entra en el orden ni en las familias; la cuota garantiza el 5.º y no
toca nada si ya hay uno; el consenso solo la aplica con el canal).

**Pasada real** (`data/run_puertas.ps1 -Out zenodo_eval_saco` → `zenodo_eval_saco`: detección sobre las mallas y
volúmenes guardados de la envolvente, 29-10 20:19 → 30-10 00:24; tabla por lesión en
`docs/zenodo-saco-lesiones-2026-10-30.csv`), frente a la pasada de las dos puertas (mismas mallas):

| Medida | Dos puertas (29-10) | Con el canal de saco pequeño (30-10) |
|---|---|---|
| Lesiones entre los 5 / entre los 10 | 68 / 74 | **71 / 80** |
| En primer puesto | 24 | 24 |
| En la lista de 40 | 96 | 96 |
| Estudios con lesión entre los 5 | 57 de 82 | **59** |
| Fuera de la malla | 5 | 5 |
| < 5 mm: entre 5 / entre 10 / 1.º / lista | 12 / 15 / 3 / 26 | **13 / 17** / 3 / 26 |
| 5–10 mm | 15 / 17 / 5 / 26 | **17 / 20** / 5 / 26 |
| ≥ 10 mm | 41 / 42 / 16 / 44 | 41 / **43** / 16 / 44 |
| Controles con 5 candidatos | 90 de 90 | 90 de 90 |
| Hueso en los 5 de los controles | 117 de 450 | **111 de 450** |
| Segundos de detección (mediana, modo mallas guardadas) | 77 | 73 |

Suben ocho, todas por la cuota: 011_1 (3,0 mm) del 11.º al 4.º, 022 (9,8 mm) del 17.º al 5.º, 034 (3,0 mm) del
10.º al 5.º, 083 (11,7 mm) del 34.º al 4.º, 106_1 y 106_2 (5,2 mm, el mismo sitio) del 22.º al 5.º, 113 (4,6 mm)
del 17.º al 5.º y 115_1 (9,9 mm, la que §4.19 perdió por el calibre) del 10.º al 4.º. Ceden el 5.º puesto al 6.º
cinco (017_1, 051, 118, 121, 185) y 004 pasa del 4.º al 5.º: es el precio de la cuota, un puesto, y ninguna sale
de los 10 ni de la lista. Por banda de tamaño no baja ninguna cifra; **por grupo clínico sí, ese puesto**: 121
(23 mm, trombosado, bifurcación sin tipo) deja «grandes» en 18 de 20 (de 19) y «con trombo» en 16 de 22 (de 17),
y con 017_1 y 051 (bifurcaciones sin tipo de 8 mm) el tipo «otro» pasa de 14 a 11 entre los 5; las tres siguen
entre los 10 y la cuota no las toca en la lista. El resto de movimientos son de un puesto en la cola. En los 172 estudios el 5.º sitio
lleva la etiqueta del canal en 113; de los 168 sitios con etiqueta entre los 5, solo 8 son del canal a secas (los
demás eran ya sitios de curvatura más atrás) y el tejido es vaso en 113, hueso en 40 y otro en 15: por eso el
hueso en controles baja (el saco pequeño que sube al 5.º desplaza a un sitio de hueso que estaba ahí). Sin coste
de tiempo (el canal filtra regiones ya calculadas).

**Veredicto.** El canal con cuota ENTRA, con ese coste declarado (tres lesiones del 5.º al 6.º por el sitio de la
cuota; a cambio, ocho del 10.º–34.º al 4.º–5.º y seis sitios de hueso menos en los controles). Nueva referencia de detección: **71 / 80 / 24 / 96 / 59; 5 fuera**;
controles 90/90 con 5. Regresión XA (Case 3 e IM_0055, preset XA sin el canal): sin diferencias. Para la
interfaz: el 5.º candidato puede ser el sitio de la cuota y debe decir «saco pequeño» en vez de prometer un voto
que no tiene.

**Lo que queda** (51 lesiones fuera de los 5): 25 en la lista en los puestos 6–40, 21 con región pero sin sitio
en la lista (compacidad con pgf 0,64–0,71, regiones planas con H·r 0,3–0,6, regiones de 4–6 puntos) y las 5 fuera
de la malla. La fusión del consenso con el sitio más cercano se midió aquí y reparte: no entra. Los frentes que
siguen son de segmentación, no de orden: las 15 piezas > 60 cm³ con cráneo dentro del modelo (§4.18) y las 5
lesiones fuera de la malla.

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
