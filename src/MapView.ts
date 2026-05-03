/**
 * MapView.ts — Orbital map overlay.
 *
 * Renders a zoomed-out view of the rocket's current position and
 * predicted trajectory around Earth.
 *
 * Trajectory prediction:
 *   We numerically integrate the rocket's physics 300 steps × 20 s each
 *   (≈ 100 min forward, more than one full orbit) using a simplified
 *   gravity-only propagator (no drag, no thrust).  The result is drawn
 *   as a dotted path around Earth.
 *
 * This module is also the stub integration point for maneuver nodes
 * (stored in `maneuverNodes`; drawn but not yet interactive).
 *
 * Coordinate system: same world-space as Physics.ts.
 *   Earth centre = (0, 0).  +Y = up (north pole direction).
 *   Scale = adaptive: Earth fills ~1/3 of the screen height.
 */

import { Vec2, vec2, THEME, ManeuverNode } from './types';
import { Rocket } from './Rocket';
import { R_EARTH, MU_EARTH } from './Physics';
import { Atmosphere } from './Atmosphere';

// ─── Orbital Elements helper ──────────────────────────────────────────────────

interface OrbitalState {
  /** Semi-major axis (m) */
  sma: number;
  /** Eccentricity (0=circle, 0<e<1=ellipse, ≥1=hyperbola) */
  ecc: number;
  /** Periapsis altitude (m above surface) */
  periAlt: number;
  /** Apoapsis altitude (m above surface), Infinity if escape */
  apoAlt: number;
  /** Orbital period (s), Infinity if escape */
  period: number;
}

function computeOrbitalElements(pos: Vec2, vel: Vec2): OrbitalState {
  const r = vec2.length(pos);
  const v = vec2.length(vel);

  // Specific orbital energy: ε = v²/2 − μ/r
  const energy = (v * v) / 2 - MU_EARTH / r;

  if (energy >= 0) {
    // Escape / hyperbolic
    return { sma: Infinity, ecc: 1, periAlt: -1, apoAlt: Infinity, period: Infinity };
  }

  // Semi-major axis: sma = −μ / (2ε)
  const sma = -MU_EARTH / (2 * energy);

  // Specific angular momentum: h = r × v (2D cross product = scalar)
  const h = pos.x * vel.y - pos.y * vel.x;

  // Eccentricity: e = sqrt(1 − h²/(μ·a))
  const ecc2 = 1 - (h * h) / (MU_EARTH * sma);
  const ecc = Math.sqrt(Math.max(0, ecc2));

  const periR   = sma * (1 - ecc);
  const apoR    = sma * (1 + ecc);
  const period  = 2 * Math.PI * Math.sqrt((sma ** 3) / MU_EARTH);

  return {
    sma,
    ecc,
    periAlt: periR - R_EARTH,
    apoAlt:  apoR  - R_EARTH,
    period,
  };
}

// ─── MapView Class ────────────────────────────────────────────────────────────

export class MapView {
  private ctx: CanvasRenderingContext2D;
  private W: number;
  private H: number;
  private atmo: Atmosphere;

  /** Base screen pixels per metre (Earth radius fills H*0.20) */
  private mpp = 1;

  /** User zoom multiplier (scroll wheel) */
  private userScale = 1.0;

  /** Pan offset in screen pixels */
  private panX = 0;
  private panY = 0;

  /** Drag state */
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  /** Maneuver nodes (future feature stub) */
  maneuverNodes: ManeuverNode[] = [];

  /** Cached trajectory path (recomputed every ~60 frames) */
  private cachedPath: Vec2[] = [];
  private pathAge = 0;

  constructor(ctx: CanvasRenderingContext2D, atmo: Atmosphere) {
    this.ctx = ctx;
    this.atmo = atmo;
    this.W = ctx.canvas.width;
    this.H = ctx.canvas.height;
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
  }

  // ─── Full Map Render ──────────────────────────────────────────────────────

