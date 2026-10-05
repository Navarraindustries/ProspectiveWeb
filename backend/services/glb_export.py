"""Exportar la escena a GLB (glTF 2.0 binario): un objeto por malla, con color.

El STL junta todo en una sola malla sin color, que es lo que pide una
impresora. Para ENSEÑAR el caso —un visor 3D, PowerPoint, la realidad
aumentada del móvil— sirve más un GLB: el vaso, el saco y cada dispositivo
por separado, con los colores del visor, que se pueden ocultar o girar.

Decisiones:
- **Metros a tamaño real.** La unidad de glTF es el metro; exportar en mm
  hacía que un visor de realidad aumentada pusiera un aneurisma de 6 m. Las
  coordenadas se centran en el modelo (si no, aparece a metros del origen).
- **Sin datos del paciente.** Los nodos se llaman por lo que son («Vaso»,
  «Saco», «Clip»…), `asset.generator` dice la aplicación y nada más, y el
  nombre del fichero lo pone quien llama sin datos del paciente.
- **Ejes.** glTF es Y-arriba; la malla está en el marco del volumen. No se
  reorienta: el frame anatómico no siempre se conoce (ver la nota de
  orientación del visor), y girarlo a ciegas sería peor que dejarlo.
- Sin dependencias: el formato es un JSON y un bloque binario, y escribirlo
  aquí es más corto que añadir una librería al requirements.
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import vtk
from vtkmodules.util.numpy_support import vtk_to_numpy

GENERATOR = "ProspectiveWeb"
_FLOAT, _UINT32 = 5126, 5125
_ARRAY_BUFFER, _ELEMENT_ARRAY_BUFFER = 34962, 34963


@dataclass
class GlbPart:
    name: str
    poly: vtk.vtkPolyData
    color: tuple[float, float, float]
    opacity: float = 1.0


def _triangles(poly: vtk.vtkPolyData) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(posiciones, normales, índices) de una malla triangulada."""
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    tri.PassLinesOff()
    tri.PassVertsOff()
    tri.Update()
    nm = vtk.vtkPolyDataNormals()
    nm.SetInputConnection(tri.GetOutputPort())
    nm.SplittingOff()
    nm.ConsistencyOn()
    nm.ComputePointNormalsOn()
    nm.Update()
    out = nm.GetOutput()
    if out.GetNumberOfPolys() == 0:
        return np.zeros((0, 3), np.float32), np.zeros((0, 3), np.float32), np.zeros(0, np.uint32)
    pos = vtk_to_numpy(out.GetPoints().GetData()).astype(np.float32)
    nor = vtk_to_numpy(out.GetPointData().GetNormals()).astype(np.float32)
    cells = vtk_to_numpy(out.GetPolys().GetData()).reshape(-1, 4)[:, 1:]
    return pos, nor, cells.astype(np.uint32).ravel()


def _pad4(b: bytes, fill: bytes = b"\x00") -> bytes:
    return b + fill * ((4 - len(b) % 4) % 4)


def build_glb(parts: list[GlbPart], scale: float = 0.001, center: bool = True) -> bytes:
    """El fichero GLB entero. `scale` pasa de mm a metros por defecto."""
    geo = [(p, *_triangles(p.poly)) for p in parts]
    geo = [g for g in geo if len(g[3]) > 0]
    if not geo:
        raise ValueError("No hay ninguna malla con triángulos que exportar.")

    offset = np.zeros(3, np.float32)
    if center:
        allpos = np.concatenate([g[1] for g in geo])
        offset = ((allpos.min(0) + allpos.max(0)) / 2).astype(np.float32)

    blob = bytearray()
    views, accessors, meshes, nodes, materials = [], [], [], [], []

    def view(data: bytes, target: int) -> int:
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data)
        return len(views) - 1

    for part, pos, nor, idx in geo:
        p = ((pos - offset) * scale).astype(np.float32)
        ip = view(p.tobytes(), _ARRAY_BUFFER)
        accessors.append({"bufferView": ip, "componentType": _FLOAT, "count": len(p), "type": "VEC3",
                          "min": p.min(0).tolist(), "max": p.max(0).tolist()})
        a_pos = len(accessors) - 1
        accessors.append({"bufferView": view(nor.tobytes(), _ARRAY_BUFFER), "componentType": _FLOAT,
                          "count": len(nor), "type": "VEC3"})
        a_nor = len(accessors) - 1
        accessors.append({"bufferView": view(idx.tobytes(), _ELEMENT_ARRAY_BUFFER), "componentType": _UINT32,
                          "count": len(idx), "type": "SCALAR"})
        a_idx = len(accessors) - 1
        mat = {"name": part.name,
               "pbrMetallicRoughness": {"baseColorFactor": [*map(float, part.color), float(part.opacity)],
                                        "metallicFactor": 0.0, "roughnessFactor": 0.6},
               "doubleSided": True}
        if part.opacity < 1.0:
            mat["alphaMode"] = "BLEND"
        materials.append(mat)
        meshes.append({"name": part.name, "primitives": [{
            "attributes": {"POSITION": a_pos, "NORMAL": a_nor}, "indices": a_idx,
            "material": len(materials) - 1, "mode": 4}]})
        nodes.append({"name": part.name, "mesh": len(meshes) - 1})

    gltf = {
        "asset": {"version": "2.0", "generator": GENERATOR},
        "scene": 0,
        "scenes": [{"name": "Escena", "nodes": list(range(len(nodes)))}],
        "nodes": nodes, "meshes": meshes, "materials": materials,
        "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    js = _pad4(json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), b" ")
    bin_ = _pad4(bytes(blob))
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return (struct.pack("<4sII", b"glTF", 2, total)
            + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(bin_), b"BIN\x00") + bin_)


def write_glb(parts: list[GlbPart], out_path: Path, scale: float = 0.001) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(build_glb(parts, scale=scale))
    return out_path


def read_glb_json(data: bytes) -> dict:
    """El JSON de un GLB (para los tests y para comprobar lo que se exporta)."""
    magic, version, _total = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError("No es un GLB 2.0")
    length, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON":
        raise ValueError("Falta el bloque JSON")
    return json.loads(data[20:20 + length].decode("utf-8"))
