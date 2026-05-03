/**
 * Part.ts — Part catalogue and PartInstance management.
 *
 * A PartDef is immutable static data (like a blueprint).
 * A PartInstance is a live copy placed on the rocket, with mutable fuel level,
 * active state, and staging assignment.
 */

import { PartDef, PartType } from './types';

// ─── Static Part Catalogue ────────────────────────────────────────────────────

/**
 * All available part blueprints.
 * Physics units: kg, N, seconds (Isp), m² (cross-section).
 * Render units: px (renderW, renderH) — scaled in VAB and flight renderer.
 */
export const PART_CATALOGUE: Record<PartType, PartDef> = {
  [PartType.COMMAND_POD]: {
    type: PartType.COMMAND_POD,
    name: 'Mk1 Command Pod',
    dryMass: 840,
    maxFuelMass: 0,
    maxThrust: 0,
    isp: 0,
    dragCoeff: 0.20,
    crossSection: 1.54,   // ≈ π*(0.7m)²  — 1.4m diameter capsule
    renderW: 44,
    renderH: 52,
    color: '#4a7fa5',
    description: 'Crewed command module with SAS reaction wheel.',
  },

  [PartType.FUEL_TANK_S]: {
    type: PartType.FUEL_TANK_S,
    name: 'FL-T400 Fuel Tank',
    dryMass: 500,
    maxFuelMass: 4500,
    maxThrust: 0,
    isp: 0,
    dragCoeff: 0.15,
    crossSection: 1.54,
    renderW: 44,
    renderH: 80,
    color: '#7a8a9a',
    description: 'Standard short fuel tank (4.5t propellant).',
  },

  [PartType.FUEL_TANK_L]: {
    type: PartType.FUEL_TANK_L,
    name: 'FL-T800 Fuel Tank',
    dryMass: 1000,
    maxFuelMass: 9000,
    maxThrust: 0,
    isp: 0,
    dragCoeff: 0.15,
    crossSection: 1.54,
    renderW: 44,
    renderH: 140,
    color: '#6a7a8a',
    description: 'Large fuel tank (9t propellant).',
  },

  [PartType.ENGINE]: {
    type: PartType.ENGINE,
    name: 'LV-T30 "Reliant" Engine',
    dryMass: 1250,
    maxFuelMass: 0,
    maxThrust: 215000,   // 215 kN
    isp: 310,            // vacuum Isp in seconds
    dragCoeff: 0.50,
    crossSection: 1.54,
    renderW: 44,
    renderH: 62,
    color: '#8a5a3a',
    description: 'Reliable liquid-fuel engine, 215 kN thrust.',
  },

  [PartType.DECOUPLER]: {
    type: PartType.DECOUPLER,
    name: 'TR-18A Stack Decoupler',
    dryMass: 400,
    maxFuelMass: 0,
    maxThrust: 0,
    isp: 0,
    dragCoeff: 0.10,
    crossSection: 1.54,
    renderW: 44,
    renderH: 20,
    color: '#aa8822',
    description: 'Separates rocket stages explosively.',
  },

  [PartType.FAIRING]: {
    type: PartType.FAIRING,
    name: 'Aerodynamic Fairing',
    dryMass: 300,
    maxFuelMass: 0,
    maxThrust: 0,
    isp: 0,
    dragCoeff: 0.05,     // very low drag — protects payload
    crossSection: 2.54,  // slightly wider
    renderW: 56,
    renderH: 100,
    color: '#3a5a7a',
    description: 'Reduces atmospheric drag on upper stages.',
  },

  [PartType.HEAT_SHIELD]: {
    type: PartType.HEAT_SHIELD,
    name: 'Mk1 Heat Shield',
    dryMass: 600,
    maxFuelMass: 0,
    maxThrust: 0,
    isp: 0,
    dragCoeff: 0.50,     // high drag — ablative braking
    crossSection: 1.77,  // slightly wider than fuselage
    renderW: 50,
    renderH: 20,
    color: '#2a2a2a',
    description: 'Ablative re-entry heat protection.',
  },
};

// ─── Part Instance ────────────────────────────────────────────────────────────

let _nextId = 1;

/**
 * A live instance of a part placed on the rocket.
 * Mutable state: fuel remaining, engine active, staging assignment.
 */
export class PartInstance {
  /** Unique ID for this instance (for staging references) */
  readonly id: string;

  /** Which blueprint this instance is based on */
  readonly def: PartDef;

  /** Remaining propellant in kg (always 0 for non-tanks) */
  fuelRemaining: number;

  /**
   * Engine: whether it is currently burning.
   * Decoupler: whether it has been triggered (and should be removed).
   */
  isActive: boolean;

  /**
   * Which stage (0-based index) this part is assigned to.
   * -1 means "always on" (e.g., command pod reacts wheel is always active).
   */
  stageIndex: number;

  /**
   * Slot in the VAB stack (0 = bottom-most part).
   * Used for ordering parts and computing render positions.
   */
  slotIndex: number;

  constructor(type: PartType, slotIndex: number) {
    this.id = `part_${_nextId++}`;
    this.def = PART_CATALOGUE[type];
    this.fuelRemaining = this.def.maxFuelMass;
    this.isActive = false;
    this.stageIndex = -1;
    this.slotIndex = slotIndex;
  }

  /** Current total mass of this part (dry + remaining fuel) */
  get currentMass(): number {
    return this.def.dryMass + this.fuelRemaining;
  }

  /** True if this part can produce thrust (engine + active + has fuel somewhere) */
  get isThrusting(): boolean {
    return this.def.type === PartType.ENGINE && this.isActive;
  }

  /** True if this part is a fuel tank that still has propellant */
  get hasFuel(): boolean {
    return this.def.maxFuelMass > 0 && this.fuelRemaining > 0;
  }

  /** Drain up to `amount` kg of fuel, returns how much was actually drained */
  drainFuel(amount: number): number {
    const drained = Math.min(amount, this.fuelRemaining);
    this.fuelRemaining -= drained;
    return drained;
  }

  /** Deep clone for physics prediction (map view trajectory) */
  clone(): PartInstance {
    const copy = new PartInstance(this.def.type, this.slotIndex);
    // Override auto-assigned id to keep same reference for stages
    (copy as { id: string }).id = this.id;
    copy.fuelRemaining = this.fuelRemaining;
    copy.isActive = this.isActive;
    copy.stageIndex = this.stageIndex;
    return copy;
  }
}

// ─── Part palette order for VAB UI ───────────────────────────────────────────

/** Ordered list of part types shown in the VAB parts panel */
export const VAB_PALETTE: PartType[] = [
  PartType.COMMAND_POD,
  PartType.FAIRING,
  PartType.FUEL_TANK_L,
  PartType.FUEL_TANK_S,
  PartType.ENGINE,
  PartType.DECOUPLER,
  PartType.HEAT_SHIELD,
];
