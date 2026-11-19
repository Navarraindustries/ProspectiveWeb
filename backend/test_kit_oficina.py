"""Scripts del kit de la oficina (O3/O7): las partes que no necesitan torch ni TotalSegmentator."""
import numpy as np

from scripts.entrenar_verificador import auc, lista, pesos_muestreo


def _f(study, rank, pos, lesion="", score=0.0, ia="1"):
    return {"study": study, "rank": str(rank), "es_aneurisma_articulos": str(pos), "lesion": lesion,
            "score": score, "estudio_con_aneurisma": ia, "pliegue": "0"}


def test_auc():
    assert auc(np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert auc(np.array([0, 1]), np.array([0.5, 0.5])) == 0.5
    assert auc(np.array([1, 1]), np.array([0.1, 0.2])) is None


def test_cada_lesion_pesa_lo_mismo():
    filas = [_f("1", r, 1, "gigante") for r in range(1, 9)] + [_f("2", 1, 1, "pequeña")] \
        + [_f("3", r, 0) for r in range(1, 31)]
    w = pesos_muestreo(filas, "articulos")
    assert abs(w[:8].sum() - w[8]) < 1e-12, "los 8 parches del gigante suman lo que el único de la pequeña"
    assert abs(w[:9].sum() - 0.25) < 1e-12 and abs(w.sum() - 1.0) < 1e-12


def test_reordenar_sube_la_lesion_y_el_umbral_limpia_controles():
    filas = [_f("1", 1, 0, score=0.1), _f("1", 2, 0, score=0.2), _f("1", 3, 1, "an_1", score=0.9),
             _f("2", 1, 0, score=0.3, ia="0"), _f("2", 2, 0, score=0.05, ia="0")]
    det = lista(filas, "articulos")
    reo = lista(filas, "articulos", clave=lambda f: -f["score"])
    assert det["1"]["lesiones"] == 0 and reo["1"]["lesiones"] == 1
    assert det["1"]["fp_por_estudio"] == 1.0 and reo["1"]["fp_por_estudio"] == 0.5
    con_umbral = lista(filas, "articulos", clave=lambda f: -f["score"], umbral=0.5)
    assert con_umbral["5"]["fp_por_estudio"] == 0.0
    assert con_umbral["controles_sin_ningun_candidato"] == 1 and con_umbral["n_controles"] == 1


def test_o3_sin_totalsegmentator_avisa(tmp_path):
    from scripts.o3_mascaras import main
    (tmp_path / "Studies" / "001").mkdir(parents=True)
    assert main(["--dicom", str(tmp_path), "--salida", str(tmp_path / "m"),
                 "--comando", "no_existe_este_programa_xyz"]) == 2
