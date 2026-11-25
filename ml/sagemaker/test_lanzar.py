"""El lanzador no crea nada sin `--lanzar` y se niega si el costo máximo pasa del techo."""
import pytest

import lanzar

BASE = ["--modo", "benchmark", "--datos", "s3://cubo/datos/cta-piloto/", "--rol", "arn:aws:iam::1:role/r"]


def test_costo_maximo_incluye_el_disco():
    assert lanzar.costo_maximo("ml.g6e.4xlarge", 2, 0) == pytest.approx(7.52)
    assert lanzar.costo_maximo("ml.g6e.4xlarge", 2, 200) == pytest.approx(7.52 + 200 * 0.14 / 730 * 2)


def test_simulacion_no_toca_aws(monkeypatch, capsys):
    monkeypatch.setitem(__import__("sys").modules, "boto3", None)  # importarlo rompería
    assert lanzar.main([*BASE, "--max-horas", "2", "--techo-usd", "10"]) == 0
    assert "Simulación" in capsys.readouterr().out


def test_se_niega_si_supera_el_techo(capsys):
    assert lanzar.main([*BASE, "--max-horas", "5", "--techo-usd", "10", "--lanzar"]) == 2
    assert "NO SE LANZA" in capsys.readouterr().out


def test_spot_dobla_la_espera_no_el_computo(capsys):
    lanzar.main([*BASE, "--max-horas", "2", "--techo-usd", "10", "--spot"])
    salida = capsys.readouterr().out
    assert '"MaxRuntimeInSeconds": 7200' in salida and '"MaxWaitTimeInSeconds": 14400' in salida


def test_cero_horas_no_pasa(capsys):
    """Con 0 horas el costo salía 0 y cualquier techo lo aceptaba."""
    with pytest.raises(SystemExit):
        lanzar.main(["--modo", "benchmark", "--datos", "s3://b/d", "--rol", "arn:r",
                     "--max-horas", "0", "--techo-usd", "10"])


def test_cuenta_lo_que_queda_en_s3():
    sin = lanzar.costo_maximo("ml.g6e.4xlarge", 2, 0)
    assert lanzar.costo_maximo("ml.g6e.4xlarge", 2, 0, s3_gb=100) == pytest.approx(sin + 100 * 0.023)
    assert lanzar.costo_maximo("ml.g6e.4xlarge", 2, 0, tarifa_hora=5.0) == pytest.approx(10.0)
