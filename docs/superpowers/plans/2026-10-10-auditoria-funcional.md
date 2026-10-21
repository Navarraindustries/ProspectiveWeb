# Auditoría funcional con criterio clínico (F1) — plan de ejecución

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Producir el informe `docs/superpowers/audits/2026-10-10-auditoria-funcional.md` con el inventario de cada pantalla y paso de PROSPECTIVE Web (veredicto, gravedad, destino), el recorrido del especialista sobre el Caso 3 y la lista de eliminaciones para que el propietario decida.

**Architecture:** Un informe en Markdown que crece tarea a tarea, una tarea por zona del software, siempre con el mismo método: leer el código de la zona, recorrerla en el navegador real (chrome-devtools) con el Caso 3, y volcar una tabla por pantalla. Un script de comprobación (`scripts/audit_lint.py`) valida que cada fila del inventario tiene valores permitidos y, al final, que no falta ninguna pantalla del alcance. Nada de código de producto cambia en este plan: los arreglos `F1` salen después en un plan aparte, tras las decisiones del propietario.

**Tech Stack:** Markdown; Python 3.12 (script de comprobación, sin dependencias); navegador vía las herramientas `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`; frontend en http://localhost:5173 y backend en http://127.0.0.1:8000 ya levantados por el propietario.

**Spec:** `docs/superpowers/specs/2026-10-10-auditoria-funcional-design.md`

## Global Constraints

- Persona: neurocirujano vascular con práctica híbrida; cada elemento responde a las cuatro preguntas de la spec §1 (propósito, ubicación, atasco, texto).
- Valores permitidos (spec §4.1). Veredicto: `mantener` · `corregir` · `fusionar` · `eliminar`. Gravedad: `bloquea` · `confunde` · `cosmético` · `—` (solo con `mantener`). Destino: `F1` · `F2` · `F3` · `E5` · `—` (solo con `mantener`).
- Regla de destino (spec §4.1): `F1` solo si bloquea o confunde y no depende del armazón ni de la identidad nuevos; lo visual o lo que cambia de sitio con el armazón va a `F2` (gestión) o `F3` (espacio de trabajo); lo del visor ya planificado, `E5`.
- Todo el informe en español; nombres de elementos tal como aparecen en pantalla, entre «comillas».
- **No se modifica código de producto, copia ni pruebas en este plan.** Solo se crean `docs/superpowers/audits/2026-10-10-auditoria-funcional.md` y `scripts/audit_lint.py`.
- Capturas de pantalla: se guardan en `.superpowers/audit-capturas/<tarea>-<nombre>.jpeg` (carpeta ignorada por git) y el informe las cita por nombre de archivo. **Nunca se añaden imágenes al repositorio.**
- Un solo navegador compartido: las tareas se ejecutan en orden y cada una deja la sesión del navegador donde la encontró o donde la tarea siguiente la necesita (se indica en cada tarea). No se cierran las pestañas del servidor de brainstorm (puerto 51560).
- Servidores: no se reinician ni se paran. Login de desarrollo: usuario `admin`, contraseña `admin12345`, ruta `/app/entrar`. Si el backend no responde en `/docs` (401 es respuesta válida), la tarea devuelve `BLOCKED`.
- Estudio: `frontend/Estudios/Case 3/Unknown Study/XA/XA000000.dcm` (XA 3DRA 384³, 0,32 mm). La lesión clínicamente confirmada está en el tronco basilar, el punto de máximo calibre; el candidato que la detección pone primero («cand-001», Ø 8,3 mm estimado) es esa lesión.
- No se borran pacientes, sesiones, casos ni usuarios existentes. Lo que una tarea crea (sesión nueva, usuario `auditora`) se deja y se anota en el informe para que el propietario lo limpie si quiere.
- Rama de trabajo: `auditoria-funcional` desde master. Commits en español, uno por tarea, con las líneas `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01WAKbyoY5UhogBhVEk3qAEM` al final.
- Comprobación obligatoria antes de cada commit: `python scripts/audit_lint.py docs/superpowers/audits/2026-10-10-auditoria-funcional.md` sin errores (la cobertura completa solo se exige en la Tarea 10 con `--complete`).

## Review Focus

Condiciones que la spec implica y que el inventario debe mirar con especial atención, por orden de daño probable:

1. **Estados sin salida en el flujo**: un paso cuyo botón «Continuar» queda deshabilitado sin decir qué falta (Tareas 6–8 anotan por cada paso qué habilita el siguiente y si el motivo se muestra).
2. **Errores del servidor mudos**: una llamada que falla y deja un spinner o un panel vacío (cada tarea de pantalla lee el `catch` de cada llamada y anota si el mensaje llega a la persona).
3. **Trabajo que se pierde**: salir del espacio de trabajo, cambiar de paso o reanudar sin aviso de lo no guardado (Tarea 5 y Tarea 8 lo prueban).
4. **Usuario no administrador**: menús visibles que llevan a un 403 o a una lista vacía sin explicación (Tarea 9).
5. **Copia que promete lo que no hace**: títulos, tooltips y mensajes que describen otro comportamiento o usan tres nombres para la misma cosa (todas las tareas comparan texto con comportamiento; la Tarea 10 consolida el glosario de nombres duplicados).

---

### Task 1: Esqueleto del informe y script de comprobación

**Files:**
- Create: `docs/superpowers/audits/2026-10-10-auditoria-funcional.md`
- Create: `scripts/audit_lint.py`
- Create: `.superpowers/audit-capturas/` (carpeta vacía, ignorada; sin commit)

