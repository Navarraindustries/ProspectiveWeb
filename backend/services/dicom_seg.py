"""DICOM SEG: la segmentación devuelta al PACS, superpuesta a las imágenes originales.

El DICOM SR lleva las medidas; esto lleva las REGIONES. Un objeto
Segmentation Storage que cualquier visor clínico (el del PACS, 3D Slicer,
OsiriX/Horos) pinta encima de la serie original, con dos segmentos:

1. **Vaso**: la malla de trabajo (vessel_tree.vtp), con los recortes y borrados
   que se le hayan hecho.
2. **Aneurisma**: el saco aislado en Morfometría (aneurysm_sac.vtp), si existe.
   El candidato de Detección no sirve: es un parche de superficie abierto, no
   un volumen, y rellenarlo daría cualquier cosa.

Lo delicado es que caiga EXACTAMENTE sobre las imágenes. La malla está en mm
desde el primer vóxel del volumen cargado (origen 0, sin girar: ver
services/segmentation.py). El remuestreo isotrópico y la media resolución
conservan ese primer vóxel en el origen, así que un punto de la malla dividido
por el espaciado ORIGINAL da su índice en la rejilla original, se segmentara
a la resolución que se segmentara. El orden de los cortes es el de la carga
(`_series_file_names`); en un DICOM de un solo fichero multifotograma, el
fotograma i es el corte i. La geometría de paciente (posición y orientación de
cada corte) la pone highdicom desde las imágenes de origen.

Contiene los datos del paciente de la serie original, como cualquier SEG:
sin ellos el PACS no sabría a quién pertenece. Se guarda junto al DICOM de la
sesión, en `/data/…`, que solo se sirve autenticado.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import vtk
from vtkmodules.util.numpy_support import vtk_to_numpy

logger = logging.getLogger(__name__)

#: Una malla rasterizada debe encerrar un volumen parecido al suyo. Si se aleja
#: más de esto, la superficie tenía agujeros y el relleno se ha desbordado o
#: quedado corto: el segmento no se exporta así sin decirlo.
VOLUME_TOLERANCE = 0.25

MANUFACTURER = "ProspectiveWeb"
SOFTWARE_VERSION = "1"


@dataclass
class SegResult:
    path: Path
    segments: list[str]
    n_frames: int
    voxel_volumes_mm3: dict[str, float] = field(default_factory=dict)
    mesh_volumes_mm3: dict[str, float] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def mesh_volume(poly: vtk.vtkPolyData) -> float:
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    tri.Update()
    m = vtk.vtkMassProperties()
    m.SetInputData(tri.GetOutput())
    m.Update()
    return float(m.GetVolume())


def rasterise(poly: vtk.vtkPolyData, shape_zyx: tuple[int, int, int],
              spacing_zyx: tuple[float, float, float]) -> np.ndarray:
    """Máscara [z, y, x] del interior de la malla en la rejilla (origen 0)."""
    nz, ny, nx = shape_zyx
    sz, sy, sx = spacing_zyx
    img = vtk.vtkImageData()
    img.SetDimensions(nx, ny, nz)
    img.SetSpacing(sx, sy, sz)
    img.SetOrigin(0.0, 0.0, 0.0)
    img.AllocateScalars(vtk.VTK_UNSIGNED_CHAR, 1)
    img.GetPointData().GetScalars().Fill(1)

    stencil = vtk.vtkPolyDataToImageStencil()
    stencil.SetInputData(poly)
    stencil.SetOutputOrigin(0.0, 0.0, 0.0)
    stencil.SetOutputSpacing(sx, sy, sz)
    stencil.SetOutputWholeExtent(img.GetExtent())
    stencil.Update()

    cut = vtk.vtkImageStencil()
    cut.SetInputData(img)
    cut.SetStencilData(stencil.GetOutput())
    cut.ReverseStencilOff()
    cut.SetBackgroundValue(0)
    cut.Update()
    flat = vtk_to_numpy(cut.GetOutput().GetPointData().GetScalars())
    return flat.reshape(nz, ny, nx).astype(bool)


def _source_datasets(dicom_dir: Path, series_id: str):
    """Las imágenes de origen en el orden de los cortes del volumen."""
    import pydicom
    from services.dicom_loader import _series_file_names
    files = _series_file_names(series_id, dicom_dir)
    if not files:
        raise ValueError("No se encuentra la serie DICOM de la sesión.")
    return [_type2_present(_shared_orientation(pydicom.dcmread(f))) for f in files]


#: Atributos de tipo 2 (obligatorios, pero pueden ir VACÍOS) de los módulos de
#: paciente y estudio que highdicom copia de la imagen de origen. Un DICOM
#: anonimizado los suele quitar del todo, y highdicom entonces falla.
_TYPE2 = ("PatientName", "PatientID", "PatientBirthDate", "PatientSex",
          "StudyDate", "StudyTime", "StudyID", "AccessionNumber", "ReferringPhysicianName")


def _type2_present(ds):
    """Los añade VACÍOS si faltan, en la copia en memoria: no se inventa nada."""
    for kw in _TYPE2:
        if kw not in ds:
            setattr(ds, kw, "")
    return ds


def _shared_orientation(ds):
    """Un multifotograma con la orientación repetida en cada fotograma, como
    grupo compartido.

    highdicom la exige en SharedFunctionalGroupsSequence; la 3D-RA del case 3
    (X-Ray 3D Angiographic) la repite, idéntica, en los 384 fotogramas, que el
    estándar también permite. Se mueve en una copia en memoria para la
    geometría; el SEG sigue apuntando al SOP Instance UID original. Si los
    fotogramas NO comparten orientación, no se toca y highdicom lo rechazará."""
    pf = ds.get("PerFrameFunctionalGroupsSequence")
    sh = ds.get("SharedFunctionalGroupsSequence")
    if not pf or not sh or "PlaneOrientationSequence" in sh[0]:
        return ds
    if any("PlaneOrientationSequence" not in f for f in pf):
        return ds
    iops = {tuple(round(float(v), 6) for v in f.PlaneOrientationSequence[0].ImageOrientationPatient)
            for f in pf}
    if len(iops) != 1:
        return ds
    sh[0].PlaneOrientationSequence = pf[0].PlaneOrientationSequence
    for f in pf:
        del f.PlaneOrientationSequence
    return ds


def build_dicom_seg(session_id: str, out_path: Path) -> SegResult:
    import highdicom as hd
    from pydicom.sr.codedict import codes
    from services.dicom_loader import load_series
    from services.segmentation import read_vtp
    from services.sessions import read_state, session_subdir

    meshes = session_subdir(session_id, "meshes")
    vessel_path = meshes / "vessel_tree.vtp"
    if not vessel_path.exists():
        raise ValueError("No hay malla segmentada: segmenta primero.")

    dicom_dir = session_subdir(session_id, "dicom")
    series_id = read_state(session_id, "dicom.series_id", "") or ""
    sources = _source_datasets(dicom_dir, series_id)
    # La rejilla ORIGINAL, con la misma convención con que se cargó el volumen.
    vol = load_series(series_id, dicom_dir)
    shape = tuple(int(v) for v in vol.volume.shape)            # (z, y, x)
    spacing = tuple(float(v) for v in vol.spacing)             # (sz, sy, sx)

    # Sin él un visor no sabe que el SEG y las imágenes comparten espacio. No se
    # inventa: uno nuevo no coincidiría con el de la serie.
    if not getattr(sources[0], "FrameOfReferenceUID", ""):
        raise ValueError(
            "La serie no tiene Frame of Reference UID: un visor no podría superponer "
            "el SEG a sus imágenes. Suele faltar en DICOM exportados como captura "
            "secundaria o anonimizados de más.")
    multiframe = len(sources) == 1 and int(getattr(sources[0], "NumberOfFrames", 1) or 1) > 1
    n_src = int(getattr(sources[0], "NumberOfFrames", 1)) if multiframe else len(sources)
    if n_src != shape[0]:
        raise ValueError(
            f"La serie tiene {n_src} cortes y el volumen {shape[0]}: no se puede "
            f"asegurar que la segmentación caiga sobre su corte.")

    warnings: list[str] = []
    masks: list[np.ndarray] = []
    names: list[str] = []
    vox_vol: dict[str, float] = {}
    mesh_vol: dict[str, float] = {}
    voxel_mm3 = spacing[0] * spacing[1] * spacing[2]

    def add(name: str, poly):
        m = rasterise(poly, shape, spacing)
        vv, mv = float(m.sum()) * voxel_mm3, mesh_volume(poly)
        vox_vol[name], mesh_vol[name] = round(vv, 1), round(mv, 1)
        if m.sum() == 0:
            warnings.append(f"«{name}» no ocupa ningún vóxel de la serie original: no se exporta.")
            return
        if mv > 0 and abs(vv - mv) / mv > VOLUME_TOLERANCE:
            warnings.append(
                f"«{name}»: al pasarlo a la rejilla original encierra {vv:.0f} mm³ y la malla "
                f"{mv:.0f} mm³. La superficie tiene agujeros (suele pasar donde el vaso "
                f"sale del volumen): revisa el segmento en el visor.")
        masks.append(m)
        names.append(name)

    add("Vaso", read_vtp(vessel_path))
    sac = meshes / "aneurysm_sac.vtp"
    if sac.exists():
        add("Aneurisma", read_vtp(sac))
    else:
        warnings.append("Sin saco aislado (se aísla al marcar el cuello en Morfometría): "
                        "el SEG solo lleva el vaso.")
    if not masks:
        raise ValueError("Ningún segmento ocupa vóxeles de la serie original.")

    # Umbral, tubularidad por escalas (Frangi) y operaciones morfológicas, con
    # recortes a mano: «filtrado multiescala» es lo que mejor lo describe.
    algo = hd.AlgorithmIdentificationSequence(
        name="ProspectiveWeb", version=SOFTWARE_VERSION,
        family=codes.cid7162.MultiScaleResolutionFiltering)
    categories = {
        "Vaso": (codes.SCT.AnatomicalStructure, codes.SCT.BloodVessel),
        "Aneurisma": (hd.sr.CodedConcept("49755003", "SCT", "Morphologically Altered Structure"),
                      codes.SCT.Aneurysm),
    }
    descriptions = []
    for i, name in enumerate(names, start=1):
        cat, typ = categories[name]
        descriptions.append(hd.seg.SegmentDescription(
            segment_number=i, segment_label=name,
            segmented_property_category=cat, segmented_property_type=typ,
            algorithm_type=hd.seg.SegmentAlgorithmTypeValues.SEMIAUTOMATIC,
            algorithm_identification=algo,
        ))
    # (frames, filas, columnas, segmentos)
    pixel = np.stack(masks, axis=-1).astype(np.uint8)
    seg = hd.seg.Segmentation(
        source_images=sources,
        pixel_array=pixel,
        segmentation_type=hd.seg.SegmentationTypeValues.BINARY,
        segment_descriptions=descriptions,
        series_instance_uid=hd.UID(),
        series_number=901,
        sop_instance_uid=hd.UID(),
        instance_number=1,
        manufacturer=MANUFACTURER,
        manufacturer_model_name="ProspectiveWeb",
        software_versions=SOFTWARE_VERSION,
        device_serial_number="0",
        series_description="Segmentación ProspectiveWeb",
        omit_empty_frames=True,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    seg.save_as(str(out_path))
    logger.info("DICOM SEG %s: %s, %d frames", out_path.name, names, int(getattr(seg, "NumberOfFrames", 0)))
    return SegResult(path=out_path, segments=names, n_frames=int(getattr(seg, "NumberOfFrames", 0)),
                     voxel_volumes_mm3=vox_vol, mesh_volumes_mm3=mesh_vol, warnings=warnings)
