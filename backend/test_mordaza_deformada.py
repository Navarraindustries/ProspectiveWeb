# -*- coding: utf-8 -*-
"""La mordaza se dimensiona sobre el cuello APLASTADO, no sobre su diámetro.

Pedido por dirección el 24-09-2026 a partir de un artículo, y confirmado en dos
fuentes:

  · «Aneurysm clips: What every resident should know» (Neurology India): al
    cerrar las hojas el diámetro del cuello aumenta ~50 %, y por eso la hoja
    debe medir 1,5 veces el cuello. El mismo texto recuerda para qué sirve: el
    cierre incompleto del lado distal es la causa más frecuente de que el domo
    siga rellenándose.
  · «Pre-selection blade size choice for the microsurgical clipping of cerebral
    artery aneurysms: A numerical study» (2024): la deformación medida es de al
    menos 1,4× el tamaño original.

Los dos números son el mismo hecho geométrico: al aplastarse se conserva el
PERÍMETRO, así que un cuello circular de diámetro D pasa a medir πD/2 ≈ 1,571·D
de línea de cierre. Antes el objetivo era ×1,35 y era el centro de una campana,
así que una hoja más larga de la cuenta puntuaba PEOR que una que no llegaba a
cerrar el cuello deformado. Ahora es un mínimo.

Y cuando el contorno del cuello se ha medido no hace falta suponer que es
redondo: su perímetro partido por dos es la línea de cierre exacta de ese
paciente, y para un cuello ovalado la diferencia va por el lado que deja el
cuello abierto.
"""
from __future__ import annotations

import math

import pytest

from services.clip_selection import (ClipCase, derive_manufacture_spec,
                                     evaluate_clip, ideal_jaw_mm)
from services.clips import (NECK_DEFORMATION_FACTOR, ClipShape, ClipSpec,
                            jaw_requirement, required_jaw_mm)


def _clip(blade: float) -> ClipSpec:
    return ClipSpec(
        name=f"Recto {blade:.0f} mm", shape=ClipShape.STRAIGHT,
        blade_length_mm=blade, blade_width_mm=1.0, blade_height_mm=1.2,
        spring_length_mm=blade * 0.9, closing_force_g=150.0,
        manufacturer="prueba",
    )


def _case(neck: float, perimeter: float = 0.0) -> ClipCase:
    return ClipCase(neck_mm=neck, neck_perimeter_mm=perimeter, ar=1.3,
                    dome_height_mm=neck * 1.3, max_diameter_mm=neck * 1.8,
                    neck_source="rim")


class TestLaRegla:

    def test_el_cuello_redondo_pide_una_vez_y_media(self):
        assert required_jaw_mm(4.0) == pytest.approx(6.0)
        assert required_jaw_mm(8.0) == pytest.approx(12.0)

    def test_el_factor_es_el_de_la_literatura(self):
        # No es un número redondo elegido a ojo: es π/2 = 1,571 redondeado, la
        # longitud de un círculo aplastado. Que la constante no se aleje de ahí.
        assert 1.4 <= NECK_DEFORMATION_FACTOR <= math.pi / 2

    def test_un_cuello_diminuto_conserva_el_suelo_de_un_milimetro(self):
        # ×1,5 sobre 1,5 mm son 2,25: una hoja así no deja con qué agarrar.
        r = jaw_requirement(1.5)
        assert r.mm == pytest.approx(2.5)
        assert r.source == "floor"

    def test_sin_cuello_no_se_inventa_una_mordaza(self):
        r = jaw_requirement(0.0)
        assert r.mm == 0.0 and r.source == "none"


class TestElContornoMedidoManda:
    """El factor supone un cuello redondo; el contorno sabe que no lo es."""

    # Elipse de 6,0 × 2,7 mm: área equivalente a un círculo de 4,0 mm, pero
    # 14,16 mm de perímetro. La regla pediría 6,0 mm de mordaza y la línea de
    # cierre real mide 7,08. Un milímetro largo, por el lado que no cierra.
    ELIPSE_PERIMETRO = 14.16

    def test_un_cuello_ovalado_pide_mas_que_su_diametro_equivalente(self):
        con = jaw_requirement(4.0, self.ELIPSE_PERIMETRO)
        sin = jaw_requirement(4.0)
        assert con.source == "perimeter"
        assert con.mm == pytest.approx(7.08, abs=0.01)
        assert con.mm > sin.mm + 1.0
        assert "perímetro" in con.detail

    def test_en_un_cuello_redondo_las_dos_vias_coinciden(self):
        # Perímetro de un círculo de 4 mm: la mitad es πD/2, o sea el factor.
        r = jaw_requirement(4.0, math.pi * 4.0)
        assert r.mm == pytest.approx(4.0 * math.pi / 2.0, abs=0.01)
        assert r.mm == pytest.approx(required_jaw_mm(4.0), rel=0.05)

    @pytest.mark.parametrize("perimetro", [9.0, 40.0, -3.0])
    def test_un_perimetro_imposible_se_ignora_y_manda_la_regla(self, perimetro):
        # Por la desigualdad isoperimétrica el círculo es la curva de MENOR
        # perímetro para un área dada: medir menos de π·D delata un corte
        # abierto o un plano que cazó dos lazos. Pasarse del triple, otro tanto.
        r = jaw_requirement(4.0, perimetro)
        assert r.source == "factor"
        assert r.mm == pytest.approx(6.0)