**Interfaces:**
- Produces: la estructura de encabezados que las tareas 2–10 rellenan (nivel `##` por zona, `###` por pantalla, tabla de seis columnas) y el comando de comprobación `python scripts/audit_lint.py <informe> [--complete]`.

- [ ] **Step 1: Crear la rama**

```bash
git checkout -b auditoria-funcional master
```

- [ ] **Step 2: Escribir el script de comprobación**

Crear `scripts/audit_lint.py`:

```python
"""Comprueba el informe de la auditoría funcional (F1).

Por qué: el informe lo escriben varias tareas y varios agentes; sin una
comprobación mecánica se cuelan veredictos inventados, filas sin destino y
pantallas olvidadas. El script falla con mensaje claro y código 1.

Uso: python scripts/audit_lint.py docs/superpowers/audits/<informe>.md [--complete]
  --complete  exige además que estén todas las pantallas del alcance.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

VEREDICTOS = {"mantener", "corregir", "fusionar", "eliminar"}
GRAVEDADES = {"bloquea", "confunde", "cosmético", "—"}
DESTINOS = {"F1", "F2", "F3", "E5", "—"}

# Encabezados `###` que el informe completo debe contener (spec §2).
PANTALLAS_OBLIGATORIAS = [
    "Landing", "Entrar", "Crear cuenta", "Cambio forzado de contraseña",
    "Pacientes", "Ficha del paciente", "Estudios", "Nuevo caso",
    "Usuarios", "Solicitudes", "Pedidos de clips", "Auditoría", "Talleres", "Menú de usuario y tema",
    "Barra superior del espacio de trabajo", "Carril de pasos y ficha", "Barra del visor",
    "HUD y niveles", "Atajos", "Anotaciones", "Capturas y grabación",
    "Paso 1 · Carga DICOM", "Paso 2 · Segmentación", "Paso 3 · Detección",
    "Paso 4 · Morfometría", "Paso 5 · Decisión", "Paso 6 · Dispositivos",
    "Paso 7 · Fabricación", "Paso 8 · Informe", "Guardar y reanudar",
    "Usuario no administrador",
]

FILA = re.compile(r"^\|(.+)\|\s*$")


def main(argv: list[str]) -> int:
    if not argv:
        print("uso: audit_lint.py <informe.md> [--complete]")
        return 2
    path = Path(argv[0])
    complete = "--complete" in argv[1:]
    text = path.read_text(encoding="utf-8")
    errores: list[str] = []
    filas = 0
    for n, linea in enumerate(text.splitlines(), 1):
        m = FILA.match(linea)
        if not m:
            continue
        celdas = [c.strip() for c in m.group(1).split("|")]
        if len(celdas) != 6 or celdas[0] in {"Elemento", ""} or set(celdas[0]) <= {"-", ":"}:
            continue   # cabecera, separador u otra tabla
        filas += 1
        _, _, veredicto, gravedad, destino, _ = celdas
        if veredicto not in VEREDICTOS:
            errores.append(f"línea {n}: veredicto «{veredicto}» no permitido")
        if gravedad not in GRAVEDADES:
            errores.append(f"línea {n}: gravedad «{gravedad}» no permitida")
        if destino not in DESTINOS:
            errores.append(f"línea {n}: destino «{destino}» no permitido")
        if veredicto == "mantener" and (gravedad != "—" or destino != "—"):
            errores.append(f"línea {n}: «mantener» lleva gravedad y destino «—»")
        if veredicto != "mantener" and (gravedad == "—" or destino == "—"):
            errores.append(f"línea {n}: «{veredicto}» exige gravedad y destino")
    if complete:
        titulos = {t.strip() for t in re.findall(r"^###\s+(.+)$", text, flags=re.M)}
        for p in PANTALLAS_OBLIGATORIAS:
            if p not in titulos:
                errores.append(f"falta la pantalla «{p}»")
        for seccion in ("## Recorrido del especialista", "## Eliminaciones y fusiones propuestas"):
            if seccion not in text:
                errores.append(f"falta la sección «{seccion}»")
    for e in errores:
        print(e)
    print(f"{filas} filas de inventario, {len(errores)} errores")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 3: Escribir el esqueleto del informe**

Crear `docs/superpowers/audits/2026-10-10-auditoria-funcional.md`:

