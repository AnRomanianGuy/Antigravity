/**
 * MapView.ts — Orbital map overlay.
 *
 * Trajectory prediction uses patched conics:
 *   • Outside Moon SOI → Earth gravity only
 *   • Inside Moon SOI  → Moon gravity only
 *
 * The Moon orbits Earth continuously; its position is sampled at each
 * integration step so encounter timing is accurate.
 */

import { Vec2, vec2, THEME, ManeuverNode } from './types';
import { Rocket } from './Rocket';
import {
  R_EARTH, MU_EARTH,
  R_MOON, MU_MOON, MOON_ORBIT_RADIUS, MOON_SOI,
  getMoonPosition, getMoonVelocity,
} from './Physics';
import { Atmosphere } from './Atmosphere';

// ─── Orbital Elements helper ──────────────────────────────────────────────────

interface OrbitalState {
  sma:     number;
  ecc:     number;
  periAlt: number;
  apoAlt:  number;
  period:  number;
}

function computeOrbitalElements(
  pos: Vec2, vel: Vec2,
  mu = MU_EARTH,
  bodyR = R_EARTH,
): OrbitalState {
  const r = vec2.length(pos);
  const v = vec2.length(vel);
  const energy = (v * v) / 2 - mu / r;
  if (energy >= 0) {
    return { sma: Infinity, ecc: 1, periAlt: -1, apoAlt: Infinity, period: Infinity };
  }
  const sma  = -mu / (2 * energy);
  const h    = pos.x * vel.y - pos.y * vel.x;
  const ecc2 = 1 - (h * h) / (mu * sma);
  const ecc  = Math.sqrt(Math.max(0, ecc2));
  const periR  = sma * (1 - ecc);
  const apoR   = sma * (1 + ecc);
  const period = 2 * Math.PI * Math.sqrt((sma ** 3) / mu);
  return { sma, ecc, periAlt: periR - bodyR, apoAlt: apoR - bodyR, period };
}

// ─── Trajectory point ────────────────────────────────────────────────────────

interface TrajPoint {
  pos: Vec2;
  vel: Vec2;
  t:   number;
  /** True if this point is inside the Moon's sphere of influence */
  inMoonSOI: boolean;
  /** Position relative to Moon centre — only set when inMoonSOI */
  moonRelPos?: Vec2;
}

// ─── Moon encounter record ────────────────────────────────────────────────────

interface MoonEncounter {
  /** Index into path[] where the trajectory first enters Moon SOI */
  entryIdx:  number;
  entryT:    number;
  /** Index of closest approach to Moon surface */
  closestIdx:              number;
  /** Distance from Moon surface at closest approach (m); negative = impact */
  closestDistFromSurface:  number;
  isImpact:   boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HANDLE_R  = 38;
const DV_PER_PX = 10;
const DV_VIS_PX = 0.10;

// ─── MapView Class ────────────────────────────────────────────────────────────

export class MapView {
  private ctx: CanvasRenderingContext2D;
  private W:   number;
  private H:   number;
  private atmo: Atmosphere;

  private mpp       = 1;
  private userScale = 1.0;
  private panX      = 0;
  private panY      = 0;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private _didPan    = false;

  // ── Maneuver node ─────────────────────────────────────────────────────────
  node: ManeuverNode | null = null;
  private _nodeIdx  = 0;

  // ── Trajectory cache ──────────────────────────────────────────────────────
  // Pools are grown as needed and reused across frames to avoid GC pressure.
  private cachedPath:      TrajPoint[] = [];
  private postNodePath:    TrajPoint[] = [];
  private _pathPool:       TrajPoint[] = [];
  private _pnPool:         TrajPoint[] = [];
  private pathAge          = 0;
  private _moonPosAtRender: Vec2 = { x: 0, y: 0 };

  // ── Burn execution tracking ───────────────────────────────────────────────
  private _burnStartVel:  Vec2 | null = null;
  private _burnTotalDV    = 0;
  private _burnDirX       = 1;   // unit vector along planned burn direction
  private _burnDirY       = 0;
  private _dvRemaining:   number | null = null;
  private _prevTimeToNode = Infinity;

  // ── Encounter cache ───────────────────────────────────────────────────────
  private _encounter:         MoonEncounter | null = null;
  private _postNodeEncounter: MoonEncounter | null = null;

  // ── Screen-space hit-test targets ─────────────────────────────────────────
  private _nodeScreenPt:   Vec2 | null = null;
  private _progHandle:     Vec2 | null = null;
  private _retroHandle:    Vec2 | null = null;
  private _normHandle:     Vec2 | null = null;
  private _antinormHandle: Vec2 | null = null;

  private _progradeScreenDir: Vec2 = { x: 0, y: -1 };
  private _radialScreenDir:   Vec2 = { x: 1, y:  0 };

  // ── Handle drag state ─────────────────────────────────────────────────────
  private _dragging: 'prograde' | 'retrograde' | 'normal' | 'antinormal' | null = null;
  private _dragLastX = 0;
  private _dragLastY = 0;

  constructor(ctx: CanvasRenderingContext2D, atmo: Atmosphere) {
    this.ctx  = ctx;
    this.atmo = atmo;
    this.W    = ctx.canvas.width;
    this.H    = ctx.canvas.height;
  }

  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
  }

  // ─── Full Map Render ──────────────────────────────────────────────────────

