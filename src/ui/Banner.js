// Big centred banners: BUSTED, PURSUIT TERMINATED, EVADED, mission text.
export class Banner {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'banner hidden';
    this.el.innerHTML = '<div class="banner-title"></div><div class="banner-sub"></div>';
    document.getElementById('hud').appendChild(this.el);
    this.timer = 0;
  }

  show(title, sub = '', cls = '', duration = 2.2) {
    this.el.className = `banner ${cls}`;
    this.el.querySelector('.banner-title').textContent = title;
    this.el.querySelector('.banner-sub').textContent = sub;
    this.timer = duration;
    // Restart the CSS animation.
    void this.el.offsetWidth;
    this.el.classList.add('anim');
  }

  update(realDt) {
    if (this.timer <= 0) return;
    this.timer -= realDt;
    if (this.timer <= 0) this.el.classList.add('hidden');
  }
}
