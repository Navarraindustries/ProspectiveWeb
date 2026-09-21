/* sceneHost — el andamiaje común de las escenas Three.js de la landing.

   Stitch entrega cada animación como un script suelto: crea su renderer, se
   engancha a `window`, arranca un `requestAnimationFrame` infinito y no recoge
   nada. Servía para una página de demostración; en una SPA que monta y desmonta
   son fugas de contexto WebGL, y el navegador solo admite un puñado a la vez.

   Aquí vive ese ciclo de vida una sola vez: crear el lienzo y el renderer,
   seguir el tamaño del contenedor, normalizar el puntero, parar cuando la
   pestaña se oculta, respetar `prefers-reduced-motion` y —al desmontar— cancelar
   el frame, liberar TODA la geometría y los materiales del grafo y soltar el
   contexto. Cada escena solo aporta su contenido y qué hacer en cada fotograma. */

import * as THREE from "three";

export interface SceneKit {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Puntero normalizado a [-1, 1] sobre el contenedor. */
  pointer: { x: number; y: number };
  /** El contenedor, para escenas que se recomponen según su ancho. */
  host: HTMLElement;
}

/** Construye la escena y devuelve el paso de animación (t en segundos). */
export type SceneFactory = (kit: SceneKit) => (t: number) => void;

export interface SceneOptions {
  factory: SceneFactory;
  /** Campo de visión vertical; cada escena de Stitch trae el suyo. */
  fov?: number;
  /** Posición inicial de cámara. */
  cameraPosition?: [number, number, number];
}

/** Monta la escena en `host`. Devuelve la función de desmontaje. */
export function mountScene(host: HTMLElement, opts: SceneOptions): () => void {
  const { factory, fov = 50, cameraPosition = [0, 0, 14] } = opts;

  const width = host.clientWidth || 640;
  const height = host.clientHeight || 360;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    // Sin WebGL la sección se queda con su fondo: la escena es decorativa.
    return () => {};
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
  camera.position.set(...cameraPosition);

  renderer.setSize(width, height);
  // Techo de 2x por coste; suelo de 1x porque hay pantallas que reportan menos
  // (escalado de Windows por debajo del 100%) y el modelo sale blando.
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1), 2));
  /* Stitch calibró los colores contra el Three.js r125, cuyo espacio de salida
     era lineal. Las versiones actuales aplican sRGB por defecto y las escenas se
     lavan enteras: se mantiene el lineal para respetar ese ajuste. */
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  host.appendChild(renderer.domElement);

  const pointer = { x: 0, y: 0 };
  const onPointerMove = (e: MouseEvent) => {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };
  window.addEventListener("mousemove", onPointerMove, { passive: true });

  const step = factory({ scene, camera, pointer, host });

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  let raf = 0;

  const loop = () => {
    step((performance.now() - t0) / 1000);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (still) { step(0); renderer.render(scene, camera); return; }
    if (!raf) raf = requestAnimationFrame(loop);
  };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibility);
  start();

  const ro = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(host);

  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("mousemove", onPointerMove);
    ro.disconnect();
    /* Recorrer el grafo libera todo lo que cuelgue de él —incluidos los hijos
       que se montan solos, como los de `ArrowHelper`— sin tener que llevar un
       registro manual escena por escena. */
    scene.traverse((obj) => {
      const o = obj as THREE.Mesh;
      o.geometry?.dispose?.();
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
      else mat?.dispose?.();
    });
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
