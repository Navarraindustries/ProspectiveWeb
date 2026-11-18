"""La selección de clips con verificación geométrica no bloquea el servidor.

En el Caso 3 la verificación tarda ~20 s. Corría dentro del bucle de eventos y,
al entrar en Dispositivos (que la pide dos veces), el servidor entero dejaba de
responder casi un minuto: ni mallas, ni cortes, ni el resto de pestañas.
"""
import asyncio
import threading
import time

import routers.clips as clips


def test_dos_peticiones_iguales_comparten_un_calculo_en_otro_hilo(monkeypatch):
    llamadas: list[str] = []
    hilo_principal = threading.get_ident()

    def lento(session_id, case_id, verify):
        llamadas.append(session_id)
        assert threading.get_ident() != hilo_principal
        time.sleep(0.3)
        return {"session": session_id, "retocado": False}

    monkeypatch.setattr(clips, "_run_selection", lento)

    async def escenario():
        latido = []

        async def pulso():
            # Si el cálculo bloqueara el bucle, este pulso no avanzaría.
            for _ in range(5):
                latido.append(time.perf_counter())
                await asyncio.sleep(0.05)

        a, b, _ = await asyncio.gather(
            clips._seleccion_compartida("s1", 9, True),
            clips._seleccion_compartida("s1", 9, True),
            pulso(),
        )
        return a, b, latido

    a, b, latido = asyncio.run(escenario())
    assert llamadas == ["s1"]
    assert a == b and a is not b          # cada petición retoca su copia
    assert len(latido) == 5 and latido[-1] - latido[0] < 0.3
    assert clips._selecciones_en_curso == {}


def test_otra_clave_calcula_aparte(monkeypatch):
    llamadas = []

    def rapido(session_id, case_id, verify):
        llamadas.append((session_id, verify))
        return {}

    monkeypatch.setattr(clips, "_run_selection", rapido)

    async def escenario():
        await asyncio.gather(
            clips._seleccion_compartida("s1", 9, True),
            clips._seleccion_compartida("s1", 9, False),
        )

    asyncio.run(escenario())
    assert sorted(llamadas) == [("s1", False), ("s1", True)]


def test_endpoints_que_escriben_van_en_hilo_y_de_uno_en_uno_por_sesion():
    activos: dict[str, int] = {}
    maximo: dict[str, int] = {}
    cerrojo = threading.Lock()

    def escribe(session_id: str):
        with cerrojo:
            activos[session_id] = activos.get(session_id, 0) + 1
            maximo[session_id] = max(maximo.get(session_id, 0), activos[session_id])
        time.sleep(0.2)
        with cerrojo:
            activos[session_id] -= 1
        return session_id

    envuelto = clips._de_una_en_una_por_sesion(escribe)

    async def escenario():
        latido = []

        async def pulso():
            for _ in range(5):
                latido.append(time.perf_counter())
                await asyncio.sleep(0.05)

        t0 = time.perf_counter()
        await asyncio.gather(
            envuelto(session_id="a"), envuelto(session_id="a"),
            envuelto(session_id="b"), pulso(),
        )
        return time.perf_counter() - t0, latido

    total, latido = asyncio.run(escenario())
    assert maximo == {"a": 1, "b": 1}      # la misma sesión nunca a la vez
    assert 0.38 < total < 0.6              # «b» no esperó a las dos de «a»
    assert latido[-1] - latido[0] < 0.3    # el bucle siguió libre


def test_los_endpoints_de_clips_ya_no_calculan_en_el_bucle():
    import ast
    import inspect

    arbol = ast.parse(inspect.getsource(clips))
    asincronos = {n.name for n in arbol.body if isinstance(n, ast.AsyncFunctionDef)}
    # Solo quedan los que de verdad esperan algo: la subida (lee el fichero)
    # y la selección (espera su hilo).
    assert asincronos == {"upload_custom_clip", "_seleccion_compartida", "clip_selection"}
