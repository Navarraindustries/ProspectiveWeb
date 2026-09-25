/* ClientVolume (z, y, x) → vtkImageData (x, y, z). Aparte del hook para que
   vtk.js solo se cargue cuando llega el primer volumen (import dinámico). */

import vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import type { ClientVolume } from "./volumeLoader";

export function toImageData(v: ClientVolume): vtkImageData {
  const img = vtkImageData.newInstance();
  img.setDimensions([v.dims[2], v.dims[1], v.dims[0]]);   // vtk: (x, y, z)
  img.setSpacing([v.spacing[2], v.spacing[1], v.spacing[0]]);
  img.setOrigin([0, 0, 0]);
  img.getPointData().setScalars(
    vtkDataArray.newInstance({ name: "scalars", numberOfComponents: 1, values: v.data }),
  );
  return img;
}
