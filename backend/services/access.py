"""Quién puede ver los datos de qué paciente.

La regla ya existía, pero solo en `routers/patients.py`: un usuario que no es
administrador ve los pacientes que él creó. La galería de estudios, las
capturas, las sesiones guardadas, el seguimiento y los ficheros de `/data` no
la aplicaban, así que bastaba conocer (o probar) un id consecutivo para ver
las imágenes de los pacientes de otro profesional.

Aquí vive la regla una sola vez. Desde F2 (F2-75) un paciente lo ve quien lo
creó, las cuentas con las que lo compartió (`patient_shares`) y el
administrador; compartir solo lo puede quien lo creó o un administrador.

Una sesión empezada «sin paciente» y aún sin adjuntar es de quien la abrió
(`.owner` en su carpeta, ver services/sessions.py). Toda petición privada que
nombre una sesión pasa por `require_session_params` (main.py).
"""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from services.auth_service import require_user
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


def can_access_session(db: Session, user: Optional[User], session_id: str) -> bool:
    """La regla de una sesión, viva o guardada.

    - Ligada a un paciente: quien ve a ese paciente.
    - Sin paciente: quien la abrió, o un administrador. Antes no tenía dueño y
      bastaba conocer su identificador, que viaja en los nombres de los
      ficheros descargados y en los registros.
    - Sin paciente ni dueño (sesiones abiertas antes de guardar el dueño):
      queda para el primero que la usa, para no cortar el trabajo en curso.
    """
    if is_admin(user):
        return True
    ps = session_row(db, session_id)
    if ps is not None and ps.patient_id is not None:
        return can_access_patient(db, user, ps.patient_id)
    from services.sessions import has_saved_session, session_exists, session_owner, set_session_owner
    dueno = session_owner(session_id)
    if dueno is not None:
        return dueno == user.id
    if session_exists(session_id) or has_saved_session(session_id):
        set_session_owner(session_id, user.id)
    return True


def require_session(db: Session, user: Optional[User], session_id: str) -> None:
    """403 si este usuario no puede usar la sesión (ver can_access_session).

    Con paciente, el motivo es el paciente, y se dice igual que en el resto de
    la aplicación."""
    if can_access_session(db, user, session_id):
        return
    if session_patient_id(db, session_id) is not None:
        raise HTTPException(status_code=403, detail="No autorizado sobre este paciente.")
    raise HTTPException(status_code=403, detail="No autorizado sobre esta sesión.")


#: Los nombres con los que una petición nombra una sesión, y un caso clínico
#: (`Study`): en la ruta, en la consulta o en el cuerpo JSON.
SESSION_PARAMS = ("session_id", "previous_session_id")
CASE_PARAMS = ("case_id",)


def _nombrados(request: Request, cuerpo: object, claves: tuple[str, ...]) -> set[str]:
    vistos: set[str] = set()
    for clave in claves:
        valores = [request.path_params.get(clave), request.query_params.get(clave)]
        if isinstance(cuerpo, dict):
            valores.append(cuerpo.get(clave))
        for v in valores:
            if isinstance(v, (str, int)) and not isinstance(v, bool) and str(v):
                vistos.add(str(v))
    return vistos


async def require_session_params(request: Request, user: User = Depends(require_user)) -> None:
    """Una sola comprobación para todas las rutas privadas (main.py).

    Cada endpoint tenía que acordarse de llamar a `require_session`, y unos 75
    no lo hacían; varios aceptaban además el número de cualquier caso clínico y
    devolvían el nombre de su paciente. Aquí se mira toda sesión y todo caso que
    nombre la petición, en la ruta, en la consulta o en el cuerpo JSON, así que
    un router nuevo queda cubierto sin hacer nada. Lo mal formado o inexistente
    no se mira aquí: cada ruta ya responde 400, 404 o 422 por ello.
    """
    from services.database import SessionLocal
    from services.db_models import Study
    from services.sessions import valid_session_id

    cuerpo = None
    if "application/json" in request.headers.get("content-type", ""):
        try:
            cuerpo = await request.json()
        except Exception:  # noqa: BLE001 — un cuerpo roto lo rechaza la validación de la ruta
            cuerpo = None
    sesiones = {i for i in _nombrados(request, cuerpo, SESSION_PARAMS) if valid_session_id(i)}
    casos = {int(i) for i in _nombrados(request, cuerpo, CASE_PARAMS) if i.isdigit()}
    if not sesiones and not casos:
        return
    db = SessionLocal()
    try:
        for sid in sorted(sesiones):
            require_session(db, user, sid)
        for cid in sorted(casos):
            paciente = db.query(Study.patient_id).filter(Study.id == cid).scalar()
            require_patient(db, user, paciente)
    finally:
        db.close()
