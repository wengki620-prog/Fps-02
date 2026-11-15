// Semua angka tuning di satu tempat: senjata, ekonomi, ronde, bot, dan perangkat.
// Tidak ada angka ajaib tersebar di modul lain; ubah keseimbangan game dari sini.
export const TEAMS = {
  DEF: { name: 'Penjaga', short: 'PENJAGA', color: 0x3fb8a6, css: '#3fb8a6' },
  ATK: { name: 'Penyerbu', short: 'PENYERBU', color: 0xe0683c, css: '#e0683c' },
};

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 SRITI', slot: 'secondary', price: 0, damage: 26, pellets: 1,
    mag: 12, reserve: 48, gap: 0.16, auto: false, reload: 1.4,
    spreadBase: 0.004, spreadMove: 0.016, bloom: 0.004, kick: 0.007, falloffStart: 18, falloffMin: 0.7, sound: 'pistol',
  },
  rifle: {
    id: 'rifle', name: 'AR-7 CENDANA', slot: 'primary', price: 2700, damage: 32, pellets: 1,
    mag: 30, reserve: 90, gap: 0.1, auto: true, reload: 2.1,
    spreadBase: 0.003, spreadMove: 0.03, bloom: 0.005, kick: 0.011, falloffStart: 24, falloffMin: 0.65, sound: 'rifle',
  },
  smg: {
    id: 'smg', name: 'SMG-9 KANCIL', slot: 'primary', price: 1500, damage: 24, pellets: 1,
    mag: 32, reserve: 96, gap: 0.075, auto: true, reload: 1.8,
    spreadBase: 0.006, spreadMove: 0.034, bloom: 0.004, kick: 0.008, falloffStart: 16, falloffMin: 0.55, sound: 'smg',
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 BELIBIS', slot: 'primary', price: 1100, damage: 9, pellets: 8,
    mag: 6, reserve: 24, gap: 0.8, auto: false, reload: 2.6,
    spreadBase: 0.03, spreadMove: 0.05, bloom: 0.01, kick: 0.035, falloffStart: 10, falloffMin: 0.35, sound: 'shotgun',
  },
};

export const BUY_ITEMS = [
  { key: '1', kind: 'weapon', id: 'rifle', label: 'AR-7 Cendana — senapan serbu' },
  { key: '2', kind: 'weapon', id: 'smg', label: 'SMG-9 Kancil — ringan, cepat' },
  { key: '3', kind: 'weapon', id: 'shotgun', label: 'SG-12 Belibis — jarak dekat' },
  { key: '4', kind: 'armor', id: 'armor', label: 'Rompi — damage berkurang separuh', price: 650 },
  { key: '5', kind: 'grenade', id: 'grenade', label: 'Granat — ledakan area', price: 300 },
  { key: '6', kind: 'ammo', id: 'ammo', label: 'Amunisi penuh — isi semua cadangan', price: 200 },
];

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 1400,
  lossReward: 900,
  plantBonus: 300,
  maxMoney: 9000,
};

export const ROUND = {
  buySeconds: 12,
  roundSeconds: 100,
  endSeconds: 4,
  winsToWin: 5,
  maxRounds: 9,
};

export const DEVICE = {
  plantSeconds: 4,
  fuseSeconds: 35,
  defuseSeconds: 5,
  interactRadius: 2.2,
};

export const GRENADE = {
  fuseSeconds: 1.6,
  radius: 6,
  maxDamage: 120,
  throwSpeed: 15,
  gravity: 18,
  bounce: 0.45,
};

export const PLAYER_TUNING = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walkSpeed: 5.2,
  crouchSpeed: 2.4,
  slowSpeed: 2.6,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jumpSpeed: 6.2,
  health: 100,
};

export const BOT_TUNING = {
  speed: 3.9,
  sprintSpeed: 4.6,
  radius: 0.36,
  height: 1.72,
  eye: 1.55,
  health: 100,
  viewRange: 30,
  viewHalfAngle: 1.05,
  hearRange: 20,
  reactionMin: 0.32,
  reactionMax: 0.6,
  aimError: 0.03,
  burstMin: 3,
  burstMax: 5,
  burstPause: 0.45,
};

export const DAMAGE = {
  headMult: 3,
  torsoMult: 1,
  legMult: 0.75,
  armorMult: 0.5,
};

export const BOT_NAMES = {
  DEF: ['Sari', 'Bimo'],
  ATK: ['Raka', 'Danu', 'Tara'],
};