class TestLoQueCambiaEnLaSeleccion:

    def test_una_hoja_que_no_cierra_el_cuello_deformado_se_descarta(self):
        # 7 mm sobre un cuello de 5 mm: cubre el diámetro de sobra y NO cierra
        # los 7,5 mm que mide aplastado. Antes puntuaba; ahora es un suspenso.
        cand = evaluate_clip(_clip(7.0), _case(5.0))
        cov = next(c for c in cand.criteria if c.key == "coverage")
        assert cov.verdict == "fail"
        assert "7.5 mm" in cov.detail and "aplastado" in cov.detail
        assert cand.score == 0.0

    def test_la_que_cierra_justo_es_correcta_y_no_un_aviso(self):
        cand = evaluate_clip(_clip(7.5), _case(5.0))
        cov = next(c for c in cand.criteria if c.key == "coverage")
        assert cov.verdict == "ok", cov.detail

    def test_entre_dos_que_cierran_gana_la_mas_corta(self):
        # La deformación ya está contada en el mínimo, así que pasarse solo
        # añade hoja dentro del campo. Antes la campana premiaba ×1,35 y podía
        # preferir la más larga.
        justa = evaluate_clip(_clip(8.0), _case(5.0))
        larga = evaluate_clip(_clip(12.0), _case(5.0))
        c_justa = next(c for c in justa.criteria if c.key == "coverage")
        c_larga = next(c for c in larga.criteria if c.key == "coverage")
        assert c_justa.score > c_larga.score

    def test_el_margen_que_se_reporta_es_sobre_el_cuello_aplastado(self):
        # «2,5 mm de margen» sobre un cuello de 5 mm era mentira: la hoja de 10
        # tiene 2,5 mm sobre los 7,5 que hay que cerrar, no 5 sobre el diámetro.
        cand = evaluate_clip(_clip(10.0), _case(5.0))
        assert cand.safety_margin_mm == pytest.approx(2.5)

    def test_el_contorno_medido_llega_hasta_el_criterio(self):
        ovalado = _case(4.0, TestElContornoMedidoManda.ELIPSE_PERIMETRO)
        cov = next(c for c in evaluate_clip(_clip(7.0), ovalado).criteria
                   if c.key == "coverage")
        # 7 mm cierra un cuello redondo de 4 mm (pide 6,0) pero no este óvalo.
        assert cov.verdict == "fail"
        assert next(c for c in evaluate_clip(_clip(7.0), _case(4.0)).criteria
                    if c.key == "coverage").verdict == "ok"


class TestLoQueSeMandaFabricar:

    def test_la_pieza_a_medida_se_dimensiona_igual(self):
        assert ideal_jaw_mm(_case(4.0)) == pytest.approx(6.0)
        assert ideal_jaw_mm(_case(4.0, TestElContornoMedidoManda.ELIPSE_PERIMETRO)) \
            == pytest.approx(7.08, abs=0.01)

    def test_la_especificacion_redondea_hacia_arriba(self):
        # Medio milímetro de más estorba menos que medio de menos.
        spec = derive_manufacture_spec(_case(5.0), [])
        assert spec.blade_length_mm >= required_jaw_mm(5.0)
        assert spec.blade_length_mm == pytest.approx(7.5)

    def test_una_talla_dibujada_mas_CORTA_no_cancela_la_oferta_a_medida(self):
        """El fallo que destapó el cambio.

        La oferta a medida se retiraba cuando había una talla dibujada a menos
        de 1,5 mm, porque «ya está validada». Con la mordaza dimensionada sobre
        el cuello aplastado esa talla puede quedar POR DEBAJO de lo que hace
        falta: un cuello de 5 mm pide 7,5 mm y la talla más próxima son 7. Se
        cancelaba la oferta y se ofrecía la pieza que no cierra.
        """
        from services.clip_selection import suggest_custom_jaw
        pytest.importorskip("services.navarro")
        from services.navarro import list_variants
        if not list_variants():
            pytest.skip("no hay familia NAVARRO instalada")

        cj = suggest_custom_jaw(_case(5.0), None)
        assert cj is not None, "la talla de 7 mm no cierra un cuello de 7,5"
        assert cj.jaw_mm >= required_jaw_mm(5.0)
        assert cj.nearest_drawn_mm < cj.jaw_mm
