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

// Non-null reference captured after the null-guard above.
const cvs: HTMLCanvasElement = canvas;

let _crashed = false;

function loop(timestamp: number): void {
  if (_crashed) return;
  try {
    game.loop(timestamp);
  } catch (err) {
    _crashed = true;
    console.error('[Antigravity] Unhandled exception in game loop:', err);
    // Draw a minimal error overlay so the screen doesn't go blank.
    const ctx = cvs.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 22px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('RUNTIME ERROR — see browser console', cvs.width / 2, cvs.height / 2 - 16);
      ctx.fillStyle = '#aaa';
      ctx.font = '14px Courier New';
      const msg = err instanceof Error ? err.message : String(err);
      ctx.fillText(msg.slice(0, 120), cvs.width / 2, cvs.height / 2 + 16);
      ctx.fillStyle = '#666';
      ctx.font = '12px Courier New';
      ctx.fillText('Reload the page to restart.', cvs.width / 2, cvs.height / 2 + 42);
    }
    return;
  }
  requestAnimationFrame(loop);
}

// Kick off the loop
requestAnimationFrame(loop);

// ─── Prevent context-menu on right-click (common for game canvases) ───────────

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
