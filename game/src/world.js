// Peta "Dermaga Senja": halaman kontainer 44 x 36 m dengan tiga jalur —
// gudang barat (Situs A), halaman tengah, dan dermaga timur (Situs B).
// Semua geometri adalah kotak/silinder prosedural dengan palet senja; tidak ada
// model, tekstur file, atau aset luar. Tiap kotak adalah collider sekaligus
// permukaan yang menghentikan peluru. Waypoint digambar tangan mengikuti jalur.
import * as THREE from 'three';
import { makeCollider } from './collision.js';

const PALETTE = {
  ground: 0x6b6257,
  concrete: 0x8b8f94,
  concreteDark: 0x5c6066,
  wall: 0x7d8494,
  teal: 0x2e6f6a,
  rust: 0xa85b32,
  amber: 0xc98a3b,
  wood: 0x9a7b52,
  metal: 0x3a414d,
  dark: 0x232936,
};

export const WAYPOINTS = [
  [-14, -15.5], [0, -15.5], [14, -15.5], [-15.5, -11], [-15.5, -9],
  [-12.5, -6.5], [-15, -2], [-17, 4], [-14, 9], [-9.5, 12.5],
  [-3, -10], [3, -11], [0, -6], [-3, -1], [3, -1],
  [0, 4], [-2, 9], [2, 9], [0, 13], [19.5, -13.5],
  [14, -9], [12, -9.5], [14, -2], [18, 4], [14, 9],
  [9.5, 12.5], [-6, 15.5], [0, 15.5], [6, 15.5], [-12, -11],
  [17, -10],
];

const EDGES = [
  [0, 3], [3, 4], [4, 29], [29, 5], [5, 6], [3, 10], [10, 11], [10, 12], [11, 12],
  [12, 13], [12, 14], [13, 15], [14, 15], [15, 16], [15, 17], [16, 18], [17, 18],
  [6, 7], [7, 8], [8, 9], [9, 26], [18, 27], [26, 27], [27, 28], [25, 28],
  [1, 10], [1, 11], [2, 19], [19, 20], [19, 30], [20, 30], [20, 21], [21, 14],
  [21, 22], [22, 23], [23, 24], [24, 25], [30, 22],
];

export const SITES = {
  A: { center: new THREE.Vector3(-15.5, 0, -9), radius: 4, node: 4, color: 0x3fb8a6 },
  B: { center: new THREE.Vector3(14, 0, -9), radius: 4.5, node: 20, color: 0xf2a541 },
};

export const SPAWNS = {
  DEF: [
    { x: -6, z: 15.5, yaw: 0 },
    { x: 0, z: 15.5, yaw: 0 },
    { x: 6, z: 15.5, yaw: 0 },
  ],
  ATK: [
    { x: -14, z: -15.5, yaw: Math.PI },
    { x: 0, z: -15.5, yaw: Math.PI },
    { x: 14, z: -15.5, yaw: Math.PI },
  ],
};

