"""Requesting a clip: the form, the workshops it goes to, and what comes back.

Separate from `clips.py` for the same reason `clip_library.py` is: that router
plans clips inside one session, this one keeps a register shared by every
session and every user, and outlives all of them.

The shape of the form
---------------------
`GET /clip-orders/prefill/{session}` answers most of it. The system already
knows the series, the bend, the jaw, the tolerances and the force band, so the
user is asked only what it cannot know: who answers for the piece, how many,
by when, and where it goes. Anything computed that the user changes needs a
reason, and the reason is printed in our copy of the dossier.

What leaves the building
------------------------
`GET /clip-orders/{part_no}/packet` is a ZIP with the STL and the workshop
dossier — and nothing else. No patient name, no case, no session. The packet is
downloaded and sent by a person; this application does not mail anything on its
own.
"""
from __future__ import annotations

import logging
import zipfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from services import clip_orders as store
from services.audit import audit_append
from services.auth_service import require_admin, require_user
from services.db_models import User
from services.sessions import session_exists

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["clip-orders"])

CurrentUser = Annotated[User, Depends(require_user)]


# ── Schemas ────────────────────────────────────────────────────────────────── #

class WorkshopIn(BaseModel):
    """A workshop, typed once and reused by every later order."""

    name: str = Field(..., min_length=1, max_length=160)
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    tax_id: str = ""
    notes: str = ""


class WorkshopOut(WorkshopIn):
    id: str
    created_at: float = 0.0
    last_used_at: float = 0.0
    order_count: int = 0


class OrderIn(BaseModel):
    """The form. Everything the system cannot work out on its own."""

    case_id: int | None = None
    # The piece. Pre-filled from the recommendation; changing it needs a reason.
    series: str = ""
    angle_deg: float = Field(0.0, ge=0.0, le=90.0)
    jaw_mm: float = Field(..., gt=0.0, le=40.0, description="Useful grip length (mm)")
    quantity: int = Field(1, ge=1, le=20)
    extra_sizes_mm: list[float] = Field(
        default_factory=list,
        description="Adjacent jaw sizes to order as spares — the neck is an estimate",
    )
    override_reason: str = Field(
        "", description="Required when the piece differs from what was advised")

    # Why, when, how it arrives.
    intended_use: str = Field("implante", description="implante | prototipo | inventario")
    needed_by: str = ""
    urgency: str = Field("programada", description="programada | preferente")
    steriliser: str = Field("hospital", description="hospital | taller")
    marking: str = Field("cuerpo", description="cuerpo | ninguno")
    notes: str = ""
    authorization_ref: str = ""

    # Where it goes. Either an existing workshop or a new one, saved for reuse.
    workshop_id: str = ""
    new_workshop: WorkshopIn | None = None

    # Who answers for it.
    surgeon: str = ""
    sign: bool = False

    # Declarations. Never pre-ticked by the UI.
    accepts_measurements: bool = False
    accepts_force_is_target: bool = False
    accepts_not_approved_device: bool = False


class ReceptionIn(BaseModel):
    """The piece that actually arrived, measured."""

    measured_jaw_mm: float = Field(..., gt=0.0, le=60.0)
    measured_force_g: float = Field(..., gt=0.0, le=1000.0)
    notes: str = ""


class StatusIn(BaseModel):
    status: str = Field(..., description="borrador | firmado | enviado | en_fabricacion | recibida")


class VerifyIn(BaseModel):
    accept_deviation_reason: str = Field(
        "", description="Required when the measured piece is out of specification")


class RejectIn(BaseModel):
    reason: str = Field(..., min_length=1)


