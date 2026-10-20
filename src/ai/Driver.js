// AI driver for physics vehicles: pure-pursuit steering along a path, curvature-aware
// speed control, obstacle braking via a forward probe, and stuck / flipped recovery.
import * as THREE from 'three';
import { clamp, wrapAngle } from '../util/math.js';

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export class Driver {
  constructor(vehicle) {
    this.v = vehicle;
    this.path = []; // Vector3[]
    this.pathIndex = 0;
    this.targetSpeed = 20;
    this.mode = 'path'; // 'path' | 'point'
    this.point = new THREE.Vector3();
    this.stuck = 0;
    this.reverseTimer = 0;
    this.reverseSteer = 0;
    this.aggression = 0.5;
    this.avoid = 0;
  }

  setPath(points, speed) {
    this.path = points;
    this.pathIndex = 0;
    this.mode = 'path';
    if (speed !== undefined) this.targetSpeed = speed;
  }

  setPoint(p, speed) {
    this.point.copy(p);
    this.mode = 'point';
    if (speed !== undefined) this.targetSpeed = speed;
  }

  get pathDone() {
    return this.mode === 'path' && this.pathIndex >= this.path.length - 1;
  }

  // Look-ahead point on the path.
  lookAhead(dist, out) {
    const v = this.v;
    const p = this.path;
    if (!p.length) return out.copy(v.position);
    // Advance the index past points we've reached.
    while (this.pathIndex < p.length - 1) {
      const a = p[this.pathIndex];
      const b = p[this.pathIndex + 1];
      _v.subVectors(b, a);
      const len2 = _v.lengthSq() || 1;
      const t = ((v.position.x - a.x) * _v.x + (v.position.z - a.z) * _v.z) / len2;
      if (t > 1 || v.position.distanceToSquared(a) < 25) this.pathIndex++;
      else break;
    }
    let remaining = dist;
    let cur = _t.copy(v.position);
    for (let i = this.pathIndex + 1; i < p.length; i++) {
      const d = cur.distanceTo(p[i]);
      if (d >= remaining) return out.copy(cur).lerp(p[i], remaining / d);
      remaining -= d;
      cur = p[i];
    }
    return out.copy(p[p.length - 1]);
  }

  // Max speed allowed now so we can still slow down for upcoming turns
  // (corner speed from the turn angle, then v = sqrt(vc^2 + 2 a d)).
  cornerSpeed() {
    const p = this.path;
    if (this.mode !== 'path' || p.length < 3) return Infinity;
    const v = this.v;
    let best = Infinity;
    let dist = v.position.distanceTo(p[Math.min(this.pathIndex + 1, p.length - 1)]);
    for (let i = this.pathIndex + 1; i < Math.min(p.length - 1, this.pathIndex + 8); i++) {
      const a = p[i - 1];
      const b = p[i];
      const c = p[i + 1];
      const h1 = Math.atan2(b.x - a.x, b.z - a.z);
      const h2 = Math.atan2(c.x - b.x, c.z - b.z);
      const turn = Math.abs(wrapAngle(h2 - h1));
      if (turn > 0.2) {
        const vc = clamp(34 - turn * 15, 10, 40);
        const allowed = Math.sqrt(vc * vc + 2 * 7.5 * Math.max(0, dist - 8));
        best = Math.min(best, allowed);
      }
      dist += b.distanceTo(c);
      if (dist > 400) break;
    }
    return best;
  }

  // Compute controls. obstacleDist: free distance ahead (from a probe), Infinity if clear.
  drive(dt, obstacleDist = Infinity) {
    const v = this.v;
    const c = v.controls;
    // Flipped or stuck recovery.
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      c.throttle = 0;
      c.brake = 1;
      c.steer = this.reverseSteer;
      c.handbrake = 0;
      return;
    }
    const speed = v.speed;
    const lookDist = clamp(speed * 0.55 + 7, 7, 45);
    const target = this.mode === 'path' ? this.lookAhead(lookDist, _t) : _t.copy(this.point);
    // Local heading error.
    _v.subVectors(target, v.position);
    const fwd = v.forward;
    const right = v.right;
    const ahead = _v.dot(fwd);
    const side = _v.dot(right);
    const angle = Math.atan2(side, Math.max(0.1, ahead));
    const behind = ahead < 0;
    let steer = clamp(angle * 2.2 + this.avoid, -1, 1);
    if (behind && Math.abs(side) < 4) steer = side >= 0 ? 1 : -1;
    // Speed: desired, limited by corners, the turn we're making and obstacles.
    let want = this.targetSpeed;
    want = Math.min(want, this.cornerSpeed());
    want = Math.min(want, clamp(40 - Math.abs(angle) * 30, 8, 60));
    if (obstacleDist < 40) want = Math.min(want, Math.max(0, (obstacleDist - 6) * 0.9));
    const err = want - v.fwdSpeed;
    c.throttle = clamp(err * 0.35, 0, 1);
    c.brake = clamp(-err * 0.25, 0, 1);
    if (c.brake > 0.05) c.throttle = 0;
    c.steer = steer;
    c.handbrake = Math.abs(angle) > 1.2 && speed > 14 ? 1 : 0;
    // Stuck detection.
    if (c.throttle > 0.4 && speed < 1.2) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 1.6) {
      this.stuck = 0;
      this.reverseTimer = 1.4;
      this.reverseSteer = -Math.sign(steer || 1);
    }
  }
}
