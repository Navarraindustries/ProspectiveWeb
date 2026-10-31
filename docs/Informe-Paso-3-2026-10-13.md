# Paso 3 del plan Zenodo — el detector sobre la malla limpia (2026-10-13)

Encargo: «vamos con el paso 3». Tras los pasos 1 y 2 (informe anterior) la malla de una
angio-TC ya es un árbol vascular sin cráneo con 12 de 13 lesiones dentro, y el detector,
calibrado sobre la malla con hueso, las dejaba en los puestos 5 a 19 o fuera. Este paso
cambia el detector, no la segmentación. Todo sin commit.

## 1. Cómo se ha medido

Un banco nuevo, `backend/scripts/exp_p3_detector.py`, separa lo caro de lo barato:

- `dump`: por estudio, decima la malla UNA vez a las copias que usa la API (80 000 vértices
  para la curvatura, 40 000 para calibre y cociente), guarda el calibre por vértice y, para
  los percentiles 85 y 75 de Gauss, TODAS las regiones de curvatura con sus métricas
  (puntos, radio, H, K, H·r, fracción Gauss+, compacidad, esfericidad, área, borde), sin
  puertas ni fusión. Minutos por estudio; una vez.
- `eval` (`scripts/exp_p3_eval.py`): aplica puertas, orden del canal de curvatura y consenso
  como reglas puras sobre lo volcado y mide cada variante con el emparejamiento del banco.
  Segundos por variante. La variante `v1` reproduce los puestos de `zenodo_eval_p12e_v1`,
  que es la comprobación de que el banco hace lo mismo que el detector.

Los 16 estudios de siempre (10 con lesión = 13 lesiones, 6 controles), sobre las mallas de
la pasada `p12e` (hueso fuera + banda nativa). La regresión 3DRA (`scripts/regresion_xa.py`,
ahora con `--set clave=valor`) vigila Case 3 e IM_0055.

## 2. Lo que se ha encontrado

1. **El percentil de Gauss no ve los sacos grandes.** El percentil 85 de la curvatura
   gaussiana en 027 equivale a K ≥ 0,58 mm⁻², es decir, a un radio ≤ 1,3 mm. Un saco de
   12 mm (K ≈ 0,03) o de 21 mm es casi plano para esa puerta: sobre él solo pasan motas de
   ruido de 4 a 30 puntos. Por eso 027, 096 y 006 (12–21 mm) solo los ven calibre y
   cociente. A percentil 75 la cúpula de 096 aparece entera (146 puntos, H·r 1,8, Gauss+
   0,91) y cae por compacidad 0,16; pero a ese percentil las regiones de los sacos de 5 mm
   se fusionan con el vaso vecino (016: 330 puntos, H·r 4,3; 028: Gauss+ 0,49) y se pierden.
   No hay un percentil que sirva para los dos tamaños.
2. **La puntuación compuesta prima el radio de 4 mm.** Su término de tamaño (peso 0,30)
   vale 0,43 a 1,9 mm de radio y 0,87 a 3,2 mm. Los dos sacos de 5 mm de 106, con regiones
   perfectas (H·r 1,0, compacidad 0,6, esfericidad 0,98), salían 14.º. Las lesiones que el
   canal de curvatura sí ve (106 ×2, 028, 016 ×2, 019, 033 ×2) caen por el orden, no por
   las puertas.
3. **En un árbol limpio, la región convexa más grande es la cúpula.** Las demás regiones
   convexas de un árbol vascular son bultos de bifurcación y curvas, pequeñas. «La región
   de mayor área primero» es una regla con una sola magnitud y sin pesos.
4. **Los sacos gemelos de 106** están a 4,5 mm: la fusión de candidatos a 10 mm se queda
   con uno. Bajarla a 5 mm no mejora el conjunto (016_2 empeora); queda como está.

## 3. Medida de las variantes (banco, 16 estudios, mallas de p12e)

