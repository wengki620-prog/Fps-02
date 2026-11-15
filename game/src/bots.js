// Bot: tubuh kotak dengan hitbox kepala/badan/kaki, navigasi graf waypoint,
// persepsi penglihatan + pendengaran, tempur burst, dan perilaku objective.
// Bot berpikir 8x per detik (ter staggered); gerakan dan tembakan jalan tiap step.
import * as THREE from 'three';
import { BOT_TUNING as T, TEAMS } from './config.js';
import { hasLineOfSight, moveCharacter } from './collision.js';
import { findRoute, nearestWaypoint, WAYPOINTS } from './world.js';
import { activeWeapon, createCharacter } from './state.js';
import { buildBotGun } from './weapons.js';

const tmpFrom = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpAim = new THREE.Vector3();

function buildBotMesh(scene, character) {
  const team = TEAMS[character.team];
  const vest = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.7, metalness: 0.05 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2e333d, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a17e, roughness: 0.8 });
  const helmet = new THREE.MeshStandardMaterial({ color: character.team === 'DEF' ? 0x24443f : 0x4a2c20, roughness: 0.6, metalness: 0.2 });

  const group = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.17, 0.55, 0.17);
  const legL = new THREE.Mesh(legGeo, cloth);
  legL.position.set(-0.12, 0.28, 0);
  const legR = new THREE.Mesh(legGeo, cloth);
  legR.position.set(0.12, 0.28, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), vest);
  torso.position.y = 0.94;
  torso.userData.part = 'torso';
  const armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.13);
  const armL = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.33, 0.92, 0);
  const armR = new THREE.Mesh(armGeo, cloth);
  armR.position.set(0.33, 0.92, -0.1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
  head.position.y = 1.48;
  head.userData.part = 'head';
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet);
  helm.position.y = 1.5;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), helmet);
  pack.position.set(0, 0.95, 0.23);
  pack.visible = false;
  const gun = buildBotGun();
  gun.position.set(0.28, 1.2, -0.15);
  group.add(legL, legR, torso, armL, armR, head, helm, pack, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  for (const mesh of [legL, legR]) mesh.userData.part = 'leg';
  for (const mesh of [torso, head, legL, legR]) {
    mesh.userData.character = character;
  }
  scene.add(group);
  character.mesh = group;
  character.hitMeshes = [torso, head, legL, legR];
  character.botVisual = { legL, legR, armL, armR, pack, walkPhase: 0 };
}

