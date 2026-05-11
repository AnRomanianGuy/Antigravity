/**
 * Rocket.ts — Rocket assembly, staging logic, and physics interface.
 *
 * The Rocket class owns:
 *   • The ordered stack of PartInstances (bottom → top)
 *   • Stage assignments (which parts fire in which stage)
 *   • Computed aggregate properties: total mass, thrust, Isp, drag
 *   • Fuel consumption routing (drains from bottom-most tank first)
 *
 * Coordinate note:
 *   Parts are stored in "slot order": slot 0 = bottom of rocket (engine end).
 *   In the VAB the list is displayed top→bottom but stored bottom→top.
 */

import { RigidBody, StageData, PartType, vec2 } from './types';
import { PartInstance, isEnginePart, isDecouplerPart } from './Part';
import { R_EARTH, G0 } from './Physics';

// ─── Launch Site ──────────────────────────────────────────────────────────────

/** Launch site: Kennedy Space Center latitude ≈ 28.5° N */
const LAUNCH_LAT_RAD = 28.5 * (Math.PI / 180);

/** Surface rotation speed at KSC (m/s east) ≈ 407 m/s */
export const SURFACE_SPEED = R_EARTH * (2 * Math.PI / 86_400) * Math.cos(LAUNCH_LAT_RAD);

// ─── Rocket Class ─────────────────────────────────────────────────────────────

export class Rocket {
  /** Ordered part stack: index 0 = bottommost part (engine/heat-shield end) */
  parts: PartInstance[] = [];

  /** Stage data: stageIndex 0 fires first (press Space once), etc. */
  stages: StageData[] = [];

  /** Current highest stage that has been activated (−1 = none yet) */
  currentStage = -1;

  /** Physics body — initialised when rocket is placed on launchpad */
  body: RigidBody = {
    pos:    { x: 0, y: R_EARTH },
    vel:    { x: SURFACE_SPEED, y: 0 },
    angle:  0,
    angVel: 0,
    mass:   0,
  };

  /** Whether rocket has left the ground */
  hasLaunched = false;

  /** Whether rocket has been destroyed (crashed / overheated) */
  isDestroyed = false;

  /**
   * Velocity impulse (m/s) queued by the last decoupler separation.
   * Game.ts applies this to body.vel along the nose direction after staging.
   */
  pendingSeparationDV = 0;

  /** Current throttle 0–1, set by Game.ts each frame before physics.step */
  throttle = 0;

  constructor() {}

  // ─── VAB Assembly ───────────────────────────────────────────────────────────

  /**
   * Add a part to the top of the rocket stack in the VAB.
   * Automatically assigns a slot index.
   */
  addPartOnTop(type: PartType): PartInstance {
    const slot = this.parts.length;
    const inst = new PartInstance(type, slot);
    this.parts.push(inst);
    this._refreshMass();
    return inst;
  }

  /**
   * Remove a part by its ID (VAB editing).
   * Re-indexes remaining slots.
   */
  removePartById(id: string): void {
    const idx = this.parts.findIndex(p => p.id === id);
    if (idx === -1) return;
    this.parts.splice(idx, 1);
    for (let i = 0; i < this.parts.length; i++) {
      this.parts[i].slotIndex = i;
    }
    this._refreshMass();
    this._rebuildStages();
  }

  /** Clear all parts (reset for new build) */
  clearParts(): void {
    this.parts = [];
    this.stages = [];
    this.currentStage = -1;
    this._refreshMass();
  }

  /**
   * Insert a part at a specific slot index (0 = bottom/engine end).
   * Parts at or above the insertion point shift up by one.
   * @param type  Part type to add
   * @param slot  Target slot (clamps to valid range)
   */
  insertPartAt(type: PartType, slot: number, stageIndex = -1): PartInstance {
    const inst = new PartInstance(type, 0);
    inst.stageIndex = stageIndex;
    const s = Math.max(0, Math.min(slot, this.parts.length));
    this.parts.splice(s, 0, inst);
    for (let i = 0; i < this.parts.length; i++) this.parts[i].slotIndex = i;
    this._refreshMass();
    this._rebuildStages();
    return inst;
  }

  /** Total rendered height of the rocket stack in pixels (for VAB display) */
  get stackHeightPx(): number {
    return this.parts.reduce((sum, p) => sum + p.def.renderH, 0);
  }

  // ─── Staging ────────────────────────────────────────────────────────────────

