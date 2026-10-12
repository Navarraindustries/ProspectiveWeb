"""Tamper-evident audit trail (SkullChain) router."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from models.audit import AuditAppendRequest, AuditBlock, AuditVerifyResult
from services.audit import SkullChain, ACT_INTEGRITY_CHECK
from services.auth_service import require_admin
from services.db_models import User

logger = logging.getLogger(__name__)
# Solo el administrador: el router estaba montado con `require_user`, así que
# un Médico leía, exportaba y verificaba la cadena entera (con los eventos de
# los pacientes de todos) y podía escribir en ella.
router = APIRouter(prefix="/api/audit", tags=["audit"], dependencies=[Depends(require_admin)])


@router.post(
    "",
    summary="Append an event to the audit chain",
    description=(
        "Administrators only. The block is signed with the username of the "
        "authenticated administrator; the `username` field of the body is ignored."
    ),
)
async def append_event(req: AuditAppendRequest,
                       admin: Annotated[User, Depends(require_admin)]) -> dict:
    # Antes firmaba con el `username` que mandara el cuerpo: cualquiera podía
    # dejar en la cadena un evento a nombre de otro. Ahora firma quien llama.
    block_hash = SkullChain.instance().append(
        req.action, req.payload, admin.username, req.patient_id, req.patient_dob,
    )
    return {"block_hash": block_hash}


@router.get(
    "/blocks",
    response_model=list[AuditBlock],
    summary="List all audit-trail blocks",
    description="Returns every block of the tamper-evident SkullChain audit trail, oldest first.",
)
async def list_blocks() -> list[AuditBlock]:
    return [AuditBlock(**b) for b in SkullChain.instance().get_all_blocks()]


@router.get(
    "/verify",
    response_model=AuditVerifyResult,
    summary="Verify the integrity of the audit chain",
    description=(
        "Recomputes every block hash and checks the prev-hash linkage. Any "
        "tampering with a block invalidates it and all following blocks."
    ),
)
async def verify_chain() -> AuditVerifyResult:
    chain = SkullChain.instance()
    ok, broken = chain.verify_integrity()
    # Record that a verification was run (does not affect the result reported).
    chain.append(ACT_INTEGRITY_CHECK, {"ok": ok, "broken": len(broken)})
    return AuditVerifyResult(ok=ok, total_blocks=len(chain.get_all_blocks()), broken=broken)


@router.get("/export", response_class=PlainTextResponse, summary="Export the audit trail as text")
async def export_txt() -> str:
    return SkullChain.instance().export_txt()