```markdown
# Auditoría funcional con criterio clínico — PROSPECTIVE Web

Fecha: 2026-10-10 · Base: master `b80e8da` · Spec: `docs/superpowers/specs/2026-10-10-auditoria-funcional-design.md`

Persona: neurocirujano vascular con práctica híbrida. Cada elemento responde a: ¿para qué sirve?, ¿se encuentra donde se busca?, ¿deja atascado?, ¿su texto dice lo que hace?

Leyenda. Veredicto: mantener · corregir · fusionar · eliminar. Gravedad: bloquea · confunde · cosmético. Destino: F1 (arreglo inmediato) · F2 (gestión e identidad) · F3 (espacio de trabajo) · E5 (visor). Las capturas citadas están en `.superpowers/audit-capturas/` (no versionadas).

## Herencia de E4 y E5

| Elemento | Propósito | Veredicto | Gravedad | Destino | Nota |
|---|---|---|---|---|---|
| VOLUMEN · «UMBRAL» del MIP tras reanudar | Rampa del MIP anclada al umbral de segmentación | corregir | confunde | E5 | Tras reanudar, `segmentation.threshold_lower` no llega y el MIP cae al 60 % del rango (UMBRAL 2141) mientras «Vasos» usa 1470; que caiga a la banda del vaso |
| Oblicuo en celda compacta · tira de controles | Deslizadores y RECORRIDO | corregir | confunde | F3 | La tira completa se muestra en la celda pequeña y deja la imagen en una franja |
| VOLUMEN · «LOCAL» al apagarlo | Volver a la proyección completa | corregir | cosmético | E5 | No reencuadra; la cámara queda sobre la caja de la lesión |
| VOLUMEN · «LOCAL ●» con RECORTE LIBRE | Indicar que LOCAL no se aplica | corregir | cosmético | E5 | El rótulo sigue diciendo ● aunque esté atenuado y sin efecto |
| Gráfica de calibre · flechas tras un clic | Avanzar muestra a muestra | corregir | cosmético | E5 | La primera flecha puede caer en el mismo punto de 0,5 mm y parece no hacer nada |
| Gráfica de calibre · cursor fuera de rango | Mostrar dónde está el punto compartido | corregir | cosmético | E5 | El cursor puede superar la última muestra (las secciones saltan el 5 % de cada extremo) |
| Oblicuo · RECORRIDO ▸ VASO en vasos horizontales | Plano perpendicular al vaso | corregir | confunde | E5 | `planeFromNormal` pliega la normal a +z y el plano gira 180° al cruzar la horizontal |

## Entrada

### Landing
### Entrar
### Crear cuenta
### Cambio forzado de contraseña

## Gestión

### Pacientes
### Ficha del paciente
### Estudios
### Nuevo caso
### Usuarios
### Solicitudes
### Pedidos de clips
### Auditoría
### Talleres
### Menú de usuario y tema

## Espacio de trabajo

### Barra superior del espacio de trabajo
### Carril de pasos y ficha
### Barra del visor
### HUD y niveles
### Atajos
### Anotaciones
### Capturas y grabación

## Pasos

### Paso 1 · Carga DICOM
### Paso 2 · Segmentación
### Paso 3 · Detección
### Paso 4 · Morfometría
### Paso 5 · Decisión
### Paso 6 · Dispositivos
### Paso 7 · Fabricación
### Paso 8 · Informe
### Guardar y reanudar

## Segunda persona

### Usuario no administrador

## Recorrido del especialista

(se escribe en la Tarea 10)

## Eliminaciones y fusiones propuestas

(se escribe en la Tarea 10)

## Arreglos F1 propuestos

(se escribe en la Tarea 10)
```

- [ ] **Step 4: Comprobar que el script acepta el esqueleto y rechaza una fila inválida**

Run: `python scripts/audit_lint.py docs/superpowers/audits/2026-10-10-auditoria-funcional.md`
Expected: `7 filas de inventario, 0 errores`, código 0.

Run: `python scripts/audit_lint.py docs/superpowers/audits/2026-10-10-auditoria-funcional.md --complete`
Expected: `7 filas de inventario, 0 errores`, código 0. La cobertura mide que existan los encabezados `###` de todas las pantallas y las dos secciones finales, y el esqueleto ya los trae; el contenido de cada sección lo garantiza la revisión de cada tarea. Comprobar la cobertura borrando temporalmente la línea `### Talleres`: el script debe decir `falta la pantalla «Talleres»` y devolver 1; restaurar la línea.

Prueba negativa: añadir temporalmente la fila `| X | y | quitar | bloquea | F1 | z |` bajo «Herencia», ejecutar el script, comprobar `veredicto «quitar» no permitido`, y quitar la fila.

- [ ] **Step 5: Crear la carpeta de capturas y commit**

```bash
mkdir -p .superpowers/audit-capturas
git add scripts/audit_lint.py docs/superpowers/audits/2026-10-10-auditoria-funcional.md
git commit -m "Auditoría F1: esqueleto del informe y script de comprobación"
```

---

### Procedimiento común de las tareas 2–9 (léase antes de cada una)

Cada tarea de pantalla sigue estos pasos, en este orden:

1. **Leer el código** de los archivos listados en la tarea. Anotar cada elemento interactivo o texto fijo, cada llamada al API con su `catch`, cada condición que oculta o deshabilita algo.
2. **Recorrer en el navegador.** `list_pages` → usar la página de PROSPECTIVE (crear una con `new_page` a `http://localhost:5173/app/entrar` si no existe). Para cada pantalla: `take_snapshot` (árbol de accesibilidad: es la lista de elementos), `take_screenshot` con `filePath` en `.superpowers/audit-capturas/<tarea>-<pantalla>.jpeg` y `format: "jpeg"`, y probar cada botón o campo que la tarea nombra. Leer `list_console_messages` con `types: ["error"]` al terminar la pantalla y anotar los errores en la tabla.
3. **Escribir la tabla** bajo el encabezado `###` de esa pantalla en el informe, una fila por elemento, sin saltarse los que parezcan triviales (un título fijo también es una fila si confunde). Tras la tabla, un párrafo «Atascos» con los momentos en que la persona se detendría y qué esperaba.
4. **Comprobar y commit**: `python scripts/audit_lint.py docs/superpowers/audits/2026-10-10-auditoria-funcional.md` sin errores; `git add docs/superpowers/audits/2026-10-10-auditoria-funcional.md && git commit -m "Auditoría F1: <zona>"`.

Formato de fila (copiar literal):

