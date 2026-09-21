/* Impresión del modelo — el paso de fabricación en el taller.
   Stitch, pantalla «Three.js» ANIMATION_16.

   Plato de construcción con su retícula de calibración, un láser que recorre el
   modelo en altura cortándolo capa a capa, y la pieza en malla facetada —tubos
   de pocos segmentos radiales y un saco icosaédrico, que es como se ve un STL— con
   su contorno de facetas encima y las partículas del curado.

   Acompaña a la sección de dispositivos: los clips NAVARRO se fabrican bajo
   pedido para cada caso, y el paso 7 del flujo es justo este. No rotula proceso
   ni material: qué técnica y qué resina usa el taller no es algo que la landing
   deba afirmar. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const stlPrintingScene: SceneFactory = ({ scene, pointer }) => {
  const root = new THREE.Group();
  scene.add(root);

  scene.add(new THREE.AmbientLight(0x0a1e35, 2.5));
  const lightTop = new THREE.DirectionalLight(0x00f0ff, 3.5);
  lightTop.position.set(4, 6, 5);
  scene.add(lightTop);
  const lightSide = new THREE.DirectionalLight(0x38bdf8, 2.0);
  lightSide.position.set(-5, 2, -3);
  scene.add(lightSide);

  // Plato de construcción y su retícula de calibración
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.15, 4.2),
    new THREE.MeshStandardMaterial({
      color: 0x101f33, metalness: 0.8, roughness: 0.3, emissive: 0x050f1a }));
  plate.position.y = -2.2;
  root.add(plate);

  const grid = new THREE.GridHelper(4.0, 16, 0x00f0ff, 0x1d3d63);
  grid.position.y = -2.12;
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.45;
  root.add(grid);

  // Marco del láser: sube y baja cortando el modelo por capas
  const laserFrame = new THREE.Group();
  root.add(laserFrame);

  const laserRing = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 1.85, 48),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  laserRing.rotation.x = Math.PI / 2;
  laserFrame.add(laserRing);

  const crossMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.4 });
  laserFrame.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([V(-1.8, 0, 0), V(1.8, 0, 0)]), crossMat));
  laserFrame.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([V(0, 0, -1.8), V(0, 0, 1.8)]), crossMat));

  // La pieza: pocos segmentos radiales y sombreado plano, que es lo que da la
  // lectura de malla triangulada de un STL.
  const stlGroup = new THREE.Group();
  root.add(stlGroup);

  const geomL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
    [V(0, -2.1, 0), V(0, -0.6, 0), V(-0.8, 0.8, 0.2), V(-1.4, 1.8, 0.5)]), 20, 0.35, 8, false);
  const geomR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
    [V(0, -0.6, 0), V(0.6, 0.7, -0.2), V(1.2, 1.7, -0.4)]), 16, 0.3, 8, false);
  const sacGeom = new THREE.IcosahedronGeometry(0.85, 2);
  sacGeom.computeVertexNormals();

  /* Resina translúcida. Stitch la resolvía con `transmission: 0.75`, que obliga a
     un pase de render extra a pantalla completa en cada fotograma; se cambia por
     transparencia normal, igual que en [[morphometry]]. */
  const resinMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8, emissive: 0x052a42, roughness: 0.15, metalness: 0.1,
    opacity: 0.55, transparent: true, flatShading: true });

  const sac = new THREE.Mesh(sacGeom, resinMat);
  sac.position.set(0.1, 0.2, 0.25);
  stlGroup.add(new THREE.Mesh(geomL, resinMat), new THREE.Mesh(geomR, resinMat), sac);

  // Contorno de las facetas sobre la pieza
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.3 });
  const sacWire = new THREE.Mesh(sacGeom, wireMat);
  sacWire.position.set(0.1, 0.2, 0.25);
  stlGroup.add(new THREE.Mesh(geomL, wireMat), new THREE.Mesh(geomR, wireMat), sacWire);

  // Partículas del curado, pegadas al plano del láser
  const COUNT = 70;
  const pGeom = new THREE.BufferGeometry();
  const pPos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT * 3; i += 3) {
    pPos[i] = (Math.random() - 0.5) * 1.5;
    pPos[i + 1] = 0;
    pPos[i + 2] = (Math.random() - 0.5) * 1.5;
  }
  pGeom.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  laserFrame.add(new THREE.Points(pGeom, new THREE.PointsMaterial({
    color: 0x00f0ff, size: 0.06, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending })));

  return (t) => {
    root.rotation.y = t * 0.25 + pointer.x * 0.45;
    root.rotation.x = 0.2 + Math.sin(t * 0.15) * 0.08 + pointer.y * 0.3;

    // El láser recorre la altura de la pieza
    laserFrame.position.y = -2.1 + (Math.sin(t * 1.6) * 0.5 + 0.5) * 3.8;

    const arr = pGeom.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT * 3; i += 3) {
      arr[i] += (Math.random() - 0.5) * 0.05;
      arr[i + 2] += (Math.random() - 0.5) * 0.05;
    }
    pGeom.attributes.position.needsUpdate = true;
  };
};
