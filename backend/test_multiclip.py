# -*- coding: utf-8 -*-
"""Cuellos que ninguna hoja cierra sola: el montaje de varios clips.

Preguntado por dirección: «¿se pueden implementar tratamientos multiclip, o solo
está cubierto un clip?». Colocar varios ya funcionaba —`POST /api/clips/plan`
recibe una lista, combina las piezas y mide cobertura y colisiones sobre el
conjunto— pero la RECOMENDACIÓN nunca proponía más de una: para un cuello que
ninguna hoja cerraba, el desenlace era «fabricar una más larga».

Eso dejaba fuera lo que de verdad se hace en quirófano, que está descrito:

  · clipaje en tándem — un clip paralelo al vaso padre y otros apilados por
    encima o por debajo reforzando el cierre;
  · «picket fence» — varios clips en fila, SOLAPADOS y escalonados a lo largo
    del cuello, reconstruyéndolo por tramos. En la serie publicada, siete clips
    fenestrados en un ACM gigante y cuatro en una ACoA.

Lo que este módulo aporta es la geometría: cuántas mordazas de las que existen
cubren la línea de cierre y con qué solape. Qué técnica corresponde es del
cirujano, y el propio resultado lo dice.
"""
from __future__ import annotations

import pytest

from services.clip_selection import (MULTICLIP_MAX_CLIPS, MULTICLIP_OVERLAP_MM,
                                     ClipCase, select_clips, suggest_multiclip)
from services.clips import ClipShape, ClipSpec


def _clip(blade: float) -> ClipSpec:
    return ClipSpec(
        name=f"Recto {blade:.0f} mm", shape=ClipShape.STRAIGHT,
        blade_length_mm=blade, blade_width_mm=1.0, blade_height_mm=1.2,
        spring_length_mm=blade * 0.9, closing_force_g=150.0,
        manufacturer="prueba",
    )


def _case(neck: float) -> ClipCase:
    return ClipCase(neck_mm=neck, ar=1.4, dome_height_mm=neck * 1.4,
                    max_diameter_mm=neck * 1.8, neck_source="rim")


CATALOGO = [_clip(b) for b in (5, 7, 10, 13, 16, 19, 22)]


class TestCuandoSeOfrece:

    def test_no_se_ofrece_si_una_sola_hoja_llega(self):
        # Cuello de 8 mm: pide 12, y la hoja de 13 lo cierra sola. Proponer dos
        # clips ahí sería añadir una pieza y su peso sin ganar nada.
        assert suggest_multiclip(_case(8.0), CATALOGO) is None

    def test_se_ofrece_cuando_ninguna_llega(self):
        # Cuello de 20 mm: 30 mm de línea de cierre, y la hoja más larga es 22.
        m = suggest_multiclip(_case(20.0), CATALOGO)
        assert m is not None and m.n_clips == 2

    def test_sin_cuello_no_hay_montaje(self):
        assert suggest_multiclip(_case(0.0), CATALOGO) is None

    def test_un_catalogo_vacio_no_revienta(self):
        assert suggest_multiclip(_case(20.0), []) is None


class TestLaGeometriaDelSolape:
    """Las hojas van SOLAPADAS, no adosadas.

    Dejarlas tocándose por la punta deja un hueco sin cerrar justo donde se
    juntan, que es la misma forma de fallar que persigue la regla del cuello
    aplastado: el cierre incompleto del lado distal.
    """

    def test_la_cobertura_descuenta_el_solape(self):
        m = suggest_multiclip(_case(20.0), CATALOGO)
        esperado = m.n_clips * m.jaws_mm[0] - (m.n_clips - 1) * m.overlap_mm
        assert m.covered_mm == pytest.approx(esperado)
        assert m.covered_mm < m.n_clips * m.jaws_mm[0], "sumar las hojas a pelo sobra"

    def test_el_montaje_cubre_de_verdad_lo_que_hay_que_cerrar(self):
        for neck in (15.0, 20.0, 25.0, 30.0):
            m = suggest_multiclip(_case(neck), CATALOGO)
            assert m is not None, neck
            assert m.covered_mm >= m.required_mm, neck
            assert m.required_mm == pytest.approx(_case(neck).jaw_requirement.mm)

    def test_con_mas_solape_hace_falta_mas_hoja(self):
        poco = suggest_multiclip(_case(20.0), CATALOGO, overlap_mm=1.0)
        mucho = suggest_multiclip(_case(20.0), CATALOGO, overlap_mm=6.0)
        assert mucho.jaws_mm[0] >= poco.jaws_mm[0]

    def test_una_hoja_mas_corta_que_el_solape_no_cuenta(self):
        # Dos hojas de 2 mm solapando 2 mm cubren 2 mm, no 4: sin este filtro el
        # buscador las encadenaría sin llegar nunca.
        m = suggest_multiclip(_case(20.0), [_clip(1.5), _clip(22.0)])
        assert m is None or all(j > MULTICLIP_OVERLAP_MM for j in m.jaws_mm)


