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
