"""Authentication router — real JWT login/me (Session D)."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from models import (
    ChangePasswordRequest, ResetPasswordRequest,
    LoginRequest, LoginResponse, UserInfo,
    SignupRequest, SignupResponse, PendingUser,
    UserAdminInfo, UserBrief, UserUpdate,
)
from services.database import get_db
from services.auth_service import (
    ACCESS_TOKEN_EXPIRE_MIN,
    CONTACTO_ADMIN,
    COOKIE_NAME,
    AuthError,
    approve_user,
    authenticate_user,
    create_access_token,
    create_pending_user,
    get_password_hash,
    get_pending_users,
    reject_user,
    require_admin,
    require_user,
    verify_password,
)
from services.db_models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# Profile photo + CV uploaded at signup. Stored OUTSIDE the public /data mount
# (these are personal documents) and served only through admin-authenticated
# endpoints below.
_USER_FILES = Path("user_files")


def _utc_iso(dt: datetime | None) -> str:
    """SQLite guarda `created_at` como UTC sin zona; sin «+00:00» el navegador lo leía como hora local."""
    if not dt:
        return ""
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()

_MAX_UPLOAD_BYTES = 6 * 1024 * 1024   # 6 MB


async def _save_user_upload(upload: UploadFile, subdir: str, user_id: int) -> str:
    """Persist an uploaded profile file; return its stored path. Raises on size."""
    data = await upload.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el máximo de 6 MB.")
    suffix = Path(upload.filename or "").suffix.lower()[:10]
    dest_dir = _USER_FILES / subdir
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{user_id}{suffix}"
    dest.write_bytes(data)
    return str(dest)


def _user_to_info(user: User) -> UserInfo:
    """Map ORM User → Pydantic UserInfo."""
    initials = "".join(
        part[0].upper()
        for part in user.full_name.split()
        if part
    )[:2] or user.username[:2].upper()

    return UserInfo(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        institution=user.institution,
        avatar_initials=initials,
        must_change_password=bool(user.must_change_password),
        has_photo=bool(user.photo_path and Path(user.photo_path).exists()),
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login and obtain JWT token",
    description=(
        "Authenticates with username + password and returns a signed JWT.\n\n"
        "Include the token in subsequent requests as:\n"
        "`Authorization: Bearer <token>`\n\n"
        "Default credentials on first run: **admin / admin123**."
    ),
)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    from services import login_throttle
    clave = login_throttle.key(req.username, request.client.host if request.client else "")
    espera = login_throttle.blocked_for(clave)
    if espera > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Demasiados intentos fallidos. Vuelve a probar en {int(espera // 60) + 1} min. "
                "Si no recuerdas la contraseña, pide a un administrador que la restablezca."
            ),
            headers={"Retry-After": str(int(espera) + 1)},
        )
    try:
        user = authenticate_user(db, req.username, req.password)
    except AuthError as exc:
        # Account exists but is blocked (pending approval / rejected / disabled).
        # Cuenta como intento fallido: si no, una cuenta bloqueada se podía
        # sondear sin límite.
        login_throttle.record_failure(clave)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if user is None:
        login_throttle.record_failure(clave)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            # Objeto y no texto: el aviso «te queda un intento» necesita el número.
            # El cliente lee `message` como cualquier otro detalle (ApiError.fromServer).
            detail={
                "message": "Credenciales incorrectas",
                "remaining_attempts": login_throttle.remaining(clave),
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    login_throttle.clear(clave)

    token = create_access_token(subject=user.username)

    logger.info("Login OK — user=%s role=%s", user.username, user.role)

    from services.audit import audit_append, ACT_LOGIN
    audit_append(ACT_LOGIN, {"role": user.role}, username=user.username)

    # Also as a cookie: an <img src> or a vtk.js mesh request cannot carry an
    # Authorization header, and those URLs serve patient imaging.
    response.set_cookie(
        COOKIE_NAME, token,
        max_age=ACCESS_TOKEN_EXPIRE_MIN * 60,
        httponly=True, samesite="lax",
        secure=os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes"),
        path="/",
    )
    # La pareja del doble envío (services/csrf.py): legible por el JavaScript
    # del propio origen, que la devuelve en X-CSRF-Token.
    from services.csrf import CSRF_COOKIE, new_token
    response.set_cookie(
        CSRF_COOKIE, new_token(),
        max_age=ACCESS_TOKEN_EXPIRE_MIN * 60,
        httponly=False, samesite="lax",
        secure=os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes"),
        path="/",
    )

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MIN * 60,
        user=_user_to_info(user),
    )


@router.post(
    "/logout",
    summary="Clear the session cookie",
    description="Drops the auth cookie. The bearer token stays valid until it expires.",
)
async def logout(response: Response) -> dict:
    from services.csrf import CSRF_COOKIE
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return {"status": "ok"}


@router.get(
    "/me",
    response_model=UserInfo,
    summary="Get current authenticated user",
    description="Returns the profile of the user identified by the Bearer token.",
)
async def me(
    current_user: Annotated[User, Depends(require_user)],
) -> UserInfo:
    return _user_to_info(current_user)


@router.get(
    "/me/photo",
    summary="Download the current user's profile photo",
    description="Serves the authenticated user's own profile photo (404 if none).",
)
async def get_my_photo(
    current_user: Annotated[User, Depends(require_user)],
) -> FileResponse:
    if not current_user.photo_path or not Path(current_user.photo_path).exists():
        raise HTTPException(status_code=404, detail="Sin foto de perfil.")
    return FileResponse(current_user.photo_path)


# ── Self-registration (public) ─────────────────────────────────────────────── #

@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request a new account",
    description=(
        "Public self-registration. Creates a **pending** account that an "
        "administrator must approve before the user can log in."
    ),
)
async def signup(
    db: Annotated[Session, Depends(get_db)],
    username: str = Form(...),
    password: str = Form(...),
    full_name: str = Form(...),
    national_id: str = Form(""),
    professional_id: str = Form(""),
    specialty: str = Form(""),
    university: str = Form(""),
    hospital: str = Form(""),
    position: str = Form(""),
    orcid: str = Form(""),
    photo: UploadFile | None = File(None),
    cv: UploadFile | None = File(None),
) -> SignupResponse:
    user, err = create_pending_user(
        db, username=username, password=password, full_name=full_name,
        national_id=national_id, professional_id=professional_id, specialty=specialty,
        university=university, hospital=hospital, position=position, orcid=orcid,
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    # Store the optional profile photo / CV named by the new user's id.
    changed = False
    if photo is not None and photo.filename:
        user.photo_path = await _save_user_upload(photo, "photos", user.id)
        changed = True
    if cv is not None and cv.filename:
        user.cv_path = await _save_user_upload(cv, "cv", user.id)
        changed = True
    if changed:
        db.commit()

    return SignupResponse(
        status="pending",
        message=(
            "Solicitud enviada. Un administrador la revisará; no recibirás aviso, "
            "así que vuelve a intentar entrar más adelante. "
            f"Para consultas, {CONTACTO_ADMIN}."
        ),
    )


# ── Admin: serve a pending user's uploaded photo / CV ──────────────────────── #

@router.get(
    "/pending/{user_id}/photo",
    summary="Download a pending user's profile photo (admin)",
)
async def get_pending_photo(
    user_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    user = db.get(User, user_id)
    if user is None or not user.photo_path or not Path(user.photo_path).exists():
        raise HTTPException(status_code=404, detail="Sin foto de perfil.")
    return FileResponse(user.photo_path)


@router.get(
    "/pending/{user_id}/cv",
    summary="Download a pending user's CV (admin)",
)
async def get_pending_cv(
    user_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    user = db.get(User, user_id)
    if user is None or not user.cv_path or not Path(user.cv_path).exists():
        raise HTTPException(status_code=404, detail="Sin CV adjunto.")
    p = Path(user.cv_path)
    return FileResponse(p, filename=f"CV_{user.username}{p.suffix}")


# ── Admin: pending-account review ──────────────────────────────────────────── #

def _pending_to_api(u: User) -> PendingUser:
    return PendingUser(
        id=u.id,
        username=u.username,
        full_name=u.full_name,
        national_id=u.national_id,
        professional_id=u.professional_id,
        specialty=u.specialty,
        university=u.university,
        hospital=u.hospital,
        position=u.position,
        orcid=u.orcid,
        has_photo=bool(u.photo_path),
        has_cv=bool(u.cv_path),
        created_at=_utc_iso(u.created_at),
    )


@router.get(
    "/pending",
    response_model=list[PendingUser],
    summary="List pending account requests (admin)",
    description="Returns all self-registrations awaiting approval. Admin only.",
)
async def list_pending(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PendingUser]:
    return [_pending_to_api(u) for u in get_pending_users(db)]


@router.post(
    "/pending/{user_id}/approve",
    summary="Approve a pending account (admin)",
    description="Activates the account so the user can log in. Admin only.",
)
async def approve(
    user_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    ok, err = approve_user(db, user_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err)
    return {"status": "active"}


@router.post(
    "/pending/{user_id}/reject",
    summary="Reject a pending account (admin)",
    description="Marks the request as rejected; the user cannot log in. Admin only.",
)
async def reject(
    user_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    ok, err = reject_user(db, user_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err)
    return {"status": "rejected"}


# ── Admin: full user management ────────────────────────────────────────────── #

def _user_to_admin(u: User) -> UserAdminInfo:
    return UserAdminInfo(
        id=u.id,
        username=u.username,
        full_name=u.full_name,
        role=u.role if u.role in ("admin", "medico", "residente", "viewer") else "viewer",
        status=u.status,
        is_active=u.is_active,
        specialty=u.specialty,
        hospital=u.hospital,
        has_photo=bool(u.photo_path),
        has_cv=bool(u.cv_path),
        created_at=_utc_iso(u.created_at),
        university=u.university,
        position=u.position,
        rejected_at=_utc_iso(u.rejected_at) if u.rejected_at else None,
    )


@router.get(
    "/users",
    response_model=list[UserAdminInfo],
    summary="List all users (admin)",
    description=(
        "`status=pending|approved|rejected` filtra por estado de la cuenta "
        "(`approved` = activas). Sin filtro devuelve todas."
    ),
)
async def list_users(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    status_filter: Annotated[Literal["pending", "approved", "rejected"] | None, Query(alias="status")] = None,
) -> list[UserAdminInfo]:
    q = db.query(User)
    if status_filter is not None:
        # «approved» es el estado interno «active».
        q = q.filter(User.status == (User.STATUS_ACTIVE if status_filter == "approved" else status_filter))
        if status_filter == "rejected":
            # Una desactivación a mano también deja status=rejected; solo el
            # rechazo de una solicitud trae fecha.
            q = q.filter(User.rejected_at.isnot(None))
    users = q.order_by(User.created_at.desc()).all()
    return [_user_to_admin(u) for u in users]


@router.get(
    "/users/brief",
    response_model=list[UserBrief],
    summary="Cuentas activas, en breve (para compartir)",
    description=(
        "Id, usuario, nombre y rol de las cuentas activas. Para cualquier sesión: "
        "elegir con quién compartir un paciente no es cosa solo del administrador."
    ),
)
async def list_users_brief(
    _user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[UserBrief]:
    users = (
        db.query(User)
        .filter(User.is_active == True, User.status == User.STATUS_ACTIVE)  # noqa: E712
        .order_by(User.full_name, User.username)
        .all()
    )
    return [UserBrief(id=u.id, username=u.username, full_name=u.full_name or "", role=u.role) for u in users]


@router.post(
    "/users",
    response_model=UserAdminInfo,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user (admin)",
    description=(
        "Admin-only. Creates an **active** account with the full professional "
        "profile (same fields as self-registration) plus an explicit role and "
        "optional photo/CV. No approval step — the user can log in immediately."
    ),
)
async def create_user(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    username: str = Form(...),
    password: str = Form(...),
    full_name: str = Form(...),
    role: str = Form("medico"),
    national_id: str = Form(""),
    professional_id: str = Form(""),
    specialty: str = Form(""),
    university: str = Form(""),
    hospital: str = Form(""),
    position: str = Form(""),
    orcid: str = Form(""),
    photo: UploadFile | None = File(None),
    cv: UploadFile | None = File(None),
) -> UserAdminInfo:
    user, err = create_pending_user(
        db, active=True, role=role,
        username=username, password=password, full_name=full_name,
        national_id=national_id, professional_id=professional_id, specialty=specialty,
        university=university, hospital=hospital, position=position, orcid=orcid,
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    changed = False
    if photo is not None and photo.filename:
        user.photo_path = await _save_user_upload(photo, "photos", user.id)
        changed = True
    if cv is not None and cv.filename:
        user.cv_path = await _save_user_upload(cv, "cv", user.id)
        changed = True
    if changed:
        db.commit()
        db.refresh(user)

    logger.info("Admin %s created active user %s (role=%s)", _admin.username, user.username, user.role)
    return _user_to_admin(user)


@router.put(
    "/users/{user_id}",
    response_model=UserAdminInfo,
    summary="Update a user (admin)",
)
async def update_user(
    user_id: int,
    req: UserUpdate,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> UserAdminInfo:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

    # Lockout guards: an admin can't strip their own admin role or deactivate
    # themselves (would lock them out of the panel they're using).
    if user.id == admin.id:
        if req.role is not None and req.role != "admin":
            raise HTTPException(status_code=400, detail="No puedes quitarte tu propio rol de administrador.")
        if req.is_active is False:
            raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta.")

    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.role is not None:
        user.role = req.role
    # Los campos profesionales del alta también se corrigen después (F2-45).
    if req.specialty is not None:
        user.specialty = req.specialty.strip()
    if req.hospital is not None:
        user.hospital = req.hospital.strip()
    if req.university is not None:
        user.university = req.university.strip()
    if req.position is not None:
        user.position = req.position.strip()
    if req.is_active is not None:
        user.is_active = req.is_active
        user.status = User.STATUS_ACTIVE if req.is_active else User.STATUS_REJECTED
        if req.is_active:
            user.rejected_at = None
    db.commit()
    db.refresh(user)
    logger.info("User updated by admin — id=%d role=%s active=%s", user.id, user.role, user.is_active)
    return _user_to_admin(user)


@router.post(
    "/users/{user_id}/photo",
    response_model=UserAdminInfo,
    summary="Replace a user's profile photo (admin)",
)
async def set_user_photo(
    user_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    photo: UploadFile = File(...),
) -> UserAdminInfo:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
    user.photo_path = await _save_user_upload(photo, "photos", user.id)
    db.commit()
    db.refresh(user)
    return _user_to_admin(user)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user (admin)",
)
async def delete_user(
    user_id: int,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    reassign_to: int | None = None,
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta.")
    # Don't delete the last active admin.
    if user.role == "admin":
        other_admins = db.query(User).filter(
            User.role == "admin", User.is_active == True, User.id != user_id  # noqa: E712
        ).count()
        if other_admins == 0:
            raise HTTPException(status_code=400, detail="No puedes eliminar al último administrador.")
    # Sus pacientes pasan a otra cuenta: ninguno queda sin creador (sin dueño
    # solo el administrador los vería). Por defecto, quien borra.
    from services.audit import ACT_USER_DELETED, audit_append
    from services.db_models import Patient, PatientShare
    target = admin if reassign_to is None else db.get(User, reassign_to)
    if target is None or not target.is_active:
        raise HTTPException(status_code=400, detail="La cuenta de destino no existe o está inactiva.")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Los pacientes no pueden pasar a la cuenta que se borra.")
    mine = [pid for (pid,) in db.query(Patient.id).filter(Patient.created_by == user_id).all()]
    if mine:
        db.query(Patient).filter(Patient.id.in_(mine)).update({"created_by": target.id}, synchronize_session=False)
        # Quien crea al paciente ya lo ve: su fila de compartido sobra.
        db.query(PatientShare).filter(PatientShare.patient_id.in_(mine),
                                      PatientShare.user_id == target.id).delete(synchronize_session=False)
    # Lo que esta cuenta compartió sigue compartido, ahora «por» el destino.
    db.query(PatientShare).filter(PatientShare.shared_by == user_id).update(
        {"shared_by": target.id}, synchronize_session=False)
    deleted_name = user.username
    db.delete(user)
    db.commit()
    audit_append(ACT_USER_DELETED,
                 {"deleted": deleted_name, "reassigned_to": target.username, "patients": len(mine)},
                 username=admin.username)
    logger.info("User deleted by admin — id=%d username=%s", user_id, deleted_name)


# ── POST /auth/change-password ─────────────────────────────────────────────── #

@router.post(
    "/change-password",
    summary="Change your own password",
    description=(
        "Requires the current password, so a stolen session cannot lock the owner "
        "out. Passwords are never returned and the JWT keeps working: it is signed "
        "over the username, not the credential."
    ),
)
async def change_password(
    req: ChangePasswordRequest,
    current_user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta.",
        )
    if req.new_password == req.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser distinta de la actual.",
        )
    current_user.hashed_password = get_password_hash(req.new_password)
    current_user.must_change_password = False
    db.commit()
    logger.info("Password changed — user=%s", current_user.username)

    from services.audit import audit_append
    audit_append("password_change", {}, username=current_user.username)
    return {"status": "ok"}


# ── POST /auth/users/{user_id}/reset-password ──────────────────────────────── #

@router.post(
    "/users/{user_id}/reset-password",
    summary="Reset another user's password (admin)",
    description=(
        "For the clinician who forgot theirs. The admin does not need to know the "
        "old password; the event is written to the audit chain naming both parties."
    ),
)
async def reset_password(
    user_id: int,
    req: ResetPasswordRequest,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
    user.hashed_password = get_password_hash(req.new_password)
    # F1-85: el administrador conoce esta contraseña; la persona elige la suya
    # en el primer acceso.
    user.must_change_password = True
    db.commit()
    logger.info("Password reset by admin — target=%s by=%s", user.username, admin.username)

    from services.audit import audit_append
    audit_append("password_reset", {"target": user.username}, username=admin.username)
    return {"status": "ok"}
