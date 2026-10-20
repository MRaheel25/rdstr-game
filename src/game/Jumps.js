// Named stunt jumps built into the world (Broken Bridge, Highway Gap, Container Stack, Car
// Carrier, Garage Roof, Dirt Kickers). A jump counts when the car leaves the ground near its
// takeoff and lands cleanly far enough away.
import * as THREE from 'three';

const _d = new THREE.Vector3();

export class JumpTracker {
  constructor(game) {
    this.game = game;
    this.jumps = game.world.gen.jumps.map((j, i) => ({
      id: `${j.name.toLowerCase().replace(/\s+/g, '-')}-${i}`,
      name: j.name,
      takeoff: j.takeoff ? j.takeoff.clone() : new THREE.Vector3(j.x, j.y, j.z),
      landing: j.landing ? j.landing.clone() : null,
      dir: j.dir ? j.dir.clone().normalize() : null,
      minDist: j.type === 'dirt' ? 18 : 26,
    }));
    this.current = null;
    this.wasAir = false;
    game.events.on('stuntLanding', (e) => this.onLand(e));
  }

  byName(name) {
    return this.jumps.filter((j) => j.name === name);
  }

  update() {
    const p = this.game.player;
    const air = p.groundedCount === 0;
    if (air && !this.wasAir) {
      // Takeoff: find a jump whose lip is right here, crossed in roughly the right direction.
      this.current = null;
      for (const j of this.jumps) {
        _d.subVectors(p.position, j.takeoff);
        if (Math.hypot(_d.x, _d.z) > 18 || Math.abs(_d.y) > 7) continue;
        if (j.dir && p.velocity.dot(j.dir) < p.speed * 0.4) continue;
        this.current = { jump: j, start: p.position.clone(), speed: p.speed };
        break;
      }
    }
    this.wasAir = air;
  }

  onLand(e) {
    const c = this.current;
    this.current = null;
    if (!c || !e.clean) return;
    const p = this.game.player.position;
    const dist = Math.hypot(p.x - c.start.x, p.z - c.start.z);
    if (dist < c.jump.minDist) return;
    this.game.events.emit('jumpLanded', { jump: c.jump, distance: dist, airTime: e.airTime });
  }
}
