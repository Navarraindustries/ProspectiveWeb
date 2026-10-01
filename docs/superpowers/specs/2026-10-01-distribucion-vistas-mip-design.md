# Distribución configurable de las vistas y MIP interactivo — diseño

Fecha: 2026-10-01. Ámbito: `frontend/` (React 19 + vtk.js). Sin cambios de backend.

## 1. Propósito

El profesional abre un estudio y ve las vistas de cortes y el MIP demasiado pequeños: la distribución es fija (principal arriba, franja de cuatro abajo de 160–240 px) y solo admite doble clic para subir una vista a principal. El MIP, además, no se comporta como las otras vistas: dentro de él la rueda hace zoom y no hay desplazamiento, así que al ponerlo grande no se puede avanzar cortes ni mover la imagen.

Resultado buscado:

1. Las cinco vistas (3D, axial, coronal, sagital, MIP) se ven más grandes por defecto y siempre visibles.
2. El usuario reparte las vistas como quiera —intercambiándolas al arrastrar y ajustando el separador— y el navegador lo recuerda.
3. El MIP responde a los mismos gestos que las vistas de cortes y se ve construirse corte a corte desde él mismo.

Decisiones del propietario (2026-10-01): presets + separador + intercambio arrastrando (no rejilla libre); preset por defecto «1 principal + 4 en columna a la derecha»; las cinco vistas siempre visibles.

## 2. Modelo de distribución

Sustituye al actual `ViewerLayout { main, strip[4] }` de `frontend/src/vtk/layout.ts`.

```ts
export type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip";
export type LayoutPreset = "derecha" | "abajo" | "sola";

export interface ViewerLayout {
  preset: LayoutPreset;
  /** Hueco principal y los cuatro huecos secundarios, en orden de lectura
   *  (de arriba abajo en «derecha», de izquierda a derecha en «abajo»). */
  main: PaneId;
  side: [PaneId, PaneId, PaneId, PaneId];
  /** Fracción del eje repartido que ocupa la principal: ancho en «derecha»,
   *  alto en «abajo». Se acota a [0.5, 0.85]. */
  mainFraction: number;
}

export const DEFAULT_LAYOUT: ViewerLayout = {
  preset: "derecha", main: "scene", side: ["axial", "coronal", "sagital", "mip"], mainFraction: 0.72,
};
```

- `derecha`: rejilla de dos columnas; la principal a la izquierda ocupa `mainFraction` del ancho, la columna derecha reparte su alto en cuatro huecos iguales.
- `abajo`: el esquema actual; la principal ocupa `mainFraction` del alto y la franja inferior reparte su ancho en cuatro.
- `sola`: solo la principal (sustituye al interruptor «CORTES ○/●»; los huecos secundarios siguen asignados para volver al preset anterior sin perder el orden).
- **Adaptación**: si el visor es más alto que ancho (relación < 1), el preset `derecha` se dibuja como `abajo` sin cambiar el estado guardado.
- **Persistencia**: `localStorage` clave `ws.viewer.layout.v2`, como hasta ahora por usuario y navegador. Migración desde `ws.viewer.layout` (v1 `{main, strip}`): `preset: "abajo"`, `side = strip`, `mainFraction` 0,74 (equivale a la franja de hoy). Cualquier valor inválido (vistas repetidas o ausentes, fracción fuera de rango, preset desconocido) → `DEFAULT_LAYOUT`. El flag antiguo de franja oculta (`PREF_STRIP_HIDDEN`) se traduce a `preset: "sola"` una vez y se borra.
- Funciones puras exportadas y probadas: `swapPanes(layout, a, b)`, `promote(layout, id)` (equivalente al `swapPane` actual), `setPreset`, `setMainFraction` (acota), `loadLayout`, `saveLayout`, `migrateV1`.

## 3. Interacción

**Las vistas no se remontan.** Las cinco se renderizan siempre, una sola vez cada una, dentro de una rejilla CSS; cambiar la distribución solo cambia el `grid-area` (o el orden) de cada celda y las plantillas de la rejilla. Así el lienzo WebGL de cada vista sobrevive al intercambio, no parpadea y no pierde cámara ni ventana/nivel. Cada vista ya se ajusta a su celda con `ResizeObserver`. La principal y los huecos secundarios difieren solo en tamaño y en el modo `compact` del HUD, que pasa a derivarse del tamaño real de la celda (ancho < 420 px) y no del hueco.

