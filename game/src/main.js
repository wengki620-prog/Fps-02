// Boot dan loop utama: renderer, wiring semua sistem, simulasi langkah-tetap
// 60 Hz yang terpisah dari render, kamera first-person, dan aliran overlay.
// Mode ?shot=...&seed=... dan ?autotest=1 ditangani modul shot.js.
import * as THREE from 'three';
import { BOT_NAMES, WEAPONS } from './config.js';
import { activeWeapon, createCharacter, createState, drainEvents, playerOf } from './state.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayerController } from './player.js';
import { createPlayerWeapons, spreadFor } from './weapons.js';
import { createCombat } from './combat.js';
import { createBotSystem } from './bots.js';
import { createRounds } from './rounds.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { runAutotest, stageShot } from './shot.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) && seedParam !== 0 ? seedParam : (Date.now() % 2147483647) + 1;
const autotest = params.get('autotest') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3348);
scene.fog = new THREE.Fog(0x2a3348, 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const state = createState(seed);
const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const combatHooks = {};
const combat = createCombat(state, world, scene, effects, audio, combatHooks);
const bots = createBotSystem(state, world, scene, combat);
const rounds = createRounds(state, world, audio, bots);
combatHooks.onKill = rounds.onKill;

const player = createCharacter('Kamu', 'DEF', true);
state.characters.push(player);
state.playerId = player.id;
bots.spawn(BOT_NAMES.DEF, 'DEF');
bots.spawn(BOT_NAMES.ATK, 'ATK');

const controller = createPlayerController(player, world.colliders);
const playerWeapons = createPlayerWeapons(camera);
const minimap = createMinimap(document.getElementById('minimap'), world);
const hud = createHud(state, minimap, onPlayPressed);
const input = createInput(renderer.domElement, onLockChange);

const aimDirection = new THREE.Vector3();
const eyePosition = new THREE.Vector3();
let started = false;
let prevFiring = false;
let prevSlot = 'secondary';
let emptyClickedAt = -99;
let accumulator = 0;
let lastTime = performance.now();

function onPlayPressed() {
  audio.resume();
  if (shotMode) return;
  if (state.phase === 'matchEnd' || state.phase === 'menu') {
    rounds.startMatch();
    started = true;
  }
  input.requestLock();
}

function onLockChange(locked) {
  if (shotMode || autotest) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === 'matchEnd') {
    hud.showOverlay('matchEnd', { winner: state.matchWinner });
  } else if (started && state.phase !== 'menu') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  let view = player;
  if (!player.alive) {
    view = state.characters.find((c) => c.team === 'DEF' && c.alive && !c.isPlayer) ?? player;
    state.spectateId = view.id;
  }
  const shake = state.shake;
  const sx = shake > 0 ? (Math.random() * 2 - 1) * shake * 0.02 : 0;
  const sy = shake > 0 ? (Math.random() * 2 - 1) * shake * 0.02 : 0;
  camera.position.set(view.position.x + sx, view.position.y + view.eye + sy, view.position.z);
  camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const eyeY = player.position.y + player.eye;
  const dx = point.x - player.position.x;
  const dy = point.y - eyeY;
  const dz = point.z - player.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function firePlayer(spreadOverride) {
  if (!player.alive) return null;
  if (player.activeSlot === 'grenade') return null;
  const weapon = activeWeapon(player);
  const def = WEAPONS[weapon.id];
  if (weapon.mag <= 0 && weapon.reloadLeft <= 0) {
    if (state.time - emptyClickedAt > 0.3) {
      emptyClickedAt = state.time;
      audio.empty();
    }
    return null;
  }
  camera.getWorldPosition(eyePosition);
  camera.getWorldDirection(aimDirection);
  const spread = spreadOverride ?? spreadFor(def, controller.groundSpeed(), player.crouching, controller.isSlow(input.state.keys), weapon.bloom);
  const result = combat.fireHitscan(player, eyePosition, aimDirection, spread);
  if (!result) return null;
  controller.recoil(def.kick * (0.8 + Math.random() * 0.4), (Math.random() * 2 - 1) * def.kick * 0.5);
  playerWeapons.onFire();
  return result;
}

function throwPlayerGrenade() {
  if (!player.alive || player.grenades <= 0) return;
  camera.getWorldPosition(eyePosition);
  camera.getWorldDirection(aimDirection);
  eyePosition.addScaledVector(aimDirection, 0.5);
  if (combat.throwGrenade(player, eyePosition, aimDirection)) {
    player.activeSlot = player.primary ? 'primary' : 'secondary';
    playerWeapons.onSwitch();
  }
}

function switchSlot(slot) {
  if (!player.alive) return;
  if (slot === 'primary' && !player.primary) return;
  if (slot === 'grenade' && player.grenades <= 0) return;
  if (player.activeSlot === slot) return;
  prevSlot = player.activeSlot === 'grenade' ? prevSlot : player.activeSlot;
  player.activeSlot = slot;
  playerWeapons.onSwitch();
}

function handleFrameInput() {
  if (!player.alive || state.phase === 'menu' || state.phase === 'matchEnd') {
    input.clearPressed();
    state.defuseHeld = false;
    prevFiring = input.state.firing;
    return;
  }
  const firing = input.state.firing;
  const freshPress = firing && !prevFiring;
  prevFiring = firing;
  if (state.buyOpen) {
    for (const key of ['1', '2', '3', '4', '5', '6']) {
      if (input.consumePressed(`Digit${key}`)) rounds.buy(key);
    }
    if (input.consumePressed('KeyB')) state.buyOpen = false;
  } else {
    if (input.consumePressed('Digit1')) switchSlot('primary');
    if (input.consumePressed('Digit2')) switchSlot('secondary');
    if (input.consumePressed('Digit3')) switchSlot('grenade');
    if (input.consumePressed('KeyB') && state.phase === 'buy') state.buyOpen = true;
  }
  if (input.consumePressed('KeyQ')) {
    switchSlot(player.activeSlot === 'primary' ? 'secondary' : 'primary');
  }
  const wheel = input.takeWheel();
  if (wheel !== 0) {
    const order = ['primary', 'secondary', 'grenade'];
    const current = order.indexOf(player.activeSlot);
    let next = (current + Math.sign(wheel) + order.length) % order.length;
    for (let tries = 0; tries < order.length; tries += 1) {
      const slot = order[next];
      if ((slot !== 'primary' || player.primary) && (slot !== 'grenade' || player.grenades > 0)) {
        switchSlot(slot);
        break;
      }
      next = (next + Math.sign(wheel) + order.length) % order.length;
    }
  }
  if (input.consumePressed('KeyR')) combat.startReload(player);
  if (input.consumePressed('KeyG')) {
    if (player.activeSlot === 'grenade') throwPlayerGrenade();
    else if (player.grenades > 0) {
      prevSlot = player.activeSlot;
      switchSlot('grenade');
      throwPlayerGrenade();
    }
  }
  if (firing && player.activeSlot === 'grenade' && freshPress) throwPlayerGrenade();
  if (firing && player.activeSlot !== 'grenade') {
    const def = WEAPONS[activeWeapon(player).id];
    if (def.auto || freshPress) firePlayer();
  }
  state.defuseHeld = input.state.keys.has('KeyE');
}

function stepSim(dt) {
  state.time += dt;
  state.tick += 1;
  // Matriks world diperbarui di simulasi, bukan hanya saat render: raycast
  // (tembakan, garis pandang bot) harus benar bahkan sebelum frame pertama.
  scene.updateMatrixWorld(true);
  rounds.step(dt, state.time);
  if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'roundEnd') {
    if (player.alive) controller.step(dt, input.state.keys);
    bots.step(dt, state.time);
  }
  combat.stepWeapons(dt);
  combat.stepGrenades(dt);
}

