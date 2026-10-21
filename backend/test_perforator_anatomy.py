"""F1-174/181/231: el tronco basilar no es la punta.

La lista juntaba «Basilar (punta, tronco o AICA)» y la tarjeta de perforantes
era siempre la de la punta (talamoperforantes). La lesión de Case 3 está en el
tronco: lo que ahí cuesta caro son las perforantes pontinas, y el panel y el PDF
decían otra cosa.
"""
from __future__ import annotations

from services.perforator_anatomy import expected_perforators, territory_to_dict
from services.treatment import (LOCATION_AICA, LOCATION_BASILAR_LEGACY,
                                LOCATION_BASILAR_TIP, LOCATION_BASILAR_TRUNK,
                                LOCATIONS, compute_decision)


class TestLaListaSeparaPuntaTroncoYAica:
    def test_los_tres_nombres_del_anexo(self):
        assert LOCATION_BASILAR_TIP == "Punta basilar"
        assert LOCATION_BASILAR_TRUNK == "Tronco basilar"
        assert LOCATION_AICA == "AICA"
        for loc in (LOCATION_BASILAR_TIP, LOCATION_BASILAR_TRUNK, LOCATION_AICA):
            assert loc in LOCATIONS

    def test_el_valor_antiguo_sigue_aceptado(self):
        # Sesiones guardadas (Case 3 entre ellas) lo llevan en clinical.site.
        assert LOCATION_BASILAR_LEGACY == "Basilar (punta, tronco o AICA)"
        assert LOCATION_BASILAR_LEGACY in LOCATIONS

    def test_el_modelo_acepta_los_cuatro(self):
        from models.treatment import ClinicalSiteRequest
        for loc in ("Punta basilar", "Tronco basilar", "AICA",
                    "Basilar (punta, tronco o AICA)"):
            assert ClinicalSiteRequest(site=loc).site == loc


class TestLaTarjetaDePerforantes:
    def test_tronco_da_pontinas_y_no_talamoperforantes(self):
        t = expected_perforators("Tronco basilar")
        assert t is not None
        assert "pontinas" in t.arteries
        assert "alamoperforantes" not in t.arteries
        assert "Protuberancia" in t.supplies
        assert t.sources == ["Marinković SV, Gibo H. The surgical anatomy of the "
                             "perforating branches of the basilar artery. "
                             "Neurosurgery 1993;33(1):80-87"]

    def test_punta_sigue_dando_talamoperforantes(self):
        t = expected_perforators("Punta basilar")
        assert t is not None and "Talamoperforantes" in t.arteries

    def test_aica_tiene_tarjeta_propia(self):
        t = expected_perforators("AICA")
        assert t is not None
        assert "laberíntica" in t.arteries
        assert "Hipoacusia" in t.consequence
        assert t.sources == ["Rhoton AL Jr. The cerebellar arteries. "
                             "Neurosurgery 2000;47(3 Suppl):S29-68"]

    def test_el_valor_antiguo_resuelve_y_pide_precisar(self):
        # No se traduce a «punta» en silencio: Case 3 es de tronco y nadie lo
        # ha vuelto a elegir. Se enseña la de la punta avisando de que falta.
        t = expected_perforators("Basilar (punta, tronco o AICA)")
        assert t is not None
        assert t.notice == "Localización sin precisar: elige punta o tronco para la tarjeta exacta"
        assert "notice" in territory_to_dict(t)

    def test_las_precisas_no_llevan_aviso(self):
        assert expected_perforators("Tronco basilar").notice == ""
        assert expected_perforators("Punta basilar").notice == ""


class TestLaPuntuacionPorLocalizacion:
    _MORFO = dict(neck_mm=6.0, aspect_ratio=1.4, dnr=1.8, max_diameter_mm=9.0,
                  bottleneck_factor=1.5, undulation_index=0.1)

    def _factor(self, loc):
        d = compute_decision(**self._MORFO, location=loc)
        return [f for f in d["factors"] if f["key"] == "location"] if "key" in d["factors"][0] \
            else [f for f in d["factors"] if "Localización" in f["name"]]

    def test_cada_basilar_nombra_su_sitio_y_vota_igual(self):
        textos = {}
        for loc, prefijo in (("Tronco basilar", "Tronco basilar:"),
                             ("Punta basilar", "Punta basilar:"),
                             ("AICA", "AICA:"),
                             ("Basilar (punta, tronco o AICA)", "Basilar:")):
            d = compute_decision(**self._MORFO, location=loc)
            fs = [f for f in d["factors"] if f["name"].startswith("Localización")]
            assert len(fs) == 1, (loc, d["factors"])
            assert fs[0]["detail"].startswith(prefijo), fs[0]
            textos[loc] = (fs[0]["direction"], fs[0]["points"])
        assert len(set(textos.values())) == 1, textos


class TestElPdfDeTronco:
    def _textos(self, location: str) -> list[str]:
        from services.report_generator import ReportData, ReportGenerator
        d = compute_decision(neck_mm=6.0, aspect_ratio=1.4, dnr=1.8,
                             max_diameter_mm=9.0, bottleneck_factor=1.5,
                             undulation_index=0.1, location=location)
        data = ReportData()
        data.treatment = {"perforators": d["perforators"]}
        return [f.text for f in ReportGenerator(data)._perforator_territory(standalone=True)
                if hasattr(f, "text")]

    def test_el_pdf_de_tronco_no_lista_talamoperforantes(self):
        textos = " ".join(self._textos("Tronco basilar"))
        assert "pontinas" in textos
        assert "alamoperforantes" not in textos

    def test_el_pdf_del_valor_antiguo_avisa(self):
        textos = " ".join(self._textos("Basilar (punta, tronco o AICA)"))
        assert "Localización sin precisar" in textos
