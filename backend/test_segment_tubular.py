# backend/test_segment_tubular.py
"""El método tubular por la API: fases, guardas y resultado."""
from __future__ import annotations

import time
import threading

import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app
from services import progress
from services.segmentation import read_vtp, surface_quality
from services.sessions import create_session, session_subdir
from test_volume_chunks import _write_classic_ct_series

client = TestClient(app, raise_server_exceptions=True)

# Las fases que publica el método tubular, en su orden (contrato con la interfaz).
FASES = ["carga", "núcleo", "tubularidad", "semillas", "crecimiento", "recuperación",
         "laminaridad", "cierre", "superficie", "suavizado", "decimación", "normales",
         "islas", "guardado"]


def _tube_series(sid: str, nz=80, size=48, radius_mm=3.0, core=0.0, margin=4):
    """Un tubo brillante a lo largo de z en una serie clásica de `nz` cortes.

    Por qué 80 cortes y `margin` cortes vacíos en cada extremo:
    · un tubo que sale por el borde del volumen deja la malla abierta ahí, por
      diseño (Task 4: cerrarlo uniría lo que no está unido; Case 3 da 65
      aristas de borde por eso), así que para pedir una malla estanca el tubo
      tiene que acabar dentro;
    · en un tubo sintético perfecto, V ≥ p90 no es un eje sino cuatro líneas
      paralelas sin contacto de cara, y cada una tiene el largo del tubo: con
      40 cortes (32 mm útiles) ninguna llega a la semilla de 50 mm³; con 80
      (≈ 64 mm) las cuatro siembran.
    """
    z, y, x = np.mgrid[0:nz, 0:size, 0:size].astype(np.float32)
    d2 = (y - size / 2) ** 2 + (x - size / 2) ** 2         # spacing 1 mm (pixel_spacing=1.0)
    vol = np.where(d2 <= radius_mm ** 2, 800.0, 0.0)
    if core:
        vol = np.where(d2 <= (radius_mm / 3) ** 2, core, vol)
    if margin:
        vol[:margin] = 0.0
        vol[-margin:] = 0.0
    _write_classic_ct_series(sid, nz=nz, size=size, values=vol.astype(np.int16),
                             pixel_spacing=1.0)


def _segment(sid: str, **over):
    body = {"session_id": sid, "series_id": "", "lower": 300.0, "upper": 0.0,
            "smoothing": 3, "cleanup": 0, "main_tree_only": False, "method": "tubular"}
    body.update(over)
    return client.post("/api/segment", json=body)


