"""PHASES según Greving et al. 2014 (F1-16): la tabla anterior daba 5 puntos a 10–19,9 mm y desplazaba el riesgo un escalón."""
from models.phases import PhasesRequest
from services.phases import compute_phases


def _req(**kw):
    base = dict(population="other", hypertension=False, age_years=27, size_mm=10.9, earlier_sah=False, site="aca_pcom_posterior")
    base.update(kw)
    return PhasesRequest(**base)


def test_caso_3_da_10_puntos_y_5_3_por_ciento():
    r = compute_phases(_req())
    assert (r.size_pts, r.site_pts, r.total_score, r.risk_5yr_pct) == (6, 4, 10, 5.3)


def test_puntos_por_tamano_publicados():
    assert [compute_phases(_req(size_mm=s)).size_pts for s in (6.9, 7.0, 9.9, 10.0, 19.9, 20.0)] == [0, 3, 3, 6, 6, 10]


def test_hsa_previa_vale_un_punto():
    assert compute_phases(_req(earlier_sah=True)).sah_pts == 1


def test_columna_de_riesgo_publicada():
    esperado = {0: 0.4, 1: 0.4, 2: 0.4, 3: 0.7, 4: 0.9, 5: 1.3, 6: 1.7, 7: 2.4, 8: 3.2, 9: 4.3, 10: 5.3, 11: 7.2, 12: 17.8, 22: 17.8}
    for total, pct in esperado.items():
        # Monta una petición que sume exactamente `total` con los factores disponibles.
        kw = dict(population="other", hypertension=False, age_years=27, size_mm=0.0, earlier_sah=False, site="ica")
        resto = total
        if resto >= 10: kw["size_mm"], resto = 20.0, resto - 10
        elif resto >= 6: kw["size_mm"], resto = 10.0, resto - 6
        elif resto >= 3: kw["size_mm"], resto = 7.0, resto - 3
        if resto >= 5: kw["population"], resto = "finland", resto - 5
        elif resto >= 3: kw["population"], resto = "japan", resto - 3
        if resto >= 4: kw["site"], resto = "aca_pcom_posterior", resto - 4
        elif resto >= 2: kw["site"], resto = "mca", resto - 2
        if resto >= 1: kw["hypertension"], resto = True, resto - 1
        if resto >= 1: kw["age_years"], resto = 70, resto - 1
        if resto >= 1: kw["earlier_sah"], resto = True, resto - 1
        assert resto == 0, total
        r = compute_phases(PhasesRequest(**kw))
        assert r.total_score == total and r.risk_5yr_pct == pct, (total, r.total_score, r.risk_5yr_pct)
