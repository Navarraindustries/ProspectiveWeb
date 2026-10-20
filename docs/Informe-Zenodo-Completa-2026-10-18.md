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

## 5. Código y datos de esta pasada (sin commit)

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
