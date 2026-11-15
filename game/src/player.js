// Gerakan pemain: akselerasi, gesekan, gravitasi, jongkok, dan lompat,
// diselesaikan sebagai kotak melawan collider dunia satu sumbu demi satu sumbu.
// Modul ini tidak tahu soal render; main.js menyinkronkan kamera dari state.
import * as THREE from 'three';
import { PLAYER_TUNING as T } from './config.js';
import { findOverlap, moveCharacter } from './collision.js';

export function createPlayerController(character, colliders) {
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    character.yaw -= dx * sensitivity;
    character.pitch = Math.max(-1.45, Math.min(1.45, character.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    character.pitch = Math.min(1.45, character.pitch + pitchKick);
    character.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !character.crouching) {
      character.crouching = true;
      character.height = T.crouchHeight;
    } else if (!wantCrouch && character.crouching) {
      const blocked = findOverlap(character.position.x, character.position.y, character.position.z, T.standHeight, T.radius, 0.02, colliders, probe);
      if (!blocked) {
        character.crouching = false;
        character.height = T.standHeight;
      }
    }
    const eyeTarget = character.crouching ? T.crouchEye : T.standEye;
    character.eye += (eyeTarget - character.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(character.yaw);
      const cos = Math.cos(character.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = character.crouching ? T.crouchSpeed : slow ? T.slowSpeed : T.walkSpeed;
    const blend = Math.min(1, (character.onGround ? T.groundAccel : T.airAccel) * dt / speed);
    character.velocity.x += (wish.x * speed - character.velocity.x) * blend;
    character.velocity.z += (wish.z * speed - character.velocity.z) * blend;
    if (character.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - T.friction * dt);
      character.velocity.x *= damp;
      character.velocity.z *= damp;
    }
    if (keys.has('Space') && character.onGround) {
      character.velocity.y = T.jumpSpeed;
      character.onGround = false;
    }
    character.onGround = moveCharacter(character.position, character.velocity, dt, character.height, T.radius, colliders, probe, T.gravity);
    character.velocity.y = Math.max(-30, character.velocity.y);
  }

  return {
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(character.velocity.x, character.velocity.z);
    },
    isSlow(keys) {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
  };
}
