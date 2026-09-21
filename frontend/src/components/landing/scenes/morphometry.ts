/* Morfometría — aneurisma aislado con vectores de cizallamiento y calibres.
   Stitch, pantalla «Three.js» ANIMATION_12: «Análisis Morfométrico 3D con
   Vectores de Estrés de Cizallamiento (WSS) & Calibres».

   Bulbo traslúcido para leer el grosor de pared, malla alámbrica, plano del
   cuello, eje de altura máxima en trazo discontinuo, marcador de ápex con
   anillo de radar y 24 flechas tangenciales que laten con el WSS. Acompaña a la
   sección de índices clínicos: es la imagen de lo que esas siglas miden. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

export const morphometryScene: SceneFactory = ({ scene, pointer }) => {
  const mainGroup = new THREE.Group();
  scene.add(mainGroup);

  // Iluminación clínica de contraste
  scene.add(new THREE.AmbientLight(0x0a1c30, 2.5));
  const dirLight1 = new THREE.DirectionalLight(0x00f0ff, 3.2);
  dirLight1.position.set(6, 8, 7);
  scene.add(dirLight1);
  const dirLight2 = new THREE.DirectionalLight(0xff3366, 2.5);
  dirLight2.position.set(-6, -5, -4);
  scene.add(dirLight2);

  /* Bulbo traslúcido. Stitch lo resolvía con `transmission: 0.7`, que en Three.js
     obliga a un pase de render adicional a pantalla completa en CADA fotograma:
     con dos o tres figuras montadas a la vez el navegador se atragantaba (las
     capturas de pantalla llegaban a agotar su tiempo). Sobre un fondo oscuro y a
     este tamaño, la transparencia normal se ve igual y sale gratis. */
  const aneurysmMat = new THREE.MeshPhysicalMaterial({
    color: 0x112d4a, emissive: 0x061524, roughness: 0.15,
    opacity: 0.62, transparent: true, reflectivity: 0.9, clearcoat: 0.8,
  });

  const domeGeom = new THREE.SphereGeometry(1.8, 36, 36);
  const pos = domeGeom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = 1.0 + 0.22 * Math.sin(y * 2.2) + 0.14 * Math.cos(x * 2.8) + 0.1 * Math.sin(z * 3.1);
    pos.setXYZ(i, x * d, y * (1.18 + 0.15 * z), z * d);
  }
  domeGeom.computeVertexNormals();
  mainGroup.add(new THREE.Mesh(domeGeom, aneurysmMat));

  // Malla alámbrica perimetral (lectura de WSS sobre la superficie)
  mainGroup.add(new THREE.LineSegments(
    new THREE.WireframeGeometry(domeGeom),
    new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.38 }),
  ));

  // Anillo y disco del plano del cuello
  const neckCurve = new THREE.EllipseCurve(0, 0, 1.05, 0.9, 0, 2 * Math.PI, false, 0);
  const neckGeom = new THREE.BufferGeometry().setFromPoints(
    neckCurve.getPoints(50).map((p) => new THREE.Vector3(p.x, -1.75, p.y)));
  mainGroup.add(new THREE.LineLoop(neckGeom, new THREE.LineBasicMaterial({ color: 0x00f0ff })));

  const neckDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 32),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.25 }));
  neckDisc.rotation.x = Math.PI / 2;
  neckDisc.position.y = -1.75;
  mainGroup.add(neckDisc);

  // Eje de altura máxima, en trazo discontinuo del cuello al ápex
  const hLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -1.75, 0), new THREE.Vector3(0.2, 2.1, 0.3)]),
    new THREE.LineDashedMaterial({ color: 0xff3366, dashSize: 0.2, gapSize: 0.1 }));
  hLine.computeLineDistances();
  mainGroup.add(hLine);

  // Ápex: el punto de pared fina, marcado y con anillo de radar
  const apexMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff3366 }));
  apexMarker.position.set(0.2, 2.1, 0.3);
  mainGroup.add(apexMarker);

  const apexRing = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.28, 24),
    new THREE.MeshBasicMaterial({ color: 0xff3366, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  apexRing.position.set(0.2, 2.1, 0.3);
  apexRing.rotation.x = Math.PI / 2.3;
  mainGroup.add(apexRing);

  // Vectores tangenciales de cizallamiento, repartidos por la esfera
  const vectorGroup = new THREE.Group();
  mainGroup.add(vectorGroup);

  const ARROWS = 24;
  const arrows: { arrow: THREE.ArrowHelper; speed: number; phase: number }[] = [];
  for (let a = 0; a < ARROWS; a++) {
    const phi = Math.acos(-1 + (2 * a) / ARROWS);
    const theta = Math.sqrt(ARROWS * Math.PI) * phi;
    const dir = new THREE.Vector3(
      Math.cos(theta) * Math.sin(phi),
      Math.sin(theta) * Math.sin(phi) * 0.9,
      Math.cos(phi)).normalize();
    const origin = dir.clone().multiplyScalar(1.6);
    const tangent = new THREE.Vector3(-dir.z, dir.y * 0.5, dir.x).normalize();
    // Carmesí donde el cizallamiento es alto; cian en el resto.
    const highStress = dir.y > 0.2 && dir.x > 0.0;
    const col = highStress ? 0xff3366 : (a % 2 === 0 ? 0x00f0ff : 0x38bdf8);

    const arrow = new THREE.ArrowHelper(tangent, origin, 0.65, col, 0.18, 0.1);
    const lineMat = arrow.line.material as THREE.LineBasicMaterial;
    lineMat.transparent = true;
    lineMat.opacity = 0.85;
    vectorGroup.add(arrow);
    arrows.push({ arrow, speed: 0.4 + (a % 7) * 0.12, phase: (a * Math.PI * 2) / ARROWS });
  }

  // Retícula estereotáxica de referencia
  const grid = new THREE.GridHelper(5, 10, 0x00f0ff, 0x112d4a);
  grid.position.y = -2.4;
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.25;
  mainGroup.add(grid);

  return (t) => {
    mainGroup.rotation.y = t * 0.22 + pointer.x * 0.5;
    mainGroup.rotation.x = Math.sin(t * 0.18) * 0.12 + pointer.y * 0.35;
    mainGroup.position.y = Math.sin(t * 1.1) * 0.15;

    apexRing.scale.setScalar(1.0 + Math.sin(t * 4.0) * 0.25);
    apexRing.rotation.z += 0.02;

    for (const it of arrows) {
      it.arrow.setLength(0.5 + Math.sin(t * 2.5 * it.speed + it.phase) * 0.25, 0.15, 0.08);
    }
  };
};
