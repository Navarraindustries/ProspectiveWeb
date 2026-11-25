"""P8: el detector lee una máscara de cerebro externa (Kim 2025), probado con máscaras sintéticas.

La máscara es una bola de «cerebro» escrita como NIfTI con una geometría que
no es la identidad (origen desplazado, ejes volteados, espaciado anisótropo),
como la escribiría TotalSegmentator; los candidatos están en el marco de la
malla de un DICOM con OTRA geometría. Si los marcos se cruzan mal, las
distancias salen mal.
"""
from __future__ import annotations

import json
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_p8_")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

import numpy as np
import pytest
import SimpleITK as sitk

from scripts.ingest_zenodo import patient_to_mesh
from services.aneurysm_consensus import ConsensusHit
from services.brain_mask import (
    CerebroSesion,
    FiltroCerebro,
    MascaraCerebro,
    drop_outside_brain,
    malla_a_paciente,
)

# El DICOM de la «sesión»: cabeza girada 90° alrededor de z y origen lejos.
DCM_ORIGIN = (-200.0, 150.0, -300.0)
DCM_DIR = (0.0, -1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0)
# El cerebro: bola de 40 mm de radio centrada en este punto de paciente.
CENTRO = np.array([-100.0, 60.0, -250.0])
RADIO = 40.0


def _malla(p_paciente):
    return patient_to_mesh(tuple(float(v) for v in p_paciente), DCM_ORIGIN, DCM_DIR)


def _escribir_mascara(ruta, orientacion: str | None = None, etiqueta: int = 1):
    """Bola de cerebro en una rejilla con ejes y espaciado propios (≠ los del DICOM)."""
    sp = (1.0, 0.8, 1.5)
    shape_xyz = (110, 130, 70)
    img = sitk.Image(shape_xyz, sitk.sitkUInt8)
    img.SetSpacing(sp)
    # Ejes x e y volteados (como un NIfTI en RAS leído en LPS) y origen en la esquina.
    img.SetDirection((-1.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 1.0))
    img.SetOrigin((-100.0 + 55 * sp[0], 60.0 + 65 * sp[1], -250.0 - 35 * sp[2]))
    arr = np.zeros(shape_xyz[::-1], dtype=np.uint8)
    zz, yy, xx = np.meshgrid(*(np.arange(n) for n in shape_xyz[::-1]), indexing="ij")
    idx = np.stack([xx.ravel(), yy.ravel(), zz.ravel()], axis=1).astype(float)
    d = np.asarray(img.GetDirection()).reshape(3, 3)
    pts = np.asarray(img.GetOrigin()) + idx @ (d @ np.diag(sp)).T
    dentro = np.linalg.norm(pts - CENTRO, axis=1) <= RADIO
    arr.ravel()[dentro] = etiqueta
    out = sitk.GetImageFromArray(arr)
    out.CopyInformation(img)
    if orientacion:
        out = sitk.DICOMOrient(out, orientacion)
    sitk.WriteImage(out, str(ruta))
    return ruta


@pytest.fixture(scope="module")
def mascara(tmp_path_factory):
    return MascaraCerebro.desde_fichero(_escribir_mascara(tmp_path_factory.mktemp("m") / "brain.nii.gz"))


class TestMarcos:
    def test_malla_a_paciente_deshace_patient_to_mesh(self):
        p = np.array([[-90.0, 70.0, -240.0], [10.0, -5.0, 3.0]])
        m = np.array([_malla(x) for x in p])
        assert np.allclose(malla_a_paciente(m, DCM_ORIGIN, DCM_DIR), p, atol=1e-9)

    def test_distancias_en_mm(self, mascara):
        dentro = CENTRO + [0.0, 0.0, 10.0]
        a_15 = CENTRO + [RADIO + 15.0, 0.0, 0.0]
        a_30 = CENTRO + [0.0, -(RADIO + 30.0), 0.0]
        d = mascara.distancia_mm(np.array([dentro, a_15, a_30]))
        assert d[0] == 0.0
        # Hasta el centro del vóxel de borde: ±1 vóxel (el más grueso, 1,5 mm).
        assert abs(d[1] - 15.0) < 1.6 and abs(d[2] - 30.0) < 1.6

    def test_desde_el_marco_de_la_malla(self, mascara):
        pts = np.array([_malla(CENTRO), _malla(CENTRO + [0.0, 0.0, RADIO + 20.0])])
        d = mascara.distancia_malla_mm(pts, DCM_ORIGIN, DCM_DIR)
        assert d[0] == 0.0 and abs(d[1] - 20.0) < 1.6
        # Con la dirección equivocada (identidad) el centro ya no cae dentro.
        mal = mascara.distancia_malla_mm(pts[:1], DCM_ORIGIN, None)
        assert mal[0] > 50.0

    @pytest.mark.parametrize("orientacion", ["RAS", "LPS", "PIR"])
    def test_la_orientacion_del_fichero_no_importa(self, tmp_path, mascara, orientacion):
        otra = MascaraCerebro.desde_fichero(_escribir_mascara(tmp_path / "b.nii.gz", orientacion))
        pts = CENTRO + np.array([[0, 0, 0], [RADIO + 12.0, 0, 0], [0, 0, -(RADIO + 25.0)], [20, 20, 0]])
        assert np.allclose(otra.distancia_mm(pts), mascara.distancia_mm(pts), atol=1e-6)

    def test_mascara_de_varias_clases(self, tmp_path):
        ruta = _escribir_mascara(tmp_path / "ml.nii.gz", etiqueta=90)
        assert MascaraCerebro.desde_fichero(ruta, etiqueta=90).distancia_mm(CENTRO[None, :])[0] == 0.0
        assert MascaraCerebro.desde_fichero(ruta, etiqueta=1).vacia


