# Diagnóstico de la caída nativa del backend (Arreglos F1a, Tarea 7)

Fecha: 2026-10-11. Sesión estudiada: la guardada `79a34304-8cb7-4169-b36e-1fae7f7775ae`
(Caso 3 a resolución completa: volumen 384³ a 0,32 mm, malla de vasos de
103 978 puntos y 208 188 triángulos).

## Conclusión

La causa raíz es una regresión de **VTK 9.7.0**: `vtkOBBTree.IntersectWithLine`
no devuelve ningún cruce (ni siquiera con una esfera) y, con mallas grandes,
escribe fuera de memoria y el proceso muere con un *access violation*, sin
excepción de Python. El `.venv` tiene VTK 9.7.0 desde el **2026-09-24**; el
`requirements-lock.txt` fija 9.6.1, y con 9.6.1 nada de esto ocurre.

La función implicada es `services/approach.py::_segments_along_ray`, a la que
llegan dos rutas:

- `POST /api/trajectory/{sid}/suggest` («Sugerir corredor»):
  `routers/report.py::_suggest_for_session` → `approach.propose_corridors`.
  Caídas 1 y 2 de la auditoría.
- `POST /api/trajectory/{sid}` (colocar o mover la trayectoria):
  `routers/report.py::set_trajectory` → `_assess_corridor_for` →
  `approach.assess_corridor`. **Esta ruta no está aislada por la Tarea 6** y
  tumba el servidor entero (reproducido abajo). Es la explicación más probable
  de las caídas 3 y 4: tras reanudar, la siguiente petición que mide el
  corredor no llega a registrarse en el log porque el proceso muere antes de
  responder; por eso la última línea era un `GET /api/devices/{sid}`.

Hay un segundo daño, silencioso y más grave que la caída: **desde el
2026-09-24 el corredor ha sido ciego a los vasos**. Cuando el proceso no muere,
el OBB devuelve cero cruces y el veredicto sale «viable» aunque el corredor
atraviese un vaso. En la sesión estudiada, el veredicto guardado es «viable»;
recalculado con el arreglo es «revisar» («El corredor roza 1 estructura(s)
vascular(es) fina(s) (la mayor, ⌀ 1.4 mm)», a 2,77 mm de la entrada). El mismo
OBB se usa en `services/followup.py::_inside_parity`, del que dependen la
aposición del stent (`services/apposition.py`) y el seguimiento: todo punto
salía «fuera».

Esto explica también dos de los «fallos ambientales conocidos» de las
restricciones globales: `test_corredor_abordaje.py` (8 de 53 fallan con 9.7.0,
53 de 53 pasan con 9.6.1) y `test_apposition.py` (4 de 5 fallan con 9.7.0,
5 de 5 pasan con 9.6.1). Con el arreglo pasan los dos con 9.7.0.

## Arreglo aplicado (menos de 30 líneas)

Los rayos dejan de usar `vtkOBBTree` y pasan a `vtkCellLocator`, que es el que
ya usaba `services/clip_field.py` por otro fallo del OBB:

- `services/approach.py`: nuevo `_vessel_locator(poly)`; `_segments_along_ray`
  llama a `IntersectWithLine(p0, p1, 0.0, pts, idlist)`; `assess_corridor` y
  `propose_corridors` construyen el localizador con él. El parámetro
  `obb_tree` conserva su nombre para no tocar a los llamadores.
- `services/followup.py::_inside_parity`: el mismo cambio.
- Prueba de regresión `backend/test_localizador_rayos.py`: esfera de 180 000
  caras (la que abortaba el OBB de 9.7.0), un rayo que la cruza da un tramo de
  10 mm, uno que pasa de largo no da nada, 200 rayos seguidos sobre el mismo
  localizador (la caída llegaba en el rayo 73, no en el primero) y la paridad
  dentro/fuera.

Comprobado sobre el mismo Caso 3, rayo a rayo: en los 73 rayos registrados, el
localizador de celdas en 9.7.0 da exactamente los mismos cruces que el OBB en
9.6.1 (cruces en los rayos 36, 48, 50, 57, 60, 61, 63, 65, 67, 69, 71 y 73).

## Qué se hizo y qué salió

