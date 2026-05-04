/**
 * MapView.ts — Orbital map overlay.
 *
 * Renders a zoomed-out view of the rocket's current position and
 * predicted trajectory around Earth.
 *
 * Trajectory prediction:
 *   Numerically integrates the rocket forward 300 × 20 s (≈ 100 min) using
 *   a gravity-only propagator. Each point stores pos + vel so we can compute
 *   the post-maneuver trajectory.
 *
 * Maneuver nodes:
 *   Click the predicted trajectory to place a node.
 *   Drag the prograde / retrograde / radial / anti-radial handles to change ΔV.
 *   The post-node trajectory redraws immediately.
 *   Click the node marker again to delete it.
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
  sma:     number;
  ecc:     number;
  periAlt: number;
  apoAlt:  number;
  period:  number;
}

function computeOrbitalElements(pos: Vec2, vel: Vec2): OrbitalState {
  const r = vec2.length(pos);
  const v = vec2.length(vel);
  const energy = (v * v) / 2 - MU_EARTH / r;

  if (energy >= 0) {
    return { sma: Infinity, ecc: 1, periAlt: -1, apoAlt: Infinity, period: Infinity };
  }

  const sma  = -MU_EARTH / (2 * energy);
  const h    = pos.x * vel.y - pos.y * vel.x;
  const ecc2 = 1 - (h * h) / (MU_EARTH * sma);
  const ecc  = Math.sqrt(Math.max(0, ecc2));
  const periR   = sma * (1 - ecc);
  const apoR    = sma * (1 + ecc);
  const period  = 2 * Math.PI * Math.sqrt((sma ** 3) / MU_EARTH);

  return { sma, ecc, periAlt: periR - R_EARTH, apoAlt: apoR - R_EARTH, period };
}

// ─── Trajectory point (pos + vel at each integration step) ───────────────────

interface TrajPoint {
  pos: Vec2;
  vel: Vec2;
  /** Absolute mission time at this sample (s) */
  t: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Screen-space distance from node centre to handle midpoint (px) */
const HANDLE_R = 38;

/** m/s per pixel when dragging a handle */
const DV_PER_PX = 10;

/** Visual pixels per (m/s) of dV magnitude on the arm (so 100 m/s ≈ 10px extension) */
const DV_VIS_PX = 0.10;

// ─── MapView Class ────────────────────────────────────────────────────────────

export class MapView {
  private ctx: CanvasRenderingContext2D;
  private W: number;
  private H: number;
  private atmo: Atmosphere;

  /** Base screen pixels per metre (Earth radius fills H * 0.20) */
  private mpp = 1;
  private userScale = 1.0;
  private panX = 0;
  private panY = 0;

  // ── Pan drag state ────────────────────────────────────────────────────────
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  /** True if the mouse moved enough during mousedown → suppress next click */
  private _didPan = false;

  // ── Maneuver node ─────────────────────────────────────────────────────────
  /** Single active maneuver node (null = none placed) */
  node: ManeuverNode | null = null;

  /** Index into cachedPath[] where the node sits */
  private _nodeIdx = 0;

  // ── Trajectory cache ──────────────────────────────────────────────────────
  private cachedPath: TrajPoint[] = [];
  private pathAge = 0;
  private postNodePath: TrajPoint[] = [];

  // ── Screen-space hit-test targets (updated each render) ───────────────────
  private _nodeScreenPt:    Vec2 | null = null;
  private _progHandle:      Vec2 | null = null;
  private _retroHandle:     Vec2 | null = null;
  private _normHandle:      Vec2 | null = null;
  private _antinormHandle:  Vec2 | null = null;

  /** Prograde direction in screen space at node (world +Y → screen -Y) */
  private _progradeScreenDir: Vec2 = { x: 0, y: -1 };
  /** Radial-out direction in screen space at node */
  private _radialScreenDir:   Vec2 = { x: 1, y: 0 };

  // ── Handle drag state ─────────────────────────────────────────────────────
  private _dragging: 'prograde' | 'retrograde' | 'normal' | 'antinormal' | null = null;
  private _dragLastX = 0;
  private _dragLastY = 0;

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

