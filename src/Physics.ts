/**
 * Physics.ts — 2D Rigid-body physics engine for Antigravity.
 *
 * Coordinate system:
 *   Origin  = Earth's centre
 *   +Y      = North pole direction (up from surface at launch site)
 *   +X      = East direction
 *   Angles  = 0 rad means rocket nozzle points toward Earth (nose up),
 *             increasing clockwise
 *
 * Integration method: semi-implicit (symplectic) Euler.
 *   velocity += acceleration * dt   (update v first)
 *   position += velocity * dt        (then update x)
 * This conserves energy better than explicit Euler for orbital mechanics.
 *
 * Key physics:
 *   Gravity    : F = G·M·m / r²  directed toward Earth centre
 *   Thrust     : F = throttle · maxThrust  in rocket's nose direction
 *   Drag       : F = 0.5 · ρ · v² · Cd · A  opposing velocity
 *   Rotation   : torque from reaction wheel (command pod) and engine gimbal
 *   Mass flow  : ṁ = F_thrust / (Isp · g₀)
 */

import { RigidBody, Vec2, vec2 } from './types';
import { Atmosphere } from './Atmosphere';
import type { Rocket } from './Rocket';

// ─── Physical Constants ───────────────────────────────────────────────────────

/** Gravitational constant (m³ kg⁻¹ s⁻²) */
export const G = 6.674e-11;

/** Earth mass (kg) */
export const M_EARTH = 5.972e24;

/** Earth radius (m) — mean radius */
export const R_EARTH = 6_371_000;

/** Standard gravity (m/s²) — used in Isp ↔ thrust conversion */
export const G0 = 9.80665;

/** μ = G·M — gravitational parameter, precomputed for efficiency */
export const MU_EARTH = G * M_EARTH;   // ≈ 3.986e14 m³/s²

// ─── Moon Constants ───────────────────────────────────────────────────────────

export const R_MOON            = 1_737_000;    // Moon radius (m)
export const M_MOON            = 7.342e22;     // Moon mass (kg)
export const MU_MOON           = G * M_MOON;   // ≈ 4.905e12 m³/s²
export const MOON_ORBIT_RADIUS = 384_400_000;  // Semi-major axis (m) ~384,400 km
export const MOON_SOI          =  66_100_000;  // Sphere of influence radius (m) ~66,100 km
export const MOON_PERIOD       =  2_360_592;   // Sidereal period (s) ≈ 27.32 days

/** Moon starts directly above launch site (+Y direction) at t = 0 */
const MOON_PHASE_0 = Math.PI / 2;
const MOON_OMEGA   = 2 * Math.PI / MOON_PERIOD;

/** World-space position of the Moon at mission time t (seconds) */
export function getMoonPosition(t: number): Vec2 {
  const angle = MOON_PHASE_0 + MOON_OMEGA * t;
  return {
    x: MOON_ORBIT_RADIUS * Math.cos(angle),
    y: MOON_ORBIT_RADIUS * Math.sin(angle),
  };
}

/** World-space velocity of the Moon at mission time t */
export function getMoonVelocity(t: number): Vec2 {
  const angle = MOON_PHASE_0 + MOON_OMEGA * t;
  return {
    x: -MOON_ORBIT_RADIUS * MOON_OMEGA * Math.sin(angle),
    y:  MOON_ORBIT_RADIUS * MOON_OMEGA * Math.cos(angle),
  };
}

/** Reaction wheel max torque (N·m) — from command pod SAS */
const REACTION_WHEEL_TORQUE = 200_000;

/** Engine gimbal torque coefficient (N·m) */
const GIMBAL_TORQUE_COEFF = 60_000;

/** Angular damping factor per physics step (0.985^60 ≈ 0.40/s — responsive but not twitchy) */
const ANGULAR_DAMPING = 0.985;

// ─── Heating Constants ────────────────────────────────────────────────────────

/** Heat flux coefficient: heatFlux = HEAT_COEFF * rho * v³  (game-tuned, not SI) */
const HEAT_COEFF = 7e-5;