  render(rocket: Rocket, wallTime: number, missionTime: number, _onBack?: () => void): void {
    const ctx     = this.ctx;
    const { W, H } = this;

    ctx.fillStyle = 'rgba(4,8,16,0.90)';
    ctx.fillRect(0, 0, W, H);

    this.mpp = R_EARTH / (H * 0.20);

    this._drawGrid(missionTime);
    this._drawMoon(missionTime);
    this._drawEarth();

    // Burn state is maintained by tick() (called every frame even when map is closed)
    const isExecutingBurn = this.node !== null && (this.node.time - missionTime) < 0;

    // Current Moon position used for all SOI trajectory rendering this frame
    const moonPosNow = getMoonPosition(missionTime);
    this._moonPosAtRender = moonPosNow;

    // Refresh trajectory every 60 frames (even during burn — shows real-time orbit change)
    this.pathAge++;
    if (this.pathAge > 60 || this.cachedPath.length === 0) {
      const moonPosCurr  = moonPosNow;
      const moonDistCurr = vec2.length(vec2.sub(rocket.body.pos, moonPosCurr));
      const rocketInSOI  = moonDistCurr < MOON_SOI;
      let predTime: number;
      let predEarthDt: number;
      if (rocketInSOI) {
        // Compute orbital period in Moon-relative frame so predTime covers 2.5 lunar orbits
        const moonVelCurr = getMoonVelocity(missionTime);
        const relPos      = vec2.sub(rocket.body.pos, moonPosCurr);
        const relVel      = vec2.sub(rocket.body.vel, moonVelCurr);
        const lunarOrb    = computeOrbitalElements(relPos, relVel, MU_MOON, R_MOON);
        const lunarPeriod = isFinite(lunarOrb.period) && lunarOrb.period > 0 ? lunarOrb.period : 8_800;
        predTime    = Math.min(lunarPeriod * 2.5, 3 * 86_400);
        predEarthDt = 2;
      } else {
        const orb    = computeOrbitalElements(rocket.body.pos, rocket.body.vel);
        const period = isFinite(orb.period) && orb.period > 0 ? orb.period : 4 * 86_400;
        // Show up to 2.5 orbits regardless of size; cap at 1 year to prevent runaway
        predTime    = Math.min(period * 2.5, 365 * 86_400);
        // period/200 → ~200 steps/orbit baseline; the adaptive-dt logic inside
        // _predictPath will further reduce this near periapsis of eccentric orbits.
        predEarthDt = Math.max(10, period / 200);
      }

      this.cachedPath  = this._predictPath(this._pathPool, rocket.body.pos, rocket.body.vel, missionTime, predTime, predEarthDt);
      this._encounter  = this._findEncounter(this.cachedPath);
      this.pathAge     = 0;
      if (this.node) {
        // Re-sync node index to the path point closest to the stored node time
        this._nodeIdx = this._findNodeIdx(this.node.time);
        // During burn execution the post-node arc is frozen as a reference target;
        // only recompute it while still pre-burn so it shows the planned orbit.
        if (!isExecutingBurn) {
          this._recomputePostNode();
        }
      }
    }

    this._drawTrajectory(this.cachedPath, false, moonPosNow);
    if (this.node && this.postNodePath.length > 1) {
      this._drawTrajectory(this.postNodePath, true, moonPosNow);
    }

    this._drawOrbMarkers(this.cachedPath, moonPosNow);
    if (this.node && this.postNodePath.length > 1) {
      this._drawOrbMarkersPost(this.postNodePath);
    }

    if (this._encounter) {
      this._drawEncounterMarker(this._encounter, this.cachedPath, missionTime, false);
    }
    if (this._postNodeEncounter) {
      this._drawEncounterMarker(this._postNodeEncounter, this.postNodePath, missionTime, true);
    }

    this._drawRocketMarker(rocket, wallTime);
    if (this.node) this._drawManeuverNode(missionTime, rocket);

    // Orbital info — switches to lunar elements inside Moon SOI
    this._drawOrbitalInfo(rocket, missionTime);

    // Transfer guidance hints (only when no encounter predicted yet)
    if (!this._encounter && !this._postNodeEncounter) {
      this._drawTransferHints(rocket, missionTime);
    }

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('MAP VIEW', W / 2, 28);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px Courier New';
    ctx.fillText('M — flight  |  Click trajectory — place node  |  Click node — delete', W / 2, 46);
  }

  /** ΔV remaining in the currently executing burn, or null if no burn is active. */
  get dvRemaining(): number | null { return this._dvRemaining; }

  /**
   * Update burn-execution state every game frame, even when the map is not visible.
   * Must be called from Game._updateFlight() before renderBurnGuidance.
   */
  tick(rocket: { body: { pos: Vec2; vel: Vec2 } }, missionTime: number): void {
    const timeToNode      = this.node ? this.node.time - missionTime : Infinity;
    const isExecutingBurn = this.node !== null && timeToNode < 0;

    if (this.node && timeToNode < 0 && this._prevTimeToNode >= 0) {
      const vel = rocket.body.vel;
      const pos = rocket.body.pos;
      this._burnStartVel = { x: vel.x, y: vel.y };
      this._burnTotalDV  = Math.hypot(this.node.progradeDV, this.node.normalDV);

      // Compute burn direction unit vector once at ignition so we can project
      // velocity changes onto it — this filters out orbital-rotation drift and
      // gravity contamination that would otherwise inflate dvAccum and cut the burn short.
      const speed  = Math.hypot(vel.x, vel.y);
      const posLen = Math.hypot(pos.x, pos.y);
      const pgX = speed  > 0 ? vel.x / speed  : 0;
      const pgY = speed  > 0 ? vel.y / speed  : 1;
      const roX = posLen > 0 ? pos.x / posLen : 0;
      const roY = posLen > 0 ? pos.y / posLen : 1;
      const bx  = this.node.progradeDV * pgX + this.node.normalDV * roX;
      const by  = this.node.progradeDV * pgY + this.node.normalDV * roY;
      const bl  = Math.hypot(bx, by);
      this._burnDirX = bl > 0 ? bx / bl : pgX;
      this._burnDirY = bl > 0 ? by / bl : pgY;
    }
    if (!this.node || !isExecutingBurn) this._burnStartVel = null;
    this._prevTimeToNode = timeToNode;

    if (isExecutingBurn && this._burnStartVel !== null) {
      const dx = rocket.body.vel.x - this._burnStartVel.x;
      const dy = rocket.body.vel.y - this._burnStartVel.y;
      // Project onto burn direction — avoids gravity/orbital-rotation contaminating
      // the measurement and causing premature cutoff.
      const dvAccum = Math.max(0, dx * this._burnDirX + dy * this._burnDirY);
      const dvRem   = this._burnTotalDV - dvAccum;
      this._dvRemaining = isFinite(dvRem) ? Math.max(0, dvRem) : null;
    } else {
      this._dvRemaining = null;
    }
  }

  // ─── Trajectory Prediction (patched conics) ───────────────────────────────