class OrderOut(BaseModel):
    part_no: str
    status: str
    status_label: str
    created_at: float
    updated_at: float
    session_id: str = ""
    case_id: int | None = None
    patient: str = ""
    patient_id: int | None = None
    case_label: str = ""
    requested_by: str = ""
    requested_by_name: str = ""
    surgeon: str = ""
    signed_at: float = 0.0
    institution: str = ""
    series: str = ""
    angle_deg: float = 0.0
    jaw_mm: float = 0.0
    is_drawn_size: bool = False
    quantity: int = 1
    extra_sizes_mm: list[float] = []
    total_pieces: int = 1
    intended_use: str = ""
    needed_by: str = ""
    urgency: str = ""
    steriliser: str = ""
    marking: str = ""
    notes: str = ""
    authorization_ref: str = ""
    workshop_id: str = ""
    workshop_name: str = ""
    advised_label: str = ""
    override_reason: str = ""
    spec_snapshot: dict = {}
    reception: dict = {}
    next_states: list[str] = []
    files: dict = {}


class PrefillOut(BaseModel):
    """What the form starts with, so nothing measured has to be retyped."""

    session_id: str
    can_order: bool = Field(..., description="False when the family cannot build this shape")
    reason: str = Field("", description="Why not, when can_order is false")
    # What the system advises.
    advised_series: str = ""
    advised_angle_deg: float = 0.0
    advised_jaw_mm: float = 0.0
    advised_label: str = ""
    advised_shape: str = ""
    is_drawn_size: bool = False
    outside_drawn_range: bool = False
    commercial_name: str = ""
    # The case it comes from, read-only in the form.
    neck_mm: float = 0.0
    neck_source: str = ""
    dome_height_mm: float = 0.0
    max_diameter_mm: float = 0.0
    parent_artery_mm: float = 0.0
    region: str = ""
    caveats: list[str] = []
    # Spare sizes worth ordering, and why.
    suggested_extra_sizes_mm: list[float] = []
    suggest_extra_sizes: bool = False
    extra_sizes_reason: str = ""
    # Fixed properties of the family.
    stock_sizes_mm: list[int] = []
    force_band_g: list[float] = []
    max_tip_opening_mm: float = 0.0
    material: str = ""
    tolerance_jaw_mm: float = 0.0
    tolerance_other_mm: float = 0.0
    # Who is filling it in.
    requester_name: str = ""
    can_sign: bool = False
    institution: str = ""
    patient: str = ""
    case_label: str = ""
    workshops: list[WorkshopOut] = []


# ── Helpers ────────────────────────────────────────────────────────────────── #

def _shape_for_angle(angle_deg: float):
    """The shape class an angled NAVARRO design belongs to.

    Same cut as `clip_manufacture.family_shapes`, which reads the shapes off the
    disk: below 67.5° the design behaves as a 45° angled clip, above it as a
    90° one.
    """
    from services.clips import ClipShape

    if angle_deg <= 0.0:
        return ClipShape.STRAIGHT
    return ClipShape.ANGLED_45 if angle_deg < 67.5 else ClipShape.ANGLED


def _advice(session_id: str, case_id: int | None):
    """(case, advised spec, advised PerfectClip) for this session."""
    from routers.clips import _run_selection
    from services.clip_manufacture import resolve_perfect_clip
    from services.clip_selection import derive_manufacture_spec

    selection = _run_selection(session_id, case_id, verify=False)
    case = selection.case
    spec = selection.manufacture or derive_manufacture_spec(case, [])
    return case, spec, resolve_perfect_clip(case, spec), selection.caveats