  /**
   * Auto-generate stages based on part types.
   * Default strategy:
   *   • Each engine + its adjacent decoupler = one stage
   *   • Command pod/fairings are in stage −1 (always active / manual)
   * This produces sensible staging for a typical rocket without user input.
   */
  autoStage(): void {
    // Reset all
    for (const part of this.parts) part.stageIndex = -1;

    // Walk bottom → top.
    // Engines/SRBs fire in the current stage.
    // Each decoupler belongs to the NEXT stage together with the engines above it.
    //   S0: first-stage engines (fire on 1st Space)
    //   S1: decoupler + second-stage engines (separate & ignite on 2nd Space)
    //   S2: decoupler + third-stage engines …
    let stageIdx = 0;

    for (const part of this.parts) {
      if (isEnginePart(part.def.type)) {
        part.stageIndex = stageIdx;
      } else if (isDecouplerPart(part.def.type)) {
        stageIdx++;                  // advance — decoupler fires with the next engine group
        part.stageIndex = stageIdx;
      }
    }

    this._rebuildStages();
  }

  /**
   * Cycle a part's stage assignment: -1 → 0 → 1 → 2 → 3 → -1
   */
  cycleStage(partId: string): void {
    const part = this.parts.find(p => p.id === partId);
    if (!part) return;
    part.stageIndex = part.stageIndex < 3 ? part.stageIndex + 1 : -1;
    this._rebuildStages();
  }

  /**
   * Assign a part to a specific stage (called from staging screen).
   */
  assignStage(partId: string, stageIndex: number): void {
    const part = this.parts.find(p => p.id === partId);
    if (part) {
      part.stageIndex = stageIndex;
      this._rebuildStages();
    }
  }

  /**
   * Activate the next stage (Space key).
   * Fires engines and triggers decouplers assigned to currentStage + 1.
   * Returns true if a stage was activated, false if no more stages.
   */
  activateNextStage(): boolean {
    const nextStage = this.currentStage + 1;
    const stage = this.stages.find(s => s.stageIndex === nextStage);
    if (!stage) return false;

    this.currentStage = nextStage;

    const toSeparate: string[] = [];
    this.pendingSeparationDV = 0;

    for (const partId of stage.partIds) {
      const part = this.parts.find(p => p.id === partId);
      if (!part) continue;

      if (isEnginePart(part.def.type)) {
        part.isActive = true;
      } else if (isDecouplerPart(part.def.type)) {
        part.isActive = true;   // mark as blown
        toSeparate.push(partId);
        this.pendingSeparationDV += part.def.separationForce ?? 0;
      }
    }

    // Remove decouplers and everything below them
    this._separateAt(toSeparate);

    return true;
  }

  /**
   * Deactivate all engines (throttle cut).
   */
  cutEngines(): void {
    for (const part of this.parts) {
      if (isEnginePart(part.def.type)) part.isActive = false;
    }
  }

  // ─── Aggregate Physics Properties ───────────────────────────────────────────

  /** Total current mass (dry + remaining fuel) in kg */
  getTotalMass(): number {
    return this.parts.reduce((sum, p) => sum + p.currentMass, 0);
  }

  /**
   * Total thrust from all active (firing) engines in Newtons.
   * Uses this.throttle (set by Game.ts each frame).
   */
  getThrust(): number {
    return this.parts
      .filter(p => p.isThrusting)
      .reduce((sum, p) => sum + p.def.maxThrust * this.throttle, 0);
  }

  /**
   * Effective vacuum Isp of the active engine set (thrust-weighted average).
   * Used to compute mass flow: ṁ = F / (Isp · g₀).
   */
  getEffectiveIsp(): number {
    const engines = this.parts.filter(p => p.isThrusting);
    if (engines.length === 0) return 0;
    const totalThrust = engines.reduce((s, p) => s + p.def.maxThrust, 0);
    const weightedIsp = engines.reduce((s, p) => s + p.def.maxThrust * p.def.isp, 0);
    return totalThrust > 0 ? weightedIsp / totalThrust : 0;
  }

  /**
   * Effective drag coefficient.
   * Simplified: use the part with the largest cross section that faces the flow.
   * For a stack rocket, the bottom-most part dominates drag.
   */
  getEffectiveDragCoeff(): number {
    if (this.parts.length === 0) return 0;
    // Weighted average by cross-section
    const totalArea = this.parts.reduce((s, p) => s + p.def.crossSection, 0);
    if (totalArea === 0) return 0;
    return this.parts.reduce((s, p) => s + p.def.dragCoeff * p.def.crossSection, 0) / totalArea;
  }

  /**
   * Largest cross-section among all current parts (m²).
   * Used as the reference area for drag calculation.
   */
  getCrossSection(): number {
    return this.parts.reduce((max, p) => Math.max(max, p.def.crossSection), 0);
  }

