// Satu tempat penyimpanan state simulasi. Semua modul membaca dan menulis state
// yang sama; tidak ada state permainan yang bersembunyi di variabel modul lain.
// State render (mesh, material) menempel di objek karakter, bukan di sini,
// supaya simulasi langkah-tetap bisa jalan tanpa render.
import * as THREE from 'three';
import { ECONOMY, PLAYER_TUNING, WEAPONS } from './config.js';
import { mulberry32 } from './rng.js';

let nextId = 1;

export function createWeaponState(id) {
  const def = WEAPONS[id];
  return { id, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, bloom: 0 };
}

export function createCharacter(name, team, isPlayer) {
  return {
    id: nextId++,
    name,
    team,
    isPlayer,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: PLAYER_TUNING.standEye,
    height: PLAYER_TUNING.standHeight,
    onGround: true,
    crouching: false,
    hp: PLAYER_TUNING.health,
    maxHp: PLAYER_TUNING.health,
    armor: false,
    alive: true,
    money: isPlayer ? ECONOMY.startMoney : 0,
    primary: null,
    secondary: createWeaponState('pistol'),
    activeSlot: 'secondary',
    grenades: 0,
    kills: 0,
    deaths: 0,
    // Diisi modul visual/AI: mesh, hitMeshes, bot.
    mesh: null,
    hitMeshes: [],
    bot: null,
    fallAmount: 0,
    lastHurtAt: -99,
    lastHurtDir: 0,
  };
}

export function activeWeapon(character) {
  return character.activeSlot === 'primary' && character.primary ? character.primary : character.secondary;
}

export function createState(seed) {
  return {
    seed,
    rng: mulberry32(seed),
    time: 0,
    tick: 0,
    phase: 'menu',
    phaseTime: 0,
    roundNumber: 0,
    scores: { DEF: 0, ATK: 0 },
    matchWinner: null,
    characters: [],
    playerId: 0,
    device: {
      state: 'carried',
      carrierId: 0,
      site: null,
      position: new THREE.Vector3(),
      fuse: 0,
      channel: 0,
      channelBy: 0,
      channelKind: null,
    },
    grenades: [],
    recentShots: [],
    enemySeen: {},
    defuseHeld: false,
    events: [],
    killfeed: [],
    banner: null,
    buyOpen: false,
    shake: 0,
    spectateId: 0,
    stats: { shotsFired: 0, shotsHit: 0, plants: 0, defuses: 0 },
    roundLog: [],
  };
}

export function playerOf(state) {
  return state.characters.find((c) => c.id === state.playerId) ?? null;
}

export function aliveOf(state, team) {
  return state.characters.filter((c) => c.team === team && c.alive);
}

export function pushEvent(state, event) {
  state.events.push(event);
}

export function drainEvents(state) {
  const drained = state.events;
  state.events = [];
  return drained;
}