```markdown
| «Texto del elemento» (tipo) | Para qué sirve | veredicto | gravedad | destino | Qué falla y qué se espera; captura `t2-entrar.jpeg` |
```

Tipos: botón · campo · menú · pestaña · texto · mensaje · tooltip · atajo · panel.

---

### Task 2: Entrada — Landing, Entrar, Crear cuenta, cambio forzado

**Files:**
- Read: `frontend/src/pages/Landing.tsx`, `frontend/src/components/landing/LandingScene.tsx`, `frontend/src/pages/Login.tsx`, `frontend/src/pages/Signup.tsx`, `frontend/src/components/ForcePasswordChange.tsx`, `frontend/src/components/ChangePasswordSheet.tsx`, `frontend/src/store/auth.tsx`, `frontend/src/store/nav.tsx`
- Modify: `docs/superpowers/audits/2026-10-10-auditoria-funcional.md` (secciones «Landing», «Entrar», «Crear cuenta», «Cambio forzado de contraseña»)

**Interfaces:**
- Consumes: esqueleto y script de la Tarea 1.
- Produces: la sesión del navegador queda **autenticada como `admin`** en `/app/pacientes` para la Tarea 3.

- [ ] **Step 1: Leer el código** (procedimiento común, punto 1). En particular: qué hace «clic para saltar» en Landing y si la escena 3D tiene un propósito para la persona; qué mensajes devuelve el login con contraseña errónea, usuario inexistente y backend caído; qué campos exige «Crear cuenta», qué valida y qué pasa tras enviar (¿espera aprobación? ¿lo dice?); cuándo se dispara el cambio forzado de contraseña y si se puede cancelar.

- [ ] **Step 2: Recorrer** `http://localhost:5173/` (Landing: esperar la escena, pulsar «clic para saltar», pulsar «SkullApp PROSPECTIVE», «Tema claro»), `/app/entrar` (probar `admin` con contraseña `incorrecta` y leer el mensaje; probar usuario `nadie`; luego entrar con `admin` / `admin12345`), abrir `/app/registro` desde «Crear cuenta profesional» (leer campos y validaciones **sin enviar** el formulario), y volver a entrar. Capturas: `t2-landing.jpeg`, `t2-entrar.jpeg`, `t2-entrar-error.jpeg`, `t2-registro.jpeg`.

- [ ] **Step 3: Escribir las cuatro tablas** y los párrafos «Atascos». Preguntas que deben quedar respondidas en las notas: ¿la Landing aporta algo a un especialista que entra cada día o solo retrasa?; ¿«Entrar» explica qué hacer si no tiene cuenta y cuánto tarda la aprobación?; ¿el error de login distingue contraseña de usuario sin regalar información?; ¿el cambio forzado explica por qué?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: entrada`). Dejar el navegador en `/app/pacientes` autenticado.

---

### Task 3: Gestión — Pacientes, ficha, Estudios, Nuevo caso

**Files:**
- Read: `frontend/src/pages/Patients.tsx`, `frontend/src/pages/Studies.tsx`, `frontend/src/pages/NuevoCaso.tsx`, `frontend/src/components/CaptureGallery.tsx`, `frontend/src/components/AttachCaseSheet.tsx`, `frontend/src/components/ConfirmDialog.tsx`, `frontend/src/components/Sheet.tsx`, `frontend/src/components/Topbar.tsx`
- Modify: informe, secciones «Pacientes», «Ficha del paciente», «Estudios», «Nuevo caso»

**Interfaces:**
- Consumes: navegador autenticado (Tarea 2).
- Produces: nada nuevo en el servidor (no crear pacientes); navegador en `/app/pacientes`.

- [ ] **Step 1: Leer el código.** Anotar: los cuatro contadores de cabecera (¿qué decisión apoyan?), «Empezar sin paciente» frente a «Nuevo caso» frente a «Nuevo estudio» dentro de la ficha (¿tres caminos para lo mismo?), la búsqueda (¿por qué campos?), «Editar» y «✕» (¿confirmación? ¿qué pasa con las sesiones del paciente borrado?), la ficha: antecedentes, «Pedidos», casos/estudios, sesiones guardadas («Reanudar en «Detección»»: ¿dice cuánto tarda, qué restaura y qué no?), capturas, «Guardar cambios» (¿qué guarda, se pierde si se cierra?). Estudios: qué lista, qué acciones, qué pasa sin estudios archivados. Nuevo caso: campos y qué crea.

- [ ] **Step 2: Recorrer.** `/app/pacientes`: buscar «segura», abrir la fila (lleva a `/app/sesion`: anotar que el clic en la fila abre una sesión nueva sin preguntar, ver captura), volver, pulsar «Editar» (ficha), recorrer las secciones de la ficha, «Pedidos», pulsar «Cancelar». `/app/estudios` y `/app/nuevo-caso` desde sus botones: leer, **no enviar formularios**. Capturas `t3-pacientes.jpeg`, `t3-ficha.jpeg`, `t3-estudios.jpeg`, `t3-nuevo-caso.jpeg`.

- [ ] **Step 3: Escribir las tablas.** Preguntas obligatorias en las notas: ¿la persona entiende la diferencia entre caso, estudio y sesión?; ¿sabe desde la lista cuál es el caso activo de un paciente y cómo reanudarlo en un clic?; ¿«Empezar sin paciente» tiene sentido clínico o es un atajo de desarrollo?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: pacientes, estudios y nuevo caso`).

---

### Task 4: Gestión — Usuarios, Solicitudes, Pedidos, Auditoría, Talleres, menú de usuario y tema

