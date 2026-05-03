/**
 * Atmosphere.ts — Earth atmospheric model.
 *
 * Uses the exponential (barometric) approximation:
 *   ρ(h) = ρ₀ · exp(−h / H)
 *
 * where:
 *   ρ₀ = 1.225 kg/m³  (sea-level density)
 *   H  = 8500 m        (scale height — altitude at which density falls to 1/e)
 *
 * This matches the real atmosphere to within ~10% up to ~80 km and is
 * far simpler than the full ICAO standard atmosphere.
 *
 * The atmosphere is considered negligible above ATMOSPHERE_CEILING (70 km),
 * which matches real Earth (Kármán line ≈ 100 km, but drag is tiny above 70 km).
 */

export const ATMOSPHERE_CEILING = 70_000;  // metres — above this, ρ ≈ 0

// Sea-level air density (kg/m³)
const RHO_0 = 1.225;

// Scale height (m) — density drops to 1/e ≈ 36.8% every 8.5 km
const SCALE_HEIGHT = 8_500;

// Sea-level pressure (Pa)
const P_0 = 101_325;

// Temperature lapse rate for rough pressure calculation (K/m)
const LAPSE_RATE = 0.0065;

// Sea-level temperature (K)
const T_0 = 288.15;

// ─── Atmospheric Layer Model ──────────────────────────────────────────────────

export interface AtmoLayer {
  name: string;
  minAlt: number;
  maxAlt: number;
  /** Sky RGB colour at this layer (used by Renderer for background tint) */
  skyRgb: [number, number, number];
}

export const ATMO_LAYERS: AtmoLayer[] = [
  { name: 'TROPOSPHERE',  minAlt: 0,        maxAlt: 12_000,   skyRgb: [100, 160, 255] },
  { name: 'STRATOSPHERE', minAlt: 12_000,   maxAlt: 50_000,   skyRgb: [30,  80,  200] },
  { name: 'MESOSPHERE',   minAlt: 50_000,   maxAlt: 80_000,   skyRgb: [10,  20,  80]  },
  { name: 'THERMOSPHERE', minAlt: 80_000,   maxAlt: 690_000,  skyRgb: [5,   8,   25]  },
  { name: 'EXOSPHERE',    minAlt: 690_000,  maxAlt: Infinity, skyRgb: [2,   3,   10]  },
];

export class Atmosphere {
  /**
   * Air density at a given altitude above mean sea level (kg/m³).
   * Returns 0 above the atmosphere ceiling.
   *
   * @param altitudeM  Altitude in metres above Earth's surface
   */
  getDensity(altitudeM: number): number {
    if (altitudeM >= ATMOSPHERE_CEILING) return 0;
    if (altitudeM < 0) altitudeM = 0;
    return RHO_0 * Math.exp(-altitudeM / SCALE_HEIGHT);
  }

  /**
   * Atmospheric pressure at a given altitude (Pa).
   * Uses a simple power-law approximation (ISA troposphere formula).
   *
   * @param altitudeM  Altitude in metres above Earth's surface
   */
  getPressure(altitudeM: number): number {
    if (altitudeM >= ATMOSPHERE_CEILING) return 0;
    if (altitudeM < 0) altitudeM = 0;
    // ISA pressure formula for troposphere + lower stratosphere
    const T = T_0 - LAPSE_RATE * Math.min(altitudeM, 11_000);
    return P_0 * Math.pow(T / T_0, 5.2561);
  }

  /**
   * Returns true if the given altitude is within the sensible atmosphere
   * (i.e., drag and heating effects are non-negligible).
   *
   * @param altitudeM  Altitude in metres
   */
  isInAtmosphere(altitudeM: number): boolean {
    return altitudeM < ATMOSPHERE_CEILING;
  }

  /**
   * Dynamic pressure experienced at a given altitude and speed.
   * q = 0.5 · ρ · v²
   * Units: Pa (N/m²)
   *
   * @param altitudeM  Altitude in metres
   * @param speedMs    Speed relative to the atmosphere in m/s
   */
  getDynamicPressure(altitudeM: number, speedMs: number): number {
    return 0.5 * this.getDensity(altitudeM) * speedMs * speedMs;
  }

  /**
   * Aerodynamic heating rate coefficient.
   * Stagnation heating: q̇ ∝ ρ · v³
   * Returns a dimensionless 0–1 value indicating heating intensity.
   * Peaks at ~1 during fast low-altitude re-entry.
   *
   * @param altitudeM  Altitude in metres
   * @param speedMs    Speed relative to atmosphere in m/s
   */
  getHeatingIntensity(altitudeM: number, speedMs: number): number {
    const rho = this.getDensity(altitudeM);
    // Stagnation heating: q̇ = Ck · ρ · v³
    // Normalised so that re-entry at 7800 m/s, sea level ≈ 1.0
    const Ck = 1.74e-10;   // empirical coefficient (adjusted for game feel)
    const raw = Ck * rho * speedMs * speedMs * speedMs;
    return Math.min(raw, 1.0);
  }

  /**
   * Sound speed in m/s at a given altitude (approximate).
   * Used to compute Mach number for drag effects.
   *
   * @param altitudeM  Altitude in metres
   */
  getSoundSpeed(altitudeM: number): number {
    if (altitudeM >= ATMOSPHERE_CEILING) return 0;
    // Speed of sound = sqrt(γ · R · T), γ=1.4, R=287 J/(kg·K)
    const T = Math.max(T_0 - LAPSE_RATE * Math.min(altitudeM, 11_000), 216.65);
    return Math.sqrt(1.4 * 287 * T);
  }

  // ─── Layer helpers ─────────────────────────────────────────────────────────

  getLayer(altitudeM: number): AtmoLayer {
    const alt = Math.max(0, altitudeM);
    for (const layer of ATMO_LAYERS) {
      if (alt < layer.maxAlt) return layer;
    }
    return ATMO_LAYERS[ATMO_LAYERS.length - 1];
  }

  getLayerName(altitudeM: number): string {
    return this.getLayer(altitudeM).name;
  }

  /** CSS rgba colour for the sky at the given altitude (used by Renderer). */
  getSkyColor(altitudeM: number, alpha = 1.0): string {
    const [r, g, b] = this.getLayer(altitudeM).skyRgb;
    return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
  }
}