export function createBotSystem(state, world, scene, combat) {
  const raycaster = new THREE.Raycaster();
  const probe = new THREE.Box3();
  const routeScratch = [];

  function spawn(names, team) {
    const made = [];
    for (const name of names) {
      const character = createCharacter(name, team, false);
      buildBotMesh(scene, character);
      character.bot = {
        role: 'escort',
        targetSite: 'A',
        holdNode: 0,
        holdYaw: 0,
        mode: 'advance',
        route: [],
        routeIndex: 0,
        objective: new THREE.Vector3(),
        targetId: 0,
        lastKnown: new THREE.Vector3(),
        lastSeenAt: -99,
        reactAt: 0,
        burstLeft: 0,
        burstPauseUntil: 0,
        thinkAt: state.rng() * 0.12,
        stuckSince: 0,
        lastPos: new THREE.Vector3(),
        sidestepUntil: 0,
        sidestepDir: 1,
        desiredYaw: 0,
        desiredPitch: 0,
        scanPhase: state.rng() * Math.PI * 2,
      };
      state.characters.push(character);
      made.push(character);
    }
    return made;
  }

  function eyeOf(character, out) {
    return out.set(character.position.x, character.position.y + T.eye, character.position.z);
  }

  function canSee(bot, enemy) {
    tmpFrom.copy(eyeOf(bot, tmpFrom));
    tmpTo.set(enemy.position.x, enemy.position.y + 1.3, enemy.position.z);
    tmpDir.subVectors(tmpTo, tmpFrom);
    const distance = tmpDir.length();
    if (distance > T.viewRange) return false;
    if (distance > 3) {
      tmpDir.multiplyScalar(1 / distance);
      const facing = Math.sin(bot.yaw) * -tmpDir.x + Math.cos(bot.yaw) * -tmpDir.z;
      if (facing < Math.cos(T.viewHalfAngle)) return false;
    }
    return hasLineOfSight(tmpFrom, tmpTo, world.shootables, raycaster, tmpAim);
  }

  function perceive(bot, now) {
    const b = bot.bot;
    let best = null;
    let bestDist = Infinity;
    for (const enemy of state.characters) {
      if (enemy.team === bot.team || !enemy.alive) continue;
      const dist = enemy.position.distanceToSquared(bot.position);
      if (dist < bestDist && canSee(bot, enemy)) {
        best = enemy;
        bestDist = dist;
      }
    }
    if (best) {
      if (b.targetId !== best.id) {
        b.targetId = best.id;
        b.reactAt = now + T.reactionMin + state.rng() * (T.reactionMax - T.reactionMin);
      }
      b.lastKnown.copy(best.position);
      b.lastSeenAt = now;
      state.enemySeen[best.id] = now;
      return;
    }
    if (b.targetId && now - b.lastSeenAt > 2.5) b.targetId = 0;
    // Pendengaran: tembakan musuh yang dekat dan masih segar mengundang bot
    // menyelidiki titik suara itu (mode investigate di decide()).
    if (!b.targetId) {
      for (const shot of state.recentShots) {
        if (shot.team === bot.team || now - shot.time > 0.6) continue;
        if (shot.position.distanceToSquared(bot.position) > T.hearRange * T.hearRange) continue;
        b.lastKnown.copy(shot.position);
        b.lastSeenAt = now;
        b.heardUntil = now + 2.5;
        break;
      }
    }
  }

  function planRoute(bot, targetNode) {
    const b = bot.bot;
    const from = nearestWaypoint(bot.position.x, bot.position.z);
    findRoute(world.neighbors, from, targetNode, routeScratch);
    b.route = routeScratch.slice();
    b.routeIndex = 0;
  }

  function decide(bot, now) {
    const b = bot.bot;
    const device = state.device;
    const hasTarget = b.targetId !== 0 && now - b.lastSeenAt < 2.5;
    // Misi didahulukan: penjaga yang harus menjinakkan dan pembawa perangkat
    // hanya melayani musuh dekat (<14 m); sisanya ia terus maju ke objective.
    const pushing = (bot.team === 'DEF' && device.state === 'planted')
      || (bot.team === 'ATK' && device.state === 'carried' && device.carrierId === bot.id);
    const nearTarget = b.lastKnown.distanceToSquared(bot.position) < 14 * 14;
    if (hasTarget && now >= b.reactAt && (!pushing || nearTarget)) {
      b.mode = 'engage';
      return;
    }
    if (bot.team === 'ATK') {
      if (device.state === 'planted') {
        b.mode = 'guard';
        b.objective.set(WAYPOINTS[b.guardNode ?? 0][0], 0, WAYPOINTS[b.guardNode ?? 0][1]);
        if (b.routeTarget !== 'guard' || b.route.length === 0) {
          b.routeTarget = 'guard';
          planRoute(bot, b.guardNode ?? 0);
        }
        return;
      }
      if (device.state === 'carried' && device.carrierId === bot.id) {
        const site = world.sites[b.targetSite];
        const inSite = bot.position.distanceToSquared(site.center) < site.radius * site.radius;
        if (inSite) {
          b.mode = 'plant';
          return;
        }
        b.mode = 'advance';
        b.objective.copy(site.center);
        if (b.route.length === 0 || b.routeTarget !== site.node) {
          b.routeTarget = site.node;
          planRoute(bot, site.node);
        }
        return;
      }
      if (device.state === 'dropped') {
        b.mode = 'advance';
        b.objective.copy(device.position);
        if (b.routeTarget !== 'drop' || b.route.length === 0) {
          b.routeTarget = 'drop';
          planRoute(bot, nearestWaypoint(device.position.x, device.position.z));
        }
        return;
      }
      // Escort: ikut ke situs lewat jalur yang berbeda dari carrier; sesampainya
      // di situs, bertahan di sana sambil memindai, bukan berputar di titik.
      const site = world.sites[b.targetSite];
      b.objective.copy(site.center);
      const nearSite = bot.position.distanceToSquared(site.center) < site.radius * site.radius;
      if (nearSite && b.routeIndex >= b.route.length) {
        b.mode = 'hold';
        b.holdNode = nearestWaypoint(bot.position.x, bot.position.z);
        b.holdYaw = Math.atan2(-(site.center.x - bot.position.x), -(site.center.z - bot.position.z));
        return;
      }
      b.mode = 'advance';
      if (b.route.length === 0 || b.routeTarget !== site.node) {
        b.routeTarget = site.node;
        planRoute(bot, site.node);
      }
      return;
    }
    // DEF
    if (device.state === 'planted') {
      const near = bot.position.distanceToSquared(device.position) < DEVICE_RADIUS_SQ;
      if (near) {
        b.mode = 'defuse';
        return;
      }
      b.mode = 'advance';
      b.objective.copy(device.position);
      if (b.routeTarget !== 'device' || b.route.length === 0) {
        b.routeTarget = 'device';
        planRoute(bot, nearestWaypoint(device.position.x, device.position.z));
      }
      return;
    }
    if (hasTarget) {
      b.mode = 'engage';
      return;
    }
    // Suara tembakan yang baru didengar: selidiki titiknya, lalu kembali ke pos.
    if (now < (b.heardUntil ?? 0)) {
      if (b.mode !== 'investigate') {
        b.mode = 'investigate';
        b.objective.copy(b.lastKnown);
        b.routeTarget = 'heard';
        planRoute(bot, nearestWaypoint(b.lastKnown.x, b.lastKnown.z));
      }
      return;
    }
    if (b.mode === 'investigate') {
      b.mode = 'advance';
      b.routeTarget = null;
      planRoute(bot, b.holdNode);
      b.objective.set(WAYPOINTS[b.holdNode][0], 0, WAYPOINTS[b.holdNode][1]);
      return;
    }
    if (b.mode === 'engage') b.mode = 'advance';
    // advance/hold dibiarkan: act() mengubah advance menjadi hold saat tiba di pos.
  }

  const DEVICE_RADIUS_SQ = 2.2 * 2.2;

  function turnToward(bot, targetYaw, dt, rate = 5.5) {
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    bot.yaw += step;
  }

  function moveToward(bot, target, dt, speed) {
    tmpDir.set(target.x - bot.position.x, 0, target.z - bot.position.z);
    const dist = tmpDir.length();
    if (dist < 0.05) {
      bot.velocity.x = 0;
      bot.velocity.z = 0;
      return true;
    }
    tmpDir.multiplyScalar(1 / dist);
    bot.velocity.x = tmpDir.x * speed;
    bot.velocity.z = tmpDir.z * speed;
    bot.onGround = moveCharacter(bot.position, bot.velocity, dt, T.height, T.radius, world.colliders, probe, 20);
    return dist < 0.9;
  }

  function act(bot, dt, now) {
    const b = bot.bot;
    const weapon = activeWeapon(bot);
    if (b.mode === 'engage' && b.targetId) {
      const enemy = state.characters.find((c) => c.id === b.targetId);
      if (!enemy || !enemy.alive) {
        b.targetId = 0;
        return;
      }
      tmpTo.set(enemy.position.x, enemy.position.y + 1.3, enemy.position.z);
      eyeOf(bot, tmpFrom);
      tmpDir.subVectors(tmpTo, tmpFrom);
      const dist = tmpDir.length();
      b.desiredYaw = Math.atan2(-tmpDir.x, -tmpDir.z);
      b.desiredPitch = Math.asin(Math.max(-1, Math.min(1, tmpDir.y / Math.max(dist, 0.001))));
      turnToward(bot, b.desiredYaw, dt);
      bot.pitch += (b.desiredPitch - bot.pitch) * Math.min(1, dt * 8);
      // Strafe tegak lurus sambil menembak, supaya tidak jadi target diam.
      const strafe = Math.sin(now * 1.4 + b.scanPhase) > 0 ? 1 : -1;
      const sideX = Math.cos(bot.yaw) * strafe;
      const sideZ = -Math.sin(bot.yaw) * strafe;
      bot.velocity.x = sideX * 1.4;
      bot.velocity.z = sideZ * 1.4;
      bot.onGround = moveCharacter(bot.position, bot.velocity, dt, T.height, T.radius, world.colliders, probe, 20);
      if (now < b.reactAt || now < b.burstPauseUntil) return;
      if (weapon.reloadLeft > 0 || weapon.cooldown > 0) return;
      if (weapon.mag === 0) {
        combat.startReload(bot);
        return;
      }
      if (b.burstLeft <= 0) b.burstLeft = T.burstMin + Math.floor(state.rng() * (T.burstMax - T.burstMin + 1));
      const error = T.aimError * (1 + Math.min(1, dist / 25));
      tmpAim.copy(tmpDir).normalize();
      tmpAim.x += (state.rng() * 2 - 1) * error;
      tmpAim.y += (state.rng() * 2 - 1) * error;
      tmpAim.z += (state.rng() * 2 - 1) * error;
      tmpAim.normalize();
      combat.fireHitscan(bot, tmpFrom, tmpAim, 0);
      b.burstLeft -= 1;
      if (b.burstLeft <= 0) b.burstPauseUntil = now + T.burstPause;
      return;
    }
    if (b.mode === 'plant' || b.mode === 'defuse') {
      bot.velocity.x = 0;
      bot.velocity.z = 0;
      bot.onGround = moveCharacter(bot.position, bot.velocity, dt, T.height, T.radius, world.colliders, probe, 20);
      if (b.mode === 'plant') {
        const site = world.sites[b.targetSite];
        turnToward(bot, Math.atan2(-(site.center.x - bot.position.x), -(site.center.z - bot.position.z)) + Math.PI, dt, 3);
      }
      return;
    }
    if (b.mode === 'hold') {
      const node = WAYPOINTS[b.holdNode];
      const arrived = moveToward(bot, tmpTo.set(node[0], 0, node[1]), dt, T.speed);
      if (arrived) {
        bot.velocity.x = 0;
        bot.velocity.z = 0;
        const scan = b.holdYaw + Math.sin(now * 0.5 + b.scanPhase) * 0.7;
        turnToward(bot, scan, dt, 2.5);
      } else {
        turnToward(bot, Math.atan2(-(node[0] - bot.position.x), -(node[1] - bot.position.z)), dt);
      }
      return;
    }
    // advance / guard: ikuti rute waypoint, lalu lurus ke objective.
    let target = b.objective;
    if (b.routeIndex < b.route.length) {
      const node = WAYPOINTS[b.route[b.routeIndex]];
      target = tmpTo.set(node[0], 0, node[1]);
      if (Math.hypot(node[0] - bot.position.x, node[1] - bot.position.z) < 1.1) {
        b.routeIndex += 1;
        return;
      }
    }
    // Deteksi macet: geser menyamping sebentar, lalu coba lagi. Ambangnya 2 cm
    // per langkah — jauh di bawah langkah lari normal (7,7 cm) supaya bot yang
    // sedang bergerak tidak salah dikira macet.
    if (now > b.sidestepUntil && bot.position.distanceToSquared(b.lastPos) < 0.0004 && now - b.stuckSince > 0.8) {
      b.sidestepUntil = now + 0.6;
      b.sidestepDir = -b.sidestepDir;
      b.stuckSince = now;
    }
    if (now < b.sidestepUntil) {
      const sideX = Math.cos(bot.yaw) * b.sidestepDir;
      const sideZ = -Math.sin(bot.yaw) * b.sidestepDir;
      bot.velocity.x = sideX * T.speed;
      bot.velocity.z = sideZ * T.speed;
      bot.onGround = moveCharacter(bot.position, bot.velocity, dt, T.height, T.radius, world.colliders, probe, 20);
      b.lastPos.copy(bot.position);
      return;
    }
    if (bot.position.distanceToSquared(b.lastPos) > 0.0004) b.stuckSince = now;
    b.lastPos.copy(bot.position);
    const arrived = moveToward(bot, target, dt, b.mode === 'guard' ? T.speed : T.sprintSpeed);
    turnToward(bot, Math.atan2(-(target.x - bot.position.x), -(target.z - bot.position.z)), dt);
    if (arrived && b.mode === 'guard') {
      b.mode = 'hold';
      b.holdNode = nearestWaypoint(bot.position.x, bot.position.z);
      b.holdYaw = bot.yaw;
    }
    if (arrived && bot.team === 'DEF' && b.role === 'holder' && b.mode === 'advance') {
      b.mode = 'hold';
    }
  }

  function syncVisual(bot, dt) {
    const visual = bot.botVisual;
    const mesh = bot.mesh;
    mesh.position.copy(bot.position);
    if (!bot.alive) {
      bot.fallAmount = Math.min(1, bot.fallAmount + dt / 0.4);
      mesh.rotation.x = -bot.fallAmount * 1.45;
      mesh.position.y = bot.position.y - bot.fallAmount * 0.08;
      return;
    }
    mesh.rotation.set(0, bot.yaw, 0);
    const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
    visual.walkPhase += dt * (2 + speed * 1.6);
    const swing = Math.min(1, speed / T.speed) * 0.55;
    visual.legL.rotation.x = Math.sin(visual.walkPhase) * swing;
    visual.legR.rotation.x = -Math.sin(visual.walkPhase) * swing;
    visual.armL.rotation.x = -Math.sin(visual.walkPhase) * swing * 0.6;
    visual.pack.visible = state.device.state === 'carried' && state.device.carrierId === bot.id;
  }

  function step(dt, now) {
    for (const character of state.characters) {
      if (character.isPlayer || !character.bot) continue;
      if (!character.alive) {
        syncVisual(character, dt);
        continue;
      }
      if (state.phase === 'live' || state.phase === 'buy') {
        const b = character.bot;
        if (now >= b.thinkAt) {
          b.thinkAt = now + 0.12;
          perceive(character, now);
          if (state.phase === 'live') decide(character, now);
        }
        if (state.phase === 'live') act(character, dt, now);
      }
      syncVisual(character, dt);
    }
  }

  // Peran ronde: carrier + escort untuk ATK, holder untuk DEF.
  function assignRoles(targetSite) {
    const attackers = state.characters.filter((c) => c.team === 'ATK' && !c.isPlayer);
    const defenders = state.characters.filter((c) => c.team === 'DEF' && !c.isPlayer);
    attackers.forEach((bot, i) => {
      const b = bot.bot;
      b.targetSite = targetSite;
      b.role = i === 0 ? 'carrier' : 'escort';
      b.mode = 'advance';
      b.route = [];
      b.routeTarget = null;
      b.targetId = 0;
      b.guardNode = targetSite === 'A' ? 6 : 22;
    });
    const holds = targetSite === 'A'
      ? [{ node: 5, yaw: Math.PI }, { node: 16, yaw: 0.4 }]
      : [{ node: 21, yaw: -0.6 }, { node: 17, yaw: -0.4 }];
    defenders.forEach((bot, i) => {
      const b = bot.bot;
      b.targetSite = targetSite;
      b.role = 'holder';
      b.mode = 'hold';
      b.holdNode = holds[i % holds.length].node;
      b.holdYaw = holds[i % holds.length].yaw;
      b.route = [];
      b.routeTarget = null;
      b.targetId = 0;
      planRoute(bot, b.holdNode);
      b.mode = 'advance';
      b.objective.set(WAYPOINTS[b.holdNode][0], 0, WAYPOINTS[b.holdNode][1]);
    });
  }

  return { spawn, step, assignRoles };
}
