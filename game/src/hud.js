// HUD DOM: angka nyawa/amunisi/uang, timer, skor, killfeed, banner, menu beli,
// overlay, dan indikator damage. Modul ini tidak menyentuh simulasi; main.js
// memanggil render() tiap frame dan handleEvent() untuk kejadian sesaat.
import { BUY_ITEMS, DEVICE, WEAPONS } from './config.js';
import { activeWeapon, playerOf } from './state.js';

function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function createHud(state, minimap, onPlay) {
  const el = {};
  for (const id of ['score-def', 'score-atk', 'timer', 'round-label', 'clock', 'killfeed', 'crosshair', 'hitmarker', 'dmg-vignette', 'dmg-dir', 'bombbar', 'bomb-label', 'bomb-fill', 'banner', 'banner-title', 'banner-sub', 'vitals', 'hp-value', 'hp-fill', 'money', 'armor-tag', 'nade-count', 'ammo', 'ammo-mag', 'ammo-reserve', 'weapon-name', 'slots', 'objective', 'objective-text', 'interact', 'channel', 'channel-label', 'channel-fill', 'buy', 'buy-money', 'buy-time', 'buy-rows', 'overlay', 'overlay-title', 'overlay-copy', 'match-lines', 'play']) {
    el[id] = document.getElementById(id);
  }
  const cache = {};
  let hitTimer = 0;
  let vignetteUntil = 0;
  let dirUntil = 0;
  let killfeedKey = '';

  function setText(key, element, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    element.textContent = value;
  }

  function buildBuyRows(player) {
    let html = '';
    for (const item of BUY_ITEMS) {
      const price = item.kind === 'weapon' ? WEAPONS[item.id].price : item.price;
      const owned = (item.kind === 'weapon' && player.primary && player.primary.id === item.id)
        || (item.kind === 'armor' && player.armor)
        || (item.kind === 'grenade' && player.grenades >= 2);
      const cant = !owned && player.money < price;
      const cls = owned ? 'owned' : cant ? 'cant' : '';
      const note = owned ? 'DIMILIKI' : cant ? 'UANG KURANG' : '';
      html += `<tr class="${cls}"><td><kbd>${item.key}</kbd></td><td>${item.label}</td><td>${note}</td><td class="price">$${price}</td></tr>`;
    }
    el['buy-rows'].innerHTML = html;
  }

  function renderKillfeed() {
    const key = state.killfeed.map((entry) => `${entry.killer}>${entry.victim}@${entry.time}`).join('|');
    if (key === killfeedKey) return;
    killfeedKey = key;
    el.killfeed.innerHTML = state.killfeed.slice().reverse().map((entry) => {
      const killerClass = entry.killerTeam === 'DEF' ? 'def' : 'atk';
      const victimClass = entry.victimTeam === 'DEF' ? 'def' : 'atk';
      return `<div><span class="${killerClass}">${entry.killer}</span> <span class="w">${entry.head ? '◎ ' : ''}${entry.weapon} ▸</span> <span class="${victimClass}">${entry.victim}</span></div>`;
    }).join('');
  }

  function render(now) {
    const player = playerOf(state);
    setText('scoreDef', el['score-def'], String(state.scores.DEF));
    setText('scoreAtk', el['score-atk'], String(state.scores.ATK));
    setText('timer', el.timer, formatClock(state.phaseTime));
    const phaseLabel = state.phase === 'buy' ? 'FASE BELI' : state.phase === 'roundEnd' ? 'RONDE SELESAI' : state.phase === 'matchEnd' ? 'SELESAI' : `RONDE ${state.roundNumber}`;
    setText('roundLabel', el['round-label'], phaseLabel);
    el.clock.classList.toggle('low', state.phase === 'live' && state.phaseTime < 15);

    if (player) {
      setText('hp', el['hp-value'], String(Math.max(0, Math.ceil(player.hp))));
      const hpPct = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
      if (cache.hpPct !== hpPct) {
        cache.hpPct = hpPct;
        el['hp-fill'].style.width = hpPct;
      }
      el.vitals.classList.toggle('low', player.hp <= 30 && player.alive);
      setText('money', el.money, `$${player.money}`);
      el['armor-tag'].hidden = !player.armor;
      setText('nades', el['nade-count'], String(player.grenades));
      const weapon = player.activeSlot === 'grenade' ? null : activeWeapon(player);
      if (weapon) {
        setText('mag', el['ammo-mag'], String(weapon.mag));
        setText('reserve', el['ammo-reserve'], `/ ${weapon.reserve}`);
        setText('wname', el['weapon-name'], WEAPONS[weapon.id].name + (weapon.reloadLeft > 0 ? ' — MENGISI…' : ''));
        el.ammo.classList.toggle('empty', weapon.mag === 0);
      } else {
        setText('mag', el['ammo-mag'], String(player.grenades));
        setText('reserve', el['ammo-reserve'], 'granat');
        setText('wname', el['weapon-name'], 'GRANAT');
        el.ammo.classList.remove('empty');
      }
      for (const slot of el.slots.children) {
        const key = slot.dataset.slot;
        const on = (key === '1' && player.activeSlot === 'primary') || (key === '2' && player.activeSlot === 'secondary') || (key === '3' && player.activeSlot === 'grenade');
        slot.classList.toggle('on', on);
      }
    }

    // Bilah perangkat tertanam.
    const planted = state.device.state === 'planted';
    el.bombbar.hidden = !planted;
    if (planted) {
      setText('bombLabel', el['bomb-label'], `PERANGKAT TERTANAM — SITUS ${state.device.site}`);
      el['bomb-fill'].style.width = `${Math.max(0, (state.device.fuse / DEVICE.fuseSeconds) * 100)}%`;
    }

    // Banner tengah.
    const banner = state.banner;
    const showBanner = banner && now < banner.until;
    el.banner.classList.toggle('on', Boolean(showBanner));
    if (showBanner) {
      setText('bannerTitle', el['banner-title'], banner.title);
      setText('bannerSub', el['banner-sub'], banner.sub);
      el.banner.classList.toggle('win', banner.kind === 'win');
      el.banner.classList.toggle('lose', banner.kind === 'lose');
    }

    // Prompt interaksi + progres channel milik pemain.
    let showInteract = false;
    let showChannel = false;
    if (player && player.alive && planted) {
      const near = player.position.distanceToSquared(state.device.position) < DEVICE.interactRadius * DEVICE.interactRadius;
      showInteract = near;
      showChannel = near && state.device.channelKind === 'defuse' && state.device.channelBy === player.id;
      if (showChannel) {
        setText('channelLabel', el['channel-label'], 'Menjinakkan…');
        el['channel-fill'].style.width = `${(state.device.channel / DEVICE.defuseSeconds) * 100}%`;
      }
    }
    el.interact.hidden = !showInteract;
    el.channel.hidden = !showChannel;

    // Teks tujuan.
    let objective;
    if (!player || !player.alive) objective = 'Kamu gugur — menonton sekutu. Ronde terus berjalan.';
    else if (state.phase === 'buy') objective = 'Fase beli — tekan B untuk membuka menu beli, lalu susun posisi.';
    else if (planted) objective = `Perangkat tertanam di Situs ${state.device.site}! Jinakkan sebelum meledak.`;
    else if (state.phase === 'live') objective = 'Jaga Situs A dan Situs B. Jangan biarkan perangkat meledak.';
    else objective = 'Ronde selesai — ronde berikutnya segera dimulai.';
    setText('objective', el['objective-text'], objective);

    // Menu beli.
    el.buy.hidden = !state.buyOpen || !el.overlay.hidden;
    if (state.buyOpen && player) {
      setText('buyMoney', el['buy-money'], `$${player.money}`);
      setText('buyTime', el['buy-time'], String(Math.max(0, Math.ceil(state.phaseTime))));
      const buyKey = `${player.money}|${player.primary?.id}|${player.armor}|${player.grenades}`;
      if (cache.buyKey !== buyKey) {
        cache.buyKey = buyKey;
        buildBuyRows(player);
      }
    }

    // Vignette damage memudar sendiri.
    el['dmg-vignette'].style.opacity = now < vignetteUntil ? '1' : '0';
    el['dmg-dir'].classList.toggle('on', now < dirUntil);

    // Crosshair disembunyikan saat overlay tampil atau pemain gugur.
    el.crosshair.style.display = (!el.overlay.hidden || (player && !player.alive)) ? 'none' : '';

    renderKillfeed();
    minimap.draw(state, now);
  }

  function handleEvent(event, now) {
    if (event.type === 'hit') {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', event.kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on'), event.kill ? 220 : 110);
    } else if (event.type === 'hurt') {
      vignetteUntil = now + 0.45;
      dirUntil = now + 0.7;
      const player = playerOf(state);
      if (player) {
        const dx = event.fromX - player.position.x;
        const dz = event.fromZ - player.position.z;
        // Bearing penyerang relatif terhadap arah pandang; panah diputar
        // supaya menunjuk ke arah datangnya tembakan di layar.
        const bearing = Math.atan2(dx, dz);
        const relative = bearing - (player.yaw + Math.PI);
        el['dmg-dir'].style.transform = `translate(-50%, -50%) rotate(${-relative}rad)`;
      }
    }
  }

  function setCrosshair(spreadPx) {
    el.crosshair.style.setProperty('--sp', `${spreadPx.toFixed(1)}px`);
  }

  function showOverlay(mode, data) {
    el.overlay.hidden = false;
    el['match-lines'].hidden = true;
    if (mode === 'start') {
      el['overlay-title'].innerHTML = '<span class="sun">SENJA</span> — Perebutan Dermaga';
      el['overlay-copy'].innerHTML = 'Kamu <b>Penjaga</b> dermaga. Bersama dua sekutu, hentikan tiga <b>Penyerbu</b> yang membawa perangkat peledak ke Situs A atau Situs B. Menang 5 ronde lebih dulu.';
      el.play.textContent = 'Klik untuk bermain';
    } else if (mode === 'paused') {
      el['overlay-title'].textContent = 'Jeda';
      el['overlay-copy'].textContent = 'Pointer lock lepas. Klik untuk lanjut bermain.';
      el.play.textContent = 'Klik untuk lanjut';
    } else if (mode === 'matchEnd') {
      const winner = data?.winner;
      el['overlay-title'].textContent = winner === 'DEF' ? 'PENJAGA MENANG!' : 'PENYERBU MENANG';
      el['overlay-copy'].textContent = `Skor akhir ${state.scores.DEF} – ${state.scores.ATK}. Pertandingan selesai.`;
      const player = playerOf(state);
      const accuracy = state.stats.shotsFired > 0 ? Math.round((state.stats.shotsHit / state.stats.shotsFired) * 100) : 0;
      const lines = state.roundLog.map((row) => `<li class="${row.winner === 'DEF' ? 'def' : 'atk'}">Ronde ${row.round}: ${row.winner === 'DEF' ? 'Penjaga' : 'Penyerbu'} — ${row.reason}</li>`);
      lines.push(`<li>Kamu: ${player?.kills ?? 0} bunuh / ${player?.deaths ?? 0} gugur · akurasi ${accuracy}% · ${state.stats.plants} tanam / ${state.stats.defuses} jinakkan (tim)</li>`);
      el['match-lines'].innerHTML = lines.join('');
      el['match-lines'].hidden = false;
      el.play.textContent = 'Main lagi';
    }
    el.play.focus();
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  el.play.addEventListener('click', () => onPlay());

  return { render, handleEvent, setCrosshair, showOverlay, hideOverlay };
}
