// Free roam with activity markers, mission / race flow (briefing -> run -> results), mission
// rules (time limits, max heat, locked heat, police types), stats, star ratings, rewards,
// progression saves, free-roam pursuit rewards and the bust / wreck results screen.
import * as THREE from 'three';
import { MISSIONS, CONTACT } from './Missions.js';
import { RACES, Race } from './Races.js';
import { MarkerSystem } from './Markers.js';
import { JumpTracker } from './Jumps.js';
import { DISTRICT_UNLOCKS } from './Progress.js';
import { ActivityUI, fmtTime, fmtClock } from '../ui/ActivityUI.js';
import { G, groups } from '../core/Physics.js';
import { MPS_TO_MPH, MPS_TO_KMH } from '../util/math.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const _o = new THREE.Vector3();
const COLORS = { mission: 0xffd23f, race: 0xff3df0 };

export class ActivityManager {
  constructor(game, progress, score) {
    this.game = game;
    this.progress = progress;
    this.score = score;
    this.markers = new MarkerSystem(game.scene);
    this.jumps = new JumpTracker(game);
    this.ui = new ActivityUI(game);
    this.groundGroups = groups(0x8000, G.STATIC | G.RAMP);
    this.active = null;
    this.defs = [
      ...MISSIONS.map((d) => ({ ...d, kind: 'mission' })),
      ...RACES.map((d) => {
        const line = d.line(game.world);
        const p0 = line[0];
        const p1 = line[Math.min(line.length - 1, 4)];
        return { ...d, kind: 'race', start: p0.clone(), yaw: Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z)) };
      }),
    ];
    for (const d of this.defs) d.start.y = this.groundY(d.start);
    this.startMarkers = new Map();
    this.near = null;
    this.pursuit = null;
    this.buildStartMarkers();
    score.onBank = (pts) => {
      const unlocked = this.progress.reward(pts / 20, pts / 250);
      this.announceUnlocks(unlocked);
      if (this.active) this.active.stats.bestCombo = Math.max(this.active.stats.bestCombo, pts);
      if (this.pursuit) this.pursuit.bestCombo = Math.max(this.pursuit.bestCombo, pts);
      this.progress.stat('bestCombo', pts, 'max');
    };
    this.bindEvents();
    game.onGameOver = (reason) => this.onGameOver(reason);
  }

  // ---- helpers --------------------------------------------------------------------------
  groundY(p) {
    // Cast from just above the given height so decks overhead (the Ring) are ignored.
    _o.set(p.x, (p.y || 0) + 4, p.z);
    const hit = this.game.physics.raycast(_o, DOWN, 40, this.groundGroups, null);
    return hit ? _o.y - hit.timeOfImpact : p.y || 0;
  }

  districtName(id) {
    const d = DISTRICT_UNLOCKS.find((x) => x.id === id);
    return d ? d.name : id.toUpperCase();
  }

  available(def) {
    return this.progress.districtOpen(def.district);
  }

  buildStartMarkers() {
    for (const m of this.startMarkers.values()) m.remove();
    this.startMarkers.clear();
    for (const d of this.defs) {
      if (!this.available(d)) continue;
      const label = `${d.kind === 'race' ? 'RACE' : 'MISSION'} · ${d.name.toUpperCase()}`;
      const m = this.markers.add({ pos: d.start, color: COLORS[d.kind], label, scale: 1 });
      this.startMarkers.set(d.id, m);
    }
    this.updateMapMarkers();
  }

  updateMapMarkers() {
    const list = [];
    if (!this.active) {
      for (const d of this.defs) {
        if (!this.startMarkers.has(d.id)) continue;
        const rec = d.kind === 'race' ? this.progress.data.races[d.id] : this.progress.data.missions[d.id];
        list.push({ x: d.start.x, z: d.start.z, color: d.kind === 'race' ? '#ff3df0' : '#ffd23f', done: !!(rec && rec.done), kind: d.kind, label: d.name });
      }
    }
    this.game.minimap.setMarkers(list);
  }

  announceUnlocks(list) {
    for (const d of list) {
      this.game.banner.show('DISTRICT UNLOCKED', d.name, 'cool', 3);
      this.buildStartMarkers();
    }
  }

  bindEvents() {
    const g = this.game;
    g.events.on('takedown', () => {
      if (this.active) this.active.stats.takedowns++;
      if (this.pursuit) this.pursuit.takedowns++;
      this.progress.stat('takedowns', 1);
    });
    g.events.on('pursuitStart', () => {
      if (!this.active) this.pursuit = { time: 0, topSpeed: 0, takedowns: 0, style0: this.score.total, bestCombo: 0, maxHeat: 0 };
    });
    g.events.on('pursuitEnd', (e) => {
      const p = this.pursuit;
      this.pursuit = null;
      if (this.active || e.reason !== 'evaded' || !p) return;
      // Free-roam escape reward.
      const cash = Math.round(350 * p.maxHeat + p.time * 6);
      const rep = Math.round(35 * p.maxHeat + p.time * 0.5);
      const unlocked = this.progress.reward(cash, rep);
      this.progress.stat('evades', 1);
      this.game.banner.show('EVADED', `+$${cash.toLocaleString()}  ·  +${rep} REP`, 'cool', 3);
      this.announceUnlocks(unlocked);
    });
  }

  // ---- per frame: UI, markers, prompts ------------------------------------------------------
  update(realDt) {
    const g = this.game;
    this.ui.pollPad(g.input);
    this.markers.update(realDt, g.camera.position);
    if (g.state !== 'playing') return;
    if (!this.active) {
      this.updateFreeRoam();
      return;
    }
    const a = this.active;
    if (a.race) {
      const race = a.race;
      this.updateRaceHud(race);
      const c = race.nextCheckpoint(race.player);
      if (race.state === 'running') {
        const ci = race.cps[race.player.cp % race.cpPerLap];
        const ahead = race.center[Math.min(race.center.length - 1, ci + 1)];
        a.gate.move(c, ahead.clone().sub(race.center[ci]));
        const ni = race.cps[(race.player.cp + 1) % race.cpPerLap];
        if (a.nextGate && ni != null) a.nextGate.move(race.center[ni]);
      }
      g.minimap.setMission({ x: c.x, z: c.z });
      const text = a.def.scoring === 'drift' ? 'DRIFT THE CANYON' : `LAP ${Math.min(a.def.laps, Math.floor(race.player.cp / race.cpPerLap) + 1)}/${a.def.laps}`;
      this.ui.objective(`${a.def.name.toUpperCase()} · ${text}`, null);
      return;
    }
    if (!a.stage) return;
    let text = a.stage.label || '';
    if (a.count) text += ` <b>${a.count[0]}/${a.count[1]}</b>`;
    if (a.list) text += `<div class="obj-list">${a.list.map((it) => `<span class="${it.done ? 'done' : ''}">${it.done ? '✓' : '○'} ${it.text}</span>`).join('')}</div>`;
    if (a.note) text += `<div class="obj-note">${a.note}</div>`;
    if (a.def.maxHeat != null) text += `<div class="obj-note cool">MAX HEAT ${a.def.maxHeat}</div>`;
    this.ui.objective(text, a.timeLeft, a.timeLeft != null && a.timeLeft < 10);
  }

  // ---- fixed step: activity logic ------------------------------------------------------------
  step(dt) {
    const g = this.game;
    if (g.state !== 'playing') return;
    this.jumps.update();
    const p = g.player;
    if (this.pursuit) {
      this.pursuit.time += dt;
      this.pursuit.topSpeed = Math.max(this.pursuit.topSpeed, p.speed);
      this.pursuit.maxHeat = Math.max(this.pursuit.maxHeat, g.heat.level);
    }
    const st = this.progress.data.stats;
    st.topSpeed = Math.max(st.topSpeed, p.speed * MPS_TO_MPH);
    const a = this.active;
    if (!a || a.finished) return;
    const s = a.stats;
    s.time += dt;
    s.topSpeed = Math.max(s.topSpeed, p.speed);
    s.maxHeatSeen = Math.max(s.maxHeatSeen, g.heat.level);
    if (a.def.maxHeat != null && g.heat.level > a.def.maxHeat) return this.finish({ ok: false, reason: 'Heat level too high' });
    if (a.timeLeft != null) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) return this.finish({ ok: false, reason: 'Out of time' });
    }
    if (a.race) {
      const r = a.race.update(dt);
      if (r) this.finish(r);
      return;
    }
    let guard = 0;
    while (a.stage && guard++ < 4) {
      if (!a.stage.update(a.ctx, dt)) break;
      this.nextStage();
      if (this.active !== a) return;
    }
    if (!a.stage) this.finish({ ok: true });
  }

  updateFreeRoam() {
    const g = this.game;
    const p = g.player;
    let near = null;
    for (const d of this.defs) {
      if (!this.startMarkers.has(d.id)) continue;
      if (Math.hypot(p.position.x - d.start.x, p.position.z - d.start.z) < 9 && Math.abs(p.position.y - d.start.y) < 5) near = d;
    }
    this.near = near;
    if (!near) {
      if (this.prompted) g.hud.prompt(null);
      this.prompted = false;
      return;
    }
    this.prompted = true;
    if (g.heat.level > 0) {
      g.hud.prompt('LOSE THE POLICE TO START');
      return;
    }
    const key = g.input.lastDevice === 'gamepad' ? 'Ⓐ' : 'ENTER';
    g.hud.prompt(`${key}  ▸  ${near.kind === 'race' ? 'RACE' : 'MISSION'}: ${near.name.toUpperCase()}`);
    const padA = g.input.pad && g.input.pad.buttons[0] && g.input.pad.buttons[0].pressed && p.speed < 2;
    if (g.input.keyPressed('Enter') || g.input.keyPressed('NumpadEnter') || (padA && !this.padHeld)) this.openBriefing(near);
    this.padHeld = !!padA;
  }

  openBriefing(def) {
    const g = this.game;
    g.hud.prompt(null);
    g.state = 'briefing';
    g.audio && g.audio.ui('click');
    const record = def.kind === 'race' ? this.progress.data.races[def.id] : this.progress.data.missions[def.id];
    const locked = null; // V3: nothing is locked
    this.ui.briefing(def, { kind: def.kind, record, districtName: this.districtName(def.district), locked }, {
      primary: () => {
        if (!locked) this.begin(def);
      },
      cancel: () => {
        this.ui.close();
        g.audio && g.audio.ui('back');
        g.state = 'playing';
      },
    });
  }

  // ---- running an activity -------------------------------------------------------------------
  begin(def) {
    const g = this.game;
    this.ui.close();
    g.cameraCtl.clearShot();
    g.hud.show(true);
    this.cleanup();
    g.audio && g.audio.ui('buy');
    g.state = 'playing';
    g.hud.prompt(null);
    this.prompted = false;
    g.police.clearAll();
    g.heat.locked = 0;
    g.heat.clear('reset');
    this.pursuit = null;
    g.restorePlayer();
    this.score.reset();
    for (const m of this.startMarkers.values()) m.setVisible(false);
    const a = {
      def,
      stats: { time: 0, topSpeed: 0, takedowns: 0, style0: this.score.total, bestCombo: 0, maxHeatSeen: 0 },
      timeLeft: def.timeLimit ?? null,
      marks: [],
      offs: [],
      target: null,
    };
    this.active = a;
    a.ctx = this.makeContext(a);
    g.heat.locked = def.lockHeat || 0;
    g.police.typeOverride = def.policeTypes || null;
    if (def.kind === 'race') {
      a.race = new Race(g, def, a.ctx);
      const s = a.race.grid[0];
      this.teleport(s.pos, s.yaw);
      g.inputLock = true;
      a.gate = this.markers.add({ kind: 'gate', pos: a.race.nextCheckpoint(a.race.player), color: 0xff3df0 });
      a.nextGate = this.markers.add({ kind: 'column', pos: a.race.center[a.race.cps[1 % a.race.cpPerLap]], color: 0x803070, scale: 0.4 });
      a.ctx.countdown('3');
      g.audio && g.audio.sfx.stinger('checkpoint');
    } else {
      this.teleport(def.start, def.yaw || 0);
      a.stages = def.stages();
      a.stageIndex = -1;
      this.spawnPatrols(def);
      this.nextStage();
      g.banner.show(def.name.toUpperCase(), def.summary, '', 2.6);
    }
    this.updateMapMarkers();
  }

  teleport(pos, yaw) {
    const g = this.game;
    g.player.reset({ x: pos.x, y: this.groundY(pos) + 0.7, z: pos.z }, yaw);
    g.playerInterp.snap();
    g.cameraCtl.initialized = false;
  }

  spawnPatrols(def) {
    const g = this.game;
    const pts = [...(def.patrols || [])];
    if (def.canyonPatrols) {
      const up = g.world.gen.canyon.up;
      for (const f of def.canyonPatrols) pts.push(up[Math.floor(f * (up.length - 1))]);
    }
    for (const p of pts) {
      const r = g.world.nearestRoad(p, null);
      g.police.spawnUnit('cruiser', { x: r.position.x, y: r.position.y + 0.8, z: r.position.z }, r.yaw, 'patrol');
    }
  }

  nextStage() {
    const a = this.active;
    if (a.stage && a.stage.exit) a.stage.exit(a.ctx);
    a.stageIndex++;
    a.stage = a.stages[a.stageIndex] || null;
    a.count = null;
    a.list = null;
    a.note = null;
    if (a.stage) a.stage.enter(a.ctx);
  }

  makeContext(a) {
    const g = this.game;
    const self = this;
    return {
      game: g,
      player: g.player,
      heat: g.heat,
      world: g.world,
      jumps: this.jumps,
      groundY: (p) => self.groundY(p),
      target(pos, { color = 0xffd23f, kind = 'column', next = null } = {}) {
        if (a.target) a.target.remove();
        if (a.nextMark) a.nextMark.remove();
        a.nextMark = null;
        const p = pos.clone();
        p.y = self.groundY(p);
        const dir = next ? next.clone().sub(p) : null;
        a.target = self.markers.add({ kind, pos: p, dir, color });
        if (next) {
          const n = next.clone();
          n.y = self.groundY(n);
          a.nextMark = self.markers.add({ kind: 'column', pos: n, color, scale: 0.35 });
        }
        g.minimap.setMission({ x: p.x, z: p.z });
      },
      clearTarget() {
        if (a.target) a.target.remove();
        if (a.nextMark) a.nextMark.remove();
        a.target = null;
        a.nextMark = null;
        g.minimap.setMission(null);
      },
      marker(pos, opts) {
        const p = pos.clone();
        p.y = self.groundY(p);
        const m = self.markers.add({ pos: p, ...opts });
        a.marks.push(m);
        return m;
      },
      clearMarkers() {
        for (const m of a.marks) m.remove();
        a.marks.length = 0;
      },
      mapTarget(pos) {
        g.minimap.setMission(pos ? { x: pos.x, z: pos.z } : null);
      },
      objectiveNote(t) {
        a.note = t;
      },
      objectiveCount(i, n) {
        a.count = [i, n];
      },
      objectiveList(list) {
        a.list = list;
      },
      on(name, fn) {
        const off = g.events.on(name, fn);
        a.offs.push(off);
        return off;
      },
      say(text, tag = CONTACT) {
        g.radio.say(text, { priority: true, tag });
      },
      sound(kind) {
        if (g.audio && g.audio.ok) g.audio.sfx.stinger(kind);
      },
      banner(title, sub) {
        g.banner.show(title, sub, 'cool', 1.8);
      },
      addTime(s) {
        if (a.timeLeft != null && s) a.timeLeft += s;
      },
      countdown(t) {
        self.ui.countdown(t);
        if (g.audio && g.audio.ok) g.audio.sfx.stinger(t === 'GO' ? 'win' : 'checkpoint');
      },
      notice(t) {
        g.radio.say(t, { tag: 'RACE', every: 0 });
      },
      showCheckpoint() {},
    };
  }

  updateRaceHud(race) {
    const st = race.def.scoring === 'drift'
      ? [...race.racers].sort((x, y) => race.driftScore(y) - race.driftScore(x))
      : race.standings();
    this.ui.raceHud({
      position: race.positionOf(race.player),
      count: race.racers.length,
      lap: Math.min(race.def.laps, Math.floor(race.player.cp / race.cpPerLap) + 1),
      laps: race.def.laps,
      time: race.time,
      bestLap: race.def.laps > 1 ? race.bestLap : null,
      drift: race.def.scoring === 'drift' ? Math.round(race.player.drift) : 0,
      isDrift: race.def.scoring === 'drift',
      standings: st.map((r) => ({ name: r.name, player: r.isPlayer, extra: race.def.scoring === 'drift' ? Math.round(race.player.finished ? race.driftScore(r) : r.drift).toLocaleString() : r.finished ? fmtTime(r.finishTime) : '' })),
    });
  }

  // ---- results -----------------------------------------------------------------------------
  finish(result) {
    const g = this.game;
    const a = this.active;
    if (!a || a.finished) return;
    a.finished = true;
    const def = a.def;
    const s = a.stats;
    // Bank whatever chain is running so it counts.
    if (result.ok && this.score.chain.active) this.score.bank();
    const style = this.score.total - s.style0;
    const unitsMul = g.settings.get('units') === 'kmh' ? MPS_TO_KMH : MPS_TO_MPH;
    const unitLabel = g.settings.get('units') === 'kmh' ? 'km/h' : 'mph';
    const rows = [];
    let stars = 0;
    let cash = 0;
    let rep = 0;
    const records = [];
    let title;
    let sub = def.name;
    let quote = null;
    s.timeLeft = a.timeLeft;
    const caught = result.reason === 'busted' || result.reason === 'wrecked';
    if (def.kind === 'race' && caught) {
      title = result.reason === 'busted' ? 'BUSTED' : 'PURSUIT TERMINATED';
      sub = `${def.name} · Did not finish`;
      rows.push(['TIME', fmtTime(a.race.time)]);
    } else if (def.kind === 'race') {
      const r = result;
      const pos = r.position || a.race.positionOf(a.race.player);
      stars = pos === 1 ? 3 : pos === 2 ? 2 : pos === 3 ? 1 : 0;
      const ord = ['1ST', '2ND', '3RD', '4TH'][pos - 1] || `${pos}TH`;
      title = pos === 1 ? 'RACE WON' : `FINISHED ${ord}`;
      const share = [1, 0.6, 0.35, 0.1][pos - 1] || 0;
      cash = Math.round(def.reward.cash * share);
      rep = Math.round(def.reward.rep * share);
      rows.push(['POSITION', `${ord} / ${a.race.racers.length}`]);
      rows.push(['TIME', fmtTime(r.time)]);
      if (def.laps > 1) rows.push(['BEST LAP', fmtTime(r.bestLap)]);
      if (def.scoring === 'drift') rows.push(['DRIFT SCORE', (r.drift || 0).toLocaleString()]);
      const rec = this.progress.recordRace(def.id, { time: r.time, lap: r.bestLap, score: def.scoring === 'drift' ? r.drift : null, stars, won: pos === 1 });
      if (rec.time) records.push('NEW BEST TIME');
      if (rec.lap && def.laps > 1) records.push('NEW BEST LAP');
      if (rec.score && def.scoring === 'drift') records.push('NEW BEST DRIFT SCORE');
      if (pos > 3) result = { ...result, ok: false };
    } else if (result.ok) {
      stars = def.stars(s);
      title = 'MISSION COMPLETE';
      const first = !(this.progress.data.missions[def.id] && this.progress.data.missions[def.id].done);
      cash = Math.round(def.reward.cash * (0.6 + 0.2 * stars));
      rep = Math.round(def.reward.rep * (first ? 1 : 0.35));
      this.progress.recordMission(def.id, stars, s.time);
      quote = def.outro;
    } else {
      title = result.reason === 'busted' ? 'BUSTED' : result.reason === 'wrecked' ? 'PURSUIT TERMINATED' : 'MISSION FAILED';
      sub = `${def.name} · ${caught ? 'Failed' : result.reason}`;
    }
    if (def.kind !== 'race') {
      rows.push(['TIME', fmtClock(s.time)]);
      if (a.timeLeft != null && result.ok) rows.push(['TIME LEFT', `${a.timeLeft.toFixed(1)} s`]);
    }
    rows.push(['TOP SPEED', `${Math.round(s.topSpeed * unitsMul)} ${unitLabel}`]);
    rows.push(['TAKEDOWNS', String(s.takedowns)]);
    rows.push(['BEST COMBO', s.bestCombo.toLocaleString()]);
    rows.push(['STYLE SCORE', style.toLocaleString()]);
    const unlocked = cash || rep ? this.progress.reward(cash, rep) : [];
    this.progress.stat('styleTotal', style);
    this.showResults({
      title, sub, fail: !result.ok, stars: result.ok || (def.kind === 'race' && !caught) ? stars : null, rows, records, cash, rep,
      unlocked: unlocked.map((d) => d.name), quote,
    }, { retry: () => this.begin(def), gameOver: caught });
  }

  showResults(r, { retry = null, gameOver = false } = {}) {
    const g = this.game;
    g.state = 'results';
    g.hud.prompt(null);
    g.banner.hide();
    g.hud.show(false);
    this.score.clearPopups();
    // Success: slow orbit around the car behind the results; failure: hold the frozen frame.
    if (!r.fail) g.cameraCtl.playShot({ type: 'orbit', radius: 7.5, height: 2.4, speed: 0.22, startAngle: g.player.yaw + 2.4, fov: 50, duration: 1e6 });
    this.ui.raceHud(null);
    this.ui.objective(null);
    this.ui.results(r, {
      primary: () => {
        this.ui.close();
        this.cleanup();
        g.cameraCtl.clearShot();
        g.cameraCtl.initialized = false;
        g.hud.show(true);
        g.state = 'playing';
        if (gameOver) g.restoreAfterGameOver();
        g.audio && g.audio.ui('click');
      },
      retry: retry
        ? () => {
            g.audio && g.audio.ui('click');
            retry();
          }
        : null,
    });
    if (r.unlocked && r.unlocked.length) this.buildStartMarkers();
  }

  // Bust / wreck: an activity fails; in free roam a pursuit summary is shown.
  onGameOver(reason) {
    const g = this.game;
    if (this.active && !this.active.finished) {
      this.finish({ ok: false, reason });
      return true;
    }
    const p = this.pursuit || { time: 0, topSpeed: g.player.speed, takedowns: 0, style0: this.score.total, bestCombo: 0, maxHeat: g.heat.level };
    this.pursuit = null;
    const unitsMul = g.settings.get('units') === 'kmh' ? MPS_TO_KMH : MPS_TO_MPH;
    const unitLabel = g.settings.get('units') === 'kmh' ? 'km/h' : 'mph';
    const fine = reason === 'busted' ? Math.min(2000, Math.round(this.progress.cash * 0.1)) : Math.min(1500, Math.round(this.progress.cash * 0.05));
    this.progress.data.cash -= fine;
    this.progress.stat('busts', reason === 'busted' ? 1 : 0);
    this.progress.save();
    this.showResults({
      title: reason === 'busted' ? 'BUSTED' : 'PURSUIT TERMINATED',
      sub: reason === 'busted' ? 'Suspect in custody' : 'Chassis destroyed',
      fail: true,
      stars: null,
      rows: [
        ['PURSUIT TIME', fmtClock(p.time)],
        ['MAX HEAT', '★'.repeat(Math.max(1, p.maxHeat))],
        ['TOP SPEED', `${Math.round(p.topSpeed * unitsMul)} ${unitLabel}`],
        ['TAKEDOWNS', String(p.takedowns)],
        ['BEST COMBO', p.bestCombo.toLocaleString()],
        ['STYLE SCORE', (this.score.total - p.style0).toLocaleString()],
        [reason === 'busted' ? 'IMPOUND FEE' : 'REPAIRS', `$${fine.toLocaleString()}`],
      ],
      cash: -fine,
      rep: 0,
    }, { gameOver: true });
    return true;
  }

  cleanup() {
    const g = this.game;
    const a = this.active;
    if (a) {
      if (a.stage && a.stage.exit) a.stage.exit(a.ctx);
      for (const off of a.offs) off();
      for (const m of a.marks) m.remove();
      if (a.target) a.target.remove();
      if (a.nextMark) a.nextMark.remove();
      if (a.gate) a.gate.remove();
      if (a.nextGate) a.nextGate.remove();
      if (a.race) a.race.cleanup();
      g.police.clearAll();
      g.heat.locked = 0;
      g.heat.clear('reset');
      g.police.typeOverride = null;
    }
    this.active = null;
    g.inputLock = false;
    g.minimap.setMission(null);
    this.ui.objective(null);
    this.ui.raceHud(null);
    for (const m of this.startMarkers.values()) m.setVisible(true);
    this.updateMapMarkers();
  }

  // Abort from the pause menu.
  quit() {
    if (!this.active) return;
    this.cleanup();
  }

  restart() {
    if (!this.active) return;
    const def = this.active.def;
    this.begin(def);
  }
}