class TestFiltro:
    def _hits(self):
        return [ConsensusHit(position=_malla(CENTRO + [0, 0, RADIO + 30.0]), ranks={"curvatura": 1}),
                ConsensusHit(position=_malla(CENTRO + [RADIO + 6.0, 0, 0]), ranks={"curvatura": 2}),
                ConsensusHit(position=_malla(CENTRO), ranks={"calibre": 1})]

    def test_quita_los_lejanos_y_respeta_el_orden(self, mascara):
        hits = self._hits()
        kept, info = drop_outside_brain(hits, mascara, DCM_ORIGIN, DCM_DIR, margen_mm=10.0)
        assert kept == [hits[1], hits[2]]
        assert info.applied and info.checked == 3 and info.dropped == 1
        assert abs(info.dropped_mm[0] - 30.0) < 1.6
        kept0, _ = drop_outside_brain(hits, mascara, DCM_ORIGIN, DCM_DIR, margen_mm=0.0)
        assert kept0 == [hits[2]]

    def test_mascara_vacia_no_quita_nada(self):
        vacia = MascaraCerebro(np.zeros((5, 5, 5), bool), (0, 0, 0), (1, 1, 1), None)
        hits = self._hits()
        kept, info = drop_outside_brain(hits, vacia, DCM_ORIGIN, DCM_DIR)
        assert kept == hits and not info.applied and info.reason == "máscara vacía"


class TestLaDeteccionLaUsa:
    def test_quita_y_rellena_pidiendo_mas_sitios(self, monkeypatch, mascara):
        import routers.detect as rd
        import services.aneurysm_consensus as ac
        from test_hu_floor import _tubo

        hits = [ConsensusHit(position=_malla(CENTRO + [0, 0, RADIO + 30.0]), ranks={"curvatura": 1}),
                ConsensusHit(position=_malla(CENTRO + [0, 0, RADIO + 40.0]), ranks={"curvatura": 2}),
                ConsensusHit(position=_malla(CENTRO + [5.0, 0, 0]), ranks={"curvatura": 3}),
                ConsensusHit(position=_malla(CENTRO + [0, 5.0, 0]), ranks={"calibre": 1})]
        pedidos = []

        def consenso(poly, det, top=5, **kw):
            pedidos.append(top)
            return hits[:top]

        monkeypatch.setattr(ac, "consensus", consenso)
        monkeypatch.setattr(rd, "_session_brain", lambda sid: (
            CerebroSesion(mascara, DCM_ORIGIN, DCM_DIR, 10.0), FiltroCerebro(applied=False)))
        out, det = rd._detect_hits(_tubo(), "XA", top=2)
        assert out == [hits[2], hits[3]], "los dos lejanos salen y los siguientes suben"
        assert pedidos and all(p == 8 for p in pedidos), "con máscara se piden 4 × top"
        assert det.brain_mask["applied"] and det.brain_mask["dropped"] == 2

    def test_sin_mascara_no_cambia_nada(self, monkeypatch):
        import routers.detect as rd
        import services.aneurysm_consensus as ac
        from test_hu_floor import _tubo

        hits = [ConsensusHit(position=(1.0, 1.0, float(i)), ranks={"curvatura": i + 1}) for i in range(4)]
        pedidos = []
        monkeypatch.setattr(ac, "consensus", lambda poly, det, top=5, **kw: pedidos.append(top) or hits[:top])
        out, det = rd._detect_hits(_tubo(), "XA", top=2)
        assert out == hits[:2] and all(p == 4 for p in pedidos)
        assert det.brain_mask == {"applied": False, "margin_mm": None, "checked": 0, "dropped": 0,
                                  "dropped_mm": None, "source": "", "reason": "sin sesión"}


