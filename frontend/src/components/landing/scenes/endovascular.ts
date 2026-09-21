/* Endovascular — stent trenzado y coil dentro del saco.
   Stitch, pantalla «Three.js» ANIMATION_7: «Endovascular Braided Stent /
   Microcoil Deployment 3D Simulator».

   Arteria traslúcida con sus anillos de contorno, un stent de malla trenzada
   (catorce hebras en doble hélice, entrelazadas), el coil enrollado dentro del
   domo y partículas recorriendo la luz. Acompaña a la sección de dispositivos
   junto a [[clipKinematics]]: entre las dos cubren las dos familias que maneja
   la aplicación — el clip abierto y el tratamiento endovascular. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

export const endovascularScene: SceneFactory = ({ scene, pointer }) => {
  const root = new THREE.Group();
  scene.add(root);

  scene.add(new THREE.AmbientLight(0x0f2338, 2.5));
  const light1 = new THREE.PointLight(0x00f0ff, 3, 20);
  light1.position.set(4, 5, 4);
  scene.add(light1);
  const light2 = new THREE.PointLight(0x38bdf8, 2, 20);
  light2.position.set(-4, -4, 3);
  scene.add(light2);

  // Arteria madre, abierta por los extremos para ver el interior
  const vessel = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 7, 32, 1, true),
    new THREE.MeshPhongMaterial({
      color: 0x071e33, emissive: 0x020d18, transparent: true,
      opacity: 0.35, side: THREE.DoubleSide }));
  vessel.rotation.z = Math.PI / 2.8;
  root.add(vessel);

  // Anillos de contorno a lo largo del vaso
  for (let i = -3; i <= 3; i += 0.75) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.59, 1.61, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    ring.position.set(0, i, 0);
    ring.rotation.x = Math.PI / 2;
    vessel.add(ring);
  }

  // Stent: hebras en doble hélice que se cruzan como la malla real
  const stentGroup = new THREE.Group();
  vessel.add(stentGroup);

  const strandMatA = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, metalness: 0.85, roughness: 0.25, emissive: 0x033055 });
  const strandMatB = new THREE.MeshStandardMaterial({
    color: 0x00f0ff, metalness: 0.9, roughness: 0.2, emissive: 0x04466b });

  const STRANDS = 14, R = 1.55, H = 5.2, TURNS = 3.5, STEPS = 90;
  for (let s = 0; s < STRANDS; s++) {
    const phase = (s / STRANDS) * Math.PI * 2;
    const right: THREE.Vector3[] = [];
    const left: THREE.Vector3[] = [];
    for (let j = 0; j <= STEPS; j++) {
      const f = j / STEPS;
      const y = (f - 0.5) * H;
      const theta = f * Math.PI * 2 * TURNS + phase;
      right.push(new THREE.Vector3(Math.cos(theta) * R, y, Math.sin(theta) * R));
      left.push(new THREE.Vector3(Math.cos(-theta) * R, y, Math.sin(-theta) * R));
    }
    stentGroup.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(right), 70, 0.024, 6, false), strandMatA));
    stentGroup.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(left), 70, 0.024, 6, false), strandMatB));
  }

  // Coil: la hebra que rellena el saco desde dentro
  const coilGroup = new THREE.Group();
  coilGroup.position.set(1.9, 0.4, 0.2);
  vessel.add(coilGroup);

  const coilPts: THREE.Vector3[] = [];
  const COIL_STEPS = 160;
  for (let k = 0; k < COIL_STEPS; k++) {
    const p = k / COIL_STEPS;
    const rad = 0.75 * Math.sin(p * Math.PI);
    const angle = p * Math.PI * 14;
    coilPts.push(new THREE.Vector3(
      Math.cos(angle) * rad + Math.sin(p * 8) * 0.1,
      (p - 0.5) * 1.3,
      Math.sin(angle) * rad + Math.cos(p * 6) * 0.15));
  }
  coilGroup.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 120, 0.038, 8, false),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15, metalness: 0.95, roughness: 0.18, emissive: 0x553e06 })));

  // Contorno del domo que contiene al coil
  coilGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true, transparent: true, opacity: 0.35 })));

  // Flujo por la luz del stent
  const COUNT = 90;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(COUNT * 3);
  for (let p = 0; p < COUNT; p++) {
    pPos[p * 3] = (Math.random() - 0.5) * 1.2;
    pPos[p * 3 + 1] = (Math.random() - 0.5) * 6;
    pPos[p * 3 + 2] = (Math.random() - 0.5) * 1.2;
  }
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  vessel.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: 0x00f0ff, size: 0.08, transparent: true, opacity: 0.7 })));

  return (t) => {
    root.rotation.y = t * 0.35 + pointer.x * 0.6;
    root.rotation.x = Math.sin(t * 0.2) * 0.15 + pointer.y * 0.4;

    coilGroup.rotation.y = t * 0.4;
    coilGroup.rotation.z = Math.sin(t * 0.5) * 0.2;

    const arr = pGeo.attributes.position.array as Float32Array;
    for (let i = 1; i < COUNT * 3; i += 3) {
      arr[i] += 0.06;
      if (arr[i] > 3.2) arr[i] = -3.2;
    }
    pGeo.attributes.position.needsUpdate = true;
  };
};