`v1` = preset de TC con H·r ≥ 0,7 (= `zenodo_eval_p12e_v1`). «Hueso» = candidatos de los
5 primeros que caen en hueso (HU máx ≥ 700), controles / estudios con lesión.

| Variante | top 5 | top 10 | en lista (40) | hueso ctl | hueso IA |
|---|---|---|---|---|---|
| v1 (percentil 85, orden por puntuación) | 2 | 6 | 9/13 | 8/30 | 5/50 |
| **orden por área** | **4** | **8** | **10/13** | 8/30 | 8/50 |
| orden por área + compacidad 0,15 | 3 | 7 | 9/13 | 5/30 | 7/50 |
| orden por área + anillo del cociente por radio | 4 | 8 | 10/13 | 7/30 | 8/50 |
| compacidad 0,10 | 0 | 5 | 10/13 | 8/30 | 5/50 |
| compacidad 0,15 | 1 | 5 | 10/13 | 5/30 | 6/50 |
| Gauss+ 0,40 · mín. 4 puntos · fusión 5 mm | 2 | 6 | 9/13 | 8–9/30 | 5–7/50 |
| orden por puntuación sin término de tamaño | 3 | 4 | 7/13 | 6/30 | 5/50 |
| orden por número de puntos | 3 | 5 | 10/13 | 7/30 | 8/50 |
| orden por H·r más cercano a 1 | 1 | 4 | 7/13 | 6/30 | 11/50 |
| orden por Gauss+ × compacidad | 3 | 5 | 9/13 | 10/30 | 8/50 |
| sin sitios de «solo calibre» | 2 | 4 | 8/13 | 9/30 | 6/50 |
| percentil 75 | 1 | 5 | 9/13 | 9/30 | 11/50 |
| percentil 75 + compacidad 0,10 | 2 | 5 | 8/13 | 9/30 | 9/50 |
| percentil 75 + área + compacidad 0,10 | 5 | 7 | 11/13 | 11/30 | 13/50 |

**Elegido: orden por área, con las puertas de siempre.** Es la única variante que mejora
top 5, top 10 y lista a la vez sin tocar el hueso en controles. La de percentil 75 + área
+ compacidad 0,10 da un top 5 más (sube 018 y 016_2 al 1.º) a cambio de más hueso (11/30 y
13/50), de perder 028 y de mandar 106 al 34.º: cambia qué lesiones salen, no cuántas, y
con 13 lesiones eso es ajustar al conjunto. Quitar los sitios de «solo calibre» pierde los
sacos grandes, que solo ese canal ve (§2.1). Bajar la compacidad empeora el orden.

Por lesión, orden por área frente a v1 (banco):

| Estudio | Lesión | v1 | área | Qué pasa |
|---|---|---|---|---|
| 028 | middle 3,6 mm, factor 5 | 6.ª | **1.ª** | |
| 016 | middle ×2 | 7.ª, 19.ª | **2.ª**, 10.ª | |
| 019 | giant trombosado | 2.ª | 4.ª | una región de borde y dos bultos de bifurcación más grandes |
| 106 | middle ×2 gemelos | 14.ª, 14.ª | 7.ª, 7.ª | la fusión a 10 mm los junta; por delante, curvas de la carótida |
| 027 | middle 11,9 mm | 5.ª | 5.ª | solo calibre (2.º) y cociente (3.º); §2.1 |
| 096 | large 21 mm | 7.ª | 7.ª | solo calibre (3.º) |
| 006 | large 21 mm | 10.ª | 11.ª | solo calibre (5.º) |
| 018 | middle 9,6 mm | fuera (compacidad 0,19) | 23.ª | con compacidad 0,15 entra, pero cuesta 019 |
| 033 | middle ×2 | fuera | fuera | fusión y tope de 40 |
| 026 | giant fusiforme | fuera de la malla | fuera de la malla | segmentación (informe anterior) |