/** Radiation cooling: fraction of excess temperature lost per second */
const HEAT_COOLING = 0.05;

/** Seconds at over-temperature before the part is fully destroyed */
const HEAT_DESTROY_TIME = 8;

/** Max heat flux used to normalise visual intensity (0–1) */
export const MAX_HEAT_FLUX = 360_000;

// ─── Physics State (extra per-frame data beyond RigidBody) ───────────────────

export interface PhysicsFrame {
  altitude: number;         // metres above surface
  speed: number;            // |vel| in m/s
  verticalSpeed: number;    // m/s (positive = away from Earth)
  horizontalSpeed: number;  // m/s (surface-relative eastward)
  heatingIntensity: number; // 0–1 (legacy, kept for HUD)
  dynamicPressure: number;  // Pa
  gravityAcc: number;       // m/s² magnitude
  dragForce: number;        // N magnitude
  thrustForce: number;      // N magnitude
  mach: number;             // current Mach number
  atmoLayerName: string;    // e.g. 'TROPOSPHERE', 'EXOSPHERE'
  // ── Aerodynamic heating ──
  airflowDir: Vec2;         // unit vector: direction airflow travels (= normalize(-vel))
  heatFlux: number;         // raw heat flux before shielding (game units)
  noseExposure: number;     // dot(noseDir, airflowDir): <0 = nose windward, >0 = tail windward
}

// ─── Physics Engine ───────────────────────────────────────────────────────────

export class PhysicsEngine {
  private atmo: Atmosphere;

  /** Accumulated mission elapsed time (seconds) */
  missionTime = 0;

  /** Last computed frame data for HUD display */
  lastFrame: PhysicsFrame = {
    altitude: 0,
    speed: 0,
    verticalSpeed: 0,
    horizontalSpeed: 0,
    heatingIntensity: 0,
    dynamicPressure: 0,
    gravityAcc: 0,
    dragForce: 0,
    thrustForce: 0,
    mach: 0,
    atmoLayerName: 'TROPOSPHERE',
    airflowDir: { x: 0, y: -1 },
    heatFlux: 0,
    noseExposure: 0,
  };

  constructor(atmo: Atmosphere) {
    this.atmo = atmo;
  }

  // ─── Main Integration Step ──────────────────────────────────────────────────

