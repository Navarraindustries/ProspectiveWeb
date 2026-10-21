"""Quién puede ver los datos de qué paciente.

La regla ya existía, pero solo en `routers/patients.py`: un usuario que no es
administrador ve los pacientes que él creó. La galería de estudios, las
capturas, las sesiones guardadas, el seguimiento y los ficheros de `/data` no
la aplicaban, así que bastaba conocer (o probar) un id consecutivo para ver
las imágenes de los pacientes de otro profesional.

Aquí vive la regla una sola vez. Desde F2 (F2-75) un paciente lo ve quien lo
creó, las cuentas con las que lo compartió (`patient_shares`) y el
administrador; compartir solo lo puede quien lo creó o un administrador.

Lo que NO tiene paciente (una sesión empezada «sin paciente» y aún sin
adjuntar) no tiene dueño que comprobar: su identificador es un UUID
aleatorio, que hace de llave.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from services.db_models import ImagingStudy, Patient, PatientShare, PlanningSession, User


def is_admin(user: Optional[User]) -> bool:
    # `None` solo ocurre en llamadas internas: los routers privados exigen
    # usuario (require_user) antes de llegar aquí.
    return user is None or user.role == "admin"


def can_access_patient(db: Session, user: Optional[User], patient_id: Optional[int]) -> bool:
    """Creador, compartido o administrador: la única regla de visibilidad."""
    if patient_id is None or is_admin(user):
        return True
    owner = db.query(Patient.created_by).filter(Patient.id == patient_id).scalar()
    if owner == user.id:
        return True
    return db.query(PatientShare.id).filter(
        PatientShare.patient_id == patient_id, PatientShare.user_id == user.id,
    ).first() is not None


def require_patient(db: Session, user: Optional[User], patient_id: Optional[int]) -> None:
    """403 si este usuario no ve al paciente (ni lo creó, ni se lo compartieron, ni es administrador)."""
    if not can_access_patient(db, user, patient_id):
        raise HTTPException(status_code=403, detail="No autorizado sobre este paciente.")


def can_share_patient(db: Session, user: Optional[User], patient_id: int) -> bool:
    """Compartir es más que ver: solo quien creó al paciente o un administrador.

    Si el compartido pudiera volver a compartir, el creador perdería el control
    de quién ve a su paciente.
    """
    if is_admin(user):
        return True
    owner = db.query(Patient.created_by).filter(Patient.id == patient_id).scalar()
    return owner is not None and owner == user.id


def require_share_right(db: Session, user: Optional[User], patient_id: int) -> None:
    if not can_share_patient(db, user, patient_id):
        raise HTTPException(status_code=403,
                            detail="Solo quien creó al paciente o un administrador puede compartirlo.")


def own_patient_ids(db: Session, user: Optional[User]):
    """Subconsulta con los ids de los pacientes visibles, o None si los ve todos.

    Visibles = creados por él más los que le han compartido. El nombre viene de
    antes de compartir; se mantiene para que las rutas que filtran con ella
    (galería, capturas, sesiones, pedidos) sigan la regla sin cambiar.
    """
    if is_admin(user):
        return None
    creados = db.query(Patient.id).filter(Patient.created_by == user.id)
    compartidos = db.query(PatientShare.patient_id).filter(PatientShare.user_id == user.id)
    return creados.union(compartidos)


def require_imaging_study(db: Session, user: Optional[User], img: Optional[ImagingStudy]) -> None:
    if img is not None:
        require_patient(db, user, img.patient_id)


#: Clave del estado de una sesión viva: la sesión guardada de la que salió.
ORIGIN_KEY = "origin.saved_session_id"


def session_row(db: Session, session_id: str) -> Optional[PlanningSession]:
    """La fila que dice de quién es una sesión.

    «Reanudar» copia la sesión guardada a una sesión viva con un id NUEVO, que
    no tiene fila hasta que se vuelve a guardar. Sin seguirle el rastro, una
    sesión reanudada no era de ningún paciente: el seguimiento no encontraba
    sus otros estudios y la regla de acceso no tenía a quién aplicarse.
    """
    ps = db.query(PlanningSession).filter_by(session_id=session_id).first()
    if ps is not None:
        return ps
    from services.sessions import read_state, repointed_to, session_exists
    if not session_exists(session_id):
        return None
    origen = read_state(session_id, ORIGIN_KEY, "")
    # Si otra sesión reanudada de la misma guardada ya guardó, la fila se movió
    # a su id: se sigue el rastro (si no, esta quedaba sin paciente y la regla
    # de acceso no tenía a quién aplicarse).
    for _ in range(20):                       # cadena de reapuntados, sin bucles
        if not origen:
            return None
        ps = db.query(PlanningSession).filter_by(session_id=origen).first()
        if ps is not None:
            return ps
        origen = repointed_to(origen)
    return None


def session_patient_id(db: Session, session_id: str) -> Optional[int]:
    """El paciente al que está ligada una sesión, o None si no lo está."""
    ps = session_row(db, session_id)
    return ps.patient_id if ps is not None else None


def require_session(db: Session, user: Optional[User], session_id: str) -> None:
    """403 si la sesión está ligada a un paciente que este usuario no ve."""
    require_patient(db, user, session_patient_id(db, session_id))
