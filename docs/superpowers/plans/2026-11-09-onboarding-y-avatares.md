# Onboarding de primera entrada y avatares — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding de primera entrada (6 momentos, recorrido con focos sobre Pacientes, quirófano en 5 zonas, pistas por paso) y avatares indie vectoriales con creador, avatar por defecto, «Desde mi foto» local y elección foto/avatar.

**Architecture:** El servidor guarda tres cosas nuevas por usuario (configuración del avatar, modo foto/avatar con una foto de perfil separada de la del registro, y estado del onboarding) en columnas JSON/texto de `users`, con endpoints `/api/auth/me/*`. El cliente dibuja el avatar como SVG a partir de la configuración, y el onboarding es un motor propio de focos (`data-tour`) más tres pantallas a pantalla completa, orquestadas por un proveedor que vive detrás de la puerta de `ForcePasswordChange`.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend, `backend/.venv`); React 19 + TypeScript + Vite + vitest + motion (frontend). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-09-onboarding-y-avatares-design.md` (léelo entero antes de empezar; las tablas de textos de su §4.4 son la fuente de las copias). Maquetas: https://claude.ai/artifact/NJgPkaWRUN4JdyQVnDMPQ9 (`Main`, `PacientesTour`, `QuiroZonas`, `Av01`, `AvEstilos` primera tarjeta, `AvFoto`).

## Global Constraints

- Cada explicación = `{titulo ≤ 45, como ≤ 110, cuando ≤ 90, porque ≤ 90}` caracteres; se recorta el texto, nunca el límite.
- Prohibida la gamificación: ni puntos, niveles, rachas, logros, marcos ganados, confeti, «misión cumplida», estadísticas ni comparativas.
- La foto no sale del navegador salvo `POST /api/auth/me/profile-photo` cuando la persona elige «Mi foto». Nunca a terceros.
- La foto del registro (`photo_path`, `GET /api/auth/me/photo`) no se expone, no se borra y no se usa como foto de perfil salvo copia explícita.
- `avatar_mode` por defecto `"avatar"` para todas las cuentas; `onboarding_state` nulo = `pendiente`; cuentas existentes al migrar = `invitado`.
- Sin dependencias nuevas de npm ni de pip.
- Español, tuteo, términos de la UI (Pacientes, caso, estudio de imagen, sesión, quirófano, Reanudar).
- Tema oscuro y claro; `prefers-reduced-motion` sin animaciones; objetivos táctiles ≥ 44 px; botones reales.
- Móvil = `useMovil()` de `src/hooks/useEstrecho.ts`: la burbuja pasa a hoja inferior.
- No romper `ForcePasswordChange` (`src/App.tsx:132`), la paleta ⌘K ni el bloqueo de cambios sin guardar del quirófano.
- Al cambiar un modelo Pydantic: `cd backend && .venv/Scripts/python scripts/export_openapi.py ../frontend/openapi.json`, luego `cd frontend && npm run gen:api`, y actualizar a mano `src/api/types.ts`.
- `git add` solo de los ficheros de la tarea (nunca `-A`: hay datos de paciente sin seguimiento en `data/`).
- Backend: `cd backend && .venv/Scripts/python -m pytest <fichero> -q`. Frontend: `cd frontend && npx vitest run <ruta>`; tipos: `npx tsc -b`.

## Review Focus

- La ventana cambia de tamaño o se hace scroll durante una parada → el foco sigue al elemento (test en Task 9).
- El elemento de una parada desaparece a mitad (aviso resuelto, navegación) → la burbuja cae centrada o la parada se salta, sin excepción (test en Task 9).
- La persona sale de Pacientes durante el recorrido (atrás del navegador, atajo) → el recorrido termina como `saltado` sin dejar el velo puesto (test en Task 12).
- Foto inválida o enorme en «Desde mi foto» (no imagen, > 6 MB, HEIC que el navegador no decodifica) → mensaje claro y nada subido; el servidor responde 413 por encima de 6 MB (tests en Tasks 3 y 7).
- `onboarding_state` o `avatar_config` corruptos en la base → `/api/auth/me` no da 500: estado `pendiente` y avatar por defecto (test en Task 2).

---

## Fase 1 · Servidor

### Task 1: Columnas nuevas en `users` y migración 0008

**Files:**
- Modify: `backend/services/db_models.py` (clase `User`, tras `cv_path`)
- Create: `backend/migrations/versions/0008_avatar_y_onboarding.py`
- Test: `backend/test_migrations.py` (añadir un test al estilo de los existentes)

**Interfaces:**
- Produces: columnas `User.avatar_config: Text|None`, `User.avatar_mode: String(8) default "avatar"`, `User.profile_photo_path: String(300) default ""`, `User.onboarding_state: Text|None`. Revisión `"0008_avatar_y_onboarding"`, `down_revision = "0007_etiqueta_a_mano"`.

- [ ] **Step 1: Test que falla** — `test_a_una_base_de_la_0007_con_usuarios_se_le_anaden_avatar_y_onboarding(tmp_path)`: crea una base en la 0007 con dos usuarios (uno con `photo_path`), migra a la cabeza y comprueba: las 4 columnas existen; ambos tienen `avatar_mode == "avatar"`, `profile_photo_path == ""`, `avatar_config is None`, y `json.loads(onboarding_state)["estado"] == "invitado"`; el `photo_path` sigue intacto. Actualiza también `test_la_base_de_la_suite_esta_en_la_ultima_revision` si fija la revisión.
- [ ] **Step 2:** `.venv/Scripts/python -m pytest test_migrations.py -q` → FALLA (no hay revisión 0008).
- [ ] **Step 3: Implementar** las columnas en el modelo y la migración, con el mismo patrón que `0006_users_rejected_at.py` (`_tiene_columna`, `batch_alter_table`, porque `init_db` hace `create_all` antes de migrar). En `upgrade`, tras añadir columnas: `UPDATE users SET onboarding_state = '{"estado":"invitado"}' WHERE onboarding_state IS NULL`. `downgrade` quita las 4.
- [ ] **Step 4:** el test pasa; `pytest test_migrations.py -q` entero en verde.
- [ ] **Step 5: Commit** — `git add backend/services/db_models.py backend/migrations/versions/0008_avatar_y_onboarding.py backend/test_migrations.py && git commit -m "Usuarios: columnas de avatar, foto de perfil y onboarding (migración 0008)"`

### Task 2: Configuración del avatar, estado del onboarding y endpoints `me/avatar` y `me/onboarding`

**Files:**
- Create: `backend/services/avatar_config.py`
- Modify: `backend/models/auth.py` (`UserInfo`, `UserBrief`, `UserAdminInfo`, modelos nuevos), `backend/routers/auth.py` (`_user_to_info`, `_user_to_admin`, `list_users_brief`, dos endpoints)
- Test: `backend/test_me_avatar.py` (patrón de `test_me_photo.py`)

**Interfaces:**
- Produces (Python): listas cerradas `PIELES: tuple[str,...]` (6 hex), `PEINADOS = ("corto","largo","mono","rapado","rizado","coleta")`, `COLORES_PELO` (6 hex), `CABEZAS = ("nada","gorro","gorro_amplio")`, `OJOS = ("nada","gafas","lupas")`, `PIJAMAS` (6 hex de la paleta: `#3FC4AB #5AA9FF #A98BF0 #B5485A #E0A84A #4A5263`), `FONDOS` (5 hex: `#12141A #10233D #241A3D #0F2E28 #DCE3EC`); `validar_config(data: dict) -> dict` (lanza `ValueError` con clave desconocida o valor fuera de lista; exige `"v": 1`); `leer_config(texto: str|None) -> dict|None` (JSON inválido → `None`); `leer_onboarding(texto: str|None) -> dict` (nulo o inválido → `{"estado":"pendiente","pistas_vistas":[],"pistas_activas":True,"tarjeta_cerrada":False}`, rellenando claves que falten).
- Produces (API): `AvatarConfig` (Pydantic: `v: Literal[1]`, `piel: int 0–5`, `peinado`, `pelo`, `cabeza`, `ojos`, `mascarilla: bool`, `pijama`, `fondo`); `OnboardingState` (`estado: Literal["pendiente","invitado","completado","saltado"]`, `fecha: str|None`, `pistas_vistas: list[int]` con valores 1–8, `pistas_activas: bool`, `tarjeta_cerrada: bool`); `UserInfo` gana `avatar_config: AvatarConfig|None`, `avatar_mode: Literal["avatar","foto"]`, `has_profile_photo: bool`, `onboarding: OnboardingState`; `UserBrief` y `UserAdminInfo` ganan `avatar_config`, `avatar_mode`, `has_profile_photo`. `PUT /api/auth/me/avatar` cuerpo `{config: AvatarConfig|null, modo: "avatar"|"foto"}` → `UserInfo`. `PUT /api/auth/me/onboarding` cuerpo `OnboardingState` → `UserInfo`.
- Los hex de piel y pelo los fija el constructor; deben coincidir byte a byte con `src/avatar/config.ts` (Task 4), que los importa del mismo listado.

