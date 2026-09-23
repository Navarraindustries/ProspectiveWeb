# -*- coding: utf-8 -*-
"""El estado de sesión no puede perder claves cuando dos escrituras se cruzan.

Encontrado en una sesión real: la detección escribe unas 48 claves seguidas y
`write_state` reescribía el fichero ENTERO en cada una, sin cerrojo ni
atomicidad. Resultado observado en `bcee93e5`:

  · a `detect.cand_003` le faltaba `centroid_x`
  · a `detect.cand_004` le faltaba `score`
  · su `patch_kind` valía «region» empalmado con la cola de otra línea:
    `regions/bcee93e5-.../aneurysm_cand_005.vtp`

Un centroide sin `x` se lee como 0.0, o sea un candidato colocado en el origen
sin que nada lo advierta.
"""
from __future__ import annotations

import threading

import pytest

from services.sessions import create_session, read_state, write_state, write_states


class TestEscrituraConcurrente:

    def test_ninguna_clave_se_pierde(self):
        """Ocho hilos escribiendo a la vez: deben estar las 8 × 25 claves."""
        sid = create_session()
        n_hilos, n_claves = 8, 25

        def escribe(h: int):
            for i in range(n_claves):
                write_state(sid, f"hilo{h}.k{i}", f"{h}-{i}")

        hilos = [threading.Thread(target=escribe, args=(h,)) for h in range(n_hilos)]
        for t in hilos:
            t.start()
        for t in hilos:
            t.join()

        faltan = [
            f"hilo{h}.k{i}"
            for h in range(n_hilos)
            for i in range(n_claves)
            if read_state(sid, f"hilo{h}.k{i}") != f"{h}-{i}"
        ]
        assert faltan == [], f"{len(faltan)} claves perdidas, p. ej. {faltan[:5]}"

    def test_los_valores_no_se_empalman(self):
        """El `patch_kind` corrupto era una línea pegada a la cola de otra."""
        sid = create_session()
        largo = "/data/sessions/" + "x" * 200 + "/meshes/aneurysm_cand_005.vtp"

        def corto():
            for _ in range(60):
                write_state(sid, "detect.cand_004.patch_kind", "region")

        def largoescribe():
            for _ in range(60):
                write_state(sid, "detect.cand_005.url", largo)

        a, b = threading.Thread(target=corto), threading.Thread(target=largoescribe)
        a.start(); b.start(); a.join(); b.join()

        assert read_state(sid, "detect.cand_004.patch_kind") == "region"
        assert read_state(sid, "detect.cand_005.url") == largo

    def test_un_lote_es_una_sola_reescritura(self):
        sid = create_session()
        write_states(sid, {f"c.{i}": str(i) for i in range(40)})
        for i in range(40):
            assert read_state(sid, f"c.{i}") == str(i)

    def test_el_lote_vacio_no_hace_nada(self):
        sid = create_session()
        write_state(sid, "a", "1")
        write_states(sid, {})
        assert read_state(sid, "a") == "1"

    @pytest.mark.parametrize("valor", ["con espacios", "acentuación ñ", "1503.0", ""])
    def test_valores_normales_sobreviven(self, valor):
        sid = create_session()
        write_state(sid, "k", valor)
        assert read_state(sid, "k") == valor
