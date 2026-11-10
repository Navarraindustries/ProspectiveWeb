"""Authentication and user management models.

Matches prospective/auth/auth_manager.py and prospective/db/models.py (User table).
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from services import avatar_config as _av

UserRole = Literal["admin", "medico", "residente", "viewer"]

Peinado = Literal[_av.PEINADOS]
ColorPelo = Literal[_av.COLORES_PELO]
Cabeza = Literal[_av.CABEZAS]
Ojos = Literal[_av.OJOS]
Pijama = Literal[_av.PIJAMAS]
Fondo = Literal[_av.FONDOS]


class AvatarConfig(BaseModel):
    """Avatar construido con piezas de listas cerradas (`services/avatar_config.py`)."""

    model_config = ConfigDict(extra="forbid")

    v: Literal[1] = 1
    piel: int = Field(..., ge=0, le=5, description="Índice en PIELES")
    peinado: Peinado
    pelo: ColorPelo
    cabeza: Cabeza
    ojos: Ojos
    mascarilla: bool
    pijama: Pijama
    fondo: Fondo


class OnboardingState(BaseModel):
    estado: Literal["pendiente", "invitado", "completado", "saltado"] = "pendiente"
    fecha: str | None = Field(None, max_length=40)
    pistas_vistas: list[Annotated[int, Field(ge=1, le=8)]] = Field(default_factory=list, max_length=8)
    pistas_activas: bool = True
    tarjeta_cerrada: bool = False

    @field_validator("pistas_vistas")
    @classmethod
    def _sin_repetir(cls, v: list[int]) -> list[int]:
        """Cada paso cuenta una vez; los repetidos se descartan en silencio."""
        return sorted(set(v))


class AvatarUpdate(BaseModel):
    config: AvatarConfig | None = None
    modo: Literal["avatar", "foto"] = "avatar"


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, description="Username or email")
    password: str = Field(..., min_length=6, description="Password (never logged)")


class LoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT bearer token — include in Authorization header")
    token_type: str = Field("bearer", description="Always 'bearer'")
    user: "UserInfo"
    expires_in: int = Field(..., description="Token lifetime in seconds")


class UserInfo(BaseModel):
    """Public user data returned after login and in /me endpoint."""

    id: int
    username: str
    full_name: str
    role: UserRole
    institution: str = Field("", description="Hospital or institution name")
    avatar_initials: str = Field(
        ..., description="Two-letter initials for the avatar widget (e.g. 'JN')"
    )
    has_photo: bool = Field(False, description="A profile photo is available at /api/auth/me/photo")
    must_change_password: bool = Field(
        False, description="La cuenta lleva la contraseña inicial: hay que cambiarla antes de seguir")
    avatar_config: AvatarConfig | None = None
    avatar_mode: Literal["avatar", "foto"] = "avatar"
    has_profile_photo: bool = Field(False, description="Hay foto de perfil propia del avatar (no la del alta)")
    profile_photo_rev: int | None = Field(
        None, description="Revisión de la foto de perfil (cambia al sustituirla); null si no hay")
    onboarding: OnboardingState = Field(default_factory=OnboardingState)


class UserCreateRequest(BaseModel):
    """Admin-only: create a new user account."""

    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=8)
    full_name: str
    role: UserRole
    institution: str = ""


class ChangePasswordRequest(BaseModel):
    """Self-service password change — the current one is required."""

    current_password: str
    new_password: str = Field(..., min_length=8)


class ResetPasswordRequest(BaseModel):
    """Admin resetting someone else's password (no current password needed)."""

    new_password: str = Field(..., min_length=8)


# ── Self-registration + admin approval ─────────────────────────────────────── #

class SignupRequest(BaseModel):
    """Public self-registration — creates a pending account for admin review."""

    username: str = Field(..., min_length=3, description="Desired username")
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")
    full_name: str = Field(..., min_length=1, description="Full professional name")

    # Optional professional profile (shown to the admin during review)
    national_id: str = Field("", description="National ID / cédula")
    professional_id: str = Field("", description="Professional licence ID")
    specialty: str = Field("", description="Medical specialty")
    university: str = Field("", description="Affiliated university")
    hospital: str = Field("", description="Hospital / centre")
    position: str = Field("", description="Role / position")
    orcid: str = Field("", description="ORCID identifier")


class SignupResponse(BaseModel):
    status: str = Field(..., description="Always 'pending' on success")
    message: str = Field(..., description="Human-readable confirmation for the UI")


class PendingUser(BaseModel):
    """One pending registration request, shown in the admin approval panel."""

    id: int
    username: str
    full_name: str
    national_id: str = ""
    professional_id: str = ""
    specialty: str = ""
    university: str = ""
    hospital: str = ""
    position: str = ""
    orcid: str = ""
    has_photo: bool = Field(False, description="A profile photo was uploaded")
    has_cv: bool = Field(False, description="A CV document was uploaded")
    created_at: str = Field(..., description="ISO-8601 timestamp of the request")


class UserBrief(BaseModel):
    """Una cuenta activa, lo justo para elegir con quién compartir un paciente.

    `/users` es solo del administrador y trae el perfil entero; para compartir,
    cualquier profesional necesita ver nombre y rol de los demás, nada más.
    """

    id: int
    username: str
    full_name: str
    role: UserRole
    avatar_config: AvatarConfig | None = None
    avatar_mode: Literal["avatar", "foto"] = "avatar"
    has_profile_photo: bool = False
    profile_photo_rev: int | None = Field(
        None, description="Revisión de la foto de perfil (cambia al sustituirla); null si no hay")


class UserAdminInfo(BaseModel):
    """Full user record for the admin user-management panel."""

    id: int
    username: str
    full_name: str
    role: UserRole
    status: str = Field("", description="active | pending | rejected")
    is_active: bool = True
    specialty: str = ""
    hospital: str = ""
    has_photo: bool = False
    avatar_config: AvatarConfig | None = None
    avatar_mode: Literal["avatar", "foto"] = "avatar"
    has_profile_photo: bool = False
    profile_photo_rev: int | None = Field(
        None, description="Revisión de la foto de perfil (cambia al sustituirla); null si no hay")
    has_cv: bool = False
    created_at: str = ""
    university: str = ""
    position: str = ""
    rejected_at: str | None = Field(None, description="ISO UTC; solo si la solicitud se rechazó")


class UserUpdate(BaseModel):
    """Admin edit of a user account."""

    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    specialty: str | None = None
    hospital: str | None = None
    university: str | None = None
    position: str | None = None
