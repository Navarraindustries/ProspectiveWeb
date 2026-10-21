"""Los cortes de los índices de forma, una sola vez (F1-160, F1-161, F1-163, F1-179, F1-180).

Por qué existe: cada pantalla tenía los suyos. La insignia del AR cortaba en
1,2, la etiqueta de riesgo en 1,3 y Decisión en 1,3 y 2,0; el DNR en 1,5 y 1,6;
la ondulación en 0,15, en 0,10/0,25 y en 0,20. Un AR de 1,25 salía «Mod» en la
tabla y no contaba para el riesgo de al lado. Ahora la etiqueta de riesgo
(morphometrics.py), Decisión (treatment.py), el perfil endovascular, el informe
y el frontend (frontend/src/components/morphometry/thresholds.ts, comparado en
test_index_thresholds.py) leen estos.

Lo que se sabe de cada corte, sin adornarlo:
- AR: 1,6 es el de Ujiie 2001 (y el de recanalización tras coiling); 1,2 es el
  extremo bajo de la misma literatura, de uso corriente, sin cohorte propia.
- DNR: 2,0 es la mitad «DNR < 2» de la definición de cuello ancho (Brinjikji,
  AJNR 2009); 1,6 es el gradiente de adyuvante de ese mismo trabajo.
- BF: el índice es de Hoh 2007; el corte de 1,5 es de la aplicación.
- UI: el índice es de Raghavan 2005; 0,10 y 0,25 son de la aplicación.
- SR: el índice es de Dhar 2008; 2,0 y 3,0 son de uso corriente.
"""
from __future__ import annotations

AR_HIGH: float = 1.6
AR_MOD: float = 1.2

DNR_HIGH: float = 2.0
DNR_MOD: float = 1.6

#: BF > 1,5: el domo es bastante más ancho que el cuello → cuello relativamente
#: ESTRECHO. La insignia lo decía al revés («Cuello ancho»).
BF_WIDE: float = 1.5

UI_HIGH: float = 0.25
UI_MOD: float = 0.10

EI_MOD: float = 0.35

SR_HIGH: float = 3.0
SR_MOD: float = 2.0


def bf_label(bf: float) -> str:
    """La misma etiqueta que la insignia de Morfometría (thresholds.ts, labelFor)."""
    return "Cuello estrecho" if bf > BF_WIDE else "Cuello ancho"
