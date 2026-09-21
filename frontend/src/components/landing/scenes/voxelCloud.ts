/* Nube de vóxeles DICOM — reconstrucción volumétrica y corte multiplanar.
   Stitch, pantalla «Three.js» ANIMATION_8: «Volumetric DICOM Voxel Cloud /
   Multiplanar Iso-Surface Simulation».

   Miles de puntos agrupados a lo largo del recorrido vascular, con un bulbo denso
   en carmesí donde está el aneurisma, dentro de la caja de coordenadas del
   estudio; un anillo recorre el eje vertical como el corte que se desplaza.

   Acompaña al texto de «Qué es», que habla justo de esto: el estudio convertido
   en un modelo 3D que se puede medir. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

/** Textura radial para que cada vóxel se lea como un punto de luz, no un cuadro. */
function glowSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(0,240,255,0.8)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export const voxelCloudScene: SceneFactory = ({ scene, pointer }) => {
  const mainGroup = new THREE.Group();
  scene.add(mainGroup);

  const COUNT = 5200;   // Stitch usaba 1800: en un panel apaisado se veía niebla
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);

  const cyan = new THREE.Color(0x00f0ff);
  const navy = new THREE.Color(0x0a4b78);
  const bright = new THREE.Color(0x38bdf8);
  const red = new THREE.Color(0xff3366);

  for (let i = 0; i < COUNT; i++) {
    // Puntos repartidos a lo largo del árbol, más densos cerca del eje
    const t = (Math.random() - 0.5) * 4;
    const radius = 0.2 + Math.exp(-Math.abs(t) * 0.8) * 0.9;
    const angle = Math.random() * Math.PI * 2;

    let px = Math.cos(angle) * radius + (Math.random() - 0.5) * 0.15;
    let py = t;
    let pz = Math.sin(angle) * radius + (Math.random() - 0.5) * 0.15;

    if (Math.random() > 0.65) {
      // Bulbo denso en el foco del aneurisma, marcado en carmesí
      const u = Math.random();
      const v = Math.random() * Math.PI * 2;
      const rad = 0.7 * Math.cbrt(u);
      px = 0.9 + rad * Math.sin(u * Math.PI) * Math.cos(v);
      py = 0.5 + rad * Math.sin(u * Math.PI) * Math.sin(v);
      pz = 0.3 + rad * Math.cos(u * Math.PI);
      red.toArray(colors, i * 3);
    } else {
      // Pared vascular y hueso, por intensidad
      const c = Math.random() > 0.4 ? cyan : (Math.random() > 0.5 ? bright : navy);
      c.toArray(colors, i * 3);
    }

    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;
  }

  const pGeom = new THREE.BufferGeometry();
  pGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  mainGroup.add(new THREE.Points(pGeom, new THREE.PointsMaterial({
    size: 0.13, vertexColors: true, map: glowSprite(), transparent: true,
    opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // Anillo del corte que recorre el volumen
  const scanRing = new THREE.Mesh(
    new THREE.RingGeometry(2.06, 2.18, 64),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  scanRing.rotation.x = Math.PI / 2;
  mainGroup.add(scanRing);

  /* Caja de coordenadas del estudio. Stitch la hacía con `wireframe: true` sobre
     una `BoxGeometry`, que dibuja las aristas de CADA TRIÁNGULO —incluidas las
     diagonales de cada cara—: salía una gran X cruzando el panel que se comía la
     nube. `EdgesGeometry` da las doce aristas reales del cubo y nada más. */
  mainGroup.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(3.6, 4.4, 3.6)),
    new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.28 })));

  // Cruces de esquina, como referencias de encuadre
  const crosshair = (x: number, y: number, z: number) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), mat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), mat));
    g.position.set(x, y, z);
    return g;
  };
  mainGroup.add(crosshair(-1.8, -2.2, -1.8));
  mainGroup.add(crosshair(1.8, 2.2, 1.8));

  return (t) => {
    scanRing.position.y = Math.sin(t * 1.5) * 1.8;
    mainGroup.rotation.y = t * 0.25 + pointer.x * 0.5;
    mainGroup.rotation.x = Math.sin(t * 0.15) * 0.15 + pointer.y * 0.35;
  };
};
