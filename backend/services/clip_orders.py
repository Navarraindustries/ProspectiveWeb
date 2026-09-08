"""Clip orders: the request a surgeon signs, and the workshops it goes to.

Two stores, one root, because they are one workflow. Both are global and
persistent — outside `data/`, alongside `clip_library/` — for the same reason
the clip library is: an order has to be findable years later, and planning
sessions are purged.

What an order is
----------------
A **frozen** record. The dimensions are copied into it when it is signed, not
looked up when it is read. Re-running morphometry afterwards changes what the
system would recommend TODAY; it must not change what was ordered and sent to a
workshop, or the paperwork stops matching the piece in the box.

Why the numbering changed
-------------------------
The part number used to be derived from the session and the jaw length
(`PR-{session}-{jaw×10}`). Two clips ordered from the same session with the same
jaw and different bend angles got the SAME number — and the part number is the
only thread between our copy and the workshop's. Orders now take a correlative
`PR-YYYY-NNNN`, and the derived identifier is kept only as a cross-reference.

For the same reason each order owns a directory. The old files had fixed names
per session, so a second order overwrote the first one's STL and dossiers.

What the form may not decide
----------------------------
The closing force. It comes from the spring, the alloy and the heat treatment,
so it is ordered as a target and only becomes a fact when someone measures the
finished part — which is why `receive()` demands the measured value and
`verify()` refuses to accept a piece outside the band without a stated reason.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

#: Private store: an order carries patient identity and institutional geometry.
#: Never under the public `data/` mount.
ORDERS_ROOT = Path(
    os.environ.get("CLIP_ORDERS_ROOT", "")
    or (Path(__file__).resolve().parents[1] / "clip_orders")
)
_WORKSHOPS_FILE = "workshops.json"
_ORDERS_FILE = "orders.json"

#: Numbering and manifest writes are serialised in-process. A multi-worker
#: deployment would need a real cross-process lock; single worker is what this
#: application runs today.
_LOCK = threading.RLock()

# ── Status flow ────────────────────────────────────────────────────────────── #

DRAFT = "borrador"
SIGNED = "firmado"
SENT = "enviado"
PRODUCTION = "en_fabricacion"
RECEIVED = "recibida"
VERIFIED = "verificada"
REJECTED = "rechazada"

#: A piece sometimes turns up without anyone having announced production, so
#: `enviado` reaches `recibida` directly as well.
TRANSITIONS: dict[str, tuple[str, ...]] = {
    DRAFT:      (SIGNED,),
    SIGNED:     (SENT, DRAFT),
    SENT:       (PRODUCTION, RECEIVED),
    PRODUCTION: (RECEIVED,),
    RECEIVED:   (VERIFIED, REJECTED),
    VERIFIED:   (),
    REJECTED:   (),
}

STATUS_LABELS: dict[str, str] = {
    DRAFT: "Borrador", SIGNED: "Firmado", SENT: "Enviado al taller",
    PRODUCTION: "En fabricación", RECEIVED: "Recibida",
    VERIFIED: "Verificada", REJECTED: "Rechazada",
}

#: Only these roles may sign an order. A resident prepares it; the responsible
#: surgeon signs it, because signing is what puts a piece into a patient.
SIGNING_ROLES = ("medico", "admin")

#: What the order is for. `implante` is the one that changes the paperwork.
INTENDED_USES = ("implante", "prototipo", "inventario")
URGENCIES = ("programada", "preferente")

#: Assumed defaults, stated rather than hidden (see `sterilisation_notes`).
#: A machine shop rarely delivers sterile and titanium takes steam, so the
#: hospital sterilises unless someone says otherwise.
STERILISERS = ("hospital", "taller")
DEFAULT_STERILISER = "hospital"
#: The part number engraved on the BODY. Not on the jaw (it is the dimension
#: measured against the neck) and not on the spring (a mark there is a stress
#: raiser on the part that produces the closing force).
MARKINGS = ("cuerpo", "ninguno")
DEFAULT_MARKING = "cuerpo"


class OrderError(ValueError):
    """Something about the request itself is wrong. Carries a message for the UI."""


# ── Workshops ──────────────────────────────────────────────────────────────── #

@dataclass
class Workshop:
    """A workshop the institution orders from.

    Typed once and reused: the next order picks it from a list. Orders copy
    these fields at signing time, so changing an address here never rewrites
    where a past order was actually sent.
    """
    id: str
    name: str
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    tax_id: str = ""
    notes: str = ""
    created_at: float = field(default_factory=time.time)
    last_used_at: float = 0.0
    order_count: int = 0


def _path(name: str) -> Path:
    ORDERS_ROOT.mkdir(parents=True, exist_ok=True)
    return ORDERS_ROOT / name


def _read(name: str) -> list[dict]:
    p = _path(name)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("%s unreadable (%s); treating as empty", name, exc)
        return []


def _write(name: str, entries: list[dict]) -> None:
    tmp = _path(name).with_suffix(".tmp")
    tmp.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, _path(name))


def list_workshops() -> list[Workshop]:
    """Every workshop on file, most recently used first."""
    out = [Workshop(**e) for e in _read(_WORKSHOPS_FILE) if isinstance(e, dict)]
    out.sort(key=lambda w: (w.last_used_at or w.created_at), reverse=True)
    return out


def get_workshop(workshop_id: str) -> Workshop | None:
    return next((w for w in list_workshops() if w.id == workshop_id), None)


def add_workshop(name: str, **fields) -> Workshop:
    name = (name or "").strip()
    if not name:
        raise OrderError("El taller necesita un nombre.")
    with _LOCK:
        entries = _read(_WORKSHOPS_FILE)
        if any((e.get("name", "").strip().lower() == name.lower()) for e in entries):
            raise OrderError(f"Ya hay un taller registrado con el nombre «{name}».")
        w = Workshop(id=uuid.uuid4().hex[:12], name=name,
                     **{k: v for k, v in fields.items() if k in Workshop.__annotations__
                        and k not in ("id", "name", "created_at", "last_used_at", "order_count")})
        entries.append(asdict(w))
        _write(_WORKSHOPS_FILE, entries)
    logger.info("Workshop registered — %s (%s)", w.name, w.id)
    return w


def update_workshop(workshop_id: str, **fields) -> Workshop:
    with _LOCK:
        entries = _read(_WORKSHOPS_FILE)
        for e in entries:
            if e.get("id") == workshop_id:
                for k, v in fields.items():
                    if k in Workshop.__annotations__ and k not in ("id", "created_at"):
                        e[k] = v
                _write(_WORKSHOPS_FILE, entries)
                return Workshop(**e)
    raise OrderError(f"No hay ningún taller con el identificador «{workshop_id}».")


def delete_workshop(workshop_id: str) -> bool:
    """Remove a workshop. Past orders keep their own copy of its details."""
    with _LOCK:
        entries = _read(_WORKSHOPS_FILE)
        rest = [e for e in entries if e.get("id") != workshop_id]
        if len(rest) == len(entries):
            return False
        _write(_WORKSHOPS_FILE, rest)
    return True


def _touch_workshop(workshop_id: str) -> None:
    with _LOCK:
        entries = _read(_WORKSHOPS_FILE)
        for e in entries:
            if e.get("id") == workshop_id:
                e["last_used_at"] = time.time()
                e["order_count"] = int(e.get("order_count", 0)) + 1
                _write(_WORKSHOPS_FILE, entries)
                return


# ── Orders ─────────────────────────────────────────────────────────────────── #

@dataclass
class ClipOrder:
    """One request for a clip, frozen at the moment it was signed."""

    part_no: str
    status: str = DRAFT
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    # Where it came from. `session_id` is a breadcrumb, not a dependency: the
    # order stays readable after the session is purged.
    session_id: str = ""
    case_id: int | None = None
    patient: str = ""            # internal only — never reaches the workshop copy
    #: Who the piece is for, as an id rather than a name. A name is what the
    #: dossier prints; an id is what a register groups by, and it survives the
    #: patient being renamed or two patients sharing a surname.
    patient_id: int | None = None
    case_label: str = ""

    # Who asks and who answers for it.
    requested_by: str = ""       # username
    requested_by_name: str = ""
    surgeon: str = ""            # the responsible surgeon, as signed
    signed_by: str = ""
    signed_at: float = 0.0
    institution: str = ""

    # The piece. `jaw_mm` outside the drawn sizes means a stretched jaw.
    series: str = ""
    #: Which of the four drawn series: straight | curved | angled | fenestrated.
    #: Kept beside the bend because a bend of 0° describes a straight clip, a
    #: curved one and a fenestrated one alike — reading the angle alone is how a
    #: fenestrated order used to come back as a straight piece.
    shape: str = "straight"
    angle_deg: float = 0.0
    jaw_mm: float = 0.0
    #: Inner window diameter, fenestrated only.
    window_mm: float = 0.0
    is_drawn_size: bool = False
    quantity: int = 1
    extra_sizes_mm: list[float] = field(default_factory=list)

    # Why, when and how it is delivered.
    intended_use: str = "implante"
    needed_by: str = ""          # ISO date, free text to the workshop
    urgency: str = "programada"
    steriliser: str = DEFAULT_STERILISER
    marking: str = DEFAULT_MARKING
    notes: str = ""              # goes to the workshop
    authorization_ref: str = ""

    # The workshop as it was when the order went out.
    workshop_id: str = ""
    workshop: dict = field(default_factory=dict)

    # Declarations. Not defaults: the UI may not pre-tick them.
    accepts_measurements: bool = False
    accepts_force_is_target: bool = False
    accepts_not_approved_device: bool = False

    # What was ordered, frozen.
    spec_snapshot: dict = field(default_factory=dict)
    case_snapshot: dict = field(default_factory=dict)
    override_reason: str = ""    # set when the piece differs from what was advised
    advised_label: str = ""
    files: dict = field(default_factory=dict)

    # What came back.
    reception: dict = field(default_factory=dict)

    @property
    def is_open(self) -> bool:
        return self.status not in (VERIFIED, REJECTED)

    @property
    def total_pieces(self) -> int:
        """Every piece the workshop makes, spare sizes included."""
        return self.quantity + len(self.extra_sizes_mm)


def order_dir(part_no: str) -> Path:
    """Where an order's STL and PDFs live. One directory per order.

    Fixed per-session filenames meant a second order silently overwrote the
    first one's paperwork.
    """
    d = _path("orders") / part_no
    d.mkdir(parents=True, exist_ok=True)
    return d


def next_part_no(now: float | None = None) -> str:
    """`PR-YYYY-NNNN`, correlative within the year, never reused.

    Derived from the highest number already on file rather than from a counter,
    so a manifest restored from a backup cannot hand out a number twice.
    """
    year = time.strftime("%Y", time.localtime(now if now is not None else time.time()))
    prefix = f"PR-{year}-"
    with _LOCK:
        used = [e.get("part_no", "") for e in _read(_ORDERS_FILE)]
        top = 0
        for p in used:
            if p.startswith(prefix):
                try:
                    top = max(top, int(p[len(prefix):]))
                except ValueError:
                    continue
        return f"{prefix}{top + 1:04d}"


def list_orders(status: str | None = None, session_id: str = "",
                open_only: bool = False, patient_id: int | None = None,
                q: str = "") -> list[ClipOrder]:
    """Orders newest first, optionally filtered.

    `q` searches the fields someone actually has in hand when they come looking:
    a part number off a delivery note, a workshop's name, the surgeon who signed.
    """
    out = [_from_dict(e) for e in _read(_ORDERS_FILE) if isinstance(e, dict)]
    if status:
        out = [o for o in out if o.status == status]
    if session_id:
        out = [o for o in out if o.session_id == session_id]
    if patient_id is not None:
        out = [o for o in out if o.patient_id == patient_id]
    if open_only:
        out = [o for o in out if o.is_open]
    if q:
        needle = q.strip().lower()
        out = [o for o in out if needle in " ".join((
            o.part_no, o.patient, o.case_label, o.surgeon,
            o.workshop.get("name", ""), o.series,
        )).lower()]
    out.sort(key=lambda o: o.created_at, reverse=True)
    return out


def status_counts() -> dict[str, int]:
    """How many orders sit in each state. Zeroes included, so the UI is stable."""
    counts = {s: 0 for s in STATUS_LABELS}
    for o in list_orders():
        counts[o.status] = counts.get(o.status, 0) + 1
    return counts


def backfill_patient_ids(resolve) -> int:
    """Fill `patient_id` on orders raised before the register knew about it.

    `resolve(case_id) -> int | None` is passed in rather than imported, so this
    module keeps knowing nothing about the clinical database.
    """
    with _LOCK:
        entries = _read(_ORDERS_FILE)
        changed = 0
        for e in entries:
            if e.get("patient_id") is not None or not e.get("case_id"):
                continue
            pid = resolve(e["case_id"])
            if pid is not None:
                e["patient_id"] = pid
                changed += 1
        if changed:
            _write(_ORDERS_FILE, entries)
    if changed:
        logger.info("Backfilled patient_id on %d clip order(s)", changed)
    return changed


def get_order(part_no: str) -> ClipOrder | None:
    return next((o for o in list_orders() if o.part_no == part_no), None)


def _from_dict(entry: dict) -> ClipOrder:
    known = {k: v for k, v in entry.items() if k in ClipOrder.__annotations__}
    return ClipOrder(**known)


def persist(order: ClipOrder) -> ClipOrder:
    """Write an order back after changing it in place (the files it produced)."""
    return _persist(order)


def _persist(order: ClipOrder) -> ClipOrder:
    order.updated_at = time.time()
    with _LOCK:
        entries = _read(_ORDERS_FILE)
        for i, e in enumerate(entries):
            if e.get("part_no") == order.part_no:
                entries[i] = asdict(order)
                break
        else:
            entries.append(asdict(order))
        _write(_ORDERS_FILE, entries)
    return order


# ── Creating one ───────────────────────────────────────────────────────────── #

def validate_request(*, jaw_mm: float, angle_deg: float, quantity: int,
                     intended_use: str, urgency: str, steriliser: str, marking: str,
                     sign: bool, surgeon: str, role: str,
                     accepts_measurements: bool, accepts_force_is_target: bool,
                     accepts_not_approved_device: bool) -> list[str]:
    """Everything wrong with a request, in the user's language. Empty when valid.

    Returned as a list rather than raised one at a time so the form can show
    every problem at once instead of making the user submit five times.
    """
    from services.navarro import STOCK_JAW_MM

    lo, hi = float(min(STOCK_JAW_MM)), float(max(STOCK_JAW_MM))
    problems: list[str] = []

    if jaw_mm <= 0:
        problems.append("La mordaza tiene que ser mayor que cero.")
    elif not (lo * 0.5 <= jaw_mm <= hi * 1.5):
        problems.append(
            f"Una mordaza de {jaw_mm:.1f} mm queda demasiado lejos de las tallas "
            f"dibujadas ({lo:.0f}–{hi:.0f} mm): el estirado dejaría de reproducir "
            f"el diseño de la familia."
        )
    if not (0.0 <= angle_deg <= 90.0):
        problems.append("El ángulo tiene que estar entre 0° y 90°.")
    if quantity < 1:
        problems.append("La cantidad tiene que ser al menos 1.")
    if intended_use not in INTENDED_USES:
        problems.append(f"Uso previsto no reconocido: «{intended_use}».")
    if urgency not in URGENCIES:
        problems.append(f"Urgencia no reconocida: «{urgency}».")
    if steriliser not in STERILISERS:
        problems.append(f"Esterilización no reconocida: «{steriliser}».")
    if marking not in MARKINGS:
        problems.append(f"Marcado no reconocido: «{marking}».")

    if sign:
        if role not in SIGNING_ROLES:
            problems.append(
                "Solo un médico responsable puede firmar un pedido. Guárdalo como "
                "borrador y pide la firma."
            )
        if not surgeon.strip():
            problems.append("Falta el cirujano responsable que firma el pedido.")
        if not (accepts_measurements and accepts_force_is_target
                and accepts_not_approved_device):
            problems.append(
                "Hay que aceptar las tres declaraciones antes de firmar: las medidas, "
                "la fuerza como objetivo a medir, y que el STL es geometría y no un "
                "dispositivo autorizado."
            )
    return problems


def outside_drawn_range(jaw_mm: float) -> bool:
    """True when the jaw is outside 7–22 mm, where the stretch extrapolates.

    Inside the drawn range the taper is interpolated between measured designs;
    outside it the same profile is being extended past anything anyone drew, and
    the order should say so rather than look equally certain.
    """
    from services.navarro import STOCK_JAW_MM

    return not (float(min(STOCK_JAW_MM)) <= jaw_mm <= float(max(STOCK_JAW_MM)))


def create_order(*, session_id: str, case_id: int | None, patient: str, case_label: str,
                 patient_id: int | None = None,
                 requested_by: str, requested_by_name: str, institution: str,
                 series: str, angle_deg: float, jaw_mm: float, is_drawn_size: bool,
                 shape: str = "straight", window_mm: float = 0.0,
                 quantity: int, extra_sizes_mm: list[float],
                 intended_use: str, needed_by: str, urgency: str,
                 steriliser: str, marking: str, notes: str, authorization_ref: str,
                 workshop: Workshop | None,
                 accepts_measurements: bool, accepts_force_is_target: bool,
                 accepts_not_approved_device: bool,
                 spec_snapshot: dict, case_snapshot: dict,
                 advised_label: str = "", override_reason: str = "",
                 surgeon: str = "", sign: bool = False, part_no: str = "") -> ClipOrder:
    """Record the request. Signing is what freezes it and gives it its number."""
    order = ClipOrder(
        part_no=part_no or next_part_no(),
        status=SIGNED if sign else DRAFT,
        session_id=session_id, case_id=case_id, patient=patient, case_label=case_label,
        patient_id=patient_id,
        requested_by=requested_by, requested_by_name=requested_by_name,
        institution=institution, surgeon=surgeon.strip(),
        series=series, shape=shape, angle_deg=float(angle_deg),
        jaw_mm=float(jaw_mm), window_mm=float(window_mm),
        is_drawn_size=is_drawn_size, quantity=int(quantity),
        extra_sizes_mm=[float(x) for x in extra_sizes_mm],
        intended_use=intended_use, needed_by=needed_by, urgency=urgency,
        steriliser=steriliser, marking=marking, notes=notes,
        authorization_ref=authorization_ref,
        workshop_id=workshop.id if workshop else "",
        workshop=asdict(workshop) if workshop else {},
        accepts_measurements=accepts_measurements,
        accepts_force_is_target=accepts_force_is_target,
        accepts_not_approved_device=accepts_not_approved_device,
        spec_snapshot=spec_snapshot, case_snapshot=case_snapshot,
        advised_label=advised_label, override_reason=override_reason,
    )
    if sign:
        order.signed_by = requested_by
        order.signed_at = time.time()
    _persist(order)
    if workshop is not None:
        _touch_workshop(workshop.id)
    logger.info("Clip order %s — %s %.1f mm · %s", order.part_no, order.series,
                order.jaw_mm, order.status)
    return order


def set_status(part_no: str, status: str, *, by: str = "") -> ClipOrder:
    """Advance an order, refusing a jump the workflow does not allow."""
    order = get_order(part_no)
    if order is None:
        raise OrderError(f"No existe el pedido {part_no}.")
    allowed = TRANSITIONS.get(order.status, ())
    if status not in allowed:
        nice = ", ".join(STATUS_LABELS.get(s, s) for s in allowed) or "ninguno"
        raise OrderError(
            f"Un pedido «{STATUS_LABELS.get(order.status, order.status)}» no puede "
            f"pasar a «{STATUS_LABELS.get(status, status)}». Siguientes estados "
            f"posibles: {nice}."
        )
    if status == SIGNED:
        if not order.surgeon:
            raise OrderError("Falta el cirujano responsable que firma el pedido.")
        if not order.workshop:
            raise OrderError("Un pedido firmado necesita un taller destinatario.")
    order.status = status
    if status == SIGNED and not order.signed_at:
        order.signed_by = by
        order.signed_at = time.time()
    return _persist(order)


def receive(part_no: str, *, measured_jaw_mm: float, measured_force_g: float,
            by: str = "", notes: str = "") -> ClipOrder:
    """Record the piece that actually arrived. This is where the order becomes real.

    The measured closing force is not optional: it is the only place the force
    stops being a target. Whether it is acceptable is decided in `verify`.
    """
    from services.clip_manufacture import FORCE_TOLERANCE_G
    from services.navarro import CLOSING_FORCE_MAX_G, CLOSING_FORCE_MIN_G

    order = get_order(part_no)
    if order is None:
        raise OrderError(f"No existe el pedido {part_no}.")
    if order.status not in (SENT, PRODUCTION):
        raise OrderError(
            f"Solo se registra la recepción de un pedido enviado o en fabricación; "
            f"este está «{STATUS_LABELS.get(order.status, order.status)}»."
        )
    if measured_jaw_mm <= 0 or measured_force_g <= 0:
        raise OrderError("Hay que registrar la mordaza y la fuerza MEDIDAS en la pieza.")

    jaw_ok = abs(measured_jaw_mm - order.jaw_mm) <= 0.10
    force_ok = (CLOSING_FORCE_MIN_G - FORCE_TOLERANCE_G <= measured_force_g
                <= CLOSING_FORCE_MAX_G + FORCE_TOLERANCE_G)
    order.reception = {
        "received_at": time.time(), "by": by, "notes": notes,
        "measured_jaw_mm": float(measured_jaw_mm),
        "measured_force_g": float(measured_force_g),
        "jaw_within_tolerance": jaw_ok,
        "force_within_band": force_ok,
        "expected_jaw_mm": order.jaw_mm,
        "expected_force_band_g": [CLOSING_FORCE_MIN_G, CLOSING_FORCE_MAX_G],
    }
    order.status = RECEIVED
    return _persist(order)


def verify(part_no: str, *, by: str = "", accept_deviation_reason: str = "") -> ClipOrder:
    """Accept the received piece.

    A piece measured outside the jaw tolerance or the force band cannot be
    accepted silently: either it is rejected, or somebody states in writing why
    the deviation is acceptable and that reason is kept with the order.
    """
    order = get_order(part_no)
    if order is None:
        raise OrderError(f"No existe el pedido {part_no}.")
    if order.status != RECEIVED:
        raise OrderError("Solo se verifica un pedido ya recibido y medido.")
    r = order.reception
    off = [n for n, ok in (("la mordaza", r.get("jaw_within_tolerance")),
                           ("la fuerza de cierre", r.get("force_within_band"))) if not ok]
    if off and not accept_deviation_reason.strip():
        raise OrderError(
            f"La pieza está fuera de especificación en {' y '.join(off)}. Para aceptarla "
            f"hay que justificar por escrito la desviación; si no, recházala."
        )
    order.reception["verified_at"] = time.time()
    order.reception["verified_by"] = by
    if accept_deviation_reason.strip():
        order.reception["deviation_accepted"] = accept_deviation_reason.strip()
    order.status = VERIFIED
    return _persist(order)


def reject(part_no: str, *, reason: str, by: str = "") -> ClipOrder:
    order = get_order(part_no)
    if order is None:
        raise OrderError(f"No existe el pedido {part_no}.")
    if order.status != RECEIVED:
        raise OrderError("Solo se rechaza un pedido ya recibido.")
    if not reason.strip():
        raise OrderError("Un rechazo necesita un motivo.")
    order.reception["rejected_at"] = time.time()
    order.reception["rejected_by"] = by
    order.reception["rejection_reason"] = reason.strip()
    order.status = REJECTED
    return _persist(order)


def delete_order(part_no: str) -> bool:
    """Remove a DRAFT and its directory. A signed order is never deleted.

    Once an order has been signed it is a record of a decision, and a record
    that can be deleted is not a record.
    """
    with _LOCK:
        entries = _read(_ORDERS_FILE)
        match = next((e for e in entries if e.get("part_no") == part_no), None)
        if match is None:
            return False
        if match.get("status") != DRAFT:
            raise OrderError(
                "Un pedido firmado no se borra: forma parte del registro. "
                "Recházalo al recibirlo si la pieza no sirve."
            )
        _write(_ORDERS_FILE, [e for e in entries if e.get("part_no") != part_no])
    shutil.rmtree(_path("orders") / part_no, ignore_errors=True)
    return True


def clear_store() -> None:
    """Wipe both stores. Tests only."""
    if ORDERS_ROOT.exists():
        shutil.rmtree(ORDERS_ROOT, ignore_errors=True)


# ── Paperwork ──────────────────────────────────────────────────────────────── #

def sterilisation_notes(order: ClipOrder) -> list[str]:
    """What the delivery assumptions mean for the workshop, said out loud.

    These are ASSUMPTIONS, not policy handed down by anyone: nobody has yet
    confirmed how this institution sterilises or marks these pieces. Written
    into the order so the workshop can contradict them, rather than left for
    someone to discover after the piece arrives.
    """
    out: list[str] = []
    if order.steriliser == "hospital":
        out.append(
            "Entrega SIN esterilizar: la pieza llega limpia, desengrasada y sin "
            "rebabas, y la esteriliza el hospital. Indicar el método compatible con "
            "el acabado entregado."
        )
    else:
        out.append(
            "El taller entrega la pieza esterilizada: indicar método, lote y "
            "caducidad del proceso en el albarán."
        )
    if order.marking == "cuerpo":
        out.append(
            "Marcar el número de pieza en el CUERPO del clip. No marcar la mordaza "
            "(es la cota que se compara con el cuello) ni el muelle (una marca ahí "
            "concentra tensión justo donde nace la fuerza de cierre)."
        )
    else:
        out.append("Sin marcado en la pieza: la trazabilidad va solo en el albarán.")
    return out


def _shape_label(order: ClipOrder) -> str:
    """How the piece is named on paper. The window is part of the name."""
    from services.navarro import shape_label

    return shape_label(order.shape, order.angle_deg, order.window_mm)


def order_rows(order: ClipOrder) -> list[tuple[str, str]]:
    """The order block both dossiers show. No patient data in it."""
    pieces = f"{order.quantity}"
    if order.extra_sizes_mm:
        extra = ", ".join(f"{x:.0f} mm" for x in order.extra_sizes_mm)
        pieces += f" + tallas contiguas ({extra})"
    return [
        ("Nº de pedido", order.part_no),
        ("Serie", f"{order.series} · {_shape_label(order)}"),
        ("Piezas", pieces),
        ("Fecha necesaria", order.needed_by or "sin fecha comprometida"),
        ("Prioridad", "Preferente" if order.urgency == "preferente" else "Programada"),
        ("Esterilización", "La realiza el hospital" if order.steriliser == "hospital"
                           else "La realiza el taller"),
        ("Marcado", "Nº de pieza en el cuerpo" if order.marking == "cuerpo" else "Sin marcado"),
        ("Taller", order.workshop.get("name", "") or "por asignar"),
        ("Contacto", " · ".join(x for x in (order.workshop.get("contact_name", ""),
                                            order.workshop.get("email", ""),
                                            order.workshop.get("phone", "")) if x) or "—"),
    ]


def internal_order_rows(order: ClipOrder) -> list[tuple[str, str]]:
    """The part of the order only the institution's copy carries."""
    use = {"implante": "Implante en paciente", "prototipo": "Prototipo / ensayo no clínico",
           "inventario": "Repuesto de inventario"}.get(order.intended_use, order.intended_use)
    rows = [
        ("Uso previsto", use),
        ("Cirujano responsable", order.surgeon or "sin firmar"),
        ("Solicitado por", order.requested_by_name or order.requested_by or "—"),
        ("Estado", STATUS_LABELS.get(order.status, order.status)),
    ]
    if order.intended_use == "implante":
        rows.append(("Referencia de autorización", order.authorization_ref or "PENDIENTE"))
    if order.override_reason:
        rows.append(("Se aparta de lo recomendado", order.override_reason))
    if order.advised_label:
        rows.append(("El sistema recomendaba", order.advised_label))
    return rows
