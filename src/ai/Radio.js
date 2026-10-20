// Police radio subtitles at the top of the screen.
const DIRS = ['north', 'east', 'south', 'west'];

export function compass(vx, vz) {
  const a = Math.atan2(vx, -vz); // 0 = north (-z), +pi/2 = east (+x)
  const i = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
  return DIRS[i];
}

export class Radio {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('radio');
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.lastText = '';
    this.cooldowns = new Map();
  }

  // key: rate-limit category (seconds in `every`).
  say(text, { key = null, every = 6, priority = false, tag = 'DISPATCH' } = {}) {
    if (key) {
      const t = this.cooldowns.get(key) || -1e9;
      if (this.game.time - t < every) return;
      this.cooldowns.set(key, this.game.time);
    }
    if (text === this.lastText) return;
    const item = { text, tag };
    if (priority) this.queue.unshift(item);
    else this.queue.push(item);
    if (this.queue.length > 4) this.queue.length = 4;
  }

  update(realDt) {
    if (this.timer > 0) {
      this.timer -= realDt;
      if (this.timer <= 0) this.el.classList.remove('show');
      return;
    }
    if (this.queue.length) {
      const { text, tag } = this.queue.shift();
      this.lastText = text;
      this.el.innerHTML = `<span class="tag ${tag === 'DISPATCH' ? '' : 'contact'}">${tag}</span>${text}`;
      this.el.classList.add('show');
      this.timer = 3.6 + text.length * 0.02;
      this.game.events.emit('radio', { text });
    }
  }
}
