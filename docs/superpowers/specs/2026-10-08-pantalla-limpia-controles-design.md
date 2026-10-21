# Pantalla limpia y controles (E3): HUD en tres niveles, panel plegable y nombres que dicen lo que hacen — diseño

Fecha: 2026-10-08. Ámbito: `frontend/` (React 19 + vtk.js). Sin cambios de backend. Tercer subproyecto de la serie E (E1 navegación y orientación → E2 anotaciones persistentes → **E3 pantalla limpia y controles** → E4 herramientas clínicas). Parte de master 0a2c5f0.

## 1. Propósito

Lo que pidió el propietario el 2026-10-02: «la manera de deshabilitar/habilitar el HUD para que se vea limpia la vista», «la barra de la derecha ocupa pantalla, sería bueno que se pueda esconder y aparecer», «revisa todos los controles para que sea intuitivo», «revisa si tenemos cosas que no sirvan». Hallazgos medidos en el código (master 0a2c5f0):

- **HUD.** REGLAS ○ (`viewer.hudDecorHidden`) esconde la clase `hud-decor`: esquinas, retícula, líneas de referencia, cinta de rumbo, traza del recorte y **la escalera de cortes, que es un control**. Quedan rótulos, lecturas, letras de borde, grupos de botones, barra de escala y maniquíes (que son viewports de vtk y el CSS no los alcanza). No existe una vista «solo imagen». PLANOS no hace nada mientras REGLAS está en ○ (`showPlanes = !planesHidden && !decorHidden`).
- **Panel derecho.** `clamp(300px, 27vw, 384px)` sin forma de plegarlo; en 1280 px el visor se queda con el 58 % del ancho. El carril izquierdo sí se adapta solo (62 px bajo 1024, oculto bajo 820).
- **Tres grupos AX·COR·SAG.** La cabecera elige la celda principal («PRINCIPAL ▸»); el 3D mueve la cámara; VOLUMEN elige el eje de acumulación. Los dos últimos no llevan prefijo. Además «CENTRAR» (VOLUMEN), «AJUSTAR» (Oblicuo) y «Ajustar» (3D) son la misma acción de encuadre, mientras que «CENTRAR» en Oblicuo devuelve el plano al punto. «DESDE EL FINAL» es un botón de una sola opción siempre pulsado.
- **Pista de gestos.** Abajo y centrada, sin `pointer-events: none`: tapa la fila ACUMULADO · DESDE · CENTRAR de VOLUMEN, la barra de cine y la barra de escala, e intercepta clics durante sus tres segundos. Reaparece cada vez que cambia el contenido de la celda principal.
- **Ventana y nivel.** El arrastre que cambia la ventana no se anuncia en ningún sitio; no hay forma de restablecerla; el menú de preajustes solo existe cuando un corte es la celda principal y en TC no tiene «Auto». Las lecturas no llevan unidad.
- **UMBRAL.** «UMBRAL n» sin unidad en el HUD y `unit=""` en los deslizadores; el valor está en intensidades del volumen, que en TC son HU.
- **Duplicados.** Tres formas de elegir la principal (cabecera, doble clic y «⤢»); el aviso de nivel reducido se repite en cada celda.

Decisiones del propietario (2026-10-08): tres niveles con una tecla; panel plegable con otra; quitar «⤢»; las capturas reflejan el nivel del HUD.

## 2. HUD en tres niveles (`vtk/viewerPrefs.ts`, `vtk/hud/hud.css`, `Viewer.tsx`, `ViewerHeader.tsx`, `composeCapture.ts`)

- Preferencia `viewer.hudLevel: "completo" | "esencial" | "limpio"` (`useStoredChoice`, variante de `useStoredFlag` para cadenas). Migración: si existe `viewer.hudDecorHidden = "1"` y no hay `hudLevel`, se parte de `esencial`; la clave vieja se borra.
- La raíz del visor lleva `data-hud="completo|esencial|limpio"`; el CSS hace el resto. Lo que es viewport de vtk (maniquí del 3D, recuadro de orientación de VOLUMEN) recibe la prop `showInset`.

| Elemento | Completo | Esencial | Limpio |
|---|---|---|---|
| Esquinas, retícula, líneas de referencia, cinta de rumbo, traza del recorte, contorno del plano libre en cortes | ● | ○ | ○ |
| Grupos de botones del HUD (modo, eje, cámara, preajustes, recorte…) y pista de gestos | ● | ○ | ○ |
| Rótulo, lecturas de esquina, letras de borde, barra de escala | ● | ● | ○ |
| Escalera de cortes | ● | ● | ○ |
| Maniquí 3D y recuadro de orientación de VOLUMEN | ● | ● | ○ |
| Barra de cine | enfocada o reproduciendo | igual | solo reproduciendo |
| Anotaciones (`.hud-anot`) y asas de los planos | ● | ● | ● |
| Contornos de los planos en el 3D | según PLANOS | según PLANOS | según PLANOS |