class TestTubular:
    def test_devuelve_una_malla_estanca_y_sus_cifras(self):
        sid = create_session(); _tube_series(sid)
        r = _segment(sid)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["method"] == "tubular"
        assert j["boundary_edges"] == 0 and j["components"] == 1
        assert j["seeds"] >= 1 and j["fallback_note"] == ""
        assert set(j["phase_seconds"]) >= {"tubularidad", "superficie", "guardado"}
        poly = read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp")
        assert surface_quality(poly)["boundary_edges"] == 0

    def test_el_techo_ya_no_vacia_el_vaso(self):
        sid = create_session(); _tube_series(sid, core=3000.0)
        j = _segment(sid, upper=2000.0).json()
        assert j["components"] == 1 and j["boundary_edges"] == 0
        # Con el método antiguo el mismo techo dejaba una cáscara doble.
        j2 = _segment(sid, upper=2000.0, method="threshold").json()
        assert j2["method"] == "threshold"

    def test_sin_semillas_lo_dice_y_no_falla(self):
        # 40 cortes: las líneas de V ≥ p90 no llegan a 50 mm³ (ver _tube_series).
        sid = create_session(); _tube_series(sid, nz=40, radius_mm=1.6)
        r = _segment(sid)
        assert r.status_code == 200, r.text
        assert "semilla" in r.json()["fallback_note"].lower()

    def test_el_progreso_avanza_por_fases_durante_la_segmentacion(self):
        sid = create_session(); _tube_series(sid, nz=64, size=64)
        seen: list[str] = []
        stop = threading.Event()
        def watch():
            while not stop.is_set():
                p = progress.get(sid)
                if p and p["phase"] and (not seen or seen[-1] != p["phase"]):
                    seen.append(p["phase"])
                time.sleep(0.005)
        t = threading.Thread(target=watch); t.start()
        try:
            assert _segment(sid).status_code == 200
        finally:
            stop.set(); t.join()
        # Desde otro hilo sólo se ven con seguridad las fases largas: en 64³
        # «superficie» dura milisegundos y un sondeo la salta (medido: 3 de 5
        # ejecuciones). Que se publiquen TODAS, en orden, lo comprueba
        # test_las_fases_publicadas_son_las_del_contrato_y_en_orden.
        assert any(s.startswith("tubularidad") for s in seen), seen
        bases = [s.split(" ")[0] for s in seen]
        assert [FASES.index(b) for b in bases] == sorted(FASES.index(b) for b in bases), seen
        assert progress.get(sid)["running"] is False and progress.get(sid)["ok"] is True

    def test_media_resolucion_se_fuerza_por_encima_del_tope(self, monkeypatch):
        from routers import segment as seg
        monkeypatch.setattr(seg, "_TUBULAR_MAX_VOXELS", 1000)
        sid = create_session(); _tube_series(sid, nz=40, size=48)      # 92 160 vóxeles
        j = _segment(sid).json()
        assert j["downsample_factor"] == 2
        assert "media resolución" in j["fallback_note"].lower()

    def test_full_resolution_sigue_aceptandose_con_el_significado_inverso(self):
        sid = create_session(); _tube_series(sid)
        j = _segment(sid, full_resolution=False).json()
        assert j["downsample_factor"] == 2


#: Case 3 a resolución nativa (384³): a 40 B/vóxel pide ≈ 2,1 GB.
_CASE3_VOXELES = 384 ** 3
_GB = 1024 ** 3


class TestPresupuestoDeMemoriaAutodetectado:
    """Task 11 bis: sin la variable de entorno, el 70 % de la RAM disponible."""

    def test_la_variable_de_entorno_manda(self, monkeypatch):
        from routers import segment as seg
        monkeypatch.setenv("PROSPECTIVE_MEM_BUDGET_MB", "1234")
        monkeypatch.setattr(seg, "_available_memory_bytes", lambda: 8 * _GB)
        assert seg._memory_budget_bytes() == 1234 * 1024 ** 2

    def test_con_8_gb_disponibles_case3_va_a_resolucion_nativa(self, monkeypatch):
        from routers import segment as seg
        monkeypatch.delenv("PROSPECTIVE_MEM_BUDGET_MB", raising=False)
        monkeypatch.setattr(seg, "_available_memory_bytes", lambda: 8 * _GB)
        assert seg._memory_budget_bytes() == int(0.7 * 8 * _GB)
        assert seg._tubular_guard(_CASE3_VOXELES) == ""

    def test_con_1_5_gb_disponibles_case3_se_fuerza_a_media_resolucion(self, monkeypatch):
        # Lo que da un Lightsail de 2 GB: el 70 % son ≈ 1,05 GB y no caben 2,1.
        from routers import segment as seg
        monkeypatch.delenv("PROSPECTIVE_MEM_BUDGET_MB", raising=False)
        monkeypatch.setattr(seg, "_available_memory_bytes", lambda: int(1.5 * _GB))
        nota = seg._tubular_guard(_CASE3_VOXELES)
        assert "media resolución" in nota and "memoria" in nota

    def test_si_la_deteccion_falla_quedan_1400_mb(self, monkeypatch):
        from routers import segment as seg
        monkeypatch.delenv("PROSPECTIVE_MEM_BUDGET_MB", raising=False)
        monkeypatch.setattr(seg, "_available_memory_bytes", lambda: None)
        assert seg._memory_budget_bytes() == 1400 * 1024 ** 2

    def test_en_este_equipo_la_deteccion_da_una_cifra(self):
        # Linux lee /proc/meminfo y Windows GlobalMemoryStatusEx; en los dos
        # tiene que salir un número positivo, no el respaldo.
        import sys
        from routers import segment as seg
        if not (sys.platform.startswith("linux") or sys.platform == "win32"):
            pytest.skip("solo Linux y Windows")
        n = seg._available_memory_bytes()
        assert n is not None and n > 0


