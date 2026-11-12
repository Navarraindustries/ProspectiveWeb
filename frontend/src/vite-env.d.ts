/// <reference types="vite/client" />

// vtk.js 36 publica el filtro de normales sin .d.ts: lo justo para usarlo.
declare module "@kitware/vtk.js/Filters/Core/PolyDataNormals" {
  import type vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
  interface vtkPolyDataNormals {
    setInputData(p: vtkPolyData): void;
    getOutputData(): vtkPolyData;
  }
  const vtkPolyDataNormals: { newInstance(init?: { computePointNormals?: boolean; computeCellNormals?: boolean }): vtkPolyDataNormals };
  export default vtkPolyDataNormals;
}
