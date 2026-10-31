"""`scripts/ingest_zenodo.py`: el dataset Zenodo 15697196 entra por la API.

El dataset trae un directorio DICOM por estudio y, para los que tienen
aneurisma, uno o más STL con la lesión segmentada. El script crea un paciente
por estudio, sube el DICOM, segmenta, detecta y registra el centroide del STL
como lesión confirmada (o «sin lesión» en los controles), de modo que el
detector pase de 2 casos con verdad a decenas.

Aquí se prueba con un dataset sintético (STL de esferas, DICOM de mentira) y un
cliente HTTP falso que responde lo que respondería la API: lo que se comprueba
es la orquestación, no la segmentación.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import vtk
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from scripts import ingest_zenodo as iz

# ── Dataset sintético ──────────────────────────────────────────────────────── #

def _write_stl(path: Path, center: tuple[float, float, float], radius: float) -> None:
    s = vtk.vtkSphereSource()
    s.SetCenter(*center); s.SetRadius(radius)
    s.SetThetaResolution(24); s.SetPhiResolution(24); s.Update()
    w = vtk.vtkSTLWriter()
    w.SetFileName(str(path)); w.SetInputData(s.GetOutput()); w.Write()


@pytest.fixture
def dataset(tmp_path: Path) -> Path:
    root = tmp_path / "Dataset"
    for sid, n in [("001", 3), ("008", 2), ("010", 1)]:
        d = root / "Studies" / sid
        d.mkdir(parents=True)
        for i in range(n):
            (d / f"{i}.dcm").write_bytes(b"\0" * 128 + b"DICM" + bytes(16))
    (root / "Studies" / "003").mkdir()                      # vacío: no cuenta
    (root / "Studies" / "notas.txt").write_text("nada")     # no es un estudio
    ann = root / "Annotations"
    ann.mkdir()
    _write_stl(ann / "an_008_1.stl", (10.0, -20.0, 30.0), 2.0)   # el pequeño
    _write_stl(ann / "an_008_2.stl", (40.0, -50.0, 60.0), 5.0)   # el grande
    _write_stl(ann / "an_010.stl", (1.0, 2.0, 3.0), 3.0)
    return root


class TestLecturaDelDataset:
    def test_lista_solo_los_estudios_con_dicom(self, dataset):
        assert iz.study_ids(dataset) == ["001", "008", "010"]

    def test_los_dicom_de_un_estudio(self, dataset):
        files = iz.dicom_files(dataset, "001")
        assert [f.name for f in files] == ["0.dcm", "1.dcm", "2.dcm"]

    def test_un_estudio_sin_stl_es_un_control(self, dataset):
        assert iz.annotations_for(dataset, "001") == []

    def test_las_anotaciones_van_de_mayor_a_menor_y_el_centroide_es_el_de_la_esfera(self, dataset):
        anns = iz.annotations_for(dataset, "008")
        assert [a.file for a in anns] == ["an_008_2.stl", "an_008_1.stl"]
        grande = anns[0]
        assert grande.centroid == pytest.approx((40.0, -50.0, 60.0), abs=0.05)
        assert grande.diameter_mm == pytest.approx(10.0, abs=0.2)
        assert anns[1].diameter_mm == pytest.approx(4.0, abs=0.2)

    def test_el_stl_sin_sufijo_tambien_se_encuentra(self, dataset):
        assert [a.file for a in iz.annotations_for(dataset, "010")] == ["an_010.stl"]

    def test_un_stl_de_otro_estudio_con_el_mismo_prefijo_no_se_cuela(self, dataset):
        # an_010.stl no es de «01», ni an_008_1 de «00».
        assert iz.annotations_for(dataset, "01") == []


# ── Marco del volumen: el STL está en coordenadas de paciente, la malla no ──── #
#
# La malla de la sesión nace con origen (0,0,0): índice × espaciado. El STL del
# dataset trae coordenadas de paciente (las del DICOM). Para que la lesión caiga
# sobre la malla hay que restar el origen del volumen y deshacer la orientación.

IDENT = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)


def _slice(path, series_uid: str, ipp, iop=(1, 0, 0, 0, 1, 0)) -> None:
    import numpy as np
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = "1.2.3"
    ds.SeriesInstanceUID = series_uid
    ds.Modality = "CT"
    ds.ImagePositionPatient = list(ipp)
    ds.ImageOrientationPatient = list(iop)
    ds.PixelSpacing = [0.5, 0.5]
    ds.SliceThickness = 2.0
    ds.Rows = ds.Columns = 8
    ds.BitsAllocated = ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.PixelData = np.zeros((8, 8), dtype=np.uint16).tobytes()
    ds.save_as(str(path), enforce_file_format=True)


class TestMarcoDelVolumen:
    def test_el_origen_es_el_corte_mas_bajo_aunque_los_ficheros_vengan_desordenados(self, tmp_path):
        d = tmp_path / "Studies" / "077"
        d.mkdir(parents=True)
        uid = generate_uid()
        _slice(d / "0.dcm", uid, (-50.0, -60.0, 14.0))
        _slice(d / "1.dcm", uid, (-50.0, -60.0, 10.0))
        _slice(d / "2.dcm", uid, (-50.0, -60.0, 12.0))
        origin, direction = iz.volume_frame(tmp_path, "077")
        assert origin == pytest.approx((-50.0, -60.0, 10.0))
        assert direction == pytest.approx(IDENT)

    def test_paciente_a_malla_resta_el_origen(self):
        m = iz.patient_to_mesh((-27.0, -141.0, -714.0), (-108.5, -235.5, -938.0), IDENT)
        assert m == pytest.approx((81.5, 94.5, 224.0))

    def test_con_la_orientacion_girada_se_deshace_el_giro(self):
        # Filas por y, columnas por x: paciente = origen + D·malla, con D la permutación.
        d = (0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0)
        m = iz.patient_to_mesh((10.0 + 3.0, 20.0 + 2.0, 30.0 + 1.0), (10.0, 20.0, 30.0), d)
        assert m == pytest.approx((2.0, 3.0, 1.0))


# ── Puesto del candidato (misma regla que routers.ground_truth) ────────────── #

def _cand(n: int, pos, diam: float) -> dict:
    return {"id": f"cand-{n:03d}", "center_mm": {"x": pos[0], "y": pos[1], "z": pos[2]},
            "max_diameter_mm": diam}


class TestPuestoDelCandidato:
    def test_dentro_del_diametro_del_candidato_es_acierto(self):
        cands = [_cand(1, (0, 0, 0), 4.0), _cand(2, (100, 0, 0), 12.0)]
        assert iz.rank_for((108.0, 0.0, 0.0), cands) == 2

    def test_el_radio_nunca_baja_de_5_mm(self):
        cands = [_cand(1, (0, 0, 0), 2.0)]
        assert iz.rank_for((4.5, 0.0, 0.0), cands) == 1
        assert iz.rank_for((5.5, 0.0, 0.0), cands) is None

    def test_el_mas_cercano_gana(self):
        cands = [_cand(1, (0, 0, 0), 20.0), _cand(2, (6, 0, 0), 20.0)]
        assert iz.rank_for((5.0, 0.0, 0.0), cands) == 2

    def test_sin_candidatos_no_hay_puesto(self):
        assert iz.rank_for((0.0, 0.0, 0.0), []) is None


# ── Cliente falso: responde lo que respondería la API ──────────────────────── #

class FakeApi:
    """Registra cada llamada y contesta con respuestas enlatadas.

    `segment_409` es cuántas veces el resultado en segundo plano dice «sigue en
    curso» antes de estar; `segment_fail` hace fallar la segmentación.
    """

    def __init__(self, *, candidates=None, segment_409: int = 0, segment_fail: bool = False,
                 attach_409: bool = False, existing: dict[str, int] | None = None):
        self.existing = existing or {}        # historia clínica → id de paciente
        self.calls: list[tuple[str, str, dict | None]] = []
        self.candidates = candidates or []
        self._pending = segment_409
        self.segment_fail = segment_fail
        self.attach_409 = attach_409
        self.files_received = 0

    # El mismo contrato que httpx.Client / TestClient.
    def post(self, path, *, json=None, files=None, params=None, **_):
        self.calls.append(("POST", path, json))
        if path == "/api/auth/login":
            return httpx.Response(200, json={"access_token": "tok", "token_type": "bearer",
                                             "expires_in": 3600, "user": {}})
        if path == "/api/upload":
            self.files_received = len(files)
            return httpx.Response(200, json={
                "session_id": "ses-1", "total_files": len(files),
                "series": [{"session_id": "ses-1", "series_id": "1.2.3", "description": "CTA",
                            "modality": "CT", "slices": len(files),
                            "spacing": {"x": 0.4, "y": 0.4, "z": 0.5}, "window_center": 300,
                            "window_width": 700, "is_projection": False,
                            "projection_warning": None, "size_mb": 100.0}]})
        if path == "/api/sessions/ses-1/attach":
            if self.attach_409:
                return httpx.Response(409, json={"detail": "Ya existe un paciente con la historia clínica"})
            return httpx.Response(200, json={
                "patient": {"id": 7, "full_name": "ZENODO 008", "hospital_id": "x", "dob": "",
                            "sex": "", "n_studies": 1, "created_at": "2026-10-09T00:00:00"},
                "case_id": 8, "case_label": "Aneurisma", "imaging_study_id": 9,
                "relinked_confirmations": 0})
        if path == "/api/segment":
            assert params == {"background": "true"}
            return httpx.Response(202, json={"status": "accepted",
                                             "result_url": "/api/segment/result/ses-1"})
        if path == "/api/detect/ses-1":
            return httpx.Response(200, json={"found": bool(self.candidates),
                                             "candidates": self.candidates, "diagnostics": {}})
        if path == "/api/ground-truth":
            rank = None
            if json["source"] == "marked":
                p = json["position"]
                rank = iz.rank_for((p["x"], p["y"], p["z"]), self.candidates)
            return httpx.Response(201, json={
                "id": 1, "session_id": "ses-1", "imaging_study_id": json.get("imaging_study_id"),
                "source": json["source"], "position": json.get("position"),
                "candidate_rank": rank, "n_candidates": len(self.candidates), "channels": "",
                "modality": "CT", "reproducible": True, "created_at": "2026-10-09T00:00:00",
                "created_by": "admin"})
        if path == "/api/sessions/save":
            return httpx.Response(200, json={"file_path": "x", "download_url": "/data/sessions/ses-1",
                                             "saved_at": "2026-10-09T00:00:00"})
        raise AssertionError(f"POST inesperado: {path}")

    def delete(self, path, **_):
        self.calls.append(("DELETE", path, None))
        pid = int(path.rsplit("/", 1)[1])
        for hc, i in list(self.existing.items()):
            if i == pid:
                del self.existing[hc]
                return httpx.Response(204)
        return httpx.Response(404, json={"detail": "Patient not found"})

    def get(self, path, **_):
        self.calls.append(("GET", path, None))
        if path == "/api/patients":
            return httpx.Response(200, json=[
                {"id": i, "full_name": "ZENODO x", "hospital_id": hc, "dob": "", "sex": "",
                 "n_studies": 1, "created_at": "2026-10-09T00:00:00"}
                for hc, i in self.existing.items()])
        if path == "/api/thresholds/ses-1":
            return httpx.Response(200, json={"lower": 180.0, "upper": 900.0, "strategy": "ct_stats",
                                             "is_dsa": False, "hint": "", "voxel_fraction": None})
        if path == "/api/segment/result/ses-1":
            if self._pending > 0:
                self._pending -= 1
                return httpx.Response(409, json={"detail": "La segmentación sigue en curso."})
            if self.segment_fail:
                return httpx.Response(422, json={"detail": "El volumen no cabe en memoria"})
            return httpx.Response(200, json={
                "mesh_url": "/data/sessions/ses-1/meshes/vessel_tree.vtp", "strategy": "ct_stats",
                "vertices": 12000, "faces": 24000, "method": "tubular", "fallback_note": "",
                "downsample_factor": 2, "phase_seconds": {"total": 41.0}})
        if path == "/api/progress/ses-1":
            return httpx.Response(200, json={"phase": "", "pct": 100, "running": False, "ok": True,
                                             "message": "", "job": "segment"})
        raise AssertionError(f"GET inesperado: {path}")

    def paths(self, method: str | None = None) -> list[str]:
        return [p for m, p, _ in self.calls if method is None or m == method]

    def body(self, path: str) -> dict:
        return next(j for m, p, j in self.calls if p == path and m == "POST")


class TestIngestaPorLaApi:
    def _ingestor(self, api, dataset, **kw):
        kw.setdefault("frame_of", lambda *_: ((0.0, 0.0, 0.0), IDENT))
        return iz.Ingestor(api, dataset, poll_s=0.0, log=lambda *_: None, **kw)

    def test_la_lesion_se_confirma_en_coordenadas_de_malla_no_de_paciente(self, dataset):
        # El volumen empieza en (-100, -200, -300): el STL en (40, -50, 60) cae en
        # la malla en (140, 150, 360), y es ahí donde está el candidato.
        api = FakeApi(candidates=[_cand(1, (141, 150, 360), 8.0)])
        ing = self._ingestor(api, dataset, frame_of=lambda *_: ((-100.0, -200.0, -300.0), IDENT))
        rec = ing.ingest("008")
        gt = api.body("/api/ground-truth")
        assert (gt["position"]["x"], gt["position"]["y"], gt["position"]["z"]) == pytest.approx((140.0, 150.0, 360.0), abs=0.05)
        assert rec["gt_rank"] == 1
        assert rec["frame"]["origin_mm"] == [-100.0, -200.0, -300.0]
        # La segunda lesión también se compara en coordenadas de malla.
        assert rec["extra_ranks"] == [None]

    def test_un_caso_con_aneurisma_sube_adjunta_segmenta_detecta_y_confirma(self, dataset):
        # El candidato 2 está a 3 mm del STL grande; el 1 está lejos.
        api = FakeApi(candidates=[_cand(1, (0, 0, 0), 6.0), _cand(2, (43, -50, 60), 8.0)])
        rec = self._ingestor(api, dataset).ingest("008")

        assert api.paths("POST")[:2] == ["/api/upload", "/api/sessions/ses-1/attach"]
        assert api.files_received == 2
        attach = api.body("/api/sessions/ses-1/attach")
        assert attach["new_patient"]["hospital_id"] == "ZENODO-15697196-008"
        assert attach["new_patient"]["surname"] == "ZENODO"
        assert attach["new_patient"]["given_name"] == "008"
        assert "aneurisma" in attach["new_case"]["dx_principal"].lower()
        assert attach["patient_id"] is None and attach["case_id"] is None

        seg = api.body("/api/segment")
        assert seg["session_id"] == "ses-1" and seg["series_id"] == "1.2.3"
        assert seg["lower"] == 180.0 and seg["upper"] == 900.0
        assert seg["method"] == "tubular"

        gt = api.body("/api/ground-truth")
        assert gt["source"] == "marked" and gt["imaging_study_id"] == 9
        assert gt["position"]["x"] == pytest.approx(40.0, abs=0.05)

        save = api.body("/api/sessions/save")
        assert save["patient_id"] == 7 and save["study_id"] == 8 and save["imaging_study_id"] == 9
        assert save["current_step"] == iz.STEP_DETECT

        assert rec["status"] == "ok"
        assert rec["study"] == "008"
        assert rec["session_id"] == "ses-1"
        assert rec["patient_id"] == 7 and rec["imaging_study_id"] == 9
        assert rec["n_annotations"] == 2
        assert rec["gt_rank"] == 2 and rec["n_candidates"] == 2
        # La segunda lesión (la pequeña, en (10,-20,30)) no la vio nadie.
        assert rec["extra_ranks"] == [None]
        assert rec["segment"]["vertices"] == 12000
        assert rec["segment"]["downsample_factor"] == 2

    def test_un_control_confirma_que_no_hay_lesion(self, dataset):
        api = FakeApi(candidates=[_cand(1, (0, 0, 0), 6.0)])
        rec = self._ingestor(api, dataset).ingest("001")
        attach = api.body("/api/sessions/ses-1/attach")
        assert "control" in attach["new_case"]["dx_principal"].lower()
        gt = api.body("/api/ground-truth")
        assert gt["source"] == "no_lesion" and "position" not in gt
        assert rec["status"] == "ok" and rec["n_annotations"] == 0
        assert rec["gt_rank"] is None and rec["n_candidates"] == 1

    def test_la_segmentacion_en_segundo_plano_se_espera_hasta_que_termina(self, dataset):
        api = FakeApi(segment_409=3)
        rec = self._ingestor(api, dataset).ingest("010")
        assert api.paths("GET").count("/api/segment/result/ses-1") == 4
        assert rec["status"] == "ok"

    def test_si_la_segmentacion_falla_queda_el_error_y_no_se_confirma_nada(self, dataset):
        api = FakeApi(segment_fail=True)
        rec = self._ingestor(api, dataset).ingest("010")
        assert rec["status"] == "error"
        assert "memoria" in rec["error"]
        assert "/api/detect/ses-1" not in api.paths()
        assert "/api/ground-truth" not in api.paths()
        # El paciente y el estudio sí existen: se adjuntó antes de segmentar.
        assert rec["imaging_study_id"] == 9

    def test_un_paciente_a_medias_de_una_tanda_anterior_se_borra_y_se_rehace(self, dataset):
        # La tanda murió con el paciente creado y sin confirmación: al repetir,
        # el script lo quita (es suyo: historia ZENODO-…) y lo hace entero.
        api = FakeApi(existing={"ZENODO-15697196-010": 55, "ZENODO-15697196-008": 56})
        rec = self._ingestor(api, dataset).ingest("010")
        assert api.calls[0] == ("GET", "/api/patients", None)
        assert ("DELETE", "/api/patients/55", None) in api.calls
        assert ("DELETE", "/api/patients/56", None) not in api.calls
        assert api.calls.index(("DELETE", "/api/patients/55", None)) < api.paths().index("/api/upload")
        assert rec["status"] == "ok" and rec["replaced_patient_id"] == 55

    def test_si_aun_asi_la_historia_esta_duplicada_el_estudio_queda_en_error(self, dataset):
        api = FakeApi(attach_409=True)
        rec = self._ingestor(api, dataset).ingest("010")
        assert rec["status"] == "error" and "historia" in rec["error"]
        assert "/api/segment" not in api.paths()

    def test_el_metodo_y_la_resolucion_se_pueden_elegir(self, dataset):
        api = FakeApi()
        self._ingestor(api, dataset, method="threshold", half_resolution=True).ingest("010")
        seg = api.body("/api/segment")
        assert seg["method"] == "threshold" and seg["half_resolution"] is True


# ── Informe acumulado y reanudación ────────────────────────────────────────── #

class TestInforme:
    def test_el_informe_se_actualiza_por_estudio_y_los_hechos_se_saltan(self, dataset, tmp_path):
        out = tmp_path / "ingesta.json"
        api = FakeApi(candidates=[_cand(1, (1, 2, 3), 6.0)])
        ing = iz.Ingestor(api, dataset, poll_s=0.0, log=lambda *_: None,
                          frame_of=lambda *_: ((0.0, 0.0, 0.0), IDENT))
        done = iz.run(ing, ["010"], out)
        assert done["010"]["status"] == "ok"
        assert json.loads(out.read_text())["010"]["gt_rank"] == 1

        n_antes = len(api.calls)
        iz.run(ing, ["010"], out)            # ya hecho: ni una llamada más
        assert len(api.calls) == n_antes

        iz.run(ing, ["010"], out, redo=True)  # salvo que se pida repetir
        assert len(api.calls) > n_antes

    def test_el_resumen_cuenta_aciertos_y_falsos_positivos(self):
        recs = {
            "002": {"status": "ok", "n_annotations": 1, "gt_rank": 1, "n_candidates": 4},
            "004": {"status": "ok", "n_annotations": 1, "gt_rank": 3, "n_candidates": 5},
            "006": {"status": "ok", "n_annotations": 2, "gt_rank": None, "n_candidates": 2},
            "001": {"status": "ok", "n_annotations": 0, "gt_rank": None, "n_candidates": 3},
            "003": {"status": "ok", "n_annotations": 0, "gt_rank": None, "n_candidates": 0},
            "005": {"status": "error", "error": "x"},
        }
        s = iz.summarize(recs)
        assert s == {"confirmed": 3, "first": 1, "top3": 2, "top5": 2, "missed": 1,
                     "controls": 2, "controls_clean": 1, "false_positives_mean": 1.5,
                     "errors": 1}