- Los botones del HUD ocultos siguen funcionando por teclado (S, C, espacio, R/A/G/T…); la hoja «?» no cambia.
- **H** recorre completo → esencial → limpio → completo. Al cambiar, una pista de 1,2 s arriba («HUD esencial»), que también se enseña al cargar si el nivel guardado no es completo.
- Cabecera: REGLAS ●/○ se sustituye por el grupo «HUD ▸ COMPLETO · ESENCIAL · LIMPIO» (abreviado «HUD ▸ C · E · L» bajo 800 px) con título «Nivel del HUD (H)». PLANOS deja de depender de REGLAS: `showPlanes = !planesHidden`.
- Capturas y grabaciones reflejan el nivel: `leerVisor` pasa `hudLevel` y `composeCapture` omite rótulo y lecturas en `limpio` (las formas de anotación se pintan siempre); la banda superior (rumbo y nota) se omite en `limpio`. `estadoVisor` gana `hud_level` y deja de escribir `hud_decor_hidden`.
- Puro y probado: `hudLevelFromStorage(raw, legacyDecorHidden)`, `nextHudLevel(level)`.

## 3. Panel derecho plegable (`pages/Workspace.tsx`, `components/Topbar.tsx`, `styles/responsive.css`)

- Estado `panelCollapsed` en `localStorage` (`ws.panelCollapsed`, por usuario del navegador como las otras preferencias). Plegado: la columna derecha pasa a una tira de 28 px con fondo del panel, borde izquierdo y una pestaña vertical con «PANEL ▸ <nombre del paso>» y la insignia de anotaciones si hay; un clic en la tira o **P** la despliega. El visor toma el ancho (la rejilla ya sigue a su celda con `followContainer`/`ResizeObserver`).
- Botón en la barra superior, a la izquierda de «Guardar progreso»: «◧ Panel» con título «Ocultar o mostrar el panel del paso (P)» y `aria-pressed`.
- Lo que el panel estaba enseñando (un formulario a medias, el borrador de una anotación) no se desmonta: la columna se oculta con `display: none` sobre el mismo árbol, para que plegar no pierda estado ni dispare efectos de montaje.
- Bajo 820 px (donde el carril izquierdo ya se esconde) el panel plegado sigue siendo la tira; nada más cambia.
- **P** se atiende en Workspace (como los dígitos de paso), nunca con el foco en un campo de texto.

## 4. Nombres y grupos (`ViewerHeader.tsx`, `MipView.tsx`, `Viewer.tsx` renderScene, `ObliqueView.tsx`, `hud/HudToggleGroup.tsx`, `vtk/shortcuts.ts`)

- `HudToggleGroup` gana `label?: string` que se pinta delante como «EJE ▸» en mono apagado.
- VOLUMEN: «EJE ▸ AX · COR · SAG»; el título de EJE en RECORTE deja de repetir la lista. «CENTRAR» → «ENCUADRAR». «DESDE EL FINAL» → grupo «DESDE ▸ INICIO · FINAL» con la opción vigente pulsada.
- 3D: «VISTA ▸ ENCUADRAR · AX · COR · SAG · LESIÓN» (antes «Ajustar · Ax · Cor · Sag · LESIÓN»).
- Oblicuo: «AJUSTAR» → «ENCUADRAR»; «CENTRAR» (desplazamiento a 0) → «AL PUNTO».
- Atajo C: la tabla y la hoja dicen «Encuadrar la celda enfocada»; `onShortcut("center")` no cambia de comportamiento.
- Cabecera: «PRINCIPAL ▸» se conserva.
- Test: ninguna celda enseña dos grupos sin prefijo con las mismas opciones; «CENTRAR» y «AJUSTAR» ya no aparecen en el código de la interfaz (grep en el test de copia).

## 5. Pista de gestos (`Viewer.tsx`, `hud/hud.css`)

- Se recoloca arriba, bajo el rótulo (`top: 24px`, centrada), en una línea de 10 px con `pointer-events: none` y sin fondo opaco; desaparece a los 3 s como hoy.
- Se enseña **una vez por tipo de celda y sesión del navegador** (`sessionStorage` `ws.hintShown.<kind>`), no en cada cambio de principal; «?» abre la hoja completa, que es donde viven todos los gestos. Las pistas no efímeras que reutilizan el mismo canal («Máximo 200 anotaciones», los avisos del cine) se mantienen y pasan a la misma posición.
- En `limpio` no hay pista.

## 6. Ventana y nivel (`SliceView.tsx`, `ObliqueView.tsx`, `Viewer.tsx`, `vtk/windowPresets.ts`, `vtk/modality.ts`)

- La lectura «W n · L n» pasa a ser un control (`button.hud-readout`, misma tipografía): título «Ventana y nivel · arrastrar en la imagen los cambia · doble clic restablece»; doble clic → `setMprWl(null)`. También en celdas compactas, en forma corta «W n L n».
- El menú de preajustes («Preajuste») se monta en **toda** celda de corte no compacta, no solo en la principal; gana «Auto» (ventana del estudio) en TC y una entrada «Restablecer» al final; `wlHost` desaparece.
- Unidad: `vtk/modality.ts` exporta `HU_MODALITIES = ["CT", "CTA", "CTPA"]` e `isHuModality(m)`; `windowPresets.ts` y `PreprocessSection.tsx` la consumen (hoy uno mira solo «CT»). Lecturas W/L y NIV/VENT llevan « HU» en esas modalidades.