**Files:**
- Read: `frontend/src/pages/UsersAdmin.tsx`, `frontend/src/pages/PendingRequests.tsx`, `frontend/src/pages/ClipOrders.tsx`, `frontend/src/pages/AuditTrail.tsx`, `frontend/src/pages/Workshops.tsx`, `frontend/src/components/Topbar.tsx`, `frontend/src/components/ThemeToggle.tsx`, `frontend/src/store/theme.tsx`
- Modify: informe, secciones «Usuarios», «Solicitudes», «Pedidos de clips», «Auditoría», «Talleres», «Menú de usuario y tema»

**Interfaces:**
- Consumes: navegador autenticado como `admin`.
- Produces: **un usuario nuevo `auditora`** (rol no administrador, contraseña `Auditora2026!`) creado desde «Usuarios» para la Tarea 9; anotado en el informe en «Usuario no administrador» como dato creado por la auditoría.

- [ ] **Step 1: Leer el código.** Anotar para cada página: a quién sirve (administrador, cirujano, taller), qué acciones tiene, qué pasa vacía, qué mensajes de error, qué nombres usa para lo mismo (pedido / orden / solicitud / encargo). Menú de usuario: entradas y qué hacen; tema: ¿tiene sentido el tema claro en un visor radiológico?, ¿se recuerda?

- [ ] **Step 2: Recorrer.** Abrir cada página desde la barra, capturar `t4-<página>.jpeg`. En «Usuarios» crear `auditora` (rellenar solo los campos obligatorios; rol no administrador; anotar qué roles ofrece el formulario y qué significan). En «Solicitudes», «Pedidos de clips», «Auditoría» y «Talleres» leer las listas y probar los filtros sin crear ni borrar nada. Abrir el menú «A admin ▾» y probar «Tema claro» (volver al oscuro después).

- [ ] **Step 3: Escribir las tablas.** Preguntas obligatorias: ¿un cirujano necesita ver «Talleres» y «Auditoría», o son páginas de administración que deberían agruparse y esconderse por rol?; ¿«Solicitudes» (cuentas pendientes) y «Pedidos de clips» se distinguen por su nombre?; ¿la persona sabe en qué institución está y con qué permisos?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: administración, pedidos y tema`).

---

### Task 5: Espacio de trabajo — barra superior, carril, barra del visor, HUD, atajos, anotaciones, capturas y grabación

**Files:**
- Read: `frontend/src/pages/Workspace.tsx`, `frontend/src/components/RightPanelColumn.tsx`, `frontend/src/components/RecordButton.tsx`, `frontend/src/components/AttachCaseSheet.tsx`, `frontend/src/vtk/ViewerHeader.tsx`, `frontend/src/vtk/ViewerGrid.tsx`, `frontend/src/vtk/Viewer.tsx` (solo las partes de HUD, atajos y botones de cámara: `CAMERA_BUTTONS`, `onShortcut`, `hudLevel`), `frontend/src/vtk/shortcuts.ts`, `frontend/src/vtk/hud/ShortcutsSheet.tsx`, `frontend/src/vtk/hud/HudToggleGroup.tsx`, `frontend/src/vtk/viewerPrefs.ts`, `frontend/src/components/annotations/AnnotationsPanel.tsx`, `frontend/src/vtk/hud/HudAnnotations.tsx`, `README.md` (sección «Herramientas del visor y de los paneles» y tabla de atajos)
- Modify: informe, secciones «Barra superior del espacio de trabajo», «Carril de pasos y ficha», «Barra del visor», «HUD y niveles», «Atajos», «Anotaciones», «Capturas y grabación»

**Interfaces:**
- Consumes: navegador autenticado.
- Produces: navegador en `/app/sesion` con una **sesión reanudada** («segura, Juan · Detección» del 8/10 17:12, desde la ficha del paciente, botón «Reanudar en «Detección»») para examinar el visor con datos; esa sesión se abandona al final de la tarea (la Tarea 6 empieza una nueva).

- [ ] **Step 1: Leer el código.** Anotar: cada botón de la barra superior y su tooltip («Captura» dice que sin estudio archivado no se guarda en el caso: ¿y dónde va?; «Grabar» 3 minutos sin audio: ¿por qué 3?; «Adjuntar a un caso»: ¿cuándo aparece?; «Guardar progreso»: ¿qué guarda, cuándo se habilita, avisa al salir sin guardar?). Carril: pasos deshabilitados con tooltip «Calcula la morfometría primero» etc.: ¿consistente en los ocho? Barra del visor: PRINCIPAL, distribución (DERECHA/ABAJO/CUATRO/SOLA), PLANOS, HUD (COMPLETO/ESENCIAL/LIMPIO), SINCRO, «?»: ¿nombres entendibles sin leer el README? Atajos: la tabla de `shortcuts.ts` frente a la hoja «?»: ¿coinciden?, ¿hay atajos sin descubrir? Anotaciones: tipos, cómo se crean, cómo se borran, si llegan al informe. Capturas: dónde se guardan y cómo se recuperan; grabación: qué sale y qué no.

- [ ] **Step 2: Recorrer.** Desde `/app/pacientes` → «Editar» → «Reanudar en «Detección»» (la primera de la lista). Capturar `t5-workspace.jpeg`. Probar: cada botón de PRINCIPAL y de distribución; «PLANOS»; los tres niveles de HUD (captura de cada uno `t5-hud-<nivel>.jpeg`); «SINCRO»; «?» (captura `t5-atajos.jpeg`); «◧ Panel» (plegar y desplegar); abrir «Anotaciones» en el panel y leer la lista (6 existentes); pulsar «Captura» y anotar qué ocurre (descarga, mensaje); pulsar «Grabar», esperar 5 s, parar, y anotar qué ocurre; pulsar «Pacientes» en la barra superior y anotar si avisa de trabajo sin guardar; volver a reanudar.

- [ ] **Step 3: Escribir las siete tablas.** Preguntas obligatorias: ¿la persona sabe en todo momento qué paso está activo, qué le falta para el siguiente y si su trabajo está guardado?; ¿los nombres del visor (PRINCIPAL, SINCRO, PLANOS, HUD) significan algo para un radiólogo sin leer el README?; ¿las anotaciones son herramientas clínicas o decoración?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: espacio de trabajo y visor`).