**Intercambiar arrastrando.** Cada vista tiene una cabecera fina (la cinta de orientación que ya existe hace de asa). Arrastrar la asa sobre otra vista las intercambia; el destino se resalta con el borde HUD mientras se sobrevuela; el arrastre solo empieza tras mover más de 6 px, y Escape lo cancela. Implementación con eventos de puntero propios (no HTML5 DnD, que no funciona bien sobre lienzos ni en táctil); sin dependencias nuevas.

**Doble clic** en una vista secundaria la sube a principal (comportamiento actual, `promote`). Mientras hay un modo de selección activo sobre el 3D (picking de cuello, clip), la escena se fuerza a principal como hoy.

**Separador.** Entre la principal y la columna/franja hay una barra de 6 px arrastrable (cursor `col-resize`/`row-resize`); ajusta `mainFraction` en vivo con límites 0,5–0,85 y guarda al soltar. Doble clic en la barra vuelve al valor por defecto del preset.

**Presets.** Un `HudToggleGroup` en la cabecera del visor con «DERECHA · ABAJO · SOLA» sustituye al interruptor «CORTES». Atajos: `1` preset sola, `2` derecha, `3` abajo (solo con el visor enfocado; no roban teclas a los campos de texto).

## 4. El MIP como las demás vistas

Gestos, alineados con `SliceView`:

| Gesto | Hoy | Nuevo |
|---|---|---|
| Rueda | zoom | avanza el corte (mueve el mismo punto `mprVoxel` que las demás vistas, a lo largo del eje de acumulación del MIP; límites 0..n−1) |
| Ctrl + rueda | — | zoom (factor 1,1 por paso) |
| Arrastrar | rotar | rotar (se conserva) |
| Botón central o Shift + arrastrar | — | desplazar la imagen |
| Botón «⌖» en el HUD | — | recentrar cámara y zoom sobre el volumen |

- **Eje de acumulación.** Hoy lo impone la vista principal (axial salvo que la principal sea coronal o sagital). Pasa a ser un control del propio MIP, `HudToggleGroup` «AX · COR · SAG», con el mismo valor por defecto que hoy; al cambiarlo, la cámara se recoloca en la vista estándar de ese plano a través de `standardViewInVolume` para que la cinta de orientación siga siendo cierta.
- **Línea del corte actual.** Sobre el MIP se dibuja la traza del plano de acumulación actual (en modo acumulado, el frente hasta donde ha acumulado; en modo lámina, las dos caras) con el color del plano que ya usan las vistas de cortes, proyectando el plano con la cámara del MIP (cuatro esquinas del volumen en ese plano → polígono en pantalla). Se oculta si la cámara mira casi de canto (ángulo < 5°).
- **Construcción corte a corte.** No cambia la lógica de recorte (`acumulado` recorta hasta `posMm`, `lámina` recorta `±mipSlabMm`): basta con que la rueda en el MIP mueva `mprVoxel`, igual que la rueda en los cortes ya lo hacía, para que la imagen se vea crecer o encoger desde la propia vista.

## 5. Capturas

`captureWithLayout` hoy promueve la escena a principal y espera a que se remonte. Con las vistas siempre montadas, solo necesita promover (para que el lienzo tenga el tamaño grande), esperar un fotograma, capturar y restaurar; `waitForCapture` deja de ser necesario y se elimina. La captura compuesta del visor (`anotar` de cada hueco) recorre `main` y `side` según el preset vigente y la geometría real de cada celda (`getBoundingClientRect`), no una franja fija.

## 6. Pruebas

- `layout.test.ts`: presets, `swapPanes`, `promote`, acotado de `mainFraction`, migración v1→v2 (incluida franja oculta → `sola`), rechazo de valores inválidos.
- Rejilla: un test de Testing Library que, con un layout dado, comprueba el `grid-area` de cada celda y que las cinco vistas siguen siendo los mismos nodos tras intercambiar (misma referencia DOM).
- Separador: cálculo puro `fractionFromPointer(rect, x|y, preset)` con límites.
- MIP: pruebas de los gestos sobre un stub (rueda → índice ±1 acotado; Ctrl+rueda → zoom; Shift/central → pan; recentrar) y de la proyección de la línea del corte (plano en el centro → polígono centrado; cámara de canto → oculta).
- Navegador (Case 3, manual): abrir el estudio y ver 1+4 a la derecha; arrastrar el MIP a la principal y verlo construirse con la rueda; mover el separador; recargar y comprobar que se recuerda; captura compuesta con cinco vistas.

## 7. Fuera de alcance

Rejilla libre con tamaños arbitrarios; distribuciones guardadas con nombre; sincronizar la distribución entre dispositivos o usuarios; cambios en el backend.
