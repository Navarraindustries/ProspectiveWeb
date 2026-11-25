"""Trabajo pesado fuera del bucle de eventos, una escritura a la vez por sesión
y remuestreo con tope de memoria."""
from __future__ import annotations

import inspect
import threading
import time

import pytest

from services.sessions import cerrojo_de_sesion


class TestFueraDelBucle:
    @pytest.mark.parametrize("modulo, nombre", [
        ("routers.report", "set_trajectory"),
        ("routers.report", "clear_trajectory"),
        ("routers.plan", "compute_plan"),
        ("routers.session_state", "save_session"),
        ("routers.coils", "preview_coil_construct"),
        ("routers.coils", "plan_coils"),
        ("routers.devices", "put_placed_clips"),
        ("routers.devices", "clear_devices_endpoint"),
    ])
    def test_no_congela_el_servidor(self, modulo, nombre):
        """Con `async def` y sin ningún await, VTK y los ficheros corrían en el
        bucle de eventos y paraban a todos. Con `def`, FastAPI usa sus hilos."""
        import importlib
        fn = getattr(importlib.import_module(modulo), nombre)
        assert not inspect.iscoroutinefunction(fn)


def _maximo_a_la_vez(fn, hilos=3) -> int:
    dentro, maximo = 0, 0
    guarda = threading.Lock()

    def lento(*_a, **_k):
        nonlocal dentro, maximo
        with guarda:
            dentro += 1
            maximo = max(maximo, dentro)
        time.sleep(0.05)
        with guarda:
            dentro -= 1
        return {}

    ts = [threading.Thread(target=fn, args=(lento,)) for _ in range(hilos)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    return maximo


class TestUnaALaVez:
    def test_el_cerrojo_es_por_sesion_y_recurso(self):
        assert cerrojo_de_sesion("s1", "malla") is cerrojo_de_sesion("s1", "malla")
        assert cerrojo_de_sesion("s1", "malla") is not cerrojo_de_sesion("s2", "malla")
        assert cerrojo_de_sesion("s1", "malla") is not cerrojo_de_sesion("s1", "volumen")
        with cerrojo_de_sesion("s1", "malla"):
            with cerrojo_de_sesion("s1", "malla"):   # reentrante
                pass

    def test_la_cache_del_volumen_se_crea_de_una_en_una(self, monkeypatch):
        import services.mpr as mpr

        def correr(lento):
            monkeypatch.setattr(mpr, "_asegurar_volumen", lento)
            mpr.ensure_volume_cached("sesion-volumen")

        assert _maximo_a_la_vez(correr) == 1

    def test_la_morfometria_va_de_una_en_una(self, monkeypatch):
        import routers.detect as detect

        def correr(lento):
            monkeypatch.setattr(detect, "_morfometria_sin_cerrojo", lento)
            detect._run_morphometry_sync("sesion-morfo", vtp_path=None)

        assert _maximo_a_la_vez(correr) == 1


class TestRemuestreo:
    def test_cuenta_los_voxeles(self):
        from services.preprocess import voxeles_tras_remuestreo
        assert voxeles_tras_remuestreo((100, 200, 200), (1.0, 0.5, 0.5), 0.5) == 200 * 200 * 200

    def test_un_tc_normal_a_0_2_mm_no_cabe_y_se_dice_cuanto_usar(self):
        from services.preprocess import (MAX_VOXELES_REMUESTREO, espaciado_minimo,
                                         voxeles_tras_remuestreo)
        forma, esp = (400, 512, 512), (0.625, 0.45, 0.45)
        assert voxeles_tras_remuestreo(forma, esp, 0.2) > MAX_VOXELES_REMUESTREO
        minimo = espaciado_minimo(forma, esp)
        assert voxeles_tras_remuestreo(forma, esp, minimo) <= MAX_VOXELES_REMUESTREO
        assert 0.2 < minimo < 0.5