  /**
   * Render the full map overlay on top of the existing canvas content.
   * @param rocket  Current rocket state
   * @param time    Elapsed time in seconds (for animations)
   * @param onBack  Callback when Back button is clicked
   */
  render(rocket: Rocket, time: number, _onBack?: () => void): void {
    const ctx = this.ctx;
    const { W, H } = this;

    // ── Semi-transparent overlay ────────────────────────────────────────
    ctx.fillStyle = 'rgba(4,8,16,0.90)';
    ctx.fillRect(0, 0, W, H);

    // ── Compute scale: Earth radius = H * 0.20 ─────────────────────────
    this.mpp = R_EARTH / (H * 0.20);

    // ── Draw grid rings ─────────────────────────────────────────────────
    this._drawGrid();

    // ── Draw Earth ──────────────────────────────────────────────────────
    this._drawEarth();

    // ── Trajectory path ─────────────────────────────────────────────────
    this.pathAge++;
    if (this.pathAge > 60 || this.cachedPath.length === 0) {
      this.cachedPath = this._predictTrajectory(rocket);
      this.pathAge = 0;
    }
    this._drawTrajectory(rocket);

    // ── Rocket marker ───────────────────────────────────────────────────
    this._drawRocketMarker(rocket, time);

    // ── Maneuver nodes (stub) ───────────────────────────────────────────
    this._drawManeuverNodes();

    // ── Orbital info panel ──────────────────────────────────────────────
    this._drawOrbitalInfo(rocket);

    // ── Title ──────────────────────────────────────────────────────────
    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('MAP VIEW', W / 2, 28);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px Courier New';
    ctx.fillText('M — return to flight  |  Drag — pan  |  Scroll — zoom', W / 2, 46);
  }

  /** Handle click — returns true if back was triggered (not used; M key toggles) */
  handleClick(_mx: number, _my: number): boolean { return false; }

  // ─── Trajectory Prediction ───────────────────────────────────────────────

  /**
   * Numerically integrate the rocket forward in time using gravity only
   * (no drag, no thrust assumed during prediction).
   *
   * We use a simple Euler integrator with 20-second steps.
   * For a real Verlet integrator the error would be smaller, but Euler
   * is sufficient for the visual dotted path.
   *
   * @returns Array of world-space positions forming the trajectory
   */
  private _predictTrajectory(rocket: Rocket): Vec2[] {
    const steps = 300;
    const dt    = 20;     // seconds per step

    const path: Vec2[] = [];
    let pos = vec2.clone(rocket.body.pos);
    let vel = vec2.clone(rocket.body.vel);

    for (let i = 0; i < steps; i++) {
      path.push(vec2.clone(pos));

      // Gravity only: a = −μ/r² · r̂
      const r = vec2.length(pos);
      if (r < R_EARTH) break;    // impacted surface

      const gMag = MU_EARTH / (r * r);
      const gDir = vec2.scale(pos, -1 / r);
      const ax   = gDir.x * gMag;
      const ay   = gDir.y * gMag;

      // Symplectic Euler
      vel.x += ax * dt;
      vel.y += ay * dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
    }

    return path;
  }

  // ─── Drawing Helpers ────────────────────────────────────────────────────

  /** Effective metres-per-pixel (base scale divided by user zoom) */
  private get eMpp(): number { return this.mpp / this.userScale; }

  /** World position → screen position (Y axis flipped: world +Y = screen −Y) */
  private _w2s(world: Vec2): Vec2 {
    return {
      x: this.W / 2 + world.x / this.eMpp + this.panX,
      y: this.H / 2 - world.y / this.eMpp + this.panY,
    };
  }

