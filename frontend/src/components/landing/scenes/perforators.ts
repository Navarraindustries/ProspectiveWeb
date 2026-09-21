/* Perforantes — las ramas finas que salen junto al cuello del aneurisma.
   Stitch, pantalla «Three.js» ANIMATION_15.

   Tronco arterial, saco en la bifurcación y cuatro ramas perforantes naciendo
   cerca del cuello. Las que quedan demasiado próximas se marcan en carmesí, con
   un anillo que late y una línea discontinua midiendo su distancia al cuello;
   las demás van en cian. Una retícula de radar encuadra la zona.

   Acompaña a la funcionalidad «Aviso de ramas cercanas»: las perforantes no se
   ven bien en la imagen y son justo lo que no se debe ocluir con el clip, así
   que señalarlas es una de las cosas que hace la aplicación.

   No rotula distancias: qué rama es crítica y a cuántos milímetros lo calcula la
   aplicación por caso, y aquí sería un número inventado. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const perforatorsScene: SceneFactory = ({ scene, pointer }) => {
  const mainGroup = new THREE.Group();
  scene.add(mainGroup);

  scene.add(new THREE.AmbientLight(0x091c30, 2.5));
  const keyLight = new THREE.DirectionalLight(0x00f0ff, 3.5);
  keyLight.position.set(5, 7, 6);
  scene.add(keyLight);
  const redLight = new THREE.PointLight(0xff3366, 3.0, 15);
  redLight.position.set(-3, -2, 4);
  scene.add(redLight);

  // Tronco arterial
  mainGroup.add(new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([V(0, -3.0, 0), V(0, 0, 0), V(-0.6, 2.8, 0.4)]), 32, 0.45, 16, false),
    new THREE.MeshPhongMaterial({
      color: 0x122e4c, emissive: 0x051627, specular: 0x00f0ff,
      shininess: 70, transparent: true, opacity: 0.85 })));

  // Saco en la bifurcación
  const aneurysmGeom = new THREE.SphereGeometry(1.2, 32, 32);
  const pos = aneurysmGeom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const factor = 1.0 + 0.15 * Math.sin(y * 2.5);
    pos.setXYZ(i, x * factor, y * (1.1 + 0.1 * x), z * factor);
  }
  aneurysmGeom.computeVertexNormals();
  const aneurysm = new THREE.Mesh(aneurysmGeom, new THREE.MeshPhongMaterial({
    color: 0x771128, emissive: 0x330612, specular: 0xff3366,
    shininess: 90, transparent: true, opacity: 0.88 }));
  aneurysm.position.set(1.1, 0.5, 0.2);
  mainGroup.add(aneurysm);

  // Perforantes: cian las holgadas, carmesí las que pasan demasiado cerca
  const perforators = new THREE.Group();
  mainGroup.add(perforators);

  const matSafe = new THREE.MeshStandardMaterial({
    color: 0x00f0ff, emissive: 0x024559, roughness: 0.3, metalness: 0.6 });
  const matCritical = new THREE.MeshStandardMaterial({
    color: 0xff3366, emissive: 0x540618, roughness: 0.2, metalness: 0.5 });

  const BRANCHES: { pts: THREE.Vector3[]; critical: boolean }[] = [
    { pts: [V(0.3, 0.1, 0.1), V(0.5, 0.3, 0.5), V(0.9, 0.6, 1.2), V(1.3, 1.1, 1.8)], critical: true },
    { pts: [V(-0.1, -0.2, 0.2), V(-0.4, 0.4, 0.8), V(-0.6, 1.2, 1.4)], critical: false },
    { pts: [V(0.2, -0.4, -0.2), V(0.6, -0.2, -0.7), V(1.1, 0.2, -1.3)], critical: true },
    { pts: [V(-0.2, 0.5, -0.1), V(-0.8, 1.3, -0.4), V(-1.4, 2.2, -0.8)], critical: false },
  ];

  const safetyRings: THREE.Mesh[] = [];
  const ringGeom = new THREE.RingGeometry(0.12, 0.16, 20);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff3366, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const dashMat = new THREE.LineDashedMaterial({ color: 0x00f0ff, dashSize: 0.1, gapSize: 0.06 });

  for (const branch of BRANCHES) {
    perforators.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branch.pts), 24, 0.07, 10, false),
      branch.critical ? matCritical : matSafe));

    if (!branch.critical) continue;
    const origin = branch.pts[0];

    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.copy(origin);
    ring.lookAt(aneurysm.position);
    perforators.add(ring);
    safetyRings.push(ring);

    // Línea de distancia de la rama al cuello
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin, aneurysm.position.clone().multiplyScalar(0.6)]),
      dashMat);
    line.computeLineDistances();
    perforators.add(line);
  }

  // Retícula de radar que encuadra la zona
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.63, 40),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }));
  reticle.position.set(0.4, 0.2, 0);
  mainGroup.add(reticle);

  // Rubor capilar de fondo
  const COUNT = 120;
  const pGeom = new THREE.BufferGeometry();
  const pPos = new Float32Array(COUNT * 3);
  for (let p = 0; p < COUNT; p++) {
    pPos[p * 3] = (Math.random() - 0.5) * 4;
    pPos[p * 3 + 1] = (Math.random() - 0.5) * 5;
    pPos[p * 3 + 2] = (Math.random() - 0.5) * 4;
  }
  pGeom.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  mainGroup.add(new THREE.Points(pGeom, new THREE.PointsMaterial({
    color: 0x00f0ff, size: 0.05, transparent: true, opacity: 0.55 })));

  return (t) => {
    mainGroup.rotation.y = t * 0.22 + pointer.x * 0.45;
    mainGroup.rotation.x = Math.sin(t * 0.18) * 0.12 + pointer.y * 0.3;
    mainGroup.position.y = Math.sin(t * 1.3) * 0.1;

    // Los anillos de aviso laten: es la alerta, no un adorno.
    const pulse = Math.sin(t * 3.5);
    for (const r of safetyRings) r.scale.setScalar(1.0 + pulse * 0.2);

    reticle.rotation.z += 0.005;
  };
};