def _ordered_piece(case, advised_spec, *, angle_deg: float, jaw_mm: float,
                   override_reason: str):
    """The PerfectClip actually being ordered, which need not be the advised one.

    A surgeon may order a bend or a jaw the recommender did not propose. That is
    allowed — it is their call — but the piece is then built from what THEY
    asked for, and the reason travels with the order into our copy of the
    dossier. Silently shipping the advised geometry under an overridden label
    would be the worst of both.
    """
    from dataclasses import replace

    from services.clip_manufacture import PerfectClip
    from services.navarro import nearest_variant

    shape = _shape_for_angle(angle_deg)
    notes = list(advised_spec.confidence_notes)
    changed = (abs(jaw_mm - advised_spec.blade_length_mm) > 1e-6
               or abs(angle_deg - advised_spec.angle_deg) > 1e-6)
    if changed and override_reason:
        notes.append(
            f"Pieza modificada respecto a lo recomendado "
            f"({advised_spec.blade_length_mm:.1f} mm · {advised_spec.angle_deg:.0f}°): "
            f"{override_reason}"
        )
    if store.outside_drawn_range(jaw_mm):
        notes.append(
            f"La mordaza de {jaw_mm:.1f} mm queda FUERA del rango dibujado: el perfil "
            f"se extiende más allá de cualquier talla diseñada, no se interpola entre "
            f"dos. Confirmar con el diseñador antes de mecanizar."
        )
    spec = replace(advised_spec, blade_length_mm=float(jaw_mm), angle_deg=float(angle_deg),
                   shape=shape, confidence_notes=notes)

    src = nearest_variant(angle_deg, jaw_mm)
    if src is None:
        raise HTTPException(status_code=409,
                            detail="No hay ningún diseño NAVARRO™ del que partir para esa pieza.")
    drawn = abs(src.jaw_mm - jaw_mm) < 1e-6
    shape_txt = "Recto" if src.angle_deg == 0 else f"Angulado {src.angle_deg:.0f}°"
    return PerfectClip(
        source="navarro", spec=spec,
        label=f"NAVARRO™ {src.series} {shape_txt}, mordaza {jaw_mm:.1f} mm",
        navarro_series=src.series, navarro_angle_deg=float(src.angle_deg),
        navarro_jaw_mm=float(jaw_mm), navarro_is_drawn_size=drawn,
    )


def _rebuild_piece(order: store.ClipOrder):
    """The ordered piece, from the order's OWN frozen snapshot.

    Never from the live session: re-running morphometry must not change the
    paperwork of an order that has already gone out.
    """
    from services.clip_manufacture import PerfectClip
    from services.clip_selection import ClipCase, ManufactureSpec
    from services.clips import ClipShape

    snap = dict(order.spec_snapshot)
    snap["shape"] = ClipShape(snap["shape"]) if snap.get("shape") else ClipShape.STRAIGHT
    spec = ManufactureSpec(**{k: v for k, v in snap.items()
                              if k in ManufactureSpec.__annotations__})
    case = ClipCase(**{k: v for k, v in order.case_snapshot.items()
                       if k in ClipCase.__annotations__})
    shape_txt = "Recto" if order.angle_deg == 0 else f"Angulado {order.angle_deg:.0f}°"
    piece = PerfectClip(
        source="navarro", spec=spec,
        label=f"NAVARRO™ {order.series} {shape_txt}, mordaza {order.jaw_mm:.1f} mm",
        navarro_series=order.series, navarro_angle_deg=order.angle_deg,
        navarro_jaw_mm=order.jaw_mm, navarro_is_drawn_size=order.is_drawn_size,
    )
    return case, piece


def _build_paperwork(order: store.ClipOrder) -> dict:
    """STL, both dossiers and the workshop ZIP, in the order's own directory."""
    from services.clip_dossier import render_dossier
    from services.clip_manufacture import external_dossier, internal_dossier
    from services.devices import write_stl
    from services.navarro import build_jaw
    from services.scene_render import render_clip_views

    case, piece = _rebuild_piece(order)
    out = store.order_dir(order.part_no)
    files: dict[str, str] = {}

    mesh, _src, _exact = build_jaw(order.angle_deg, order.jaw_mm)
    write_stl(mesh, out / "clip.stl")
    files["stl"] = "clip.stl"

    try:
        views = render_clip_views(mesh)
    except Exception as exc:  # noqa: BLE001 — a dossier without pictures still works
        logger.warning("Order %s: clip views failed (%s)", order.part_no, exc)
        views = {}

    render_dossier(
        internal_dossier(piece, case, part_no=order.part_no, patient=order.patient,
                         case_label=order.case_label, session_id=order.session_id,
                         order=order),
        out / "dossier_interno.pdf", images=views)
    files["dossier_internal"] = "dossier_interno.pdf"

    render_dossier(external_dossier(piece, part_no=order.part_no, order=order),
                   out / "dossier_taller.pdf", images=views)
    files["dossier_workshop"] = "dossier_taller.pdf"

    # The packet a person sends. Only the two files a workshop needs, so nothing
    # identifiable can ride along by accident.
    zip_path = out / f"paquete_{order.part_no}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(out / "clip.stl", f"{order.part_no}_clip.stl")
        z.write(out / "dossier_taller.pdf", f"{order.part_no}_especificacion.pdf")
    files["packet"] = zip_path.name
    return files