- [ ] **Step 1: Tests que fallan** en `test_me_avatar.py`:
  - `test_me_trae_avatar_por_defecto_y_onboarding_pendiente`: usuario nuevo → `avatar_config is None`, `avatar_mode == "avatar"`, `has_profile_photo is False`, `onboarding["estado"] == "pendiente"`.
  - `test_put_avatar_guarda_y_devuelve_la_config`: PUT con config válida → 200 y `/me` la devuelve igual.
  - `test_put_avatar_rechaza_valor_fuera_de_lista` (`peinado: "mohicano"`) y `..._clave_desconocida` → 422.
  - `test_modo_foto_sin_foto_de_perfil_se_guarda_pero_has_profile_photo_false`.
  - `test_put_onboarding_guarda_estado_pistas_y_tarjeta`: `{"estado":"completado","pistas_vistas":[1,3],"tarjeta_cerrada":true,...}` → `/me` lo refleja.
  - `test_pistas_fuera_de_rango_422` (`[0]`, `[9]`).
  - **Review Focus:** `test_json_corrupto_en_la_base_no_rompe_me`: escribe `"{no json"` en `onboarding_state` y en `avatar_config` directamente en la BD → `/me` 200, estado `pendiente`, `avatar_config is None`.
  - `test_users_brief_incluye_avatar_y_modo`.
- [ ] **Step 2:** `pytest test_me_avatar.py -q` → FALLAN.
- [ ] **Step 3: Implementar** `services/avatar_config.py`, los modelos y los dos endpoints (`require_user`, CSRF como el resto de `/me`). `has_profile_photo = bool(profile_photo_path) and Path(profile_photo_path).exists()`.
- [ ] **Step 4:** `pytest test_me_avatar.py test_me_photo.py -q` en verde.
- [ ] **Step 5: Commit** — `git commit -m "Auth: avatar por configuración y estado del onboarding en /me"` (añadir los ficheros tocados).