  /**
   * Advance the physics simulation by `dt` seconds.
   * Modifies body.pos, body.vel, body.angle, body.angVel, body.mass in-place.
   * Also triggers fuel consumption and staging checks on the rocket.
   *
   * @param body    The rocket's rigid body (mutated)
   * @param rocket  The rocket (for thrust, mass, fuel)
   * @param dt      Time step in seconds (should be ≤ 0.05 for stability)
   */
  step(body: RigidBody, rocket: Rocket, dt: number): void {
    this.missionTime += dt;

    const altitude = this.getAltitude(body.pos);
    const rho = this.atmo.getDensity(altitude);
    const soundSpeed = this.atmo.getSoundSpeed(altitude);

    // ── Direction vectors ───────────────────────────────────────────────────
    // Radial unit vector: points FROM Earth centre TO rocket (i.e., "up")
    const r = vec2.length(body.pos);
    const radial = r > 0
      ? vec2.scale(body.pos, 1 / r)
      : { x: 0, y: 1 };

    // Rocket nose direction (angle=0 → nose up / away from Earth)
    // We define angle=0 as pointing along +Y axis; positive angle = clockwise
    const noseDir: Vec2 = {
      x:  Math.sin(body.angle),
      y:  Math.cos(body.angle),
    };

    // ── Gravity (patched conics) ─────────────────────────────────────────────
    // Inside Moon SOI → Moon gravity only.  Outside → Earth gravity only.
    const moonPos    = getMoonPosition(this.missionTime);
    const relToMoon  = { x: body.pos.x - moonPos.x, y: body.pos.y - moonPos.y };
    const moonDist   = Math.sqrt(relToMoon.x * relToMoon.x + relToMoon.y * relToMoon.y);
    const inMoonSOI  = moonDist < MOON_SOI && moonDist > 0;

    let gravMag: number;
    let gravForce: Vec2;
    if (inMoonSOI) {
      gravMag   = MU_MOON / (moonDist * moonDist);
      gravForce = {
        x: -(relToMoon.x / moonDist) * gravMag * body.mass,
        y: -(relToMoon.y / moonDist) * gravMag * body.mass,
      };
    } else {
      gravMag   = MU_EARTH / (r * r);
      gravForce = vec2.scale(radial, -gravMag * body.mass);
    }

    // ── Thrust (atmospheric-corrected) ──────────────────────────────────────
    // vacFrac = 0 at sea level, 1 in vacuum.  Isp and thrust both interpolate
    // between their sea-level and vacuum ratings so vacuum engines are terrible
    // for launch while atmospheric engines lose ~10% going to orbit.
    const pressure = this.atmo.getPressure(altitude);
    const vacFrac  = Math.max(0, 1 - pressure / 101_325);

    let thrustMag = 0;
    let massFlow  = 0;
    for (const p of rocket.parts.filter(pp => pp.isThrusting)) {
      const thr = p.def.ignoreThrottle ? 1 : rocket.throttle;

      // Vacuum fraction: pressure-based for normal engines, altitude-based for
      // advanced vacuum engines that have a hard atmospheric cutoff.
      let localVacFrac: number;
      if (p.def.altitudeVacuum !== undefined) {
        // Flat at thrustSL below 20 km; linear ramp 20 km → altitudeVacuum.
        const BREAK_ALT = 20_000;
        if (altitude <= BREAK_ALT) {
          localVacFrac = 0;
        } else if (altitude >= p.def.altitudeVacuum) {
          localVacFrac = 1;
        } else {
          localVacFrac = (altitude - BREAK_ALT) / (p.def.altitudeVacuum - BREAK_ALT);
        }
      } else {
        localVacFrac = vacFrac;   // standard pressure-based interpolation
      }

      const effThrust = p.def.maxThrust * thr
        * (p.def.thrustSL + (1 - p.def.thrustSL) * localVacFrac);
      const effIsp    = p.def.ispSL + (p.def.isp - p.def.ispSL) * localVacFrac;
      thrustMag += effThrust;
      if (effIsp > 0) massFlow += effThrust / (effIsp * G0);
    }

    const thrustForce: Vec2 = vec2.scale(noseDir, thrustMag);

    if (massFlow > 0) {
      rocket.consumeFuel(massFlow * dt);
      body.mass = rocket.getTotalMass();
    }

    // ── Aerodynamic Drag ────────────────────────────────────────────────────
    // F_drag = −0.5 · ρ · |v|² · Cd · A · v̂
    // Drag opposes the velocity vector.
    const speed = vec2.length(body.vel);
    let dragForceMag = 0;
    const dragForce: Vec2 = vec2.zero();

    if (speed > 0 && rho > 0) {
      const cd = rocket.getEffectiveDragCoeff();
      const area = rocket.getCrossSection();
      dragForceMag = 0.5 * rho * speed * speed * cd * area;
      const velDir = vec2.normalize(body.vel);
      dragForce.x = -velDir.x * dragForceMag;
      dragForce.y = -velDir.y * dragForceMag;
    }

    // ── Net force & acceleration ─────────────────────────────────────────────
    const netForce: Vec2 = {
      x: gravForce.x + thrustForce.x + dragForce.x,
      y: gravForce.y + thrustForce.y + dragForce.y,
    };

    const m = Math.max(body.mass, 1);   // guard against zero mass
    const accel: Vec2 = vec2.scale(netForce, 1 / m);

    // ── Semi-implicit Euler integration ─────────────────────────────────────
    // v += a·dt  first (uses new velocity for position)
    body.vel.x += accel.x * dt;
    body.vel.y += accel.y * dt;
    // x += v·dt
    body.pos.x += body.vel.x * dt;
    body.pos.y += body.vel.y * dt;

    // ── Surface clamp (prevent clipping through Earth) ───────────────────────
    const newR = vec2.length(body.pos);
    if (newR < R_EARTH) {
      // Push back to surface
      const surfaceDir = vec2.normalize(body.pos);
      body.pos = vec2.scale(surfaceDir, R_EARTH);
      // Kill radial (downward) velocity component
      const vRad = vec2.dot(body.vel, surfaceDir);
      if (vRad < 0) {
        body.vel.x -= surfaceDir.x * vRad;
        body.vel.y -= surfaceDir.y * vRad;
        // Also kill most horizontal velocity (ground friction)
        body.vel.x *= 0.5;
        body.vel.y *= 0.5;
      }
    }

    // ── Rotation ────────────────────────────────────────────────────────────
    // Input-driven rotation is handled by Game.ts (it adds to angVel directly).
    // Here we apply angular damping (SAS / natural damping).
    body.angVel *= ANGULAR_DAMPING;
    body.angle  += body.angVel * dt;

    // ── Heating ─────────────────────────────────────────────────────────────
    const heatingIntensity = this.atmo.getHeatingIntensity(altitude, speed);

    // Airflow direction: where air appears to come from (= opposite to velocity)
    const airflowDir: Vec2 = speed > 0
      ? { x: -body.vel.x / speed, y: -body.vel.y / speed }
      : { x: 0, y: -1 };

    // How much the nose faces into the airflow:
    //   < 0 → nose is windward (ascending nose-first or reentry tail-shield)
    //   > 0 → tail is windward (retrograde reentry without proper orientation)
    const noseExposure = vec2.dot(noseDir, airflowDir);
    const exposure = Math.abs(noseExposure);

    // Raw heat flux (game units, calibrated for ~20 s to destroy unshielded tank at peak)
    const heatFlux = rho > 0 ? HEAT_COEFF * rho * speed * speed * speed : 0;

    // Per-part temperature update (only in atmosphere and with meaningful exposure)
    if (heatFlux > 500 && exposure > 0.05) {
      // Order parts from windward end to leeward end
      // noseExposure < 0 → nose (high slot) is first to heat → sort high-slot first
      // noseExposure > 0 → tail (slot 0) is first → sort low-slot first
      const windwardFirst = noseExposure < 0
        ? [...rocket.parts].sort((a, b) => b.slotIndex - a.slotIndex)
        : [...rocket.parts].sort((a, b) => a.slotIndex - b.slotIndex);

      let passthrough = exposure;  // angular factor reduces effective heat

      for (const part of windwardFirst) {
        if (part.isDestroyed) continue;  // destroyed parts don't shield

        const partHeat = heatFlux * passthrough;
        // dT: heat input minus part heat capacity (simplified: 1 J per kg per K)
        const dT = partHeat * (1 - part.def.heatResistance)
                   / Math.max(part.currentMass, 50) * dt;
        part.currentTemperature += dT;

        // Radiation cooling — slow bleed proportional to excess above ambient
        const excess = part.currentTemperature - 293;
        if (excess > 0) {
          part.currentTemperature -= HEAT_COOLING * excess * dt;
          part.currentTemperature = Math.max(293, part.currentTemperature);
        }

        // Reduce heat flowing to parts further down (shielding effect)
        passthrough *= Math.max(0, 1 - part.def.heatResistance * 0.92);
        if (passthrough < 0.005) break;

        // Destruction accumulation
        if (part.currentTemperature > part.def.maxTemperature) {
          part.heatDamage += dt / HEAT_DESTROY_TIME;
          if (part.heatDamage >= 1.0) {
            part.isDestroyed = true;
          }
        } else {
          // Cool recovery when under max temp
          part.heatDamage = Math.max(0, part.heatDamage - dt * 0.05);
        }
      }
    } else if (heatFlux <= 100) {
      // Out of atmosphere or slow: all parts cool toward ambient
      for (const part of rocket.parts) {
        if (part.isDestroyed) continue;
        const excess = part.currentTemperature - 293;
        if (excess > 0) {
          part.currentTemperature -= HEAT_COOLING * 0.5 * excess * dt;
          part.currentTemperature = Math.max(293, part.currentTemperature);
        }
      }
    }

    // ── Mach number ─────────────────────────────────────────────────────────
    const mach = soundSpeed > 0 ? speed / soundSpeed : 0;

    // ── Atmospheric layer ────────────────────────────────────────────────────
    const atmoLayerName = this.atmo.getLayerName(altitude);

    // ── Vertical / Horizontal speed decomposition ───────────────────────────
    const verticalSpeed   = vec2.dot(body.vel, radial);
    const tangentDir: Vec2 = { x: -radial.y, y: radial.x };   // 90° CCW
    const horizontalSpeed = vec2.dot(body.vel, tangentDir);

    // ── Save frame data ─────────────────────────────────────────────────────
    this.lastFrame = {
      altitude,
      speed,
      verticalSpeed,
      horizontalSpeed,
      heatingIntensity,
      dynamicPressure: 0.5 * rho * speed * speed,
      gravityAcc: gravMag,
      dragForce: dragForceMag,
      thrustForce: thrustMag,
      mach,
      atmoLayerName,
      airflowDir,
      heatFlux,
      noseExposure,
    };
  }