def _out(order: store.ClipOrder) -> OrderOut:
    return OrderOut(
        part_no=order.part_no, status=order.status,
        status_label=store.STATUS_LABELS.get(order.status, order.status),
        created_at=order.created_at, updated_at=order.updated_at,
        session_id=order.session_id, case_id=order.case_id,
        patient=order.patient, patient_id=order.patient_id,
        case_label=order.case_label,
        requested_by=order.requested_by, requested_by_name=order.requested_by_name,
        surgeon=order.surgeon, signed_at=order.signed_at, institution=order.institution,
        series=order.series, angle_deg=order.angle_deg, jaw_mm=order.jaw_mm,
        is_drawn_size=order.is_drawn_size, quantity=order.quantity,
        extra_sizes_mm=order.extra_sizes_mm, total_pieces=order.total_pieces,
        intended_use=order.intended_use, needed_by=order.needed_by, urgency=order.urgency,
        steriliser=order.steriliser, marking=order.marking, notes=order.notes,
        authorization_ref=order.authorization_ref,
        workshop_id=order.workshop_id, workshop_name=order.workshop.get("name", ""),
        advised_label=order.advised_label, override_reason=order.override_reason,
        spec_snapshot=order.spec_snapshot, reception=order.reception,
        next_states=list(store.TRANSITIONS.get(order.status, ())),
        files=order.files,
    )


def _patient_id_for(session_id: str, case_id: int | None) -> int | None:
    """Which patient this order is for. None when the case is not registered."""
    from services.database import SessionLocal
    from services.db_models import PlanningSession, Study

    db = SessionLocal()
    try:
        study = db.get(Study, int(case_id)) if case_id else None
        if study is None:
            ps = (db.query(PlanningSession)
                    .filter(PlanningSession.session_id == session_id)
                    .order_by(PlanningSession.id.desc()).first())
            if ps is not None and ps.study_id:
                study = db.get(Study, ps.study_id)
        return int(study.patient_id) if study is not None and study.patient_id else None
    except Exception as exc:  # noqa: BLE001 — an order must not fail on a DB hiccup
        logger.warning("Patient lookup failed for %s: %s", session_id, exc)
        return None
    finally:
        db.close()


def _need(part_no: str) -> store.ClipOrder:
    order = store.get_order(part_no)
    if order is None:
        raise HTTPException(status_code=404, detail=f"No existe el pedido {part_no}.")
    return order


# ── Workshops ──────────────────────────────────────────────────────────────── #

@router.get(
    "/clip-orders/workshops",
    response_model=list[WorkshopOut],
    summary="Workshops on file, most recently used first",
    description=(
        "Typed once and reused. Orders copy these fields at signing time, so "
        "correcting an address here never rewrites where a past order was sent."
    ),
)
async def workshops(_user: CurrentUser) -> list[WorkshopOut]:
    from dataclasses import asdict

    return [WorkshopOut(**asdict(w)) for w in store.list_workshops()]


@router.post(
    "/clip-orders/workshops",
    response_model=WorkshopOut,
    summary="Register a workshop for reuse",
)
async def add_workshop(req: WorkshopIn, user: CurrentUser) -> WorkshopOut:
    from dataclasses import asdict

    try:
        w = store.add_workshop(**req.model_dump())
    except store.OrderError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit_append("clip_workshop_added", {"workshop": w.name}, username=user.username)
    return WorkshopOut(**asdict(w))


