// Senjata pemain: viewmodel kotak per senjata, sebaran, recoil, dan animasi.
// Angka senjata hidup di config.js; modul ini hanya membangun model dan
// menghitung sebaran dari gerakan, jongkok, dan bloom tembakan sebelumnya.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { createGlowTexture } from './effects.js';

export function spreadFor(def, speed, crouching, slow, bloom) {
  const move = Math.min(1, speed / 5.2);
  let spread = def.spreadBase + move * def.spreadMove + bloom;
  if (crouching) spread *= 0.6;
  if (slow) spread *= 0.75;
  return spread;
}

export function damageFalloff(def, distance) {
  if (distance <= def.falloffStart) return 1;
  const over = (distance - def.falloffStart) / 30;
  return Math.max(def.falloffMin, 1 - over * 0.5);
}

function boxPart(w, h, d, x, y, z, material, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function createPlayerWeapons(camera) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.45, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x6b4f30, roughness: 0.8, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.7 });

  const models = {};
  // Pistol: ringkas, laras pendek.
  {
    const g = new THREE.Group();
    boxPart(0.07, 0.09, 0.26, 0, 0, -0.05, metal, g);
    boxPart(0.06, 0.12, 0.08, 0, -0.09, 0.06, grip, g);
    boxPart(0.03, 0.03, 0.1, 0, 0.05, -0.2, accent, g);
    models.pistol = g;
  }
  // Senapan: panjang, mag melengkung, popor.
  {
    const g = new THREE.Group();
    boxPart(0.08, 0.1, 0.5, 0, 0, -0.1, metal, g);
    boxPart(0.05, 0.05, 0.34, 0, 0.03, -0.42, accent, g);
    boxPart(0.06, 0.16, 0.09, 0, -0.11, -0.08, grip, g);
    boxPart(0.07, 0.09, 0.24, 0, -0.02, 0.26, grip, g);
    boxPart(0.03, 0.04, 0.08, 0, 0.07, -0.18, accent, g);
    models.rifle = g;
  }
  // SMG: pendek, peredam, mag lurus.
  {
    const g = new THREE.Group();
    boxPart(0.07, 0.09, 0.34, 0, 0, -0.06, metal, g);
    boxPart(0.055, 0.055, 0.2, 0, 0.01, -0.3, accent, g);
    boxPart(0.05, 0.15, 0.07, 0, -0.1, -0.02, grip, g);
    boxPart(0.06, 0.07, 0.14, 0, -0.01, 0.18, grip, g);
    models.smg = g;
  }
  // Shotgun: tebal, pompa kayu, laras ganda visual.
  {
    const g = new THREE.Group();
    boxPart(0.09, 0.1, 0.44, 0, 0, -0.08, metal, g);
    boxPart(0.08, 0.06, 0.2, 0, -0.07, -0.24, grip, g);
    boxPart(0.05, 0.05, 0.3, 0, 0.02, -0.4, accent, g);
    boxPart(0.07, 0.1, 0.24, 0, -0.03, 0.28, grip, g);
    models.shotgun = g;
  }
  // Granat di tangan: bola kecil bergaris.
  {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.6, metalness: 0.3 }));
    g.add(ball);
    boxPart(0.03, 0.04, 0.03, 0, 0.07, 0, accent, g);
    models.grenade = g;
  }
  for (const model of Object.values(models)) {
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: createGlowTexture(), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(0xffc98a, 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let current = null;
  let kick = 0;
  let flashLeft = 0;
  let switchLeft = 0;

  function show(id) {
    if (current === id) return;
    for (const [key, model] of Object.entries(models)) model.visible = key === id;
    current = id;
  }

  return {
    step(dt, character) {
      const weapon = character.activeSlot === 'grenade' ? null : character.activeSlot === 'primary' && character.primary ? character.primary : character.secondary;
      const want = character.activeSlot === 'grenade' ? 'grenade' : weapon.id;
      if (switchLeft > 0) {
        switchLeft = Math.max(0, switchLeft - dt);
      } else if (current !== want) {
        show(want);
      }
      kick += (0 - kick) * Math.min(1, dt * 14);
      flashLeft = Math.max(0, flashLeft - dt);
      flash.visible = flashLeft > 0;
      flashLight.intensity = flashLeft > 0 ? 16 : 0;
      const model = models[current];
      if (!model) return;
      const reloading = weapon && weapon.reloadLeft > 0;
      const dip = reloading ? -0.55 * Math.min(1, (WEAPONS[weapon.id].reload - weapon.reloadLeft) * 2) : 0;
      model.position.z = -0.42 + kick + (switchLeft > 0 ? 0.12 : 0);
      model.position.y = -0.2 - (switchLeft > 0 ? 0.08 : 0);
      model.rotation.x = kick * 2.2 + dip;
    },
    onFire() {
      kick = 0.055;
      flashLeft = 0.06;
      flash.rotation.z = Math.random() * Math.PI;
    },
    onSwitch() {
      switchLeft = 0.22;
    },
    muzzleLocal(out) {
      return out.set(0.24, -0.17, -0.95);
    },
  };
}

// Senjata bot: satu kotak sederhana di tangan, tanpa animasi viewmodel.
export function buildBotGun() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.5 });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.55), metal);
  gun.position.set(0, 0, -0.2);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), metal);
  mag.position.set(0, -0.12, -0.12);
  group.add(gun, mag);
  return group;
}
