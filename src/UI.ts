/**
 * UI.ts — All non-flight UI screens: Main Menu, Options, VAB, Staging.
 *
 * Each screen is a pure canvas draw + mouse-hit-test pair.
 * No DOM elements — everything lives on the canvas for portability.
 *
 * Screens handled here:
 *   • Main Menu  — title, Start / Options / Exit
 *   • Options    — placeholder sliders + Back
 *   • VAB        — part palette (left) + build area (right) + stats bar
 *   • Staging    — stage columns + part chips + Confirm/Back
 */

import { THEME, PartType } from './types';
import { PART_CATALOGUE, VAB_PALETTE, isEnginePart, isDecouplerPart } from './Part';
import { Rocket } from './Rocket';
import { Renderer } from './Renderer';

// ─── Button Helper ────────────────────────────────────────────────────────────

export interface Button {
  x: number; y: number; w: number; h: number;
  label: string;
  action: () => void;
  /** optional: highlight this button */
  accent?: boolean;
}

function drawButton(ctx: CanvasRenderingContext2D, btn: Button, hover: boolean): void {
  const r = 6;
  const { x, y, w, h, label, accent } = btn;

  // Background
  ctx.fillStyle = hover
    ? (accent ? 'rgba(0,180,220,0.35)' : 'rgba(30,60,100,0.7)')
    : (accent ? 'rgba(0,120,160,0.25)' : 'rgba(10,20,40,0.8)');
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  // Border
  ctx.strokeStyle = hover
    ? THEME.accent
    : (accent ? THEME.accentDim : THEME.panelBorder);
  ctx.lineWidth = hover ? 1.5 : 1;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();

  // Label
  ctx.fillStyle = hover ? THEME.accent : THEME.text;
  ctx.font = `${accent ? 'bold ' : ''}13px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function isHit(btn: Button, mx: number, my: number): boolean {
  return mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
}

// ─── Animated Particle Background ─────────────────────────────────────────────

interface Particle { x: number; y: number; vx: number; vy: number; r: number; alpha: number }

function makeParticles(W: number, H: number, n: number): Particle[] {
  return Array.from({ length: n }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.2,
    vy: -Math.random() * 0.4 - 0.1,
    r: Math.random() * 1.2 + 0.3,
    alpha: Math.random() * 0.6 + 0.2,
  }));
}

// ─── UI Manager ───────────────────────────────────────────────────────────────

export class UI {
  private ctx: CanvasRenderingContext2D;
  private W: number;
  private H: number;
  private renderer: Renderer;

  /** Tracks mouse position for button hover */
  mouseX = 0;
  mouseY = 0;

  /** Floating menu particles */
  private particles: Particle[];

  /** VAB: currently hovered palette part */
  private hoveredPaletteIdx = -1;

  /** VAB: screen bounds of each rendered rocket part */
  private vabPartBounds: Array<{id: string, x: number, y: number, w: number, h: number}> = [];

  // ── VAB ghost / drag state ─────────────────────────────────────────────────
  /** Part type currently being dragged (null = no ghost) */
  vabGhostType: PartType | null = null;
  /** Stage index carried with the ghost so re-placing preserves staging */
  private vabGhostStageIndex = -1;
  /** Insertion slot the ghost will snap to (0 = bottom of stack) */
  private vabSnapSlot = 0;
  /** Screen Y of the snap insertion line */
  private vabSnapLineY = -1;
  /** Build area geometry (set during renderVAB, read in mouse handlers) */
  private vabBottomY   = 0;
  private vabBuildX    = 0;
  /** Y coordinate of each insertion gap: index i = slot i */
  private vabGapYs: number[] = [];

  // ── Staging ────────────────────────────────────────────────────────────────
  /** Stage badge hit circles from the last renderStaging call */
  private stagingBadgeBounds: Array<{partId: string, x: number, y: number, r: number}> = [];

  constructor(ctx: CanvasRenderingContext2D, renderer: Renderer) {
    this.ctx = ctx;
    this.renderer = renderer;
    this.W = ctx.canvas.width;
    this.H = ctx.canvas.height;
    this.particles = makeParticles(this.W, this.H, 80);
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    this.particles = makeParticles(w, h, 80);
  }

  // ─── Main Menu ─────────────────────────────────────────────────────────────

  renderMainMenu(time: number, onStart: () => void, onOptions: () => void, onExit: () => void): void {
    const ctx = this.ctx;
    const { W, H } = this;

    // Deep-space background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, W, H);

    // Starfield
    this._drawMenuStars(time);

    // Animated particles (rocket exhaust feel)
    this._updateParticles();
    this._drawParticles();

    // Title glow
    const titleY = H * 0.30;
    ctx.save();
    ctx.shadowColor = THEME.accent;
    ctx.shadowBlur = 40;
    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${Math.round(W * 0.07)}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText('ANTIGRAVITY', W / 2, titleY);
    ctx.restore();

    // Subtitle
    ctx.fillStyle = THEME.textDim;
    ctx.font = `${Math.round(W * 0.018)}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText('A Space Exploration Simulator', W / 2, titleY + 36);

    // Version tag
    ctx.fillStyle = 'rgba(100,140,180,0.5)';
    ctx.font = '11px Courier New';
    ctx.fillText('v0.1.0', W / 2, titleY + 58);

    // Buttons
    const bw = 220, bh = 44;
    const bx = W / 2 - bw / 2;
    const gap = 16;
    const by0 = H * 0.50;

    const buttons: Button[] = [
      { x: bx, y: by0,            w: bw, h: bh, label: '▶  START GAME',  action: onStart,   accent: true },
      { x: bx, y: by0 + bh + gap, w: bw, h: bh, label: '⚙  OPTIONS',     action: onOptions },
      { x: bx, y: by0 + (bh + gap) * 2, w: bw, h: bh, label: '✕  EXIT',  action: onExit },
    ];

    for (const btn of buttons) {
      drawButton(ctx, btn, isHit(btn, this.mouseX, this.mouseY));
    }

    // Earth hint at bottom
    const earthY = H - 80;
    const earthR = 60;
    const earthGrad = ctx.createRadialGradient(W / 2, earthY + earthR, 0, W / 2, earthY + earthR, earthR);
    earthGrad.addColorStop(0, '#4a9eff');
    earthGrad.addColorStop(0.5, '#2266cc');
    earthGrad.addColorStop(1, '#0d2244');
    ctx.beginPath();
    ctx.arc(W / 2, earthY + earthR, earthR, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad;
    ctx.fill();

    // Atmosphere arc
    ctx.beginPath();
    ctx.arc(W / 2, earthY + earthR, earthR + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80,160,255,0.3)';
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  /** Handle click on main menu. Returns true if a button was hit. */
  handleMainMenuClick(mx: number, my: number, onStart: () => void, onOptions: () => void, onExit: () => void): boolean {
    const { W, H } = this;
    const bw = 220, bh = 44;
    const bx = W / 2 - bw / 2;
    const gap = 16;
    const by0 = H * 0.50;

    const buttons: Button[] = [
      { x: bx, y: by0,            w: bw, h: bh, label: '▶  START GAME',  action: onStart,   accent: true },
      { x: bx, y: by0 + bh + gap, w: bw, h: bh, label: '⚙  OPTIONS',     action: onOptions },
      { x: bx, y: by0 + (bh + gap) * 2, w: bw, h: bh, label: '✕  EXIT', action: onExit },
    ];

    for (const btn of buttons) {
      if (isHit(btn, mx, my)) { btn.action(); return true; }
    }
    return false;
  }

  // ─── Options Screen ────────────────────────────────────────────────────────

  renderOptions(onBack: () => void): void {
    const ctx = this.ctx;
    const { W, H } = this;

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, W, H);
    this._drawMenuStars(0);

    // Panel
    const pw = 480, ph = 340;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    ctx.fillStyle = 'rgba(10,15,25,0.92)';
    roundRect(ctx, px, py, pw, ph, 10);
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, pw, ph, 10);
    ctx.stroke();

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 22px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('OPTIONS', W / 2, py + 40);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '13px Courier New';
    ctx.textAlign = 'left';

    const options = [
      { label: 'Master Volume',    value: '100%' },
      { label: 'Graphics Quality', value: 'High'  },
      { label: 'Show Trajectory',  value: 'On'    },
      { label: 'Physics Steps/s',  value: '60'    },
    ];

    options.forEach((opt, i) => {
      const oy = py + 80 + i * 48;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(opt.label, px + 30, oy);

      // Fake slider track
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, px + 220, oy - 14, 180, 20, 4);
      ctx.fill();
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, px + 220, oy - 14, 180, 20, 4);
      ctx.stroke();

      ctx.fillStyle = THEME.accent;
      ctx.font = '12px Courier New';
      ctx.textAlign = 'right';
      ctx.fillText(opt.value, px + pw - 30, oy);
      ctx.textAlign = 'left';
      ctx.font = '13px Courier New';
    });

    ctx.fillStyle = 'rgba(100,140,180,0.5)';
    ctx.font = '11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('(Options are cosmetic stubs — full settings in a future update)', W / 2, py + ph - 50);

    // Back button
    const backBtn: Button = { x: W / 2 - 90, y: py + ph - 58, w: 180, h: 36, label: '← BACK', action: onBack };
    drawButton(ctx, backBtn, isHit(backBtn, this.mouseX, this.mouseY));
  }

  handleOptionsClick(mx: number, my: number, onBack: () => void): boolean {
    const { H } = this;
    const ph = 340;
    const py = (H - ph) / 2;
    const backBtn: Button = { x: this.W / 2 - 90, y: py + ph - 58, w: 180, h: 36, label: '← BACK', action: onBack };
    if (isHit(backBtn, mx, my)) { onBack(); return true; }
    return false;
  }

  // ─── VAB Screen ────────────────────────────────────────────────────────────

  /** Width of the parts palette panel on the left */
  readonly VAB_PALETTE_W = 200;

  renderVAB(rocket: Rocket, onLaunch: () => void, onStaging: () => void, onBack: () => void): void {
    const ctx  = this.ctx;
    const { W, H } = this;

    // Background
    ctx.fillStyle = THEME.panelBg;
    ctx.fillRect(0, 0, W, H);

    // ── Left palette panel ─────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(8,12,20,0.95)';
    ctx.fillRect(0, 0, this.VAB_PALETTE_W, H);
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.VAB_PALETTE_W, 0);
    ctx.lineTo(this.VAB_PALETTE_W, H);
    ctx.stroke();

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('PARTS', this.VAB_PALETTE_W / 2, 28);

    const cardH = Math.min(62, (H - 60) / VAB_PALETTE.length);
    VAB_PALETTE.forEach((type, i) => {
      const def = PART_CATALOGUE[type];
      const cy = 42 + i * (cardH + 4);
      const hovered = this.hoveredPaletteIdx === i;
      const isGhost = this.vabGhostType === type;

      ctx.fillStyle = isGhost ? 'rgba(0,180,220,0.30)' : hovered ? 'rgba(0,120,160,0.35)' : 'rgba(15,25,40,0.8)';
      roundRect(ctx, 8, cy, this.VAB_PALETTE_W - 16, cardH, 5);
      ctx.fill();
      ctx.strokeStyle = isGhost ? THEME.accent : hovered ? THEME.accent : THEME.panelBorder;
      ctx.lineWidth = isGhost ? 1.5 : 1;
      roundRect(ctx, 8, cy, this.VAB_PALETTE_W - 16, cardH, 5);
      ctx.stroke();

      const swH = Math.min(42, cardH - 8);
      ctx.fillStyle = def.color;
      roundRect(ctx, 14, cy + (cardH - swH) / 2, 20, swH, 3);
      ctx.fill();

      ctx.fillStyle = hovered || isGhost ? THEME.accent : THEME.text;
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(def.name.length > 16 ? def.name.slice(0, 16) + '…' : def.name, 40, cy + cardH * 0.38);

      ctx.fillStyle = THEME.textDim;
      ctx.font = '9px Courier New';
      ctx.fillText(`${(def.dryMass / 1000).toFixed(1)}t`, 40, cy + cardH * 0.60);
      if (def.maxThrust > 0) ctx.fillText(`${(def.maxThrust / 1000).toFixed(0)}kN`, 76, cy + cardH * 0.60);
      if (def.maxFuelMass > 0) ctx.fillText(`⛽${(def.maxFuelMass / 1000).toFixed(1)}t`, 40, cy + cardH * 0.80);
      if (def.ignoreThrottle) {
        ctx.fillStyle = '#cc8822';
        ctx.fillText('SOLID', 76, cy + cardH * 0.80);
      }
    });

    // Palette hint
    ctx.fillStyle = this.vabGhostType !== null ? THEME.accent : THEME.textDim;
    ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(
      this.vabGhostType !== null ? 'Click build area to place' : 'Click to grab a part',
      this.VAB_PALETTE_W / 2, H - 16,
    );

    // ── Build area ─────────────────────────────────────────────────────────
    const buildX  = this.VAB_PALETTE_W;
    const buildW  = W - buildX - 196;
    const bottomY = H - 80;

    // Store geometry for mouse handlers
    this.vabBuildX  = buildX;
    this.vabBottomY = bottomY;

    // Launchpad line
    ctx.strokeStyle = 'rgba(100,120,150,0.3)';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(buildX, bottomY);
    ctx.lineTo(buildX + buildW, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('LAUNCHPAD', buildX + buildW / 2, bottomY + 16);

    // Rocket preview
    if (rocket.parts.length > 0) {
      this.vabPartBounds = this.renderer.renderVABRocket(rocket, buildX + buildW / 2, bottomY, true);
    } else {
      this.vabPartBounds = [];
      ctx.fillStyle = THEME.textDim;
      ctx.font = '13px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('← Click a part to begin building', buildX + buildW / 2, H / 2);
    }

    // Rebuild gap Y array for snap calculations
    this.vabGapYs = [bottomY];
    for (const b of this.vabPartBounds) this.vabGapYs.push(b.y);

    // Snap insertion line
    if (this.vabGhostType !== null && this.vabGapYs.length > 0) {
      const snapY = this.vabSnapLineY >= 0 ? this.vabSnapLineY : bottomY;
      ctx.save();
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 2;
      ctx.shadowColor = THEME.accent;
      ctx.shadowBlur = 6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(buildX + 6, snapY);
      ctx.lineTo(buildX + buildW - 6, snapY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Ghost rendered at snap line position
      this.renderer.renderVABGhost(this.vabGhostType, buildX + buildW / 2, snapY);
    }

    // Hint
    if (rocket.parts.length > 0 && this.vabGhostType === null) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '9px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('Click part to pick up  •  Right-click to delete', buildX + buildW / 2, bottomY + 32);
    }

    // ── Right info panel ───────────────────────────────────────────────────
    const infoX = W - 196;
    ctx.fillStyle = 'rgba(8,12,20,0.95)';
    ctx.fillRect(infoX, 0, 196, H);
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(infoX, 0);
    ctx.lineTo(infoX, H);
    ctx.stroke();

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('VEHICLE STATS', infoX + 98, 28);

    const allEngineThrust = rocket.parts
      .filter(p => isEnginePart(p.def.type))
      .reduce((s, p) => s + p.def.maxThrust, 0);
    const stats: [string, string][] = [
      ['Parts',    `${rocket.parts.length}`],
      ['Dry Mass', `${(rocket.parts.reduce((s, p) => s + p.def.dryMass, 0) / 1000).toFixed(2)} t`],
      ['Wet Mass', `${(rocket.getTotalMass() / 1000).toFixed(2)} t`],
      ['Fuel',     `${(rocket.totalFuelCapacity / 1000).toFixed(1)} t`],
      ['Thrust',   `${(allEngineThrust / 1000).toFixed(0)} kN`],
      ['ΔV',       `${rocket.getDeltaV().toFixed(0)} m/s`],
    ];

    stats.forEach(([k, v], i) => {
      const ry = 55 + i * 28;
      ctx.fillStyle = THEME.textDim;
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(k, infoX + 12, ry);
      ctx.fillStyle = THEME.text;
      ctx.textAlign = 'right';
      ctx.fillText(v, infoX + 184, ry);
    });

    const twr = rocket.getTotalMass() > 0 ? allEngineThrust / (rocket.getTotalMass() * 9.81) : 0;
    const twrY = 55 + stats.length * 28;
    ctx.fillStyle = THEME.textDim;
    ctx.font = '10px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('TWR', infoX + 12, twrY);
    ctx.fillStyle = twr > 1.2 ? THEME.success : twr > 1.0 ? THEME.warning : THEME.danger;
    ctx.textAlign = 'right';
    ctx.fillText(twr.toFixed(2), infoX + 184, twrY);

    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(infoX + 10, H - 170);
    ctx.lineTo(infoX + 186, H - 170);
    ctx.stroke();

    const bw = 170, bh = 36, bx2 = infoX + 13;
    const launchBtn:  Button = { x: bx2, y: H - 160, w: bw, h: bh, label: '🚀 LAUNCH',   action: onLaunch,  accent: true };
    const stagingBtn: Button = { x: bx2, y: H - 114, w: bw, h: bh, label: '🔢 STAGING',  action: onStaging };
    const backBtn:    Button = { x: bx2, y: H - 68,  w: bw, h: bh, label: '← MAIN MENU', action: onBack };

    drawButton(ctx, launchBtn,  isHit(launchBtn,  this.mouseX, this.mouseY));
    drawButton(ctx, stagingBtn, isHit(stagingBtn, this.mouseX, this.mouseY));
    drawButton(ctx, backBtn,    isHit(backBtn,    this.mouseX, this.mouseY));
  }

  handleVABClick(mx: number, my: number, rocket: Rocket, onLaunch: () => void, onStaging: () => void, onBack: () => void): boolean {
    const { W, H } = this;
    const bw = 170, bh = 36;
    const infoX = W - 196;
    const bx2 = infoX + 13;

    // Right panel buttons always fire (and cancel ghost)
    if (mx >= infoX) {
      const launchBtn:  Button = { x: bx2, y: H - 160, w: bw, h: bh, label: '', action: onLaunch };
      const stagingBtn: Button = { x: bx2, y: H - 114, w: bw, h: bh, label: '', action: onStaging };
      const backBtn:    Button = { x: bx2, y: H - 68,  w: bw, h: bh, label: '', action: onBack };
      for (const btn of [launchBtn, stagingBtn, backBtn]) {
        if (isHit(btn, mx, my)) {
          this.vabGhostType = null;
          btn.action();
          return true;
        }
      }
      return false;
    }

    // Ghost is active
    if (this.vabGhostType !== null) {
      if (mx >= this.vabBuildX && mx < infoX) {
        // Place ghost — preserve its stage assignment
        rocket.insertPartAt(this.vabGhostType, this.vabSnapSlot, this.vabGhostStageIndex);
        this.vabGhostType       = null;
        this.vabGhostStageIndex = -1;
        return true;
      }
      // Click in palette → swap ghost type (reset stage since it's a fresh part)
      if (mx < this.VAB_PALETTE_W) {
        const cardH = Math.min(62, (H - 60) / VAB_PALETTE.length);
        VAB_PALETTE.forEach((type, i) => {
          const cy = 42 + i * (cardH + 4);
          if (my >= cy && my <= cy + cardH) {
            this.vabGhostType       = type;
            this.vabGhostStageIndex = -1;
          }
        });
        return true;
      }
      return false;
    }

    // No ghost — palette click → start ghost
    if (mx < this.VAB_PALETTE_W) {
      const cardH = Math.min(62, (H - 60) / VAB_PALETTE.length);
      VAB_PALETTE.forEach((type, i) => {
        const cy = 42 + i * (cardH + 4);
        if (my >= cy && my <= cy + cardH) {
          this.vabGhostType       = type;
          this.vabGhostStageIndex = -1;
          this.vabSnapSlot        = rocket.parts.length;
          this.vabSnapLineY       = this.vabGapYs[rocket.parts.length] ?? this.vabBottomY;
        }
      });
      return true;
    }

    // No ghost — build area click → pick up clicked part (preserve its stage)
    if (mx >= this.vabBuildX && mx < infoX) {
      for (const bounds of this.vabPartBounds) {
        if (mx >= bounds.x && mx <= bounds.x + bounds.w &&
            my >= bounds.y && my <= bounds.y + bounds.h) {
          const part = rocket.parts.find(p => p.id === bounds.id);
          if (part) {
            this.vabGhostType       = part.def.type;
            this.vabGhostStageIndex = part.stageIndex;   // carry stage assignment
            rocket.removePartById(bounds.id);
          }
          return true;
        }
      }
    }

    return false;
  }

  /** Cancel the active ghost (Escape key or right-click in empty space) */
  cancelVABGhost(): void {
    this.vabGhostType       = null;
    this.vabGhostStageIndex = -1;
  }

  /** Right-click: cancel ghost if active, otherwise delete hovered part */
  handleVABRightClick(mx: number, my: number, rocket: Rocket): void {
    if (this.vabGhostType !== null) {
      this.vabGhostType = null;
      return;
    }
    for (const bounds of this.vabPartBounds) {
      if (mx >= bounds.x && mx <= bounds.x + bounds.w &&
          my >= bounds.y && my <= bounds.y + bounds.h) {
        rocket.removePartById(bounds.id);
        return;
      }
    }
  }

  handleVABMouseMove(mx: number, my: number): void {
    this.mouseX = mx;
    this.mouseY = my;

    // Palette hover
    const cardH = Math.min(62, (this.H - 60) / VAB_PALETTE.length);
    this.hoveredPaletteIdx = -1;
    if (mx < this.VAB_PALETTE_W) {
      VAB_PALETTE.forEach((_, i) => {
        const cy = 42 + i * (cardH + 4);
        if (my >= cy && my <= cy + cardH) this.hoveredPaletteIdx = i;
      });
    }

    // Update snap slot when ghost is active
    if (this.vabGhostType !== null && this.vabGapYs.length > 0) {
      let bestSlot = 0;
      let bestDist = Infinity;
      for (let i = 0; i < this.vabGapYs.length; i++) {
        const d = Math.abs(my - this.vabGapYs[i]);
        if (d < bestDist) { bestDist = d; bestSlot = i; }
      }
      this.vabSnapSlot  = bestSlot;
      this.vabSnapLineY = this.vabGapYs[bestSlot];
    }
  }

  // ─── Staging Screen ────────────────────────────────────────────────────────

  renderStaging(rocket: Rocket, onConfirm: () => void, onBack: () => void): void {
    const ctx = this.ctx;
    const { W, H } = this;

    this.stagingBadgeBounds = [];

    // Background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 22px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('STAGING', W / 2, 36);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px Courier New';
    ctx.fillText('Click a badge to cycle stage (S0 fires first on Space, then S1, S2…)', W / 2, 58);

    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, 70); ctx.lineTo(W - 20, 70); ctx.stroke();

    // ── Left panel: rocket parts list ──────────────────────────────────────
    const leftW = Math.min(360, W * 0.38);

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('ROCKET PARTS  (top → bottom)', 20, 88);

    const visualParts = [...rocket.parts].reverse();   // top of rocket first
    const rowH = Math.min(38, (H - 160) / Math.max(visualParts.length, 1));
    const listStartY = 96;

    const STAGE_COLS = Renderer.STAGE_COLORS;

    visualParts.forEach((part, i) => {
      const ry = listStartY + i * rowH;
      const isInteractive = isEnginePart(part.def.type) || isDecouplerPart(part.def.type);

      // Row background
      ctx.fillStyle = 'rgba(15,25,40,0.7)';
      roundRect(ctx, 15, ry + 2, leftW - 10, rowH - 4, 4);
      ctx.fill();

      // Color swatch
      ctx.fillStyle = part.def.color;
      roundRect(ctx, 20, ry + (rowH - 22) / 2, 18, 22, 2);
      ctx.fill();

      // Name
      ctx.fillStyle = isInteractive ? THEME.text : THEME.textDim;
      ctx.font = `${isInteractive ? '' : ''}10px Courier New`;
      ctx.textAlign = 'left';
      ctx.fillText(part.def.name, 44, ry + rowH / 2 + 4);

      // Stage badge
      const bx = leftW - 14;
      const by2 = ry + rowH / 2;

      if (isInteractive) {
        const si = part.stageIndex;
        const badgeCol = si >= 0 && si < STAGE_COLS.length ? STAGE_COLS[si] : '#444';
        const badgeLabel = si >= 0 ? `S${si}` : '–';
        const hovering = Math.hypot(this.mouseX - bx, this.mouseY - by2) <= 13;

        ctx.beginPath();
        ctx.arc(bx, by2, 13, 0, Math.PI * 2);
        ctx.fillStyle = badgeCol;
        ctx.fill();
        ctx.strokeStyle = hovering ? '#fff' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = hovering ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = si >= 0 ? '#000' : '#bbb';
        ctx.font = 'bold 8px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(badgeLabel, bx, by2 + 3);

        this.stagingBadgeBounds.push({ partId: part.id, x: bx, y: by2, r: 14 });
      } else {
        ctx.fillStyle = '#333';
        ctx.font = '9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('–', bx, by2 + 3);
      }
    });

    // ── Right panel: fire sequence ──────────────────────────────────────────
    const rightX = leftW + 28;
    const rightW = W - rightX - 20;

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('FIRE SEQUENCE  (top fires first)', rightX, 88);

    const sortedStages = [...rocket.stages].sort((a, b) => a.stageIndex - b.stageIndex);
    let seqY = 100;

    if (sortedStages.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '12px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText('No stages assigned.', rightX, seqY + 20);
      ctx.fillText('Click Auto-Stage or click badge buttons on the left.', rightX, seqY + 38);
    } else {
      for (let si = 0; si < sortedStages.length; si++) {
        const stage = sortedStages[si];
        const stageCol = stage.stageIndex < STAGE_COLS.length ? STAGE_COLS[stage.stageIndex] : '#888';
        const parts = stage.partIds.map(id => rocket.parts.find(p => p.id === id)).filter(Boolean) as typeof rocket.parts;

        const fireLabel = stage.stageIndex === 0
          ? 'STAGE 0 — 1st Space press'
          : `STAGE ${stage.stageIndex} — after stage ${stage.stageIndex - 1} burns out`;

        // Stage header bar
        ctx.fillStyle = stageCol + '28';
        roundRect(ctx, rightX, seqY, rightW, 20, 4);
        ctx.fill();
        ctx.strokeStyle = stageCol;
        ctx.lineWidth = 1;
        roundRect(ctx, rightX, seqY, rightW, 20, 4);
        ctx.stroke();
        ctx.fillStyle = stageCol;
        ctx.font = 'bold 10px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(fireLabel, rightX + 10, seqY + 13);
        seqY += 24;

        for (const part of parts) {
          ctx.fillStyle = 'rgba(15,25,40,0.7)';
          roundRect(ctx, rightX + 8, seqY, rightW - 16, 24, 3);
          ctx.fill();
          ctx.fillStyle = part.def.color;
          roundRect(ctx, rightX + 13, seqY + 4, 14, 16, 2);
          ctx.fill();
          ctx.fillStyle = THEME.text;
          ctx.font = '10px Courier New';
          ctx.textAlign = 'left';
          ctx.fillText(part.def.name, rightX + 33, seqY + 15);
          seqY += 28;
        }

        // Arrow between stages
        if (si < sortedStages.length - 1) {
          ctx.fillStyle = THEME.textDim;
          ctx.font = '14px Courier New';
          ctx.textAlign = 'left';
          ctx.fillText('↓ jettison / stage', rightX + 10, seqY + 14);
          seqY += 26;
        }
      }
    }

    // Bottom buttons
    const autoBtn:    Button = { x: 20,       y: H - 52, w: 170, h: 36, label: '⚡ AUTO-STAGE', action: () => rocket.autoStage() };
    const backBtn2:   Button = { x: 210,      y: H - 52, w: 120, h: 36, label: '← BACK',        action: onBack };
    const confirmBtn: Button = { x: W - 200,  y: H - 52, w: 180, h: 36, label: '✔ DONE',         action: onConfirm, accent: true };

    drawButton(ctx, autoBtn,    isHit(autoBtn,    this.mouseX, this.mouseY));
    drawButton(ctx, backBtn2,   isHit(backBtn2,   this.mouseX, this.mouseY));
    drawButton(ctx, confirmBtn, isHit(confirmBtn, this.mouseX, this.mouseY));
  }

  handleStagingClick(mx: number, my: number, rocket: Rocket, onConfirm: () => void, onBack: () => void): boolean {
    const { W, H } = this;

    const autoBtn:    Button = { x: 20,      y: H - 52, w: 170, h: 36, label: '', action: () => rocket.autoStage() };
    const backBtn:    Button = { x: 210,     y: H - 52, w: 120, h: 36, label: '', action: onBack };
    const confirmBtn: Button = { x: W - 200, y: H - 52, w: 180, h: 36, label: '', action: onConfirm };

    for (const btn of [autoBtn, backBtn, confirmBtn]) {
      if (isHit(btn, mx, my)) { btn.action(); return true; }
    }

    // Badge click → cycle stage
    for (const badge of this.stagingBadgeBounds) {
      if (Math.hypot(mx - badge.x, my - badge.y) <= badge.r) {
        rocket.cycleStage(badge.partId);
        return true;
      }
    }

    return false;
  }

  // ─── Pause / Message Overlay ───────────────────────────────────────────────

  renderMessage(title: string, body: string, btnLabel: string, onBtn: () => void): void {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);

    const pw = 440, ph = 200;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    ctx.fillStyle = THEME.panelBg;
    roundRect(ctx, px, py, pw, ph, 10);
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, pw, ph, 10);
    ctx.stroke();

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 18px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, py + 42);

    ctx.fillStyle = THEME.text;
    ctx.font = '13px Courier New';
    ctx.fillText(body, W / 2, py + 80);

    const btn: Button = { x: W / 2 - 80, y: py + 120, w: 160, h: 40, label: btnLabel, action: onBtn };
    drawButton(ctx, btn, isHit(btn, this.mouseX, this.mouseY));
  }

  handleMessageClick(mx: number, my: number, onBtn: () => void): boolean {
    const { W, H } = this;
    const ph = 200;
    const py = (H - ph) / 2;
    const btn: Button = { x: W / 2 - 80, y: py + 120, w: 160, h: 40, label: '', action: onBtn };
    if (isHit(btn, mx, my)) { onBtn(); return true; }
    return false;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private _drawMenuStars(time: number): void {
    const ctx  = this.ctx;
    const { W, H } = this;
    // Use same deterministic star list as Renderer
    for (let i = 0; i < 200; i++) {
      const seed = i * 7 + 13;
      const sx = ((seed * 1664525 + 1013904223) & 0xffffff) % W;
      const sy = ((seed * 22695477 + 1) & 0xffffff) % H;
      const r  = (((seed * 6364136223846793005) & 0xff) / 255) * 1.2 + 0.2;
      const tw = Math.sin(time * 0.8 + i) * 0.15;
      ctx.fillStyle = `rgba(200,220,255,${0.35 + tw})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private _updateParticles(): void {
    const { W, H } = this;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
    }
  }

  private _drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100,180,255,${p.alpha * 0.4})`;
      ctx.fill();
    }
  }
}