## 4. Lo que cambia en el código

- `services/aneurysm_detector.py`: `AneurysmDetector(order_by="score" | "area")`; el
  candidato y la traza llevan `area_mm2`. Por defecto `"score"`: nada cambia para quien no
  lo pida.
- `routers/detect.py`, preset de TC: `min_mean_curv_radius=0.7` (la puerta absoluta de
  XA, ya medida en el informe anterior) y `order_by="area"`. El preset XA no cambia.
- `scripts/regresion_xa.py --set clave=valor`, `scripts/exp_p3_detector.py`,
  `scripts/exp_p3_eval.py`, `data/run_p3.ps1`.
- Tests: `test_paso3_detector.py` (5): orden por defecto intacto, la cúpula grande primero
  con «area», mismas regiones con otro orden, preset de TC/XA, orden desconocido rechazado.

**3DRA.** Con `--set order_by=area` la lesión sigue **1.ª** en Case 3 (malla entera y
árbol) e IM_0055 (ídem), pero los otros cuatro puestos cambian. Para respetar «que sigan
igual», XA conserva su orden por puntuación; el dato queda en
`data/regresion_xa/p3_area_xa.json` por si se quiere una sola regla para todas las
modalidades. Con el código final (`--label p3_final --compare base`): **«sin
diferencias»** en Case 3 e IM_0055, mismas mallas, mismos candidatos, lesión 1.ª.

## 5. Pasada real (`zenodo_eval_p3`, código de producción sobre las mallas de p12e)

`data/run_p3.ps1`: `eval_zenodo.py --meshes-from zenodo_eval_p12e`, sin `--set`, con el
preset de TC tal como queda en el código. Comparación con `data/compare_pasos.py`:

| | base (informe 10-12) | p12e_v1 (pasos 1-2 + H·r) | **p3** |
|---|---|---|---|
| Lesiones entre los 5 | 4 | 2 | **4** |
| Lesiones entre los 10 | 6 | 6 | **8** |
| Lesiones en la lista de 40 | 10 | 9 | **10** |
| Estudios con lesión con alguna entre los 5 (de 10) | 3 | 2 | **4** |
| Superficie anotada recuperada (mediana) | 0,99 | 1,0 | 1,0 |
| Candidatos en hueso, controles | 24/30 | 8/30 | 8/30 |
| Candidatos en hueso, estudios con lesión | 26/50 | 5/50 | 8/50 |
| Pieza mayor de la malla (mediana) | 637 cm³ | 75 cm³ | 75 cm³ |
| Segundos de detección por estudio (mediana) | 104 | 114 | 98 |

Los puestos por lesión coinciden con los del banco (§3): 028 1.ª, 016 2.ª y 10.ª, 019
4.ª, 027 5.ª, 106 7.ª y 7.ª, 096 7.ª, 006 11.ª, 018 23.ª, 033 ×2 fuera, 026 fuera de la
malla. Frente a la línea base del informe del 12 de octubre, con la malla de la cabeza
entera: mismas lesiones entre los 5 y en lista, dos más entre los 10, un estudio más con
una lesión entre los 5, y el hueso de 50 a 16 candidatos de 80. Ninguna lesión que la
base tuviera entre los 5 se ha perdido salvo las de 106 (3.ª y 3.ª → 7.ª y 7.ª), que en la
base salían por sitios de curvatura de la cabeza entera y ahora compiten con las curvas
de la carótida; a cambio entran 028 (32.ª → 1.ª) y 016_1 (fuera → 2.ª).

Nota de ejecución: dos procesos VTK a la vez (el volcado del banco y esta pasada) dejan
sin memoria al canal de calibre, que cae en silencio («Canal de calibre no disponible:
Unable to allocate») y el estudio sale con un solo canal. Se detectó en 096, se descartó
el registro y se repitió en serie; `zenodo_eval_p3` está limpio (0 avisos en los logs).