class TestGuardasYContrato:
    def test_media_resolucion_se_fuerza_si_no_cabe_en_el_presupuesto_de_memoria(self, monkeypatch):
        # 92 160 vóxeles × 40 B ≈ 3,5 MB: con 1 MB de presupuesto no cabe,
        # aunque esté muy por debajo del tope de vóxeles.
        monkeypatch.setenv("PROSPECTIVE_MEM_BUDGET_MB", "1")
        sid = create_session(); _tube_series(sid, nz=40, size=48)
        j = _segment(sid).json()
        assert j["downsample_factor"] == 2
        note = j["fallback_note"].lower()
        assert "media resolución" in note and "memoria" in note

    def test_con_presupuesto_holgado_se_segmenta_a_resolucion_nativa(self, monkeypatch):
        monkeypatch.setenv("PROSPECTIVE_MEM_BUDGET_MB", "4000")
        sid = create_session(); _tube_series(sid)
        j = _segment(sid).json()
        assert j["downsample_factor"] == 1 and j["fallback_note"] == ""

    def test_las_fases_publicadas_son_las_del_contrato_y_en_orden(self, monkeypatch):
        seen: list[str] = []
        real = progress.update
        def spy(sid_, phase, pct):
            seen.append(phase)
            real(sid_, phase, pct)
        monkeypatch.setattr(progress, "update", spy)
        sid = create_session(); _tube_series(sid)
        assert _segment(sid).status_code == 200
        bases = [p.split(" ")[0] for p in seen]
        # Con el tubo por defecto se recorren todas: una fase que desaparezca
        # en silencio también es una ruptura del contrato.
        assert set(bases) == set(FASES), set(FASES) ^ set(bases)
        idx = [FASES.index(b) for b in bases]
        assert idx == sorted(idx), bases
        assert bases[0] == "carga" and bases[-1] == "guardado"
        # La tubularidad se anuncia ANTES de calcularse (0/n), no solo al acabar.
        assert any(p.startswith("tubularidad 0/") for p in seen)

    def test_un_error_cierra_el_progreso_con_el_mensaje(self):
        # Umbral por encima de todo el volumen: no hay superficie → 422, y el
        # WebSocket tiene que enterarse de que el trabajo terminó mal.
        sid = create_session(); _tube_series(sid)
        r = _segment(sid, lower=5000.0)
        assert r.status_code == 422, r.text
        p = progress.get(sid)
        assert p["running"] is False and p["ok"] is False and p["message"]

    def test_el_metodo_clasico_no_publica_campos_tubulares(self):
        sid = create_session(); _tube_series(sid)
        j = _segment(sid, method="threshold").json()
        assert j["method"] == "threshold" and j["seeds"] == 0 and j["fallback_note"] == ""
        assert "marching cubes" in j["phase_seconds"]
        assert progress.get(sid)["ok"] is True


def _two_tubes_series(sid: str, nz=80, size=48):
    """Dos tubos paralelos separados: el mayor es el árbol, el otro una pieza suelta.

    El segundo es más corto pero siembra por sí mismo (≥ 58 cortes, ver
    _tube_series), así que la máscara tubular conserva los dos y la malla sale
    con dos piezas antes del filtro de árbol principal.
    """
    z, y, x = np.mgrid[0:nz, 0:size, 0:size].astype(np.float32)
    a = (y - 16) ** 2 + (x - 16) ** 2 <= 3.0 ** 2
    b = ((y - 34) ** 2 + (x - 34) ** 2 <= 3.0 ** 2) & (z >= 10) & (z < 72)
    vol = np.where(a | b, 800.0, 0.0)
    vol[:4] = 0.0
    vol[-4:] = 0.0
    _write_classic_ct_series(sid, nz=nz, size=size, values=vol.astype(np.int16),
                             pixel_spacing=1.0)


