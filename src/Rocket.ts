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
import { PartInstance } from './Part';
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
    // Re-index slots
    for (let i = 0; i < this.parts.length; i++) {
      this.parts[i].slotIndex = i;
    }
    this._refreshMass();
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
  insertPartAt(type: PartType, slot: number): PartInstance {
    const inst = new PartInstance(type, 0);
    const s = Math.max(0, Math.min(slot, this.parts.length));
    this.parts.splice(s, 0, inst);
    for (let i = 0; i < this.parts.length; i++) this.parts[i].slotIndex = i;
    this._refreshMass();
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
    this.stages = [];
    let stageIdx = 0;

    // Walk from bottom to top; engines and their decouplers go into stages
    for (const part of this.parts) {
      if (part.def.type === PartType.ENGINE || part.def.type === PartType.DECOUPLER) {
        part.stageIndex = stageIdx;
      } else {
        part.stageIndex = -1;
      }
    }

    // Group parts by stageIndex
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

    for (const partId of stage.partIds) {
      const part = this.parts.find(p => p.id === partId);
      if (!part) continue;

      if (part.def.type === PartType.ENGINE) {
        part.isActive = true;
      } else if (part.def.type === PartType.DECOUPLER) {
        part.isActive = true;   // mark as blown
        toSeparate.push(partId);
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
      if (part.def.type === PartType.ENGINE) {
        part.isActive = false;
      }
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

    // Make sure no engines are active on the pad
    for (const part of this.parts) {
      if (part.def.type === PartType.ENGINE) part.isActive = false;
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
    const engines = this.parts.filter(p => p.def.type === PartType.ENGINE);
    if (engines.length === 0) return 0;

    const isp   = this.getEffectiveIsp();
    const m0    = this.getTotalMass();
    const m_dry = this.parts.reduce((s, p) => s + p.def.dryMass, 0);

    if (m_dry <= 0 || m0 <= m_dry) return 0;
    return isp * G0 * Math.log(m0 / m_dry);
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