class TestDeSesion:
    def _preparar(self, monkeypatch, tmp_path, meta, con_mascara=True):
        import services.mpr as mpr
        import services.sessions as ss
        monkeypatch.setattr(ss, "session_dir", lambda sid: tmp_path)
        monkeypatch.setattr(mpr, "ensure_volume_cached", lambda sid: meta)
        if con_mascara:
            _escribir_mascara(tmp_path / "brain_mask.nii.gz")

    def test_sin_fichero(self, monkeypatch, tmp_path):
        from services.brain_mask import de_sesion
        self._preparar(monkeypatch, tmp_path, {}, con_mascara=False)
        cer, info = de_sesion("s")
        assert cer is None and info.reason == "sin máscara"

    def test_orientacion_desconocida_no_se_aplica(self, monkeypatch, tmp_path):
        from services.brain_mask import de_sesion
        self._preparar(monkeypatch, tmp_path, {"orientation_known": False, "direction": None,
                                               "origin_mm": list(DCM_ORIGIN)})
        cer, info = de_sesion("s")
        assert cer is None and info.reason == "orientación desconocida"

    def test_con_fichero_y_orientacion(self, monkeypatch, tmp_path):
        from services.brain_mask import de_sesion
        self._preparar(monkeypatch, tmp_path, {"orientation_known": True, "direction": list(DCM_DIR),
                                               "origin_mm": list(DCM_ORIGIN)})
        cer, _ = de_sesion("s")
        assert cer is not None and cer.origin == DCM_ORIGIN and cer.direction == DCM_DIR
        assert cer.mascara.distancia_malla_mm(np.array([_malla(CENTRO)]), cer.origin, cer.direction)[0] == 0.0


class TestScriptO3:
    def test_froc_por_margen_y_lesiones_perdidas(self, tmp_path, mascara):
        from scripts.cerebro_zenodo import main

        cerca_lesion = CENTRO + [RADIO + 4.0, 0, 0]          # lesión en la «cisterna», a 4 mm
        rec = {"status": "ok", "meta": {"has_ia": True},
               "frame": {"origin_mm": list(DCM_ORIGIN), "direction": list(DCM_DIR)},
               "lesions": [{"position": list(_malla(cerca_lesion)), "diameter_mm": 4.0}],
               "long_list": [
                   {"rank": 1, "position": list(_malla(CENTRO + [0, 0, RADIO + 50.0])), "diameter_mm": 5.0},
                   {"rank": 2, "position": list(_malla(CENTRO + [0, RADIO + 25.0, 0])), "diameter_mm": 5.0},
                   {"rank": 3, "position": list(_malla(cerca_lesion)), "diameter_mm": 4.0},
                   {"rank": 4, "position": list(_malla(CENTRO)), "diameter_mm": 4.0}]}
        ctl = {**rec, "meta": {"has_ia": False}, "lesions": []}
        runs = tmp_path / "run"
        runs.mkdir()
        (runs / "001.json").write_text(json.dumps(rec))
        (runs / "002.json").write_text(json.dumps(ctl))
        (runs / "003.json").write_text(json.dumps(ctl))      # sin máscara: no cuenta
        masc = tmp_path / "mascaras"
        for sid in ("001", "002"):
            (masc / sid).mkdir(parents=True)
            _escribir_mascara(masc / sid / "brain.nii.gz")
        out = tmp_path / "res.json"
        assert main(["--runs", str(runs), "--mascaras", str(masc), "--margenes", "0", "10", "30",
                     "--json", str(out)]) == 0
        res = json.loads(out.read_text(encoding="utf-8"))
        assert res["estudios"] == 2 and res["sin_mascara"] == ["003"]
        les = res["lesiones_distancia_mm"]
        assert les["n"] == 1 and les["dentro"] == 0 and abs(les["percentiles"]["50"] - 4.0) < 1.6
        r = res["reglas"]["estricta"]
        # Sin filtro, entre 1: un FP por estudio y la lesión no está.
        assert r["sin filtro"]["1"]["lesiones"] == 0 and r["sin filtro"]["1"]["fp_por_estudio"] == 1.0
        # Margen 10: salen los dos lejanos; la lesión sube al 1.º y los FP bajan.
        assert r["10"]["1"]["lesiones"] == 1 and r["10"]["1"]["fp_por_estudio"] == 0.5
        assert r["10"]["quitados_por_estudio"] == 2.0
        # Margen 0: la lesión (a 4 mm) se pierde también entre los 10.
        assert r["0"]["10"]["lesiones"] == 0 and r["0"]["10"]["perdidas"] == ["001#1"]
        # Margen 30: solo sale el de 50 mm.
        assert r["30"]["quitados_por_estudio"] == 1.0
