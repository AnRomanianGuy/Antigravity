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

/** Reaction wheel max torque (N·m) — from command pod SAS */
const REACTION_WHEEL_TORQUE = 200_000;

/** Engine gimbal torque coefficient (N·m) */
const GIMBAL_TORQUE_COEFF = 60_000;

/** Angular damping factor per physics step (0.985^60 ≈ 0.40/s — responsive but not twitchy) */
const ANGULAR_DAMPING = 0.985;

// ─── Physics State (extra per-frame data beyond RigidBody) ───────────────────

export interface PhysicsFrame {
  altitude: number;       // metres above surface
  speed: number;          // |vel| in m/s
  verticalSpeed: number;  // m/s (positive = away from Earth)
  horizontalSpeed: number; // m/s (surface-relative eastward)
  heatingIntensity: number; // 0–1 (for visual effects)
  dynamicPressure: number;  // Pa
  gravityAcc: number;      // m/s² magnitude
  dragForce: number;       // N magnitude
  thrustForce: number;     // N magnitude
  mach: number;            // current Mach number
  atmoLayerName: string;   // e.g. 'TROPOSPHERE', 'EXOSPHERE'
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

    // ── Gravity ─────────────────────────────────────────────────────────────
    // F_grav = −(μ / r²) · m · r̂   (always toward Earth centre)
    const gravMag = MU_EARTH / (r * r);
    const gravForce: Vec2 = vec2.scale(radial, -gravMag * body.mass);

    // ── Thrust ──────────────────────────────────────────────────────────────
    const thrustMag = rocket.getThrust();
    const thrustForce: Vec2 = vec2.scale(noseDir, thrustMag);

    // Fuel consumption: ṁ = F_thrust / (Isp · g₀)
    if (thrustMag > 0) {
      const isp = rocket.getEffectiveIsp();
      if (isp > 0) {
        const massFlow = thrustMag / (isp * G0);   // kg/s
        rocket.consumeFuel(massFlow * dt);
        body.mass = rocket.getTotalMass();
      }
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
