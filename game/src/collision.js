// Geometri tabrakan: kotak AABB untuk dinding/peti, dan uji garis pandang.
// Semua fungsi memakai objek sementara milik pemanggil — tidak ada alokasi
// di loop panas.
import * as THREE from 'three';

export function makeCollider(cx, cy, cz, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
    new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2),
  );
}

// Apakah kotak karakter (pusat x,z; kaki di y; tinggi height) menabrak collider?
// lift mengangkat uji dari lantai/langit-langit supaya berdiri di atas peti
// tidak terbaca sebagai menabrak dinding.
export function findOverlap(x, y, z, height, radius, lift, colliders, probe) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const collider of colliders) {
    if (probe.intersectsBox(collider)) return collider;
  }
  return null;
}

// Gerakkan karakter satu sumbu demi satu sumbu; dinding menghentikan, bukan menelan.
export function moveCharacter(position, velocity, dt, height, radius, colliders, probe, gravity) {
  const nextX = position.x + velocity.x * dt;
  if (!findOverlap(nextX, position.y, position.z, height, radius, 0.04, colliders, probe)) {
    position.x = nextX;
  } else {
    velocity.x = 0;
  }
  const nextZ = position.z + velocity.z * dt;
  if (!findOverlap(position.x, position.y, nextZ, height, radius, 0.04, colliders, probe)) {
    position.z = nextZ;
  } else {
    velocity.z = 0;
  }
  velocity.y -= gravity * dt;
  position.y += velocity.y * dt;
  let onGround = false;
  const hit = findOverlap(position.x, position.y, position.z, height, radius, 0, colliders, probe);
  if (hit && velocity.y <= 0) {
    position.y = hit.max.y;
    velocity.y = 0;
    onGround = true;
  } else if (hit) {
    position.y = hit.min.y - height;
    velocity.y = 0;
  }
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    onGround = true;
  }
  return onGround;
}

// Garis pandang bersih antara dua titik mata? raycaster dan vektor dipakai ulang.
export function hasLineOfSight(from, to, shootables, raycaster, direction) {
  direction.subVectors(to, from);
  const distance = direction.length();
  if (distance < 0.001) return true;
  direction.multiplyScalar(1 / distance);
  raycaster.set(from, direction);
  raycaster.far = distance - 0.05;
  return raycaster.intersectObjects(shootables, false).length === 0;
}

// Jarak dari titik ke kotak terdekat (untuk damage granat dan uji situs).
export function distanceToBoxSquared(point, box) {
  const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
  const dy = Math.max(box.min.y - point.y, 0, point.y - box.max.y);
  const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
  return dx * dx + dy * dy + dz * dz;
}
