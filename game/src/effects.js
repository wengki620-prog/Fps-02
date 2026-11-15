// Efek tempur pooled: tracer, percikan, kilat moncong, dan ledakan.
// Semua pool dialokasikan sekali di awal; step() tidak pernah membuat objek baru.
import * as THREE from 'three';

const TRACER_COUNT = 24;
const FLASH_COUNT = 10;
const PARTICLE_COUNT = 240;

export function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255, 230, 170, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 180, 80, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 150, 40, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createEffects(scene) {
  // Tracer: garis lurus dari moncong ke titik kena, memudar dalam 70 ms.
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  // Kilat moncong bot: sprite glow yang menghadap kamera.
  const texture = createGlowTexture();
  const flashes = [];
  for (let i = 0; i < FLASH_COUNT; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false }));
    sprite.scale.set(0.55, 0.55, 1);
    sprite.visible = false;
    scene.add(sprite);
    flashes.push({ sprite, life: 0 });
  }
  let flashNext = 0;

  // Partikel: satu THREE.Points, buffer cincin; partikel mati diparkir di bawah tanah.
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const lives = new Float32Array(PARTICLE_COUNT);
  positions.fill(-100);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);
  let particleNext = 0;
  const tmpColor = new THREE.Color();

  // Ledakan: dua bola yang mengembang + satu lampu.
  const booms = [];
  for (let i = 0; i < 2; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.visible = false;
    scene.add(mesh);
    booms.push({ mesh, life: 0 });
  }
  const boomLight = new THREE.PointLight(0xff9040, 0, 18);
  scene.add(boomLight);
  let boomNext = 0;

  function spawnTracer(from, to) {
    const tracer = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    const attr = tracer.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    tracer.line.material.opacity = 0.85;
    tracer.line.visible = true;
    tracer.life = 0.07;
  }

  function spawnFlash(position) {
    const flash = flashes[flashNext];
    flashNext = (flashNext + 1) % FLASH_COUNT;
    flash.sprite.position.copy(position);
    flash.sprite.material.opacity = 0.95;
    flash.sprite.visible = true;
    flash.life = 0.055;
  }

  function spawnBurst(position, colorHex, count, speed, up = 2.5) {
    tmpColor.setHex(colorHex);
    for (let n = 0; n < count; n += 1) {
      const i = particleNext;
      particleNext = (particleNext + 1) % PARTICLE_COUNT;
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      velocities[i * 3] = (Math.random() * 2 - 1) * speed;
      velocities[i * 3 + 1] = Math.random() * up;
      velocities[i * 3 + 2] = (Math.random() * 2 - 1) * speed;
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
      lives[i] = 0.4 + Math.random() * 0.35;
    }
    particleGeometry.getAttribute('color').needsUpdate = true;
  }

  function spawnExplosion(position) {
    const boom = booms[boomNext];
    boomNext = (boomNext + 1) % booms.length;
    boom.mesh.position.copy(position);
    boom.mesh.scale.setScalar(0.4);
    boom.mesh.material.opacity = 0.85;
    boom.mesh.visible = true;
    boom.life = 0.5;
    boomLight.position.copy(position);
    boomLight.position.y += 1;
    boomLight.intensity = 60;
    spawnBurst(position, 0xffa040, 42, 7, 6);
    spawnBurst(position, 0x554a3a, 26, 4, 4);
  }

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.85;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
    for (const flash of flashes) {
      if (flash.life <= 0) continue;
      flash.life -= dt;
      flash.sprite.material.opacity = Math.max(0, flash.life / 0.055) * 0.95;
      if (flash.life <= 0) flash.sprite.visible = false;
    }
    let moved = false;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      if (lives[i] <= 0) continue;
      lives[i] -= dt;
      if (lives[i] <= 0) {
        positions[i * 3 + 1] = -100;
      } else {
        velocities[i * 3 + 1] -= 9 * dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.02) positions[i * 3 + 1] = 0.02;
      }
      moved = true;
    }
    if (moved) particleGeometry.getAttribute('position').needsUpdate = true;
    for (const boom of booms) {
      if (boom.life <= 0) continue;
      boom.life -= dt;
      const t = 1 - Math.max(0, boom.life / 0.5);
      boom.mesh.scale.setScalar(0.4 + t * 5.2);
      boom.mesh.material.opacity = Math.max(0, 0.85 * (1 - t));
      if (boom.life <= 0) boom.mesh.visible = false;
    }
    boomLight.intensity = Math.max(0, boomLight.intensity - dt * 220);
  }

  return { spawnTracer, spawnFlash, spawnBurst, spawnExplosion, step };
}
