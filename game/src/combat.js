// Tempur: tembakan hitscan dengan hitbox, damage berlapis (kepala/badan/kaki,
// jarak, rompi), granat pantul, dan reload. Satu-satunya modul yang mengubah HP.
import * as THREE from 'three';
import { DAMAGE, ECONOMY, GRENADE, WEAPONS } from './config.js';
import { findOverlap, hasLineOfSight } from './collision.js';
import { activeWeapon, playerOf, pushEvent } from './state.js';
import { damageFalloff } from './weapons.js';

const tmpDir = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3(0, 1, 0);
const tmpPoint = new THREE.Vector3();
const tmpChest = new THREE.Vector3();

export function createCombat(state, world, scene, effects, audio, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const probe = new THREE.Box3();

  // Target raycast: dinding + hitbox semua karakter. Dibangun malas pada
  // tembakan pertama, saat semua karakter sudah punya mesh.
  let raycastTargets = null;

  function targets() {
    if (!raycastTargets) {
      raycastTargets = world.shootables.concat(state.characters.flatMap((c) => c.hitMeshes));
    }
    return raycastTargets;
  }
  // Ring buffer tembakan terakhir untuk pendengaran bot: tanpa alokasi.
  const shotRing = [];
  for (let i = 0; i < 16; i += 1) shotRing.push({ position: new THREE.Vector3(), time: -99, team: '' });
  let shotNext = 0;

  // Pool granat: 4 proyektil dengan mesh-nya.
  const grenadePool = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.6, metalness: 0.3 });
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.visible = false;
    scene.add(mesh);
    grenadePool.push({ active: false, mesh, position: new THREE.Vector3(), velocity: new THREE.Vector3(), fuse: 0, owner: null });
  }

  function recordShot(origin, team) {
    const slot = shotRing[shotNext];
    shotNext = (shotNext + 1) % shotRing.length;
    slot.position.copy(origin);
    slot.time = state.time;
    slot.team = team;
    state.recentShots = shotRing;
  }

  function muzzleOf(origin, direction, out) {
    tmpRight.crossVectors(direction, tmpUp).normalize();
    out.copy(origin).addScaledVector(direction, 0.6).addScaledVector(tmpRight, 0.12);
    out.y -= 0.08;
    return out;
  }

  function fireHitscan(shooter, origin, direction, spread) {
    const weapon = activeWeapon(shooter);
    const def = WEAPONS[weapon.id];
    if (weapon.cooldown > 0 || weapon.reloadLeft > 0 || weapon.mag <= 0) return null;
    weapon.mag -= 1;
    weapon.cooldown = def.gap;
    weapon.bloom = Math.min(0.05, weapon.bloom + def.bloom);
    if (shooter.isPlayer) state.stats.shotsFired += 1;
    recordShot(origin, shooter.team);
    muzzleOf(origin, direction, tmpMuzzle);

    const player = playerOf(state);
    const earDistance = shooter.isPlayer || !player ? null : shooter.position.distanceTo(player.position);
    audio.shot(def.sound, earDistance);
    if (!shooter.isPlayer) effects.spawnFlash(tmpMuzzle);

    let result = { hit: false, killed: false, point: null, victim: null };
    const list = targets();
    for (let pellet = 0; pellet < def.pellets; pellet += 1) {
      tmpDir.copy(direction);
      if (spread > 0) {
        tmpDir.x += (state.rng() * 2 - 1) * spread;
        tmpDir.y += (state.rng() * 2 - 1) * spread;
        tmpDir.z += (state.rng() * 2 - 1) * spread;
        tmpDir.normalize();
      }
      raycaster.set(origin, tmpDir);
      const hits = raycaster.intersectObjects(list, false);
      let end = null;
      let hitCharacter = null;
      let hitPart = null;
      for (const hit of hits) {
        const owner = hit.object.userData.character;
        if (owner) {
          if (owner === shooter || !owner.alive) continue;
          hitCharacter = owner;
          hitPart = hit.object.userData.part ?? 'torso';
          end = hit.point;
          break;
        }
        end = hit.point;
        break;
      }
      if (!end) {
        end = tmpPoint.copy(origin).addScaledVector(tmpDir, 60);
        effects.spawnTracer(tmpMuzzle, end);
        continue;
      }
      effects.spawnTracer(tmpMuzzle, end);
      if (hitCharacter) {
        const distance = origin.distanceTo(end);
        const partMult = hitPart === 'head' ? DAMAGE.headMult : hitPart === 'leg' ? DAMAGE.legMult : DAMAGE.torsoMult;
        const amount = def.damage * partMult * damageFalloff(def, distance);
        const killed = damage(hitCharacter, amount, hitPart, shooter, end);
        effects.spawnBurst(end, 0xb03028, 6, 2.5, 2);
        if (shooter.isPlayer) {
          state.stats.shotsHit += 1;
          pushEvent(state, { type: 'hit', kill: killed, head: hitPart === 'head' });
        }
        result.hit = true;
        result.killed = killed;
        result.point = end.clone();
        result.victim = hitCharacter;
      } else {
        effects.spawnBurst(end, 0xd8c9a8, 4, 2, 1.5);
        if (!result.point) result.point = end.clone();
      }
    }
    return result;
  }

  function damage(target, amount, part, attacker, point) {
    if (!target.alive) return false;
    if (target.armor) amount *= DAMAGE.armorMult;
    target.hp -= amount;
    target.lastHurtAt = state.time;
    if (target.isPlayer) {
      pushEvent(state, { type: 'hurt', fromX: attacker.position.x, fromZ: attacker.position.z });
      audio.hurt();
    }
    if (target.hp > 0) return false;
    target.hp = 0;
    target.alive = false;
    target.deaths += 1;
    target.fallAmount = 0;
    if (attacker) {
      attacker.kills += 1;
      if (attacker.isPlayer) {
        attacker.money = Math.min(ECONOMY.maxMoney, attacker.money + ECONOMY.killReward);
      }
    }
    state.killfeed.push({
      killer: attacker ? attacker.name : '—',
      killerTeam: attacker ? attacker.team : 'DEF',
      victim: target.name,
      victimTeam: target.team,
      weapon: attacker ? WEAPONS[activeWeapon(attacker).id].name : '',
      head: part === 'head',
      time: state.time,
    });
    if (state.killfeed.length > 5) state.killfeed.shift();
    pushEvent(state, { type: 'kill', killer: attacker, victim: target });
    // Pembawa perangkat yang gugur menjatuhkan perangkatnya.
    if (state.device.state === 'carried' && state.device.carrierId === target.id) {
      state.device.state = 'dropped';
      state.device.carrierId = 0;
      state.device.position.copy(target.position);
      state.device.channel = 0;
      state.device.channelBy = 0;
    }
    if (hooks.onKill) hooks.onKill(target, attacker);
    return true;
  }

  function startReload(character) {
    const weapon = activeWeapon(character);
    const def = WEAPONS[weapon.id];
    if (weapon.reloadLeft > 0 || weapon.mag === def.mag || weapon.reserve === 0) return;
    weapon.reloadLeft = def.reload;
    if (character.isPlayer) audio.reload();
  }

  function stepWeapons(dt) {
    for (const character of state.characters) {
      if (!character.alive) continue;
      for (const slot of ['primary', 'secondary']) {
        const weapon = character[slot];
        if (!weapon) continue;
        weapon.cooldown = Math.max(0, weapon.cooldown - dt);
        weapon.bloom = Math.max(0, weapon.bloom - dt * 0.055);
        if (weapon.reloadLeft > 0) {
          weapon.reloadLeft = Math.max(0, weapon.reloadLeft - dt);
          if (weapon.reloadLeft === 0) {
            const def = WEAPONS[weapon.id];
            const take = Math.min(def.mag - weapon.mag, weapon.reserve);
            weapon.mag += take;
            weapon.reserve -= take;
          }
        }
      }
    }
  }

  function throwGrenade(character, origin, direction) {
    if (character.grenades <= 0) return false;
    const slot = grenadePool.find((g) => !g.active);
    if (!slot) return false;
    character.grenades -= 1;
    slot.active = true;
    slot.position.copy(origin);
    slot.velocity.copy(direction).multiplyScalar(GRENADE.throwSpeed);
    slot.velocity.y += 2.5;
    slot.fuse = GRENADE.fuseSeconds;
    slot.owner = character;
    slot.mesh.visible = true;
    slot.mesh.position.copy(origin);
    return true;
  }

  function explode(slot) {
    slot.active = false;
    slot.mesh.visible = false;
    const center = slot.position;
    effects.spawnExplosion(center);
    const player = playerOf(state);
    const earDistance = player ? center.distanceTo(player.position) : null;
    audio.explosion(earDistance);
    if (player && earDistance != null && earDistance < 14) {
      state.shake = Math.max(state.shake, 0.7 * (1 - earDistance / 14));
    }
    for (const character of state.characters) {
      if (!character.alive) continue;
      const distance = character.position.distanceTo(center);
      if (distance > GRENADE.radius) continue;
      tmpChest.set(character.position.x, character.position.y + 1.2, character.position.z);
      const clear = hasLineOfSight(tmpPoint.copy(center).setY(center.y + 0.3), tmpChest, world.shootables, raycaster, tmpDir);
      let amount = GRENADE.maxDamage * (1 - distance / GRENADE.radius);
      if (!clear) amount *= 0.25;
      damage(character, amount, 'torso', slot.owner, tmpChest);
    }
  }

  function stepGrenades(dt) {
    for (const slot of grenadePool) {
      if (!slot.active) continue;
      slot.fuse -= dt;
      slot.velocity.y -= GRENADE.gravity * dt;
      const pos = slot.position;
      const nextX = pos.x + slot.velocity.x * dt;
      if (!findOverlap(nextX, pos.y, pos.z, 0.18, 0.09, 0.02, world.colliders, probe)) pos.x = nextX;
      else slot.velocity.x *= -GRENADE.bounce;
      const nextZ = pos.z + slot.velocity.z * dt;
      if (!findOverlap(pos.x, pos.y, nextZ, 0.18, 0.09, 0.02, world.colliders, probe)) pos.z = nextZ;
      else slot.velocity.z *= -GRENADE.bounce;
      pos.y += slot.velocity.y * dt;
      const landed = findOverlap(pos.x, pos.y, pos.z, 0.18, 0.09, 0, world.colliders, probe);
      if (landed && slot.velocity.y <= 0) {
        pos.y = landed.max.y;
        if (Math.abs(slot.velocity.y) > 2) audio.bounce();
        slot.velocity.y *= -GRENADE.bounce;
        slot.velocity.x *= 0.7;
        slot.velocity.z *= 0.7;
      }
      if (pos.y < 0.09) {
        pos.y = 0.09;
        if (Math.abs(slot.velocity.y) > 2) audio.bounce();
        slot.velocity.y *= -GRENADE.bounce;
        slot.velocity.x *= 0.7;
        slot.velocity.z *= 0.7;
      }
      slot.mesh.position.copy(pos);
      slot.mesh.rotation.x += dt * 6;
      if (slot.fuse <= 0) explode(slot);
    }
  }

  function resetGrenades() {
    for (const slot of grenadePool) {
      slot.active = false;
      slot.mesh.visible = false;
    }
  }

  return { fireHitscan, damage, startReload, stepWeapons, throwGrenade, stepGrenades, resetGrenades };
}
