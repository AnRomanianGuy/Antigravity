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
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.20,
    crossSection: 1.54,
    renderW: 44,
    renderH: 52,
    color: '#4a7fa5',
    description: 'Crewed command module with SAS reaction wheel.',
    maxTemperature: 1800,
    heatResistance: 0.40,
  },

  [PartType.FUEL_TANK_S]: {
    type: PartType.FUEL_TANK_S,
    name: 'FL-T400 Fuel Tank',
    dryMass: 500,
    maxFuelMass: 4500,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.15,
    crossSection: 1.54,
    renderW: 44,
    renderH: 80,
    color: '#7a8a9a',
    description: 'Standard short fuel tank (4.5t propellant).',
    maxTemperature: 1400,
    heatResistance: 0.15,
  },

  [PartType.FUEL_TANK_L]: {
    type: PartType.FUEL_TANK_L,
    name: 'FL-T800 Fuel Tank',
    dryMass: 1000,
    maxFuelMass: 9000,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.15,
    crossSection: 1.54,
    renderW: 44,
    renderH: 140,
    color: '#6a7a8a',
    description: 'Large fuel tank (9t propellant).',
    maxTemperature: 1400,
    heatResistance: 0.15,
  },

  [PartType.ENGINE]: {
    type: PartType.ENGINE,
    name: 'LV-T30 Booster',
    dryMass: 1250,
    maxFuelMass: 0,
    maxThrust: 250_000,  // vacuum thrust, N
    isp: 350,            // vacuum Isp, s
    ispSL: 310,          // sea-level Isp (atmosphere reduces nozzle efficiency)
    thrustSL: 0.92,      // 92% thrust at sea level = 230 kN
    dragCoeff: 0.50,
    crossSection: 1.54,
    renderW: 44,
    renderH: 62,
    color: '#8a5a3a',
    description: 'High-thrust launch engine. 250 kN vac / 230 kN SL.',
    maxTemperature: 2000,
    heatResistance: 0.55,
  },

  [PartType.ENGINE_VACUUM]: {
    type: PartType.ENGINE_VACUUM,
    name: 'LV-909 Terrier',
    dryMass: 390,
    maxFuelMass: 0,
    maxThrust: 80_000,   // vacuum thrust, N
    isp: 420,            // high vacuum Isp
    ispSL: 40,           // nearly useless at sea level (large nozzle stalls)
    thrustSL: 0.10,      // 10% thrust at sea level — do NOT use for launch
    dragCoeff: 0.35,
    crossSection: 1.77,  // large bell
    renderW: 50,
    renderH: 55,
    color: '#4a6a9a',
    description: 'Vacuum-optimised upper-stage engine. 80 kN / Isp 420s vac.',
    maxTemperature: 2000,
    heatResistance: 0.55,
  },

  [PartType.DECOUPLER]: {
    type: PartType.DECOUPLER,
    name: 'TR-18A Stack Decoupler',
    dryMass: 400,
    maxFuelMass: 0,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.10,
    crossSection: 1.54,
    renderW: 44,
    renderH: 20,
    color: '#aa8822',
    description: 'Separates rocket stages explosively.',
    maxTemperature: 1600,
    heatResistance: 0.25,
  },

  [PartType.FAIRING]: {
    type: PartType.FAIRING,
    name: 'Aerodynamic Fairing',
    dryMass: 300,
    maxFuelMass: 0,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.05,
    crossSection: 2.54,
    renderW: 56,
    renderH: 100,
    color: '#3a5a7a',
    description: 'Reduces atmospheric drag on upper stages.',
    maxTemperature: 1200,
    heatResistance: 0.10,
  },

  [PartType.HEAT_SHIELD]: {
    type: PartType.HEAT_SHIELD,
    name: 'Mk1 Heat Shield',
    dryMass: 600,
    maxFuelMass: 0,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.50,
    crossSection: 1.77,
    renderW: 50,
    renderH: 20,
    color: '#2a2a2a',
    description: 'Ablative re-entry heat protection. Place at the bottom for reentry.',
    maxTemperature: 3500,
    heatResistance: 0.95,
  },

  [PartType.SRB]: {
    type: PartType.SRB,
    name: 'RT-10 Hammer SRBs',  // always a symmetric pair
    dryMass: 900,                // 450 kg × 2
    maxFuelMass: 20_000,         // 10 t × 2 (one per booster)
    maxThrust: 560_000,          // 280 kN × 2 boosters
    isp: 230,
    ispSL: 220,
    thrustSL: 0.96,
    ignoreThrottle: true,        // solid fuel — always full throttle
    radialMount: true,           // mounts on the sides, not stacked vertically
    dragCoeff: 0.30,
    crossSection: 1.00,
    renderW: 36,
    renderH: 100,
    color: '#5a3a2a',
    description: 'Pair of solid boosters mounted on the sides. 560 kN total, always full thrust.',
    maxTemperature: 1800,
    heatResistance: 0.50,
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

  /** Current temperature in Kelvin (ambient = 293 K) */
  currentTemperature = 293;

  /** Heat damage accumulator 0–1; reaches 1 when part is destroyed */
  heatDamage = 0;

  /** True when heat damage has destroyed this part */
  isDestroyed = false;

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

  /** True if this part can produce thrust (engine + active + not destroyed) */
  get isThrusting(): boolean {
    return (this.def.type === PartType.ENGINE || this.def.type === PartType.ENGINE_VACUUM || this.def.type === PartType.SRB)
      && this.isActive && !this.isDestroyed;
  }

  /** True if this part is a fuel tank that still has propellant and is intact */
  get hasFuel(): boolean {
    return this.def.maxFuelMass > 0 && this.fuelRemaining > 0 && !this.isDestroyed;
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
    copy.currentTemperature = this.currentTemperature;
    copy.heatDamage = this.heatDamage;
    copy.isDestroyed = this.isDestroyed;
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
  PartType.ENGINE_VACUUM,
  PartType.SRB,
  PartType.DECOUPLER,
  PartType.HEAT_SHIELD,
];
