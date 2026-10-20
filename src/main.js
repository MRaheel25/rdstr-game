// Entry point.
import { Game } from './core/Game.js';

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  const m = document.querySelector('.load-msg');
  if (m) m.textContent = `Failed to start: ${e.message}`;
});
