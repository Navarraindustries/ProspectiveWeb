"""El informe dice respecto a qué eje se midió el ángulo del corredor: el del
aneurisma si la morfometría lo guardó, el vertical del estudio si no (spec §4.1).
Las dos frases son las del panel (angleReferenceLabel en el frontend)."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prospective_traj_label_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from services.database import Base, engine
from services.sessions import create_session, write_state
from services.report_generator import (
    ReportGenerator, build_report_data_from_session, read_trajectory_state,
)

Base.metadata.create_all(bind=engine)

ANEURISMA = "Ángulo respecto al eje del aneurisma"
VERTICAL = "Ángulo respecto al eje vertical del estudio (sin eje del aneurisma medido)"


def _session(axis: tuple[str, str, str] | None) -> str:
    sid = create_session()
    for k, v in zip("xyz", (0, 0, 0)):
        write_state(sid, f"trajectory.entry_{k}", str(v))
    for k, v in zip("xyz", (0, 0, 10)):
        write_state(sid, f"trajectory.target_{k}", str(v))
    if axis is not None:
        for k, v in zip("xyz", axis):
            write_state(sid, f"morpho.axis_{k}", v)
    return sid


def _label_row(sid: str) -> list[str]:
    # La sección se construye sin renderizar el PDF: basta leer la tabla.
    gen = ReportGenerator(build_report_data_from_session(sid))
    tables = [e for e in gen._section_trajectory() if hasattr(e, "_cellvalues")]
    return [row[0] for row in tables[0]._cellvalues if str(row[0]).startswith("Ángulo")]


def test_con_eje_medido_la_referencia_es_el_aneurisma():
    sid = _session(("1", "0", "0"))
    assert read_trajectory_state(sid)["angle_ref"] == "aneurisma"
    assert _label_row(sid) == [ANEURISMA]


def test_sin_eje_la_referencia_es_el_eje_vertical():
    sid = _session(None)
    assert read_trajectory_state(sid)["angle_ref"] == "vertical"
    assert _label_row(sid) == [VERTICAL]


def test_eje_nulo_cuenta_como_sin_eje():
    sid = _session(("0", "0", "0"))
    assert read_trajectory_state(sid)["angle_ref"] == "vertical"
    assert _label_row(sid) == [VERTICAL]