### Task 3: Foto de perfil separada de la del registro

**Files:**
- Modify: `backend/routers/auth.py` (cuatro endpoints nuevos; reutiliza `_save_user_upload` con `subdir="profile_photos"`)
- Test: `backend/test_profile_photo.py`
- Modify (al final de la tarea): `frontend/openapi.json`, `frontend/src/api/schema.gen.ts`, `frontend/src/api/types.ts`

**Interfaces:**
- Consumes: columnas de Task 1, `UserInfo` de Task 2.
- Produces: `POST /api/auth/me/profile-photo` (multipart `photo`, **o** JSON `{"desde_registro": true}` que copia el fichero de `photo_path` a `user_files/profile_photos/{id}{ext}`) → `UserInfo`; `DELETE /api/auth/me/profile-photo` → `UserInfo` (borra solo el fichero de perfil, pone `avatar_mode="avatar"`); `GET /api/auth/me/profile-photo` → fichero o 404; `GET /api/users/{id}/profile-photo` (con sesión) → fichero solo si ese usuario tiene `avatar_mode=="foto"` y foto de perfil; si no, 404. Va en el router de auth con ruta absoluta `/api/auth/users/{id}/profile-photo` para no tocar otros routers.
- `types.ts`: `UserInfo` gana `avatar_config?: AvatarConfig | null; avatar_mode?: "avatar" | "foto"; has_profile_photo?: boolean; onboarding?: OnboardingState;` y se definen `AvatarConfig` y `OnboardingState` iguales que en el servidor; `UserBrief`/`UserAdminInfo` igual con los tres campos de avatar.

- [ ] **Step 1: Tests que fallan:**
  - `test_subir_foto_de_perfil_no_toca_la_del_registro`: usuario con `photo_path` → POST multipart → `photo_path` intacto, `has_profile_photo True`.
  - `test_copiar_desde_registro` → crea un fichero distinto del del registro; sin `photo_path` → 404.
  - `test_borrar_foto_de_perfil_deja_la_del_registro_y_vuelve_a_avatar`.
  - `test_foto_de_otro_solo_si_eligio_mostrarla`: B con foto de perfil y modo `avatar` → A recibe 404; B en modo `foto` → 200.
  - `test_foto_de_otro_nunca_devuelve_la_del_registro`: B solo con `photo_path`, modo `foto` → 404.
  - **Review Focus:** `test_foto_de_perfil_mayor_de_6mb_413`.
- [ ] **Step 2:** `pytest test_profile_photo.py -q` → FALLAN.
- [ ] **Step 3: Implementar** los endpoints.
- [ ] **Step 4:** `pytest test_profile_photo.py test_me_avatar.py test_me_photo.py test_migrations.py -q` en verde; regenerar openapi + `npm run gen:api`; actualizar `types.ts`; `cd frontend && npx tsc -b` sin errores.
- [ ] **Step 5: Commit** — `git commit -m "Auth: foto de perfil propia, separada de la foto del registro"`.

## Fase 2 · Avatar en el cliente

### Task 4: Modelo y dibujo del avatar indie vectorial

**Files:**
- Create: `frontend/src/avatar/config.ts`, `frontend/src/avatar/AvatarSvg.tsx`
- Test: `frontend/src/avatar/config.test.ts`, `frontend/src/avatar/AvatarSvg.test.tsx`

**Interfaces:**
- Produces: mismas listas que `services/avatar_config.py` (`PIELES`, `PEINADOS`, `COLORES_PELO`, `CABEZAS`, `OJOS`, `PIJAMAS`, `FONDOS`) y etiquetas en español para cada valor (`ETIQUETAS`); `type AvatarConfig` (de `api/types.ts`); `configPorDefecto(userId: number): AvatarConfig` (determinista: hash entero de `userId` → índice en cada lista; `mascarilla: false`); `configAleatoria(rand?: () => number): AvatarConfig`; `<AvatarSvg config={AvatarConfig} size={number} title?={string} />` → `<svg viewBox="0 0 200 200">` con `role="img"` y `aria-label` = title (o `aria-hidden` si no hay title).
- Dibujo: el de la maqueta `Av01` (círculo de fondo, cuerpo con pijama y escote en V, cuello, cabeza, orejas, cejas, ojos, boca; capas de peinado por tipo; gorro/gorro amplio tapan el pelo superior; gafas o lupas; mascarilla oculta la boca). Sin contornos.

- [ ] **Step 1: Tests que fallan:**
  - `configPorDefecto(42)` es igual en dos llamadas y distinta de `configPorDefecto(43)` en al menos una clave; todos sus valores pertenecen a las listas.
  - Las listas de `config.ts` coinciden con el JSON de referencia `frontend/src/avatar/listas.json` (que también lee el test de Task 2: `backend/test_me_avatar.py::test_listas_coinciden_con_el_cliente` lee ese mismo fichero). *Crear `listas.json` en esta tarea y hacer que tanto `config.ts` como `services/avatar_config.py` lean de él* (Python: `json.load` de la ruta relativa al repo).
  - `AvatarSvg`: con `cabeza:"gorro"` no se pinta la capa de pelo superior; con `mascarilla:true` no hay boca; con `ojos:"lupas"` aparece el grupo de lupas (`data-pieza="lupas"`); `title` → `aria-label`.