function routeEvents(now) {
  for (const event of drainEvents(state)) {
    hud.handleEvent(event, now);
    if (event.type === 'matchEnd') {
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showOverlay('matchEnd', { winner: event.winner });
    } else if (event.type === 'detonate') {
      effects.spawnExplosion(event.position);
      const player = playerOf(state);
      if (player) {
        const distance = event.position.distanceTo(player.position);
        audio.explosion(distance);
        if (distance < 16) state.shake = Math.max(state.shake, 0.9 * (1 - distance / 16));
      }
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  // Simulasi hanya jalan saat pointer terkunci: di balik overlay judul/jeda,
  // permainan membeku supaya pemain tidak diburu bot sebelum siap.
  const running = input.state.locked;
  const look = input.takeLook();
  if (player.alive && running) controller.look(look.x, look.y);
  if (running) handleFrameInput();
  else input.clearPressed();
  if (running) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      stepSim(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    playerWeapons.step(dt, player);
    effects.step(dt);
  }
  state.shake = Math.max(0, state.shake - dt * 2.2);
  syncCamera();
  routeEvents(state.time);
  hud.render(state.time);
  const weapon = activeWeapon(player);
  const def = WEAPONS[weapon.id];
  const focal = (window.innerHeight / 2) / Math.tan((camera.fov * Math.PI) / 360);
  hud.setCrosshair(spreadFor(def, controller.groundSpeed(), player.crouching, controller.isSlow(input.state.keys), weapon.bloom) * focal + 3);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Kait debug baca-saja untuk smoke test otomatis.
window.__senja = { state, version: '1.0.0' };

syncCamera();
rounds.startMatch();
if (shotMode) {
  stageShot(shotMode, {
    state, world, scene, camera, renderer, player, controller, combat, rounds, bots,
    hud, weapons: playerWeapons, effects, syncCamera, stepSim, firePlayer, aimAt,
  });
} else if (autotest) {
  runAutotest({
    state, world, player, combat, rounds, bots, hud, stepSim, syncCamera, renderer, scene, camera,
  });
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