  /**
   * Drain fuel from active tanks to satisfy `massKg` total consumption.
   * Drains from the bottom-most (closest to engine) tank first.
   * Deactivates engines when all fuel is gone.
   */
  consumeFuel(massKg: number): void {
    let remaining = massKg;

    // Find fuel tanks from bottom up (slot 0 = bottom)
    const tanks = this.parts
      .filter(p => p.hasFuel)
      .sort((a, b) => a.slotIndex - b.slotIndex);

    for (const tank of tanks) {
      if (remaining <= 0) break;
      const drained = tank.drainFuel(remaining);
      remaining -= drained;
    }

    // If no fuel left anywhere, cut engines
    if (!this.parts.some(p => p.hasFuel)) {
      this.cutEngines();
    }
  }

  /** True if any engine is actively burning */
  get isThrusting(): boolean {
    return this.parts.some(p => p.isThrusting);
  }

  /** Total fuel remaining across all tanks (kg) */
  get totalFuelRemaining(): number {
    return this.parts.reduce((s, p) => s + p.fuelRemaining, 0);
  }

  /** Max fuel capacity across all tanks (kg) — for HUD gauge */
  get totalFuelCapacity(): number {
    return this.parts.reduce((s, p) => s + p.def.maxFuelMass, 0);
  }

  /** Whether the rocket has a command pod (needed for SAS / reaction wheels) */
  get hasCommandPod(): boolean {
    return this.parts.some(p => p.def.type === PartType.COMMAND_POD);
  }

  /** Whether the rocket is sitting on the ground */
  get isOnGround(): boolean {
    return !this.hasLaunched;
  }

  /** True if any critical structural part (pod or tank) has been heat-destroyed */
  get hasDestroyedCriticalPart(): boolean {
    return this.parts.some(p => p.isDestroyed && (
      p.def.type === PartType.COMMAND_POD     ||
      p.def.type === PartType.COMMAND_POD_ADV ||
      p.def.type === PartType.FUEL_TANK_S     ||
      p.def.type === PartType.FUEL_TANK_L     ||
      p.def.type === PartType.FUEL_TANK_XL
    ));
  }

  // ─── Launch Initialisation ──────────────────────────────────────────────────

  /**
   * Place the rocket on the launchpad.
   * Positions it at Earth's surface pointing straight up.
   * Gives it Earth's surface rotation velocity (eastward).
   */
  placeOnLaunchpad(): void {
    // Launch from equatorial-ish position: (0, R_EARTH) — top of Earth
    // This makes +Y = up, which matches our coordinate system neatly.
    this.body.pos  = { x: 0, y: R_EARTH + 1 };   // +1m so altitude = 1m
    this.body.vel  = { x: SURFACE_SPEED, y: 0 };  // Earth's rotation
    this.body.angle  = 0;                           // pointing up
    this.body.angVel = 0;
    this.body.mass   = this.getTotalMass();
    this.hasLaunched = false;
    this.isDestroyed = false;
    this.currentStage = -1;

    // Reset all part thermal state and deactivate engines
    for (const part of this.parts) {
      if (isEnginePart(part.def.type)) {
        part.isActive = false;
      }
      part.currentTemperature = 293;
      part.heatDamage = 0;
      part.isDestroyed = false;
    }
  }

  // ─── Cloning (for trajectory prediction) ─────────────────────────────────

  /**
   * Create a lightweight clone of this rocket for numerical integration
   * in MapView trajectory prediction.  Only copies what physics needs.
   */
  cloneForPrediction(): Rocket {
    const clone = new Rocket();
    clone.parts = this.parts.map(p => p.clone());
    clone.stages = this.stages.map(s => ({ ...s, partIds: [...s.partIds] }));
    clone.currentStage = this.currentStage;
    clone.body = {
      pos:    vec2.clone(this.body.pos),
      vel:    vec2.clone(this.body.vel),
      angle:  this.body.angle,
      angVel: this.body.angVel,
      mass:   this.body.mass,
    };
    return clone;
  }

  // ─── Delta-V Budget ─────────────────────────────────────────────────────────

  /**
   * Compute total remaining ΔV using the Tsiolkovsky rocket equation:
   *   ΔV = Isp · g₀ · ln(m₀ / m_dry)
   * Summed across all remaining stages.
   */
  getDeltaV(): number {
    // Use all engine parts (not just thrusting) so VAB shows correct ΔV.
    const engines = this.parts.filter(p => isEnginePart(p.def.type));
    if (engines.length === 0) return 0;

    const totalThrust  = engines.reduce((s, p) => s + p.def.maxThrust, 0);
    const weightedIsp  = engines.reduce((s, p) => s + p.def.maxThrust * p.def.isp, 0);
    const isp          = totalThrust > 0 ? weightedIsp / totalThrust : 0;
    if (isp <= 0) return 0;

    const m0    = this.getTotalMass();
    const m_dry = this.parts.reduce((s, p) => s + p.def.dryMass, 0);

    if (m_dry <= 0 || m0 <= m_dry) return 0;
    return isp * G0 * Math.log(m0 / m_dry);
  }