- [ ] **Step 2:** `npx vitest run src/avatar` → FALLAN.
- [ ] **Step 3: Implementar** `listas.json`, `config.ts`, `AvatarSvg.tsx` y adaptar `services/avatar_config.py` para leer `listas.json`.
- [ ] **Step 4:** vitest de `src/avatar` y `pytest test_me_avatar.py -q` en verde.
- [ ] **Step 5: Commit** — `git commit -m "Avatar: listas compartidas, avatar por defecto y dibujo indie vectorial"`.

### Task 5: `UserAvatar` en todos los sitios donde hoy hay iniciales

**Files:**
- Create: `frontend/src/avatar/UserAvatar.tsx`
- Modify: `frontend/src/components/shell/UserMenu.tsx` (sustituye su `Avatar` local), `frontend/src/components/shell/SideNav.tsx:241`, `frontend/src/pages/UsersAdmin.tsx`, `frontend/src/components/ShareSheet.tsx`, `frontend/src/api/client.ts`
- Test: `frontend/src/avatar/UserAvatar.test.tsx` (+ ajustar tests existentes de UserMenu/SideNav que buscan iniciales)

**Interfaces:**
- Consumes: `AvatarSvg`, `configPorDefecto` (Task 4); campos de Task 3.
- Produces: `<UserAvatar user={{ id: number; full_name: string; avatar_config?: AvatarConfig|null; avatar_mode?: "avatar"|"foto"; has_profile_photo?: boolean }} size={number} self?={boolean} />`. Si `avatar_mode==="foto" && has_profile_photo` → carga la foto como blob autenticado (`api.myProfilePhotoObjectUrl()` si `self`, `api.userProfilePhotoObjectUrl(id)` si no), libera la URL al desmontar, y si falla cae al avatar. Si no → `AvatarSvg` con `avatar_config ?? configPorDefecto(id)`. `alt`/`aria-label` = nombre.
- `api` gana: `myProfilePhotoObjectUrl(): Promise<string>`, `userProfilePhotoObjectUrl(id: number): Promise<string>`, `saveAvatar(config: AvatarConfig|null, modo: "avatar"|"foto"): Promise<UserInfo>`, `uploadProfilePhoto(file: Blob): Promise<UserInfo>`, `copyRegistroPhoto(): Promise<UserInfo>`, `deleteProfilePhoto(): Promise<UserInfo>`, `saveOnboarding(s: OnboardingState): Promise<UserInfo>`.
- La pantalla de solicitudes pendientes (`PendingRequests.tsx`) NO cambia: sigue mostrando la foto del registro.

- [ ] **Step 1: Tests que fallan:** sin config → dibuja el avatar por defecto del id; modo `foto` con foto → `<img>` con la URL del mock; modo `foto` y la carga falla → avatar; modo `avatar` con foto de perfil → avatar (no se pide la foto: el mock de `api.userProfilePhotoObjectUrl` no se llama).
- [ ] **Step 2:** `npx vitest run src/avatar/UserAvatar.test.tsx` → FALLA.
- [ ] **Step 3: Implementar** y sustituir en los cuatro sitios (las iniciales grises desaparecen).
- [ ] **Step 4:** `npx vitest run src/avatar src/components/shell src/pages/UsersAdmin.test.tsx src/components/ShareSheet.test.tsx` y `npx tsc -b` en verde.
- [ ] **Step 5: Commit** — `git commit -m "Avatar en menú, barra lateral, usuarios y compartir"`.

### Task 6: Creador de avatar y hoja «Tu avatar»

**Files:**
- Create: `frontend/src/avatar/AvatarCreator.tsx`, `frontend/src/avatar/AvatarSheet.tsx`
- Modify: `frontend/src/components/shell/UserMenu.tsx` (entrada «Tu avatar», icono existente de persona/usuario)
- Test: `frontend/src/avatar/AvatarCreator.test.tsx`, `frontend/src/avatar/AvatarSheet.test.tsx`

**Interfaces:**
- Consumes: Task 4 y `api.*` de Task 5; `useAuth().refreshUser`.
- Produces: `<AvatarCreator value={AvatarConfig} onChange={(c: AvatarConfig) => void} compacto?={boolean} />` (controlado; secciones Piel, Peinado, Color de pelo, Cabeza, Ojos, Mascarilla, Pijama, Fondo; `compacto` muestra solo Piel, Peinado, Color de pelo, Cabeza, Ojos, Pijama y un botón «Más piezas» que despliega el resto en el mismo sitio; botones «Aleatorio» y «Deshacer» con pila interna de cambios); `<AvatarSheet open onClose />`: vista previa grande, el creador, «Desde mi foto» (abre el paso de Task 7), selector «Mostrar: mi avatar / mi foto» (deshabilitado «mi foto» sin foto de perfil), «Quitar mi foto» (solo si hay foto de perfil), «Guardar» → `api.saveAvatar` + `refreshUser()`.
- Cada opción es un `<button aria-pressed>`; las muestras de color llevan `aria-label` con su etiqueta.

