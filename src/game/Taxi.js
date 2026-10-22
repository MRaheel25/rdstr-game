// V3 Taxi mode: a 10-minute shift. Passengers wait at the roadside (waving, with a light
// column and a GPS route); stop next to them to pick up, drive to the destination anywhere in
// the city and stop there to drop off. Fare = distance + time; a time bonus for fast
// delivery; a tip for smooth driving that drops with every crash. Passengers comment in
// subtitles. Optional TAXI roof light on the car during the shift.
import * as THREE from 'three';
import { personGeometry, personMaterial } from '../world/Pedestrians.js';
import { textTexture } from '../world/Textures.js';
import { districtAt, placeName } from '../world/Layout.js';

const SHIFT = 600; // seconds
const NAMES = ['Maya', 'Theo', 'Ines', 'Kofi', 'Lena', 'Ravi', 'Sora', 'Marco', 'Aisha', 'Jun', 'Elena', 'Omar'];
const LINES = {
  pickup: ['{dest}, please. And step on it!', 'Can you get me to {dest}?', 'To {dest}. I am already late.', '{dest}. Nice car, by the way.'],
  fast: ['WOOO! This thing flies!', 'Faster! I love it!', 'Is this legal? Who cares!'],
  scared: ['Hey! Watch the road!', 'Are you trying to kill me?!', 'My coffee is everywhere...', 'Please, slow down!'],
  air: ['WHY ARE WE FLYING?!', 'Did we just... jump?!'],
  arrive: ['Thanks! Keep the change.', 'Perfect, right on time!', 'That was a ride. Thank you!', 'Five stars, easily.'],
  late: ['Finally... I missed the start.', 'Took a while, huh?'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Taxi stands (map icons) spread over the city.
export const TAXI_STANDS = [
  [2.6, 140], [-240, 300], [300, -280], [-360, -40], [120, 600], [-640, 200], [780, 120], [0, -700],
];

export class Taxi {
  constructor(game) {
    this.game = game;
    this.active = false;
    // The waiting passenger: one instance of the pedestrian mesh (wave = arms up animation).
    const geo = personGeometry();
    for (const [name, n] of [['iAnim', 4], ['iShirt', 3], ['iPants', 3], ['iSkin', 3]]) geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(n), n));
    this.paxMesh = new THREE.InstancedMesh(geo, personMaterial(), 1);
    this.paxMesh.castShadow = true;
    this.paxMesh.frustumCulled = false;
    this.paxMesh.visible = false;
    this.paxMesh.userData.noCollider = true;
    game.scene.add(this.paxMesh);
    // Roof light.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.26), [
      new THREE.MeshBasicMaterial({ color: 0xffc21a }), new THREE.MeshBasicMaterial({ color: 0xffc21a }), new THREE.MeshBasicMaterial({ color: 0xffd25a }), new THREE.MeshBasicMaterial({ color: 0x222 }),
      new THREE.MeshBasicMaterial({ map: textTexture('TAXI', { w: 256, h: 96, bg: '#ffc21a', color: '#111', font: 'bold 72px Arial' }) }),
      new THREE.MeshBasicMaterial({ map: textTexture('TAXI', { w: 256, h: 96, bg: '#ffc21a', color: '#111', font: 'bold 72px Arial' }) }),
    ]);
    sign.position.set(0, 1.42, 0.2);
    sign.visible = false;
    game.playerVisual.body.add(sign);
    this.roofSign = sign;
    this.dests = null;
    // Stands are key locations: on the minimap and the full map.
    const pois = game.world.gen.pois || (game.world.gen.pois = []);
    for (const [x, z] of TAXI_STANDS) pois.push({ kind: 'taxi', x, z, label: 'Taxi stand' });
  }

  standIcons() {
    return [];
  }

  // Candidate drop-off points: road points spread across every district.
  destinations() {
    if (this.dests) return this.dests;
    const g = this.game.world.graph;
    const out = [];
    for (const e of g.edges) {
      if (e.kind === 'highway' || e.kind === 'ramp' || e.kind === 'stunt' || e.length < 40) continue;
      const m = e.points[e.points.length >> 1];
      if (Math.abs(m.y) > 6) continue;
      out.push(m.clone());
    }
    this.dests = out;
    return out;
  }

  // A roadside spot `min`..`max` m from `from` (prefers a different district).
  spot(from, min, max) {
    const list = this.destinations();
    const here = districtAt(from.x, from.z).id;
    let best = null;
    for (let k = 0; k < 60; k++) {
      const p = list[Math.floor(Math.random() * list.length)];
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < min || d > max) continue;
      best = p;
      if (districtAt(p.x, p.z).id !== here || Math.random() < 0.3) break;
    }
    best = best || list[0];
    const r = this.game.world.nearestRoad(best);
    // Kerbside: 4 m further out from the lane centre.
    const fwd = new THREE.Vector3(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const e = this.game.world.graph.nearest(r.position, (ed) => ed.kind !== 'stunt');
    const half = e && e.edge.laneWidth && e.edge.lanes > 1 ? e.edge.laneWidth * e.edge.lanes + 1.5 : 7.5;
    const base = e ? e.point : r.position;
    return { pos: base.clone().addScaledVector(right, half), road: r.position.clone(), yaw: r.yaw };
  }

  startShift() {
    const g = this.game;
    this.active = true;
    this.time = SHIFT;
    this.fares = 0;
    this.earned = 0;
    this.tips = 0;
    this.best = 0;
    this.roofSign.visible = true;
    this.offs = [g.events.on('impact', (e) => this.onImpact(e))];
    g.banner.show('TAXI SHIFT', '10 minutes · as many fares as you can', 'cool', 2.6);
    this.nextPassenger();
  }

  nextPassenger() {
    const g = this.game;
    const s = this.spot(g.player.position, 140, 420);
    this.pax = { name: pick(NAMES), pos: s.pos, phase: 'waiting', wave: 0 };
    const c = new THREE.Color().setHSL(Math.random(), 0.6, 0.5);
    c.toArray(this.paxMesh.geometry.attributes.iShirt.array, 0);
    new THREE.Color(0x2a3040).toArray(this.paxMesh.geometry.attributes.iPants.array, 0);
    new THREE.Color().setHSL(0.07, 0.45, 0.35 + Math.random() * 0.35).toArray(this.paxMesh.geometry.attributes.iSkin.array, 0);
    for (const k of ['iShirt', 'iPants', 'iSkin']) this.paxMesh.geometry.attributes[k].needsUpdate = true;
    this.paxMesh.visible = true;
    this.marker && this.marker.remove();
    this.marker = g.activities.markers.add({ pos: s.pos.clone(), color: 0xffc21a, label: `PICK UP · ${this.pax.name.toUpperCase()}`, scale: 0.8 });
    g.nav.setWaypoint(s.pos.x, s.pos.z, `PICK UP ${this.pax.name.toUpperCase()}`, { color: '#ffc21a', silent: true });
  }

  pickUp() {
    const g = this.game;
    const p = this.pax;
    const d = this.spot(p.pos, 500, 1500);
    const dist = d.pos.distanceTo(p.pos);
    const name = placeName(d.pos.x, d.pos.z);
    Object.assign(p, { phase: 'riding', dest: d.pos, destName: name, dist, t: 0, par: 20 + dist / 15, tip: 0.3, fare: Math.round(12 + dist * 0.055), comment: 0 });
    this.paxMesh.visible = false;
    this.marker && this.marker.remove();
    this.marker = g.activities.markers.add({ pos: d.pos.clone(), color: 0x6cff8f, label: `DROP OFF · ${name.toUpperCase()}`, scale: 0.8 });
    g.nav.setWaypoint(d.pos.x, d.pos.z, `DROP OFF · ${name.toUpperCase()}`, { color: '#6cff8f', silent: true });
    this.say(pick(LINES.pickup).replace('{dest}', name));
    g.audio && g.audio.sfx.serviceDone();
  }

  dropOff() {
    const g = this.game;
    const p = this.pax;
    const fast = Math.max(0, 1 - p.t / p.par);
    const bonus = Math.round(p.fare * 0.6 * fast);
    const tip = Math.round(p.fare * Math.max(0, p.tip));
    const total = p.fare + bonus + tip;
    this.fares++;
    this.earned += total;
    this.tips += tip;
    this.best = Math.max(this.best, total);
    g.progress.reward(total, Math.round(total / 25));
    this.say(p.t > p.par * 1.5 ? pick(LINES.late) : pick(LINES.arrive));
    g.banner.show(`FARE +$${total}`, `$${p.fare} fare · $${bonus} time bonus · $${tip} tip`, 'cool', 2.4);
    g.audio && g.audio.sfx.ui('buy');
    this.marker && this.marker.remove();
    this.marker = null;
    this.pax = null;
    g.nav.clear();
    this.nextPassenger();
  }

  say(text) {
    this.game.radio.say(text, { tag: this.pax ? this.pax.name.toUpperCase() : 'PASSENGER', priority: true });
  }

  onImpact(e) {
    const p = this.pax;
    if (!this.active || !p || p.phase !== 'riding') return;
    const s = e.info ? e.info.strength : 0;
    if (s < 5) return;
    p.tip -= Math.min(0.15, 0.04 + s * 0.006);
    if (this.game.time - (p.lastScared || -9) > 4) {
      p.lastScared = this.game.time;
      this.say(pick(LINES.scared));
    }
  }

  update(dt) {
    const g = this.game;
    if (g.state !== 'playing') return;
    if (!this.active) {
      // Free roam: stop at a taxi stand to start a shift.
      if (g.activities.active || g.kidsMode) return;
      const car = g.player;
      const near = TAXI_STANDS.some(([x, z]) => Math.hypot(car.position.x - x, car.position.z - z) < 10);
      if (near) {
        g.hud.prompt(car.speed < 2 ? 'STARTING TAXI SHIFT…' : 'STOP HERE TO START A TAXI SHIFT');
        this.standT = car.speed < 2 ? (this.standT || 0) + dt : 0;
        if (this.standT > 1.5) {
          this.standT = 0;
          g.hud.prompt(null);
          this.startShift();
        }
        this.promptStand = true;
      } else if (this.promptStand) {
        this.promptStand = false;
        g.hud.prompt(null);
      }
      return;
    }
    this.time -= dt;
    const car = g.player;
    const p = this.pax;
    const tl = Math.max(0, this.time);
    const mm = Math.floor(tl / 60);
    const ss = Math.floor(tl % 60).toString().padStart(2, '0');
    const job = !p ? '' : p.phase === 'waiting' ? `PICK UP ${p.name.toUpperCase()}` : `TAKE ${p.name.toUpperCase()} TO ${p.destName.toUpperCase()} · TIP ${Math.round(Math.max(0, p.tip) * 100)}%`;
    g.activities.ui.objective(`TAXI · ${this.fares} FARES · $${this.earned.toLocaleString()}<div class="obj-note">${job}</div>`, tl, tl < 30);
    if (this.time <= 0) return this.endShift();
    if (!p) return;
    if (p.phase === 'waiting') {
      p.wave += dt * 6;
      const a = this.paxMesh.geometry.attributes.iAnim;
      a.array[0] = p.wave;
      a.array[1] = 0.05;
      a.array[2] = 0;
      a.array[3] = 1.1 + Math.sin(p.wave) * 0.35; // arms up, waving
      a.needsUpdate = true;
      const yaw = Math.atan2(car.position.x - p.pos.x, car.position.z - p.pos.z);
      this.paxMesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(p.pos.x, p.pos.y + 0.12, p.pos.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
      this.paxMesh.instanceMatrix.needsUpdate = true;
      const d = Math.hypot(car.position.x - p.pos.x, car.position.z - p.pos.z);
      if (d < 9) g.hud.prompt(car.speed < 3 ? 'PASSENGER GETTING IN…' : 'STOP NEXT TO THE PASSENGER');
      if (d < 9 && car.speed < 3) {
        p.board = (p.board || 0) + dt;
        if (p.board > 0.8) {
          g.hud.prompt(null);
          this.pickUp();
        }
      } else p.board = 0;
      return;
    }
    // Riding.
    p.t += dt;
    if (car.speed > 45 && g.time - (p.lastFast || -20) > 18) {
      p.lastFast = g.time;
      this.say(pick(LINES.fast));
    }
    if (car.groundedCount === 0 && car.airTime > 1 && !p.airSaid) {
      p.airSaid = true;
      p.tip -= 0.05;
      this.say(pick(LINES.air));
    }
    if (car.groundedCount > 0) p.airSaid = false;
    // Smooth driving slowly earns the tip back.
    if (car.speed > 5 && car.groundedCount >= 3 && Math.abs(car.slipAngle) < 0.15) p.tip = Math.min(0.35, p.tip + dt * 0.002);
    const d = Math.hypot(car.position.x - p.dest.x, car.position.z - p.dest.z);
    if (d < 14) g.hud.prompt(car.speed < 4 ? 'DROPPING OFF…' : 'STOP TO DROP OFF');
    if (d < 14 && car.speed < 4) {
      p.stop = (p.stop || 0) + dt;
      if (p.stop > 0.6) {
        g.hud.prompt(null);
        this.dropOff();
      }
    } else p.stop = 0;
  }

  endShift() {
    const g = this.game;
    this.stop();
    g.activities.showResults({
      title: 'SHIFT OVER', sub: 'Taxi · 10 minute shift', fail: false, stars: this.fares >= 8 ? 3 : this.fares >= 5 ? 2 : this.fares >= 2 ? 1 : 0,
      rows: [['FARES', String(this.fares)], ['EARNINGS', `$${this.earned.toLocaleString()}`], ['TIPS', `$${this.tips.toLocaleString()}`], ['BEST FARE', `$${this.best.toLocaleString()}`]],
      records: [], cash: this.earned, rep: Math.round(this.earned / 25),
    }, { retry: () => this.startShift() });
  }

  stop() {
    const g = this.game;
    this.active = false;
    this.pax = null;
    this.paxMesh.visible = false;
    this.roofSign.visible = false;
    if (this.marker) this.marker.remove();
    this.marker = null;
    for (const off of this.offs || []) off && off();
    this.offs = [];
    g.nav.clear();
    g.hud.prompt(null);
    g.activities.ui.objective(null);
  }
}