  /**
   * Burn estimate for a planned maneuver of `plannedDV` m/s.
   *
   * Selects candidate engines in priority order:
   *   1. Currently active (firing) engines
   *   2. Engines in the next staged (but not yet activated) stage
   *   3. Any surviving engine (last resort)
   *
   * Returns vacuum Isp, vacuum thrust, burn time, available ΔV, and
   * whether any engines were found.  All values are 0 / Infinity if no
   * engines are present.
   */
  getBurnEstimate(plannedDV: number): {
    isp:         number;
    thrust:      number;
    burnTime:    number;
    dvAvailable: number;
    hasEngines:  boolean;
  } {
    const NO_ENGINE = { isp: 0, thrust: 0, burnTime: Infinity, dvAvailable: 0, hasEngines: false };

    // 1. Active (currently firing) engines
    let candidates = this.parts.filter(
      p => p.isActive && isEnginePart(p.def.type) && !p.isDestroyed,
    );

    // 2. Engines in the next unactivated stage
    if (candidates.length === 0) {
      const nextStages = this.stages
        .filter(s => s.stageIndex > this.currentStage)
        .sort((a, b) => a.stageIndex - b.stageIndex);
      for (const stage of nextStages) {
        const ids = new Set(stage.partIds);
        const eng = this.parts.filter(
          p => ids.has(p.id) && isEnginePart(p.def.type) && !p.isDestroyed,
        );
        if (eng.length > 0) { candidates = eng; break; }
      }
    }

    // 3. Any surviving engine
    if (candidates.length === 0) {
      candidates = this.parts.filter(p => isEnginePart(p.def.type) && !p.isDestroyed);
    }

    if (candidates.length === 0) return NO_ENGINE;

    // Thrust-weighted vacuum Isp
    const thrust = candidates.reduce((s, p) => s + p.def.maxThrust, 0);
    const isp    = thrust > 0
      ? candidates.reduce((s, p) => s + p.def.maxThrust * p.def.isp, 0) / thrust
      : 0;

    if (isp <= 0 || thrust <= 0) return NO_ENGINE;

    const m0   = this.getTotalMass();
    const fuel = this.totalFuelRemaining;
    const mdry = m0 - fuel;

    // Available ΔV with current propellant
    const dvAvailable = mdry > 0 && m0 > mdry
      ? isp * G0 * Math.log(m0 / mdry)
      : 0;

    // Burn time for the planned ΔV (never more than available)
    const dvCapped = Math.min(plannedDV, dvAvailable + 1);
    const massFlow = thrust / (isp * G0);
    const m1       = m0 * Math.exp(-dvCapped / (isp * G0));
    const burnTime = massFlow > 0 ? (m0 - m1) / massFlow : Infinity;

    return { isp, thrust, burnTime, dvAvailable, hasEngines: true };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private _refreshMass(): void {
    this.body.mass = this.getTotalMass();
  }

  private _rebuildStages(): void {
    const map = new Map<number, string[]>();
    for (const part of this.parts) {
      if (part.stageIndex < 0) continue;
      if (!map.has(part.stageIndex)) map.set(part.stageIndex, []);
      map.get(part.stageIndex)!.push(part.id);
    }
    this.stages = Array.from(map.entries())
      .map(([idx, ids]) => ({ stageIndex: idx, partIds: ids }))
      .sort((a, b) => a.stageIndex - b.stageIndex);
  }

  /**
   * Remove decouplers (and everything below them) from the parts list.
   * @param decouplerIds  IDs of decouplers that were triggered
   */
  private _separateAt(decouplerIds: string[]): void {
    if (decouplerIds.length === 0) return;

    // Find the highest slot index among triggered decouplers
    let lowestSlot = Infinity;
    for (const id of decouplerIds) {
      const part = this.parts.find(p => p.id === id);
      if (part && part.slotIndex < lowestSlot) {
        lowestSlot = part.slotIndex;
      }
    }

    // Remove the decoupler and everything at or below its slot
    this.parts = this.parts.filter(p => p.slotIndex > lowestSlot);

    // Re-index remaining slots
    for (let i = 0; i < this.parts.length; i++) {
      this.parts[i].slotIndex = i;
    }

    this._refreshMass();
    this._rebuildStages();
  }
}