- [ ] **Step 1: Tests que fallan:** elegir «Lupas quirúrgicas» llama `onChange` con `ojos:"lupas"`; «Deshacer» devuelve el valor anterior; `compacto` oculta Mascarilla y Fondo; en la hoja, «Guardar» llama `api.saveAvatar(config, "avatar")` y `refreshUser`; «Quitar mi foto» llama `api.deleteProfilePhoto`; sin foto de perfil, «mi foto» está deshabilitado.
- [ ] **Step 2:** FALLAN.
- [ ] **Step 3: Implementar** (cristal con `Sheet` existente; en móvil, a pantalla completa como el resto de hojas).
- [ ] **Step 4:** vitest de `src/avatar` y `src/components/shell` en verde.
- [ ] **Step 5: Commit** — `git commit -m "Avatar: creador por piezas y hoja Tu avatar en el menú"`.

### Task 7: «Desde mi foto», procesado en el navegador

**Files:**
- Create: `frontend/src/avatar/desdeFoto.ts`, `frontend/src/avatar/DesdeMiFoto.tsx`
- Modify: `frontend/src/avatar/AvatarSheet.tsx` (abre `DesdeMiFoto`)
- Test: `frontend/src/avatar/desdeFoto.test.ts`, `frontend/src/avatar/DesdeMiFoto.test.tsx`

**Interfaces:**
- Produces: `medianaRegion(img: ImageData, r: {x:number;y:number;w:number;h:number}): [number,number,number]` (mediana por canal); `masCercano(rgb: [number,number,number], paleta: readonly string[]): number` (índice; distancia euclídea en RGB); `leerRasgos(img: ImageData, guia: {cx:number;cy:number;rx:number;ry:number}): { piel: number; pelo: string }` (mejillas = dos rectángulos a ±0,45·rx de cx, a cy+0,15·ry, de 0,2·rx × 0,2·ry; pelo = franja de cy−1,05·ry a cy−0,75·ry, ancho 0,8·rx); `<DesdeMiFoto base={AvatarConfig} onListo={(r: { config: AvatarConfig; mostrar: "avatar"|"foto"; foto: Blob|null }) => void} onCancel />`.
- Flujo: input `accept="image/*"` (+ `capture="user"` en móvil) → decodificar en `<canvas>` local → guía ovalada con arrastre y zoom (rueda / pellizco / deslizador) → «Leer colores» → creador rellenado → pregunta «¿Qué quieres que vean los demás?» con «Mi avatar» / «Mi foto», texto fijo «Tu foto nunca se envía a servicios externos.» y, si `user.has_photo`, la opción «Usar la foto de mi registro». `AvatarSheet` sube con `api.uploadProfilePhoto(foto)` (recortada al óvalo, JPEG ≤ 1024 px) solo si `mostrar==="foto"`.

- [ ] **Step 1: Tests que fallan:**
  - `medianaRegion` sobre `ImageData` sintética con 3 colores devuelve el mayoritario.
  - `leerRasgos` sobre una imagen sintética con mejillas `#C68A63` y franja `#121212` → `piel` = índice de «Media», `pelo` = negro.
  - `DesdeMiFoto`: eligiendo «Mi avatar», `onListo` recibe `foto: null` y **`globalThis.fetch` no se ha llamado** en todo el flujo (espía).
  - **Review Focus:** fichero que no es imagen o que el navegador no decodifica → mensaje «No hemos podido leer esa imagen. Prueba con un JPG o PNG.» y no se avanza; fichero > 6 MB → «La foto supera 6 MB.» sin decodificar.
- [ ] **Step 2:** FALLAN.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** vitest de `src/avatar` en verde.
- [ ] **Step 5: Commit** — `git commit -m "Avatar: crear desde la foto en el navegador, sin subirla salvo que se elija"`.

## Fase 3 · Onboarding

### Task 8: Textos del onboarding y su test de límites

**Files:**
- Create: `frontend/src/onboarding/copy.ts`
- Test: `frontend/src/onboarding/copy.test.ts`

**Interfaces:**
- Produces: `interface Explicacion { titulo: string; como: string; cuando: string; porque: string }`; `LIMITES = { titulo: 45, como: 110, cuando: 90, porque: 90 } as const`; `PARADAS_PACIENTES: Record<ParadaPacientes, Explicacion>` con `type ParadaPacientes = "secciones"|"crear"|"prueba"|"avisos"|"buscar"|"tarjeta"|"ficha"|"hoy"|"atajos"`; `ZONAS_QUIROFANO: Explicacion[]` (5, en el orden visor, pasos, panel, donde-estas, guardar); `PISTAS_PASO: Record<1|2|3|4|5|6|7|8, Explicacion>`; `TRAMOS_INTRO` (4 tarjetas: `{tramo: "preparar"|"detectar"|"medir"|"dispositivo"; verbo: string; linea: string}`); `PRIMEROS_PASOS` (4: `{texto, donde, cta}`); textos de Hola, Avatar y Listo como constantes. Contenido: el de las tablas del §4.4 de la spec, ajustado a los límites y revisado contra la UI real (en particular las pistas 5 y 7: abrir sus paneles y comprobar).
- Término prohibido en todo el módulo: `/punto|nivel|logro|racha|misión|premio|desbloque/i`.

- [ ] **Step 1: Test que falla** — recorre todas las `Explicacion` exportadas y comprueba cada campo `≤ LIMITES[campo]`, no vacío, sin el término prohibido; `PARADAS_PACIENTES` tiene 9 claves, `ZONAS_QUIROFANO` 5, `PISTAS_PASO` 8.
- [ ] **Step 2:** FALLA.
- [ ] **Step 3: Escribir** `copy.ts`.
- [ ] **Step 4:** PASA.
- [ ] **Step 5: Commit** — `git commit -m "Onboarding: textos con qué, cómo, cuándo y por qué"`.

