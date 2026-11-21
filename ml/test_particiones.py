"""Las particiones son por paciente, estratificadas, deterministas y sin lo que se filtra."""
from particiones import entra, repartir


def _fila(i, aneurisma, paciente=None, espaciado="0.5x0.5x0.6", motivo="", estado="ok"):
    return {"caso": f"c{i:03d}", "paciente": paciente or f"p{i:03d}", "aneurisma": aneurisma,
            "espaciado_mm": espaciado, "motivo": motivo, "estado": estado}


def test_filtros():
    assert entra(_fila(1, "1"), 2.0, False)
    assert not entra(_fila(1, "1", estado="excluida"), 2.0, False)
    assert not entra(_fila(1, "1", espaciado="0.4x0.4x3.0"), 2.0, False)
    assert not entra(_fila(1, "1", espaciado="2.5x0.4x0.4"), 2.0, False)  # serie sagital gruesa
    assert not entra(_fila(1, "0", motivo="sin_hueso"), 2.0, False)
    assert entra(_fila(1, "0", motivo="sin_hueso"), 2.0, True)


def test_reparto_estratificado_y_completo():
    filas = [_fila(i, "1" if i < 55 else "0") for i in range(100)]
    grupos = repartir(filas, 5, 7)
    assert sorted(c for g in grupos for c in g) == sorted(f["caso"] for f in filas)
    positivos = {f["caso"] for f in filas if f["aneurisma"] == "1"}
    assert [sum(c in positivos for c in g) for g in grupos] == [11] * 5
    assert [len(g) for g in grupos] == [20] * 5


def test_mismo_paciente_mismo_pliegue_y_misma_semilla():
    filas = [_fila(i, "1", paciente=f"p{i // 2}") for i in range(40)]
    grupos = repartir(filas, 5, 7)
    donde = {c: j for j, g in enumerate(grupos) for c in g}
    assert all(donde[f"c{i:03d}"] == donde[f"c{i + 1:03d}"] for i in range(0, 40, 2))
    assert repartir(filas, 5, 7) == grupos and repartir(filas, 5, 8) != grupos


def test_anadir_un_dataset_no_mueve_los_que_ya_estaban():
    rsna = [_fila(i, "1" if i < 55 else "0") for i in range(100)]
    otro = [dict(_fila(1000 + i, "1"), origen="topaneu2026") for i in range(20)]
    antes, despues = repartir(rsna, 5, 7), repartir(rsna + otro, 5, 7)
    nuevos = {f["caso"] for f in otro}
    assert [[c for c in g if c not in nuevos] for g in despues] == antes
    assert [sum(c in nuevos for c in g) for g in despues] == [4] * 5