Todo desde `backend/` con `.venv/Scripts/python`, sin tocar el puerto 8000.

1. **Copia viva sin servidor.** `PROSPECTIVE_SESSIONS_ROOT=<temporal>` y
   `rehydrate_session("79a34304-…")` → sesión `0a8cec95-…`. Tardó 0,09 s: el
   DICOM se enlaza (hard link) y el resto, 342 MB en disco, se copia.
2. **Reproducción en el proceso con `-X faulthandler`.** Diana: el cuello
   marcado (`morpho.neck_origin_*` = 60,04 / 64,02 / 67,57), `radius_mm=5.0`,
   `top=3` (los valores por defecto de `SuggestCorridorsRequest`). Cayó a la
   primera, en 2 s, con código de salida 139:

   ```
   Windows fatal exception: access violation

   Current thread 0x0000764c (most recent call first):
     File "backend\services\approach.py", line 138 in _segments_along_ray
     File "backend\services\approach.py", line 544 in propose_corridors
     File "backend\routers\report.py", line 789 in _suggest_for_session
   ```

   La línea 138 es `tree.IntersectWithLine(p0, p1, pts, None)` sobre un
   `vtkOBBTree`.
3. **Aislar el rayo.** Registrando cada rayo antes de lanzarlo, la caída es
   determinista en el rayo 73 del primer barrido. Ese rayo solo, sobre un árbol
   nuevo, no cae pero devuelve 0 cruces donde `vtkCellLocator` y
   `vtkModifiedBSPTree` encuentran 4. Repitiendo los 73 rayos sobre un mismo
   árbol: todos dan 0 cruces y el proceso cae en el 73 si se pasa un
   `vtkIdList`. Es una escritura fuera de memoria cuyo efecto depende del
   estado del montón.
4. **Malla sana.** Solo triángulos; sin NaN ni infinitos; ningún triángulo
   degenerado ni de área nula (área mínima 2,5·10⁻⁵ mm²). La malla no es la
   causa.
5. **Esfera de control con VTK 9.7.0.** Con resoluciones 8 y 32, el OBB da
   0 cruces y el localizador de celdas da 2. Con resolución 300, unas 180 000
   caras, el OBB tumba el proceso.
6. **Mismo experimento con VTK 9.6.1**, instalado aparte con
   `pip install --target <scratch> vtk==9.6.1` y cargado por `PYTHONPATH`, sin
   tocar el `.venv`. Las tres esferas dan 2 cruces. Los 73 rayos del Caso 3 dan
   los mismos cruces que el localizador de celdas. «Sugerir corredor» completo
   acaba en 1,06 s con tres propuestas «viable».
7. **Medir el corredor guardado** (`_assess_corridor_for` con
   `trajectory.entry_*` y `trajectory.target_*`). Con el código original cae
   3 de 3 veces con la misma pila, entrando por `assess_corridor` en la línea
   236. Con el arreglo acaba en 0,22 s con el veredicto «revisar» y 1 vaso.
8. **Concurrencia.** Con el arreglo, cuatro hilos renderizan cortes axial,
   coronal, sagital y oblicuos sin parar (1 440 renders) mientras el hilo
   principal hace tres rondas de sugerir y medir. No hubo caídas, en 2,16 s.
9. **Restaurar (caída 3).** `rehydrate_session` tres veces más con
   faulthandler: 0,07 s cada una, sin caída. Restaurar solo copia ficheros y
   no toca VTK; no se reprodujo la caída al restaurar. La hipótesis es la de
   arriba: otra petición en vuelo que medía el corredor. Bajo `--reload`, el
   supervisor zombi que retenía el puerto es un efecto de esa muerte, no su
   causa.