---

### Task 6: Pasos 1–3 — Carga DICOM, Segmentación, Detección (recorrido real desde cero)

**Files:**
- Read: `frontend/src/components/upload/UploadPanel.tsx`, `frontend/src/components/segmentation/SegmentPanel.tsx`, `frontend/src/components/segmentation/PreprocessSection.tsx`, `frontend/src/components/segmentation/TubularControls.tsx`, `frontend/src/components/segmentation/MeshEditTools.tsx`, `frontend/src/components/segmentation/SegmentProgress.tsx`, `frontend/src/components/planning/DetectPanel.tsx`, `frontend/src/components/planning/detectCopy.ts`, `frontend/src/components/planning/detectGate.ts`, `frontend/src/components/planning/LesionConfirm.tsx`
- Modify: informe, secciones «Paso 1 · Carga DICOM», «Paso 2 · Segmentación», «Paso 3 · Detección»

**Interfaces:**
- Consumes: navegador autenticado.
- Produces: **una sesión nueva del Caso 3** segmentada y detectada, con la lesión confirmada como «Es el #1», abierta en el navegador para las Tareas 7 y 8. Anotar en el informe el `session_id` (leerlo de `localStorage.getItem("prospective.session")` con `evaluate_script`).

- [ ] **Step 1: Leer el código.** Anotar por paso: qué habilita «Continuar», qué dice mientras procesa (tiempos reales: segmentación completa ≈ 17 s en esta máquina frente a lo que diga la copia), qué pasa si falla, qué controles avanzados existen (preprocesado, banda, tubular, edición de malla, línea central) y si están donde un radiólogo los esperaría. Detección: qué significan «cociente», «calibre», «curvatura», «Puesto bajo», «azul = dónde, no el saco»; qué hace «Marcar en la malla», «No hay aneurisma», «Re-detectar», «Limpiar candidatos y morfometría» (¿pide confirmación?).

- [ ] **Step 2: Recorrer desde cero.** Desde `/app/pacientes` → «Editar» → «Nuevo estudio» si el formulario permite adjuntar el DICOM; si no, «Empezar sin paciente». Subir `frontend/Estudios/Case 3/Unknown Study/XA/XA000000.dcm` con `upload_file` sobre el `input[type=file]` de «Seleccionar archivos». Anotar el tiempo de carga y lo que la pantalla dice mientras tanto. «Continuar a segmentación». Segmentar con los valores que ofrece por defecto (anotar cuáles y si la persona los entendería); esperar al final; probar «Vista previa» si existe; abrir cada sección avanzada y describirla sin ejecutarla, salvo «Línea central», que se deja para la Tarea 7. «Continuar a detección». Esperar los candidatos; leer cada tarjeta; pulsar «Es el #1»; anotar qué cambia. Capturas `t6-carga.jpeg`, `t6-segmentando.jpeg`, `t6-segmentacion.jpeg`, `t6-deteccion.jpeg`, `t6-lesion-confirmada.jpeg`.

