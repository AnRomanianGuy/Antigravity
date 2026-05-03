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
import { PART_CATALOGUE, VAB_PALETTE } from './Part';
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

  /** VAB: screen bounds of each rendered rocket part (for click-to-remove) */
  private vabPartBounds: Array<{id: string, x: number, y: number, w: number, h: number}> = [];

  /** Staging: which stage column is hovered */
  private hoveredStageCol = -1;

  /** Staging: dragged part (id) */
  dragPartId = '';
  dragStageTarget = -1;

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

    // Left palette panel
    ctx.fillStyle = 'rgba(8,12,20,0.95)';
    ctx.fillRect(0, 0, this.VAB_PALETTE_W, H);
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.VAB_PALETTE_W, 0);
    ctx.lineTo(this.VAB_PALETTE_W, H);
    ctx.stroke();

    // Palette title
    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('PARTS', this.VAB_PALETTE_W / 2, 28);

    // Part cards
    VAB_PALETTE.forEach((type, i) => {
      const def = PART_CATALOGUE[type];
      const cy = 55 + i * 70;
      const hovered = this.hoveredPaletteIdx === i;

      ctx.fillStyle = hovered ? 'rgba(0,120,160,0.35)' : 'rgba(15,25,40,0.8)';
      roundRect(ctx, 8, cy, this.VAB_PALETTE_W - 16, 62, 5);
      ctx.fill();
      ctx.strokeStyle = hovered ? THEME.accent : THEME.panelBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, 8, cy, this.VAB_PALETTE_W - 16, 62, 5);
      ctx.stroke();

      // Colour swatch
      ctx.fillStyle = def.color;
      roundRect(ctx, 14, cy + 10, 22, 42, 3);
      ctx.fill();

      // Name + stats
      ctx.fillStyle = hovered ? THEME.accent : THEME.text;
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(def.name.length > 16 ? def.name.slice(0, 16) + '…' : def.name, 42, cy + 22);

      ctx.fillStyle = THEME.textDim;
      ctx.font = '9px Courier New';
      ctx.fillText(`${(def.dryMass / 1000).toFixed(1)}t`, 42, cy + 36);
      if (def.maxThrust > 0) {
        ctx.fillText(`${(def.maxThrust / 1000).toFixed(0)}kN`, 80, cy + 36);
      }
      if (def.maxFuelMass > 0) {
        ctx.fillText(`⛽${(def.maxFuelMass / 1000).toFixed(1)}t`, 42, cy + 48);
      }
    });

    // Click-to-add hint
    ctx.fillStyle = THEME.textDim;
    ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('Click to add to rocket', this.VAB_PALETTE_W / 2, H - 16);

    // ── Build area ──────────────────────────────────────────────────────────
    const buildX = this.VAB_PALETTE_W;
    const buildW = W - buildX - 200;   // leave room for right info panel

    // Launchpad line
    ctx.strokeStyle = 'rgba(100,120,150,0.3)';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(buildX, H - 80);
    ctx.lineTo(buildX + buildW, H - 80);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('LAUNCHPAD', buildX + buildW / 2, H - 64);

    // Rocket preview (draw using Renderer)
    if (rocket.parts.length > 0) {
      this.vabPartBounds = this.renderer.renderVABRocket(rocket, buildX + buildW / 2, H - 80);
    } else {
      this.vabPartBounds = [];
      ctx.fillStyle = THEME.textDim;
      ctx.font = '13px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('← Click a part to begin building', buildX + buildW / 2, H / 2);
    }

    // Click-to-remove hint
    if (rocket.parts.length > 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '9px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('Click part to remove it', buildX + buildW / 2, H - 48);
    }

    // ── Right info panel ────────────────────────────────────────────────────
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

    const stats: [string, string][] = [
      ['Parts',    `${rocket.parts.length}`],
      ['Dry Mass', `${(rocket.parts.reduce((s, p) => s + p.def.dryMass, 0) / 1000).toFixed(2)} t`],
      ['Wet Mass', `${(rocket.getTotalMass() / 1000).toFixed(2)} t`],
      ['Fuel',     `${(rocket.totalFuelCapacity / 1000).toFixed(1)} t`],
      ['Thrust',   `${(rocket.parts.filter(p => p.def.type === PartType.ENGINE).reduce((s, p) => s + p.def.maxThrust, 0) / 1000).toFixed(0)} kN`],
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

    // TWR
    const totalThrust = rocket.parts.filter(p => p.def.type === PartType.ENGINE).reduce((s, p) => s + p.def.maxThrust, 0);
    const twr = rocket.getTotalMass() > 0 ? totalThrust / (rocket.getTotalMass() * 9.81) : 0;
    const twrY = 55 + stats.length * 28;
    ctx.fillStyle = THEME.textDim;
    ctx.font = '10px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('TWR', infoX + 12, twrY);
    ctx.fillStyle = twr > 1.2 ? THEME.success : twr > 1.0 ? THEME.warning : THEME.danger;
    ctx.textAlign = 'right';
    ctx.fillText(twr.toFixed(2), infoX + 184, twrY);

    // Divider
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(infoX + 10, H - 170);
    ctx.lineTo(infoX + 186, H - 170);
    ctx.stroke();

    // Buttons in right panel
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

    // Right panel buttons
    const launchBtn:  Button = { x: bx2, y: H - 160, w: bw, h: bh, label: '', action: onLaunch };
    const stagingBtn: Button = { x: bx2, y: H - 114, w: bw, h: bh, label: '', action: onStaging };
    const backBtn:    Button = { x: bx2, y: H - 68,  w: bw, h: bh, label: '', action: onBack };

    for (const btn of [launchBtn, stagingBtn, backBtn]) {
      if (isHit(btn, mx, my)) { btn.action(); return true; }
    }

    // Palette click → add part to top of stack
    if (mx < this.VAB_PALETTE_W) {
      VAB_PALETTE.forEach((type, i) => {
        const cy = 55 + i * 70;
        if (my >= cy && my <= cy + 62) {
          rocket.addPartOnTop(type);
        }
      });
      return true;
    }

    // Build area click → remove the clicked part
    if (mx < W - 196) {
      for (const bounds of this.vabPartBounds) {
        if (mx >= bounds.x && mx <= bounds.x + bounds.w &&
            my >= bounds.y && my <= bounds.y + bounds.h) {
          rocket.removePartById(bounds.id);
          return true;
        }
      }
    }

    return false;
  }

  handleVABMouseMove(mx: number, my: number): void {
    this.mouseX = mx;
    this.mouseY = my;

    if (mx < this.VAB_PALETTE_W) {
      this.hoveredPaletteIdx = -1;
      VAB_PALETTE.forEach((_, i) => {
        const cy = 55 + i * 70;
        if (my >= cy && my <= cy + 62) this.hoveredPaletteIdx = i;
      });
    } else {
      this.hoveredPaletteIdx = -1;
    }
  }

  // ─── Staging Screen ────────────────────────────────────────────────────────

  renderStaging(rocket: Rocket, onConfirm: () => void, onBack: () => void): void {
    const ctx = this.ctx;
    const { W, H } = this;

    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 20px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('STAGING', W / 2, 40);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px Courier New';
    ctx.fillText('Parts fire in order from Stage 0 (first Space press) upward.', W / 2, 62);

    // Auto-stage button
    const autoBtn: Button = { x: W / 2 - 80, y: 75, w: 160, h: 28, label: '⚡ AUTO-STAGE', action: () => {
      rocket.autoStage();
    }};
    drawButton(ctx, autoBtn, isHit(autoBtn, this.mouseX, this.mouseY));

    // Get all unique stage indices
    const stageCount = Math.max(4, rocket.stages.length + 1);
    const colW = Math.min(180, (W - 40) / stageCount);

    for (let si = 0; si < stageCount; si++) {
      const cx = 20 + si * (colW + 8);
      const cy = 120;
      const colH = H - 200;
      const hovered = this.hoveredStageCol === si;

      // Column background
      ctx.fillStyle = hovered ? 'rgba(0,80,120,0.4)' : 'rgba(10,20,35,0.7)';
      roundRect(ctx, cx, cy, colW, colH, 6);
      ctx.fill();
      ctx.strokeStyle = hovered ? THEME.accent : THEME.panelBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, cx, cy, colW, colH, 6);
      ctx.stroke();

      // Stage header
      ctx.fillStyle = THEME.accent;
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(`STAGE ${si}`, cx + colW / 2, cy + 20);

      // Parts in this stage
      const stage = rocket.stages.find(s => s.stageIndex === si);
      if (stage) {
        stage.partIds.forEach((pid, pi) => {
          const part = rocket.parts.find(p => p.id === pid);
          if (!part) return;
          const py2 = cy + 34 + pi * 38;

          ctx.fillStyle = part.def.color;
          roundRect(ctx, cx + 8, py2, colW - 16, 30, 4);
          ctx.fill();

          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = '9px Courier New';
          ctx.textAlign = 'center';
          ctx.fillText(part.def.name.slice(0, 14), cx + colW / 2, py2 + 12);
          ctx.fillStyle = THEME.textDim;
          ctx.font = '8px Courier New';
          ctx.fillText(part.def.type === PartType.ENGINE ? 'ENGINE' : 'DECOUPLE', cx + colW / 2, py2 + 24);
        });
      }
    }

    // Unassigned parts
    const unassigned = rocket.parts.filter(p =>
      p.stageIndex === -1 &&
      (p.def.type === PartType.ENGINE || p.def.type === PartType.DECOUPLER)
    );
    if (unassigned.length > 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '11px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText('Unassigned:', 20, H - 80);
      unassigned.forEach((p, i) => {
        ctx.fillStyle = p.def.color;
        roundRect(ctx, 20 + i * 80, H - 70, 74, 28, 3);
        ctx.fill();
        ctx.fillStyle = THEME.text;
        ctx.font = '9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(p.def.name.slice(0, 10), 20 + i * 80 + 37, H - 52);
      });
    }

    // Bottom buttons
    const confirmBtn: Button = { x: W - 220, y: H - 52, w: 180, h: 36, label: '✔ CONFIRM',  action: onConfirm, accent: true };
    const backBtn2:   Button = { x: 20,       y: H - 52, w: 120, h: 36, label: '← BACK',    action: onBack };

    drawButton(ctx, confirmBtn, isHit(confirmBtn, this.mouseX, this.mouseY));
    drawButton(ctx, backBtn2,   isHit(backBtn2,   this.mouseX, this.mouseY));
  }

  handleStagingClick(mx: number, my: number, rocket: Rocket, onConfirm: () => void, onBack: () => void): boolean {
    const { W, H } = this;

    // Auto-stage button
    const autoBtn: Button = { x: W / 2 - 80, y: 75, w: 160, h: 28, label: '', action: () => rocket.autoStage() };
    if (isHit(autoBtn, mx, my)) { rocket.autoStage(); return true; }

    // Bottom buttons
    const confirmBtn: Button = { x: W - 220, y: H - 52, w: 180, h: 36, label: '', action: onConfirm };
    const backBtn:    Button = { x: 20,       y: H - 52, w: 120, h: 36, label: '', action: onBack };

    for (const btn of [confirmBtn, backBtn]) {
      if (isHit(btn, mx, my)) { btn.action(); return true; }
    }

    // Click on a stage part to reassign to next stage
    const stageCount = Math.max(4, rocket.stages.length + 1);
    const colW = Math.min(180, (W - 40) / stageCount);
    for (let si = 0; si < stageCount; si++) {
      const cx = 20 + si * (colW + 8);
      const cy = 120;
      const colH = H - 200;
      if (mx >= cx && mx <= cx + colW && my >= cy && my <= cy + colH) {
        const stage = rocket.stages.find(s => s.stageIndex === si);
        if (stage) {
          stage.partIds.forEach((pid, pi) => {
            const py2 = cy + 34 + pi * 38;
            if (my >= py2 && my <= py2 + 30) {
              // Move part to next stage
              rocket.assignStage(pid, (si + 1) % stageCount);
            }
          });
        }
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