## 5 bis. Los sacos grandes: medido, no adoptado (2026-10-14)

Para que la curvatura vea una cúpula de 10–20 mm hace falta una puerta de Gauss ABSOLUTA en
vez del percentil: `AneurysmDetector.min_gauss_curvature` (K ≥ 1/r², apagada por defecto)
sustituye al percentil por un suelo en mm⁻². Volcado con suelos para r ≤ 3, 4 y 6 mm sobre
las mismas 16 mallas y medido con el orden por área:

| Variante | top 5 | top 10 | en lista | hueso ctl | hueso IA | Qué pasa |
|---|---|---|---|---|---|---|
| percentil 85 + área (**producción**) | 4 | 8 | 10/13 | 8/30 | 8/50 | |
| r ≤ 6 mm + área | 4 | 5 | 10/13 | 6/30 | 8/50 | 027, 096 y 019 **1.ª**; 106 ×2 7.ª → 31.ª, 028 1.ª → fuera, 018 fuera |
| r ≤ 4 mm + área | 3 | 4 | 9/13 | 6/30 | 11/50 | 106 → 19.ª, 019 fuera |
| r ≤ 4 mm + área + compacidad 0,15 | 5 | 5 | 10/13 | 3/30 | 8/50 | 096 1.ª, 106 → 27.ª |
| r ≤ 3 mm + área | 2 | 4 | 8/13 | 8/30 | 6/50 | peor en todo |
| dos escalas (percentil 85 y r ≤ 6 como dos canales «forma») | 4 | 7 | 11/13 | 4/30 | 7/50 | 096 1.ª, 033 entra; 027 5.ª → 8.ª |

Lo que enseña: por debajo del suelo de r ≤ 6 mm pasan también las caras externas de las
curvas de la carótida (regiones de 90 mm², H·r 1,3, Gauss+ 0,6) y con el orden por área
ganan a un saco de 5 mm; y dos escalas como dos canales tampoco sirven, porque la cuota
por canal reparte cinco plazas entre cinco «primeros». Cada variante cambia QUÉ lesiones
salen, no cuántas: con 13 lesiones eso es ajustar al conjunto. **Queda el percentil 85 con
el orden por área**; la decisión sobre los sacos grandes se toma con las 122 lesiones de
la pasada completa (`data/zenodo_eval_full_p3`), donde medianos y grandes se pueden
separar sin fitting. El parámetro y los volcados (`data/exp_p3/regions/*_pk*.json`) quedan.

Hallazgo colateral (018): no es hueso. Es una angio-TC de cabeza y cuello a resolución
nativa cuya máscara es el árbol arterial Y venoso (162 cm³, grosor 2,8 mm, 332 mm de
extensión, candidatos a 200–300 HU: yugulares y senos). La regla «árbol = pieza mayor ≤
100 cm³» (`MAX_TREE_VOLUME_MM3`, calibrada en 3DRA intracraneal) la rechaza y apaga calibre
y cociente en todo el estudio. Tope a revisar por tipo de estudio después de los 172.

## 6. Estado y lo que queda

- El detector ya aprovecha la malla limpia en lo que una regla sin pesos puede dar. Lo que
  queda son límites de los canales, no del orden:
  - **Sacos grandes (≥ 10 mm)**: la curvatura no los ve (§2.1) y el calibre los pone
    2.º–5.º detrás de la carótida o de una vena gruesa (027: el 1.º de calibre es un
    conducto de 7,6 mm a 128 HU). Una puerta de Gauss ABSOLUTA por tamaño de cúpula (en
    vez de percentil), o un calibre que use la HU, es la siguiente medida que haría; las
    dos tocan XA y piden su propia regresión.
  - **Sacos gemelos** (106) y **tope de 40 regiones** (033).
- Pendiente: pasada completa de los 172 con la nueva receta (segmentación + detector),
  suite completa, y la decisión de commit.