class TestRondaDeArreglos:
    def test_el_umbral_sin_banderas_conserva_la_regla_de_256(self, monkeypatch):
        # Antes de este cambio, una petición sin full_resolution iba por
        # _maybe_downsample. Sigue así para el método clásico: nada de 422 por
        # tamaño aunque el volumen pase del tope de resolución nativa.
        from routers import segment as seg
        calls: list[tuple] = []
        real = seg._maybe_downsample
        def spy(volume, spacing, *a, **k):
            calls.append(volume.shape)
            return real(volume, spacing, *a, **k)
        monkeypatch.setattr(seg, "_maybe_downsample", spy)
        monkeypatch.setattr(seg, "_FULL_RES_MAX_VOXELS", 1000)
        sid = create_session(); _tube_series(sid)
        r = _segment(sid, method="threshold")
        assert r.status_code == 200, r.text
        assert len(calls) == 1

    def test_el_umbral_a_resolucion_nativa_solo_si_se_pide(self, monkeypatch):
        from routers import segment as seg
        monkeypatch.setattr(seg, "_FULL_RES_MAX_VOXELS", 1000)
        sid = create_session(); _tube_series(sid)
        assert _segment(sid, method="threshold", half_resolution=False).status_code == 422
        assert _segment(sid, method="threshold", full_resolution=True).status_code == 422

    def test_las_metricas_describen_la_malla_guardada_tras_el_arbol_principal(self):
        sid = create_session(); _two_tubes_series(sid)
        sin = _segment(sid).json()
        assert sin["components"] == 2, sin
        j = _segment(sid, main_tree_only=True).json()
        assert j["main_tree_applied"] is True, j["main_tree_warning"]
        assert j["components"] == 1 and j["boundary_edges"] == 0
        q = surface_quality(read_vtp(session_subdir(sid, "meshes") / "vessel_tree.vtp"))
        assert q["components"] == 1 and q["n_vertices"] == j["vertices"]

    def test_el_metodo_tubular_suaviza_al_menos_40_iteraciones(self, monkeypatch):
        import services.segmentation as segsvc
        seen: dict = {}
        real = segsvc.mask_to_surface
        def spy(mask, spacing, **k):
            seen.update(k)
            return real(mask, spacing, **k)
        monkeypatch.setattr(segsvc, "mask_to_surface", spy)
        sid = create_session(); _tube_series(sid)
        assert _segment(sid, smoothing=3).status_code == 200
        assert seen["smooth_iters"] >= 40 and seen["pass_band"] == 0.05

    def test_solo_corre_un_trabajo_tubular_a_la_vez(self, monkeypatch):
        import services.vascular_mask as vm
        real = vm.build_vascular_mask
        inside, release = threading.Event(), threading.Event()
        def slow(*a, **k):
            inside.set()
            release.wait(30)
            return real(*a, **k)
        monkeypatch.setattr(vm, "build_vascular_mask", slow)
        a = create_session(); _tube_series(a)
        b = create_session(); _tube_series(b)
        out: dict = {}
        t = threading.Thread(target=lambda: out.setdefault("a", _segment(a)))
        t.start()
        try:
            assert inside.wait(30)
            rb = _segment(b)
            assert rb.status_code == 409 and "en curso" in rb.json()["detail"]
            assert progress.get(b) is None          # el rechazado no abre progreso
            ra = _segment(a)                        # la misma sesión reintenta
            assert ra.status_code == 409
            pa = progress.get(a)
            assert pa["running"] is True and pa["ok"] is None   # no pisa al que corre
            # El método clásico no ocupa la plaza tubular.
            assert _segment(b, method="threshold").status_code == 200
        finally:
            release.set(); t.join()
        assert out["a"].status_code == 200
        assert _segment(b).status_code == 200       # la plaza se libera al acabar