  render(rocket: Rocket, wallTime: number, missionTime: number, _onBack?: () => void): void {
    const ctx = this.ctx;
    const { W, H } = this;

    ctx.fillStyle = 'rgba(4,8,16,0.90)';
    ctx.fillRect(0, 0, W, H);

    this.mpp = R_EARTH / (H * 0.20);

    this._drawGrid();
    this._drawEarth();

    // Refresh trajectory every 60 frames
    this.pathAge++;
    if (this.pathAge > 60 || this.cachedPath.length === 0) {
      this.cachedPath = this._predictPath(rocket.body.pos, rocket.body.vel, missionTime, 600, 10);
      this.pathAge = 0;
      if (this.node) this._recomputePostNode();
    }

    this._drawTrajectory();
    if (this.node && this.postNodePath.length > 1) this._drawPostNodeTrajectory();
    this._drawOrbMarkers(this.cachedPath);
    this._drawRocketMarker(rocket, wallTime);
    if (this.node) this._drawManeuverNode(missionTime);

    this._drawOrbitalInfo(rocket);

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('MAP VIEW', W / 2, 28);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px Courier New';
    ctx.fillText('M — flight  |  Click trajectory — place node  |  Click node — delete', W / 2, 46);
  }

  // ─── Trajectory Prediction ───────────────────────────────────────────────

  private _predictPath(
    startPos: Vec2, startVel: Vec2, startT: number, steps: number, dt: number,
  ): TrajPoint[] {
    const path: TrajPoint[] = [];
    let pos = vec2.clone(startPos);
    let vel = vec2.clone(startVel);
    let t   = startT;

    // Track cumulative angle swept to stop after exactly one orbit
    let prevAngle  = Math.atan2(pos.y, pos.x);
    let totalAngle = 0;

    for (let i = 0; i < steps; i++) {
      path.push({ pos: vec2.clone(pos), vel: vec2.clone(vel), t });

      const r = vec2.length(pos);
      if (r < R_EARTH) break;    // suborbital impact

      const gMag = MU_EARTH / (r * r);
      const gDir = vec2.scale(pos, -1 / r);

      vel.x += gDir.x * gMag * dt;
      vel.y += gDir.y * gMag * dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      t += dt;

      // Accumulate angle swept (unwrap to keep each step in (−π, π])
      const curAngle = Math.atan2(pos.y, pos.x);
      let dA = curAngle - prevAngle;
      if (dA >  Math.PI) dA -= 2 * Math.PI;
      if (dA < -Math.PI) dA += 2 * Math.PI;
      totalAngle += Math.abs(dA);
      prevAngle   = curAngle;

      // Stop after one full orbit (avoids ugly overlapping loops)
      if (i > 20 && totalAngle >= 2 * Math.PI) break;
    }

    return path;
  }

  private _recomputePostNode(): void {
    if (!this.node) { this.postNodePath = []; return; }

    const base = this.cachedPath[this._nodeIdx];
    if (!base) { this.postNodePath = []; return; }

    // Apply maneuver ΔV at node position
    const prograde   = vec2.normalize(base.vel);
    const radialOut  = vec2.normalize(base.pos);

    const newVel: Vec2 = {
      x: base.vel.x + this.node.progradeDV * prograde.x + this.node.normalDV * radialOut.x,
      y: base.vel.y + this.node.progradeDV * prograde.y + this.node.normalDV * radialOut.y,
    };

    this.postNodePath = this._predictPath(base.pos, newVel, base.t, 400, 10);
  }

  // ─── Interaction ─────────────────────────────────────────────────────────