  private _drawEarth(): void {
    const ctx = this.ctx;
    const centre = this._w2s({ x: 0, y: 0 });
    const earthR = R_EARTH / this.eMpp;

    // Atmosphere glow
    const atmoR = (R_EARTH + 70_000) / this.eMpp;
    const atmoGrad = ctx.createRadialGradient(centre.x, centre.y, earthR * 0.95, centre.x, centre.y, atmoR);
    atmoGrad.addColorStop(0, 'rgba(80,160,255,0.4)');
    atmoGrad.addColorStop(1, 'rgba(0,60,120,0)');
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, atmoR, 0, Math.PI * 2);
    ctx.fillStyle = atmoGrad;
    ctx.fill();

    // Earth
    const earthGrad = ctx.createRadialGradient(
      centre.x - earthR * 0.3, centre.y - earthR * 0.3, earthR * 0.05,
      centre.x, centre.y, earthR,
    );
    earthGrad.addColorStop(0, '#4a9eff');
    earthGrad.addColorStop(0.45, '#1d5ea8');
    earthGrad.addColorStop(0.8,  '#164d30');
    earthGrad.addColorStop(1,    '#0d2244');

    ctx.beginPath();
    ctx.arc(centre.x, centre.y, earthR, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad;
    ctx.fill();
  }

  private _drawGrid(): void {
    const ctx = this.ctx;
    const centre = this._w2s({ x: 0, y: 0 });
    const altitudes = [100_000, 500_000, 1_000_000, 3_000_000, 10_000_000];

    ctx.setLineDash([4, 8]);
    ctx.lineWidth = 0.5;
    ctx.textAlign = 'left';
    ctx.font = '10px Courier New';

    for (const alt of altitudes) {
      const r = (R_EARTH + alt) / this.eMpp;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(30,80,120,0.5)';
      ctx.stroke();

      // Label
      const labelX = centre.x + r + 4;
      const labelStr = alt >= 1_000_000
        ? `${(alt / 1_000_000).toFixed(0)} Mm`
        : `${(alt / 1000).toFixed(0)} km`;
      ctx.fillStyle = 'rgba(60,110,160,0.8)';
      ctx.fillText(labelStr, labelX, centre.y - 4);
    }
    ctx.setLineDash([]);
  }

  private _drawTrajectory(_rocket: Rocket): void {
    const ctx = this.ctx;
    const path = this.cachedPath;
    if (path.length < 2) return;

    // Colour path by altitude (hot = in atmosphere, cool = vacuum)
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);

    for (let i = 1; i < path.length; i++) {
      const s0 = this._w2s(path[i - 1]);
      const s1 = this._w2s(path[i]);
      const alt = vec2.length(path[i]) - R_EARTH;
      const inAtmo = this.atmo.isInAtmosphere(alt);

      ctx.strokeStyle = inAtmo ? 'rgba(255,140,40,0.55)' : 'rgba(0,200,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Periapsis / apoapsis markers
    let minR = Infinity, maxR = -Infinity;
    let minPos = path[0], maxPos = path[0];
    for (const p of path) {
      const r = vec2.length(p);
      if (r < minR) { minR = r; minPos = p; }
      if (r > maxR) { maxR = r; maxPos = p; }
    }
    this._drawOrbMarker(minPos, 'Pe', THEME.warning);
    this._drawOrbMarker(maxPos, 'Ap', THEME.accent);
  }

  private _drawOrbMarker(worldPos: Vec2, label: string, color: string): void {
    const ctx = this.ctx;
    const sp  = this._w2s(worldPos);

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'left';
    const alt = vec2.length(worldPos) - R_EARTH;
    const altStr = alt < 1_000_000 ? `${(alt / 1000).toFixed(1)} km` : `${(alt / 1_000_000).toFixed(3)} Mm`;
    ctx.fillText(`${label}: ${altStr}`, sp.x + 8, sp.y - 4);
  }

