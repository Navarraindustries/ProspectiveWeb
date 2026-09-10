# PROSPECTIVE Web

> Computer-assisted planning for cerebral aneurysm surgery, in the browser.
> FastAPI backend (VTK · SimpleITK · pydicom) + React/TypeScript frontend with
> real-time 3D and MPR viewers — the web port of the PROSPECTIVE desktop app.

---

## Table of Contents

- [Overview](#overview)
- [Status](#status)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the App](#running-the-app)
- [Environment Variables](#environment-variables)
- [Data Model](#data-model)
- [Session Lifecycle](#session-lifecycle)
- [Undoing Work](#undoing-work)
- [Choosing a Clip](#choosing-a-clip)
- [Navigation & Unsaved Work](#navigation--unsaved-work)
- [API Reference](#api-reference)
- [Running Tests](#running-tests)
- [Development Scripts](#development-scripts)
- [Relationship to the Desktop App](#relationship-to-the-desktop-app)
- [Known Limitations](#known-limitations)
- [Privacy & Security Notes](#privacy--security-notes)
- [License](#license)

---

## Overview

PROSPECTIVE Web is a clinical decision-support system for neurosurgical planning
of cerebral aneurysms. A clinician uploads a DICOM study and walks a seven-step
pipeline, with every step rendered live in 3D:

```
1 DICOM upload  →  2 Segmentation  →  3 Detection  →  4 Morphometry
      →  5 Treatment decision  →  6 Devices  →  7 Report
```

All medical image processing runs on the server (VTK + SimpleITK); the browser
renders meshes with vtk.js and 2D slices as server-rendered PNGs.

Every step of that pipeline is **reversible**: the mesh carries an undo/redo
history, the preprocessing can be rolled back to the original DICOM, and the
detection, morphometry, centreline, treatment decision and placed devices can each
be cleared without restarting the study. Nothing derived from a result outlives
the result itself, so the 3D scene, the measurements and the PDF can never
disagree with one another.

Beyond the pipeline the platform covers the surrounding clinical workflow:
patient registry, clinical cases, a durable archive of imaging studies with a
searchable preview gallery, resumable planning sessions, user signup with admin
approval, and a tamper-evident audit chain.

---

## Status

| | |
|---|---|
| Backend tests | **826 passing** (`pytest`, 48 files) |
| Frontend tests | **159 passing** (`vitest`, 18 files) · `tsc -b` clean · production build clean |
| REST endpoints | **97** operations across 81 paths (23 routers), all authenticated except login/signup/logout |
| Feature parity with desktop | **Complete** |

---

## Tech Stack

| Layer | Technology |
|---|---|
| API framework | FastAPI 0.110+ with Uvicorn |
| Medical imaging | SimpleITK 2.3, VTK 9.3, pydicom 2.4, scipy 1.12, Pillow 10 |
| Mesh processing | VTK (Marching Cubes, smoothing, decimation, STL export) |
| Auth | python-jose (JWT HS256), passlib + bcrypt 4.x |
| Database | SQLAlchemy 2.0 + SQLite (WAL mode) |
| Report generation | reportlab 4.x (PDF), pydicom (DICOM SR) |
| Study archive | pluggable local filesystem or AWS S3 (boto3, optional) |
| Frontend | React 19 + TypeScript 5.8 + Vite 7 |
| 3D / 2D viewers | @kitware/vtk.js 36 (meshes, volume rendering) + server-rendered MPR PNGs |
| Routing | react-router-dom 7 |
| Python | 3.11+ (developed on 3.13) · Node 20+ |

---

## Project Structure

```
ProspectiveWeb/
├── openapi.json            # OpenAPI 3.1 spec (regenerate: make openapi:export)
├── Makefile                # Dev shortcuts
├── start-all.bat           # Windows: launches backend + frontend in two windows
│
├── backend/
│   ├── main.py             # FastAPI app: lifespan, CORS, static mounts, guarded routers
│   ├── requirements.txt
│   ├── models/    (20)     # Pydantic request/response schemas
│   ├── routers/   (23)     # Route handlers, one file per domain
│   ├── services/  (40)     # Qt-free business logic, shared with the desktop app
│   ├── test_*.py  (39)     # pytest suites
│   ├── data/               # PUBLIC static mount — sessions, meshes, reports
│   ├── clip_library/       # PRIVATE: institutional clips + templates (gitignored)
│   ├── study_files/        # PRIVATE archive: DICOM of archived studies (gitignored)
│   ├── user_files/         # PRIVATE: signup photos and CVs (gitignored)
│   └── secrets/            # PRIVATE: JWT signing key (gitignored)
│
└── frontend/
    ├── src/
    │   ├── pages/          # Landing · Login · Signup · Patients · NuevoCaso
    │   │                   # Studies · Workspace · PendingRequests · UsersAdmin · AuditTrail
    │   ├── components/     # Design-system primitives + one panel per pipeline step
    │   ├── vtk/            # MeshView · VolumeView · MprView · ObliqueMprView · Viewer
    │   ├── store/          # planning · auth · nav · theme contexts
    │   ├── *.test.*  (8)   # vitest + Testing Library suites
    │   └── styles/tokens/  # Design tokens (light/dark via [data-theme])
    └── public/media/       # Intro / loading / landing videos
```

Key backend services (all ported from the desktop `prospective/processing`):

| Service | Purpose |
|---|---|
| `dicom_loader.py` | SimpleITK series loading, multi-series scan, Enhanced XA multiframe |
| `thresholds.py` | Auto HU/intensity band per modality (CT · MR · XA · DSA strategies) |
| `preprocess.py` | HU clipping, isotropic resampling, Gaussian smoothing, bone subtraction |
| `segmentation.py` | Marching Cubes → component filter → smoothing → decimation |
| `grow.py` / `mesh_crop.py` | Region-grow from seeds · box/sphere ROI clipping |
| `aneurysm_detector.py` | Curvature + shape-gate candidate detection |
| `morphometrics.py` | Neck / dome / AR / DNR / BF / UI / EI / NSI with reliability guards |
| `sac_isolation.py` | Semi-automatic watertight sac isolation from two clicks |
| `parent_artery.py` | Parent-vessel diameter → size ratio |
| `centerline.py` / `cross_section.py` | Medial-axis extraction · diameter profile · stenosis |
| `perforator_risk.py` | Vertex-valence anomaly → perforator candidates |
| `treatment.py` | 8-factor CLIP vs ENDOVASCULAR scoring with literature citations |
| `clips.py` / `coils.py` / `devices.py` | Device catalogues, recommendations, real VTK collision |
| `clip_selection.py` | Criteria-based clip choice per case + manufacturing spec |
| `clip_fit.py` | Poses candidates on the measured neck and checks them against the mesh |
| `clip_library.py` | Global store of the institution's clips and manufacturing templates |
| `navarro.py` | The NAVARRO™ made-to-order family: jaw sizing, jaw-only resizing |
| `clip_animation.py` | Splits a clip into body + blades and derives its hinge, for rehearsal |
| `clip_manufacture.py` | The clip to have made: family, commercial fallback, or neither |
| `clip_dossier.py` | The two order PDFs — internal record and workshop copy |
| `clip_orders.py` | The order register and the workshop directory — global, persistent, frozen |
| `stent_deployment.py` | Centerline-guided braided stent along real vessel curvature |
| `phases.py` | PHASES 5-year rupture risk (Greving 2014) |
| `mesh_prep.py` | 3D-print preparation + printer-bed presets |
| `scene_render.py` | Offscreen VTK renders of the scene from named, fixed viewpoints |
| `report_generator.py` / `dicom_sr.py` / `mesh_exporter.py` | PDF · DICOM SR · STL |
| `audit.py` | SkullChain SHA-256 tamper-evident event chain |
| `storage.py` / `study_archive.py` | Durable study archive (local or S3) + previews |
| `mesh_backup.py` | Undo/redo stacks for the working mesh, with a labelled manifest |
| `device_state.py` | Which devices a session has placed; clearing one family |
| `sessions.py` | Session dirs, TTL purge, durable snapshot / rehydrate |

---

## Prerequisites

- **Python 3.11+** and **Node.js 20+**
- Windows / macOS / Linux (VTK and SimpleITK are cross-platform)

---

## Installation

```bash
git clone https://github.com/JEsteban1999/ProspectiveWeb.git
cd ProspectiveWeb

# Backend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt      # Windows
# .venv/bin/pip install -r requirements.txt        # macOS / Linux

# Frontend
cd ../frontend
npm install
```

Or, on Windows, with the Makefile from the repo root:

```bash
make install:backend
make install:frontend
```

---

## Running the App

Double-click **`start-all.bat`** (Windows) to launch both servers, or run them
separately:

```bash
# Backend — http://127.0.0.1:8000
cd backend && .venv\Scripts\uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Frontend — http://localhost:5173
cd frontend && npm run dev
```

| URL | Description |
|---|---|
| `http://localhost:5173/` | Public landing page |
| `http://localhost:5173/app` | The application (login → patients → workspace) |
| `http://127.0.0.1:8000/docs` | Swagger UI |
| `http://127.0.0.1:8000/redoc` | ReDoc |
| `http://127.0.0.1:8000/health` | Health check |

Default account seeded on first run: **`admin` / `admin123`**. Change it from the
user menu ("Cambiar contraseña") before using the app with real data — an admin
can also reset another user's password from the Usuarios page.

> **Note on `--reload`**: uvicorn's reloader does not reliably pick up *new*
> modules, and a stale process on :8000 will silently serve old code. Restart the
> backend for real when verifying a change end to end.

---

## Environment Variables

The server runs out of the box with sensible defaults.

| Variable | Default | Description |
|---|---|---|
| `PROSPECTIVE_DB_URL` | `sqlite:///backend/data/prospective.db` | SQLAlchemy connection string |
| `JWT_SECRET` | auto-generated into `backend/secrets/jwt_secret.txt` | HS256 signing key |
| `SESSION_TTL_HOURS` | `24` | Age at which an idle working session is purged |
| `STUDY_FILES_ROOT` | `backend/study_files` | Root of the durable study archive |
| `STORAGE_BACKEND` | `local` | `local` (filesystem) or `s3` |
| `STORAGE_S3_BUCKET` | — | Required when `STORAGE_BACKEND=s3`; bucket must be private |
| `STORAGE_S3_PREFIX` | — | Optional key prefix inside the bucket |
| `COOKIE_SECURE` | off | Mark the auth cookie `Secure` (set it when serving over HTTPS) |
| `BACKEND_URL` | `http://127.0.0.1:8000` | Where the Vite dev server proxies `/api`, `/data`, `/static` |

Token lifetime is currently a constant (`ACCESS_TOKEN_EXPIRE_MIN`, 24 h) in
`services/auth_service.py`, not an environment variable.

For production, always set `JWT_SECRET` from the deployment environment and never
commit it.

---

## Data Model

The clinical hierarchy is deliberately four levels deep, so one episode of care
can carry several acquisitions without duplicating records:

```
Patient  ──<  Study (clinical case)  ──<  ImagingStudy (one acquisition)
                      │                            │
                      └──────<  PlanningSession  >─┘
```

- **Patient** — demographics, history, institution.
- **Study** — the *clinical case*: diagnosis, aneurysm type, region, laterality,
  proposed treatment. Created via "Nuevo caso" against an existing patient.
- **ImagingStudy** — one archived acquisition (CT, angiography, follow-up) with
  its DICOM in durable storage plus a rendered preview. A case may hold several.
- **PlanningSession** — a saved run of the pipeline, linked to both the case and
  the acquisition it analysed, resumable from the step it was saved at.

The **Studies gallery** (the "Estudios" tab, and inside each patient sheet) lists
archived imaging studies as preview cards. The search runs **on the server**, so
it covers the whole archive — filtering only the page that happened to be loaded
made an older patient come back empty with nothing to explain why.

Each card shows the step its planning reached and offers two actions:
**«Reanudar»** restores the saved session at that step, and **«De cero»** starts a
fresh session at step 1 and says so. A card only offers to resume when the
snapshot is really on disk: sessions saved before durable saving existed, or
purged since, would otherwise fail on restore.

---

## Session Lifecycle

Every pipeline interaction is scoped to a **session** — a UUID directory:

```
backend/data/sessions/{uuid}/
├── .created_at          # ISO timestamp used for TTL cleanup
├── state.txt            # Key-value store (dicom.*, seg.*, morpho.*, treatment.*)
├── dicom/               # Uploaded DICOM files
├── meshes/              # Meshes (.vtp) + cached volume (_volume.npy)
│   ├── _undo/           # Mesh edit history + index.json manifest
│   └── _redo/           # States stepped back past, replayable
├── reports/             # Generated PDFs
└── exports/             # Exported STL files
```

Sessions are working scratch and are purged after `SESSION_TTL_HOURS`. Two
mechanisms make work survive that sweep:

- **Archiving a study** copies its DICOM into `study_files/` (or S3) and creates
  an `ImagingStudy`. This is what puts it in the gallery.
- **Saving progress** snapshots the session directory into
  `data/session_saves/{uuid}`. The DICOM is hard-linked rather than copied
  (studies are ~1 GB and copying them filled the disk); meshes and the volume
  cache are copied, because re-running a step rewrites them in place and a
  snapshot must stay a point-in-time image. The mesh undo/redo stacks are pruned
  out of the snapshot — they are a working convenience, and carrying every
  intermediate state multiplied the size of each save.

A restored session starts its own clock. `_clone_tree` copies every file in the
snapshot, `.created_at` included, so a session restored from a week-old save came
back already past the TTL and the next purge sweep deleted it mid-session, with
no message — any session older than `SESSION_TTL_HOURS` was effectively
unresumable. The live session is stamped with the time it was actually created.

What survives a save → restore, verified end to end: the segmentation and every
mesh edit, the detection, the morphometry *including the fitted neck plane and
the points marked around the rim*, the centreline, the treatment decision, the
placed devices (and so the report), and any made-to-order clip built for the
case. The marks matter as much as the measurement: the plane can be rebuilt from
its origin and normal, but a resumed session used to show that plane with
nothing behind it, and refining it meant marking the rim again from scratch.

Typical flow:

```
POST /api/upload                       → session_id + detected series
GET  /api/segment/suggested-band/{id}  → auto HU band for this modality
POST /api/segment                      → vessel_tree.vtp
POST /api/detect/{id}                  → aneurysm candidates
GET  /api/morphometry/{id}             → neck/dome measurements
POST /api/treatment-decision           → CLIP vs ENDO recommendation
POST /api/report                       → PDF assembled from session state
POST /api/studies/cases/{case}/archive → DICOM into durable storage
POST /api/sessions/save                → resumable snapshot + DB link
```

Session files are served statically under `/data/sessions/` so vtk.js can fetch
mesh URLs directly — behind a middleware that requires the same token as the API,
since those directories also hold the uploaded DICOM.

---

## Undoing Work

A planning session is exploratory: thresholds get retuned, a seed lands on the
wrong vessel, a case is evaluated with the wrong location. Every step therefore
has a way back that does not cost a re-upload or a re-segmentation.

| What | How to undo it | Cost |
|---|---|---|
| ROI crop · grow from seeds · re-segmentation | «Deshacer» — `POST /api/mesh-restore/{sid}` `scope=undo` | file copy |
| Every interactive mesh edit at once | «Restaurar malla original» — `scope=original` | file copy |
| An undo taken one step too far | «Rehacer» — `scope=redo` | file copy |
| HU clipping · resampling · smoothing · bone subtraction | «Revertir» — `DELETE /api/preprocess/{sid}` | rebuild from the session's DICOM |
| Candidates + morphometry + the neck plane | «Limpiar detección» — `DELETE /api/detect/{sid}` | instant |
| Neck or dome marker placed on the wrong spot | Clear that one marker in the morphometry panel | instant |
| The medial axis and any stent deployed along it | `DELETE /api/centerline/{sid}` | instant |
| The recommendation, its clinical context and PHASES | `DELETE /api/treatment-decision/{sid}` | instant |
| A placed clip, coil packing or stent | `DELETE /api/devices/{sid}?kind=…` | instant |
| A wrongly imported custom clip | `DELETE /api/clips/custom/{sid}/{index}` | instant |

Two rules keep the session honest while all of this happens:

- **Nothing derived outlives its source.** Restoring a mesh clears the candidates,
  morphometry and centreline measured on the old one; clearing the detection also
  clears the treatment recommendation and the PHASES score, because both are
  computed *from* the morphometry. Leaving them behind produced a PDF that
  recommended a treatment for an aneurysm the same PDF reported as unmeasured.
- **Generated outputs are cache-busted and dated.** A PDF, a DICOM SR and an STL
  are snapshots of the mesh, the measurements and the devices at the moment they
  were written. The filename is fixed per session, so the URLs carry a version
  token and the panel says when a download no longer matches what is on screen.

The mesh history lives inside the session directory, so a session that is saved
and resumed still offers «Deshacer» — the browser has no memory of edits it did
not make, and `GET /api/mesh-restore/{sid}` is what the panel asks on mount. The
same applies to the preprocessing (`GET /api/preprocess/{sid}`), the placed
devices (`GET /api/devices/{sid}`) and the imported clips
(`GET /api/clips/custom/{sid}`).

---

## Choosing a Clip

The devices step answers a specific question: **does anything we own fit this
aneurysm, and if not, what has to be made?**

### Two stages

1. **Analytic** — every clip in the catalogue is judged against the case,
   criterion by criterion. Each verdict carries the measurement that produced it,
   because "score 92.6" is not something a surgeon can check.

   | Criterion | What it compares |
   |---|---|
   | Cobertura | Blade length against the neck, with a safety margin |
   | Fenestración | Window calibre against the measured parent artery |
   | Alcance | Shape against dome depth (AR) |
   | Forma / localización | Shape against the anatomical region on the case |
   | Fuerza de cierre | Spring force against neck width |

2. **Geometric** — the best candidates are built at their real dimensions,
   posed on the measured neck plane and checked against the patient's own mesh.

   Two details make this mean anything. A clip across the neck necessarily
   intersects the vessel — *the neck is vessel* — so the sac and neck region are
   cut away first and the collision test runs against what remains; a hit then
   means the blade reaches a **neighbouring** structure. And several approach
   angles are tried: reporting only the best pose made a clip that clears its
   neighbours at every angle look identical to one that clears them at exactly
   one. Both numbers are reported (`clean_rolls` of `n_rolls`).

### Four outcomes, never an empty list

| Outcome | Meaning |
|---|---|
| `stock` | At least one clip meets every criterion |
| `marginal` | Usable clips exist, but all carry a caveat — the custom alternative is offered too |
| `manufacture` | Nothing fits; the answer is a specification to have one made |
| `unmeasured` | No reliable neck, so no selection is possible — mark the neck plane first |

The old recommender returned an empty list for a 1 mm neck and for a 20 mm neck
alike. An empty list *is* the answer "nothing made fits this patient"; it just
has to be delivered as a specification rather than as silence.

### The manufacturing specification

Blade length, width, height, spring, shape, angle, target closing force, and the
window diameter taken from the measured parent artery. Width, height and spring
follow the median proportions of the real catalogue rather than being invented —
but never below the smallest part that demonstrably exists. Scaling every
dimension with the blade treats a clip as one shape at different zooms, and a
2.5 mm neck then specified a 2.8 mm spring, 44 % under the shortest real one.
The spread of spring/blade across the catalogue (0.45–1.14) already says the
relation is not proportional, and the NAVARRO™ family settles it: 42 designs from
7 to 22 mm of jaw, all on the same 14.3 mm body. A spring is sized by the force
it holds, not by the blade in front of it. When a dimension is floored the spec
says so. `POST /api/clips/manufacture/{sid}` writes the STL.

**The STL comes from the drawn designs.** It used to come from the box builder —
348 triangles with 696 boundary edges for a 10 mm clip, an open surface that no
workshop or printer can take. Anything meant to be MADE is now built from the
NAVARRO™ family, which is watertight.

**A shape the family cannot build is never substituted in silence.** Available
shapes are read off the disk, so the curved and fenestrated series become
selectable by dropping their files in. Until then a fenestrated case is offered a
commercial clip of that shape — and if no commercial clip of that shape can close
the neck either, the answer is `unavailable` rather than a near-miss presented as
an alternative.

**Two dossiers.** The internal PDF records which patient, which case and which
measurements produced the dimensions, so the order can be re-derived a year
later. The workshop PDF carries no patient data by construction — dimensions,
tolerances, material and the checks to run on the finished part. They share a
part number, which is the only thread between them.

**Both dossiers show the piece.** Three renders of the very solid that goes
into the STL — superior, anterior and oblique — so a workshop can see the shape
it is quoting. A dimension table catches an order that is dimensionally wrong; a
picture catches one that is dimensionally right and shaped wrong. They carry no
patient data: they are pictures of a clip.

**The closing force is a target, never a result.** It comes from the spring, the
alloy and the heat treatment; an STL has no material. Both dossiers demand it be
measured on the finished part before anyone calls the order done.

The spec always lists what a machinist still has to confirm — a specification
that hides its assumptions is worse than one that states them. In particular,
**no parent-artery measurement means no window diameter**: the spec says so
instead of quietly falling back to a plain clip.

### The NAVARRO™ family (made to order)

`NAVARRO™ - Variantes/` holds the institution's own designs — **66 of them,
across all four series**:

| Serie | Diseños | Se varía |
|---|---|---|
| **T1 recta** | 6 (7–22 mm de mordaza) | mordaza |
| **T2 curva** | 6 | mordaza, **solo tallas dibujadas** |
| **T3 angulada** | 36 (6 acodados × 6 mordazas) | mordaza y acodado |
| **T4 fenestrada** | 18 (6 mordazas × 3 ventanas) | mordaza y ventana (3/5/7 mm) |

The curved and fenestrated series arrived by being dropped into the folder, with
no import step and no code change to read them — which was the point of reading
the library off disk. All 66 exports are watertight solids in millimetres, on the
same frame, verified before wiring them in.

**Only this family is offered.** Clips from Sugita, Aesculap, Yasargil and Codman
are no longer proposed to a surgeon: the family now covers every shape the
selector can ask for, and a clip nobody here can obtain was a dead end — it could
not be personalised and it dragged the wrong piece into the manufacturing
dossier. That table is not deleted, because it is also the dimensional reference
the manufacturing spec derives its proportions and its floors from. Reference,
never an offer (`OFFER_COMMERCIAL_CLIPS`).

Three things about them are easy to get wrong, and each is enforced in code:

- **Use the STL, never the OBJ.** The `.obj` exports are in CENTIMETRES (measured
  ratio 9.996–10.008 against the STL across all 41 pairs) *and* unwelded — the
  7 mm clip reads as 14 334 loose triangles with 43 002 boundary edges, a
  triangle soup that cannot be collision-tested. The `.stl` are already in
  millimetres and watertight. Nothing is rescaled.
- **The name states the JAW, not the clip.** A "7mm" NAVARRO grips 7 mm on a part
  21.30 mm long (`total = jaw + 14.30 mm`, constant across the family). Measuring
  the envelope and recording it as the blade makes the selector reject, as
  "oversized ×5.3", the very clip that fits a 4 mm neck. `add_clip` therefore
  accepts a declared `blade_length_mm` that overrides the measurement.
- **The closing force is a band, not a figure.** 120–200 g by design, not yet
  characterised. It travels as a band and the force criterion is capped at
  `warn` for these clips however well the band sits — "meets the criterion" is a
  claim nobody can make yet.

**Visibility.** Stock and made-to-order answer different questions — what can be
picked up today, and what would be made for this case — so the recommendation
always shows at least the best of each. Ranking alone hid the family: a design
whose closing force is still a band is capped at `warn` on that criterion, and
with a 6 mm neck 28 of the 42 designs were viable while the best ranked 12th of
60, so every visible slot went to stock. The scores are untouched; only
visibility changed.

**Resizing.** These are manufactured per case, so the jaw is not restricted to
the six drawn sizes: `POST /api/clips/navarro/{sid}` builds any jaw length, and
the panel both suggests the one the neck asks for and lets it be set by hand.
The stretch applies to the **jaw only, along its own axis** — the body and spring
are left exactly as drawn, because a uniform scale would resize the spring too
and its closing force would no longer be the family's. That is legitimate rather
than invented: sampling the jaw taper at ten stations and normalising by length,
the profiles agree to within ~0.05 mm across the drawn sizes, so the designs are
one shape stretched. Where the jaw *starts* is read off each mesh rather than
assumed — it is 2.50 mm at 0° and 90° but 3.95 mm at 15°, because the knee takes
up room. A stretched mesh is a faithful preview for display and collision
testing, **not** the manufacturing master.

### «Fabricación», a step of its own

Ordering a piece is not planning a case. Everything in **Dispositivos** answers
*what do I put in this patient, and where* — one sitting, all inside the session.
Ordering answers *how do I get the piece made*: it takes weeks, involves an
outside workshop, its register lives outside the session, and it stays alive
after the plan is closed, because the piece still has to arrive and be measured.

So it is step 7 of 8, between Dispositivos and Informe, and it is **optional** —
most cases are served by a catalogue clip and never go near it. The rail labels
it as such: a new step between two mandatory ones reads as mandatory unless
something says otherwise.

It took the manufacturing sheet (STL and dossiers) and the order workflow out of
the clips tab: **844 lines, more than a third of a step that held ~2,270.**

Two things that had to move with it. The step list was written out **four
times** — the workspace rail, the landing page, the patient sheet and the study
gallery — and sessions store the step they were saved at as an **integer**. With
four copies, inserting a step renumbers some views and not others; and every
session saved on «Informe» (index 6) would have resumed on «Fabricación». The
list now lives in `frontend/src/pipeline/steps.ts` alone, and a recorded
migration renumbers saved sessions once. Data migrations that are not idempotent
now register themselves in `applied_migrations` rather than relying on luck.

### The perforator detector was measuring the triangulation, not the vessel

Asked to explain what the feature does. Its docstring states the premise:
«Branching points have significantly higher vertex valence than straight vessel
segments». Measured on a marching-cubes isosurface with three real bifurcations,
that premise does not hold:

    valence:  median 6.00 · std 0.31 · range 4-8

On a manifold triangulation every vertex has ~6 triangles wherever it sits —
valence describes the mesh, not the shape. With the threshold it used (z ≥ 1.5)
the result was worse than chance:

    near a junction ..........  30.3 % of the surface
    of the FLAGGED vertices ..  20.9 %      → enrichment ×0.69

A flagged vertex was *less* likely than a random one to be at a branch. And the
`radius_mm` the API reported as «estimated vessel radius» was the constant 0.4,
identical for every candidate, because the valence algorithm computes no calibre.

**`services/branch_origins.py` measures calibre instead**, which is what a branch
actually is — a thin tube attached to a thick one:

1. Rasterise the interior (`vtkPolyDataToImageStencil`: 42 M voxels in 0.1 s,
   against minutes for `vtkSelectEnclosedPoints`).
2. Euclidean distance transform → distance to the wall.
3. From each vertex, march inward along its normal and keep the largest distance
   found: the radius of the tube that vertex belongs to. A max over a cubic
   window cannot do this — the window must be at least as wide as your own
   radius to see your own axis, and once it is that wide a branch vertex reaches
   the *trunk's* axis and stops looking thin. The march stops on leaving the
   vessel, so a neighbouring artery cannot lend its radius.
4. Connected thin regions are branches, accepted only if what they attach to is
   ≥1.6× thicker — which is what separates a branch from a vessel that tapers.

On the same synthetic tree: **3 of 3 junctions, at x = −6.01, 3.00, 7.97**
(truth −6, 3, 8), with the calibre and the parent calibre measured rather than
assumed.

### The feature is now called what it is

«Perforantes» promised something the imaging cannot give, in both directions: no
row was necessarily a perforator, and an empty list was being read as «there are
none» when it means «none are visible».

It reads **«Ramas cerca del cuello»** now — in the panel, in the workflow rail,
in the viewer legend and on the landing page — and says the rest out loud:

- each row carries its **measured calibre** (`⌀1.1`), where every row used to
  show the same 0.4 mm constant under an API field that called it «estimated
  vessel radius»;
- with results, a line stating that these are not perforators and why: below the
  scan's calibre floor the image does not resolve a vessel, and a perforator is
  0.1–0.5 mm;
- with no results, the same floor turns «none found» into «none visible above
  N mm», which is the only claim the scan can support.

The endpoint description says the same, so the OpenAPI page cannot promise
perforators either.

### Why the scan runs at segmentation and not later

The question that prompted this: after cropping the mesh to a box or a sphere,
where are the branches in the full tree?

Cropping **overwrites `vessel_tree.vtp`** — the endpoint's own description says
«re-run segmentation to restore» — and the analysis reads that file. Measured on
the test tree cropped to ±5 mm: the junction at x = −6 is simply gone, and the
open rim left by the cut reads as thin-attached-to-thick, **inventing an origin
at x = −4.3 where no junction exists**.

So the scan runs on the full tree the moment segmentation finishes, and its world
coordinates are frozen into the session. They keep landing where they belong over
the cropped mesh, because it is the same coordinate frame. The detector also
ignores open boundary rims now, so a cut can no longer manufacture a branch.

**What it still is not.** A true perforator is 0.1–0.5 mm and CT or MR
angiography does not resolve it, so it never reaches the mesh. This finds
*visible branch origins*. The result carries `calibre_floor_mm` — the diameter
the voxel size cannot resolve — so an empty list cannot be read as «there are
none».

### The verdict was breaking one letter per line

Reported from the application with a screenshot. «Recomendación: TRATAMIENTO
ENDOVASCULAR» rendered as `TRAT / AMIE / NTO / ENDO / VASC / ULAR` in the 265 px
side panel.

The heading shared a flex row with badges that do not shrink, and it carried
`overflow-wrap: anywhere`. Adding the coverage badge left the text roughly sixty
pixels, and `anywhere` does exactly what it says: it breaks mid-word rather than
overflow. The heading now owns its line and the badges wrap on their own row
below, with normal word wrapping — no rule that can shatter a word.

**And the provenance was shouting.** Every factor carried its full source
underneath, so seven factors meant seven paragraphs burying the thing being read.
The sources are now one line each — the long reasoning lives in the PDF and in
this file, where there is room — and they sit behind a «Ver procedencia» toggle,
folded by default. Still there, no longer in the way. The endovascular profile's
copy was trimmed on the same grounds.

### A recommendation outliving the measurements it came from

`_clear_detection_state` had guarded this since it was written, with the reason
next to it: «leaving them behind made the PDF recommend a treatment for an
aneurysm the same PDF reported as unmeasured». It guarded the re-detect path.
Two routes by which the same numbers change in ordinary use were not guarded.

**Re-measuring the neck by hand.** The automatic morphometry of an open detector
cap reports a neck of 0. The clinician evaluates the treatment anyway — the neck
factor is skipped — then marks the neck plane and the neck becomes 3 mm.
Measured, before the fix:

    2) decisión: CLIPPING QUIRÚRGICO · cobertura 59 %   ← computed with neck 0.0
    3) neck re-measured by hand: 2.99 mm (manual)
    4) stored decision: CLIPPING QUIRÚRGICO             ← the old one, untouched

The report would print a hand-marked 2.99 mm neck beside a recommendation
computed when that neck did not exist.

**Recomputing PHASES.** Since the small-aneurysm branch started consulting the
risk band, correcting the hypertension flag or a previous SAH changes what the
engine would have answered, and nothing told the stored decision.

Both now invalidate — and **only when the number actually changes**. That
condition is not caution, it is required: resuming a session re-runs the
morphometry to replay the hand-marked plane, so clearing on every read would make
the decision vanish by opening the step.

The frontend keeps its own copy, so it had the same hole on both routes.
`DetectPanel` and `MeshEditTools` already cleared it; `MorphometryPanel` and
`PhasesCalculator` were the two that had been missed.

**Still open, and deliberately not fixed here:** placed clips survive a neck
re-measurement. Their coordinates are what the surgeon chose, so a clip is not
wrong — but it was placed on the neck *as it was measured then*, and after
re-marking it may no longer sit on it. Silently deleting someone's placed devices
because they refined a rim is the wrong fix; the right one is a warning, and that
needs a design decision rather than a patch.

### The shape indices stopped voting and started describing

Three of the eight factors — aspect ratio, bottleneck factor, undulation index —
came from rupture-risk literature (Dhar 2008, Raghavan 2005). Neither paper
studies the choice between clipping and coiling, and neither validated
modality-selection model uses a shape index. They were 42 of the available
points.

Looking for where morphology *does* have backing turned up something sharper than
«unvalidated». The engine gave **+20 to endovascular for AR > 2**, reasoning
«geometry favourable for coiling». The most direct evidence about aspect ratio and
coiling says the opposite about durability: **AR ≥ 1.6 is associated with
recanalisation, OR 4.15 (95 % CI 1.57–11.00)**, in 307 unruptured aneurysms with
79 months' mean follow-up (Neurol Med Chir 2022).

Both claims are true and they are about different moments. A deep dome on a narrow
neck holds coils well on the day and recanalises more afterwards. Collapsing that
into one vote lost exactly the distinction that matters, so now both are said.

**`services/endovascular.py`** describes the endovascular option instead of voting
on it, using the morphology that is published for that question:

| what it says | from |
|---|---|
| Coiling simple / asistido (balón o stent) | the wide-neck definition exists *because* it predicts the need for adjuncts, with a measured gradient: above 1.6 usually not needed, below 1.2 almost always (Brinjikji, AJNR 2009) |
| Valorar diversor de flujo | large and giant aneurysms, and it prints the complication figure rather than burying it — up to 25 % in giant ICA (2026 meta-analysis, 1 893 patients) |
| Durabilidad | the AR/recanalisation odds above, framed as «plan the follow-up», not as a contraindication |
| Domo irregular | stated as a caution and explicitly labelled a **rupture-risk** index with no validation for treatment outcome — reasonable is not the same as measured |

The profile is computed **even when clipping wins**: a multidisciplinary session
compares both options, and describing only the winner leaves half the conversation
out of the report.

The three indices are still shown on the panel and in the PDF, tagged «no puntúa»
with their reason — the same pattern as the closing force and the blade opening in
the clip selector. Deleting a measurement because it cannot vote hides it; showing
it with its provenance leaves it arguable.

Two consequences worth stating. The engine's voting factors are now neck, DNR,
size, location, rupture, age, WFNS and Fisher — which is the shape the validated
models have, six clinical and anatomical against two morphological, rather than
the reverse. And a missing aspect ratio no longer costs confidence in the
decision, because it no longer decides anything; it costs detail in the profile,
which the profile says for itself.

### The engine now scores what the validated models score

A literature review of the clip-vs-endovascular decision turned up a gap that was
about variables, not weights: the two published models that actually choose a
modality — the Japan Stroke Data Bank score (Neurol Med Chir 2020, 3 547 patients)
and SHARP — are built on age, WFNS grade, Fisher grade, prior stroke, size and
location. This engine had six morphological factors and none of the clinical ones.
Age was collected and thrown away; WFNS and Fisher were not collected at all.

Three factors added, each with the published structure it was mapped from:

| factor | direction | mapped from |
|---|---|---|
| Age ≥ 80 / 72–79 | endovascular, 12 / 6 | the Japan model penalises clipping from 72 and coiling only from 80 — advanced age tolerates surgery worse. Weight held down on purpose: the 2025 meta-analysis of 51 415 patients ≥60 found no outcome difference, only shorter stays |
| WFNS ≥ 4 / = 3 | endovascular, 15 / 8 | the heaviest variable in the validated model, and it penalises clipping from a lower grade than coiling |
| Fisher 4 | clipping, 10 | the validated model penalises *coiling* at Fisher 4, and a bulky haematoma can be evacuated in the same operation |

**And rupture went from 15 to 30.** It rested on the strongest evidence the engine
touches — AHA/ASA 2023 Class I, LOE A — and was outweighed by a single location
factor: a ruptured MCA aneurysm came out of the engine leaning toward *clipping*,
the opposite of the guideline when the case is equally suitable for both. The
number comes from a rule that can be argued with, and is written down so it can
be: a Class I LOE A recommendation must not sit below any other single factor,
and the largest of the others is 25.

    ACM no roto                     saldo +20  →  CLIPPING QUIRÚRGICO
    ACM ROTO                        saldo −10  →  DISCUSIÓN MULTIDISCIPLINARIA
    ACM roto + WFNS 5               saldo −25  →  TRATAMIENTO ENDOVASCULAR
    ACM roto + WFNS 5 + Fisher 4    saldo −15  →  DISCUSIÓN MULTIDISCIPLINARIA
    Basilar ROTO                    saldo −55  →  TRATAMIENTO ENDOVASCULAR

### «What if the fields are empty?» — nothing is mandatory, and two cannot be

WFNS grades a subarachnoid haemorrhage and Fisher grades the blood on a CT. For an
incidental aneurysm neither exists, so neither can be required, and the panel only
asks for them when the case is marked as ruptured.

Nothing else is required either — a missing input has always just skipped its
factor. What was wrong was the reporting. Confidence came from |balance|, and the
balance grows by *adding factors*, so it measured how much data existed rather
than how much was known:

| data available | before | now |
|---|---|---|
| everything | Alta | 100 % · Alta |
| neck + AR + location | **Alta** | 59 % · Moderada |
| neck only | **Moderada** | 33 % · **Baja** |

A verdict from one measurement was being presented as moderately reliable. The
result now carries `coverage_pct` — the share of the *available weight* the engine
could evaluate — and `missing_inputs`, naming what it did not see. Confidence is
capped by coverage, because agreement among the factors that were seen cannot make
up for the ones that were not.

One distinction the coverage keeps: a **neutral** factor is not a **missing** one.
An 8 mm diameter falls in the 5–12 mm band and scores nothing, but it was known —
the engine looked and decided it does not tilt. Only genuinely absent inputs cost
confidence.

### The rupture risk the app had already computed did not reach the decision

PHASES lives in the morphometry step and estimates a 5-year rupture risk. The
clip-vs-endovascular engine lives two steps later and takes eight inputs, none of
which is PHASES. The only thing connecting them was a button that clears both.

That was tolerable while they answered different questions — PHASES asks whether
to treat, the engine asks how — except the engine also answers the first one: an
aneurysm under 3 mm short-circuits to «VIGILANCIA ACTIVA», confidence **Alta**,
before evaluating a single factor. On diameter alone. So:

| same 2.8 mm aneurysm | PHASES | 5-year risk | engine said |
|---|---|---|---|
| Finnish, hypertensive, prior SAH, ACoA | 14 | **17.0 %** | vigilancia activa, confianza Alta |
| no risk factors, ICA, general population | 0 | **0.4 %** | vigilancia activa, confianza Alta |

Forty-two times the risk, same verdict, same stated confidence — two screens of
one application contradicting each other about one patient.

The shortcut now reads the stored score. A low or moderate risk still gets
surveillance and cites the figure; **a high one returns «discusión
multidisciplinaria»** and prints both numbers, because the two disagree and
saying so is more useful than picking one. With no PHASES computed the verdict
stands but confidence drops to Baja and the note says the recommendation rests on
diameter alone. A ruptured aneurysm never reaches the branch at all: PHASES is
validated on incidental aneurysms and says nothing about one that has bled.

No new threshold was invented for this. The bands are the ones `phases.py`
already applied, and where the app cannot resolve the comparison ESO 2022 frames
— rupture risk against procedural risk, and the procedural risk is not in this
application — it stops pretending the comparison is resolved.

### Every weight now says where it comes from

Two different things were being called evidence-based. The **thresholds** mostly
are published: a 4 mm neck and a dome-to-neck ratio of 2.0 are the standard
wide-neck definition (Brinjikji, AJNR 2009). The **weights** are not — no
published model assigns 25 points to a wide neck and 20 to an MCA location, and
nothing in this repository attributed them.

Every factor now carries a `source` naming both, and it travels to the panel and
into the PDF under the factor name. Three things it makes visible:

- the heuristic weights say `heurístico, sin fuente` rather than looking derived;
- the Aspect Ratio, Bottleneck Factor and Undulation Index say they come from
  **rupture-risk** literature (Dhar 2008, Raghavan 2005) and are not validated
  for choosing a modality — they are 42 of the available points;
- the rupture factor cites AHA/ASA 2023 Class I LOE A, and notes that its weight
  (15) is below the neck's (25) and the location's (25) despite resting on the
  strongest evidence of the eight.

Sitting in the same file is what a full literature review turned up and this
engine does not do: the two validated modality-selection models — the Japan
Stroke Data Bank score and SHARP — are built on age, WFNS grade, Fisher grade,
prior stroke, size and location. Six of these eight factors are morphological
instead. Age and comorbidities are collected here and deliberately not scored;
WFNS and Fisher are not collected at all.

### The bar was reading as a probability

«CLIP 72 % · ENDO 28 %» is the ratio of two heuristic sums normalised to 100. It
is not a probability, not a proportion of patients, and not a confidence
interval. The bar stays proportional — that is what a bar is for — but the figure
is now the points that were actually added, with a line saying what they are.

One thing had to be fixed to make any of this visible: the engine computed
`notes` and threw them away. `_to_dict` never emitted them, the model had no
field, and the report's notes loop had always printed an empty list. The whole
reasoning of the small-aneurysm branch — the part that now carries the PHASES
comparison — had never left the engine.

### Every placement collided, because the neck counted as an obstacle

Reported from the application: «I have tried several clips and there is always a
clip–vessel collision». There was. `POST /clips/plan` tested the clip against the
whole vessel mesh — sac and neck included — so it was asking «is the clip where it
should be?» and reporting «yes» as a collision. Closing on the neck is the
manoeuvre.

Measured on one geometry across the six rolls the verification uses:

| | whole tree | neck carved out |
|---|---|---|
| clean rolls | **0 of 6** | **4 of 6** |
| contacts at 0° | 1331 | 539 |
| contacts at 90° | 677 | 0 |

Every placement looked fouled, and the two rolls where the clip's body really did
sweep the parent vessel — 0° and 150° — were buried in the noise, which is the
part of the check worth having.

`clip_fit` had carved the neck since it was written; `test_clip_selection` even
says why, in a comment: «Without this every clip "collides", because the neck IS
vessel.» Only the placement path never learnt it, so the panel that judges a
candidate and the panel that places it disagreed about the same clip on the same
mesh. They now use the same obstacles, and there is a test that asserts they
agree roll by roll.

Two things came with it. `collision_detected` now means «touches anatomy outside
the neck», which is what a surgeon can act on, and the panel's label says which
question was answered rather than showing a bare Yes/No. And when no neck has
been measured the region cannot be carved: rather than report a number that
cannot separate the two cases, the result carries `neck_region_excluded: false`
and says the check needs morphometry to mean anything. The contact count is still
shown — what is withheld is the interpretation, not the data.

**The clips are not oversized.** A 7 mm jaw on a 5 mm neck is the coverage the
selector aims for; the 18–25 mm behind it is the spring and the grip, which the
applier holds outside the field. That body can foul the vessel at a bad roll, and
now that the noise is gone, the check says so.

### The blades never opened as far as the mechanism does

Noticed from the application, watching the rehearsal: the jaw did not look wide
enough for the neck it was going onto. Two separate things behind that, and only
one of them was a bug.

**The angle was solved with a tangent.** `blade_swing_deg` set the swing so that
`lever · tan θ` equalled the half-gap. But a blade tip does not slide along a
line at the end of the lever — it rides an arc, so turning by θ carries it
`lever · sin θ` sideways, and sin θ < tan θ. Every clip in the rehearsal opened
short of its own applier: measured, 2.0 % on the 22 mm jaw up to 6.7 % on the
10 mm one, always in the same direction, never wide. Arcsine now, and the tips
part by exactly the specified opening on all six drawn sizes.

**And a whole dimension was going unjudged.** The jaw LENGTH has to span the
neck; the OPENING is perpendicular to it and is capped by the applier rather
than the blade — a 22 mm jaw parts no further than a 10 mm one. The criteria
were `coverage`, `reach` and `force`, none of which looks at that axis, so a
15 mm neck was handed a 19 mm jaw, correct on everything it was asked, whose
tips never part beyond 10 mm. Nothing said so.

There is an `opening` criterion now, and it **warns without voting** — weight
0.0, like the closing force, but for the opposite reason. The force is a
constant and cannot rank anything; the opening discriminates perfectly well, and
the problem is that how much clearance over a neck is enough is a clinical
judgement nobody here has signed. Weighting an unvalidated threshold would
reorder the list on an opinion. The arithmetic is not an opinion: the tips part
this much, the neck measures that much, and when the first does not exceed the
second it says so — along with whether the figure is the designer's or inferred
from commercial clips.

### The custom jaw was a picture, not a piece

`CustomJawOut` carried a preview mesh and an STL and no id. So a made-to-order
length could be dialled, looked at and downloaded — and not placed. It never went
through the collision check, never reached `placed_navarro_id`, and the order
form went back to the length derived from morphometry instead of the one that
had just been chosen. The same number typed twice in two screens, with nothing
holding them together: the shape of the bug the Sugita report was about.

The id was already expressible — `navarro:t1:0:8.5` parses and `mesh_for_id`
rebuilds that exact mesh, verified identical across straight, angled and
fenestrated — it simply was not being emitted. Now it is, the sheet offers
«Elegir esta medida» through the same `onPick` the candidate cards use, and the
length chosen on Dispositivos is the length Fabricación prefills.

One thing that had to move with it: the rehearsal read the jaw off the catalogue
index, which holds only the drawn sizes, and fell through to the lever arm for
anything else. For a custom 8.5 mm jaw that is 11.4 mm — past the 10 mm ceiling
— so the application would have shown a wider opening than the piece has and
labelled the figure specified when it is still inferred. It reads the jaw off
the id instead.

### The report did not know the device was still being made

Fabricación went in between Dispositivos and Informe, and the Informe was never
told. `report_generator` reads placed devices out of `device_state` and nothing
else, so the PDF printed «NAVARRO™ T4 Fenestrado ventana 5 mm, mordaza 8.5 mm»
and stopped — identically whether that piece was in the surgeon's hand or still a
drawing at a workshop three weeks out. A name says nothing about whether anyone
has made one.

The report now carries the order: number, piece, state, workshop, and what was
measured on the piece that came back. Three things it insists on.

**A piece outside specification is not a footnote.** Reception is the only place
the closing force stops being a design target, so a piece outside the band gets
its own sentence, in bold, saying not to implant it without the responsible
surgeon accepting the deviation in writing.

**The standing condition is stated on every made-to-order piece**, not only the
ones that go wrong: it is not a device with market approval, and its closing
force is a design target until it is measured.

**Nothing is said when there is nothing to say.** Most cases take a drawn size,
and a «no manufacturing order» heading on every report is noise that trains
people to skip the section on the reports where it matters. The one exception is
the case worth catching: a custom jaw placed with no order on file for the
session — a report describing a device that does not exist and that nobody has
asked anyone to make.

### The one shape the case can ask for and the family cannot draw

Filed as a housekeeping item — «BAYONET is still admitted in a couple of enums»
— and it was not housekeeping. `_preferred_shape` reads a region table, and the
paraclinoid carotid table rates BAYONET **first**, at 1.0. That is one of the
commonest locations there is, and the reason is real: a deep field under the
clinoid needs the shaft carried out of the line of sight.

The family draws four series and none of them is a bayonet, so
`navarro_shape_for` fell through its final `return STRAIGHT`. A paraclinoid case
was offered a custom jaw in the *straight* series — the worst of the four for
that field, because a straight clip is precisely the one whose shaft stays in the
way. Silently, with the reason text talking only about millimetres.

It now falls to ANGLED, which is what the family has that does the bayonet's job,
and the offer says it substituted:

> La familia no dibuja bayoneta: se ofrece angulada, que es lo que aparta el
> mango de la línea de visión en un campo profundo.

**What was already right and stayed untouched.** `resolve_perfect_clip` refuses a
bayonet outright — «Sin pieza ni sustituto: replantear el abordaje, o esperar a la
serie bayoneta» — and that is the correct answer for MANUFACTURE, as opposed to
for an offer. And `clip_library.VALID_SHAPES` keeps BAYONET on purpose: a hospital
can physically hold a bayonet clip, and the library records what is on the shelf,
not what this family makes. There is a test for each half, so the two do not get
levelled into one another later.

Two smaller things in the same pass: `services/__init__` still described `clips`
as a «Surgical clip library (42 models)», which stopped being what that module is
for; and `routers/clip_orders._shape_for_angle` was dead code that could only
ever return straight or angled — a sixth copy of the naming rule, waiting to be
called.

### The landing page was advertising the catalogue that was withdrawn

The one page a stranger reads before deciding whether any of this is worth their
time, and the last one anybody updated. It offered «42 modelos» from Aesculap,
Sugita and Codman months after those clips stopped being served — a catalogue the
application does not return and this institution cannot obtain — and promised a
«siete pasos» workflow directly above the eight step chips it draws from `STEPS`
itself.

Both are the same mistake: a hand-written claim sitting next to the data that
contradicts it. The step count is now spelled from the list. The clips card names
the family that is actually offered, with the four series and what is adjustable
about them. And «Fabricación» — a whole pipeline step, with an order, a workshop
and a dossier — was missing from the feature list and from what the page says you
receive; omitting the new is the other half of advertising the withdrawn.

`Landing.test.tsx` ties the copy to the data: the spelled number has to match
`STEPS.length`, every step label has to appear, and no withdrawn maker's name may
appear anywhere in the rendered page.

The animated walkthrough the page plays, `public/media/pipeline-hf.mp4`, was the
last copy of the seven-step claim: rendered in July, before the manufacturing
step existed, with «PASO 0N / 07» burnt into the pixels. Its source is a
HyperFrames composition in `frontend/hyperframes/pipeline-hf/`, so fixing it
meant editing the composition and re-rendering, not editing text.

Fabricación now has its own card between Dispositivos and Informe, labelled as
the optional step it is. The devices card was carrying the same withdrawn
catalogue the page did — «42 clips» were the Yasargil, Sugita, Aesculap and
Codman ones — and now reads «66 clips NAVARRO™ · 39 coils · stents».

Two things the extra 2.33 s forced. The video is 23.4 s → 25.7333 s (772 frames
at 30 fps), so the outro and the timeline loop moved with it. And the background
is one 12.200 s plate repeated, which no longer covered the running time in two
passes: there is a third now, and all three cuts were moved onto scene changes
— 11.5333 s is where Morfometría starts, 23.2 s the outro — so the jump in the
plate lands inside a cross-fade that was already there. Re-encoded at the same
1.55 Mbps the original used: like for like, 2.33 s longer.

Rendering it needs FFmpeg on PATH, which this machine did not have. Playwright
ships one built `--disable-everything` (VP8/WebM only — it cannot even decode the
h264 plate), and `imageio-ffmpeg` in the backend venv has a full build but no
`ffprobe`, which the renderer probes media with.

### A piece named by its bend alone

Five copies of one rule: how a piece of this family is named. `navarro`, the
order dossier, the order form, the orders register and the custom-jaw offer each
had their own. Three of them derived the name from the BEND — and a bend of zero
is the only thing a straight clip, a curved clip and a fenestrated clip have in
common.

So a curved order and a fenestrated order both read «recto» on screen, while the
delivery note the workshop received said «Curvo» or «Fenestrado ventana 5 mm».
The surgeon and the workshop were naming different pieces and believed they were
naming the same one. The custom-jaw offer did it to itself in a single object:
`shape` said `fenestrated` two fields above a `label` that said «T4 Recto».

The `shape` field was already there in every one of them. One function now, per
side: `navarro.shape_label` and its mirror in `components/planning/clipShape.ts`,
tested against the same pieces.

### Verification measured a different clip from the one being placed

Placement has always used the drawn mesh. `clip_fit.build_candidate_mesh` swept
boxes from the catalogue dimensions instead, so the collision test and the
coverage figure described a different object from the one that appears on the
neck — and the panel presents those numbers as a check on the clip you chose.

Worse, it read the bend off `shape`, the selector's COARSE class, which the
family outgrew when it started bending in 15° steps. Six drawn bends collapsed
onto two: 15° and 30° were verified as a 45°, 60° and 75° as a 90°. Four of the
six angled variants were checked against a bend they do not have, on the one
criterion — clearance around the parent artery — where the bend is the entire
point.

It now loads the drawn geometry by id, the same mesh placement uses, and falls
back to the approximation (with the real `bend_angle_deg`) only for a library
entry that has no mesh on disk. The end-to-end span of the six angled variants
now differs six ways and shrinks as the bend grows, which is the shape of the
truth: a clip that bends more reaches less far.

### The picker was still serving the catalogue that was withdrawn

Found by auditing what the recent changes left behind, not by a report. Dropping
the commercial clips turned off `OFFER_COMMERCIAL_CLIPS`, and `select_clips`,
`catalogue_with_library` and the placement index all honoured it. Two endpoints
did not: `GET /clips` and `GET /clips/recommendations/{sid}` still read
`CLIP_CATALOGUE` directly.

That is what fed the model picker on the devices step. So the panel above it
argued for a NAVARRO™ clip while the dropdown below offered eight from Yasargil,
Sugita, Aesculap and Codman — and preselected the first. Worse, the ids did not
match anything: the listing slugged clip NAMES while the placement index keys on
`identifier`, so every option was an orphan. `POST /clips/plan` does not reject
an unknown id — it logs and places a default 9 mm box. Choosing a clip and
getting a generic block, silently, is the same failure the Sugita report was
about, alive through a second door.

Three causes, three fixes. `spec_to_api` emits `identifier` instead of a slug of
the name. `catalogue_to_api` defaults to what is offered rather than to the
reference table. And the recommendations endpoint delegates to `select_clips`,
so there is **one ranker in the application** instead of two that could disagree
about which clips, in what order, under what ids.

One thing survived the merge deliberately: a session whose neck cannot be
measured — an open mesh — still gets a ranking against a typical 4 mm neck,
because answering with an empty picker blocked clip placement outright while the
coil catalogue stayed available. There is a regression test for that from the
first time it happened. What changed is that every line now says «orden general,
no específico de este caso». The version this replaces returned a generic
ordering that read exactly like a case-specific one.

### Resuming a session landed one step before where it was saved

`current_step` is stored as a NUMBER, and the resume path clamped it to `6` —
written by hand when the pipeline had seven steps. Inserting «Fabricación»
between Dispositivos and Informe made it eight, and the backend migrated saved
sessions from 6 to 7 on purpose, with a named migration. The clamp undid that
migration from the other side: a session saved on **Informe** reopened on
**Fabricación**, a step that user had never opened.

The number is gone. `clampStep` lives in `pipeline/steps.ts` next to the list
that defines it, which is the whole point of that module — its own docstring
warned that four hand-written copies of the step list would drift, and this was
the fifth copy, hiding as a magic number.

### A jaw made to size, in every series that can take one

The geometry always did this correctly — straight, angled and fenestrated all
come out the exact length asked for, measured on the mesh. The two paths that
EXPOSE it did not. `suggest_custom_jaw` derived only a BEND from the winning
candidate and never a shape, so a bifurcation case was offered a custom straight
jaw: the wrong piece at the right size, the same silent substitution the
commercial fallback used to make. And the endpoint that builds the preview had no
shape or window parameter at all, so a fenestrated custom jaw was unreachable.

Both now carry the shape and the window. The curved series still has no custom
size — its jaw is an arc — but that is a fact about the curved series, not an
answer to «can I have this exact length», which is yes in the three that stretch.
Returning nothing told the surgeon that, and hid the offer from most cases the
moment curved clips started winning ties.

### «Elegir» and «colocar» are two tabs

The clips tab held the reasoning, the rehearsal, the model picker, the placed
list with its coordinates, and the verification in one column past a thousand
pixels: moving a clip a millimetre meant scrolling past the whole recommendation
again. They are two tasks — which clip, and where it goes — and they now read
separately. The state is shared, so choosing in one places in the other, and the
sub-tabs sit at `size="sm"` because two bars at the same weight read as two
choices of equal rank.

### The recommendation, after the catalogue became one family

Measured across nine cases once the family was the whole catalogue: the top two
candidates scored **identically in eight of them**, the whole top five sat within
0–7 points, and a deep dome and a plain neck came back with the same five clips.
The selector was built to choose among 42 clips from four makers; pointed at 66
variants of one family — same body, same alloy, same uncharacterised force band —
it had stopped separating anything. Three causes:

**A criterion that is constant cannot rank, only dilute.** The closing force
scored 0.60 on all 66, and took a third of the weight doing it. It now carries
weight 0 while the band is provisional. It is not hidden — the caveat stays on
screen, and a band that could not hold the neck still fails the clip outright.

**The list did not answer the question being asked.** Six T3 angled 7 mm
differing only in bend, while the straight, curved and fenestrated never
appeared. «Straight, curved, angled or fenestrated» is the decision; «60° or 75°»
is a detail inside it. Each shape now contributes its best candidate, and no
shape takes more than two of the six slots. Scoring 90° above 60° above 45° also
went: what a bend buys is a shaft clear of the sac, which any bend gives, and how
much bend is best is not something the measurements answer.

**A warning that scored zero was indistinguishable from a failure.** The coverage
Gaussian bottoms out well before the ratio becomes disqualifying, so a 3 mm neck
came back with six clips at 0.00 points labelled usable. A `warn` means usable
with a caveat, so it keeps a floor; zero goes back to meaning what `fail` means.

Result: the top-five spread went from 0–7 points to 15, and the number of case
pairs returning near-identical lists fell from eight to three. **Ties at the top
are still common, and are now said out loud** rather than resolved by an
arbitrary tie-break — with most of what used to separate clips now identical,
a tie means the measurements do not choose, and the shape is the surgeon's call.

### Where a bent clip actually sits

`pose_transform` puts the device's origin on the neck and aligns its +Z with the
neck normal, so «on the neck» means two things: the jaw's middle at that origin,
and the jaw square to that normal. A bent clip failed both, and each failure had
its own cause.

**The rotation turned the shaft into the plane, not the jaw.** A flat −90° put
the file's long axis in the neck plane — and the long axis is the shaft, so the
blades came out lifted by exactly the bend: `sin(60°)` of the jaw off-plane at
60°, two thirds at 90°. On screen the blades hovered beside the aneurysm. An
angled clip IS blades at an angle to the shaft: the blades go on the neck, the
shaft is what comes in angled. The turn now follows the JAW direction, which
lands all four series on the device's X, inside the plane.

**The centring assumed the jaw ran through the file's origin.** It does for a
straight clip and not for a bent one — the knee lifts the jaw sideways, 2.69 mm
for a 90° design — so the blades ended up in a plane *parallel* to the neck.
Right attitude, wrong height: a 13 mm jaw covered 64 % of a 6 mm neck. The middle
along the jaw axis is still `root + jaw/2` by definition (the measured centroid
is biased toward the root, because the jaw is tapered), but the offset ACROSS the
axis is now measured off the mesh, where it was being assumed to be zero.

All nine drawn configurations now span 100 % of a 6 mm neck, and
`test_the_blade_actually_closes_on_the_neck` keeps them there with the same
`plane_span` figure the plan reports as coverage.

### The clip you chose is the clip that gets made

Reported from the application: a Sugita curved stayed as the chosen device after
a NAVARRO was picked, fabricación then refused to personalise it, and the
workshop dossier printed the Sugita. Three faults met in that one symptom.

**A race in the devices panel.** The effect that preselects a default clip closed
over `sel` as it was when it ran — empty, on mount — so a pick made while
`/clips/recommendations` was still in flight was overwritten the moment it
landed. A functional update reads the current value instead, and the
preselection is what it was meant to be: a default for an empty box, never a
correction.

**The placement recorded a name, not an id.** So nothing downstream could tell a
T1 from a T4, and the manufacturing step re-derived a piece from the
measurements. Recommendation and decision could disagree in silence. The plan now
stores the `clip_id`, and both the dossier and the order form start from the clip
that was PLACED — advice loses to a decision.

**The fenestrated path had no family answer**, so a bifurcation case fell through
to a commercial clip by construction. With T4 drawn, it no longer can.

### Requesting a clip

`POST /api/clip-orders/{sid}` turns a recommendation into a real order. Most of
the form is already answered: the system knows the series, the bend, the jaw, the
tolerances and the force band, so the user is asked only what it cannot know —
who answers for the piece, how many, by when, and where it goes.

**Nothing measured is retyped.** The dangerous version of this screen is a blank
form where the surgeon re-enters the jaw length: the moment the typed number and
the STL can disagree, a workshop receives a dimension nobody derived. Changing a
computed figure is allowed — it is the surgeon's call — but it needs a reason,
and the reason is printed in our copy of the dossier next to what the system had
advised.

**A signed order is frozen.** The dimensions are copied into it, not looked up
when it is read. Re-running morphometry afterwards changes what the system would
advise today; it must not change what was ordered and sent.

**Two defects the register exposed and fixed.** The part number used to be
derived from the session and the jaw (`PR-{session}-{jaw×10}`), so two clips
ordered from one session with the same jaw and different bends got the *same*
number — on the only thread between our copy and the workshop's. And the files
had fixed names per session, so a second order overwrote the first one's STL and
dossiers. Orders now take a correlative `PR-YYYY-NNNN` and own a directory.

**Who signs.** `medico` and `admin` sign; a `residente` prepares the draft.
Signing needs a responsible surgeon, a workshop, and three declarations that the
UI may not pre-tick: the measurements are accepted, the closing force is a target
to be measured on the finished part, and the STL is geometry rather than an
approved device. When the intended use is *implant in a patient* the order also
records an authorisation reference — it does not block, it records.

**What leaves the building** is a ZIP with the STL and the workshop's dossier,
and nothing else: no patient name, no case, no session. A person downloads it and
sends it; the application mails nothing on its own.

**The order is not done until the piece is measured.** Reception demands the
measured jaw and the measured closing force — the only point at which the force
stops being a target — and a piece outside the jaw tolerance or the 120–200 g
band cannot be accepted in silence: either it is rejected, or someone states in
writing why the deviation is acceptable and that stays with the order.

**The register is a screen of its own** (`/app/pedidos`), outside the pipeline:
the pipeline walks ONE case, this crosses all of them and answers a management
question — what is ordered, and what is going stale. Reached from the top menu,
or from a patient's sheet, which opens it already filtered by that patient, so
one view serves both questions.

Two things separate it from a plain table. It **sorts by what is rotting**, not
by creation date: an order sent forty days ago with no news matters more than one
signed yesterday, and the thresholds follow the state — three weeks for a
workshop, one for a piece already in the building that nobody has accepted or
rejected. And it **surfaces pieces received out of specification**, which is
exactly what must not be buried in a list.

**Workshops are typed once**, and have a screen of their own (`/app/talleres`).
A workshop entered in an order form is saved and picked from a list next time,
but that was the ONLY way in — and the order form does not render at all when the
NAVARRO™ family cannot build the shape the case asks for, so a fenestrated case
had no door to the workshop directory, and registering the workshops of an
agreement up front meant opening an order and deleting it. Registering who
manufactures has nothing to do with whether THIS case is buildable.

Anyone may add and correct one — a surgeon placing an order needs to. Deleting is
admin-only, because a deleted workshop leaves everyone's list. Neither rewrites
history: orders copy the workshop's details at signing, so a past order still
says where it was actually sent. The screen also carries the two fields the order
form never asked for, `tax_id` and `notes`, which a real agreement needs.

**Sterilisation and marking are stated assumptions, not policy.** Nobody has yet
confirmed how this institution handles either, so the order assumes the hospital
sterilises (a machine shop rarely delivers sterile, and titanium takes steam) and
that the part number is engraved on the **body** — never on the jaw, which is the
dimension measured against the neck, and never on the spring, where a mark
concentrates stress exactly where the closing force comes from. Both assumptions
are written into the two dossiers so the workshop can contradict them before
cutting metal.

### The clip library

`clip_library/` is a global, persistent store outside `data/`, holding two kinds
of entry: `stock` clips the institution actually owns (these join the built-in
catalogue when a case is scored) and `template` manufacturing designs (which
never compete as stock — a design nobody has made is not something to reach for
in theatre).

From an uploaded mesh the store measures the **oriented** bounding box and the
volume. Everything else is declared on import, and the reason is worth knowing
because it looks automatable:

- **Closing force** is a property of the spring and the alloy. No geometry
  carries it, so a `stock` clip without one is refused rather than stored with a
  zero that would silently sink it in every ranking.
- **Shape and fenestration** could in principle be inferred, but a CAD export is
  rarely a clean closed manifold and the inference fails quietly on exactly the
  irregular meshes where it would matter. `POST /api/clip-library/measure`
  offers a hint to pre-fill the form; it is labelled a suggestion.
- **Blade width and height** cannot be separated from the jaw opening by a
  bounding box — across that axis the envelope is two blades plus the gap — so
  the stored figures are named `envelope_*`.

### What this is not

The geometric criteria are arithmetic on measured quantities. The clinical
preferences (shape per region, closing-force windows) are heuristics from Lawton
2011, Molyneux and Pierot & Wakhloo, **not validated against annotated cases** —
there is no ground truth in this project to validate a ranking against. The panel
is assistive and always shows its reasons; it does not choose a clip.

Whether a branch actually runs through the neck is not visible in the isolated
sac mesh, so "consider a fenestrated clip" is raised once as a case-level
caveat, never as a defect on each non-fenestrated clip. A warning that fires on
almost the whole catalogue stops carrying information.

---

## Navigation & Unsaved Work

The frontend uses a **data router** (`createBrowserRouter`), and the URL is the
source of truth for which screen is showing — Back/Forward, a refresh and a
shared link all land where the user expects, instead of resetting to the patient
list.

That matters because saving is manual. Leaving the pipeline throws the working
session away, so an accidental click on the logo — or a press of the browser's
Back button — used to cost an entire analysis without a word. The workspace now
marks itself dirty as soon as a step produces a result worth keeping, and:

- `useBlocker` intercepts **every** router navigation, including Back/Forward,
  and raises a confirmation dialog. A hand-rolled guard around the app's own
  click handlers could never see the browser's buttons.
- `beforeunload` covers closing the tab or reloading.
- Resuming a saved session marks it clean again. Rehydration replays the saved
  results through the same setters a real edit uses, so without this a resumed
  session asked to confirm before the user had touched anything.

The dirty flag is set inside the store's setters rather than at each call site,
so a panel added later cannot forget to do it.

---

## API Reference

94 operations under `/api`. Full spec in `openapi.json` or at `/docs`.

**Everything except `POST /api/auth/login`, `/signup` and `/logout` requires a
token.** It travels as `Authorization: Bearer …` or as the `prospective_token`
cookie that login also sets — the browser cannot attach a header to an `<img
src>` or to the requests vtk.js makes for `.vtp` meshes, and those URLs serve
patient imaging.

### Authentication & users

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Obtain JWT (username + password) |
| `GET` | `/api/auth/me` · `/api/auth/me/photo` | Current user + avatar |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `POST` | `/api/auth/change-password` | Change your own (current password required) |
| `POST` | `/api/auth/users/{id}/reset-password` | Reset someone else's (admin) |
| `POST` | `/api/auth/signup` | Public signup (multipart: photo + CV) → *pending* |
| `GET` | `/api/auth/pending` | Pending signup requests (admin) |
| `POST` | `/api/auth/pending/{id}/approve` · `/reject` | Approve or reject (admin) |
| `GET` | `/api/auth/pending/{id}/photo` · `/cv` | Download applicant documents (admin) |
| `GET` `POST` | `/api/auth/users` | List / create users (admin) |
| `PUT` `DELETE` | `/api/auth/users/{id}` | Edit / delete, with anti-lockout guards (admin) |

### Patients, cases & imaging studies

| Method | Endpoint | Description |
|---|---|---|
| `GET` `POST` | `/api/patients` | List / create patients |
| `GET` `PUT` `DELETE` | `/api/patients/{id}` | Full record, edit, delete (cascades) |
| `POST` | `/api/patients/case` | Create patient + clinical case in one step |
| `GET` `POST` | `/api/patients/{id}/studies` | List / add clinical cases |
| `PUT` `DELETE` | `/api/patients/{id}/studies/{sid}` | Edit / delete a case |
| `GET` | `/api/patients/{id}/sessions` | Saved planning sessions of a patient |
| `GET` | `/api/studies` | Gallery: archived imaging studies (`q`, `patient_id`, `case_id`) |
| `GET` | `/api/studies/{id}/thumbnail` | Rendered preview PNG |
| `POST` | `/api/studies/cases/{case_id}/archive` | Archive a session's DICOM under a case |
| `POST` | `/api/studies/{id}/open` | Restore an archived study into a new session |

### DICOM, viewers & sessions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload DICOM files/folder → session + series list |
| `POST` | `/api/upload/{sid}/series/{series_id}` | Switch the active series |
| `GET` | `/api/volume/{sid}/meta` · `/raw` | Volume metadata · raw uint8 volume |
| `GET` | `/api/slice/{sid}/{plane}/{index}` | MPR slice PNG (`wc`, `ww`, optional `lower`/`upper` tint) |
| `GET` | `/api/slice-oblique/{sid}` | Oblique reslice PNG |
| `POST` | `/api/sessions/save` · `/{sid}/restore` | Durable snapshot · rehydrate |
| `GET` | `/api/sessions` | List saved sessions |

### Processing pipeline

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/segment/suggested-band/{sid}` | Auto HU band + strategy used |
| `POST` | `/api/segment/preview/{sid}` | Coarse live preview mesh while tuning sliders |
| `POST` | `/api/segment` | Full Marching Cubes segmentation |
| `POST` | `/api/segment/grow/{sid}` | Region-grow from picked seeds |
| `POST` | `/api/mesh-crop/{sid}` | Box / sphere ROI crop of the mesh |
| `GET` `POST` `DELETE` | `/api/preprocess/{sid}` | Status · resample/smooth/bone subtraction · revert to the DICOM |
| `GET` `POST` | `/api/mesh-restore/{sid}` | Mesh edit history · undo / redo / restore the segmented mesh |
| `POST` `DELETE` | `/api/detect/{sid}` | Candidate detection · clear candidates, morphometry and everything derived |
| `GET` | `/api/morphometry/{sid}` | Morphometric indices with reliability flags |
| `POST` | `/api/morphometry/{sid}/neck-plane` | Neck plane from two clicks, or fitted to points marked around the rim |
| `GET` | `/api/perforators/{sid}` | Perforator risk candidates, with the risk-zone radii used |
| `POST` `DELETE` | `/api/centerline/{sid}` | Medial axis · discard it and any stent deployed along it |
| `POST` | `/api/cross-section/{sid}` | Diameter profile · stenosis |
| `GET` | `/api/longitudinal/{sid}` | Growth history + alert if Δ > 1 mm/year |

### Treatment planning

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/treatment-decision` | 8-factor CLIP vs ENDOVASCULAR scoring |
| `DELETE` | `/api/treatment-decision/{sid}` | Drop the recommendation, its context and the PHASES score |
| `POST` | `/api/phases` | PHASES 5-year rupture risk |
| `GET` `DELETE` | `/api/devices/{sid}` | What the plan has placed · remove one family (`kind=clips\|coils\|stent`) |
| `GET` | `/api/clips` · `/api/coils` · `/api/stents` | Device catalogues |
| `GET` | `/api/clips/recommendations/{sid}` | Ranked clip recommendations (legacy score) |
| `GET` | `/api/clips/selection/{sid}` | Criteria-based selection + manufacturing spec |
| `POST` | `/api/clips/manufacture/{sid}` | STL of the clip this case would need |
| `POST` | `/api/clips/navarro/{sid}` | Build a NAVARRO™ clip at any jaw length (drawn or stretched) |
| `POST` | `/api/clips/animation/{sid}` | Body + blades, hinge and approach run, to rehearse the placement |
| `POST` | `/api/clips/plan` | Places the geometry that was recommended, by structured clip id |
| `GET` `POST` | `/api/clip-library` | Institutional clip store · import (admin) |
| `POST` | `/api/clip-library/measure` | Measure a mesh to pre-fill the import form (admin) |
| `GET` `DELETE` | `/api/clip-library/{id}/mesh` · `/api/clip-library/{id}` | Geometry · remove (admin) |
| `GET` | `/api/clip-orders/prefill/{sid}` | What the request form starts with for this case |
| `GET` `POST` | `/api/clip-orders/workshops` | Workshops on file · register one for reuse |
| `PUT` `DELETE` | `/api/clip-orders/workshops/{id}` | Correct one · remove (admin) |
| `GET` `POST` | `/api/clip-orders` · `/api/clip-orders/{sid}` | The register · place a request (draft or signed) |
| `POST` | `/api/clip-orders/{part}/status` · `/reception` · `/verify` · `/reject` | Move an order · record the measured piece · accept · reject |
| `GET` | `/api/clip-orders/{part}/packet` · `/files/{what}` | ZIP for the workshop · STL and dossiers |
| `GET` | `/api/clip-orders/summary` | How many orders sit in each state |
| `POST` | `/api/clips/plan` | Placement + real VTK collision |
| `GET` `POST` `DELETE` | `/api/clips/custom/{sid}` | Imported clip library: list · upload · remove one |
| `POST` | `/api/coils/plan` · `/api/plan` | Coil packing · stent deployment |
| `POST` | `/api/cl-stent/{sid}` | Centerline-guided stent along vessel curvature |
| `POST` `DELETE` | `/api/trajectory/{sid}` | Surgical trajectory |

### Report, export & audit

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/report` | PDF surgical planning report |
| `POST` | `/api/report/dicom-sr` | DICOM Structured Report (TID 1500) |
| `POST` | `/api/export/stl` | Binary STL export |
| `GET` `POST` | `/api/print-prep/beds` · `/api/print-prep/{sid}` | 3D-print preparation |
| `POST` `GET` | `/api/audit` · `/blocks` · `/verify` · `/export` | SkullChain audit trail |

**Where the clip sits.** `pose_transform` puts a device's LOCAL ORIGIN on the
neck, and the synthetic catalogue clips are drawn with the jaw straddling that
origin. The NAVARRO origin is not in the jaw at all — for the drawn 7 mm straight
the jaw runs −9.50..−2.50 mm while the 14.30 mm body runs to +11.80 mm — so the
neck landed at the HINGE, with the whole jaw hanging off to one side and the body
crossing the aneurysm. `to_device_frame` now also shifts each design by
`jaw_root + jaw/2`, putting the middle of the useful grip on the origin, which is
where the neck belongs. The shift is measured off the mesh rather than assumed,
so it follows the bend: the knee at 15° pushes the root from 2.50 mm to 3.95 mm.

**The report shows the plan in 3D, from fixed viewpoints.** Four server-rendered
views — anterior, left, superior and oblique — of the segmented vasculature
(translucent grey), the sac (blue) and whatever devices are placed (gold clip,
violet coils, light-blue stent), so the clip is visible sitting on the neck.

They replace a single browser screenshot taken from wherever the camera happened
to be: two reports of the same case are now comparable against each other and
against a follow-up, and a report generated from a resumed session or a script
has pictures at all. The camera frames the sac **and** the devices together — the
first version framed the sac alone and cropped the clip, which is several times
larger than the aneurysm it closes. Rendering is best effort: a viewpoint that
fails is dropped and the report still goes out.

They are rendered at twice the requested size and averaged down. The offscreen
window runs with MSAA off — some drivers fail outright with it on — so without
that every edge was a hard staircase, which a PDF viewer smears into a blur.

A report generated BEFORE a device is placed shows four pictures of bare anatomy
and reads as a plan with no device in it. It now says so under the images, with
the remedy: place the device and generate the report again.

They are diagrams of the segmentation, not radiological images, and the caption
under them says so.

---

## Running Tests

```bash
cd backend
.venv\Scripts\python -m pytest -q                        # all 826 tests
.venv\Scripts\python -m pytest test_session_abc.py -v    # one suite
```

Expected: **826 passed, 0 failed** (~3–4 min; VTK and SimpleITK do real work).

Frontend checks:

```bash
cd frontend
npx vitest run          # 159 unit tests (vitest + Testing Library, jsdom)
npx tsc -b --noEmit     # type check
npm run build           # production build
```

Test isolation notes:

- Suites that touch the database point `PROSPECTIVE_DB_URL` at a temp SQLite file.
- Suites that touch the study archive **must** set `STUDY_FILES_ROOT` to a temp
  directory. The archive root is resolved per call precisely so this works; a
  frozen module constant once let the suite overwrite a real patient's DICOM.
  `test_study_gallery.py` asserts the isolation holds for the live app too.

---

## Development Scripts

```bash
make install:backend     # create .venv + pip install
make install:frontend    # npm install
make dev:backend         # uvicorn --reload on :8000
make dev:frontend        # vite on :5173
make openapi:export      # curl /openapi.json → openapi.json (server must be up)
```

---

## Relationship to the Desktop App

The **Prospective** desktop application (PyQt5/VTK) and this web app share the
same algorithms: every module under `prospective/processing`, `prospective/io`,
`prospective/dicom`, `prospective/audit` and `prospective/auth` has a Qt-free
counterpart under `backend/services`, and every desktop panel has a web panel.

| | Desktop (Prospective) | Web (ProspectiveWeb) |
|---|---|---|
| UI | PyQt5 widgets | React 19 + vtk.js in the browser |
| Processing | `processing/` (Qt-coupled) | `services/` (Qt-free, same algorithms) |
| Auth | local SQLite + signup approval | JWT + SQLite, same approval flow |
| Password change / reset | yes | yes (self-service + admin reset, audited) |
| Session persistence | `.prospective` file on disk | DB record + durable server-side snapshot |
| Undo a mesh edit | no | labelled undo/redo history, survives save + resume |
| Revert the preprocessing | no | rebuilt from the session's DICOM, no re-upload |
| Clear a step's result | no | detection, morphometry, centreline, decision and devices |
| Unsaved-work guard | n/a (autosaves to file) | confirmation on navigation, Back and tab close |
| Study archive & gallery | no | local or S3, with preview thumbnails |
| Case ↔ imaging separation | one study per case | several acquisitions per clinical case |
| Live HU threshold preview | no | tinted MPR overlay while dragging sliders |
| Series selector | no | picks among all series in a study |
| Standard 3D viewpoints | no | axial/coronal/sagittal ± opposite, plus refit |
| Clip recommendation | score from neck + AR | per-criterion, verified against the patient's mesh |
| No clip fits the case | empty list | specification to manufacture, with STL |
| Institutional clip inventory | no | global library, scored alongside the built-in catalogue |
| Multiple devices on screen | last one placed | every placed device at once, colour-coded with a legend |
| Public landing page | no | yes |
| Access | local machine | browser / any HTTP client |

---

## Known Limitations

An honest list of what is *not* done, so nobody discovers it in front of a
clinician.

**Functional**

- **`GET /api/thresholds/{sid}` is not used by the bundled frontend.** It returns
  the strategy key and a clinical hint; the UI reads the slider range from
  `GET /api/segment/suggested-band/{sid}` instead. Both share the same
  `compute_auto_thresholds` core, so they cannot drift apart.
- **No progress streaming.** Long operations show an indeterminate bar. A
  WebSocket route used to exist but emitted a canned sequence unrelated to real
  work and no client connected to it, so it was removed rather than left to look
  like a feature.
- **CSRF relies on `SameSite=Lax`.** The auth cookie is not sent on cross-site
  requests, and the API only accepts JSON, but there is no anti-CSRF token. Add
  one before serving the app from a domain that also hosts untrusted content.

**Clinical accuracy** (needs annotated ground truth, not a patch)

- Fully automatic aneurysm isolation is not viable on dense vascular trees; the
  reliable path is the two-click neck plane, which the UI guides you through.
- Bone and contrast overlap in HU, so no global threshold separates them on some
  studies. That is why the live threshold preview, seeded region-grow and ROI crop
  exist.
- The detector is unstable on sparse meshes and CT can saturate the candidate list
  with bone false positives; candidates are ranked and labelled with confidence so
  a low-confidence pick is visible.

---

## Privacy & Security Notes

This software handles identifiable patient data.

**How access control works**

- Every route requires a valid token except `POST /api/auth/login`, `/signup` and
  `/logout`. This is enforced at `include_router` time in `main.py` rather than
  per endpoint, so a router added without a guard is closed by default.
  `test_auth_coverage.py` walks the real route table and fails if anything
  outside an explicit allowlist answers anonymously.
- Beware `get_current_user`: it is an alias of `get_optional_user` and returns
  `None` instead of raising. Only `require_user` / `require_admin` authenticate.
- Login issues the token twice: as a bearer token for the API client and as an
  HttpOnly `SameSite=Lax` cookie, because `<img src>` (MPR slices) and vtk.js
  mesh requests cannot carry a header. Logging out clears the cookie server-side.
- `backend/data/` is a StaticFiles mount, so router dependencies do not apply to
  it. A middleware guards `/data/` with the same token check — session DICOM used
  to be downloadable by anyone who knew a session UUID.

**Before deploying**

- **Set `JWT_SECRET` from the environment.** Otherwise it is generated into
  `backend/secrets/jwt_secret.txt`. Never place it under `data/`: it lived there
  once and `GET /data/jwt_secret.txt` returned the signing key, which is enough to
  mint an admin token.
- **Change the seeded `admin` password** from the user menu ("Cambiar contraseña").
- Serve over HTTPS and set `COOKIE_SECURE=1` so the auth cookie is marked secure.
- Private material belongs in `study_files/` (archived DICOM), `user_files/`
  (signup photos and CVs), `clip_library/` (institutional clip geometry) and
  `secrets/` — all outside `data/` and gitignored.
- **Never run `git add -A` in this repository.** Real DICOM files have no extension
  (`IM_0001`, bare UIDs); the ignore rules cover the known folders, but stage
  explicit paths and check `git diff --cached --name-only` first.
- **S3 archive**: the bucket must be private and encrypted at rest; objects are
  handed out only as short-lived presigned URLs. Get legal sign-off before
  uploading identifiable patient imaging to a cloud provider.

---

## License

Proprietary — SkullApp, Fundación Universitaria Navarra (UNINAVARRA),
Laboratorio de Imagen Médica.
