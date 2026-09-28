/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

// Dev server proxies every backend surface to FastAPI on :8000 so the
// frontend can use same-origin URLs (/api/…, /data/sessions/…, /static/…).
export default defineConfig({
  plugins: [react()],
  // vtk.js imports Node's "events" module; without the browser polyfill Vite
  // externalizes it and vtk.js's macro base class becomes undefined.
  resolve: {
    alias: { events: "events" },
  },
  optimizeDeps: {
    // Los módulos de vtk.js se declaran uno a uno a propósito.
    //
    // Los visores (MeshView, SliceView, MipView, ObliqueView, VolumeView…) se
    // cargan con `import()` diferido, así que Vite no los ve al arrancar:
    // descubría sus dependencias la PRIMERA vez que alguien abría un visor,
    // las pre-empaquetaba a mitad de sesión y forzaba una recarga. Los
    // `import()` que estaban en vuelo en ese momento se caían con
    // «Failed to fetch dynamically imported module: …/SliceView.tsx», que no
    // dice nada del motivo real y parece que el fichero no existe.
    // Declarándolos aquí se empaquetan al arrancar, una sola vez.
    //
    // Para regenerar la lista tras añadir un visor o un filtro nuevo:
    //   grep -rhoE '"@kitware/vtk\.js/[^"]+"' src/ | tr -d '"' | sort -u
    // (quitando `@kitware/vtk.js/types`, que son solo tipos y no tiene código
    //  que empaquetar).
    include: [
      "events",
      "@kitware/vtk.js/Common/Core/DataArray",
      "@kitware/vtk.js/Common/DataModel/ImageData",
      "@kitware/vtk.js/Common/DataModel/PiecewiseFunction",
      "@kitware/vtk.js/Common/DataModel/Plane",
      "@kitware/vtk.js/Filters/General/TubeFilter",
      "@kitware/vtk.js/Filters/Sources/CubeSource",
      "@kitware/vtk.js/Filters/Sources/LineSource",
      "@kitware/vtk.js/Filters/Sources/SphereSource",
      "@kitware/vtk.js/IO/XML/XMLPolyDataReader",
      "@kitware/vtk.js/Rendering/Core/Actor",
      "@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor",
      "@kitware/vtk.js/Rendering/Core/CellPicker",
      "@kitware/vtk.js/Rendering/Core/ColorTransferFunction",
      "@kitware/vtk.js/Rendering/Core/ImageMapper",
      "@kitware/vtk.js/Rendering/Core/ImageMapper/Constants",
      "@kitware/vtk.js/Rendering/Core/ImageResliceMapper",
      "@kitware/vtk.js/Rendering/Core/ImageSlice",
      "@kitware/vtk.js/Rendering/Core/Mapper",
      "@kitware/vtk.js/Rendering/Core/RenderWindow",
      "@kitware/vtk.js/Rendering/Core/Renderer",
      "@kitware/vtk.js/Rendering/Core/Volume",
      "@kitware/vtk.js/Rendering/Core/VolumeMapper",
      "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow",
      "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow",
      "@kitware/vtk.js/Rendering/Profiles/Geometry",
      "@kitware/vtk.js/Rendering/Profiles/Volume",
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // The 3D components pull in WebGL and Node's "events" and are not unit
    // tested; the pure helpers beside them (marker sizing) are.
    exclude: ["node_modules/**", "dist/**", "src/vtk/*View.test.*"],
  },
  server: {
    port: 5173,
    proxy: {
      // Override with BACKEND_URL when :8000 is taken — on Windows the socket
      // can survive the uvicorn process and stay bound to a PID that is gone.
      "/api": backend,
      "/data": backend,
      "/static": backend,
      // watchProgress abre esta ruta directamente en location.host; sin
      // ws: true el proxy la trataría como HTTP normal y el handshake fallaría.
      "/ws": { target: backend, ws: true },
    },
  },
});