  private _drawRocketMarker(rocket: Rocket, time: number): void {
    const ctx = this.ctx;
    const sp  = this._w2s(rocket.body.pos);

    // Pulsing ring
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 6 + pulse * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,212,255,${0.3 + pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Core dot
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = THEME.accent;
    ctx.fill();

    // Velocity vector arrow
    const velScaled = vec2.scale(rocket.body.vel, 0.001 / this.eMpp);
    if (vec2.length(velScaled) > 2) {
      const velEnd = { x: sp.x + velScaled.x, y: sp.y - velScaled.y };
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(velEnd.x, velEnd.y);
      ctx.strokeStyle = THEME.success;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = THEME.text;
    ctx.font = '10px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('▲ Rocket', sp.x + 8, sp.y + 4);
  }

  private _drawManeuverNodes(): void {
    const ctx = this.ctx;
    for (const node of this.maneuverNodes) {
      if (node.executed) continue;

      // For now just show a placeholder marker at the node position
      // (no position computed — needs trajectory lookup by time)
      ctx.fillStyle = THEME.warning;
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('⬡ Maneuver Node (stub)', this.W / 2, this.H - 100);
      break;
    }
  }

  private _drawOrbitalInfo(rocket: Rocket): void {
    const ctx = this.ctx;
    const { W } = this;

    const orb = computeOrbitalElements(rocket.body.pos, rocket.body.vel);

    const rows: [string, string][] = [
      ['Pe',  orb.periAlt < 0 ? 'SUBORBITAL' : orb.periAlt < 1_000_000 ? `${(orb.periAlt / 1000).toFixed(1)} km` : `${(orb.periAlt / 1_000_000).toFixed(3)} Mm`],
      ['Ap',  orb.apoAlt === Infinity ? 'ESCAPE' : orb.apoAlt < 1_000_000 ? `${(orb.apoAlt / 1000).toFixed(1)} km` : `${(orb.apoAlt / 1_000_000).toFixed(3)} Mm`],
      ['Ecc', orb.ecc.toFixed(4)],
      ['Per', orb.period === Infinity ? '∞' : this._fmtTime(orb.period)],
      ['SMA', orb.sma === Infinity ? '∞' : `${(orb.sma / 1000).toFixed(0)} km`],
    ];

    const pw = 200, ph = rows.length * 22 + 36;
    const px = W - pw - 16, py = 60;

    ctx.fillStyle = 'rgba(8,14,24,0.88)';
    this._roundRect(px, py, pw, ph, 6);
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    this._roundRect(px, py, pw, ph, 6);
    ctx.stroke();

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('ORBITAL DATA', px + pw / 2, py + 18);

    rows.forEach(([k, v], i) => {
      const ry = py + 36 + i * 22;
      ctx.fillStyle = THEME.textDim;
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(k, px + 10, ry);
      ctx.fillStyle = THEME.text;
      ctx.textAlign = 'right';
      ctx.fillText(v, px + pw - 10, ry);
    });
  }

  private _roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
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

  private _fmtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  }

  // ─── Pan / Zoom Input ────────────────────────────────────────────────────

  handleMouseDown(mx: number, my: number): void {
    this.isDragging = true;
    this.dragStartX = mx - this.panX;
    this.dragStartY = my - this.panY;
  }

  handleMouseMove(mx: number, my: number): void {
    if (!this.isDragging) return;
    this.panX = mx - this.dragStartX;
    this.panY = my - this.dragStartY;
  }

  handleMouseUp(): void {
    this.isDragging = false;
  }

  handleWheel(e: WheelEvent): void {
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    this.userScale = Math.max(0.25, Math.min(80, this.userScale * factor));
    // No pan recalculation: Earth is always at world (0,0), so _w2s({0,0}) = (W/2+panX, H/2+panY)
    // regardless of eMpp. Zoom scales the trajectory/rocket around Earth's current screen position.
  }

  /** Reset pan/zoom to default (called when map is opened) */
  resetView(): void {
    this.panX = 0;
    this.panY = 0;
    this.userScale = 1.0;
  }

  /** Add a maneuver node (for future use) */
  addManeuverNode(node: ManeuverNode): void {
    this.maneuverNodes.push(node);
  }

  /** Clear all maneuver nodes */
  clearManeuverNodes(): void {
    this.maneuverNodes = [];
  }
}
