// Mesin ronde: fase beli → live → akhir ronde → pertandingan. Mengatur spawn,
// loadout, ekonomi, perangkat (tanam/jinakkan/ledakan), dan kondisi menang.
// Satu-satunya modul yang mengubah skor dan fase.
import { BUY_ITEMS, DEVICE, ECONOMY, ROUND, WEAPONS } from './config.js';
import { aliveOf, createWeaponState, playerOf, pushEvent } from './state.js';

function botLoadout(roundNumber, rng, index) {
  if (roundNumber <= 1) return null;
  if (roundNumber === 2) return index % 2 === 0 ? 'smg' : 'shotgun';
  const roll = rng();
  if (roll < 0.6) return 'rifle';
  if (roll < 0.8) return 'smg';
  return 'shotgun';
}

export function createRounds(state, world, audio, bots) {
  let beepAt = 0;

  function setBanner(title, sub, kind) {
    state.banner = { title, sub, kind, until: state.time + 3.2 };
  }

  function resetCharacter(character, spawn) {
    character.position.set(spawn.x, 0, spawn.z);
    character.velocity.set(0, 0, 0);
    character.yaw = spawn.yaw;
    character.pitch = 0;
    character.hp = character.maxHp;
    character.alive = true;
    character.fallAmount = 0;
    character.crouching = false;
    character.height = 1.72;
    character.eye = 1.6;
    if (character.mesh) {
      character.mesh.rotation.set(0, spawn.yaw, 0);
      character.mesh.position.copy(character.position);
    }
    if (character.bot) {
      character.bot.targetId = 0;
      character.bot.route = [];
      character.bot.burstLeft = 0;
    }
  }

  function startRound() {
    state.roundNumber += 1;
    state.phase = 'buy';
    state.phaseTime = ROUND.buySeconds;
    state.buyOpen = true;
    state.killfeed.length = 0;
    const survived = state.roundNumber > 1;
    const spawns = { DEF: 0, ATK: 0 };
    for (const character of state.characters) {
      const list = world.spawns[character.team];
      const spawn = list[spawns[character.team] % list.length];
      spawns[character.team] += 1;
      const hadPrimary = character.primary;
      resetCharacter(character, spawn);
      if (character.isPlayer) {
        // Pemain yang selamat mempertahankan senapan dan rompinya; yang gugur
        // mulai lagi dari pistol (rompi hangus bersama kematiannya).
        if (!survived || !hadPrimary) {
          character.primary = null;
          character.activeSlot = 'secondary';
          character.armor = false;
          character.grenades = 0;
        }
        character.secondary = createWeaponState('pistol');
        if (character.primary) character.primary = createWeaponState(character.primary.id);
      } else {
        const pick = botLoadout(state.roundNumber, state.rng, character.id);
        character.primary = pick ? createWeaponState(pick) : null;
        character.secondary = createWeaponState('pistol');
        character.activeSlot = character.primary ? 'primary' : 'secondary';
        character.armor = state.roundNumber >= 3;
        character.grenades = 0;
      }
    }
    // Perangkat di tangan penyerbu pertama; situs target diundi tiap ronde.
    const attackers = state.characters.filter((c) => c.team === 'ATK');
    const carrier = attackers[0];
    state.device.state = 'carried';
    state.device.carrierId = carrier.id;
    state.device.site = state.rng() < 0.5 ? 'A' : 'B';
    state.device.fuse = 0;
    state.device.channel = 0;
    state.device.channelBy = 0;
    state.device.channelKind = null;
    state.device.position.copy(carrier.position);
    bots.assignRoles(state.device.site);
    setBanner(`RONDE ${state.roundNumber}`, 'Jaga kedua situs. Perangkat bisa datang dari mana saja.', 'info');
    pushEvent(state, { type: 'roundStart' });
  }

  function startMatch() {
    state.scores.DEF = 0;
    state.scores.ATK = 0;
    state.roundNumber = 0;
    state.matchWinner = null;
    state.roundLog.length = 0;
    const player = playerOf(state);
    if (player) player.money = ECONOMY.startMoney;
    for (const character of state.characters) {
      character.kills = 0;
      character.deaths = 0;
    }
    startRound();
  }

  function awardMoney(winner) {
    for (const character of state.characters) {
      if (!character.isPlayer) continue;
      const reward = character.team === winner ? ECONOMY.winReward : ECONOMY.lossReward;
      character.money = Math.min(ECONOMY.maxMoney, character.money + reward);
    }
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.scores[winner] += 1;
    state.roundLog.push({ round: state.roundNumber, winner, reason });
    awardMoney(winner);
    const player = playerOf(state);
    const playerWon = player && player.team === winner;
    const titles = {
      elimination: winner === 'DEF' ? 'SEMUA PENYERBU TUMBANG' : 'SEMUA PENJAGA TUMBANG',
      detonation: 'PERANGKAT MELEDAK',
      defuse: 'PERANGKAT DIJINAKKAN',
      time: 'WAKTU HABIS — SITUS AMAN',
    };
    setBanner(titles[reason] ?? 'RONDE SELESAI', winner === 'DEF' ? 'Penjaga memenangkan ronde.' : 'Penyerbu memenangkan ronde.', playerWon ? 'win' : 'lose');
    if (playerWon) audio.win();
    else audio.lose();
    pushEvent(state, { type: 'roundEnd', winner, reason });
    state.phase = 'roundEnd';
    state.phaseTime = ROUND.endSeconds;
    state.buyOpen = false;
    state.device.channel = 0;
    state.device.channelBy = 0;
  }

  function checkElimination() {
    if (state.phase !== 'live') return;
    const defAlive = aliveOf(state, 'DEF').length;
    const atkAlive = aliveOf(state, 'ATK').length;
    if (state.device.state === 'planted') {
      // Tertanam: ronde hanya berakhir oleh ledakan/jinakkan — kecuali semua
      // penjaga gugur, yang membuat ledakan tak terelakkan.
      if (defAlive === 0) {
        pushEvent(state, { type: 'detonate', position: state.device.position.clone() });
        state.device.state = 'gone';
        endRound('ATK', 'detonation');
      }
      return;
    }
    if (atkAlive === 0) endRound('DEF', 'elimination');
    else if (defAlive === 0) endRound('ATK', 'elimination');
  }

  function onKill() {
    checkElimination();
  }

  function stepChannels(dt) {
    const device = state.device;
    // Ambil perangkat yang jatuh: penyerbu yang berjalan di atasnya memungutnya.
    if (device.state === 'dropped') {
      for (const character of state.characters) {
        if (character.team !== 'ATK' || !character.alive) continue;
        if (character.position.distanceToSquared(device.position) < 1.44) {
          device.state = 'carried';
          device.carrierId = character.id;
          pushEvent(state, { type: 'pickup', character });
          break;
        }
      }
    }
    // Tanam: carrier berdiri diam di situs target.
    if (device.state === 'carried') {
      const carrier = state.characters.find((c) => c.id === device.carrierId);
      const site = world.sites[device.site];
      const inSite = carrier && carrier.alive && carrier.position.distanceToSquared(site.center) < site.radius * site.radius;
      const still = carrier && Math.hypot(carrier.velocity.x, carrier.velocity.z) < 0.6;
      if (inSite && still && carrier.bot && carrier.bot.mode === 'plant') {
        if (device.channelBy !== carrier.id || device.channelKind !== 'plant') {
          device.channel = 0;
          device.channelBy = carrier.id;
          device.channelKind = 'plant';
        }
        device.channel += dt;
        if (device.channel >= DEVICE.plantSeconds) {
          device.state = 'planted';
          device.position.copy(carrier.position);
          device.fuse = DEVICE.fuseSeconds;
          device.channel = 0;
          device.channelBy = 0;
          device.channelKind = null;
          state.stats.plants += 1;
          setBanner('PERANGKAT TERTANAM', `Situs ${device.site} — jinakkan sebelum meledak!`, 'lose');
          audio.plant();
          pushEvent(state, { type: 'plant', site: device.site });
        }
      } else if (device.channelKind === 'plant') {
        device.channel = 0;
        device.channelBy = 0;
        device.channelKind = null;
      }
    }
    // Jinakkan: penjaga berdiri diam di dekat perangkat tertanam.
    if (device.state === 'planted') {
      let channeler = null;
      let channeling = false;
      for (const character of state.characters) {
        if (character.team !== 'DEF' || !character.alive) continue;
        const near = character.position.distanceToSquared(device.position) < DEVICE.interactRadius * DEVICE.interactRadius;
        if (!near) continue;
        const still = Math.hypot(character.velocity.x, character.velocity.z) < 0.6;
        if (character.isPlayer) {
          channeling = still && state.defuseHeld === true;
          if (channeling) channeler = character;
        } else if (still && character.bot && character.bot.mode === 'defuse') {
          channeling = true;
          channeler = character;
        }
        if (channeler) break;
      }
      if (channeling && channeler) {
        if (device.channelBy !== channeler.id || device.channelKind !== 'defuse') {
          device.channel = 0;
          device.channelBy = channeler.id;
          device.channelKind = 'defuse';
        }
        device.channel += dt;
        if (device.channel >= DEVICE.defuseSeconds) {
          device.state = 'gone';
          device.channel = 0;
          device.channelBy = 0;
          device.channelKind = null;
          state.stats.defuses += 1;
          endRound('DEF', 'defuse');
        }
      } else if (device.channelKind === 'defuse') {
        device.channel = 0;
        device.channelBy = 0;
        device.channelKind = null;
      }
    }
  }

  function stepDeviceVisual(now) {
    const device = state.device;
    const mesh = world.device;
    if (device.state === 'carried') {
      const carrier = state.characters.find((c) => c.id === device.carrierId);
      if (carrier) {
        mesh.visible = true;
        mesh.position.set(carrier.position.x, carrier.position.y + 1.0, carrier.position.z);
        mesh.rotation.y = carrier.yaw;
        world.deviceLight.visible = true;
      }
    } else if (device.state === 'planted' || device.state === 'dropped') {
      mesh.visible = true;
      mesh.position.set(device.position.x, device.position.y + 0.14, device.position.z);
      mesh.rotation.y = 0;
      const rate = device.state === 'planted' ? Math.max(2, 14 - device.fuse * 0.4) : 2;
      world.deviceLight.visible = Math.sin(now * rate) > 0;
    } else {
      mesh.visible = false;
    }
  }

  function step(dt, now) {
    if (state.phase === 'buy') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        state.phase = 'live';
        state.phaseTime = ROUND.roundSeconds;
        state.buyOpen = false;
        pushEvent(state, { type: 'live' });
      }
    } else if (state.phase === 'live') {
      state.phaseTime -= dt;
      stepChannels(dt);
      if (state.device.state === 'planted') {
        state.device.fuse -= dt;
        const interval = Math.max(0.25, state.device.fuse * 0.03);
        if (now >= beepAt) {
          beepAt = now + interval;
          audio.beep();
        }
        if (state.device.fuse <= 0) {
          state.device.state = 'gone';
          pushEvent(state, { type: 'detonate', position: state.device.position.clone() });
          endRound('ATK', 'detonation');
        }
      } else if (state.phaseTime <= 0) {
        endRound('DEF', 'time');
      }
    } else if (state.phase === 'roundEnd') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        const done = state.scores.DEF >= ROUND.winsToWin || state.scores.ATK >= ROUND.winsToWin || state.roundNumber >= ROUND.maxRounds;
        if (done) {
          state.matchWinner = state.scores.DEF > state.scores.ATK ? 'DEF' : 'ATK';
          state.phase = 'matchEnd';
          pushEvent(state, { type: 'matchEnd', winner: state.matchWinner });
        } else {
          startRound();
        }
      }
    }
    stepDeviceVisual(now);
  }

  function buy(key) {
    if (state.phase !== 'buy') return false;
    const player = playerOf(state);
    if (!player || !player.alive) return false;
    const item = BUY_ITEMS.find((entry) => entry.key === key);
    if (!item) return false;
    const price = item.kind === 'weapon' ? WEAPONS[item.id].price : item.price;
    if (player.money < price) return false;
    if (item.kind === 'weapon') {
      player.primary = createWeaponState(item.id);
      player.activeSlot = 'primary';
    } else if (item.kind === 'armor') {
      if (player.armor) return false;
      player.armor = true;
    } else if (item.kind === 'grenade') {
      if (player.grenades >= 2) return false;
      player.grenades += 1;
    } else if (item.kind === 'ammo') {
      for (const slot of ['primary', 'secondary']) {
        const weapon = player[slot];
        if (!weapon) continue;
        weapon.mag = WEAPONS[weapon.id].mag;
        weapon.reserve = WEAPONS[weapon.id].reserve;
      }
    }
    player.money -= price;
    audio.buy();
    pushEvent(state, { type: 'buy', item });
    return true;
  }

  return { startMatch, startRound, endRound, step, buy, onKill, checkElimination };
}
