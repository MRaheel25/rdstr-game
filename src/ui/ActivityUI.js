// DOM for activities: briefing cards, the cinematic results screen, race HUD (position, lap,
// times, standings), countdown and the objective line. Keyboard (Enter / Esc / R) and gamepad
// (A / B / Y) drive the buttons.
const $ = (s) => document.querySelector(s);

const TYPE_LABEL = {
  getaway: 'GETAWAY', datarun: 'DATA RUN', bounty: 'BOUNTY', skygap: 'SKY GAP', ghost: 'GHOST PROTOCOL', race: 'STREET RACE',
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function stars(n, max = 3) {
  let s = '';
  for (let i = 0; i < max; i++) s += `<span class="${i < n ? 'on' : ''}">★</span>`;
  return s;
}

export class ActivityUI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui-root');
    this.overlay = null;
    this.handlers = null;
    this.objEl = $('#objective');
    this.objText = this.objEl.querySelector('.obj-text');
    this.objTimer = this.objEl.querySelector('.obj-timer');
    this.race = document.createElement('div');
    this.race.id = 'race-hud';
    this.race.className = 'hidden';
    $('#hud').appendChild(this.race);
    this.count = document.createElement('div');
    this.count.id = 'countdown';
    $('#hud').appendChild(this.count);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get open() {
    return !!this.overlay;
  }

  onKey(e) {
    if (!this.overlay || !this.handlers) return;
    const h = this.handlers;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') h.primary && h.primary();
    else if (e.code === 'Escape') h.cancel && h.cancel();
    else if (e.code === 'KeyR') h.retry && h.retry();
    else return;
    e.preventDefault();
    // Consumed here: don't let the same key also reach the game (Esc would open the pause menu).
    this.game.input.pressedKeys.delete(e.code);
  }

  // Gamepad: A = primary, B = cancel, Y = retry.
  pollPad(input) {
    if (!this.overlay || !this.handlers || !input.pad) return;
    const p = input.pad;
    const b = (i) => p.buttons[i] && p.buttons[i].pressed;
    const now = { a: b(0), b: b(1), y: b(3) };
    const prev = this.padPrev || { a: true, b: true, y: true };
    this.padPrev = now;
    const h = this.handlers;
    if (now.a && !prev.a && h.primary) h.primary();
    else if (now.b && !prev.b && h.cancel) h.cancel();
    else if (now.y && !prev.y && h.retry) h.retry();
  }

  close() {
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
    this.handlers = null;
    this.padPrev = null;
  }

  show(html, cls, handlers) {
    this.close();
    const el = document.createElement('div');
    el.className = `overlay ${cls}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.overlay = el;
    this.handlers = handlers;
    el.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const fn = { primary: handlers.primary, cancel: handlers.cancel, retry: handlers.retry }[b.dataset.act];
        if (fn) fn();
      });
      b.addEventListener('mouseenter', () => this.game.audio && this.game.audio.ui('hover'));
    });
    requestAnimationFrame(() => el.classList.add('in'));
  }

  briefing(def, { kind, record, districtName, locked }, handlers) {
    const type = kind === 'race' ? 'STREET RACE' : `MISSION · ${TYPE_LABEL[def.type]}`;
    let best = '';
    if (record) {
      if (kind === 'race') best = `Best: ${stars(record.stars)} ${record.bestTime != null ? fmtTime(record.bestTime) : ''}${record.bestScore != null && def.scoring === 'drift' ? ` · ${record.bestScore.toLocaleString()} pts` : ''}`;
      else if (record.done) best = `Best: ${stars(record.stars)}`;
    }
    const starRows = def.starText
      ? def.starText.map((t, i) => `<div><em>${stars(i + 1)}</em> <span class="t">${esc(t)}</span></div>`).join('')
      : kind === 'race'
        ? `<div><em>${stars(3)}</em> <span class="t">Win</span></div><div><em>${stars(2)}</em> <span class="t">2nd place</span></div><div><em>${stars(1)}</em> <span class="t">3rd place</span></div>`
        : '';
    const summary = kind === 'race'
      ? `${def.laps > 1 ? `${def.laps} laps` : 'Point to point'} · 3 rivals · ${def.scoring === 'drift' ? 'scored on drift' : 'fastest wins'}`
      : def.summary;
    const html = `
      <div class="card">
        <div class="card-type">${type}</div>
        <div class="card-title">${esc(def.name.toUpperCase())}</div>
        <div class="card-district">${esc(districtName)}</div>
        <div class="card-msg">${kind === 'race' ? '' : '<span class="from">CIPHER</span>'}${esc(def.brief)}</div>
        <div class="card-obj">${esc(summary)}</div>
        <div class="card-stars">${starRows}</div>
        <div class="card-reward">$${def.reward.cash.toLocaleString()} · ${def.reward.rep} REP</div>
        <div class="card-best">${best}</div>
        ${locked ? `<div class="card-locked">${esc(locked)}</div>` : ''}
        <div class="card-buttons">
          ${locked ? '' : '<button data-act="primary" class="primary">START <kbd>ENTER</kbd></button>'}
          <button data-act="cancel">CANCEL <kbd>ESC</kbd></button>
        </div>
      </div>`;
    this.show(html, 'brief', handlers);
  }

  // r: { title, sub, fail, stars, rows: [[label, value]], records: [], cash, rep, unlocked: [] }
  results(r, handlers) {
    const rows = r.rows.map(([k, v]) => `<div class="res-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const rec = (r.records || []).map((t) => `<div class="res-record">${esc(t)}</div>`).join('');
    const unl = (r.unlocked || []).map((t) => `<div class="res-unlock">UNLOCKED · ${esc(t)}</div>`).join('');
    const html = `
      <div class="res-wrap">
        <div class="res-title" data-text="${esc(r.title)}">${esc(r.title)}</div>
        <div class="res-sub">${esc(r.sub || '')}</div>
        ${r.stars != null ? `<div class="res-stars">${stars(r.stars)}</div>` : ''}
        <div class="res-grid">${rows}</div>
        <div class="res-earn">${r.cash === 0 && !r.rep ? 'NO PAYOUT' : `${r.cash >= 0 ? '+' : '−'}$${Math.abs(r.cash).toLocaleString()}`} <span>${r.rep > 0 ? `+${r.rep} REP` : ''}</span></div>
        ${rec}${unl}
        ${r.quote ? `<div class="res-quote"><span class="from">CIPHER</span>${esc(r.quote)}</div>` : ''}
        <div class="card-buttons">
          <button data-act="primary" class="primary">CONTINUE <kbd>ENTER</kbd></button>
          ${handlers.retry ? '<button data-act="retry">RETRY <kbd>R</kbd></button>' : ''}
        </div>
      </div>`;
    this.show(html, `results ${r.fail ? 'fail' : 'win'}`, handlers);
  }

  // Objective line at the top centre.
  objective(text, timer = null, urgent = false) {
    if (!text) {
      this.objEl.classList.add('hidden');
      return;
    }
    this.objEl.classList.remove('hidden');
    if (this.objText.innerHTML !== text) this.objText.innerHTML = text;
    const t = timer == null ? '' : fmtClock(timer);
    if (this.objTimer.textContent !== t) this.objTimer.textContent = t;
    this.objTimer.classList.toggle('urgent', urgent);
  }

  countdown(text) {
    this.count.textContent = text;
    this.count.classList.remove('go', 'anim');
    if (text === 'GO') this.count.classList.add('go');
    void this.count.offsetWidth;
    this.count.classList.add('anim');
  }

  raceHud(info) {
    if (!info) {
      this.race.classList.add('hidden');
      return;
    }
    this.race.classList.remove('hidden');
    const list = info.standings.map((s, i) => `<div class="${s.player ? 'me' : ''}"><span>${i + 1}</span>${esc(s.name)}<i>${esc(s.extra || '')}</i></div>`).join('');
    const html = `
      <div class="rh-pos"><b>${info.position}</b><span>/${info.count}</span></div>
      <div class="rh-row"><span>${info.isDrift ? 'DRIFT' : 'LAP'}</span><b>${info.isDrift ? info.drift.toLocaleString() : `${info.lap}/${info.laps}`}</b></div>
      <div class="rh-row"><span>TIME</span><b>${fmtTime(info.time)}</b></div>
      ${info.laps > 1 ? `<div class="rh-row"><span>BEST LAP</span><b>${fmtTime(info.bestLap)}</b></div>` : ''}
      <div class="rh-list">${list}</div>`;
    if (html !== this.lastRace) {
      this.race.innerHTML = html;
      this.lastRace = html;
    }
  }
}

export function fmtTime(t) {
  if (t == null) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function fmtClock(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
