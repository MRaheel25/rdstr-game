// Tiny synchronous event bus used to decouple systems (HUD, audio, scoring, VFX).
export class Events {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.map.get(name).delete(fn);
  }
  emit(name, data) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of set) fn(data);
  }
}

export const events = new Events();
