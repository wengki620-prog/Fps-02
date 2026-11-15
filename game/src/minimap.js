// Minimap 2D: denah dinding, situs, perangkat, dan posisi tim. Musuh hanya
// muncul bila baru saja terlihat oleh tim pemain (maksimal 3 detik lalu),
// supaya informasi minimap adalah hasil pengamatan, bukan wallhack.
export function createMinimap(canvas, world) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const scale = Math.min(W / 48, H / 40);
  const ox = W / 2;
  const oy = H / 2;
  const walls = world.colliders.filter((box) => box.max.y - box.min.y > 0.5);

  function px(x) {
    return ox + x * scale;
  }
  function py(z) {
    return oy + z * scale;
  }

  function draw(state, now) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#10151f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2b3547';
    for (const box of walls) {
      ctx.fillRect(px(box.min.x), py(box.min.z), (box.max.x - box.min.x) * scale, (box.max.z - box.min.z) * scale);
    }
    for (const [key, site] of Object.entries(world.sites)) {
      ctx.strokeStyle = key === 'A' ? '#3fb8a6' : '#f2a541';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(site.center.x), py(site.center.z), site.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(key, px(site.center.x), py(site.center.z));
    }
    const device = state.device;
    if (device.state === 'planted' || device.state === 'dropped') {
      if (Math.sin(now * 6) > -0.3) {
        ctx.fillStyle = '#ff4030';
        ctx.beginPath();
        ctx.arc(px(device.position.x), py(device.position.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const character of state.characters) {
      if (!character.alive) continue;
      if (character.team === 'ATK' && (now - (state.enemySeen[character.id] ?? -99)) > 3) continue;
      const x = px(character.position.x);
      const y = py(character.position.z);
      if (character.isPlayer) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-character.yaw);
        ctx.fillStyle = '#ece7dc';
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = character.team === 'DEF' ? '#3fb8a6' : '#e0683c';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return { draw };
}
