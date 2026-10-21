# F1 · Auditoría funcional con criterio clínico — diseño

Fecha: 2026-10-10. Primer subproyecto de la serie F (auditoría → identidad y gestión → espacio de trabajo → simulación grabada).

## 1. Propósito

Comprobar que todo lo que el software muestra tiene un propósito reconocible para un especialista, que se encuentra donde se busca, que no deja al usuario atascado y que su texto dice lo que hace. Lo que no cumpla se corrige, se fusiona o se elimina.

Persona: neurocirujano vascular con práctica híbrida (clipaje y abordaje como prioridad; coils, stents y WEB con el mismo nivel de exigencia). Conoce DICOM, angiografía 3D, morfometría de aneurismas y los índices PHASES/ELAPSS/UIATS. No conoce este software.

Las cuatro preguntas que se hacen a cada elemento:

1. ¿Para qué sirve? (propósito explicable en una frase)
2. ¿Se encuentra donde uno lo buscaría? (ubicación y nombre)
3. ¿Puede dejar al usuario atascado o sin saber qué hacer después? (bloqueos, estados sin salida, errores mudos)
4. ¿Su texto dice lo mismo que hace? (copia, títulos, tooltips, mensajes)

## 2. Alcance

Todo lo visible desde el inicio de sesión y todo lo que se alcanza desde ahí:

| Zona | Pantallas y piezas |
|---|---|
| Entrada | Landing (`/`), Entrar (`/app/entrar`), Crear cuenta (`/app/registro`), cambio forzado de contraseña |
| Gestión | Pacientes (`/app/pacientes`, ficha del paciente, sesiones guardadas, capturas), Estudios, Nuevo caso, Usuarios, Solicitudes, Pedidos de clips, Auditoría, Talleres, menú de usuario, tema |
| Espacio de trabajo | Barra superior (Captura, Grabar, Adjuntar a un caso, Panel, Guardar progreso), carril de ocho pasos, ficha del paciente, barra del visor (PRINCIPAL, distribución, PLANOS, HUD, SINCRO, atajos) |
| Pasos | 1 Carga DICOM · 2 Segmentación (banda, preprocesado, edición de malla, línea central) · 3 Detección (candidatos, confirmación de lesión, rechazados) · 4 Morfometría (cuello, ápice, métricas, índices, PHASES, ELAPSS, UIATS, seguimiento, ramas, línea central y secciones) · 5 Decisión · 6 Dispositivos (trayectoria, clips, coils, stents, stent CL, WEB) · 7 Fabricación · 8 Informe (PDF, DICOM SR, DICOM SEG, exportaciones) |
| Visor | Cortes AX/COR/SAG, 3D, CORTES 3D, Oblicuo, VOLUMEN (MIP/COMPUESTO), HUD en sus tres niveles, gestos, atajos, cine, anotaciones (reglas, ángulos, regiones, marcadores, notas), capturas y grabación |
| Transversal | Guardar y reanudar sesión, estados vacíos, mensajes de error y de progreso, permisos de un usuario no administrador, tema claro |

Fuera de alcance: rediseño visual (F2, F3), funciones nuevas, algoritmos del backend, rendimiento.

## 3. Método

1. **Recorrido real.** Ejecutar el Caso 3 (`frontend/Estudios/Case 3/Unknown Study/XA/XA000000.dcm`) de principio a fin en el navegador (chrome-devtools), como lo haría la persona: subir el DICOM desde cero, segmentar, detectar, confirmar la lesión del tronco basilar, medir, decidir, planificar dispositivos y trayectoria, generar el informe, guardar y reanudar. Cada pantalla se captura y cada elemento se registra en el inventario.
2. **Lectura del código.** Por cada pantalla, leer el componente para encontrar ramas que el recorrido no dispara: errores del servidor, estados vacíos, elementos condicionados a permisos, atajos y menús desplegables.
3. **Segunda persona.** Repetir Entrar, Pacientes y el espacio de trabajo con un usuario no administrador (crear uno desde Usuarios) para ver qué cambia y si algo queda inalcanzable sin aviso.
4. **Herencia.** Incorporar las observaciones abiertas de E4 y E5 registradas en memoria (ventana del MIP tras restaurar, tira del Oblicuo en celda compacta, LOCAL sin reencuadre, etiqueta LOCAL en LIBRE, flecha «perdida» en la gráfica, cursor fuera del rango, giro de azimut en vasos horizontales).

## 4. Entregables

Un único informe: `docs/superpowers/audits/2026-10-10-auditoria-funcional.md`, con tres partes.

### 4.1 Inventario por pantalla

Una tabla por pantalla o paso, una fila por elemento (menú, botón, campo, panel, texto fijo, mensaje):

| Elemento | Propósito | Veredicto | Gravedad | Destino | Nota |
|---|---|---|---|---|---|

- **Veredicto:** `mantener` · `corregir` (cambia texto, posición o comportamiento) · `fusionar` (duplica otro elemento) · `eliminar` (sin propósito o engañoso).
- **Gravedad:** `bloquea` (impide seguir o pierde trabajo) · `confunde` (se entiende mal o se busca en otro sitio) · `cosmético`.
- **Destino:** `F1` (arreglo inmediato en este subproyecto) · `F2` (vistas de gestión e identidad) · `F3` (espacio de trabajo) · `E5` (visor, ya planificado).

Regla de destino: va a `F1` lo que bloquea o confunde y no depende del armazón ni de la identidad nuevos; va a `F2` o `F3` lo visual y lo que cambia de sitio con el armazón.

### 4.2 Recorrido del especialista

Relato en orden del flujo completo, con capturas, señalando cada momento en que la persona dudaría, se detendría o buscaría ayuda, y qué esperaba encontrar. Cierra con el tiempo aproximado de cada paso y con lo que el informe final dice frente a lo que la persona hizo.

### 4.3 Lista de eliminaciones y fusiones

Lista numerada de todo lo marcado `eliminar` o `fusionar`, cada entrada con el motivo y lo que la sustituye. **El propietario aprueba o rechaza cada entrada**; nada se elimina sin esa decisión.

## 5. Arreglos inmediatos (F1)

Tras la aprobación de las listas, los elementos con destino `F1` se agrupan en un plan corto (`docs/superpowers/plans/<fecha>-auditoria-arreglos.md`, con la fecha del día en que se escriba) y se ejecutan con desarrollo guiado por subagentes en la rama `auditoria-funcional`, con las reglas de siempre: copia en español, comentarios con el porqué, pruebas por cambio, contrato OpenAPI regenerado si toca al backend, sin tocar `backend/data/` ni `package-lock.json`.

Criterio para que un arreglo entre en F1 y no espere a F2/F3: cambiar texto, orden, habilitación, valor por defecto o un comportamiento pequeño en un componente existente. Si exige mover el elemento a otra parte del armazón, espera.

## 6. Criterios de aceptación

- Cada pantalla y paso del alcance tiene su tabla, y cada fila tiene veredicto, gravedad y destino.
- El recorrido del especialista llega hasta el informe generado y la sesión reanudada, sin saltos.
- Las observaciones heredadas de E4/E5 aparecen en el inventario con destino.
- La lista de eliminaciones está aprobada por el propietario entrada a entrada.
- Los arreglos `F1` quedan integrados en master con sus pruebas, y la lista manual del recorrido vuelve a pasar sobre ellos.

## 7. Pruebas

- Los arreglos `F1` llevan prueba unitaria o de componente (vitest + Testing Library; pytest si tocan el backend).
- Lista manual final: repetir el recorrido del especialista sobre master con los arreglos y comprobar que cada atasco marcado `F1` ha desaparecido.