function textTexture(lines, width, height, bg, fg, font) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, width / 2, height * (i + 0.5) / lines.length));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const [name, color] of Object.entries(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 });
  }
  materials.metal.roughness = 0.5;
  materials.metal.metalness = 0.5;
  materials.ground.roughness = 1;

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(makeCollider(x, y, z, w, h, d));
    shootables.push(mesh);
    return mesh;
  }

  function barrel(x, z, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), materials[mat]);
    mesh.position.set(x, 0.55, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(makeCollider(x, 0.55, z, 0.9, 1.1, 0.9));
    shootables.push(mesh);
  }

  function crate(x, z, size = 1.2, mat = 'wood') {
    box(size, size, size, x, size / 2, z, mat);
  }

  // Lantai dan dinding keliling.
  box(46, 0.4, 38, 0, -0.2, 0, 'ground');
  box(46, 5, 1, 0, 2.5, -18.5, 'wall');
  box(46, 5, 1, 0, 2.5, 18.5, 'wall');
  box(1, 5, 38, -22.5, 2.5, 0, 'wall');
  box(1, 5, 38, 22.5, 2.5, 0, 'wall');
  // Apron luar: tanah gelap sampai ke cakrawala.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ color: 0x1a2030 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.26;
  group.add(apron);

  // Gudang A: dinding utara (pintu), selatan (pintu), timur (pintu).
  box(5, 4.2, 0.8, -19.5, 2.1, -13, 'concreteDark');
  box(5, 4.2, 0.8, -11.5, 2.1, -13, 'concreteDark');
  box(8, 4.2, 0.8, -18, 2.1, -5, 'concreteDark');
  box(2, 4.2, 0.8, -10, 2.1, -5, 'concreteDark');
  box(2, 4.2, 0.8, -9, 2.1, -12, 'concreteDark');
  box(3, 4.2, 0.8, -9, 2.1, -6.5, 'concreteDark');
  // Balok atap gudang (visual + menahan peluru, bukan collider).
  box(13, 0.5, 0.6, -15.5, 4.2, -11, 'metal', false);
  box(13, 0.5, 0.6, -15.5, 4.2, -7, 'metal', false);
  crate(-17, -9, 1.2);
  crate(-10.5, -12, 1.2);
  crate(-18.5, -6, 1.2);
  crate(-11, -7.5, 1.2);
  barrel(-20.5, -12, 'rust');
  barrel(-20.5, -10.8, 'teal');

  // Dermaga B: kontainer pembatas dengan celah masuk barat dan selatan.
  box(8, 2.6, 2, 13, 1.3, -13, 'teal');
  box(2.4, 2.6, 8, 20.5, 1.3, -8, 'rust');
  box(4, 2.6, 2, 11, 1.3, -3.5, 'amber');
  box(5, 2.6, 2, 18.5, 1.3, -3.5, 'teal');
  box(4, 2.6, 2.2, 15.5, 1.3, -7.5, 'rust');
  box(2.4, 2.6, 2.4, 10.5, 1.3, -12, 'amber');
  crate(12, -11, 1.2);
  crate(18, -5.5, 1.2);
  barrel(21, -14.5, 'teal');

  // Halaman tengah: pilar, kontainer, peti, dan tong.
  box(2, 4.6, 2, 0, 2.3, -2, 'concrete');
  box(1.4, 0.8, 1.4, 0, 5, -2, 'metal', false);
  box(5, 2.6, 2.2, -4.5, 1.3, 3, 'teal');
  box(5, 2.6, 2.2, 4.5, 1.3, -5, 'rust');
  box(2.2, 2.6, 5, -7.5, 1.3, 8, 'amber');
  box(2.2, 2.6, 5, 7.5, 1.3, -9.5, 'teal');
  crate(-4.5, -3.5, 1.2);
  crate(3.5, 6.5, 1.2);
  crate(-2.5, 6.5, 1.2);
  crate(6.5, 1.5, 1.2);
  barrel(-7, -6, 'rust');
  barrel(6.5, 7.5, 'teal');
  barrel(-9, 14, 'amber');
  barrel(9.5, 11, 'rust');

  // Sisi selatan (spawn Penjaga): tembok rendah bercelah tengah dan peti.
  // Celah tengah (x -1..1) adalah jalur graf waypoint; tembok samping pendek
  // supaya gang barat/timur tetap terhubung ke halaman tengah.
  box(3, 1.2, 1, -2.5, 0.6, 12, 'concrete');
  box(3, 1.2, 1, 2.5, 0.6, 12, 'concrete');
  box(1, 1.2, 3, -11, 0.6, 13.5, 'concrete');
  box(1, 1.2, 3, 11, 0.6, 13.5, 'concrete');
  crate(-6, 10, 1.2);
  crate(6, 10, 1.2);
  // Gang barat dan timur.
  crate(-19.5, 6, 1.2);
  crate(-18.5, -1, 1.2);
  crate(20, 2, 1.2);
  crate(20.5, 8, 1.2);
  box(2.2, 2.6, 4, -20, 1.3, 12, 'teal');

  // Penanda situs: cincin di lantai + suar cahaya + papan nama.
  const siteMeshes = {};
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 48),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.03, site.center.z);
    group.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.3, 6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beacon.position.set(site.center.x, 3, site.center.z);
    group.add(beacon);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.1),
      new THREE.MeshBasicMaterial({ map: textTexture([`SITUS ${key}`], 512, 168, '#171e2c', key === 'A' ? '#3fb8a6' : '#f2a541', 'bold 96px system-ui, sans-serif'), side: THREE.DoubleSide }),
    );
    sign.position.set(site.center.x, 3.4, site.center.z + (key === 'A' ? 2.2 : 2.6));
    group.add(sign);
    siteMeshes[key] = { ring, beacon, sign };
  }
  // Papan nama dermaga di dinding gudang.
  const mainSign = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.6),
    new THREE.MeshBasicMaterial({ map: textTexture(['DERMAGA SENJA'], 1024, 224, '#232936', '#f2a541', 'bold 120px system-ui, sans-serif') }),
  );
  mainSign.position.set(-15.5, 3.1, -4.55);
  group.add(mainSign);

  // Siluet di luar dinding: crane pelabuhan dan gudang jauh.
  function crane(x, z, h, arm) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), materials.dark);
    mast.position.set(x, h / 2, z);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(arm, 0.7, 0.7), materials.dark);
    jib.position.set(x + arm / 2 - 1, h, z);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3, 0.12), materials.dark);
    cable.position.set(x + arm - 2.5, h - 1.5, z);
    group.add(mast, jib, cable);
  }
  crane(-30, -24, 16, 12);
  crane(28, -20, 13, 10);
  crane(34, 8, 15, 11);
  box(14, 6, 8, -32, 3, 6, 'dark', false);
  box(10, 5, 8, 30, 2.5, 14, 'dark', false);
  // Matahari terbenam: cakram amber di barat.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: 0xf2a541, fog: false }));
  sun.position.set(-70, 9, -34);
  sun.lookAt(0, 2, 0);
  group.add(sun);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xe0683c, transparent: true, opacity: 0.25, fog: false }));
  glow.position.set(-70.5, 9, -34.5);
  glow.lookAt(0, 2, 0);
  group.add(glow);

  // Pencahayaan: matahari hangat dari barat, langit nila, lampu situs.
  const hemi = new THREE.HemisphereLight(0x8fa3c8, 0x4a4238, 0.85);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffc98a, 2.4);
  sunLight.position.set(-30, 18, -12);
  sunLight.target.position.set(4, 0, 4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.camera.far = 80;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight, sunLight.target);
  const fill = new THREE.DirectionalLight(0x6f87b8, 0.5);
  fill.position.set(18, 12, 16);
  scene.add(fill);
  for (const site of Object.values(SITES)) {
    const lamp = new THREE.PointLight(site.color, 14, 16, 1.8);
    lamp.position.set(site.center.x, 3.6, site.center.z);
    scene.add(lamp);
  }
  const midLamp = new THREE.PointLight(0xffc98a, 10, 15, 1.8);
  midLamp.position.set(0, 4.4, 2);
  scene.add(midLamp);

  // Graf waypoint: daftar tetangga per node untuk BFS bot.
  const neighbors = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    neighbors[a].push(b);
    neighbors[b].push(a);
  }

  // Perangkat: kotak kecil dengan lampu kedip; rounds.js yang memposisikannya.
  const device = new THREE.Group();
  const deviceBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), materials.metal);
  deviceBody.castShadow = true;
  const deviceLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4030 }),
  );
  deviceLight.position.set(0.14, 0.15, 0);
  device.add(deviceBody, deviceLight);
  device.visible = false;
  scene.add(device);

  return { colliders, shootables, neighbors, sites: SITES, spawns: SPAWNS, siteMeshes, device, deviceLight, group };
}

// BFS di graf waypoint: rute node-demi-node dari node terdekat `from` ke `to`.
// Mengembalikan array node (tanpa node awal) yang dipakai ulang oleh pemanggil.
export function findRoute(neighbors, from, to, out) {
  out.length = 0;
  if (from === to) return out;
  const prev = new Int16Array(neighbors.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    if (node === to) break;
    for (const next of neighbors[node]) {
      if (prev[next] === -1) {
        prev[next] = node;
        queue.push(next);
      }
    }
  }
  if (prev[to] === -1) return out;
  const path = [];
  let node = to;
  while (node !== from) {
    path.push(node);
    node = prev[node];
  }
  path.reverse();
  for (const step of path) out.push(step);
  return out;
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i][0] - x;
    const dz = WAYPOINTS[i][1] - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