### Task 9: Motor de focos y burbuja

**Files:**
- Create: `frontend/src/onboarding/tour/resolverObjetivo.ts`, `frontend/src/onboarding/tour/useRecorrido.ts`, `frontend/src/onboarding/tour/Foco.tsx`, `frontend/src/onboarding/tour/Burbuja.tsx`, `frontend/src/onboarding/tour/tour.css`
- Test: `frontend/src/onboarding/tour/*.test.ts(x)`

**Interfaces:**
- Consumes: `Explicacion` (Task 8), `useMovil`, `Button`.
- Produces:
  - `resolverObjetivo(ids: string[], raiz?: ParentNode): HTMLElement | null` — primer `[data-tour="id"]` visible (rect con área > 0 y no `display:none`/`visibility:hidden`).
  - `interface Parada { id: string; objetivos: string[]; explicacion: Explicacion; opcional?: boolean; extra?: ReactNode }`.
  - `useRecorrido(paradas: Parada[], opts: { onTerminar: (como: "completado"|"saltado") => void }): { indice: number; parada: Parada; total: number; objetivo: HTMLElement|null; rect: DOMRect|null; siguiente(): void; anterior(): void; saltar(): void }` — salta paradas `opcional` sin objetivo; recalcula `rect` en `resize`, `scroll` (captura) y con `ResizeObserver` del objetivo; si el objetivo se desmonta, `objetivo=null` (no lanza).
  - `<Foco rect={DOMRect|null} />` — hueco con borde `--primary` y velo `--scrim`; bloquea clics fuera; sin `rect` solo velo; transición 450 ms `cubic-bezier(.2,.8,.2,1)` salvo `prefers-reduced-motion`.
  - `<Burbuja explicacion indice total onSiguiente onAnterior onSaltar extra? rect? etiquetaSiguiente? />` — título + tres líneas con etiqueta pequeña «Cómo», «Cuándo», «Por qué»; puntos de progreso; «Anterior», «Siguiente», «Saltar recorrido»; se coloca al lado con más espacio del `rect` (o centrada sin `rect`); en móvil se pinta como hoja inferior; teclado → / Intro / ← / Esc; foco atrapado; región `aria-live="polite"` con «Parada N de M: título».
- Tests (vitest + jsdom, `getBoundingClientRect` simulado):
  - `resolverObjetivo` elige el segundo id si el primero no es visible; `null` si ninguno.
  - `useRecorrido` salta una parada `opcional` sin objetivo; Esc/«Saltar» → `onTerminar("saltado")`; pasar la última → `onTerminar("completado")`.
  - **Review Focus:** al disparar `resize` con un rect nuevo del objetivo, `rect` se actualiza; al quitar el objetivo del DOM a mitad, `objetivo` pasa a `null`, la burbuja se pinta centrada y no hay excepción.
  - `Burbuja` muestra las tres etiquetas y los textos; ← en la primera parada no hace nada; en `useMovil()` true se pinta con la clase/atributo de hoja inferior.

- [ ] **Step 1:** escribir los tests. **Step 2:** FALLAN. **Step 3:** implementar. **Step 4:** `npx vitest run src/onboarding/tour` en verde. **Step 5: Commit** — `git commit -m "Onboarding: motor de focos y burbuja accesible"`.

### Task 10: Estado del onboarding y puerta de entrada

