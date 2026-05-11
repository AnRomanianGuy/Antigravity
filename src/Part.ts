/**
 * Part.ts — Part catalogue and PartInstance management.
 *
 * A PartDef is immutable static data (like a blueprint).
 * A PartInstance is a live copy placed on the rocket, with mutable fuel level,
 * active state, and staging assignment.
 */

import { PartDef, PartType } from './types';

// ─── Part-type helpers ────────────────────────────────────────────────────────

/** True for any part that can produce thrust (engine or SRB). */
export function isEnginePart(type: PartType): boolean {
  return type === PartType.ENGINE
      || type === PartType.ENGINE_VACUUM
      || type === PartType.ENGINE_VAC_ADV
      || type === PartType.ENGINE_HEAVY
      || type === PartType.ENGINE_NTR
      || type === PartType.SRB;
}

/** True for any decoupler type. */
export function isDecouplerPart(type: PartType): boolean {
  return type === PartType.DECOUPLER
      || type === PartType.DECOUPLER_HEAVY;
}

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

  // ── Advanced / lunar-capable parts ───────────────────────────────────────────

  /**
   * LV-1 Condor — high-expansion vacuum engine.
   * Altitude-based efficiency: 20 % below 20 km, ramps to 100 % at 70 km.
   * Ideal for circularisation, TLI burns, and plane changes; useless for launch.
   */
  [PartType.ENGINE_VAC_ADV]: {
    type: PartType.ENGINE_VAC_ADV,
    name: 'LV-1 Condor',
    dryMass: 900,
    maxFuelMass: 0,
    maxThrust: 150_000,   // vacuum thrust, N
    isp: 450,             // vacuum Isp, s — better than LV-909
    ispSL: 25,            // terrible at sea level; large bell stalls
    thrustSL: 0.20,       // 20 % thrust at sea level
    altitudeVacuum: 70_000, // reaches 100 % efficiency at 70 km (Kerman Line)
    dragCoeff: 0.38,
    crossSection: 2.40,   // very large expansion bell
    renderW: 56,
    renderH: 72,
    color: '#1a3a6a',
    description: 'Space engine. 20 % efficient below 20 km, 100 % above 70 km. 150 kN / Isp 450 s vac.',
    maxTemperature: 2200,
    heatResistance: 0.60,
  },

  /**
   * FL-TX1200 Transfer Tank — extra-large propellant tank for orbital stages.
   * Holds 12 t of propellant; designed for long burns without restaging.
   */
  [PartType.FUEL_TANK_XL]: {
    type: PartType.FUEL_TANK_XL,
    name: 'FL-TX1200 Tank',
    dryMass: 1500,
    maxFuelMass: 12_000,  // 12 t propellant — 1.5× FL-T800
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.15,
    crossSection: 1.77,
    renderW: 50,
    renderH: 200,         // visibly taller than FL-T800
    color: '#3a4a5a',
    description: 'Extra-large transfer tank (12 t propellant). For orbital and lunar stages.',
    maxTemperature: 1400,
    heatResistance: 0.15,
  },

  /**
   * Mk2 Advanced Pod — improved command module.
   * Lighter than Mk1, higher heat resistance for steeper reentry.
   */
  [PartType.COMMAND_POD_ADV]: {
    type: PartType.COMMAND_POD_ADV,
    name: 'Mk2 Command Pod',
    dryMass: 660,         // 180 kg lighter than Mk1
    maxFuelMass: 0,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.18,
    crossSection: 1.54,
    renderW: 48,
    renderH: 56,
    color: '#1a4a7a',
    description: 'Improved capsule. Lighter than Mk1, survives steeper reentry. SAS included.',
    maxTemperature: 2400,   // vs Mk1 1800 K
    heatResistance: 0.55,   // vs Mk1 0.40
  },

  /**
   * Mk2-XL Heat Shield — heavy ablative shield for high-speed reentry.
   * Rated for lunar return velocities (~11 km/s).
   */
  [PartType.HEAT_SHIELD_HEAVY]: {
    type: PartType.HEAT_SHIELD_HEAVY,
    name: 'Mk2 Heavy Shield',
    dryMass: 900,
    maxFuelMass: 0,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.55,
    crossSection: 2.20,   // slightly wider — covers more of the base
    renderW: 52,
    renderH: 26,
    color: '#0e0e0e',
    description: 'Reentry protection. Handles high-speed lunar reentry. Must face prograde during descent.',
    maxTemperature: 4800,   // vs Mk1 3500 K
    heatResistance: 0.98,   // vs Mk1 0.95
  },

  // ── Orbital / transfer-capable parts ─────────────────────────────────────────

  /**
   * K1 Mainsail — heavy first-stage booster.
   * 1 500 kN thrust at sea level; Isp 315 s vac / 285 s SL.
   * Lets a single stack reach orbit without needing SRBs.
   */
  [PartType.ENGINE_HEAVY]: {
    type: PartType.ENGINE_HEAVY,
    name: 'K1 Mainsail',
    dryMass: 3_000,
    maxFuelMass: 0,
    maxThrust:  1_500_000,   // 1 500 kN vacuum
    isp:         315,
    ispSL:       285,
    thrustSL:    0.93,       // 93 % at sea level = 1 395 kN
    dragCoeff:   0.55,
    crossSection: 2.54,
    renderW: 62,
    renderH: 82,
    color: '#7a2a0a',
    description: 'Heavy first-stage engine. 1 500 kN vac / 1 395 kN SL. Gets large rockets to orbit.',
    maxTemperature: 2200,
    heatResistance: 0.60,
  },

  /**
   * LV-N Nerva — nuclear thermal engine.
   * 35 kN / Isp 800 s vacuum; nearly useless below 50 km.
   * Pairs with FL-TX2400 for enormous transfer-stage ΔV.
   */
  [PartType.ENGINE_NTR]: {
    type: PartType.ENGINE_NTR,
    name: 'LV-N Nerva',
    dryMass: 2_200,
    maxFuelMass: 0,
    maxThrust:   35_000,     // 35 kN vacuum
    isp:          800,       // nuclear thermal Isp
    ispSL:         50,       // terrible — hot hydrogen stalls in thick air
    thrustSL:     0.08,      // 8 % at sea level
    altitudeVacuum: 70_000,  // full efficiency above Kármán line
    dragCoeff:    0.42,
    crossSection: 2.10,
    renderW: 52,
    renderH: 72,
    color: '#1a5a2a',
    description: 'Nuclear thermal engine. Isp 800 s / 35 kN vac. Useless below 50 km. Paired with FL-TX2400 for deep-space transfers.',
    maxTemperature: 3000,
    heatResistance: 0.75,
  },

  /**
   * FL-TX2400 — super-large transfer tank.
   * 24 t propellant; intended for NTR-powered orbital or interplanetary stages.
   */
  [PartType.FUEL_TANK_XXL]: {
    type: PartType.FUEL_TANK_XXL,
    name: 'FL-TX2400 Tank',
    dryMass: 1_800,
    maxFuelMass: 24_000,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    dragCoeff: 0.15,
    crossSection: 2.10,
    renderW: 52,
    renderH: 280,
    color: '#1e2e3e',
    description: 'Super-large transfer tank (24 t propellant). Use with Nerva NTR for massive ΔV budgets.',
    maxTemperature: 1400,
    heatResistance: 0.15,
  },

  /**
   * TR-XL Heavy Decoupler — engineered for large upper stages.
   * Higher mass tolerance; applies a small separation impulse on firing.
   */
  [PartType.DECOUPLER_HEAVY]: {
    type: PartType.DECOUPLER_HEAVY,
    name: 'TR-XL Decoupler',
    dryMass: 600,           // heavier than TR-18A (400 kg) — for structural loads
    maxFuelMass: 0,
    maxThrust: 0,   isp: 0,    ispSL: 0,   thrustSL: 0,
    separationForce: 3,     // 3 m/s separation kick applied on stage fire
    dragCoeff: 0.10,
    crossSection: 1.77,
    renderW: 50,
    renderH: 24,
    color: '#aa6600',
    description: 'Heavy staging. Cleans up large stage separations with a 3 m/s kick.',
    maxTemperature: 1800,
    heatResistance: 0.35,
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
    return isEnginePart(this.def.type) && this.isActive && !this.isDestroyed;
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

/** Ordered list of part types shown in the VAB parts panel (starter then advanced) */
export const VAB_PALETTE: PartType[] = [
  // ── Starter ──────────────────────────────────────────────────────────────────
  PartType.COMMAND_POD,
  PartType.FAIRING,
  PartType.FUEL_TANK_L,
  PartType.FUEL_TANK_S,
  PartType.ENGINE,
  PartType.ENGINE_VACUUM,
  PartType.SRB,
  PartType.DECOUPLER,
  PartType.HEAT_SHIELD,
  // ── Advanced / lunar ─────────────────────────────────────────────────────────
  PartType.COMMAND_POD_ADV,
  PartType.FUEL_TANK_XL,
  PartType.ENGINE_VAC_ADV,
  PartType.DECOUPLER_HEAVY,
  PartType.HEAT_SHIELD_HEAVY,
  // ── Orbital / transfer ───────────────────────────────────────────────────────
  PartType.ENGINE_HEAVY,
  PartType.FUEL_TANK_XXL,
  PartType.ENGINE_NTR,
];
