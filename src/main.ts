/**
 * main.ts — Application entry point.
 *
 * Responsibilities:
 *   1. Get the canvas element from the DOM
 *   2. Instantiate the Game
 *   3. Start the requestAnimationFrame loop
 *   4. Handle resize events
 *
 * Everything else is handled by Game.ts and its sub-systems.
 */

import { Game } from './Game';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Could not find <canvas id="game"> element in the DOM.');
}

// Size canvas to fill the viewport immediately
canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;

// Instantiate and initialise the game
const game = new Game(canvas);
game.init();

// ─── Game Loop ────────────────────────────────────────────────────────────────

/**
 * The rAF callback.
 * We capture `game` in a closure so TypeScript knows it is never null here.
 */
function loop(timestamp: number): void {
  game.loop(timestamp);
  requestAnimationFrame(loop);
}

// Kick off the loop
requestAnimationFrame(loop);

// ─── Prevent context-menu on right-click (common for game canvases) ───────────

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