@router.put(
    "/clip-orders/workshops/{workshop_id}",
    response_model=WorkshopOut,
    summary="Correct a workshop's details",
)
async def edit_workshop(workshop_id: str, req: WorkshopIn, _user: CurrentUser) -> WorkshopOut:
    from dataclasses import asdict

    try:
        return WorkshopOut(**asdict(store.update_workshop(workshop_id, **req.model_dump())))
    except store.OrderError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete(
    "/clip-orders/workshops/{workshop_id}",
    summary="Remove a workshop (admin) — past orders keep their own copy",
)
async def remove_workshop(workshop_id: str, _admin: Annotated[User, Depends(require_admin)]) -> dict:
    if not store.delete_workshop(workshop_id):
        raise HTTPException(status_code=404, detail="Taller no encontrado.")
    return {"deleted": True}


# ── The form ───────────────────────────────────────────────────────────────── #

@router.get(
    "/clip-orders/prefill/{session_id}",
    response_model=PrefillOut,
    summary="What the request form starts with for this case",
    description=(
        "Everything the system already knows: the advised series, bend and jaw, the "
        "measurements they came from, the family's fixed properties, and the "
        "workshops on file. The form asks the user only for what none of this can "
        "answer.\n\n"
        "`suggest_extra_sizes` is true when the neck was ESTIMATED rather than "
        "measured off a marked rim: the jaw is only as certain as the neck it was "
        "derived from, so the adjacent drawn sizes are worth having in theatre."
    ),
)
async def prefill(session_id: str, user: CurrentUser,
                  case_id: int | None = Query(None)) -> PrefillOut:
    from dataclasses import asdict

    from services.clip_manufacture import MATERIAL, TOL_JAW_MM, TOL_OTHER_MM
    from services.clip_animation import MAX_TIP_OPENING_MM
    from services.navarro import (CLOSING_FORCE_MAX_G, CLOSING_FORCE_MIN_G,
                                  STOCK_JAW_MM)

    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    case, spec, piece, caveats = _advice(session_id, case_id)
    from routers.clips import _case_identity
    patient, case_label = _case_identity(session_id, case_id)

    jaw = piece.navarro_jaw_mm or spec.blade_length_mm
    neighbours = sorted(STOCK_JAW_MM, key=lambda s: abs(s - jaw))[1:3]
    estimated = case.neck_source not in ("rim",)

    return PrefillOut(
        session_id=session_id,
        can_order=piece.source == "navarro",
        reason=piece.fallback_reason if piece.source != "navarro" else "",
        advised_series=piece.navarro_series,
        advised_angle_deg=piece.navarro_angle_deg,
        advised_jaw_mm=jaw,
        advised_label=piece.label,
        advised_shape=spec.shape.value,
        is_drawn_size=piece.navarro_is_drawn_size,
        outside_drawn_range=store.outside_drawn_range(jaw),
        commercial_name=piece.commercial_name,
        neck_mm=case.neck_mm, neck_source=case.neck_source,
        dome_height_mm=case.dome_height_mm, max_diameter_mm=case.max_diameter_mm,
        parent_artery_mm=case.parent_artery_mm, region=case.region,
        caveats=list(caveats),
        suggested_extra_sizes_mm=[float(x) for x in sorted(neighbours)],
        suggest_extra_sizes=estimated,
        extra_sizes_reason=(
            "El cuello está ESTIMADO a partir del saco, no medido sobre un borde "
            "marcado a mano: la mordaza hereda esa incertidumbre y conviene tener "
            "las tallas contiguas en quirófano."
            if estimated else
            "El cuello se midió sobre el borde marcado, así que la talla elegida es "
            "la más fiable que puede darse; las contiguas son opcionales."
        ),
        stock_sizes_mm=list(STOCK_JAW_MM),
        force_band_g=[CLOSING_FORCE_MIN_G, CLOSING_FORCE_MAX_G],
        max_tip_opening_mm=MAX_TIP_OPENING_MM,
        material=MATERIAL, tolerance_jaw_mm=TOL_JAW_MM, tolerance_other_mm=TOL_OTHER_MM,
        requester_name=user.full_name or user.username,
        can_sign=user.role in store.SIGNING_ROLES,
        institution=user.hospital or user.institution or "",
        patient=patient, case_label=case_label,
        workshops=[WorkshopOut(**asdict(w)) for w in store.list_workshops()],
    )