10. **Por HTTP en un puerto propio**:
    `PROSPECTIVE_SESSIONS_ROOT=<temporal> PROSPECTIVE_ALLOW_MULTI_PROCESS=1 PYTHONFAULTHANDLER=1 .venv/Scripts/python -X faulthandler -m uvicorn main:app --port 8011`,
    con `POST /api/auth/login` como `admin`.
    - Código original, `POST /api/trajectory/{sid}/suggest {}`: el hijo de
      la Tarea 6 muere con la misma pila. El servidor responde 500 con
      «El cálculo del corredor falló en el servidor; la sesión no se ha
      perdido. Coloca la entrada y la diana a mano.» y sigue vivo.
    - Código original, `POST /api/trajectory/{sid}` con la entrada y la diana
      guardadas: siete respuestas 200 con «viable», que es un veredicto
      ciego. La octava **mata el servidor**:

      ```
      Current thread 0x000052cc (most recent call first):
        File "backend\services\approach.py", line 138 in _segments_along_ray
        File "backend\services\approach.py", line 236 in assess_corridor
        File "backend\routers\report.py", line 598 in _assess_corridor_for
        File "backend\routers\report.py", line 524 in set_trajectory
      ```
    - Con el arreglo, en un servidor nuevo: «Sugerir corredor» da 200 tres de
      tres veces, en unos 2,1 s, con tres propuestas «viable». Colocar la
      trayectoria da 200 veinte de veinte veces con «revisar». No hubo
      ninguna caída.

## Memoria

No es un problema de memoria. psutil no está instalado; las cifras salen de
`GetProcessMemoryInfo` y `GlobalMemoryStatusEx` por ctypes.

| Momento | Pico de memoria del proceso | RAM libre |
|---|---|---|
| Inicio, RAM total 31,1 GB | | 15,2 GB |
| Caída en el proceso con 9.7.0 | | 15,1 GB al empezar |
| «Sugerir corredor» con 9.6.1 | 673 MB | 15,0 GB |
| Medir el corredor con el arreglo | 248 MB | |
| Sugerir y medir con 4 hilos de MPR, con el arreglo | 991 MB | 14,9 GB |
| `rehydrate_session` | 175 MB | 14,6 GB |

## ¿Cubre esto el aislamiento de la Tarea 6?

Solo en parte. El aislamiento envuelve «Sugerir corredor» y la copia de
restaurar, y para «Sugerir corredor» funciona: el servidor sobrevive y la
persona recibe un 500 explicado. Pero `set_trajectory` mide el corredor dentro
del proceso del servidor, y además dentro de una función `async` que bloquea el
bucle de eventos durante el cálculo. Con VTK 9.7.0 y sin el arreglo, colocar la
trayectoria seguía pudiendo tumbar el servidor. Tampoco protegía de lo peor:
los veredictos ciegos no caen, se guardan.

## Recomendaciones

1. **Mantener el arreglo** de este commit: deja de depender del OBB para
   cruzar rayos, con cualquier versión de VTK.
2. **Mantener el aislamiento de la Tarea 6** como defensa en profundidad. No
   hace falta extenderlo a `set_trajectory` ahora que el cálculo no cae; ese
   cálculo tarda 0,2 s.
3. **Excluir VTK 9.7.0** en `requirements.txt` (`vtk>=9.3,!=9.7.0`) o
   reinstalar el `.venv` desde el lock (9.6.1). Hay que hacerlo con los
   servidores parados, porque Windows bloquea las DLL cargadas. Queda para
   el propietario, porque cambia el entorno y no el código.
4. **Revisar los veredictos y mapas guardados desde el 2026-09-24.** Todo
   «viable» de corredor y todo mapa de aposición calculado desde entonces se
   hizo con el OBB ciego. Basta con volver a colocar la trayectoria o
   recalcular el stent en cada sesión que se vaya a usar; el veredicto
   guardado no se recalcula solo al reanudar.
5. Los «fallos ambientales conocidos» `test_corredor_abordaje.py` y
   `test_apposition.py` dejan de serlo con este arreglo y deberían salir de
   esa lista. `test_followup.py` pasa con y sin el arreglo.

## Limpieza

- La raíz de sesiones temporal se borró: cuatro copias de `rehydrate_session`.
  El DICOM guardado volvió de 8 a 4 enlaces. La sesión guardada sigue intacta:
  157 claves en `state.txt`, 25 mallas y 342 MB.
- El VTK 9.6.1 instalado aparte en el directorio temporal se borró.
- Los dos servidores del puerto 8011 se pararon. El primero murió en la
  prueba; el segundo se paró por su PID. El puerto 8000 del propietario no se
  tocó.