## 7. UMBRAL con unidad (`vtk/mipReadout.ts`, `components/segmentation/SegmentPanel.tsx`, `Viewer.tsx`)

- HUD: «UMBRAL 220 HU» en TC; «UMBRAL 220» en el resto. «VISTA PREVIA · CAPTURA [lo, hi]» igual, con unidad en TC.
- Panel de segmentación: deslizadores con `unit="HU"` en TC y «intensidad» como etiqueta de ayuda en el resto («Intensidad del volumen, sin unidad física»).

## 8. Retirar y fusionar (`ViewerGrid.tsx`, `SliceView.tsx`, `Viewer.tsx`, `ViewerHeader.tsx`)

- Se quita el botón «⤢» y su enfoque posterior (`ViewerGrid.tsx` ~190–208): la principal se elige con la cabecera o con doble clic; el test de ViewerGrid que lo cubría pasa a cubrir el doble clic.
- El aviso de nivel reducido deja de repetirse por celda (`levelNote` en cada corte y en el 3D) y pasa a una sola lectura en la banda de cabecera, a la derecha de los grupos; la captura lo sigue llevando en la banda superior.
- Los modos sin WebGL2 (`MprViewLegacy`, `ObliqueMprView`), la grabación, `cutFaceVisible`, `morphoOverlay` y `levelNoteShort` se usan y se quedan.

## 9. Atajos (`vtk/shortcuts.ts`, `hud/ShortcutsSheet.tsx`, `README.md`)

- **H** «Nivel del HUD: completo · esencial · limpio» (ámbito visor); **P** «Ocultar o mostrar el panel del paso» (ámbito flujo). `RESERVED_KEYS` queda vacío y la prueba que vigilaba H/P pasa a vigilar que ambas estén asignadas. La fila de C dice «Encuadrar la celda enfocada». README: tabla y párrafo «H y P quedan sin asignar» actualizados; sección «Pantalla limpia» en el README del visor.

## 10. Capturas y estado

`estadoVisor`: `hud_level`, `panel_collapsed`; se retira `hud_decor_hidden`. La captura compuesta omite rótulo, lecturas y banda superior en `limpio`.

## 11. Fuera de alcance

Plegar el carril izquierdo (ya responde al ancho); herramientas nuevas (E4); cambios de backend; ocultar el HUD por celda; temas de color.

## 12. Pruebas

- `viewerPrefs.test.ts`: `hudLevelFromStorage` (sin nada → completo; legado «1» → esencial; valor inválido → completo), `nextHudLevel` cíclico, `useStoredChoice` guarda y recupera.
- `hudLevel.test.tsx` (render de un `SliceView`/`MipView` simulado dentro de la raíz con `data-hud`): en esencial no hay `.hud-decor` visibles pero sí escalera y lecturas; en limpio no hay rótulo, lecturas ni escalera, y sí `.hud-anot`.
- `composeCapture.test.ts`: con `hudLevel: "limpio"` no se pintan rótulo, lecturas ni banda; las formas sí.
- `Workspace.test.tsx` (o nuevo `PanelCollapse.test.tsx`): P pliega y despliega, el estado se guarda, el árbol del panel no se desmonta (un input conserva su valor), nada con el foco en un campo de texto.
- `ViewerHeader.test.tsx`: grupo HUD con tres opciones y título «(H)»; PLANOS funciona con HUD esencial; aviso de nivel en la banda.
- `HudToggleGroup.test.tsx`: `label` se pinta delante.
- `copy.test.ts`: `grep` sobre `src/vtk` y `src/components`: ni «CENTRAR» ni «AJUSTAR» como etiqueta; «ENCUADRAR» presente en VOLUMEN, 3D y Oblicuo.
- `SliceView.*.test.tsx`: doble clic en la lectura W/L llama a `onWindowLevelReset`; lectura con « HU» en TC y sin unidad en XA; preajustes con «Auto» y «Restablecer».
- `mipReadout.test.ts`: «UMBRAL 220 HU» / «UMBRAL 220».
- `shortcuts.test.ts`: H → `hud-cycle`, P → `panel-toggle`; `RESERVED_KEYS` vacío.
- `ViewerGrid.test.tsx`: sin «⤢»; doble clic promueve y enfoca.
- `hint.test.ts`: una vez por tipo y sesión; `pointer-events: none`.
- Navegador (Case 3): H tres veces en DERECHA y CUATRO; captura en limpio sin rótulos; P pliega y el visor se ensancha; grupos renombrados; doble clic en W/L; preajustes en una celda lateral; UMBRAL con HU en un TC y sin unidad en Case 3 (XA); pista arriba y una sola vez; sin «⤢».