  private _predictPath(
    pool: TrajPoint[],
    startPos: Vec2, startVel: Vec2, startT: number, maxTime: number, earthDt: number,
  ): TrajPoint[] {
    // Fill pool in-place, reusing existing TrajPoint objects to avoid GC churn.
    let count = 0;
    let pos = vec2.clone(startPos);
    let vel = vec2.clone(startVel);
    let t   = startT;

    let prevAngle  = Math.atan2(pos.y, pos.x);
    let totalAngle = 0;

    let moonPrevAngle  = NaN;
    let moonOrbitAngle = 0;

    let elapsed = 0;
    for (let i = 0; i < 50_000 && elapsed < maxTime; i++) {
      const moonPos  = getMoonPosition(t);
      const dx       = pos.x - moonPos.x;
      const dy       = pos.y - moonPos.y;
      const moonDist = Math.sqrt(dx * dx + dy * dy);
      const inSOI    = moonDist < MOON_SOI && moonDist > 0;
      const r        = Math.sqrt(pos.x * pos.x + pos.y * pos.y);

      // Adaptive timestep: clamp so the rocket moves at most 5 % of its local
      // orbital radius per step.  This prevents integration blow-up near the
      // periapsis of highly eccentric orbits where a coarse earthDt would cause
      // the rocket to "jump through" the planet in a single step.
      let effectiveDt: number;
      if (inSOI) {
        effectiveDt = 2;
      } else {
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        const periDt = speed > 0 ? 0.05 * r / speed : earthDt;
        effectiveDt  = Math.min(earthDt, Math.max(1, periDt));
      }

      // Reuse existing TrajPoint object; allocate only when pool needs to grow.
      let pt = pool[count];
      if (pt === undefined) {
        pt = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, t: 0, inMoonSOI: false };
        pool.push(pt);
      }
      pt.pos.x = pos.x; pt.pos.y = pos.y;
      pt.vel.x = vel.x; pt.vel.y = vel.y;
      pt.t = t;
      pt.inMoonSOI = inSOI;
      if (inSOI) {
        if (!pt.moonRelPos) pt.moonRelPos = { x: 0, y: 0 };
        pt.moonRelPos.x = dx;
        pt.moonRelPos.y = dy;
      } else {
        pt.moonRelPos = undefined;
      }
      count++;

      if (r < R_EARTH)  break;
      if (moonDist < R_MOON) break;

      // N-body gravity: Earth + Moon simultaneously
      const earthGMag = MU_EARTH / (r * r);
      vel.x += -(pos.x / r) * earthGMag * effectiveDt;
      vel.y += -(pos.y / r) * earthGMag * effectiveDt;
      if (moonDist > 0) {
        const moonGMag = MU_MOON / (moonDist * moonDist);
        vel.x += -(dx / moonDist) * moonGMag * effectiveDt;
        vel.y += -(dy / moonDist) * moonGMag * effectiveDt;
      }

      if (inSOI) {
        const moonRelAngle = Math.atan2(dy, dx);
        if (!isNaN(moonPrevAngle)) {
          let dA = moonRelAngle - moonPrevAngle;
          if (dA >  Math.PI) dA -= 2 * Math.PI;
          if (dA < -Math.PI) dA += 2 * Math.PI;
          moonOrbitAngle += Math.abs(dA);
          if (i > 10 && moonOrbitAngle >= 2 * Math.PI * 1.05) break;
        }
        moonPrevAngle = moonRelAngle;
      } else {
        moonPrevAngle = NaN;
        const curAngle = Math.atan2(pos.y, pos.x);
        let dA = curAngle - prevAngle;
        if (dA >  Math.PI) dA -= 2 * Math.PI;
        if (dA < -Math.PI) dA += 2 * Math.PI;
        totalAngle += Math.abs(dA);
        prevAngle   = curAngle;
        if (i > 20 && totalAngle >= 2 * Math.PI * 1.02) break;
      }

      pos.x += vel.x * effectiveDt;
      pos.y += vel.y * effectiveDt;
      t     += effectiveDt;
      elapsed += effectiveDt;
    }

