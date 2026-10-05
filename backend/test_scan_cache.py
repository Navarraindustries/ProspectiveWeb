"""El escaneo de series no se repite sobre una carpeta que no ha cambiado."""
from __future__ import annotations

from services import dicom_loader
from services.sessions import create_session, session_subdir
from test_volume_chunks import _write_classic_ct_series


def test_la_misma_carpeta_no_se_relee_y_una_que_cambia_si(monkeypatch):
    sid = create_session()
    _write_classic_ct_series(sid, nz=6, size=16)
    d = session_subdir(sid, "dicom")
    veces = {"n": 0}
    real = dicom_loader._scan_series

    def contado(carpeta):
        veces["n"] += 1
        return real(carpeta)

    monkeypatch.setattr(dicom_loader, "_scan_series", contado)
    dicom_loader._SCAN_CACHE.clear()

    primero = dicom_loader.scan_series(d)
    segundo = dicom_loader.scan_series(d)
    assert veces["n"] == 1 and primero == segundo and len(primero) == 1
    segundo[0]["marca"] = "tocado por quien lo recibió"
    assert "marca" not in dicom_loader.scan_series(d)[0]

    (d / "otro_fichero").write_bytes(b"no es dicom")
    dicom_loader.scan_series(d)
    assert veces["n"] == 2