- [ ] **Step 3: Escribir las tres tablas.** Preguntas obligatorias: ¿la persona sabe qué está esperando y cuánto?; ¿entiende qué es un «candidato» y por qué el diámetro es «est.»?; ¿sabe que confirmar la lesión no cambia el plan?; ¿qué ocurre si el detector no encuentra la lesión real, hay un camino claro para marcarla?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: carga, segmentación y detección`). Dejar la sesión abierta en Detección.

---

### Task 7: Pasos 4–5 — Morfometría y Decisión

**Files:**
- Read: `frontend/src/components/morphometry/MorphometryPanel.tsx`, `frontend/src/components/morphometry/PhasesCalculator.tsx`, `frontend/src/components/morphometry/ElapssCalculator.tsx`, `frontend/src/components/morphometry/UiatsCalculator.tsx`, `frontend/src/components/morphometry/FollowupOverlay.tsx`, `frontend/src/components/morphometry/LongitudinalChart.tsx`, `frontend/src/components/perforators/PerforatorsPanel.tsx`, `frontend/src/components/vessels/CenterlinePanel.tsx`, `frontend/src/components/vessels/DiameterChart.tsx`, `frontend/src/components/planning/TreatmentPanel.tsx`
- Modify: informe, secciones «Paso 4 · Morfometría», «Paso 5 · Decisión»

**Interfaces:**
- Consumes: sesión de la Tarea 6 en Detección.
- Produces: la misma sesión con morfometría medida sobre saco cerrado (cuello y ápice marcados), línea central extraída y secciones analizadas, decisión registrada.

- [ ] **Step 1: Leer el código.** Anotar: qué dispara «Analizar morfometría» y por qué la malla puede salir «abierta» (158 aristas de borde en la sesión reanudada), qué piden «Marcar cuello», «Marcar ápice del domo», «Ajustar con varios puntos» y «Medir saco cerrado»; qué significan los índices (DNR, AR, BF) para la persona y si se explican; qué auto-rellenan PHASES, ELAPSS y UIATS y qué hay que escribir a mano; «Seguimiento» (¿qué compara?); «Ramas cerca del cuello»; «Línea central» (origen/destino, resolución, secciones); Decisión: qué opciones ofrece y qué consecuencias tienen.

- [ ] **Step 2: Recorrer.** «Analizar morfometría» → marcar cuello y ápice con clics en el 3D (procedimiento: pulsar el botón, `evaluate_script` que despache `pointerdown`+`mousedown` y `pointerup`+`mouseup` sobre `document.elementFromPoint(x, y)` del lienzo, con `button: 0`; el cuello en la unión del saco con el tronco basilar y el ápice en la cúpula; si el pick falla, anotarlo como atasco y usar «Es el #1» para seguir) → «Medir saco cerrado» → leer métricas e índices → PHASES/ELAPSS/UIATS (anotar los campos vacíos) → «Seguimiento» → «Ramas cerca del cuello» → «Línea central»: marcar origen y destino sobre el tronco basilar, extraer con la resolución recomendada, «Analizar secciones», clic en la gráfica → «Decisión terapéutica»: leer y elegir la opción que corresponde a un aneurisma de tronco basilar de ~10 mm, anotando si la pantalla ayuda a decidir o solo registra. Capturas `t7-morfometria.jpeg`, `t7-cuello.jpeg`, `t7-indices.jpeg`, `t7-linea-central.jpeg`, `t7-decision.jpeg`.

- [ ] **Step 3: Escribir las dos tablas.** Preguntas obligatorias: ¿la persona entiende la diferencia entre la medida automática y la de saco cerrado y cuál va al informe?; ¿los índices se presentan con su interpretación clínica o solo como números?; ¿la línea central aparece como herramienta de morfometría, de stent o de navegación, y está en el paso donde se usa?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: morfometría y decisión`). Dejar la sesión abierta en Decisión.

---

### Task 8: Pasos 6–8 — Dispositivos, Fabricación, Informe; guardar y reanudar

**Files:**
- Read: `frontend/src/components/planning/DevicesPanel.tsx`, `frontend/src/components/planning/ClipSelection.tsx`, `frontend/src/components/planning/ClipRehearsal.tsx`, `frontend/src/components/planning/ClipFieldCard.tsx`, `frontend/src/components/planning/FdSizing.tsx`, `frontend/src/components/planning/WebSizing.tsx`, `frontend/src/components/planning/ManufacturePanel.tsx`, `frontend/src/components/planning/PrintPrepPanel.tsx`, `frontend/src/components/planning/ClipOrderForm.tsx`, `frontend/src/components/planning/ReportPanel.tsx`, `frontend/src/components/planning/CapturePicker.tsx`, `frontend/src/components/planning/placedClips.ts`
- Modify: informe, secciones «Paso 6 · Dispositivos», «Paso 7 · Fabricación», «Paso 8 · Informe», «Guardar y reanudar»

**Interfaces:**
- Consumes: sesión de la Tarea 7 en Decisión.
- Produces: sesión completa **guardada con «Guardar progreso»** con la etiqueta por defecto, y reanudada una vez desde la ficha; el `session_id` y la etiqueta anotados en el informe.

- [ ] **Step 1: Leer el código.** Anotar: Trayectoria (Entrada, Diana, Sugerir corredor, Guardar, Limpiar: ¿qué aporta «guardar» frente a tener los puntos?), Clips (Elegir / Colocar, «Falta medir el cuello», catálogo vacío en esta máquina → «Requiere fabricación»: ¿lo entiende la persona?), Coils, Stents, Stent CL, WEB (qué piden y qué devuelven), Ensayo de clip y mapa de calor (qué muestran), Fabricación (qué genera y para quién), Informe (PDF, DICOM SR, SEG, capturas elegidas: qué incluye, qué no, qué pasa si falta morfometría), «Guardar progreso» (qué guarda, qué no, tamaño) y reanudar (qué vuelve y qué se pierde: ventana, anotaciones, trayectoria, dispositivos).

- [ ] **Step 2: Recorrer.** Dispositivos: «Sugerir corredor» → «Usar esta» en la primera → «Guardar trayectoria»; en Clips, «Elegir» y «Colocar» el primero recomendado (anotar si se puede sin cuello medido y qué dice); abrir Coils, Stents, Stent CL y WEB y leer sin ejecutar lo que tarde más de un minuto. Fabricación: leer, generar lo que ofrezca por defecto si tarda menos de un minuto. Informe: generar el PDF y el DICOM SR, anotar tiempos y mensajes, abrir el PDF (descargado) y comparar su contenido con lo que la persona hizo (lesión, medidas, índices, trayectoria con su etiqueta de ángulo, dispositivos, anotaciones). «Guardar progreso» → ir a «Pacientes» → ficha → «Reanudar» la sesión recién guardada → comprobar en cada paso qué volvió y qué no. Capturas `t8-dispositivos.jpeg`, `t8-clips.jpeg`, `t8-fabricacion.jpeg`, `t8-informe.jpeg`, `t8-reanudada.jpeg`.