@router.post(
    "/clip-orders/{session_id}",
    response_model=OrderOut,
    status_code=201,
    summary="Request a clip — draft, or signed and ready to send",
    description=(
        "Records the request and freezes what was ordered. Signing needs a "
        "responsible surgeon, the `medico` or `admin` role, and the three "
        "declarations accepted; a resident can prepare the draft.\n\n"
        "Signing also builds the paperwork into the order's own directory: the "
        "STL, our copy of the dossier, the workshop's copy, and the ZIP to send. "
        "The dimensions are copied into the order, so re-running morphometry "
        "afterwards cannot change what was ordered."
    ),
)
async def create_order(session_id: str, req: OrderIn, user: CurrentUser) -> OrderOut:
    from dataclasses import asdict

    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    case, advised, advised_piece, _caveats = _advice(session_id, req.case_id)
    # A caller that names neither the series nor a bend is asking for the advised
    # piece; one that names either is ordering exactly what it says, including a
    # deliberate 0° when the advice was angled.
    angle = req.angle_deg if (req.series or req.angle_deg) else advised_piece.navarro_angle_deg
    jaw = req.jaw_mm

    problems = store.validate_request(
        jaw_mm=jaw, angle_deg=angle, quantity=req.quantity,
        intended_use=req.intended_use, urgency=req.urgency,
        steriliser=req.steriliser, marking=req.marking,
        sign=req.sign, surgeon=req.surgeon, role=user.role,
        accepts_measurements=req.accepts_measurements,
        accepts_force_is_target=req.accepts_force_is_target,
        accepts_not_approved_device=req.accepts_not_approved_device,
    )
    differs = (abs(jaw - advised.blade_length_mm) > 1e-6
               or abs(angle - advised.angle_deg) > 1e-6)
    if differs and not req.override_reason.strip():
        problems.append(
            f"La pieza pedida ({jaw:.1f} mm · {angle:.0f}°) no es la recomendada "
            f"({advised.blade_length_mm:.1f} mm · {advised.angle_deg:.0f}°). "
            f"Hay que decir por qué; el motivo queda en nuestra copia del dossier."
        )
    if problems:
        raise HTTPException(status_code=422, detail=problems)

    # The workshop: an existing one, or a new one saved now for reuse.
    workshop = None
    if req.new_workshop is not None:
        try:
            workshop = store.add_workshop(**req.new_workshop.model_dump())
        except store.OrderError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
    elif req.workshop_id:
        workshop = store.get_workshop(req.workshop_id)
        if workshop is None:
            raise HTTPException(status_code=404, detail="Taller no encontrado.")
    if req.sign and workshop is None:
        raise HTTPException(status_code=422,
                            detail=["Un pedido firmado necesita un taller destinatario."])

    piece = _ordered_piece(case, advised, angle_deg=angle, jaw_mm=jaw,
                           override_reason=req.override_reason.strip())
    from routers.clips import _case_identity
    patient, case_label = _case_identity(session_id, req.case_id)

    snap = asdict(piece.spec)
    snap["shape"] = piece.spec.shape.value

    order = store.create_order(
        session_id=session_id, case_id=req.case_id, patient=patient, case_label=case_label,
        requested_by=user.username, requested_by_name=user.full_name or user.username,
        institution=user.hospital or user.institution or "",
        series=piece.navarro_series, angle_deg=piece.navarro_angle_deg,
        jaw_mm=piece.navarro_jaw_mm, is_drawn_size=piece.navarro_is_drawn_size,
        quantity=req.quantity, extra_sizes_mm=req.extra_sizes_mm,
        intended_use=req.intended_use, needed_by=req.needed_by, urgency=req.urgency,
        steriliser=req.steriliser, marking=req.marking, notes=req.notes,
        authorization_ref=req.authorization_ref, workshop=workshop,
        accepts_measurements=req.accepts_measurements,
        accepts_force_is_target=req.accepts_force_is_target,
        accepts_not_approved_device=req.accepts_not_approved_device,
        patient_id=_patient_id_for(session_id, req.case_id),
        spec_snapshot=snap, case_snapshot=asdict(case),
        advised_label=advised_piece.label, override_reason=req.override_reason.strip(),
        surgeon=req.surgeon, sign=req.sign,
    )

    if req.sign:
        try:
            order.files = _build_paperwork(order)
            store.persist(order)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Order %s: paperwork failed", order.part_no)
            raise HTTPException(status_code=500,
                                detail=f"No se pudo generar la documentación: {exc}")

    audit_append("clip_order_created",
                 {"part_no": order.part_no, "status": order.status,
                  "jaw_mm": order.jaw_mm, "quantity": order.total_pieces,
                  "intended_use": order.intended_use,
                  "workshop": order.workshop.get("name", "")},
                 username=user.username)
    return _out(order)


