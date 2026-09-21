/* Bóveda de datos — el estudio del paciente, cifrado y sin identificadores.
   Stitch, pantalla «Three.js» ANIMATION_17: núcleo protegido con anillos de
   cifrado orbitando, escudos de metadatos despojados de datos personales y un
   flujo de bits entrando al búfer.

   Acompaña a la sección de seguridad, que era la única de contenido sin ningún
   apoyo visual. La escena es ilustrativa: no rotula algoritmo ni versión de
   protocolo —el original de Stitch hablaba de «TLS 1.3» y «AES-256 GCM» en sus
   comentarios—, porque la landing no debe afirmar garantías concretas que no
   estén verificadas en el despliegue real. Lo que muestra es la idea: el estudio
   viaja protegido y los identificadores del paciente se quedan fuera. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

export const dataVaultScene: SceneFactory = ({ scene, pointer }) => {
  const mainGroup = new THREE.Group();
  scene.add(mainGroup);

  scene.add(new THREE.AmbientLight(0x091c33, 2.5));
  const cyanLight = new THREE.DirectionalLight(0x00f0ff, 3.2);
  cyanLight.position.set(6, 6, 6);
  scene.add(cyanLight);
  const blueLight = new THREE.DirectionalLight(0x38bdf8, 2.5);
  blueLight.position.set(-6, -4, 4);
  scene.add(blueLight);

  const vault = new THREE.Group();
  mainGroup.add(vault);

  // Núcleo: carcasa de retícula sobre un pilar translúcido
  vault.add(new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 2.6, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.22, side: THREE.DoubleSide })));

  vault.add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 2.8, 32),
    new THREE.MeshStandardMaterial({
      color: 0x071e36, emissive: 0x021121, metalness: 0.8, roughness: 0.2,
      transparent: true, opacity: 0.75 })));

  // Anillos de cifrado, cada uno con sus bloques y su plano de giro
  const RADII = [1.6, 2.1, 2.6];
  const COLORS = [0x00f0ff, 0x38bdf8, 0x0ea5e9];
  const rings = RADII.map((radius, r) => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.04, radius + 0.04, 64),
      new THREE.MeshBasicMaterial({ color: COLORS[r], side: THREE.DoubleSide, transparent: true, opacity: 0.65 }));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    const blocks = 8 + r * 4;
    const blockGeom = new THREE.BoxGeometry(0.12, 0.08, 0.12);
    const blockMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    for (let b = 0; b < blocks; b++) {
      const angle = (b / blocks) * Math.PI * 2;
      const block = new THREE.Mesh(blockGeom, blockMat);
      block.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      g.add(block);
    }
    vault.add(g);
    return { group: g, speed: (r % 2 === 0 ? 0.35 : -0.3) * (1.0 + r * 0.2), tilt: (r - 1) * 0.35 };
  });

  /* Escudos de metadatos en órbita: la cabecera del estudio despojada de los
     datos que identifican al paciente. Van vacíos a propósito — rotular campos
     reales sería inventar un formato. */
  const SHIELDS = 6;
  const shieldGeom = new THREE.PlaneGeometry(0.7, 0.45);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x112d4a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const shieldEdgeMat = new THREE.LineBasicMaterial({ color: 0x00f0ff });
  const shields = Array.from({ length: SHIELDS }, (_, s) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(shieldGeom, shieldMat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(shieldGeom), shieldEdgeMat));
    vault.add(g);
    return { group: g, angle: (s / SHIELDS) * Math.PI * 2, radius: 3.1, yPos: ((s % 3) - 1) * 0.8 };
  });

  // Bits entrando al búfer
  const COUNT = 140;
  const pGeom = new THREE.BufferGeometry();
  const pPos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT * 3; i += 3) {
    pPos[i] = (Math.random() - 0.5) * 6;
    pPos[i + 1] = (Math.random() - 0.5) * 5;
    pPos[i + 2] = (Math.random() - 0.5) * 6;
  }
  pGeom.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  mainGroup.add(new THREE.Points(pGeom, new THREE.PointsMaterial({
    color: 0x00f0ff, size: 0.05, transparent: true, opacity: 0.65 })));

  return (t) => {
    mainGroup.rotation.y = t * 0.2 + pointer.x * 0.45;
    mainGroup.rotation.x = Math.sin(t * 0.12) * 0.1 + pointer.y * 0.3;
    mainGroup.position.y = Math.sin(t * 1.1) * 0.1;

    rings.forEach((r, idx) => {
      r.group.rotation.y = t * r.speed;
      r.group.rotation.x = Math.sin(t * 0.5 + idx) * r.tilt;
      r.group.rotation.z = Math.cos(t * 0.4 + idx) * (r.tilt * 0.5);
    });

    shields.forEach((sh, idx) => {
      const angle = sh.angle + t * 0.25;
      sh.group.position.set(
        Math.cos(angle) * sh.radius,
        sh.yPos + Math.sin(t * 1.5 + idx) * 0.15,
        Math.sin(angle) * sh.radius);
      sh.group.lookAt(0, sh.yPos, 0);
    });
  };
};
