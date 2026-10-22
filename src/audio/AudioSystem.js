// Connects the synthesized audio to the game: per-frame car / police / music updates, the
// 3D listener on the camera, Ghost Mode and Cold Snap muffling, pause ducking, volume settings
// and one-shot sounds for gameplay events.
import * as THREE from 'three';
import { AudioEngine } from './AudioEngine.js';
import { CarAudio } from './CarAudio.js';
import { PoliceAudio } from './PoliceAudio.js';
import { SFX } from './SFX.js';
import { Music } from './Music.js';
import { clamp } from '../util/math.js';

const _v = new THREE.Vector3();

export class AudioSystem {
  constructor(game) {
    this.game = game;
    this.engine = new AudioEngine(game.settings);
    const e = this.engine;
    this.ok = e.ok;
    if (!e.ok) return;
    this.car = new CarAudio(e);
    this.police = new PoliceAudio(e);
    this.sfx = new SFX(e);
    this.music = new Music(e);
    this.music.setStyle(game.settings.get('musicStyle'));
    this.music.start();
    this.muffle = 0;
    this.menu = false;
    game.settings.onChange((k) => {
      if (k.endsWith('Volume') || k === 'musicOn') e.applyVolumes();
      if (k === 'musicStyle') this.music.setStyle(game.settings.get('musicStyle'));
    });
    game.vfx.onExplosion = (p, power) => this.sfx.explosion(p, clamp(power, 0.4, 1.5));
    this.bindEvents();
  }

  bindEvents() {
    const g = this.game;
    const ev = g.events;
    const sfx = this.sfx;
    ev.on('impact', (e) => sfx.impact(e.info.strength, e.info.point));
    ev.on('npcImpact', (e) => sfx.impact(e.strength * 0.8, e.position));
    ev.on('land', (e) => {
      if (e.vehicle === g.player && e.airTime > 0.25) sfx.land(clamp(-(e.vy || 0) / 14, 0.15, 1.2), e.vehicle.position);
    });
    ev.on('launch', () => sfx.launch());
    ev.on('propBreak', (e) => sfx.prop(e.item.typeName, e.position, e.velocity ? e.velocity.length() : 10));
    ev.on('splash', (e) => sfx.splash(e.vehicle.position, 1));
    ev.on('honk', (e) => sfx.horn(e.position));
    ev.on('nearMiss', (e) => {
      const cam = g.camera;
      _v.copy(e.car.pos).sub(cam.position).normalize();
      const right = _v.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion));
      sfx.whoosh(right, clamp((e.speed || 20) / 40, 0.5, 1.2));
    });
    ev.on('coldSnap', () => sfx.coldSnap());
    ev.on('frostShockwave', (e) => sfx.frostShockwave(e.position));
    ev.on('emp', () => sfx.emp());
    ev.on('spiked', () => sfx.spikePop(g.player.position));
    ev.on('droneDown', (e) => sfx.impact(9, e.position));
    ev.on('airStation', () => sfx.airStation(g.player.position));
    ev.on('radio', () => sfx.radioSquelch());
    ev.on('heatUp', (e) => sfx.alert(e.level));
    ev.on('takedown', () => sfx.stinger('takedown'));
    ev.on('busted', () => sfx.stinger('busted'));
    ev.on('pursuitEnd', (e) => {
      if (e.reason === 'evaded') sfx.stinger('evaded');
    });
  }

  // menu: title screen / garage (music only, world silent).
  setMenu(on) {
    this.menu = on;
  }

  ui(kind) {
    if (this.ok) this.sfx.ui(kind);
  }

  update(realDt) {
    if (!this.ok) return;
    const g = this.game;
    const e = this.engine;
    const p = g.player;
    const paused = g.state !== 'playing';
    const ghost = !!(p.energy && p.energy.ghost);
    const coldSnap = g.stunts.coldSnap.active;
    // World ducking: silent in menus and pause, softened in photo mode.
    const worldGain = this.menu ? 0 : g.state === 'photo' ? 0.35 : paused ? 0.0 : 1;
    if (worldGain !== this.worldGain) {
      this.worldGain = worldGain;
      e.setWorldGain(worldGain);
    }
    const muffle = Math.max(ghost ? 0.72 : 0, coldSnap ? 0.85 : 0, g.water && g.water.submerged > 0 ? 0.95 : 0, g.state === 'paused' ? 0.8 : 0);
    if (Math.abs(muffle - this.muffle) > 0.01) {
      this.muffle = muffle;
      e.setMuffle(muffle, coldSnap ? 0.05 : 0.25);
    }
    e.updateListener(g.camera, p.velocity);
    this.car.update(realDt, p, { ghost, wet: g.isWet(), paused: paused || this.menu, timeScale: g.timeScale });
    this.police.update(realDt, g.police, g.heat, g.camera.position, p.velocity, paused || this.menu);
    const h = g.heat;
    const intensity = h.phase === 'none' ? 0 : h.phase === 'pursuit' ? h.level : Math.max(1, h.level - 1);
    this.music.setState({ intensity, calm: !this.menu && (ghost || coldSnap), menu: this.menu });
  }
}
