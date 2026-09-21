/* Clip NAVARRO™ — cinemática de cierre sobre el cuello del saco.
   Stitch, pantalla «Three.js» ANIMATION_11: «Cinemática de Cierre y Ensamblaje
   del Clip Microquirúrgico NAVARRO™».

   Muelle de bayoneta, pivote con anillo de calibración, las dos mordazas con
   sus estrías atraumáticas, el vaso que se comprime al cerrar y un calibre
   milimétrico flotando sobre la pala. Acompaña a la sección de dispositivos:
   los clips NAVARRO son la familia propia del centro, la única que se ofrece.

   No rotula ninguna medida: la escena es ilustrativa y las cifras reales las
   calcula la aplicación por caso. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

export const clipKinematicsScene: SceneFactory = ({ scene, pointer }) => {
  const clip = new THREE.Group();
  scene.add(clip);

  // Luces quirúrgicas de alta precisión
  scene.add(new THREE.AmbientLight(0x0b1d30, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
  keyLight.position.set(5, 7, 6);
  scene.add(keyLight);
  const cyanRim = new THREE.DirectionalLight(0x00f0ff, 3.5);
  cyanRim.position.set(-6, -4, 5);
  scene.add(cyanRim);
  const redAccent = new THREE.PointLight(0xff3366, 3.0, 15);
  redAccent.position.set(2, 3, 2);
  scene.add(redAccent);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x93a3b8, metalness: 0.88, roughness: 0.22, emissive: 0x061a29 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, metalness: 0.92, roughness: 0.18, emissive: 0x032742 });

  // Muelle de bayoneta
  const spring = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.14, 18, 48, Math.PI * 1.8), accentMat);
  spring.position.set(-1.8, 0, 0);
  spring.rotation.y = Math.PI / 2;
  spring.rotation.x = Math.PI / 3;
  clip.add(spring);

  // Remache / pivote central del mecanismo
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 24), bodyMat);
  pin.position.set(-1.0, 0, 0);
  pin.rotation.z = Math.PI / 2;
  clip.add(pin);

  const pinRing = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.32, 32),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide }));
  pinRing.position.set(-1.0, 0, 0.31);
  clip.add(pinRing);

  /* Las dos mordazas giran sobre el pivote, así que cada una va en su propio
     grupo anclado ahí: basta rotar el grupo para abrir y cerrar. */
  const jaw = (sign: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(-1.0, 0.15 * sign, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.26, 0.28), bodyMat);
    blade.position.set(1.8, 0, 0);
    g.add(blade);
    // Estrías atraumáticas en la cara interna
    for (let s = 0.4; s < 3.4; s += 0.25) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), accentMat);
      rib.position.set(s, -0.14 * sign, 0);
      g.add(rib);
    }
    clip.add(g);
    return g;
  };
  const upperJaw = jaw(1);
  const lowerJaw = jaw(-1);

  // Vaso en la línea de cierre
  const vessel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 2.5, 32),
    new THREE.MeshPhongMaterial({
      color: 0x991133, emissive: 0x3d0614, specular: 0xff3366,
      shininess: 90, transparent: true, opacity: 0.85 }));
  vessel.position.set(1.4, 0, 0);
  vessel.rotation.x = Math.PI / 2.2;
  clip.add(vessel);

  // Calibre milimétrico flotando sobre la pala
  const rulerMat = new THREE.LineBasicMaterial({ color: 0x00f0ff });
  clip.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.2, 0.6, 0), new THREE.Vector3(3.4, 0.6, 0)]), rulerMat));
  for (let r = 0.2; r <= 3.4; r += 0.4) {
    clip.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(r, 0.5, 0), new THREE.Vector3(r, 0.7, 0)]), rulerMat));
  }

  // Partículas de ambiente
  const COUNT = 80;
  const pGeom = new THREE.BufferGeometry();
  const pPos = new Float32Array(COUNT * 3);
  for (let p = 0; p < COUNT; p++) {
    pPos[p * 3] = (Math.random() - 0.5) * 5;
    pPos[p * 3 + 1] = (Math.random() - 0.5) * 4;
    pPos[p * 3 + 2] = (Math.random() - 0.5) * 4;
  }
  pGeom.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  clip.add(new THREE.Points(pGeom, new THREE.PointsMaterial({
    color: 0x00f0ff, size: 0.06, transparent: true, opacity: 0.5 })));

  clip.rotation.z = -0.25;
  clip.rotation.x = 0.35;

  return (t) => {
    clip.rotation.y = t * 0.25 + pointer.x * 0.5;
    clip.rotation.x = 0.35 + Math.sin(t * 0.2) * 0.1 + pointer.y * 0.3;

    // Ciclo de oclusión: las mordazas abren y vuelven a cerrar sobre el cuello.
    const cycle = Math.sin(t * 1.6);
    const jawAngle = cycle > 0.3 ? (cycle - 0.3) * 0.22 : 0.0;
    upperJaw.rotation.z = jawAngle;
    lowerJaw.rotation.z = -jawAngle;

    // El vaso cede mientras el clip está cerrado y se recupera al abrir.
    const compression = jawAngle === 0 ? 0.72 : 1.0 - 0.28 * (1.0 - jawAngle * 4);
    vessel.scale.set(1.0, Math.max(0.7, compression), 1.0);
  };
};