    pool.length = count;
    return pool;
  }

  /** Find the path index whose time is closest to the given mission time. */
  private _findNodeIdx(nodeTime: number): number {
    let bestIdx  = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < this.cachedPath.length; i++) {
      const diff = Math.abs(this.cachedPath[i].t - nodeTime);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    return bestIdx;
  }

  private _recomputePostNode(): void {
    if (!this.node) { this.postNodePath = []; this._postNodeEncounter = null; return; }

    const base = this.cachedPath[this._nodeIdx];
    if (!base)  { this.postNodePath = []; this._postNodeEncounter = null; return; }

    const prograde  = vec2.normalize(base.vel);
    const radialOut = vec2.normalize(base.pos);

    const newVel: Vec2 = {
      x: base.vel.x + this.node.progradeDV * prograde.x + this.node.normalDV * radialOut.x,
      y: base.vel.y + this.node.progradeDV * prograde.y + this.node.normalDV * radialOut.y,
    };

    const moonPosBase = getMoonPosition(base.t);
    const baseInSOI   = vec2.length(vec2.sub(base.pos, moonPosBase)) < MOON_SOI;
    let pnTime: number;
    let pnEarthDt: number;
    if (baseInSOI) {
      const moonVelBase  = getMoonVelocity(base.t);
      const relPosBase   = vec2.sub(base.pos, moonPosBase);
      const relVelBase   = vec2.sub(newVel, moonVelBase);
      const lunarOrbBase = computeOrbitalElements(relPosBase, relVelBase, MU_MOON, R_MOON);
      const lunarPeriodB = isFinite(lunarOrbBase.period) && lunarOrbBase.period > 0 ? lunarOrbBase.period : 8_800;
      pnTime    = Math.min(lunarPeriodB * 2.5, 3 * 86_400);
      pnEarthDt = 2;
    } else {
      const orb    = computeOrbitalElements(base.pos, newVel);
      const period = isFinite(orb.period) && orb.period > 0 ? orb.period : 4 * 86_400;
      pnTime    = Math.min(period * 2.5, 365 * 86_400);
      pnEarthDt = Math.max(10, period / 200);
    }
    this.postNodePath        = this._predictPath(this._pnPool, base.pos, newVel, base.t, pnTime, pnEarthDt);
    this._postNodeEncounter  = this._findEncounter(this.postNodePath);
  }

  // ─── Encounter Detection ──────────────────────────────────────────────────

  private _findEncounter(path: TrajPoint[]): MoonEncounter | null {
    let entryIdx   = -1;
    let closestIdx = -1;
    let minDist    = Infinity;

    for (let i = 0; i < path.length; i++) {
      const pt = path[i];
      if (!pt.inMoonSOI) continue;

      if (entryIdx === -1) entryIdx = i;

      const moonPos = getMoonPosition(pt.t);
      const dist    = vec2.length(vec2.sub(pt.pos, moonPos)) - R_MOON;
      if (dist < minDist) { minDist = dist; closestIdx = i; }
    }

    if (entryIdx === -1) return null;
    // Already in SOI at trajectory start — this is current orbital state, not a future encounter
    if (entryIdx === 0) return null;

    return {
      entryIdx,
      entryT:                 path[entryIdx].t,
      closestIdx,
      closestDistFromSurface: minDist,
      isImpact:               minDist < 0,
    };
  }

  // ─── Interaction ─────────────────────────────────────────────────────────

  handleClick(mx: number, my: number): boolean {
    if (this._didPan) { this._didPan = false; return false; }

    if (this.node && this._nodeScreenPt) {
      const d = Math.hypot(mx - this._nodeScreenPt.x, my - this._nodeScreenPt.y);
      if (d < 14) {
        this.node = null;
        this.postNodePath = [];
        this._postNodeEncounter = null;
        return true;
      }
    }

    if (this.cachedPath.length === 0) return false;

    let bestIdx = -1, bestDist = 22;
    for (let i = 0; i < this.cachedPath.length; i++) {
      const sp = this._w2s(this._displayPos(this.cachedPath[i], this._moonPosAtRender));
      const d  = Math.hypot(mx - sp.x, my - sp.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    if (bestIdx >= 0) {
      const pt = this.cachedPath[bestIdx];
      this.node     = { time: pt.t, progradeDV: 0, normalDV: 0, executed: false };
      this._nodeIdx = bestIdx;
      this._recomputePostNode();
      return true;
    }

    return false;
  }

  handleMouseDown(mx: number, my: number): void {
    this._didPan  = false;
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
          this._dragging  = label;
          this._dragLastX = mx;
          this._dragLastY = my;
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
        case 'prograde':   this.node.progradeDV += (dx * pv.x + dy * pv.y) * DV_PER_PX; break;
        case 'retrograde': this.node.progradeDV -= (dx * pv.x + dy * pv.y) * DV_PER_PX; break;
        case 'normal':     this.node.normalDV   += (dx * nr.x + dy * nr.y) * DV_PER_PX; break;
        case 'antinormal': this.node.normalDV   -= (dx * nr.x + dy * nr.y) * DV_PER_PX; break;
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

    // Mouse position in canvas space
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // World point currently under the mouse — capture BEFORE zoom changes eMpp
    const eMppBefore = this.eMpp;
    const worldX =  (mx - this.W / 2 - this.panX) * eMppBefore;
    const worldY = -(my - this.H / 2 - this.panY) * eMppBefore;

    this.userScale = Math.max(0.005, Math.min(80, this.userScale * factor));

    // Re-pin that world point under the mouse with the new eMpp
    const eMppAfter = this.eMpp;
    this.panX = mx - this.W / 2 - worldX / eMppAfter;
    this.panY = my - this.H / 2 + worldY / eMppAfter;
  }

  resetView(): void {
    this.panX = 0;
    this.panY = 0;
    // Zoom out so the Moon's orbit fills ~38% of the smaller screen dimension.
    // mpp = R_EARTH / (H * 0.20) is computed in render(), but we can derive it here.
    const mppNow = R_EARTH / (this.H * 0.20);
    const screenR = Math.min(this.W, this.H) * 0.38;
    this.userScale = (mppNow * screenR) / MOON_ORBIT_RADIUS;
  }

  // ─── Drawing Helpers ──────────────────────────────────────────────────────

  private get eMpp(): number { return this.mpp / this.userScale; }

  private _w2s(world: Vec2): Vec2 {
    return {
      x: this.W / 2 + world.x / this.eMpp + this.panX,
      y: this.H / 2 - world.y / this.eMpp + this.panY,
    };
  }

  /** Returns the display-world position for a trajectory point.
   *  SOI points are shown Moon-relative (moonPosNow + moonRelPos) so the
   *  orbit arc appears fixed relative to the Moon graphic even as the Moon moves. */
  private _displayPos(pt: TrajPoint, moonPosNow: Vec2): Vec2 {
    if (pt.inMoonSOI && pt.moonRelPos) {
      return { x: moonPosNow.x + pt.moonRelPos.x, y: moonPosNow.y + pt.moonRelPos.y };
    }
    return pt.pos;
  }

  // ─── Draw Trajectory ──────────────────────────────────────────────────────

  private _drawTrajectory(path: TrajPoint[], isPlanned: boolean, moonPosNow: Vec2): void {
    const ctx = this.ctx;
    const n   = path.length;
    if (n < 2) return;

    ctx.save();
    ctx.setLineDash([]);

    for (let i = 1; i < n; i++) {
      const frac  = i / n;
      const alpha = Math.max(0.08, (isPlanned ? 0.80 : 0.82) - frac * 0.72);

      const s0 = this._w2s(this._displayPos(path[i - 1], moonPosNow));
      const s1 = this._w2s(this._displayPos(path[i],     moonPosNow));

      if (s0.x < -300 && s1.x < -300) continue;
      if (s0.x > this.W + 300 && s1.x > this.W + 300) continue;

      const inSOI  = path[i].inMoonSOI;
      const alt    = vec2.length(path[i].pos) - R_EARTH;
      const inAtmo = !inSOI && this.atmo.isInAtmosphere(alt);

      let color: string;
      if (inSOI) {
        color = isPlanned
          ? `rgba(100,255,200,${alpha.toFixed(2)})`
          : `rgba(60,220,160,${alpha.toFixed(2)})`;
      } else if (inAtmo) {
        color = isPlanned
          ? `rgba(255,200,80,${alpha.toFixed(2)})`
          : `rgba(255,150,50,${alpha.toFixed(2)})`;
      } else {
        color = isPlanned
          ? `rgba(255,210,0,${alpha.toFixed(2)})`
          : `rgba(0,210,255,${alpha.toFixed(2)})`;
      }

      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.strokeStyle = color;
      ctx.lineWidth   = isPlanned ? 2.5 : 2;
      ctx.stroke();
    }

    // Direction chevrons
    const step = Math.max(8, Math.floor(n / 10));
    for (let i = step; i < n - 1; i += step) {
      const frac = i / n;
      if (frac > 0.88) break;

      const s0 = this._w2s(this._displayPos(path[i],     moonPosNow));
      const s1 = this._w2s(this._displayPos(path[i + 1], moonPosNow));
      const dx = s1.x - s0.x, dy = s1.y - s0.y;
      if (Math.hypot(dx, dy) < 5) continue;

      const alpha = Math.max(0.15, 0.55 - frac * 0.40);
      const inSOI = path[i].inMoonSOI;
      const arrowColor = inSOI
        ? `rgba(80,240,170,${alpha.toFixed(2)})`
        : isPlanned
          ? `rgba(255,220,60,${alpha.toFixed(2)})`
          : `rgba(0,220,255,${alpha.toFixed(2)})`;

      ctx.save();
      ctx.translate((s0.x + s1.x) / 2, (s0.y + s1.y) / 2);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo( 6,  0);
      ctx.lineTo(-4,  3.5);
      ctx.lineTo(-2,  0);
      ctx.lineTo(-4, -3.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Impact marker if trajectory ends near surface
    const last    = path[path.length - 1];
    const lastAlt = vec2.length(last.pos) - R_EARTH;
    if (lastAlt < 70_000 && !last.inMoonSOI) {
      const sp = this._w2s(last.pos);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,80,0,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = THEME.danger;
      ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('IMPACT', sp.x + 9, sp.y);
      ctx.textBaseline = 'alphabetic';
    }

    // Lunar impact marker — draw at Moon-relative display position
    if (last.inMoonSOI && last.moonRelPos) {
      const dist = Math.hypot(last.moonRelPos.x, last.moonRelPos.y);
      if (dist < R_MOON * 1.05) {
        const sp = this._w2s(this._displayPos(last, moonPosNow));
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,120,0,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = THEME.warning;
        ctx.font = 'bold 10px Courier New';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('LUNAR IMPACT', sp.x + 9, sp.y);
        ctx.textBaseline = 'alphabetic';
      }
    }

    ctx.restore();
  }

  // ─── Periapsis / Apoapsis markers ────────────────────────────────────────

  private _drawOrbMarkers(path: TrajPoint[], moonPosNow: Vec2): void {
    if (path.length < 2) return;

    // Single pass: split SOI vs Earth points without allocating two filtered arrays
    let soiCount = 0, earthCount = 0;
    let minD = Infinity, maxD = -Infinity;
    let minRel: Vec2 = { x: 0, y: 0 }, maxRel: Vec2 = { x: 0, y: 0 };
    let minR = Infinity, maxR = -Infinity;
    let minPos = path[0].pos, maxPos = path[0].pos;
    let firstEarthPos: Vec2 | null = null;

    for (const pt of path) {
      if (pt.inMoonSOI) {
        soiCount++;
        if (pt.moonRelPos) {
          const d = Math.hypot(pt.moonRelPos.x, pt.moonRelPos.y);
          if (d < minD) { minD = d; minRel = pt.moonRelPos; }
          if (d > maxD) { maxD = d; maxRel = pt.moonRelPos; }
        }
      } else {
        earthCount++;
        if (firstEarthPos === null) { firstEarthPos = pt.pos; minPos = pt.pos; maxPos = pt.pos; }
        const r = vec2.length(pt.pos);
        if (r < minR) { minR = r; minPos = pt.pos; }
        if (r > maxR) { maxR = r; maxPos = pt.pos; }
      }
    }

    if (soiCount > earthCount && soiCount > 4) {
      this._drawOrbMarkerMoon(minRel, moonPosNow, 'Pe', THEME.warning);
      this._drawOrbMarkerMoon(maxRel, moonPosNow, 'Ap', THEME.accent);
      return;
    }

    if (earthCount < 2 || firstEarthPos === null) return;
    // minPos / maxPos already found in the single pass above
    this._drawOrbMarker(minPos, 'Pe', THEME.warning);
    this._drawOrbMarker(maxPos, 'Ap', THEME.accent);
  }

  private _drawOrbMarkersPost(path: TrajPoint[]): void {
    if (path.length < 2) return;

    let minR = Infinity, maxR = -Infinity;
    let minPos: Vec2 | null = null, maxPos: Vec2 | null = null;
    let earthCount = 0;
    for (const pt of path) {
      if (pt.inMoonSOI) continue;
      earthCount++;
      const r = vec2.length(pt.pos);
      if (r < minR) { minR = r; minPos = pt.pos; }
      if (r > maxR) { maxR = r; maxPos = pt.pos; }
    }
    if (earthCount < 2 || minPos === null || maxPos === null) return;
    this._drawOrbMarker(minPos, 'Pe', '#ffcc00');
    this._drawOrbMarker(maxPos, 'Ap', '#ffaa00');
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
    const alt    = vec2.length(worldPos) - R_EARTH;
    const altStr = alt < 1_000_000
      ? `${(alt / 1000).toFixed(1)} km`
      : `${(alt / 1_000_000).toFixed(3)} Mm`;
    ctx.fillText(`${label}: ${altStr}`, sp.x + 8, sp.y - 4);
  }

  /** Same as _drawOrbMarker but takes Moon-relative position and shows Moon-relative altitude */
  private _drawOrbMarkerMoon(moonRelPos: Vec2, moonPosNow: Vec2, label: string, color: string): void {
    const ctx    = this.ctx;
    const dispW  = { x: moonPosNow.x + moonRelPos.x, y: moonPosNow.y + moonRelPos.y };
    const sp     = this._w2s(dispW);
    const alt    = Math.hypot(moonRelPos.x, moonRelPos.y) - R_MOON;

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'left';
    const altStr = alt < 0 ? 'SURFACE' : alt < 1_000_000
      ? `${(alt / 1000).toFixed(1)} km`
      : `${(alt / 1_000_000).toFixed(3)} Mm`;
    ctx.fillText(`${label}: ${altStr}`, sp.x + 8, sp.y - 4);
  }

  // ─── Moon Drawing ─────────────────────────────────────────────────────────

  private _drawMoon(missionTime: number): void {
    const ctx       = this.ctx;
    const moonWorld = getMoonPosition(missionTime);
    const moonSP    = this._w2s(moonWorld);
    const earthSP   = this._w2s({ x: 0, y: 0 });
    const moonR     = R_MOON            / this.eMpp;
    const soiR      = MOON_SOI          / this.eMpp;
    const orbitR    = MOON_ORBIT_RADIUS / this.eMpp;

    // Moon orbital path (very faint dashed ring)
    ctx.save();
    ctx.beginPath();
    ctx.arc(earthSP.x, earthSP.y, orbitR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,100,140,0.22)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 14]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // SOI boundary (dashed teal ring)
    ctx.save();
    ctx.beginPath();
    ctx.arc(moonSP.x, moonSP.y, Math.max(soiR, 4), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80,200,170,0.35)';
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // SOI label
    if (soiR > 10) {
      ctx.fillStyle = 'rgba(80,200,170,0.55)';
      ctx.font = '9px Courier New';
      ctx.textAlign = 'right';
      ctx.fillText('SOI', moonSP.x + soiR - 3, moonSP.y - 4);
    }

    // Moon body
    const drawR = Math.max(moonR, 4);
    const grad  = ctx.createRadialGradient(
      moonSP.x - drawR * 0.28, moonSP.y - drawR * 0.28, drawR * 0.04,
      moonSP.x, moonSP.y, drawR,
    );
    grad.addColorStop(0,   '#d0d0d0');
    grad.addColorStop(0.5, '#a0a0a0');
    grad.addColorStop(1,   '#585858');

    ctx.beginPath();
    ctx.arc(moonSP.x, moonSP.y, drawR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,200,220,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(210,210,230,0.9)';
    ctx.font = 'bold 10px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('MOON', moonSP.x + drawR + 5, moonSP.y + 4);
  }

  // ─── Encounter Marker ─────────────────────────────────────────────────────

  private _drawEncounterMarker(
    enc:          MoonEncounter,
    path:         TrajPoint[],
    missionTime:  number,
    isPlanned:    boolean,
  ): void {
    const ctx = this.ctx;
    const pt  = path[enc.entryIdx];
    if (!pt) return;

    const moonPosNow = getMoonPosition(missionTime);
    const sp    = this._w2s(this._displayPos(pt, moonPosNow));
    const color = isPlanned ? '#ffdd00' : '#00ffcc';

    // Entry ring
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
    ctx.fillStyle   = color + '44';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.8;
    ctx.stroke();

    // Closest approach marker
    const ca = path[enc.closestIdx];
    if (ca) {
      const caSP = this._w2s(this._displayPos(ca, moonPosNow));
      ctx.beginPath();
      ctx.arc(caSP.x, caSP.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = enc.isImpact ? THEME.danger : color;
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }

    // Info panel
    const timeToEnc = enc.entryT - missionTime;
    const distKm    = Math.max(0, enc.closestDistFromSurface / 1000).toFixed(0);
    const status    = enc.isImpact
      ? 'IMPACT TRAJECTORY'
      : enc.closestDistFromSurface < 5_000_000
        ? 'LUNAR ORBIT POSSIBLE'
        : 'LUNAR FLYBY';

    const statusColor = enc.isImpact ? THEME.danger
      : enc.closestDistFromSurface < 5_000_000 ? THEME.success
      : THEME.warning;

    const pw = 210, ph = 108;
    let px = sp.x + 14;
    if (px + pw > this.W - 10) px = sp.x - pw - 14;
    const py = Math.max(10, Math.min(this.H - ph - 10, sp.y - ph / 2));

    ctx.fillStyle = 'rgba(6,12,22,0.93)';
    this._roundRect(px, py, pw, ph, 6); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    this._roundRect(px, py, pw, ph, 6); ctx.stroke();

    ctx.fillStyle   = color;
    ctx.font        = 'bold 11px Courier New';
    ctx.textAlign   = 'center';
    ctx.fillText(isPlanned ? 'PLANNED ENCOUNTER' : 'MOON ENCOUNTER', px + pw / 2, py + 16);

    const rows: [string, string, string][] = [
      ['T−',    timeToEnc < 0 ? 'PAST' : this._fmtTime(timeToEnc), THEME.text],
      ['CA',    `${distKm} km`,                                      THEME.text],
      ['',      status,                                               statusColor],
    ];
    rows.forEach(([k, v, c], i) => {
      const ry = py + 32 + i * 22;
      if (k) {
        ctx.fillStyle = THEME.textDim; ctx.font = '10px Courier New'; ctx.textAlign = 'left';
        ctx.fillText(k, px + 10, ry);
      }
      ctx.fillStyle = c; ctx.font = k ? '10px Courier New' : 'bold 10px Courier New';
      ctx.textAlign = k ? 'right' : 'center';
      ctx.fillText(v, k ? px + pw - 10 : px + pw / 2, ry);
    });

    ctx.fillStyle = THEME.textDim; ctx.font = '9px Courier New'; ctx.textAlign = 'center';
    ctx.fillText('[click node to delete]', px + pw / 2, py + ph - 6);
  }

  // ─── Transfer Hints ───────────────────────────────────────────────────────

  private _drawTransferHints(rocket: Rocket, missionTime: number): void {
    const ctx     = this.ctx;
    const pos     = rocket.body.pos;
    const vel     = rocket.body.vel;

    // Skip transfer hints when already inside Moon SOI
    const moonPosTH = getMoonPosition(missionTime);
    if (vec2.length(vec2.sub(pos, moonPosTH)) < MOON_SOI) return;

    const orb = computeOrbitalElements(pos, vel);

    // Only meaningful when in orbit (not suborbital, not escaped)
    if (orb.periAlt < 0 || orb.apoAlt === Infinity) return;

    const moonPos   = getMoonPosition(missionTime);
    const moonOrbit = MOON_ORBIT_RADIUS - R_EARTH;
    const apoAlt    = orb.apoAlt;

    // Phase angle: how far ahead or behind the Moon is from the rocket's current position
    const moonAngle = Math.atan2(moonPos.y, moonPos.x);
    const rktAngle  = Math.atan2(pos.y, pos.x);
    let   angleDiff = moonAngle - rktAngle;
    while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const hints: string[] = [];

    if (apoAlt < moonOrbit * 0.7) {
      hints.push('▲ BURN PROGRADE to raise Ap toward Moon orbit');
    } else if (apoAlt >= moonOrbit * 0.7 && apoAlt <= moonOrbit * 1.4) {
      if (angleDiff > 0.35) {
        hints.push('↻ Moon is AHEAD — place node later or wait');
      } else if (angleDiff < -0.35) {
        hints.push('↺ Moon is BEHIND — place node earlier / burn now');
      } else {
        hints.push('✓ Ap near Moon orbit — add node at Pe to intercept');
      }
    } else if (apoAlt > moonOrbit * 1.4) {
      hints.push('▼ Ap past Moon orbit — trim retrograde to match');
    }

    if (hints.length === 0) return;

    const pw = 340, ph = 14 + hints.length * 18 + 10;
    const px = 16,  py = this.H - ph - 60;

    ctx.fillStyle   = 'rgba(6,12,22,0.85)';
    this._roundRect(px, py, pw, ph, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(60,140,220,0.4)'; ctx.lineWidth = 1;
    this._roundRect(px, py, pw, ph, 6); ctx.stroke();

    ctx.fillStyle = THEME.accentDim;
    ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'left';
    ctx.fillText('TRANSFER GUIDANCE', px + 10, py + 12);

    hints.forEach((h, i) => {
      ctx.fillStyle = THEME.text;
      ctx.font = '10px Courier New';
      ctx.fillText(h, px + 10, py + 26 + i * 18);
    });
  }

  // ─── Maneuver Node Marker + Handles ──────────────────────────────────────

  private _drawManeuverNode(missionTime: number, rocket: Rocket): void {
    if (!this.node) return;

    const base = this.cachedPath[this._nodeIdx];
    if (!base)  return;

    const ctx = this.ctx;
    const sp  = this._w2s(this._displayPos(base, this._moonPosAtRender));
    this._nodeScreenPt = sp;

    const vel  = base.vel;
    const prog = vec2.length(vel) > 1 ? vec2.normalize(vel) : { x: 1, y: 0 };
    // Radial direction: away from current body (Moon when in SOI, Earth otherwise)
    const radialBase = (base.inMoonSOI && base.moonRelPos) ? base.moonRelPos : base.pos;
    const rOut = vec2.normalize(radialBase);

    this._progradeScreenDir = { x: prog.x, y: -prog.y };
    this._radialScreenDir   = { x: rOut.x, y: -rOut.y };

    const pv = this._progradeScreenDir;
    const nr = this._radialScreenDir;

    const proArm   = HANDLE_R + Math.max(0,  this.node.progradeDV) * DV_VIS_PX;
    const retroArm = HANDLE_R + Math.max(0, -this.node.progradeDV) * DV_VIS_PX;
    const normArm  = HANDLE_R + Math.max(0,  this.node.normalDV)   * DV_VIS_PX;
    const antArm   = HANDLE_R + Math.max(0, -this.node.normalDV)   * DV_VIS_PX;

    this._progHandle     = { x: sp.x + pv.x * proArm,   y: sp.y + pv.y * proArm   };
    this._retroHandle    = { x: sp.x - pv.x * retroArm, y: sp.y - pv.y * retroArm };
    this._normHandle     = { x: sp.x + nr.x * normArm,  y: sp.y + nr.y * normArm  };
    this._antinormHandle = { x: sp.x - nr.x * antArm,   y: sp.y - nr.y * antArm   };

    ctx.save();

    const drawArm = (end: Vec2, color: string) => {
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    };
    drawArm(this._progHandle,     '#44ff88');
    drawArm(this._retroHandle,    '#ff4444');
    drawArm(this._normHandle,     '#ff88ff');
    drawArm(this._antinormHandle, '#44ffff');

    const drawHandle = (pos: Vec2, color: string, label: string) => {
      const HR = 10;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, HR, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.stroke();

      const ang = Math.atan2(pos.y - sp.y, pos.x - sp.x);
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.moveTo( HR * 0.55, 0); ctx.lineTo(-HR * 0.30,  HR * 0.38); ctx.lineTo(-HR * 0.30, -HR * 0.38);
      ctx.closePath(); ctx.fill(); ctx.restore();

      const lx = pos.x + (pos.x - sp.x) / Math.hypot(pos.x - sp.x, pos.y - sp.y || 1) * (HR + 10);
      const ly = pos.y + (pos.y - sp.y) / Math.hypot(pos.x - sp.x || 1, pos.y - sp.y) * (HR + 10);
      ctx.fillStyle = color; ctx.font = 'bold 9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly); ctx.textBaseline = 'alphabetic';
    };

    drawHandle(this._progHandle,     '#44ff88', 'PRO');
    drawHandle(this._retroHandle,    '#ff4444', 'RET');
    drawHandle(this._normHandle,     '#ff88ff', 'NOR');
    drawHandle(this._antinormHandle, '#44ffff', 'ANT');

    ctx.beginPath(); ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = THEME.warning; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#000'; ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Δ', sp.x, sp.y); ctx.textBaseline = 'alphabetic';

    ctx.restore();

    this._drawNodeInfoPanel(missionTime, sp, rocket);
  }

  private _drawNodeInfoPanel(missionTime: number, nodeSP: Vec2, rocket: Rocket): void {
    const ctx  = this.ctx;
    const node = this.node!;

    const totalDV    = Math.hypot(node.progradeDV, node.normalDV);
    const timeToNode = node.time - missionTime;

    const est        = rocket.getBurnEstimate(totalDV);
    const halfBurn   = isFinite(est.burnTime) ? est.burnTime / 2 : 0;
    const timeIgnit  = timeToNode - halfBurn;   // T- to ignition (centered burn)
    const dvShort    = est.hasEngines && totalDV > est.dvAvailable + 0.5;

    const pw = 220, ph = 168;
    const px = (nodeSP.x + 20 + pw < this.W) ? nodeSP.x + 20 : nodeSP.x - pw - 20;
    const py = Math.max(10, Math.min(this.H - ph - 10, nodeSP.y - ph / 2));

    ctx.fillStyle = 'rgba(8,14,24,0.92)';
    this._roundRect(px, py, pw, ph, 6); ctx.fill();
    ctx.strokeStyle = dvShort ? THEME.danger : THEME.warning; ctx.lineWidth = 1;
    this._roundRect(px, py, pw, ph, 6); ctx.stroke();

    ctx.fillStyle = THEME.warning; ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('MANEUVER NODE', px + pw / 2, py + 16);

    // Helper to format burn time (seconds → m:ss or s)
    const fmtBurn = (s: number): string => {
      if (!isFinite(s) || s > 99999) return '---';
      if (s < 60) return `${s.toFixed(1)} s`;
      return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    };

    const rows: Array<[string, string, string | null]> = [
      ['ΔV',    `${totalDV.toFixed(1)} m/s`,               dvShort ? 'danger' : 'accent'],
      ['PRO',   `${node.progradeDV.toFixed(1)} m/s`,        null],
      ['RAD',   `${node.normalDV.toFixed(1)} m/s`,          null],
      ['T−',    timeToNode < 0 ? 'PAST NODE' : this._fmtTime(timeToNode),
                                                             timeToNode >= 0 && timeToNode < 60 ? 'danger' : null],
      ['BURN',  est.hasEngines ? fmtBurn(est.burnTime) : 'no engine',
                                                             est.hasEngines ? null : 'danger'],
      ['IGNIT', timeToNode < 0 ? 'NOW' : timeIgnit < 0 ? 'BURN NOW' : this._fmtTime(timeIgnit),
                                                             timeIgnit < 30 && timeToNode >= 0 ? 'danger' : null],
      ['AVAIL', est.hasEngines ? `${est.dvAvailable.toFixed(0)} m/s` : '---',
                                                             dvShort ? 'danger' : 'success'],
    ];

    rows.forEach(([k, v, style], i) => {
      const ry = py + 32 + i * 18;
      ctx.fillStyle = THEME.textDim; ctx.font = '10px Courier New'; ctx.textAlign = 'left';
      ctx.fillText(k, px + 10, ry);
      ctx.fillStyle = style === 'danger'  ? THEME.danger
                    : style === 'success' ? THEME.success
                    : style === 'accent'  ? THEME.accent
                    : THEME.text;
      ctx.textAlign = 'right';
      ctx.fillText(v, px + pw - 10, ry);
    });

    if (dvShort) {
      ctx.fillStyle = THEME.danger; ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'center';
      ctx.fillText('⚠ INSUFFICIENT ΔV', px + pw / 2, py + ph - 18);
    }
    ctx.fillStyle = THEME.textDim; ctx.font = '9px Courier New'; ctx.textAlign = 'center';
    ctx.fillText('[click node to delete]', px + pw / 2, py + ph - 6);
  }

  // ─── Earth & Grid ─────────────────────────────────────────────────────────

  private _drawEarth(): void {
    const ctx    = this.ctx;
    const centre = this._w2s({ x: 0, y: 0 });
    const earthR = R_EARTH / this.eMpp;
    const atmoR  = (R_EARTH + 70_000) / this.eMpp;

    const atmoGrad = ctx.createRadialGradient(centre.x, centre.y, earthR * 0.95, centre.x, centre.y, atmoR);
    atmoGrad.addColorStop(0, 'rgba(80,160,255,0.4)');
    atmoGrad.addColorStop(1, 'rgba(0,60,120,0)');
    ctx.beginPath(); ctx.arc(centre.x, centre.y, atmoR, 0, Math.PI * 2);
    ctx.fillStyle = atmoGrad; ctx.fill();

    const earthGrad = ctx.createRadialGradient(
      centre.x - earthR * 0.3, centre.y - earthR * 0.3, earthR * 0.05,
      centre.x, centre.y, earthR,
    );
    earthGrad.addColorStop(0,   '#4a9eff');
    earthGrad.addColorStop(0.45,'#1d5ea8');
    earthGrad.addColorStop(0.8, '#164d30');
    earthGrad.addColorStop(1,   '#0d2244');
    ctx.beginPath(); ctx.arc(centre.x, centre.y, earthR, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad; ctx.fill();
  }

  private _drawGrid(missionTime: number): void {
    const ctx    = this.ctx;
    const centre = this._w2s({ x: 0, y: 0 });

    const moonOrbitAlt = MOON_ORBIT_RADIUS - R_EARTH;

    // Named reference rings: label, altitude (m), optional moon flag
    const RINGS: { alt: number; label: string; moon?: true }[] = [
      { alt: 100_000,    label: 'Kármán  100 km' },
      { alt: 500_000,    label: '500 km'          },
      { alt: 1_000_000,  label: '1 Mm'            },
      { alt: 3_000_000,  label: '3 Mm'            },
      { alt: 10_000_000, label: '10 Mm'           },
      { alt: moonOrbitAlt, label: 'Moon orbit', moon: true },
    ];

    // ── Post-node orbit range ──────────────────────────────────────────────
    // If a maneuver node is set, compute planned orbit Ap/Pe so we can light
    // up the rings that fall inside the planned orbit.
    let pnPe = -Infinity, pnAp = Infinity;
    let pnHasOrbit = false;
    if (this.postNodePath.length > 0) {
      const pt0 = this.postNodePath[0];
      if (!pt0.inMoonSOI) {
        const orb = computeOrbitalElements(pt0.pos, pt0.vel);
        if (isFinite(orb.periAlt)) {
          pnPe = orb.periAlt;
          pnAp = isFinite(orb.apoAlt) ? orb.apoAlt : Infinity;
          pnHasOrbit = true;
        }
      }
    }

    // Find the earth ring index closest to a given altitude
    const earthRings = RINGS.filter(r => !r.moon);
    const closestRingTo = (target: number): number => {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < earthRings.length; i++) {
        const d = Math.abs(earthRings[i].alt - target);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const apRingIdx = pnHasOrbit && isFinite(pnAp)  ? closestRingTo(pnAp) : -1;
    const peRingIdx = pnHasOrbit && pnPe > -Infinity ? closestRingTo(pnPe) : -1;

    ctx.textAlign = 'left';

    for (let i = 0; i < RINGS.length; i++) {
      const { alt, label, moon } = RINGS[i];
      const r = (R_EARTH + alt) / this.eMpp;
      const earthIdx = moon ? -1 : earthRings.findIndex(x => x.alt === alt);

      const isAp    = earthIdx >= 0 && earthIdx === apRingIdx;
      const isPe    = earthIdx >= 0 && earthIdx === peRingIdx;
      const inBand  = pnHasOrbit && !moon && alt >= pnPe && (pnAp === Infinity || alt <= pnAp);

      // Ring
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
      if (isAp) {
        ctx.strokeStyle = 'rgba(80,220,120,0.80)';
        ctx.lineWidth   = 1.4;
      } else if (isPe) {
        ctx.strokeStyle = 'rgba(255,200,60,0.80)';
        ctx.lineWidth   = 1.4;
      } else if (inBand) {
        ctx.strokeStyle = 'rgba(30,140,210,0.65)';
        ctx.lineWidth   = 0.8;
      } else if (moon) {
        ctx.strokeStyle = 'rgba(100,100,140,0.35)';
        ctx.lineWidth   = 0.5;
      } else {
        ctx.strokeStyle = 'rgba(30,80,120,0.50)';
        ctx.lineWidth   = 0.5;
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Label (right-side equatorial crossing of each ring)
      const labelX = centre.x + r + 4;
      const suffix  = isAp ? '  ← Ap' : isPe ? '  ← Pe' : '';
      ctx.font      = (isAp || isPe) ? 'bold 10px Courier New' : '10px Courier New';
      ctx.fillStyle = isAp
        ? 'rgba(80,230,120,0.95)'
        : isPe
        ? 'rgba(255,210,60,0.95)'
        : moon
        ? 'rgba(120,120,160,0.70)'
        : inBand
        ? 'rgba(80,160,220,0.90)'
        : 'rgba(60,110,160,0.80)';
      ctx.fillText(label + suffix, labelX, centre.y - 4);
    }

    void missionTime;
  }

  // ─── Rocket Marker ────────────────────────────────────────────────────────

  private _drawRocketMarker(rocket: Rocket, time: number): void {
    const ctx   = this.ctx;
    const sp    = this._w2s(rocket.body.pos);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);

    ctx.beginPath(); ctx.arc(sp.x, sp.y, 6 + pulse * 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,212,255,${0.3 + pulse * 0.4})`;
    ctx.lineWidth = 1.5; ctx.stroke();

    ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = THEME.accent; ctx.fill();

    const velScaled = vec2.scale(rocket.body.vel, 0.001 / this.eMpp);
    if (vec2.length(velScaled) > 2) {
      const velEnd = { x: sp.x + velScaled.x, y: sp.y - velScaled.y };
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(velEnd.x, velEnd.y);
      ctx.strokeStyle = THEME.success; ctx.lineWidth = 1.5; ctx.stroke();
    }

    ctx.fillStyle = THEME.text; ctx.font = '10px Courier New'; ctx.textAlign = 'left';
    ctx.fillText('▲ Rocket', sp.x + 8, sp.y + 4);
  }

  // ─── Orbital Info Panel ───────────────────────────────────────────────────

  private _drawOrbitalInfo(rocket: Rocket, missionTime: number): void {
    const ctx = this.ctx;
    const { W } = this;

    const moonPos   = getMoonPosition(missionTime);
    const relToMoon = vec2.sub(rocket.body.pos, moonPos);
    const moonDist  = vec2.length(relToMoon);
    const inSOI     = moonDist < MOON_SOI;

    let title: string;
    let rows: [string, string][];

    const fmtAlt = (alt: number, label?: string) => {
      if (alt < 0) return label ?? 'SUBORBITAL';
      return alt < 1_000_000
        ? `${(alt / 1000).toFixed(1)} km`
        : `${(alt / 1_000_000).toFixed(3)} Mm`;
    };

    if (inSOI) {
      const moonVel = getMoonVelocity(missionTime);
      const relVel  = vec2.sub(rocket.body.vel, moonVel);
      const orb     = computeOrbitalElements(relToMoon, relVel, MU_MOON, R_MOON);
      const surfAlt = moonDist - R_MOON;

      title = 'LUNAR ORBIT';
      rows = [
        ['Pe',  orb.periAlt < 0 ? 'IMPACT' : fmtAlt(orb.periAlt)],
        ['Ap',  orb.apoAlt === Infinity ? 'ESCAPE' : fmtAlt(orb.apoAlt)],
        ['Ecc', orb.ecc.toFixed(4)],
        ['Per', orb.period === Infinity ? '∞' : this._fmtTime(orb.period)],
        ['Alt', `${(surfAlt / 1000).toFixed(0)} km`],
      ];
    } else {
      const orb = computeOrbitalElements(rocket.body.pos, rocket.body.vel);
      title = 'ORBITAL DATA';
      rows = [
        ['Pe',  fmtAlt(orb.periAlt, 'SUBORBITAL')],
        ['Ap',  orb.apoAlt === Infinity ? 'ESCAPE' : fmtAlt(orb.apoAlt)],
        ['Ecc', orb.ecc.toFixed(4)],
        ['Per', orb.period === Infinity ? '∞' : this._fmtTime(orb.period)],
        ['SMA', orb.sma === Infinity ? '∞' : `${(orb.sma / 1000).toFixed(0)} km`],
      ];
    }

    const pw = 200, ph = rows.length * 22 + 36;
    const px = W - pw - 16, py = 60;

    ctx.fillStyle = 'rgba(8,14,24,0.88)';
    this._roundRect(px, py, pw, ph, 6); ctx.fill();
    ctx.strokeStyle = inSOI ? 'rgba(80,200,170,0.6)' : THEME.panelBorder;
    ctx.lineWidth = 1;
    this._roundRect(px, py, pw, ph, 6); ctx.stroke();

    ctx.fillStyle = inSOI ? 'rgba(80,220,180,1)' : THEME.accent;
    ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center';
    ctx.fillText(title, px + pw / 2, py + 18);

    rows.forEach(([k, v], i) => {
      const ry = py + 36 + i * 22;
      ctx.fillStyle = THEME.textDim; ctx.font = '10px Courier New'; ctx.textAlign = 'left';
      ctx.fillText(k, px + 10, ry);
      const danger = (k === 'Pe' && v === 'IMPACT') || (k === 'Pe' && v === 'SUBORBITAL');
      ctx.fillStyle = danger ? THEME.danger : THEME.text;
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
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,     y,     x + r, y,          r);
    ctx.closePath();
  }

  private _fmtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  }
}