class TestSegmentarTrasPreprocesar:
    """De extremo a extremo: «Aplicar preprocesamiento» tiene que llegar a la
    malla. En Case 3 la segmentación releía el DICOM y un suavizado σ 0,5 daba
    la misma malla de 103 978 vértices que sin él. Con un remuestreo que cambia
    la forma se ve sin ambigüedad qué volumen se segmentó."""

    def test_segmenta_el_volumen_remuestreado_y_al_restaurar_el_original(self):
        from services.sessions import read_state
        sid = create_session(); _tube_series(sid)                 # 80×48×48 a 1 mm
        r = client.post(f"/api/preprocess/{sid}", json={
            "clip_hu": False, "resample_isotropic": True, "target_spacing_mm": 2.0, "smooth": False})
        assert r.status_code == 200, r.text
        assert r.json()["shape_after"] == [40, 24, 24]

        assert _segment(sid).status_code == 200
        forma = [read_state(sid, f"dicom.volume_{a}") for a in "zyx"]
        assert forma == ["40", "24", "24"]
        assert float(read_state(sid, "dicom.spacing_z")) == 2.0

        assert client.delete(f"/api/preprocess/{sid}").status_code == 200
        assert _segment(sid).status_code == 200
        forma = [read_state(sid, f"dicom.volume_{a}") for a in "zyx"]
        assert forma == ["80", "48", "48"]
        assert float(read_state(sid, "dicom.spacing_z")) == 1.0

    def test_con_la_cache_preprocesada_no_se_lee_el_dicom(self, monkeypatch):
        from routers import segment as seg
        sid = create_session(); _tube_series(sid)
        assert client.post(f"/api/preprocess/{sid}", json={
            "clip_hu": False, "resample_isotropic": True, "target_spacing_mm": 2.0,
            "smooth": False}).status_code == 200

        def no_leas(*a, **k):
            raise AssertionError("se leyó el DICOM entero con la caché preprocesada")
        monkeypatch.setattr(seg, "load_series", no_leas)
        r = _segment(sid)
        assert r.status_code == 200, r.text

    def test_otra_serie_ignora_la_cache_preprocesada(self):
        from services.sessions import read_state, write_state
        sid = create_session(); _tube_series(sid)
        assert client.post(f"/api/preprocess/{sid}", json={
            "clip_hu": False, "resample_isotropic": True, "target_spacing_mm": 2.0,
            "smooth": False}).status_code == 200
        # La caché se construyó con la serie del estado («» aquí); pedir otra
        # serie no puede segmentar el volumen de la anterior.
        write_state(sid, "dicom.series_id", "otra-serie")
        assert _segment(sid, series_id="").status_code == 200
        assert read_state(sid, "dicom.volume_z") == "80"

    def test_cambiar_de_serie_borra_la_marca_de_preprocesado(self):
        from services.dicom_loader import scan_series
        from services.sessions import read_state
        sid = create_session(); _tube_series(sid)
        assert client.post(f"/api/preprocess/{sid}", json={
            "clip_hu": False, "resample_isotropic": True, "target_spacing_mm": 2.0,
            "smooth": False}).status_code == 200
        assert read_state(sid, "preprocess.ops")
        uid = scan_series(session_subdir(sid, "dicom"))[0]["series_uid"]
        r = client.post(f"/api/upload/{sid}/series/{uid}")
        assert r.status_code == 200, r.text
        assert read_state(sid, "preprocess.ops", "") == ""
        assert _segment(sid, series_id=uid).status_code == 200
        assert read_state(sid, "dicom.volume_z") == "80"
