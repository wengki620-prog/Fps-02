// Staging deterministik untuk screenshot dan smoke test simulasi.
// ?shot=action|start|buy|end&seed=N memakai sistem game yang sama persis
// (ronde, bot, HUD nyata) — hanya kamera dan waktunya yang diatur, lalu frame
// dibekukan dan window.__shotReady dinyalakan untuk alat tangkap layar.
// ?autotest=1 menjalankan pertandingan penuh tanpa input dan melaporkan hasilnya
// di window.__autotest.
import * as THREE from 'three';
import { hasLineOfSight } from './collision.js';
import { drainEvents } from './state.js';

const FIXED_STEP = 1 / 60;
const tmpFrom = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function paintTwiceThenReady(game) {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    game.syncCamera();
    game.hud.render(game.state.time);
    game.renderer.render(game.scene, game.camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function settle(game, steps) {
  for (let i = 0; i < steps; i += 1) game.stepSim(FIXED_STEP);
}

// Musuh terlihat terdekat (dengan garis pandang bersih); null bila tidak ada.
function visibleEnemy(game, raycaster) {
  const { state, player, world } = game;
  tmpFrom.set(player.position.x, player.position.y + player.eye, player.position.z);
  let best = null;
  let bestDist = Infinity;
  for (const enemy of state.characters) {
    if (enemy.team === player.team || !enemy.alive) continue;
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 25 || dist >= bestDist) continue;
    const facing = -Math.sin(player.yaw) * dx + -Math.cos(player.yaw) * dz;
    if (facing < 0) continue;
    tmpTo.set(enemy.position.x, enemy.position.y + 1.3, enemy.position.z);
    if (!hasLineOfSight(tmpFrom, tmpTo, world.shootables, raycaster, tmpDir)) continue;
    best = enemy;
    bestDist = dist;
  }
  return best;
}

export function stageShot(mode, game) {
  const { state, player, combat, rounds } = game;
  game.hud.hideOverlay();
  player.yaw = 0;
  player.pitch = 0;

  if (mode === 'start') {
    settle(game, 30);
    game.aimAt(new THREE.Vector3(0, 1.6, -6));
    game.hud.showOverlay('start');
  } else if (mode === 'buy') {
    // Tunggu sampai banner ronde memudar supaya tidak menembus panel beli.
    settle(game, 200);
    game.aimAt(new THREE.Vector3(2, 1.4, -4));
    state.buyOpen = true;
    player.money = 3200;
    rounds.buy('1');
    state.buyOpen = true;
  } else if (mode === 'end') {
    state.phase = 'live';
    state.phaseTime = 60;
    state.buyOpen = false;
    state.scores.DEF = 4;
    state.scores.ATK = 2;
    settle(game, 30);
    for (const enemy of [...state.characters]) {
      if (enemy.team === 'ATK' && enemy.alive) {
        combat.damage(enemy, 1000, 'torso', player, enemy.position);
      }
    }
    settle(game, 20);
    player.position.set(-2, 0, 8);
    game.aimAt(new THREE.Vector3(-14, 1.6, -8));
  } else {
    // action: beli senapan di fase beli, lalu paksa live, majukan bot,
    // dan bidik musuh yang terlihat untuk ditembak.
    player.money = 3200;
    rounds.buy('1');
    state.phase = 'live';
    state.phaseTime = 88;
    state.buyOpen = false;
    player.position.set(1.5, 0, 7);
    player.yaw = 0;
    player.pitch = 0;
    const raycaster = new THREE.Raycaster();
    let enemy = null;
    for (let attempt = 0; attempt < 90 && !enemy; attempt += 1) {
      settle(game, 10);
      const seen = visibleEnemy(game, raycaster);
      if (seen && Math.hypot(seen.position.x - player.position.x, seen.position.z - player.position.z) < 16) {
        enemy = seen;
      }
    }
    if (!enemy) {
      // Cadangan staging: pindahkan penyerbu terdekat ke jalur bersih di tengah,
      // menghadap pemain, supaya frame aksi selalu menampilkan musuh yang nyata.
      const foes = state.characters.filter((c) => c.team === 'ATK' && c.alive);
      enemy = foes[0] ?? null;
      if (enemy) {
        enemy.position.set(2.5, 0, -1);
        enemy.yaw = Math.PI;
        settle(game, 2);
      }
    }
    if (enemy) {
      const debug = [];
      const aimPoint = new THREE.Vector3(enemy.position.x, enemy.position.y + 1.3, enemy.position.z);
      game.aimAt(aimPoint);
      const first = game.firePlayer(0);
      debug.push({ target: enemy.name, at: [enemy.position.x, enemy.position.y, enemy.position.z], result: first ? { hit: first.hit, killed: first.killed, point: first.point ? [first.point.x, first.point.y, first.point.z] : null, victim: first.victim?.name ?? null } : null });
      settle(game, 8);
      // Tembakan kedua hanya bila masih ada musuh terlihat; kalau tidak, frame
      // tetap memakai kilat + tracer tembakan pertama (tidak ada stepping lagi).
      const again = visibleEnemy(game, raycaster);
      if (again) {
        const aimPoint2 = new THREE.Vector3(again.position.x, again.position.y + 1.3, again.position.z);
        game.aimAt(aimPoint2);
        const second = game.firePlayer(0);
        debug.push({ target: again.name, at: [again.position.x, again.position.y, again.position.z], result: second ? { hit: second.hit, killed: second.killed, point: second.point ? [second.point.x, second.point.y, second.point.z] : null, victim: second.victim?.name ?? null } : null });
      }
      window.__shotDebug = { player: [player.position.x, player.position.y, player.position.z], yaw: player.yaw, pitch: player.pitch, shots: debug };
      settle(game, 1);
    }
  }
  // Tampilkan viewmodel + kilat moncong (loop frame tidak jalan di mode shot).
  game.weapons.step(0.016, player);
  // Teruskan kejadian sesaat (hitmarker) ke HUD; loop frame tidak jalan di sini.
  let hitHappened = false;
  let killHappened = false;
  for (const event of drainEvents(state)) {
    game.hud.handleEvent(event, state.time);
    if (event.type === 'hit') {
      hitHappened = true;
      killHappened = killHappened || event.kill;
    }
  }
  if (hitHappened) {
    // Hitmarker dipertahankan untuk frame beku: tembakan sungguhan baru saja kena.
    const marker = document.getElementById('hitmarker');
    marker.classList.add('on');
    marker.classList.toggle('kill', killHappened);
  }
  if (mode === 'action') state.banner = null;
  game.hud.render(state.time);
  paintTwiceThenReady(game);
}

export function runAutotest(game) {
  const { state, combat, rounds } = game;
  const report = { done: false, steps: 0, errors: [], rounds: [], scores: null, checks: {}, timeline: [] };
  window.__autotest = report;
  const BATCH = 1200;
  const MAX_STEPS = 70000;

  function check(name, ok) {
    report.checks[name] = Boolean(ok);
    if (!ok) report.errors.push(`check failed: ${name}`);
  }

  // Uji beli: pemain diberi uang, membeli senapan dan granat.
  try {
    game.player.money = 5000;
    check('buy_rifle', rounds.buy('1') === true && game.player.primary?.id === 'rifle');
    check('buy_grenade', rounds.buy('5') === true && game.player.grenades === 1);
    check('buy_rejected_when_poor', rounds.buy('1') === false);
  } catch (error) {
    report.errors.push(`buy threw: ${error.message}`);
  }

  function batch() {
    try {
      for (let i = 0; i < BATCH && report.steps < MAX_STEPS; i += 1) {
        // Uji granat sekali saat ronde live pertama.
        if (report.steps === 900 && game.player.grenades > 0 && game.player.alive) {
          const origin = new THREE.Vector3(game.player.position.x, game.player.position.y + 1.5, game.player.position.z);
          const dir = new THREE.Vector3(0, 0.2, -1).normalize();
          combat.throwGrenade(game.player, origin, dir);
          report.checks.grenade_thrown = true;
        }
        game.stepSim(FIXED_STEP);
        report.steps += 1;
        if (report.steps % 600 === 0) {
          report.timeline.push({
            t: Math.round(report.steps / 60),
            phase: state.phase,
            device: state.device.state,
            site: state.device.site,
            chars: state.characters.map((c) => ({
              n: c.name, hp: Math.round(c.hp), x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1),
              mode: c.bot?.mode ?? 'player', route: c.bot ? `${c.bot.routeIndex}/${c.bot.route.length}` : '',
            })),
          });
        }
        if (state.phase === 'matchEnd') break;
      }
    } catch (error) {
      report.errors.push(`step ${report.steps} threw: ${error.message}`);
      report.done = true;
      return;
    }
    game.syncCamera();
    game.renderer.render(game.scene, game.camera);
    if (state.phase === 'matchEnd' || report.steps >= MAX_STEPS) {
      report.rounds = state.roundLog.map((row) => `${row.round}:${row.winner}:${row.reason}`);
      report.scores = { ...state.scores };
      check('match_finished', state.phase === 'matchEnd');
      check('rounds_played', state.roundLog.length >= 5);
      check('someone_scored', state.scores.DEF + state.scores.ATK >= 5);
      report.done = true;
      return;
    }
    setTimeout(batch, 0);
  }
  setTimeout(batch, 0);
}
