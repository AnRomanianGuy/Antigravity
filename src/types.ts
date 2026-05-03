/**
 * types.ts — Shared interfaces, enums, and constants for the Antigravity game.
 * All other modules import from here to ensure a single source of truth.
 */

// ─── 2D Vector ────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

/** Utility helpers for Vec2 — kept as free functions to stay lightweight */
export const vec2 = {
  zero: (): Vec2 => ({ x: 0, y: 0 }),
  clone: (v: Vec2): Vec2 => ({ x: v.x, y: v.y }),
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s }),
  length: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),
  normalize: (v: Vec2): Vec2 => {
    const l = vec2.length(v);
    return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
  },
  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  /** Rotate vector by angle radians */
  rotate: (v: Vec2, angle: number): Vec2 => ({
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
  }),
};

// ─── Rigid Body ───────────────────────────────────────────────────────────────

/**
 * Physics state of the rocket as a point mass in world-space (planet-centred).
 * +Y points away from Earth surface (up), +X points east.
 * Units: metres, kg, radians, seconds.
 */
export interface RigidBody {
  pos: Vec2;       // world position in metres from Earth centre
  vel: Vec2;       // world velocity in m/s
  angle: number;   // rocket heading in radians (0 = pointing up / away from Earth)
  angVel: number;  // angular velocity in rad/s
  mass: number;    // current total mass in kg
}

// ─── Game Screens ─────────────────────────────────────────────────────────────

export enum GameScreen {
  MAIN_MENU,
  OPTIONS,
  VAB,       // Vehicle Assembly Building
  STAGING,   // Staging assignment screen
  FLIGHT,    // Active flight / physics sim
  MAP_VIEW,  // Orbital map overlay
}

// ─── Part Types ───────────────────────────────────────────────────────────────

export enum PartType {
  COMMAND_POD,
  FUEL_TANK_S,
  FUEL_TANK_L,
  ENGINE,
  ENGINE_VACUUM,
  DECOUPLER,
  FAIRING,
  HEAT_SHIELD,
  SRB,
}

// ─── Part Definition (static catalogue) ──────────────────────────────────────

export interface PartDef {
  type: PartType;
  name: string;
  /** Dry mass in kg (no fuel) */
  dryMass: number;
  /** Maximum fuel mass in kg (0 for non-tanks) */
  maxFuelMass: number;
  /** Maximum thrust in Newtons at vacuum (0 for non-engines) */
  maxThrust: number;
  /** Vacuum specific impulse in seconds (0 for non-engines) */
  isp: number;
  /** Sea-level specific impulse in seconds (0 for non-engines) */
  ispSL: number;
  /** Fraction of maxThrust available at sea level (0–1; 0 for non-engines) */
  thrustSL: number;
  /** If true, engine always burns at 100% regardless of throttle (solid rockets) */
  ignoreThrottle?: boolean;
  /** If true, part mounts radially (to the side) rather than stacking vertically */
  radialMount?: boolean;
  /** Drag coefficient (dimensionless) */
  dragCoeff: number;
  /** Cross-section area in m² used for drag */
  crossSection: number;
  /** Rendered width in px (VAB display) */
  renderW: number;
  /** Rendered height in px (VAB display) */
  renderH: number;
  /** Base fill colour for rendering */
  color: string;
  /** Brief tooltip description */
  description: string;
  /** Destruction temperature in Kelvin */
  maxTemperature: number;
  /** Fraction of incoming heat flux blocked (0 = none, 0.95 = heat shield) */
  heatResistance: number;
}

// ─── Staging ──────────────────────────────────────────────────────────────────

export interface StageData {
  stageIndex: number;
  /** IDs of PartInstances assigned to this stage */
  partIds: string[];
}

// ─── Maneuver Node (stub — ready for future implementation) ───────────────────

export interface ManeuverNode {
  /** Mission elapsed time in seconds when this node fires */
  time: number;
  /** Delta-V vector in world space (m/s) */
  deltaV: Vec2;
  /** Whether this node has been executed */
  executed: boolean;
}

// ─── Input State ──────────────────────────────────────────────────────────────

export interface InputState {
  throttleUp: boolean;     // ShiftLeft / ShiftRight
  throttleDown: boolean;   // ControlLeft / ControlRight
  rotateLeft: boolean;     // A / ArrowLeft
  rotateRight: boolean;    // D / ArrowRight
  stage: boolean;          // Space (single-fire, reset each frame)
  toggleMap: boolean;      // M (single-fire)
  escape: boolean;         // Escape (single-fire)
}

// ─── Colours / Theme ──────────────────────────────────────────────────────────

export const THEME = {
  bg:            '#0a0a12',
  panelBg:       '#0d1117',
  panelBorder:   '#1e3a5f',
  accent:        '#00d4ff',
  accentDim:     '#0088aa',
  accentGlow:    'rgba(0,212,255,0.25)',
  text:          '#c8d8e8',
  textDim:       '#4a6080',
  danger:        '#ff4444',
  warning:       '#ffaa00',
  success:       '#44ff88',
  engineFire:    '#ff6a00',
  heatGlow:      '#ff4500',
  plasmaCore:    '#00ffff',
  plasmaEdge:    '#8800ff',
  exhaustCore:   '#ffffff',
  exhaustMid:    '#ffaa44',
  exhaustEdge:   'rgba(255,80,0,0)',
} as const;