  // ─── Utility Methods ────────────────────────────────────────────────────────

  /**
   * Altitude in metres above Earth's mean surface.
   * @param pos  World-space position vector (m)
   */
  getAltitude(pos: Vec2): number {
    return vec2.length(pos) - R_EARTH;
  }

  /**
   * Apply a rotational input (from player controls).
   * Adds to body.angVel; the integration step above will propagate it.
   *
   * @param body      The rigid body to rotate
   * @param direction +1 = clockwise, −1 = counter-clockwise
   * @param dt        Time step (seconds)
   * @param hasPod    Whether a command pod (with SAS) is present
   */
  applyRotation(
    body: RigidBody,
    direction: number,
    dt: number,
    hasPod: boolean,
  ): void {
    const torque = hasPod ? REACTION_WHEEL_TORQUE : GIMBAL_TORQUE_COEFF;
    // Moment of inertia approximation: I ≈ m · L² / 12 (uniform rod)
    const L = 30;   // approximate rocket length in metres
    const I = Math.max(body.mass * L * L / 12, 1);
    body.angVel += (torque / I) * direction * dt;
  }

  /**
   * Quick gravity magnitude at a given altitude (m/s²).
   * Useful for Isp conversions in vacuum vs. atmosphere.
   */
  getGravity(altitudeM: number): number {
    const r = R_EARTH + altitudeM;
    return MU_EARTH / (r * r);
  }

