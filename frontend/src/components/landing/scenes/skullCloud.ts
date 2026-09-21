/* SkullCloud — globo de colaboración entre centros.
   Stitch, pantalla «Three.js» ANIMATION_9: «SkullCloud Neural Inter-Hospital
   Collaboration Globe & Mesh».

   Esfera de retícula, nodos repartidos por el globo con su baliza, arcos que los
   enlazan y satélites en órbita. Acompaña a la tarjeta «SkullCloud» del roadmap:
   almacenamiento y colaboración de casos en la nube entre centros.

   El original de Stitch etiquetaba cada nodo con un hospital real (Queen Square,
   UCSF, Pitié-Salpêtrière…). Nunca llegaban a dibujarse como texto, pero se han
   quitado igualmente y solo quedan las coordenadas: SkullCloud es una función
   ANUNCIADA, no desplegada, y sugerir una red de centros asociados que no existe
   sería una afirmación falsa aunque viniera en letra pequeña. */

import * as THREE from "three";
import type { SceneFactory } from "../sceneHost";

/** Nodos repartidos por el globo. Solo coordenadas: no representan centros reales. */
const NODES: [number, number][] = [
  [40.4, -3.7], [40.7, -74.0], [37.7, -122.4], [51.5, -0.1], [35.6, 139.6],
  [-33.8, 151.2], [48.8, 2.3], [1.35, 103.8], [-23.5, -46.6],
];

const toVector = (lat: number, lon: number, radius: number) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta));
};

export const skullCloudScene: SceneFactory = ({ scene, pointer }) => {
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  // Esfera de retícula
  globeGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(2.3, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.18 })));

  const vectors = NODES.map(([lat, lon]) => toVector(lat, lon, 2.32));

  const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const nodeAltMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const dotGeom = new THREE.SphereGeometry(0.08, 12, 12);
  const beaconGeom = new THREE.RingGeometry(0.12, 0.16, 20);

  vectors.forEach((v, idx) => {
    const dot = new THREE.Mesh(dotGeom, idx % 2 === 0 ? nodeAltMat : nodeMat);
    dot.position.copy(v);
    globeGroup.add(dot);

    const beacon = new THREE.Mesh(beaconGeom, beaconMat);
    beacon.position.copy(v);
    beacon.lookAt(0, 0, 0);   // la baliza mira al centro: queda tangente al globo
    globeGroup.add(beacon);
  });

  // Arcos elevados entre nodos
  const arcMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.65 });
  for (let i = 0; i < vectors.length; i++) {
    const v1 = vectors[i];
    const v2 = vectors[(i + 2) % vectors.length];
    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(3.1);  // altura del arco
    const pts = new THREE.QuadraticBezierCurve3(v1, mid, v2).getPoints(36);
    globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat));
  }

  // Satélites en órbita
  const orbitGroup = new THREE.Group();
  globeGroup.add(orbitGroup);
  const satGeom = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const satMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const ORBITERS = 18;
  for (let o = 0; o < ORBITERS; o++) {
    const rad = 2.8 + (o % 5) * 0.14;
    const ang = (o / ORBITERS) * Math.PI * 2;
    const sat = new THREE.Mesh(satGeom, satMat);
    sat.position.set(Math.cos(ang) * rad, ((o % 7) / 7 - 0.5) * 1.5, Math.sin(ang) * rad);
    orbitGroup.add(sat);
  }

  return (t) => {
    globeGroup.rotation.y = t * 0.2 + pointer.x * 0.5;
    globeGroup.rotation.x = Math.sin(t * 0.1) * 0.1 + pointer.y * 0.3;
    orbitGroup.rotation.y = -t * 0.35;
  };
};