  handleClick(mx: number, my: number): boolean {
    // Suppress click after a pan gesture
    if (this._didPan) { this._didPan = false; return false; }

    // Click on existing node marker → delete
    if (this.node && this._nodeScreenPt) {
      const d = Math.hypot(mx - this._nodeScreenPt.x, my - this._nodeScreenPt.y);
      if (d < 14) {
        this.node = null;
        this.postNodePath = [];
        return true;
      }
    }

    // Click near trajectory path → place / move node
    if (this.cachedPath.length === 0) return false;

    let bestIdx = -1, bestDist = 22;
    for (let i = 0; i < this.cachedPath.length; i++) {
      const sp = this._w2s(this.cachedPath[i].pos);
      const d  = Math.hypot(mx - sp.x, my - sp.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    if (bestIdx >= 0) {
      const pt = this.cachedPath[bestIdx];
      this.node = { time: pt.t, progradeDV: 0, normalDV: 0, executed: false };
      this._nodeIdx = bestIdx;
      this._recomputePostNode();
      return true;
    }

    return false;
  }

  handleMouseDown(mx: number, my: number): void {
    this._didPan = false;
    this._dragging = null;

    if (this.node) {
      const handles: Array<['prograde' | 'retrograde' | 'normal' | 'antinormal', Vec2 | null]> = [
        ['prograde',   this._progHandle],
        ['retrograde', this._retroHandle],
        ['normal',     this._normHandle],
        ['antinormal', this._antinormHandle],
      ];
      for (const [label, sp] of handles) {
        if (sp && Math.hypot(mx - sp.x, my - sp.y) < 16) {
          this._dragging   = label;
          this._dragLastX  = mx;
          this._dragLastY  = my;
          return;
        }
      }
    }

    this.isDragging = true;
    this.dragStartX = mx - this.panX;
    this.dragStartY = my - this.panY;
  }

  handleMouseMove(mx: number, my: number): void {
    if (this._dragging && this.node) {
      const dx = mx - this._dragLastX;
      const dy = my - this._dragLastY;
      this._dragLastX = mx;
      this._dragLastY = my;

      const pv = this._progradeScreenDir;
      const nr = this._radialScreenDir;

      switch (this._dragging) {
        case 'prograde':
          this.node.progradeDV += (dx * pv.x + dy * pv.y) * DV_PER_PX;
          break;
        case 'retrograde':
          this.node.progradeDV -= (dx * pv.x + dy * pv.y) * DV_PER_PX;
          break;
        case 'normal':
          this.node.normalDV   += (dx * nr.x + dy * nr.y) * DV_PER_PX;
          break;
        case 'antinormal':
          this.node.normalDV   -= (dx * nr.x + dy * nr.y) * DV_PER_PX;
          break;
      }

      this._recomputePostNode();
      return;
    }

    if (!this.isDragging) return;
    this._didPan = true;
    this.panX = mx - this.dragStartX;
    this.panY = my - this.dragStartY;
  }

  handleMouseUp(): void {
    this.isDragging = false;
    this._dragging  = null;
  }

  handleWheel(e: WheelEvent): void {
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    this.userScale = Math.max(0.25, Math.min(80, this.userScale * factor));
  }

  resetView(): void {
    this.panX = 0;
    this.panY = 0;
    this.userScale = 1.0;
  }

  // ─── Drawing Helpers ──────────────────────────────────────────────────────

  private get eMpp(): number { return this.mpp / this.userScale; }

  private _w2s(world: Vec2): Vec2 {
    return {
      x: this.W / 2 + world.x / this.eMpp + this.panX,
      y: this.H / 2 - world.y / this.eMpp + this.panY,
    };
  }

  // ─── Draw Trajectory (base) ───────────────────────────────────────────────

  private _drawTrajectory(): void {
    const ctx  = this.ctx;
    const path = this.cachedPath;
    if (path.length < 2) return;

    const n = path.length;
    ctx.save();
    ctx.setLineDash([]);

    // ── Solid segments with fading opacity (bright near rocket → dim at end) ─
    for (let i = 1; i < n; i++) {
      const frac  = i / n;
      const alpha = Math.max(0.10, 0.82 - frac * 0.72);

      const s0 = this._w2s(path[i - 1].pos);
      const s1 = this._w2s(path[i].pos);

      // Off-screen cull
      if (s0.x < -300 && s1.x < -300) continue;
      if (s0.x > this.W + 300 && s1.x > this.W + 300) continue;

      const alt    = vec2.length(path[i].pos) - R_EARTH;
      const inAtmo = this.atmo.isInAtmosphere(alt);

      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.strokeStyle = inAtmo
        ? `rgba(255,150,50,${alpha.toFixed(2)})`
        : `rgba(0,210,255,${alpha.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ── Direction arrows (chevrons along path every ~1/10th of total) ───────
    const step = Math.max(8, Math.floor(n / 10));
    for (let i = step; i < n - 1; i += step) {
      const frac  = i / n;
      if (frac > 0.88) break;

      const s0 = this._w2s(path[i].pos);
      const s1 = this._w2s(path[i + 1].pos);
      const dx = s1.x - s0.x, dy = s1.y - s0.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 5) continue;  // too small to bother

      const ang   = Math.atan2(dy, dx);
      const cx    = (s0.x + s1.x) / 2;
      const cy    = (s0.y + s1.y) / 2;
      const alpha = Math.max(0.15, 0.55 - frac * 0.40);

      const alt    = vec2.length(path[i].pos) - R_EARTH;
      const inAtmo = this.atmo.isInAtmosphere(alt);
      const color  = inAtmo
        ? `rgba(255,170,70,${alpha.toFixed(2)})`
        : `rgba(0,220,255,${alpha.toFixed(2)})`;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo( 6,  0);
      ctx.lineTo(-4,  3.5);
      ctx.lineTo(-2,  0);
      ctx.lineTo(-4, -3.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── Impact marker if trajectory ends inside atmosphere / on surface ──────
    const last = path[path.length - 1];
    const lastAlt = vec2.length(last.pos) - R_EARTH;
    if (lastAlt < 70_000) {
      const sp = this._w2s(last.pos);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,80,0,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = THEME.danger;
      ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('IMPACT', sp.x + 9, sp.y);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
  }

  // ─── Draw Post-node Trajectory (yellow preview) ───────────────────────────

  private _drawPostNodeTrajectory(): void {
    const ctx  = this.ctx;
    const path = this.postNodePath;
    if (path.length < 2) return;

    const n = path.length;
    ctx.save();
    ctx.setLineDash([]);

    // Fading yellow segments
    for (let i = 1; i < n; i++) {
      const frac  = i / n;
      const alpha = Math.max(0.08, 0.80 - frac * 0.72);

      const s0 = this._w2s(path[i - 1].pos);
      const s1 = this._w2s(path[i].pos);

      if (s0.x < -300 && s1.x < -300) continue;
      if (s0.x > this.W + 300 && s1.x > this.W + 300) continue;

      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.strokeStyle = `rgba(255,210,0,${alpha.toFixed(2)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Direction arrows
    const step = Math.max(8, Math.floor(n / 10));
    for (let i = step; i < n - 1; i += step) {
      const frac = i / n;
      if (frac > 0.88) break;

      const s0 = this._w2s(path[i].pos);
      const s1 = this._w2s(path[i + 1].pos);
      const dx = s1.x - s0.x, dy = s1.y - s0.y;
      if (Math.hypot(dx, dy) < 5) continue;

      const alpha = Math.max(0.15, 0.55 - frac * 0.40);
      ctx.save();
      ctx.translate((s0.x + s1.x) / 2, (s0.y + s1.y) / 2);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = `rgba(255,220,60,${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo( 6,  0);
      ctx.lineTo(-4,  3.5);
      ctx.lineTo(-2,  0);
      ctx.lineTo(-4, -3.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    this._drawOrbMarkers(this.postNodePath, '#ffcc00', '#ffaa00');
  }

  // ─── Periapsis / Apoapsis markers ────────────────────────────────────────

  private _drawOrbMarkers(
    path: TrajPoint[],
    peColor: string = THEME.warning,
    apColor: string = THEME.accent,
  ): void {
    if (path.length < 2) return;

    let minR = Infinity, maxR = -Infinity;
    let minPos = path[0].pos, maxPos = path[0].pos;

    for (const pt of path) {
      const r = vec2.length(pt.pos);
      if (r < minR) { minR = r; minPos = pt.pos; }
      if (r > maxR) { maxR = r; maxPos = pt.pos; }
    }

    this._drawOrbMarker(minPos, 'Pe', peColor);
    this._drawOrbMarker(maxPos, 'Ap', apColor);
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
    const altStr = alt < 1_000_000
      ? `${(alt / 1000).toFixed(1)} km`
      : `${(alt / 1_000_000).toFixed(3)} Mm`;
    ctx.fillText(`${label}: ${altStr}`, sp.x + 8, sp.y - 4);
  }

  // ─── Maneuver Node Marker + Handles ──────────────────────────────────────

  private _drawManeuverNode(missionTime: number): void {
    if (!this.node) return;

    const base = this.cachedPath[this._nodeIdx];
    if (!base) return;

    const ctx = this.ctx;
    const sp  = this._w2s(base.pos);
    this._nodeScreenPt = sp;

    // Compute screen-space direction vectors (world +Y → screen -Y)
    const vel = base.vel;
    const prog = vec2.length(vel) > 1 ? vec2.normalize(vel) : { x: 1, y: 0 };
    const rOut = vec2.normalize(base.pos);

    this._progradeScreenDir = { x: prog.x, y: -prog.y };
    this._radialScreenDir   = { x: rOut.x, y: -rOut.y };

    const pv = this._progradeScreenDir;
    const nr = this._radialScreenDir;

    // Arm lengths: base radius + visual extension from dV magnitude
    const proArm   = HANDLE_R + Math.max(0,  this.node.progradeDV) * DV_VIS_PX;
    const retroArm = HANDLE_R + Math.max(0, -this.node.progradeDV) * DV_VIS_PX;
    const normArm  = HANDLE_R + Math.max(0,  this.node.normalDV)   * DV_VIS_PX;
    const antArm   = HANDLE_R + Math.max(0, -this.node.normalDV)   * DV_VIS_PX;

    this._progHandle     = { x: sp.x + pv.x * proArm,   y: sp.y + pv.y * proArm   };
    this._retroHandle    = { x: sp.x - pv.x * retroArm, y: sp.y - pv.y * retroArm };
    this._normHandle     = { x: sp.x + nr.x * normArm,  y: sp.y + nr.y * normArm  };
    this._antinormHandle = { x: sp.x - nr.x * antArm,   y: sp.y - nr.y * antArm   };

    ctx.save();

    // ── Arms (node → handle) ──────────────────────────────────────────────
    const drawArm = (end: Vec2, color: string) => {
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    drawArm(this._progHandle,     '#44ff88');
    drawArm(this._retroHandle,    '#ff4444');
    drawArm(this._normHandle,     '#ff88ff');
    drawArm(this._antinormHandle, '#44ffff');

    // ── Handle circles with directional arrowhead ─────────────────────────
    // arrowAngle = direction FROM node TO handle in screen space
    const drawHandle = (pos: Vec2, color: string, label: string) => {
      const HR = 10;  // handle circle radius

      // Circle fill
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, HR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Arrowhead pointing away from node (rotate canvas so +Y = away-from-node)
      const ang = Math.atan2(pos.y - sp.y, pos.x - sp.x);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.moveTo( HR * 0.55,  0);
      ctx.lineTo(-HR * 0.30,  HR * 0.38);
      ctx.lineTo(-HR * 0.30, -HR * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Label outside the circle, offset further along the arm direction
      const lx = pos.x + (pos.x - sp.x) / Math.hypot(pos.x - sp.x, pos.y - sp.y || 1) * (HR + 10);
      const ly = pos.y + (pos.y - sp.y) / Math.hypot(pos.x - sp.x || 1, pos.y - sp.y) * (HR + 10);
      ctx.fillStyle = color;
      ctx.font = 'bold 9px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly);
      ctx.textBaseline = 'alphabetic';
    };

    drawHandle(this._progHandle,     '#44ff88', 'PRO');
    drawHandle(this._retroHandle,    '#ff4444', 'RET');
    drawHandle(this._normHandle,     '#ff88ff', 'NOR');
    drawHandle(this._antinormHandle, '#44ffff', 'ANT');

    // ── Node centre ───────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = THEME.warning;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Delta mark inside node
    ctx.fillStyle = '#000';
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Δ', sp.x, sp.y);
    ctx.textBaseline = 'alphabetic';

    ctx.restore();

    // ── Info panel ─────────────────────────────────────────────────────────
    this._drawNodeInfoPanel(missionTime, sp);
  }

  private _drawNodeInfoPanel(missionTime: number, nodeSP: Vec2): void {
    const ctx = this.ctx;
    const node = this.node!;

    const totalDV    = Math.hypot(node.progradeDV, node.normalDV);
    const timeToNode = node.time - missionTime;

    const pw = 210, ph = 100;
    // Place panel to right of node if room, else left
    const px = (nodeSP.x + 20 + pw < this.W) ? nodeSP.x + 20 : nodeSP.x - pw - 20;
    const py = Math.max(10, Math.min(this.H - ph - 10, nodeSP.y - ph / 2));

    // Panel background
    ctx.fillStyle = 'rgba(8,14,24,0.92)';
    this._roundRect(px, py, pw, ph, 6);
    ctx.fill();
    ctx.strokeStyle = THEME.warning;
    ctx.lineWidth = 1;
    this._roundRect(px, py, pw, ph, 6);
    ctx.stroke();

    // Header
    ctx.fillStyle = THEME.warning;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('MANEUVER NODE', px + pw / 2, py + 16);

    // Rows
    const rows: [string, string][] = [
      ['ΔV',     `${totalDV.toFixed(1)} m/s`],
      ['PRO',    `${node.progradeDV.toFixed(1)} m/s`],
      ['RAD',    `${node.normalDV.toFixed(1)} m/s`],
      ['T−',     timeToNode < 0 ? 'PAST NODE' : this._fmtTime(timeToNode)],
    ];

    rows.forEach(([k, v], i) => {
      const ry = py + 32 + i * 18;
      ctx.fillStyle = THEME.textDim;
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(k, px + 10, ry);
      ctx.fillStyle = (k === 'T−' && timeToNode < 60) ? THEME.danger
                    : (k === 'ΔV') ? THEME.accent
                    : THEME.text;
      ctx.textAlign = 'right';
      ctx.fillText(v, px + pw - 10, ry);
    });

    // Hint: click to delete
    ctx.fillStyle = THEME.textDim;
    ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('[click node to delete]', px + pw / 2, py + ph - 6);
  }

  // ─── Earth & Grid ─────────────────────────────────────────────────────────

  private _drawEarth(): void {
    const ctx = this.ctx;
    const centre = this._w2s({ x: 0, y: 0 });
    const earthR = R_EARTH / this.eMpp;

    const atmoR = (R_EARTH + 70_000) / this.eMpp;
    const atmoGrad = ctx.createRadialGradient(centre.x, centre.y, earthR * 0.95, centre.x, centre.y, atmoR);
    atmoGrad.addColorStop(0, 'rgba(80,160,255,0.4)');
    atmoGrad.addColorStop(1, 'rgba(0,60,120,0)');
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, atmoR, 0, Math.PI * 2);
    ctx.fillStyle = atmoGrad;
    ctx.fill();

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

      const labelX = centre.x + r + 4;
      const labelStr = alt >= 1_000_000
        ? `${(alt / 1_000_000).toFixed(0)} Mm`
        : `${(alt / 1000).toFixed(0)} km`;
      ctx.fillStyle = 'rgba(60,110,160,0.8)';
      ctx.fillText(labelStr, labelX, centre.y - 4);
    }
    ctx.setLineDash([]);
  }

  // ─── Rocket Marker ────────────────────────────────────────────────────────

  private _drawRocketMarker(rocket: Rocket, time: number): void {
    const ctx = this.ctx;
    const sp  = this._w2s(rocket.body.pos);

    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 6 + pulse * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,212,255,${0.3 + pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = THEME.accent;
    ctx.fill();

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

    ctx.fillStyle = THEME.text;
    ctx.font = '10px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('▲ Rocket', sp.x + 8, sp.y + 4);
  }

  // ─── Orbital Info Panel ───────────────────────────────────────────────────

  private _drawOrbitalInfo(rocket: Rocket): void {
    const ctx = this.ctx;
    const { W } = this;

    const orb = computeOrbitalElements(rocket.body.pos, rocket.body.vel);

    const rows: [string, string][] = [
      ['Pe',  orb.periAlt < 0 ? 'SUBORBITAL' : orb.periAlt < 1_000_000 ? `${(orb.periAlt / 1000).toFixed(1)} km` : `${(orb.periAlt / 1_000_000).toFixed(3)} Mm`],
      ['Ap',  orb.apoAlt  === Infinity ? 'ESCAPE' : orb.apoAlt < 1_000_000 ? `${(orb.apoAlt / 1000).toFixed(1)} km` : `${(orb.apoAlt / 1_000_000).toFixed(3)} Mm`],
      ['Ecc', orb.ecc.toFixed(4)],
      ['Per', orb.period === Infinity ? '∞' : this._fmtTime(orb.period)],
      ['SMA', orb.sma    === Infinity ? '∞' : `${(orb.sma / 1000).toFixed(0)} km`],
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

  // ─── Utilities ────────────────────────────────────────────────────────────

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
}