# ── The register ───────────────────────────────────────────────────────────── #

@router.get(
    "/clip-orders/summary",
    summary="How many orders sit in each state",
    description="For the register's header. Every state is present, zeroes included, "
                "so the row does not jump around as orders move.",
)
async def summary(_user: CurrentUser) -> dict:
    return {"counts": store.status_counts(), "labels": store.STATUS_LABELS}


@router.get(
    "/clip-orders",
    response_model=list[OrderOut],
    summary="Every clip order, newest first",
    description=(
        "The register. Filter by state, by patient, by the session that raised it, "
        "or search `q` across the part number, patient, case, surgeon and workshop "
        "— the things somebody has in hand when they come asking about a piece."
    ),
)
async def list_orders(
    _user: CurrentUser,
    status: str | None = Query(None, description="Filter by status"),
    session_id: str = Query("", description="Only orders raised from this session"),
    patient_id: int | None = Query(None, description="Only orders for this patient"),
    q: str = Query("", description="Free text over part number, patient, case, surgeon, workshop"),
    open_only: bool = Query(False, description="Hide verified and rejected orders"),
) -> list[OrderOut]:
    return [_out(o) for o in store.list_orders(status=status, session_id=session_id,
                                               patient_id=patient_id, q=q,
                                               open_only=open_only)]


@router.get("/clip-orders/{part_no}", response_model=OrderOut, summary="One order")
async def get_order(part_no: str, _user: CurrentUser) -> OrderOut:
    return _out(_need(part_no))


@router.post(
    "/clip-orders/{part_no}/status",
    response_model=OrderOut,
    summary="Advance an order through the workflow",
    description=(
        "borrador → firmado → enviado → en fabricación → recibida → verificada. "
        "A jump the workflow does not allow is refused with the states that are."
    ),
)
async def advance(part_no: str, req: StatusIn, user: CurrentUser) -> OrderOut:
    order = _need(part_no)
    if req.status == store.SIGNED and user.role not in store.SIGNING_ROLES:
        raise HTTPException(status_code=403,
                            detail="Solo un médico responsable puede firmar un pedido.")
    try:
        order = store.set_status(part_no, req.status, by=user.username)
    except store.OrderError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if req.status == store.SIGNED and not order.files:
        try:
            order.files = _build_paperwork(order)
            store.persist(order)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Order %s: paperwork failed", part_no)
            raise HTTPException(status_code=500, detail=f"No se pudo generar la documentación: {exc}")
    audit_append("clip_order_status", {"part_no": part_no, "status": req.status},
                 username=user.username)
    return _out(order)


@router.post(
    "/clip-orders/{part_no}/reception",
    response_model=OrderOut,
    summary="Record the piece that arrived, measured",
    description=(
        "The measured closing force is mandatory. Until it exists the force is a "
        "target the model cannot confirm — it comes from the spring, the alloy and "
        "the heat treatment, none of which an STL carries."
    ),
)
async def receive(part_no: str, req: ReceptionIn, user: CurrentUser) -> OrderOut:
    try:
        order = store.receive(part_no, measured_jaw_mm=req.measured_jaw_mm,
                              measured_force_g=req.measured_force_g,
                              by=user.username, notes=req.notes)
    except store.OrderError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit_append("clip_order_received",
                 {"part_no": part_no, "jaw_mm": req.measured_jaw_mm,
                  "force_g": req.measured_force_g,
                  "within_spec": order.reception.get("jaw_within_tolerance")
                                 and order.reception.get("force_within_band")},
                 username=user.username)
    return _out(order)