class TestElMontajeMasCorto:

    def test_prefiere_menos_clips(self):
        # Cada hoja añade peso sobre el vaso padre: hay descrita obstrucción del
        # vaso tras clipaje en tándem.
        m = suggest_multiclip(_case(20.0), CATALOGO)
        assert m.n_clips == 2, m.label

    def test_dentro_del_mismo_numero_prefiere_la_talla_menor(self):
        # 30 mm con dos hojas: 16+16 solapando 2 dan 30. La de 19 también
        # llegaría, y sobraría hoja dentro del campo.
        m = suggest_multiclip(_case(20.0), CATALOGO)
        assert m.jaws_mm == [16.0, 16.0], m.jaws_mm

    def test_un_cuello_enorme_pide_mas_piezas(self):
        pequeno = suggest_multiclip(_case(16.0), CATALOGO)
        enorme = suggest_multiclip(_case(40.0), CATALOGO)
        assert enorme.n_clips > pequeno.n_clips

    def test_hay_un_techo_de_piezas(self):
        # La serie del picket fence llega a siete clips, pero proponer una fila
        # larga desde una geometría es pasarse de donde llega este software.
        imposible = suggest_multiclip(_case(200.0), CATALOGO)
        assert imposible is None
        m = suggest_multiclip(_case(40.0), CATALOGO)
        assert m.n_clips <= MULTICLIP_MAX_CLIPS


class TestLoQueElMontajeNoDecide:

    def test_dice_que_la_tecnica_la_elige_el_cirujano(self):
        m = suggest_multiclip(_case(20.0), CATALOGO)
        texto = " ".join(m.cautions).lower()
        assert "cirujano" in texto
        assert "picket fence" in texto or "tándem" in texto

    def test_declara_que_el_solape_es_un_supuesto(self):
        # Ninguna fuente da la distancia: describen el solape cualitativamente.
        # Un número inventado que no se declara se lee como medido.
        m = suggest_multiclip(_case(20.0), CATALOGO)
        assert any("supuesto" in c.lower() for c in m.cautions)

    def test_avisa_del_peso_acumulado_sobre_el_vaso_padre(self):
        m = suggest_multiclip(_case(20.0), CATALOGO)
        assert any("peso" in c.lower() and "vaso padre" in c.lower() for c in m.cautions)

    def test_el_rotulo_dice_las_tallas_y_el_solape(self):
        m = suggest_multiclip(_case(20.0), CATALOGO)
        assert "2 clips" in m.label and "16" in m.label and "solapando" in m.label


class TestEnLaSeleccionCompleta:

    def test_acompana_a_la_especificacion_de_fabricacion_sin_sustituirla(self):
        # Son las dos salidas del mismo callejón: mandar fabricar una pieza
        # larga, o poner dos que ya existen. La elección es del cirujano.
        sel = select_clips(_case(20.0))
        assert sel.outcome == "manufacture"
        assert sel.manufacture is not None
        assert sel.multiclip is not None
        assert "montaje de 2 clips" in sel.summary

    def test_un_cuello_que_una_pieza_cierra_no_lo_lleva(self):
        sel = select_clips(_case(6.0))
        assert sel.multiclip is None

    def test_sin_cuello_medido_no_se_propone_nada(self):
        sel = select_clips(ClipCase(neck_mm=0.0, neck_source="auto"))
        assert sel.outcome == "unmeasured" and sel.multiclip is None