**Files:**
- Create: `frontend/src/onboarding/OnboardingProvider.tsx`
- Modify: `frontend/src/App.tsx` (envolver la app autenticada, después de la comprobación `must_change_password`)
- Test: `frontend/src/onboarding/OnboardingProvider.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`user.onboarding`, `refreshUser`), `api.saveOnboarding` (Task 5).
- Produces: `useOnboarding(): { estado: OnboardingState; activo: boolean; momento: Momento|null; empezar(): void; ir(m: Momento): void; terminar(como: "completado"|"saltado"): Promise<void>; marcarPista(paso: number): Promise<void>; setPistasActivas(v: boolean): Promise<void>; reiniciarPistas(): Promise<void>; cerrarTarjeta(): Promise<void>; descartarInvitacion(): Promise<void> }` con `type Momento = "hola"|"avatar"|"intro"|"pacientes"|"quirofano"|"listo"`.
- Reglas: `pendiente` → `empezar()` automático al montar (una vez por carga); `invitado` → nada automático (la tarjeta de invitación es de Task 14); cerrar la pestaña a medias no guarda nada nuevo, pero al empezar se guarda ya `estado:"saltado"` con fecha, y al terminar bien se sobrescribe con `completado` (así un cierre a medias no relanza). Las escrituras usan `api.saveOnboarding` con el estado completo y luego `refreshUser()`.

- [ ] **Step 1: Tests que fallan:** con `estado:"pendiente"` arranca en `"hola"` y guarda `saltado`; con `invitado`/`completado`/`saltado` no arranca; `terminar("completado")` guarda `completado`; con `must_change_password` no se monta (se ve `ForcePasswordChange`); `marcarPista(3)` añade 3 sin duplicar.
- [ ] **Step 2:** FALLAN. **Step 3:** implementar. **Step 4:** vitest de `src/onboarding` y `src/App.test.tsx` en verde. **Step 5: Commit** — `git commit -m "Onboarding: estado en el servidor y arranque tras la contraseña inicial"`.

### Task 11: Flujo de seis momentos (Hola, Tu avatar, En 20 segundos, Listo)

**Files:**
- Create: `frontend/src/onboarding/FlujoOnboarding.tsx`, `frontend/src/onboarding/momentos/Hola.tsx`, `.../TuAvatar.tsx`, `.../EnVeinteSegundos.tsx`, `.../Listo.tsx`, `frontend/src/onboarding/onboarding.css`
- Modify: `frontend/src/onboarding/OnboardingProvider.tsx` (pinta `FlujoOnboarding` cuando `activo`)
- Test: `frontend/src/onboarding/FlujoOnboarding.test.tsx`

**Interfaces:**
- Consumes: `useOnboarding` (Task 10), textos (Task 8), `AvatarCreator compacto` y `DesdeMiFoto` (Tasks 6–7), `api.saveAvatar`.
- Produces: `<FlujoOnboarding />` — capa a pantalla completa con barra de 6 momentos y «Saltar todo» siempre visible; «hola», «avatar», «intro» y «listo» son pantallas propias (diseño de la maqueta `Main`); «pacientes» y «quirofano» delegan en Tasks 12 y 13 (mientras no existan, el flujo los salta). Avatar: guarda al pulsar «Siguiente» con `api.saveAvatar(config, modo)` y sube la foto si se eligió «Mi foto». Listo: avatar, «Listo, [nombre]», `PRIMEROS_PASOS` con botones que navegan (crear paciente `?nuevo=paciente`, etc.), «Ir a mis pacientes» (`terminar("completado")`) y «Repetir el recorrido» (`empezar()`).
- Sin progreso ni marcas de «hecho» en Listo.

- [ ] **Step 1: Tests que fallan:** recorre hola → avatar → intro → listo con «Siguiente»; «Saltar todo» → `terminar("saltado")`; en «avatar», cambiar el pijama y avanzar llama `api.saveAvatar` con ese pijama; «Ir a mis pacientes» → `terminar("completado")`; con `prefers-reduced-motion` las tarjetas de intro no llevan animación (atributo/estilo comprobable).
- [ ] **Step 2:** FALLAN. **Step 3:** implementar. **Step 4:** vitest en verde. **Step 5: Commit** — `git commit -m "Onboarding: Hola, Tu avatar, En 20 segundos y Listo"`.

### Task 12: Recorrido del panel de pacientes sobre la interfaz real

**Files:**
- Create: `frontend/src/onboarding/RecorridoPacientes.tsx`, `frontend/src/onboarding/TarjetaEjemplo.tsx`
- Modify (solo atributos `data-tour`): `frontend/src/components/shell/SideNav.tsx` (`nav-secciones`), `frontend/src/components/shell/TopBar.tsx` (`nav-hamburguesa` en el botón «Abrir las secciones»; `acciones-crear` envolviendo «Nuevo caso» + «Nuevo paciente»; `accion-prueba`; `acciones-mas` en el «⋯» de móvil; `atajos` envolviendo ⌘K + tema + menú), `frontend/src/pages/Patients.tsx` (`avisos`, `buscar`, `tarjetas` en la rejilla, `tarjeta-0` en la primera tarjeta), `frontend/src/components/patients/PatientsSidePanel.tsx` (`hoy`)
- Modify: `frontend/src/onboarding/FlujoOnboarding.tsx` (momento «pacientes»)
- Test: `frontend/src/onboarding/RecorridoPacientes.test.tsx`

**Interfaces:**
- Consumes: motor (Task 9), `PARADAS_PACIENTES` (Task 8), `useOnboarding().ir`.
- Produces: `<RecorridoPacientes onFin={() => void} />` — navega a `SCREEN_PATH.patients`, espera al primer render y monta `useRecorrido` con las 9 paradas en este orden y objetivos: secciones `["nav-secciones","nav-hamburguesa"]`; crear `["acciones-crear","acciones-mas"]`; prueba `["accion-prueba","acciones-mas"]`; avisos `["avisos"]` opcional; buscar `["buscar"]`; tarjeta `["tarjeta-0","tarjeta-ejemplo"]`; ficha (mismos objetivos, `extra` = mini esquema Paciente › Casos › Estudios de imagen › Sesiones guardadas › Vista previa); hoy `["hoy"]` opcional; atajos `["atajos","acciones-mas"]`. La línea de «Administración» se añade a `secciones.como` solo para `role==="admin"`; la de pestañas a `buscar.como` solo si existen.
- `<TarjetaEjemplo />` (`data-tour="tarjeta-ejemplo"`, rótulo «Ejemplo») se pinta en la rejilla de Pacientes solo mientras el recorrido está activo y la lista está vacía; nunca llama a la API.

- [ ] **Step 1: Tests que fallan:** con lista vacía aparece `TarjetaEjemplo` y desaparece al terminar; sin avisos la parada se salta (9 → 8 en el contador); no-admin no ve la frase de Administración; **Review Focus:** un cambio de ruta fuera de Pacientes durante el recorrido llama `terminar("saltado")` y quita el velo (no queda ningún `[data-foco]` en el DOM).
- [ ] **Step 2:** FALLAN. **Step 3:** implementar. **Step 4:** vitest de `src/onboarding`, `src/pages/Patients.test.tsx`, `src/components/shell` en verde. **Step 5: Commit** — `git commit -m "Onboarding: recorrido con focos por el panel de pacientes"`.

### Task 13: Quirófano en 5 zonas (ilustración)

**Files:**
- Create: `frontend/src/onboarding/QuirofanoZonas.tsx`
- Modify: `frontend/src/onboarding/FlujoOnboarding.tsx` (momento «quirofano»)
- Test: `frontend/src/onboarding/QuirofanoZonas.test.tsx`

**Interfaces:**
- Consumes: `ZONAS_QUIROFANO`, `Burbuja` (Task 9) con `rect` de la zona dentro de la ilustración.
- Produces: `<QuirofanoZonas onFin={() => void} />` — ilustración del quirófano como la maqueta `QuiroZonas` (visor con vasos, pastillas superiores, dock con los 8 pasos coloreados por `--tramo-*`, panel derecho «PASO 3 · DETECCIÓN»), 5 botones numerados que se pueden pulsar en cualquier orden más Anterior/Siguiente; en la zona 2 la burbuja añade la lista de 5 tramos con sus pasos y la frase «Cuando entres a cada paso, te saldrá una pista corta.»; en móvil la ilustración se apila (visor arriba, panel abajo) y la burbuja es hoja inferior.

- [ ] **Step 1: Tests que fallan:** pulsar el 4 muestra la zona «Dónde estás»; en la zona 2 se ven los 5 tramos; «Siguiente» en la 5 llama `onFin`.
- [ ] **Step 2:** FALLA. **Step 3:** implementar. **Step 4:** vitest en verde. **Step 5: Commit** — `git commit -m "Onboarding: el quirófano en cinco zonas"`.

### Task 14: Pistas por paso, menú de usuario y tarjetas en Pacientes

**Files:**
- Create: `frontend/src/onboarding/PistaPaso.tsx`, `frontend/src/onboarding/TarjetasPacientes.tsx`
- Modify: `frontend/src/components/RightPanelColumn.tsx` (ancla `data-tour="cabecera-paso"` en la cabecera «PASO N · …» y monta `<PistaPaso paso={stepIndex+1} />`), `frontend/src/components/shell/UserMenu.tsx` (entradas «Ver el recorrido de bienvenida», interruptor «Pistas: activadas/desactivadas», «Volver a ver todas las pistas»), `frontend/src/pages/Patients.tsx` (monta `TarjetasPacientes` encima de la rejilla)
- Test: `frontend/src/onboarding/PistaPaso.test.tsx`, `frontend/src/onboarding/TarjetasPacientes.test.tsx`

**Interfaces:**
- Consumes: `useOnboarding` (`estado.pistas_vistas`, `pistas_activas`, `marcarPista`, `setPistasActivas`, `reiniciarPistas`, `cerrarTarjeta`, `descartarInvitacion`, `empezar`), `PISTAS_PASO`, `Burbuja` sin foco, `usePlanning().pickMode`, `isSheetOpen()` de `components/Sheet.tsx`.
- Produces: `<PistaPaso paso={1..8} />` — se muestra si `pistas_activas`, el paso no está en `pistas_vistas`, `pickMode === null`, `!isSheetOpen()` y el onboarding no está activo; «Entendido» → `marcarPista(paso)`; «No mostrar más pistas» → `setPistasActivas(false)`; si cambia `paso` con la pista abierta, se marca la anterior como vista. `<TarjetasPacientes />`: si `estado==="invitado"`, tarjeta «Hay un recorrido nuevo de 4 minutos · Verlo / Ahora no» (`empezar` / `descartarInvitacion` → `saltado`); si el onboarding se completó o saltó y `!tarjeta_cerrada`, tarjeta plegable «Primeros pasos sugeridos» con `PRIMEROS_PASOS` y botón cerrar (`cerrarTarjeta`). Sin contadores ni marcas de hecho.

- [ ] **Step 1: Tests que fallan:** la pista del paso 3 sale la primera vez y no la segunda; no sale con `pickMode="neck_origin"`; «No mostrar más pistas» la apaga para todos los pasos; cambiar de paso con la pista abierta marca el anterior; `invitado` ve la invitación y «Ahora no» la quita; la tarjeta de primeros pasos desaparece al cerrarla y no vuelve tras `refreshUser`.
- [ ] **Step 2:** FALLAN. **Step 3:** implementar. **Step 4:** vitest de `src/onboarding`, `src/components`, `src/pages` en verde. **Step 5: Commit** — `git commit -m "Onboarding: pistas por paso, menú de usuario y tarjetas en Pacientes"`.

### Task 15: Verificación completa en navegador y suites

**Files:** ninguno nuevo (arreglos que salgan, en commits propios).

- [ ] **Step 1:** `cd backend && .venv/Scripts/python -m pytest -q` (suite entera; tarda ~25 min) → todo verde.
- [ ] **Step 2:** `cd frontend && npx tsc -b && npx vitest run` → todo verde.
- [ ] **Step 3:** reiniciar el backend (uvicorn sin `--reload`: parar el proceso viejo del :8000 y relanzar con Start-Process) y Vite; crear una cuenta de prueba en local, aprobarla con un admin de prueba y entrar: recorrer los 6 momentos en escritorio (1440×900), tableta (1024×768) y móvil (390×844), en tema oscuro y claro; comprobar en la pestaña Red del navegador que en «Desde mi foto → Mi avatar» no sale ninguna petición con la imagen.
- [ ] **Step 4:** con una cuenta existente (estado `invitado`), comprobar la tarjeta de invitación; en el quirófano con un estudio, comprobar las 8 pistas y que no aparecen durante un marcado.
- [ ] **Step 5:** commit de arreglos si los hubo; no hacer push sin que el dueño lo pida.