- [ ] **Step 3: Escribir las cuatro tablas.** Preguntas obligatorias: ¿el flujo de dispositivos corresponde a cómo decide un cirujano (abordaje → clip) y un intervencionista (cuello → coil/stent)?; ¿el informe cuenta la historia que la persona construyó, con las mismas palabras?; ¿reanudar devuelve el trabajo completo o hay que rehacer cosas sin aviso?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: dispositivos, fabricación, informe y reanudar`).

---

### Task 9: Segunda persona — usuario no administrador

**Files:**
- Read: `frontend/src/store/auth.tsx`, `frontend/src/components/Topbar.tsx`, `frontend/src/pages/Patients.tsx` (ramas por rol), `backend/routers/auth.py`, `backend/routers/patients.py` (filtros `own_patient_ids`), `backend/routers/session_state.py`
- Modify: informe, sección «Usuario no administrador»

**Interfaces:**
- Consumes: usuario `auditora` creado en la Tarea 4; sesión guardada de la Tarea 8.
- Produces: navegador de vuelta como `admin` al terminar.

- [ ] **Step 1: Leer el código.** Anotar qué cambia por rol en menú, listas y acciones, y qué respuestas del servidor (403, listas filtradas) llegan a la pantalla con mensaje o sin él.

- [ ] **Step 2: Recorrer.** Cerrar sesión desde el menú de usuario (anotar si existe y dónde) y entrar como `auditora` / `Auditora2026!` (si el backend obliga a cambiar la contraseña al primer acceso, hacerlo a `Auditora2026!!` y anotarlo). Recorrer la barra: qué páginas ve, qué pasa al abrir `/app/usuarios` y `/app/auditoria` escribiendo la URL, qué pacientes ve, si puede reanudar la sesión guardada de la Tarea 8 (debería no verla o verla con explicación), si puede «Empezar sin paciente». Capturas `t9-barra.jpeg`, `t9-pacientes.jpeg`, `t9-403.jpeg`. Cerrar sesión y volver a entrar como `admin`.

- [ ] **Step 3: Escribir la tabla** y el párrafo «Atascos». Pregunta obligatoria: ¿un cirujano sin rol de administrador puede hacer su trabajo completo sin pedir nada a nadie, y sabe qué no puede y por qué?

- [ ] **Step 4: Comprobar y commit** (`Auditoría F1: usuario no administrador`).

---

### Task 10: Consolidación — recorrido del especialista, eliminaciones, arreglos F1

**Files:**
- Read: el informe completo; `README.md`; la memoria de E4/E5 ya volcada en «Herencia».
- Modify: informe, secciones «Recorrido del especialista», «Eliminaciones y fusiones propuestas», «Arreglos F1 propuestos»; y revisión de coherencia de todas las tablas.

**Interfaces:**
- Consumes: las secciones de las Tareas 2–9.
- Produces: el informe final que el propietario revisa; la lista numerada de eliminaciones para sus decisiones; la lista de arreglos F1 que alimenta el plan `docs/superpowers/plans/<fecha>-auditoria-arreglos.md`.

- [ ] **Step 1: Revisar la coherencia.** Leer todas las tablas seguidas y corregir: veredictos contradictorios para el mismo elemento en dos pantallas, destinos que incumplen la regla (lo visual nunca es `F1`), nombres distintos para la misma cosa (anotar el glosario: p. ej. caso / estudio / sesión; pedido / solicitud; candidato / lesión / aneurisma / saco).

- [ ] **Step 2: Escribir «Recorrido del especialista».** Relato en orden, de Landing a informe reanudado, con subtítulo por paso, el tiempo aproximado observado, las capturas citadas y, en negrita, cada momento de atasco con lo que la persona esperaba. Cerrar con «Lo que dice el informe frente a lo que hice»: tres a seis frases.

- [ ] **Step 3: Escribir «Eliminaciones y fusiones propuestas».** Lista numerada: cada entrada con el elemento, la pantalla, el motivo en una frase, lo que la sustituye (o «nada») y una línea `Decisión del propietario: ___` para rellenar. Solo entran filas con veredicto `eliminar` o `fusionar`.

- [ ] **Step 4: Escribir «Arreglos F1 propuestos».** Tabla de **siete** columnas (siete para que el script no la confunda con el inventario): nº · pantalla · elemento · gravedad · cambio concreto (texto nuevo, orden nuevo, valor por defecto nuevo, comportamiento) · archivo probable · prueba que lo fija. Solo filas con destino `F1`, ordenadas por gravedad (`bloquea` primero). Añadir un recuento final: filas totales, por veredicto, por gravedad y por destino.

- [ ] **Step 5: Comprobación completa y commit**

Run: `python scripts/audit_lint.py docs/superpowers/audits/2026-10-10-auditoria-funcional.md --complete`
Expected: `N filas de inventario, 0 errores`, código 0.

```bash
git add docs/superpowers/audits/2026-10-10-auditoria-funcional.md
git commit -m "Auditoría F1: recorrido del especialista, eliminaciones propuestas y arreglos F1"
```

---

## Después de este plan

1. El propietario lee el informe y rellena «Decisión del propietario» en cada eliminación o fusión.
2. Con esas decisiones se escribe `docs/superpowers/plans/<fecha>-auditoria-arreglos.md` (spec §5) con los arreglos `F1` como tareas de código con prueba, y se ejecuta con desarrollo guiado por subagentes en la misma rama.
3. La lista manual de la spec §7 se pasa sobre master y se cierra F1 con la rutina de finishing-a-development-branch.