  /**
   * Compute the orbital speed needed for a circular orbit at a given altitude.
   * v_circ = sqrt(μ / r)
   */
  circularOrbitSpeed(altitudeM: number): number {
    return Math.sqrt(MU_EARTH / (R_EARTH + altitudeM));
  }

  /**
   * Compute orbital period for a circular orbit at a given altitude (seconds).
   * T = 2π · sqrt(r³ / μ)
   */
  orbitalPeriod(altitudeM: number): number {
    const r = R_EARTH + altitudeM;
    return 2 * Math.PI * Math.sqrt((r * r * r) / MU_EARTH);
  }

  /**
   * Reset mission time (called when starting a new launch).
   */
  reset(): void {
    this.missionTime = 0;
    this.lastFrame = {
      altitude: 0, speed: 0, verticalSpeed: 0, horizontalSpeed: 0,
      heatingIntensity: 0, dynamicPressure: 0, gravityAcc: G0,
      dragForce: 0, thrustForce: 0, mach: 0, atmoLayerName: 'TROPOSPHERE',
      airflowDir: { x: 0, y: -1 }, heatFlux: 0, noseExposure: 0,
    };
  }

  /**
   * Clone a RigidBody for trajectory prediction (does not modify original).
   */
  cloneBody(body: RigidBody): RigidBody {
    return {
      pos:    vec2.clone(body.pos),
      vel:    vec2.clone(body.vel),
      angle:  body.angle,
      angVel: body.angVel,
      mass:   body.mass,
    };
  }
}
