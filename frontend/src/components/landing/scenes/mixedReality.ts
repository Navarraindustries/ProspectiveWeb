/* Realidad mixta — proyección neuronavegada sobre el campo quirúrgico.
   Stitch, pantalla «Three.js» ANIMATION_13: «Realidad Mixta Intraoperatoria con
   Casco Quirúrgico AR & Proyección Neuronavigada».

   Matriz estereotáxica del cráneo en retícula, ventana de craneotomía con su
   anillo y el cono del proyector, el gemelo digital del árbol arterial flotando
   en el foco con el saco latiendo, y cuatro balizas de seguimiento espacial.
   Acompaña a la tarjeta «AR / VR» del roadmap — función anunciada, no desplegada. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

export const mixedRealityScene: SceneFactory = ({ scene, pointer }) => {
  const arGroup = new THREE.Group();
  scene.add(arGroup);

  scene.add(new THREE.AmbientLight(0x071526, 2.5));
  const lightCyan = new THREE.DirectionalLight(0x00f0ff, 3.8);
  lightCyan.position.set(5, 6, 6);
  scene.add(lightCyan);
  const lightMagenta = new THREE.PointLight(0xff3366, 2.8, 20);
  lightMagenta.position.set(-4, 3, -2);
  scene.add(lightMagenta);

  // Matriz estereotáxica del cráneo
  arGroup.add(new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.3, 3),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.16 })));

  // Ventana de craneotomía: anillo de resección orientado hacia el centro
  const craniotomyRing = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.08, 36),
    new THREE.MeshBasicMaterial({ color: 0xff3366, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  craniotomyRing.position.set(1.4, 0.6, 1.4);
  craniotomyRing.lookAt(0, 0, 0);
  arGroup.add(craniotomyRing);

  // Cono del proyector sobre la ventana
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const arBeam = new THREE.Mesh(new THREE.ConeGeometry(1.04, 2.2, 32, 1, true), beamMat);
  arBeam.position.set(1.4, 0.6, 1.4);
  arBeam.lookAt(0, 0, 0);
  arBeam.rotation.x += Math.PI / 2;
  arGroup.add(arBeam);

  // Gemelo digital en el foco quirúrgico
  const focusGroup = new THREE.Group();
  focusGroup.position.set(0.3, 0.2, 0.2);
  arGroup.add(focusGroup);

  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.6, -1.2, 0), new THREE.Vector3(-0.2, -0.4, 0.1),
    new THREE.Vector3(0, 0.3, 0.2), new THREE.Vector3(0.6, 1.1, 0.3)]);
  focusGroup.add(new THREE.Mesh(
    new THREE.TubeGeometry(path, 30, 0.15, 12, false),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8, metalness: 0.5, roughness: 0.3, emissive: 0x023b5e })));

  const sac = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0xff3366, metalness: 0.4, roughness: 0.2, emissive: 0x4a0515 }));
  sac.position.set(0.2, 0.5, 0.35);
  focusGroup.add(sac);

  // Balizas de seguimiento espacial
  const trackingGroup = new THREE.Group();
  arGroup.add(trackingGroup);
  const BEACONS: [number, number, number][] = [
    [-1.8, 1.6, 1.2], [1.9, 1.7, -1.0], [-1.6, -1.8, 1.0], [1.8, -1.5, 1.2]];
  for (const [x, y, z] of BEACONS) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })));
    g.add(new THREE.Mesh(new THREE.RingGeometry(0.12, 0.15, 16),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })));
    g.add(new THREE.Mesh(new THREE.RingGeometry(0.20, 0.22, 16),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })));
    trackingGroup.add(g);
  }

  // Partículas de calibración
  const COUNT = 100;
  const pGeom = new THREE.BufferGeometry();
  const pPos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT * 3; i++) pPos[i] = (Math.random() - 0.5) * 6;
  pGeom.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  arGroup.add(new THREE.Points(pGeom, new THREE.PointsMaterial({
    color: 0x00f0ff, size: 0.05, transparent: true, opacity: 0.6 })));

  return (t) => {
    arGroup.rotation.y = t * 0.2 + pointer.x * 0.45;
    arGroup.rotation.x = Math.sin(t * 0.15) * 0.1 + pointer.y * 0.3;

    craniotomyRing.scale.setScalar(1.0 + Math.sin(t * 3.0) * 0.08);
    beamMat.opacity = 0.18 + Math.sin(t * 2.5) * 0.08;

    trackingGroup.children.forEach((b, i) => {
      b.rotation.z = t * (i % 2 === 0 ? 0.8 : -0.8);
    });

    const pulse = Math.sin(t * 3.2);
    sac.scale.setScalar(1.0 + (pulse > 0.4 ? (pulse - 0.4) * 0.09 : 0.0));
  };
};