@router.post(
    "/clip-orders/{part_no}/verify",
    response_model=OrderOut,
    summary="Accept the received piece",
    description=(
        "A piece measured outside the jaw tolerance or the force band cannot be "
        "accepted in silence: either it is rejected, or the deviation is justified "
        "in writing and that justification stays with the order."
    ),
)
async def verify(part_no: str, req: VerifyIn, user: CurrentUser) -> OrderOut:
    try:
        order = store.verify(part_no, by=user.username,
                             accept_deviation_reason=req.accept_deviation_reason)
    except store.OrderError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit_append("clip_order_verified",
                 {"part_no": part_no,
                  "deviation": req.accept_deviation_reason or ""},
                 username=user.username)
    return _out(order)


@router.post("/clip-orders/{part_no}/reject", response_model=OrderOut,
             summary="Reject the received piece, with a reason")
async def reject(part_no: str, req: RejectIn, user: CurrentUser) -> OrderOut:
    try:
        order = store.reject(part_no, reason=req.reason, by=user.username)
    except store.OrderError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit_append("clip_order_rejected", {"part_no": part_no, "reason": req.reason},
                 username=user.username)
    return _out(order)


@router.delete("/clip-orders/{part_no}", summary="Delete a DRAFT (a signed order is a record)")
async def delete_order(part_no: str, user: CurrentUser) -> dict:
    try:
        if not store.delete_order(part_no):
            raise HTTPException(status_code=404, detail=f"No existe el pedido {part_no}.")
    except store.OrderError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit_append("clip_order_deleted", {"part_no": part_no}, username=user.username)
    return {"deleted": True}


# ── Files ──────────────────────────────────────────────────────────────────── #

_SERVED = {
    "stl": ("clip.stl", "model/stl"),
    "dossier_internal": ("dossier_interno.pdf", "application/pdf"),
    "dossier_workshop": ("dossier_taller.pdf", "application/pdf"),
}


@router.get(
    "/clip-orders/{part_no}/files/{what}",
    summary="Download one of an order's documents",
    description="`stl` · `dossier_internal` · `dossier_workshop`. Authenticated: the "
                "order directory is private, outside the public static mount.",
)
async def order_file(part_no: str, what: str, _user: CurrentUser) -> FileResponse:
    order = _need(part_no)
    entry = _SERVED.get(what)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Documento «{what}» no reconocido.")
    name, media = entry
    path = Path(store.order_dir(order.part_no)) / name
    if not path.exists():
        raise HTTPException(status_code=409,
                            detail="El pedido todavía no tiene documentación: fírmalo primero.")
    return FileResponse(path, media_type=media, filename=f"{order.part_no}_{name}")


@router.get(
    "/clip-orders/{part_no}/packet",
    summary="The ZIP to send to the workshop — STL and specification, nothing else",
    description=(
        "Contains the STL and the workshop's copy of the dossier. No patient name, "
        "no case, no session: the part number is the only thread back. Downloaded "
        "and sent by a person — this application does not mail anything itself."
    ),
)
async def packet(part_no: str, user: CurrentUser) -> FileResponse:
    order = _need(part_no)
    path = Path(store.order_dir(order.part_no)) / f"paquete_{order.part_no}.zip"
    if not path.exists():
        raise HTTPException(status_code=409,
                            detail="El pedido todavía no tiene paquete: fírmalo primero.")
    audit_append("clip_order_packet_downloaded", {"part_no": part_no}, username=user.username)
    return FileResponse(path, media_type="application/zip",
                        filename=f"{order.part_no}_paquete_taller.zip")
