/* Árbol arterial — la escena que preside el hero.
   Stitch, pantalla «Three.js» ANIMATION_4.

   Árbol arterial cerebral con un aneurisma sacular en la bifurcación, un clip
   quirúrgico cruzándole el cuello, anillos de medida sobre cuello y domo, y
   partículas de flujo hemodinámico. Late a ritmo sistólico y gira siguiendo el
   ratón con inercia. Es, literalmente, lo que hace la aplicación — por eso
   sustituye al vídeo que había antes de fondo. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const vascularTreeScene: SceneFactory = ({ scene, pointer, host }) => {
  scene.add(new THREE.AmbientLight(0x0f2b48, 2.5));

  const dirLight1 = new THREE.DirectionalLight(0x00f0ff, 3.5);
  dirLight1.position.set(10, 12, 10);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xff3366, 2.8);
  dirLight2.position.set(-10, -8, 8);
  scene.add(dirLight2);

  const pointLight = new THREE.PointLight(0x00f0ff, 4, 30);
  pointLight.position.set(0, 2, 6);
  scene.add(pointLight);

  const vascularGroup = new THREE.Group();
  scene.add(vascularGroup);

  /* Corrimiento horizontal: en ancho el modelo llena el hero de lado a lado,
     pero su punto focal —el saco y el clip— tiene que caer FUERA de la columna
     de texto, o el aneurisma acaba justo detrás del titular. En estrecho no hay
     columna que esquivar (el texto se le superpone entero y el modelo baja de
     opacidad), así que se recentra. */
  const offsetX = () => (host.clientWidth >= 1100 ? 2.6 : 0);
  vascularGroup.position.x = offsetX();

  const vesselMaterial = new THREE.MeshPhongMaterial({
    color: 0x112d4e, emissive: 0x05162a, specular: 0x00f0ff,
    shininess: 90, transparent: true, opacity: 0.88 });
  const vesselGlowWire = new THREE.MeshBasicMaterial({
    color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.25 });
  const aneurysmMaterial = new THREE.MeshPhongMaterial({
    color: 0x991133, emissive: 0x440815, specular: 0xff3366,
    shininess: 120, transparent: true, opacity: 0.92 });
  const clipMaterial = new THREE.MeshStandardMaterial({
    color: 0xdde8f0, roughness: 0.2, metalness: 0.85 });

  // ── Árbol arterial: tubos sobre splines ──────────────────────────────────
  const branch = (points: THREE.Vector3[], radius: number) => {
    const geom = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, radius, 16, false);
    const mesh = new THREE.Mesh(geom, vesselMaterial);
    mesh.add(new THREE.Mesh(geom, vesselGlowWire));
    return mesh;
  };

  // Tronco carotídeo / ACM
  vascularGroup.add(branch(
    [V(0, -6, 0), V(0.4, -3, 0.2), V(0, 0, 0), V(-0.8, 2.5, 0.5), V(-2.2, 4.8, 1.2)], 0.65));
  // Bifurcación / ACA
  vascularGroup.add(branch(
    [V(0, 0, 0), V(1.2, 2.0, -0.4), V(2.8, 3.8, -1.0), V(4.2, 5.0, -1.2)], 0.5));
  // Ramas laterales (PCOM / silvianas)
  vascularGroup.add(branch(
    [V(-0.8, 2.5, 0.5), V(-2.5, 2.2, -0.8), V(-4.5, 2.8, -1.5)], 0.35));
  vascularGroup.add(branch(
    [V(1.2, 2.0, -0.4), V(2.5, 1.2, 1.0), V(4.0, 1.5, 1.8)], 0.32));

  // ── Aneurisma sacular en la bifurcación ──────────────────────────────────
  const aneurysmGeom = new THREE.SphereGeometry(1.4, 32, 32);
  // Se deforma la esfera para que el saco resulte orgánico y asimétrico.
  const pos = aneurysmGeom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const factor = 1.0 + 0.25 * Math.sin(y * 2.0) + 0.15 * Math.cos(x * 3.0);
    pos.setXYZ(i, x * factor, y * (1.1 + 0.1 * z), z * factor);
  }
  aneurysmGeom.computeVertexNormals();

  const aneurysmMesh = new THREE.Mesh(aneurysmGeom, aneurysmMaterial);
  aneurysmMesh.position.set(0.7, 0.8, 0.3);
  vascularGroup.add(aneurysmMesh);

  // Jaula de contorno del domo
  aneurysmMesh.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.48, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true, transparent: true, opacity: 0.45 })));

  // ── Clip quirúrgico cruzando el cuello ───────────────────────────────────
  const clipGroup = new THREE.Group();
  const bladeGeom = new THREE.BoxGeometry(0.18, 2.0, 0.12);
  const blade1 = new THREE.Mesh(bladeGeom, clipMaterial);
  blade1.position.set(-0.15, 0, 0);
  const blade2 = new THREE.Mesh(bladeGeom, clipMaterial);
  blade2.position.set(0.15, 0, 0);
  const spring = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.08, 12, 24, Math.PI * 1.5), clipMaterial);
  spring.rotation.z = Math.PI / 2;
  spring.position.set(0, -1.0, 0);
  clipGroup.add(blade1, blade2, spring);
  clipGroup.position.set(0.1, -0.1, 0.3);
  clipGroup.rotation.z = -0.7;
  clipGroup.rotation.y = 0.4;
  vascularGroup.add(clipGroup);

  // ── Anillos de medida (HUD) ──────────────────────────────────────────────
  const markerRing = (radius: number, color: number) => new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.9, radius, 32),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));

  const neckMarker = markerRing(0.85, 0x00f0ff);   // cuello
  neckMarker.position.set(0.1, -0.1, 0.4);
  vascularGroup.add(neckMarker);

  const domeMarker = markerRing(1.6, 0xff3366);    // domo
  domeMarker.position.set(0.7, 0.8, 0.3);
  domeMarker.rotation.x = 1.2;
  vascularGroup.add(domeMarker);

  // ── Partículas de flujo hemodinámico ─────────────────────────────────────
  const PARTICLES = 200;
  const particleGeom = new THREE.BufferGeometry();
  const particlePos = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES * 3; i += 3) {
    particlePos[i] = (Math.random() - 0.5) * 12;
    particlePos[i + 1] = (Math.random() - 0.5) * 14;
    particlePos[i + 2] = (Math.random() - 0.5) * 8;
  }
  particleGeom.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
  vascularGroup.add(new THREE.Points(particleGeom, new THREE.PointsMaterial({
    color: 0x00f0ff, size: 0.12, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending })));

  return (t) => {
    // Giro con inercia siguiendo el ratón, más una deriva constante.
    vascularGroup.rotation.y += (pointer.x * 0.65 - vascularGroup.rotation.y) * 0.05 + 0.003;
    vascularGroup.rotation.x += (-pointer.y * 0.45 - vascularGroup.rotation.x) * 0.05;
    vascularGroup.position.y = Math.sin(t * 1.2) * 0.25;
    vascularGroup.position.x = offsetX();

    // Expansión sistólica: el saco se hincha en el pico de cada latido.
    const pulse = Math.sin(t * 3.5);
    aneurysmMesh.scale.setScalar(1.0 + (pulse > 0.4 ? (pulse - 0.4) * 0.06 : 0.0));

    neckMarker.rotation.z += 0.015;
    domeMarker.rotation.z -= 0.02;

    const pp = particleGeom.attributes.position.array as Float32Array;
    for (let i = 1; i < PARTICLES * 3; i += 3) {
      pp[i] += 0.035;
      if (pp[i] > 7) pp[i] = -7;
    }
    particleGeom.attributes.position.needsUpdate = true;
  };
};
