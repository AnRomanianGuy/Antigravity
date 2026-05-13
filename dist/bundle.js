"use strict";
(() => {
  // src/types.ts
  var vec2 = {
    zero: () => ({ x: 0, y: 0 }),
    clone: (v) => ({ x: v.x, y: v.y }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    scale: (v, s) => ({ x: v.x * s, y: v.y * s }),
    length: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
    normalize: (v) => {
      const l = vec2.length(v);
      return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
    },
    dot: (a, b) => a.x * b.x + a.y * b.y,
    /** Rotate vector by angle radians */
    rotate: (v, angle) => ({
      x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
      y: v.x * Math.sin(angle) + v.y * Math.cos(angle)
    })
  };
  var THEME = {
    bg: "#0a0a12",
    panelBg: "#0d1117",
    panelBorder: "#1e3a5f",
    accent: "#00d4ff",
    accentDim: "#0088aa",
    accentGlow: "rgba(0,212,255,0.25)",
    text: "#c8d8e8",
    textDim: "#4a6080",
    danger: "#ff4444",
    warning: "#ffaa00",
    success: "#44ff88",
    engineFire: "#ff6a00",
    heatGlow: "#ff4500",
    plasmaCore: "#00ffff",
    plasmaEdge: "#8800ff",
    exhaustCore: "#ffffff",
    exhaustMid: "#ffaa44",
    exhaustEdge: "rgba(255,80,0,0)"
  };

  // src/Part.ts
  function isEnginePart(type) {
    return type === 3 /* ENGINE */ || type === 4 /* ENGINE_VACUUM */ || type === 9 /* ENGINE_VAC_ADV */ || type === 14 /* ENGINE_HEAVY */ || type === 15 /* ENGINE_NTR */ || type === 8 /* SRB */;
  }
  function isDecouplerPart(type) {
    return type === 5 /* DECOUPLER */ || type === 13 /* DECOUPLER_HEAVY */;
  }
  var PART_CATALOGUE = {
    [0 /* COMMAND_POD */]: {
      type: 0 /* COMMAND_POD */,
      name: "Mk1 Command Pod",
      dryMass: 840,
      maxFuelMass: 0,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.2,
      crossSection: 1.54,
      renderW: 44,
      renderH: 52,
      color: "#4a7fa5",
      description: "Crewed command module with SAS reaction wheel.",
      maxTemperature: 1800,
      heatResistance: 0.4
    },
    [1 /* FUEL_TANK_S */]: {
      type: 1 /* FUEL_TANK_S */,
      name: "FL-T400 Fuel Tank",
      dryMass: 500,
      maxFuelMass: 4500,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.15,
      crossSection: 1.54,
      renderW: 44,
      renderH: 80,
      color: "#7a8a9a",
      description: "Standard short fuel tank (4.5t propellant).",
      maxTemperature: 1400,
      heatResistance: 0.15
    },
    [2 /* FUEL_TANK_L */]: {
      type: 2 /* FUEL_TANK_L */,
      name: "FL-T800 Fuel Tank",
      dryMass: 1e3,
      maxFuelMass: 9e3,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.15,
      crossSection: 1.54,
      renderW: 44,
      renderH: 140,
      color: "#6a7a8a",
      description: "Large fuel tank (9t propellant).",
      maxTemperature: 1400,
      heatResistance: 0.15
    },
    [3 /* ENGINE */]: {
      type: 3 /* ENGINE */,
      name: "LV-T30 Booster",
      dryMass: 1e3,
      maxFuelMass: 0,
      maxThrust: 33e4,
      // vacuum thrust, N
      isp: 360,
      // vacuum Isp, s
      ispSL: 325,
      // sea-level Isp
      thrustSL: 0.93,
      // 93% thrust at sea level = 307 kN
      dragCoeff: 0.5,
      crossSection: 1.54,
      renderW: 44,
      renderH: 62,
      color: "#8a5a3a",
      description: "High-thrust launch engine. 330 kN vac / 307 kN SL.",
      maxTemperature: 2e3,
      heatResistance: 0.55
    },
    [4 /* ENGINE_VACUUM */]: {
      type: 4 /* ENGINE_VACUUM */,
      name: "LV-909 Terrier",
      dryMass: 360,
      maxFuelMass: 0,
      maxThrust: 1e5,
      // vacuum thrust, N
      isp: 428,
      // high vacuum Isp
      ispSL: 40,
      // nearly useless at sea level (large nozzle stalls)
      thrustSL: 0.1,
      // 10% thrust at sea level — do NOT use for launch
      dragCoeff: 0.35,
      crossSection: 1.77,
      // large bell
      renderW: 50,
      renderH: 55,
      color: "#4a6a9a",
      description: "Vacuum-optimised upper-stage engine. 100 kN / Isp 428s vac.",
      maxTemperature: 2e3,
      heatResistance: 0.55
    },
    [5 /* DECOUPLER */]: {
      type: 5 /* DECOUPLER */,
      name: "TR-18A Stack Decoupler",
      dryMass: 400,
      maxFuelMass: 0,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.1,
      crossSection: 1.54,
      renderW: 44,
      renderH: 20,
      color: "#aa8822",
      description: "Separates rocket stages explosively.",
      maxTemperature: 1600,
      heatResistance: 0.25
    },
    [6 /* FAIRING */]: {
      type: 6 /* FAIRING */,
      name: "Aerodynamic Fairing",
      dryMass: 300,
      maxFuelMass: 0,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.05,
      crossSection: 2.54,
      renderW: 56,
      renderH: 100,
      color: "#3a5a7a",
      description: "Reduces atmospheric drag on upper stages.",
      maxTemperature: 1200,
      heatResistance: 0.1
    },
    [7 /* HEAT_SHIELD */]: {
      type: 7 /* HEAT_SHIELD */,
      name: "Mk1 Heat Shield",
      dryMass: 600,
      maxFuelMass: 0,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.5,
      crossSection: 1.77,
      renderW: 50,
      renderH: 20,
      color: "#2a2a2a",
      description: "Ablative re-entry heat protection. Place at the bottom for reentry.",
      maxTemperature: 3500,
      heatResistance: 0.95
    },
    [8 /* SRB */]: {
      type: 8 /* SRB */,
      name: "RT-10 Hammer SRBs",
      // always a symmetric pair
      dryMass: 800,
      // 400 kg × 2
      maxFuelMass: 24e3,
      // 12 t × 2 (one per booster)
      maxThrust: 66e4,
      // 330 kN × 2 boosters
      isp: 245,
      ispSL: 235,
      thrustSL: 0.97,
      ignoreThrottle: true,
      // solid fuel — always full throttle
      radialMount: true,
      // mounts on the sides, not stacked vertically
      dragCoeff: 0.3,
      crossSection: 1,
      renderW: 36,
      renderH: 100,
      color: "#5a3a2a",
      description: "Pair of solid boosters mounted on the sides. 660 kN total, always full thrust.",
      maxTemperature: 1800,
      heatResistance: 0.5
    },
    // ── Advanced / lunar-capable parts ───────────────────────────────────────────
    /**
     * LV-1 Condor — high-expansion vacuum engine.
     * Altitude-based efficiency: 20 % below 20 km, ramps to 100 % at 70 km.
     * Ideal for circularisation, TLI burns, and plane changes; useless for launch.
     */
    [9 /* ENGINE_VAC_ADV */]: {
      type: 9 /* ENGINE_VAC_ADV */,
      name: "LV-1 Condor",
      dryMass: 900,
      maxFuelMass: 0,
      maxThrust: 15e4,
      // vacuum thrust, N
      isp: 450,
      // vacuum Isp, s — better than LV-909
      ispSL: 25,
      // terrible at sea level; large bell stalls
      thrustSL: 0.2,
      // 20 % thrust at sea level
      altitudeVacuum: 7e4,
      // reaches 100 % efficiency at 70 km (Kerman Line)
      dragCoeff: 0.38,
      crossSection: 2.4,
      // very large expansion bell
      renderW: 56,
      renderH: 72,
      color: "#1a3a6a",
      description: "Space engine. 20 % efficient below 20 km, 100 % above 70 km. 150 kN / Isp 450 s vac.",
      maxTemperature: 2200,
      heatResistance: 0.6
    },
    /**
     * FL-TX1200 Transfer Tank — extra-large propellant tank for orbital stages.
     * Holds 12 t of propellant; designed for long burns without restaging.
     */
    [10 /* FUEL_TANK_XL */]: {
      type: 10 /* FUEL_TANK_XL */,
      name: "FL-TX1200 Tank",
      dryMass: 1500,
      maxFuelMass: 12e3,
      // 12 t propellant — 1.5× FL-T800
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.15,
      crossSection: 1.77,
      renderW: 50,
      renderH: 200,
      // visibly taller than FL-T800
      color: "#3a4a5a",
      description: "Extra-large transfer tank (12 t propellant). For orbital and lunar stages.",
      maxTemperature: 1400,
      heatResistance: 0.15
    },
    /**
     * Mk2 Advanced Pod — improved command module.
     * Lighter than Mk1, higher heat resistance for steeper reentry.
     */
    [11 /* COMMAND_POD_ADV */]: {
      type: 11 /* COMMAND_POD_ADV */,
      name: "Mk2 Command Pod",
      dryMass: 660,
      // 180 kg lighter than Mk1
      maxFuelMass: 0,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.18,
      crossSection: 1.54,
      renderW: 48,
      renderH: 56,
      color: "#1a4a7a",
      description: "Improved capsule. Lighter than Mk1, survives steeper reentry. SAS included.",
      maxTemperature: 2400,
      // vs Mk1 1800 K
      heatResistance: 0.55
      // vs Mk1 0.40
    },
    /**
     * Mk2-XL Heat Shield — heavy ablative shield for high-speed reentry.
     * Rated for lunar return velocities (~11 km/s).
     */
    [12 /* HEAT_SHIELD_HEAVY */]: {
      type: 12 /* HEAT_SHIELD_HEAVY */,
      name: "Mk2 Heavy Shield",
      dryMass: 900,
      maxFuelMass: 0,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.55,
      crossSection: 2.2,
      // slightly wider — covers more of the base
      renderW: 52,
      renderH: 26,
      color: "#0e0e0e",
      description: "Reentry protection. Handles high-speed lunar reentry. Must face prograde during descent.",
      maxTemperature: 4800,
      // vs Mk1 3500 K
      heatResistance: 0.98
      // vs Mk1 0.95
    },
    // ── Orbital / transfer-capable parts ─────────────────────────────────────────
    /**
     * K1 Mainsail — heavy first-stage booster.
     * 1 500 kN thrust at sea level; Isp 315 s vac / 285 s SL.
     * Lets a single stack reach orbit without needing SRBs.
     */
    [14 /* ENGINE_HEAVY */]: {
      type: 14 /* ENGINE_HEAVY */,
      name: "K1 Mainsail",
      dryMass: 3e3,
      maxFuelMass: 0,
      maxThrust: 15e5,
      // 1 500 kN vacuum
      isp: 315,
      ispSL: 285,
      thrustSL: 0.93,
      // 93 % at sea level = 1 395 kN
      dragCoeff: 0.55,
      crossSection: 2.54,
      renderW: 62,
      renderH: 82,
      color: "#7a2a0a",
      description: "Heavy first-stage engine. 1 500 kN vac / 1 395 kN SL. Gets large rockets to orbit.",
      maxTemperature: 2200,
      heatResistance: 0.6
    },
    /**
     * LV-N Nerva — nuclear thermal engine.
     * 35 kN / Isp 800 s vacuum; nearly useless below 50 km.
     * Pairs with FL-TX2400 for enormous transfer-stage ΔV.
     */
    [15 /* ENGINE_NTR */]: {
      type: 15 /* ENGINE_NTR */,
      name: "LV-N Nerva",
      dryMass: 2200,
      maxFuelMass: 0,
      maxThrust: 35e3,
      // 35 kN vacuum
      isp: 800,
      // nuclear thermal Isp
      ispSL: 50,
      // terrible — hot hydrogen stalls in thick air
      thrustSL: 0.08,
      // 8 % at sea level
      altitudeVacuum: 7e4,
      // full efficiency above Kármán line
      dragCoeff: 0.42,
      crossSection: 2.1,
      renderW: 52,
      renderH: 72,
      color: "#1a5a2a",
      description: "Nuclear thermal engine. Isp 800 s / 35 kN vac. Useless below 50 km. Paired with FL-TX2400 for deep-space transfers.",
      maxTemperature: 3e3,
      heatResistance: 0.75
    },
    /**
     * FL-TX2400 — super-large transfer tank.
     * 24 t propellant; intended for NTR-powered orbital or interplanetary stages.
     */
    [16 /* FUEL_TANK_XXL */]: {
      type: 16 /* FUEL_TANK_XXL */,
      name: "FL-TX2400 Tank",
      dryMass: 1800,
      maxFuelMass: 24e3,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      dragCoeff: 0.15,
      crossSection: 2.1,
      renderW: 52,
      renderH: 280,
      color: "#1e2e3e",
      description: "Super-large transfer tank (24 t propellant). Use with Nerva NTR for massive \u0394V budgets.",
      maxTemperature: 1400,
      heatResistance: 0.15
    },
    /**
     * TR-XL Heavy Decoupler — engineered for large upper stages.
     * Higher mass tolerance; applies a small separation impulse on firing.
     */
    [13 /* DECOUPLER_HEAVY */]: {
      type: 13 /* DECOUPLER_HEAVY */,
      name: "TR-XL Decoupler",
      dryMass: 600,
      // heavier than TR-18A (400 kg) — for structural loads
      maxFuelMass: 0,
      maxThrust: 0,
      isp: 0,
      ispSL: 0,
      thrustSL: 0,
      separationForce: 3,
      // 3 m/s separation kick applied on stage fire
      dragCoeff: 0.1,
      crossSection: 1.77,
      renderW: 50,
      renderH: 24,
      color: "#aa6600",
      description: "Heavy staging. Cleans up large stage separations with a 3 m/s kick.",
      maxTemperature: 1800,
      heatResistance: 0.35
    }
  };
  var _nextId = 1;
  var PartInstance = class _PartInstance {
    constructor(type, slotIndex) {
      /** Current temperature in Kelvin (ambient = 293 K) */
      this.currentTemperature = 293;
      /** Heat damage accumulator 0–1; reaches 1 when part is destroyed */
      this.heatDamage = 0;
      /** True when heat damage has destroyed this part */
      this.isDestroyed = false;
      this.id = `part_${_nextId++}`;
      this.def = PART_CATALOGUE[type];
      this.fuelRemaining = this.def.maxFuelMass;
      this.isActive = false;
      this.stageIndex = -1;
      this.slotIndex = slotIndex;
    }
    /** Current total mass of this part (dry + remaining fuel) */
    get currentMass() {
      return this.def.dryMass + this.fuelRemaining;
    }
    /** True if this part can produce thrust (engine + active + not destroyed) */
    get isThrusting() {
      return isEnginePart(this.def.type) && this.isActive && !this.isDestroyed;
    }
    /** True if this part is a fuel tank that still has propellant and is intact */
    get hasFuel() {
      return this.def.maxFuelMass > 0 && this.fuelRemaining > 0 && !this.isDestroyed;
    }
    /** Drain up to `amount` kg of fuel, returns how much was actually drained */
    drainFuel(amount) {
      const drained = Math.min(amount, this.fuelRemaining);
      this.fuelRemaining -= drained;
      return drained;
    }
    /** Deep clone for physics prediction (map view trajectory) */
    clone() {
      const copy = new _PartInstance(this.def.type, this.slotIndex);
      copy.id = this.id;
      copy.fuelRemaining = this.fuelRemaining;
      copy.isActive = this.isActive;
      copy.stageIndex = this.stageIndex;
      copy.currentTemperature = this.currentTemperature;
      copy.heatDamage = this.heatDamage;
      copy.isDestroyed = this.isDestroyed;
      return copy;
    }
  };
  var VAB_PALETTE = [
    // ── Starter ──────────────────────────────────────────────────────────────────
    0 /* COMMAND_POD */,
    6 /* FAIRING */,
    2 /* FUEL_TANK_L */,
    1 /* FUEL_TANK_S */,
    3 /* ENGINE */,
    4 /* ENGINE_VACUUM */,
    8 /* SRB */,
    5 /* DECOUPLER */,
    7 /* HEAT_SHIELD */,
    // ── Advanced / lunar ─────────────────────────────────────────────────────────
    11 /* COMMAND_POD_ADV */,
    10 /* FUEL_TANK_XL */,
    9 /* ENGINE_VAC_ADV */,
    13 /* DECOUPLER_HEAVY */,
    12 /* HEAT_SHIELD_HEAVY */,
    // ── Orbital / transfer ───────────────────────────────────────────────────────
    14 /* ENGINE_HEAVY */,
    16 /* FUEL_TANK_XXL */,
    15 /* ENGINE_NTR */
  ];

  // src/Physics.ts
  var G = 6674e-14;
  var M_EARTH = 5972e21;
  var R_EARTH = 6371e3;
  var G0 = 9.80665;
  var MU_EARTH = G * M_EARTH;
  var R_MOON = 1737e3;
  var M_MOON = 7342e19;
  var MU_MOON = G * M_MOON;
  var MOON_ORBIT_RADIUS = 3844e5;
  var MOON_SOI = 661e5;
  var MOON_PERIOD = 2360592;
  var MOON_PHASE_0 = Math.PI / 2;
  var MOON_OMEGA = 2 * Math.PI / MOON_PERIOD;
  function getMoonPosition(t) {
    const angle = MOON_PHASE_0 + MOON_OMEGA * t;
    return {
      x: MOON_ORBIT_RADIUS * Math.cos(angle),
      y: MOON_ORBIT_RADIUS * Math.sin(angle)
    };
  }
  function getMoonVelocity(t) {
    const angle = MOON_PHASE_0 + MOON_OMEGA * t;
    return {
      x: -MOON_ORBIT_RADIUS * MOON_OMEGA * Math.sin(angle),
      y: MOON_ORBIT_RADIUS * MOON_OMEGA * Math.cos(angle)
    };
  }
  var REACTION_WHEEL_TORQUE = 2e6;
  var GIMBAL_TORQUE_COEFF = 6e4;
  var ANGULAR_DAMPING = 0.985;
  var HEAT_COEFF = 7e-5;
  var HEAT_COOLING = 0.05;
  var HEAT_DESTROY_TIME = 8;
  var MAX_HEAT_FLUX = 36e4;
  var PhysicsEngine = class {
    constructor(atmo) {
      this._heatBuf = [];
      /** Accumulated mission elapsed time (seconds) */
      this.missionTime = 0;
      /** Last computed frame data for HUD display */
      this.lastFrame = {
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
        atmoLayerName: "TROPOSPHERE",
        airflowDir: { x: 0, y: -1 },
        heatFlux: 0,
        noseExposure: 0,
        inMoonSOI: false,
        altAboveNearest: 0,
        forceGravity: { x: 0, y: 0 },
        forceThrust: { x: 0, y: 0 },
        forceDrag: { x: 0, y: 0 },
        forceNet: { x: 0, y: 0 }
      };
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
    step(body, rocket, dt) {
      this.missionTime += dt;
      const altitude = this.getAltitude(body.pos);
      const rho = this.atmo.getDensity(altitude);
      const soundSpeed = this.atmo.getSoundSpeed(altitude);
      const r = vec2.length(body.pos);
      const radial = r > 0 ? vec2.scale(body.pos, 1 / r) : { x: 0, y: 1 };
      const noseDir = {
        x: Math.sin(body.angle),
        y: Math.cos(body.angle)
      };
      const moonPos = getMoonPosition(this.missionTime);
      const relToMoon = { x: body.pos.x - moonPos.x, y: body.pos.y - moonPos.y };
      const moonDist = Math.sqrt(relToMoon.x * relToMoon.x + relToMoon.y * relToMoon.y);
      const inMoonSOI = moonDist < MOON_SOI && moonDist > 0;
      const altAboveNearest = inMoonSOI ? moonDist - R_MOON : altitude;
      const earthGravMag = MU_EARTH / (r * r);
      const moonGravMag = moonDist > 0 ? MU_MOON / (moonDist * moonDist) : 0;
      const gravForce = {
        x: -radial.x * earthGravMag * body.mass - (moonDist > 0 ? relToMoon.x / moonDist * moonGravMag * body.mass : 0),
        y: -radial.y * earthGravMag * body.mass - (moonDist > 0 ? relToMoon.y / moonDist * moonGravMag * body.mass : 0)
      };
      const gravMag = inMoonSOI ? moonGravMag : earthGravMag;
      const pressure = this.atmo.getPressure(altitude);
      const vacFrac = Math.max(0, 1 - pressure / 101325);
      let thrustMag = 0;
      let massFlow = 0;
      for (const p of rocket.parts) {
        if (!p.isThrusting)
          continue;
        const thr = p.def.ignoreThrottle ? 1 : rocket.throttle;
        let localVacFrac;
        if (p.def.altitudeVacuum !== void 0) {
          const BREAK_ALT = 2e4;
          if (altitude <= BREAK_ALT) {
            localVacFrac = 0;
          } else if (altitude >= p.def.altitudeVacuum) {
            localVacFrac = 1;
          } else {
            localVacFrac = (altitude - BREAK_ALT) / (p.def.altitudeVacuum - BREAK_ALT);
          }
        } else {
          localVacFrac = vacFrac;
        }
        const effThrust = p.def.maxThrust * thr * (p.def.thrustSL + (1 - p.def.thrustSL) * localVacFrac);
        const effIsp = p.def.ispSL + (p.def.isp - p.def.ispSL) * localVacFrac;
        thrustMag += effThrust;
        if (effIsp > 0)
          massFlow += effThrust / (effIsp * G0);
      }
      const thrustForce = vec2.scale(noseDir, thrustMag);
      if (massFlow > 0) {
        rocket.consumeFuel(massFlow * dt);
        body.mass = rocket.getTotalMass();
      }
      const speed = vec2.length(body.vel);
      let dragForceMag = 0;
      const dragForce = vec2.zero();
      const airflowDirEarly = speed > 0 ? { x: -body.vel.x / speed, y: -body.vel.y / speed } : { x: 0, y: -1 };
      const noseExposureEarly = vec2.dot(noseDir, airflowDirEarly);
      if (speed > 0 && rho > 0) {
        const cd = rocket.getEffectiveDragCoeff();
        const area = rocket.getCrossSection();
        const sinSqAOA = Math.max(0, 1 - noseExposureEarly * noseExposureEarly);
        const aoaFactor = 1 + 3 * sinSqAOA;
        dragForceMag = 0.5 * rho * speed * speed * cd * area * aoaFactor;
        const velDir = vec2.normalize(body.vel);
        dragForce.x = -velDir.x * dragForceMag;
        dragForce.y = -velDir.y * dragForceMag;
      }
      if (rho > 0.01 && speed > 50) {
        const progradeX = body.vel.x / speed, progradeY = body.vel.y / speed;
        const cross = noseDir.x * progradeY - noseDir.y * progradeX;
        const q = 0.5 * rho * speed * speed;
        const L = 30;
        const I = Math.max(body.mass * L * L / 12, 1);
        const stabilityAlpha = Math.min(2, q * 3e-4 * rocket.getCrossSection() / I);
        body.angVel -= cross * stabilityAlpha * dt;
      }
      const netForce = {
        x: gravForce.x + thrustForce.x + dragForce.x,
        y: gravForce.y + thrustForce.y + dragForce.y
      };
      const m = Math.max(body.mass, 1);
      const accel = vec2.scale(netForce, 1 / m);
      body.vel.x += accel.x * dt;
      body.vel.y += accel.y * dt;
      body.pos.x += body.vel.x * dt;
      body.pos.y += body.vel.y * dt;
      const newR = vec2.length(body.pos);
      if (newR < R_EARTH) {
        const surfaceDir = vec2.normalize(body.pos);
        body.pos = vec2.scale(surfaceDir, R_EARTH);
        const vRad = vec2.dot(body.vel, surfaceDir);
        if (vRad < 0) {
          body.vel.x -= surfaceDir.x * vRad;
          body.vel.y -= surfaceDir.y * vRad;
          body.vel.x *= 0.5;
          body.vel.y *= 0.5;
        }
      }
      if (inMoonSOI && moonDist < R_MOON && moonDist > 0) {
        const moonSurfDir = { x: relToMoon.x / moonDist, y: relToMoon.y / moonDist };
        body.pos.x = moonPos.x + moonSurfDir.x * R_MOON;
        body.pos.y = moonPos.y + moonSurfDir.y * R_MOON;
        const mv = getMoonVelocity(this.missionTime);
        const rvx = body.vel.x - mv.x, rvy = body.vel.y - mv.y;
        const vRadRel = rvx * moonSurfDir.x + rvy * moonSurfDir.y;
        if (vRadRel < 0) {
          body.vel.x -= moonSurfDir.x * vRadRel;
          body.vel.y -= moonSurfDir.y * vRadRel;
          const newRvx = body.vel.x - mv.x, newRvy = body.vel.y - mv.y;
          body.vel.x = mv.x + newRvx * 0.4;
          body.vel.y = mv.y + newRvy * 0.4;
        }
      }
      body.angVel *= ANGULAR_DAMPING;
      body.angle += body.angVel * dt;
      const heatingIntensity = this.atmo.getHeatingIntensity(altitude, speed);
      const airflowDir = airflowDirEarly;
      const noseExposure = noseExposureEarly;
      const exposure = Math.abs(noseExposure);
      const heatFlux = rho > 0 ? HEAT_COEFF * rho * speed * speed * speed : 0;
      if (heatFlux > 500 && exposure > 0.05) {
        const buf = this._heatBuf;
        buf.length = 0;
        for (const p of rocket.parts)
          buf.push(p);
        if (noseExposure < 0)
          buf.sort((a, b) => b.slotIndex - a.slotIndex);
        else
          buf.sort((a, b) => a.slotIndex - b.slotIndex);
        const windwardFirst = buf;
        let passthrough = exposure;
        for (const part of windwardFirst) {
          if (part.isDestroyed)
            continue;
          const partHeat = heatFlux * passthrough;
          const dT = partHeat * (1 - part.def.heatResistance) / Math.max(part.currentMass, 50) * dt;
          part.currentTemperature += dT;
          const excess = part.currentTemperature - 293;
          if (excess > 0) {
            part.currentTemperature -= HEAT_COOLING * excess * dt;
            part.currentTemperature = Math.max(293, part.currentTemperature);
          }
          passthrough *= Math.max(0, 1 - part.def.heatResistance * 0.92);
          if (passthrough < 5e-3)
            break;
          if (part.currentTemperature > part.def.maxTemperature) {
            part.heatDamage += dt / HEAT_DESTROY_TIME;
            if (part.heatDamage >= 1) {
              part.isDestroyed = true;
            }
          } else {
            part.heatDamage = Math.max(0, part.heatDamage - dt * 0.05);
          }
        }
      } else if (heatFlux <= 100) {
        for (const part of rocket.parts) {
          if (part.isDestroyed)
            continue;
          const excess = part.currentTemperature - 293;
          if (excess > 0) {
            part.currentTemperature -= HEAT_COOLING * 0.5 * excess * dt;
            part.currentTemperature = Math.max(293, part.currentTemperature);
          }
        }
      }
      const mach = soundSpeed > 0 ? speed / soundSpeed : 0;
      const atmoLayerName = this.atmo.getLayerName(altitude);
      const verticalSpeed = vec2.dot(body.vel, radial);
      const tangentDir = { x: -radial.y, y: radial.x };
      const horizontalSpeed = vec2.dot(body.vel, tangentDir);
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
        inMoonSOI,
        altAboveNearest,
        forceGravity: { x: gravForce.x, y: gravForce.y },
        forceThrust: { x: thrustForce.x, y: thrustForce.y },
        forceDrag: { x: dragForce.x, y: dragForce.y },
        forceNet: { x: netForce.x, y: netForce.y }
      };
    }
    // ─── Utility Methods ────────────────────────────────────────────────────────
    /**
     * Altitude in metres above Earth's mean surface.
     * @param pos  World-space position vector (m)
     */
    getAltitude(pos) {
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
    applyRotation(body, direction, dt, hasPod2) {
      const baseTorque = hasPod2 ? REACTION_WHEEL_TORQUE : GIMBAL_TORQUE_COEFF;
      const L = 30;
      const I = Math.max(body.mass * L * L / 12, 1);
      const alpha = Math.min(8, Math.max(0.3, baseTorque / I));
      body.angVel += alpha * direction * dt;
    }
    /**
     * Effective angular acceleration (rad/s²) that `applyRotation` will produce for this body.
     * Used by the autopilot to compute a safe maximum angular velocity.
     */
    getRotationAlpha(body, hasPod2) {
      const baseTorque = hasPod2 ? REACTION_WHEEL_TORQUE : GIMBAL_TORQUE_COEFF;
      const L = 30;
      const I = Math.max(body.mass * L * L / 12, 1);
      return Math.min(8, Math.max(0.3, baseTorque / I));
    }
    /**
     * Quick gravity magnitude at a given altitude (m/s²).
     * Useful for Isp conversions in vacuum vs. atmosphere.
     */
    getGravity(altitudeM) {
      const r = R_EARTH + altitudeM;
      return MU_EARTH / (r * r);
    }
    /**
     * Compute the orbital speed needed for a circular orbit at a given altitude.
     * v_circ = sqrt(μ / r)
     */
    circularOrbitSpeed(altitudeM) {
      return Math.sqrt(MU_EARTH / (R_EARTH + altitudeM));
    }
    /**
     * Compute orbital period for a circular orbit at a given altitude (seconds).
     * T = 2π · sqrt(r³ / μ)
     */
    orbitalPeriod(altitudeM) {
      const r = R_EARTH + altitudeM;
      return 2 * Math.PI * Math.sqrt(r * r * r / MU_EARTH);
    }
    // ─── High-Warp Simplified Propagation ──────────────────────────────────────
    /**
     * Gravity-only acceleration at world position `pos` and mission time `t`.
     * N-body: Earth + Moon. Result is in m/s² (not multiplied by mass).
     */
    _gravAccel(pos, t) {
      const r = Math.hypot(pos.x, pos.y);
      if (r < 1)
        return { x: 0, y: 0 };
      const earthAcc = MU_EARTH / (r * r);
      const ex = -(pos.x / r) * earthAcc;
      const ey = -(pos.y / r) * earthAcc;
      const mp = getMoonPosition(t);
      const rx = pos.x - mp.x, ry = pos.y - mp.y;
      const md = Math.hypot(rx, ry);
      if (md < 1)
        return { x: ex, y: ey };
      const moonAcc = MU_MOON / (md * md);
      return { x: ex - rx / md * moonAcc, y: ey - ry / md * moonAcc };
    }
    /** One RK4 gravity step for body at current missionTime. Does NOT advance missionTime. */
    _rk4GravityStep(body, dt) {
      const t = this.missionTime;
      const h = dt, h2 = h / 2;
      const a1 = this._gravAccel(body.pos, t);
      const vx1 = body.vel.x, vy1 = body.vel.y;
      const p2 = { x: body.pos.x + vx1 * h2, y: body.pos.y + vy1 * h2 };
      const vx2 = body.vel.x + a1.x * h2, vy2 = body.vel.y + a1.y * h2;
      const a2 = this._gravAccel(p2, t + h2);
      const p3 = { x: body.pos.x + vx2 * h2, y: body.pos.y + vy2 * h2 };
      const vx3 = body.vel.x + a2.x * h2, vy3 = body.vel.y + a2.y * h2;
      const a3 = this._gravAccel(p3, t + h2);
      const p4 = { x: body.pos.x + vx3 * h, y: body.pos.y + vy3 * h };
      const vx4 = body.vel.x + a3.x * h, vy4 = body.vel.y + a3.y * h;
      const a4 = this._gravAccel(p4, t + h);
      body.pos.x += (vx1 + 2 * vx2 + 2 * vx3 + vx4) * h / 6;
      body.pos.y += (vy1 + 2 * vy2 + 2 * vy3 + vy4) * h / 6;
      body.vel.x += (a1.x + 2 * a2.x + 2 * a3.x + a4.x) * h / 6;
      body.vel.y += (a1.y + 2 * a2.y + 2 * a3.y + a4.y) * h / 6;
    }
    /**
     * Simplified warp-mode step: gravity only (N-body, RK4), no drag/heat/thrust.
     * Splits `totalDt` into sub-steps of at most MAX_WARP_SUB_DT for stability.
     * Also advances missionTime and updates lastFrame.
     */
    stepWarp(body, totalDt) {
      const MAX_SUB_DT = 30;
      const n = Math.ceil(totalDt / MAX_SUB_DT);
      const subDt = totalDt / n;
      for (let i = 0; i < n; i++) {
        this._rk4GravityStep(body, subDt);
        this.missionTime += subDt;
        const nr = Math.hypot(body.pos.x, body.pos.y);
        if (nr < R_EARTH) {
          const sd = { x: body.pos.x / nr, y: body.pos.y / nr };
          body.pos.x = sd.x * R_EARTH;
          body.pos.y = sd.y * R_EARTH;
          const vr = body.vel.x * sd.x + body.vel.y * sd.y;
          if (vr < 0) {
            body.vel.x -= sd.x * vr;
            body.vel.y -= sd.y * vr;
          }
          body.vel.x *= 0.3;
          body.vel.y *= 0.3;
          break;
        }
        const mp = getMoonPosition(this.missionTime);
        const mdx = body.pos.x - mp.x, mdy = body.pos.y - mp.y;
        const md = Math.hypot(mdx, mdy);
        if (md > 0 && md < R_MOON) {
          const sd = { x: mdx / md, y: mdy / md };
          body.pos.x = mp.x + sd.x * R_MOON;
          body.pos.y = mp.y + sd.y * R_MOON;
          const mv = getMoonVelocity(this.missionTime);
          const rvx = body.vel.x - mv.x, rvy = body.vel.y - mv.y;
          const vr = rvx * sd.x + rvy * sd.y;
          if (vr < 0) {
            body.vel.x -= sd.x * vr;
            body.vel.y -= sd.y * vr;
          }
          body.vel.x = mv.x + (body.vel.x - mv.x) * 0.3;
          body.vel.y = mv.y + (body.vel.y - mv.y) * 0.3;
          break;
        }
      }
      const r = Math.hypot(body.pos.x, body.pos.y);
      const alt = r - R_EARTH;
      const speed = Math.hypot(body.vel.x, body.vel.y);
      const radial = r > 0 ? { x: body.pos.x / r, y: body.pos.y / r } : { x: 0, y: 1 };
      const tangent = { x: -radial.y, y: radial.x };
      const moonPos = getMoonPosition(this.missionTime);
      const relToMoon = { x: body.pos.x - moonPos.x, y: body.pos.y - moonPos.y };
      const moonDist = Math.hypot(relToMoon.x, relToMoon.y);
      const inMoonSOI = moonDist < MOON_SOI && moonDist > 0;
      const gravMag = inMoonSOI ? MU_MOON / (moonDist * moonDist) : MU_EARTH / (r * r);
      const gfx = -radial.x * gravMag * body.mass, gfy = -radial.y * gravMag * body.mass;
      this.lastFrame = {
        ...this.lastFrame,
        altitude: alt,
        speed,
        verticalSpeed: body.vel.x * radial.x + body.vel.y * radial.y,
        horizontalSpeed: body.vel.x * tangent.x + body.vel.y * tangent.y,
        dynamicPressure: 0,
        gravityAcc: gravMag,
        dragForce: 0,
        thrustForce: 0,
        mach: 0,
        heatingIntensity: 0,
        heatFlux: 0,
        inMoonSOI,
        altAboveNearest: inMoonSOI ? moonDist - R_MOON : alt,
        atmoLayerName: this.atmo.getLayerName(alt),
        forceGravity: { x: gfx, y: gfy },
        forceThrust: { x: 0, y: 0 },
        forceDrag: { x: 0, y: 0 },
        forceNet: { x: gfx, y: gfy }
      };
    }
    /**
     * Reset mission time (called when starting a new launch).
     */
    reset() {
      this.missionTime = 0;
      this.lastFrame = {
        altitude: 0,
        speed: 0,
        verticalSpeed: 0,
        horizontalSpeed: 0,
        heatingIntensity: 0,
        dynamicPressure: 0,
        gravityAcc: G0,
        dragForce: 0,
        thrustForce: 0,
        mach: 0,
        atmoLayerName: "TROPOSPHERE",
        airflowDir: { x: 0, y: -1 },
        heatFlux: 0,
        noseExposure: 0,
        inMoonSOI: false,
        altAboveNearest: 0,
        forceGravity: { x: 0, y: 0 },
        forceThrust: { x: 0, y: 0 },
        forceDrag: { x: 0, y: 0 },
        forceNet: { x: 0, y: 0 }
      };
    }
    /**
     * Clone a RigidBody for trajectory prediction (does not modify original).
     */
    cloneBody(body) {
      return {
        pos: vec2.clone(body.pos),
        vel: vec2.clone(body.vel),
        angle: body.angle,
        angVel: body.angVel,
        mass: body.mass
      };
    }
  };

  // src/Rocket.ts
  var LAUNCH_LAT_RAD = 28.5 * (Math.PI / 180);
  var SURFACE_SPEED = R_EARTH * (2 * Math.PI / 86400) * Math.cos(LAUNCH_LAT_RAD);
  var Rocket = class _Rocket {
    constructor() {
      /** Ordered part stack: index 0 = bottommost part (engine/heat-shield end) */
      this.parts = [];
      /** Stage data: stageIndex 0 fires first (press Space once), etc. */
      this.stages = [];
      /** Current highest stage that has been activated (−1 = none yet) */
      this.currentStage = -1;
      /** Physics body — initialised when rocket is placed on launchpad */
      this.body = {
        pos: { x: 0, y: R_EARTH },
        vel: { x: SURFACE_SPEED, y: 0 },
        angle: 0,
        angVel: 0,
        mass: 0
      };
      /** Whether rocket has left the ground */
      this.hasLaunched = false;
      /** Whether rocket has been destroyed (crashed / overheated) */
      this.isDestroyed = false;
      /**
       * Velocity impulse (m/s) queued by the last decoupler separation.
       * Game.ts applies this to body.vel along the nose direction after staging.
       */
      this.pendingSeparationDV = 0;
      /** Current throttle 0–1, set by Game.ts each frame before physics.step */
      this.throttle = 0;
    }
    // ─── VAB Assembly ───────────────────────────────────────────────────────────
    /**
     * Add a part to the top of the rocket stack in the VAB.
     * Automatically assigns a slot index.
     */
    addPartOnTop(type) {
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
    removePartById(id) {
      const idx = this.parts.findIndex((p) => p.id === id);
      if (idx === -1)
        return;
      this.parts.splice(idx, 1);
      for (let i = 0; i < this.parts.length; i++) {
        this.parts[i].slotIndex = i;
      }
      this._refreshMass();
      this._rebuildStages();
    }
    /** Clear all parts (reset for new build) */
    clearParts() {
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
    insertPartAt(type, slot, stageIndex = -1) {
      const inst = new PartInstance(type, 0);
      inst.stageIndex = stageIndex;
      const s = Math.max(0, Math.min(slot, this.parts.length));
      this.parts.splice(s, 0, inst);
      for (let i = 0; i < this.parts.length; i++)
        this.parts[i].slotIndex = i;
      this._refreshMass();
      this._rebuildStages();
      return inst;
    }
    /** Total rendered height of the rocket stack in pixels (for VAB display) */
    get stackHeightPx() {
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
    autoStage() {
      for (const part of this.parts)
        part.stageIndex = -1;
      let stageIdx = 0;
      for (const part of this.parts) {
        if (isEnginePart(part.def.type)) {
          part.stageIndex = stageIdx;
        } else if (isDecouplerPart(part.def.type)) {
          stageIdx++;
          part.stageIndex = stageIdx;
        }
      }
      this._rebuildStages();
    }
    /**
     * Cycle a part's stage assignment: -1 → 0 → 1 → 2 → 3 → -1
     */
    cycleStage(partId) {
      const part = this.parts.find((p) => p.id === partId);
      if (!part)
        return;
      part.stageIndex = part.stageIndex < 3 ? part.stageIndex + 1 : -1;
      this._rebuildStages();
    }
    /**
     * Assign a part to a specific stage (called from staging screen).
     */
    assignStage(partId, stageIndex) {
      const part = this.parts.find((p) => p.id === partId);
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
    activateNextStage() {
      const nextStage = this.currentStage + 1;
      const stage = this.stages.find((s) => s.stageIndex === nextStage);
      if (!stage)
        return false;
      this.currentStage = nextStage;
      const toSeparate = [];
      this.pendingSeparationDV = 0;
      for (const partId of stage.partIds) {
        const part = this.parts.find((p) => p.id === partId);
        if (!part)
          continue;
        if (isEnginePart(part.def.type)) {
          part.isActive = true;
        } else if (isDecouplerPart(part.def.type)) {
          part.isActive = true;
          toSeparate.push(partId);
          this.pendingSeparationDV += part.def.separationForce ?? 0;
        }
      }
      this._separateAt(toSeparate);
      return true;
    }
    /**
     * Deactivate all engines (throttle cut).
     */
    cutEngines() {
      for (const part of this.parts) {
        if (isEnginePart(part.def.type))
          part.isActive = false;
      }
    }
    // ─── Aggregate Physics Properties ───────────────────────────────────────────
    /** Total current mass (dry + remaining fuel) in kg */
    getTotalMass() {
      return this.parts.reduce((sum, p) => sum + p.currentMass, 0);
    }
    /**
     * Total thrust from all active (firing) engines in Newtons.
     * Uses this.throttle (set by Game.ts each frame).
     */
    getThrust() {
      return this.parts.filter((p) => p.isThrusting).reduce((sum, p) => sum + p.def.maxThrust * this.throttle, 0);
    }
    /**
     * Effective vacuum Isp of the active engine set (thrust-weighted average).
     * Used to compute mass flow: ṁ = F / (Isp · g₀).
     */
    getEffectiveIsp() {
      const engines = this.parts.filter((p) => p.isThrusting);
      if (engines.length === 0)
        return 0;
      const totalThrust = engines.reduce((s, p) => s + p.def.maxThrust, 0);
      const weightedIsp = engines.reduce((s, p) => s + p.def.maxThrust * p.def.isp, 0);
      return totalThrust > 0 ? weightedIsp / totalThrust : 0;
    }
    /**
     * Effective drag coefficient.
     * Simplified: use the part with the largest cross section that faces the flow.
     * For a stack rocket, the bottom-most part dominates drag.
     */
    getEffectiveDragCoeff() {
      if (this.parts.length === 0)
        return 0;
      const totalArea = this.parts.reduce((s, p) => s + p.def.crossSection, 0);
      if (totalArea === 0)
        return 0;
      return this.parts.reduce((s, p) => s + p.def.dragCoeff * p.def.crossSection, 0) / totalArea;
    }
    /**
     * Largest cross-section among all current parts (m²).
     * Used as the reference area for drag calculation.
     */
    getCrossSection() {
      return this.parts.reduce((max, p) => Math.max(max, p.def.crossSection), 0);
    }
    /**
     * Drain fuel from active tanks to satisfy `massKg` total consumption.
     * Drains from the bottom-most (closest to engine) tank first.
     * Deactivates engines when all fuel is gone.
     */
    consumeFuel(massKg) {
      let remaining = massKg;
      const tanks = this.parts.filter((p) => p.hasFuel).sort((a, b) => a.slotIndex - b.slotIndex);
      for (const tank of tanks) {
        if (remaining <= 0)
          break;
        const drained = tank.drainFuel(remaining);
        remaining -= drained;
      }
      if (!this.parts.some((p) => p.hasFuel)) {
        this.cutEngines();
      }
    }
    /** True if any engine is actively burning */
    get isThrusting() {
      return this.parts.some((p) => p.isThrusting);
    }
    /** Total fuel remaining across all tanks (kg) */
    get totalFuelRemaining() {
      return this.parts.reduce((s, p) => s + p.fuelRemaining, 0);
    }
    /** Max fuel capacity across all tanks (kg) — for HUD gauge */
    get totalFuelCapacity() {
      return this.parts.reduce((s, p) => s + p.def.maxFuelMass, 0);
    }
    /** Whether the rocket has a command pod (needed for SAS / reaction wheels) */
    get hasCommandPod() {
      return this.parts.some((p) => p.def.type === 0 /* COMMAND_POD */);
    }
    /** Whether the rocket is sitting on the ground */
    get isOnGround() {
      return !this.hasLaunched;
    }
    /** True if any critical structural part (pod or tank) has been heat-destroyed */
    get hasDestroyedCriticalPart() {
      return this.parts.some((p) => p.isDestroyed && (p.def.type === 0 /* COMMAND_POD */ || p.def.type === 11 /* COMMAND_POD_ADV */ || p.def.type === 1 /* FUEL_TANK_S */ || p.def.type === 2 /* FUEL_TANK_L */ || p.def.type === 10 /* FUEL_TANK_XL */));
    }
    // ─── Launch Initialisation ──────────────────────────────────────────────────
    /**
     * Place the rocket on the launchpad.
     * Positions it at Earth's surface pointing straight up.
     * Gives it Earth's surface rotation velocity (eastward).
     */
    placeOnLaunchpad() {
      this.body.pos = { x: 0, y: R_EARTH + 1 };
      this.body.vel = { x: SURFACE_SPEED, y: 0 };
      this.body.angle = 0;
      this.body.angVel = 0;
      this.body.mass = this.getTotalMass();
      this.hasLaunched = false;
      this.isDestroyed = false;
      this.currentStage = -1;
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
    cloneForPrediction() {
      const clone = new _Rocket();
      clone.parts = this.parts.map((p) => p.clone());
      clone.stages = this.stages.map((s) => ({ ...s, partIds: [...s.partIds] }));
      clone.currentStage = this.currentStage;
      clone.body = {
        pos: vec2.clone(this.body.pos),
        vel: vec2.clone(this.body.vel),
        angle: this.body.angle,
        angVel: this.body.angVel,
        mass: this.body.mass
      };
      return clone;
    }
    // ─── Delta-V Budget ─────────────────────────────────────────────────────────
    /**
     * Compute total ΔV using a staged Tsiolkovsky calculation.
     *
     * Staged decouplers divide the rocket into sections (bottom → top).
     * Each section's fuel is burned by the engines in that section.
     * If a section has no engine, the nearest engine above it is used
     * (drop-tank configuration).  After each section burns out the
     * decoupler fires and that dead mass is jettisoned, improving the
     * mass ratio for subsequent sections.
     *
     * Falls back to a single-stage calculation when there are no staged
     * decouplers (the result is identical to the Tsiolkovsky equation
     * applied to the whole rocket).
     */
    getDeltaV() {
      if (this.parts.length === 0)
        return 0;
      const allEngines = this.parts.filter((p) => isEnginePart(p.def.type));
      if (allEngines.length === 0)
        return 0;
      const snap = this.parts.map((p) => ({
        slot: p.slotIndex,
        dryMass: p.def.dryMass,
        fuelMass: p.fuelRemaining,
        // current remaining fuel (works for both VAB and flight)
        isEngine: isEnginePart(p.def.type),
        isDecoupler: isDecouplerPart(p.def.type),
        stageIndex: p.stageIndex,
        maxThrust: p.def.maxThrust,
        isp: p.def.isp
      }));
      const decouplers = snap.filter((p) => p.isDecoupler && p.stageIndex >= 0).sort((a, b) => a.slot - b.slot);
      if (decouplers.length === 0) {
        const thrust = allEngines.reduce((s, p) => s + p.def.maxThrust, 0);
        const isp = thrust > 0 ? allEngines.reduce((s, p) => s + p.def.maxThrust * p.def.isp, 0) / thrust : 0;
        if (isp <= 0)
          return 0;
        const m0 = snap.reduce((s, p) => s + p.dryMass + p.fuelMass, 0);
        const mdry = snap.reduce((s, p) => s + p.dryMass, 0);
        return m0 > mdry ? isp * G0 * Math.log(m0 / mdry) : 0;
      }
      let pool = [...snap];
      let totalDV = 0;
      for (const dec of decouplers) {
        const currentMass = pool.reduce((s, p) => s + p.dryMass + p.fuelMass, 0);
        if (currentMass <= 0)
          break;
        const section = pool.filter((p) => p.slot <= dec.slot);
        const sectionFuel = section.reduce((s, p) => s + p.fuelMass, 0);
        if (sectionFuel > 0) {
          let burners = section.filter((p) => p.isEngine);
          if (burners.length === 0) {
            const aboveEngine = pool.filter((p) => p.slot > dec.slot && p.isEngine).sort((a, b) => a.slot - b.slot)[0];
            if (aboveEngine)
              burners = [aboveEngine];
          }
          if (burners.length > 0) {
            const thrust = burners.reduce((s, p) => s + p.maxThrust, 0);
            const isp = thrust > 0 ? burners.reduce((s, p) => s + p.maxThrust * p.isp, 0) / thrust : 0;
            if (isp > 0) {
              const mBurnout = currentMass - sectionFuel;
              if (mBurnout > 0)
                totalDV += isp * G0 * Math.log(currentMass / mBurnout);
            }
          }
        }
        pool = pool.filter((p) => p.slot > dec.slot);
      }
      const finalMass = pool.reduce((s, p) => s + p.dryMass + p.fuelMass, 0);
      const finalDry = pool.reduce((s, p) => s + p.dryMass, 0);
      const finalEng = pool.filter((p) => p.isEngine);
      if (finalEng.length > 0 && finalMass > finalDry) {
        const thrust = finalEng.reduce((s, p) => s + p.maxThrust, 0);
        const isp = thrust > 0 ? finalEng.reduce((s, p) => s + p.maxThrust * p.isp, 0) / thrust : 0;
        if (isp > 0)
          totalDV += isp * G0 * Math.log(finalMass / finalDry);
      }
      return totalDV;
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
    getBurnEstimate(plannedDV) {
      const NO_ENGINE = { isp: 0, thrust: 0, burnTime: Infinity, dvAvailable: 0, hasEngines: false };
      let candidates = this.parts.filter(
        (p) => p.isActive && isEnginePart(p.def.type) && !p.isDestroyed
      );
      if (candidates.length === 0) {
        const nextStages = this.stages.filter((s) => s.stageIndex > this.currentStage).sort((a, b) => a.stageIndex - b.stageIndex);
        for (const stage of nextStages) {
          const ids = new Set(stage.partIds);
          const eng = this.parts.filter(
            (p) => ids.has(p.id) && isEnginePart(p.def.type) && !p.isDestroyed
          );
          if (eng.length > 0) {
            candidates = eng;
            break;
          }
        }
      }
      if (candidates.length === 0) {
        candidates = this.parts.filter((p) => isEnginePart(p.def.type) && !p.isDestroyed);
      }
      if (candidates.length === 0)
        return NO_ENGINE;
      const thrust = candidates.reduce((s, p) => s + p.def.maxThrust, 0);
      const isp = thrust > 0 ? candidates.reduce((s, p) => s + p.def.maxThrust * p.def.isp, 0) / thrust : 0;
      if (isp <= 0 || thrust <= 0)
        return NO_ENGINE;
      const m0 = this.getTotalMass();
      const fuel = this.totalFuelRemaining;
      const mdry = m0 - fuel;
      const dvAvailable = mdry > 0 && m0 > mdry ? isp * G0 * Math.log(m0 / mdry) : 0;
      const dvCapped = Math.min(plannedDV, dvAvailable + 1);
      const massFlow = thrust / (isp * G0);
      const m1 = m0 * Math.exp(-dvCapped / (isp * G0));
      const burnTime = massFlow > 0 ? (m0 - m1) / massFlow : Infinity;
      return { isp, thrust, burnTime, dvAvailable, hasEngines: true };
    }
    // ─── Private Helpers ────────────────────────────────────────────────────────
    _refreshMass() {
      this.body.mass = this.getTotalMass();
    }
    _rebuildStages() {
      const map = /* @__PURE__ */ new Map();
      for (const part of this.parts) {
        if (part.stageIndex < 0)
          continue;
        if (!map.has(part.stageIndex))
          map.set(part.stageIndex, []);
        map.get(part.stageIndex).push(part.id);
      }
      this.stages = Array.from(map.entries()).map(([idx, ids]) => ({ stageIndex: idx, partIds: ids })).sort((a, b) => a.stageIndex - b.stageIndex);
    }
    /**
     * Remove decouplers (and everything below them) from the parts list.
     * @param decouplerIds  IDs of decouplers that were triggered
     */
    _separateAt(decouplerIds) {
      if (decouplerIds.length === 0)
        return;
      let lowestSlot = Infinity;
      for (const id of decouplerIds) {
        const part = this.parts.find((p) => p.id === id);
        if (part && part.slotIndex < lowestSlot) {
          lowestSlot = part.slotIndex;
        }
      }
      this.parts = this.parts.filter((p) => p.slotIndex > lowestSlot);
      for (let i = 0; i < this.parts.length; i++) {
        this.parts[i].slotIndex = i;
      }
      this._refreshMass();
      this._rebuildStages();
    }
  };

  // src/Atmosphere.ts
  var ATMOSPHERE_CEILING = 7e4;
  var RHO_0 = 1.225;
  var SCALE_HEIGHT = 8500;
  var P_0 = 101325;
  var LAPSE_RATE = 65e-4;
  var T_0 = 288.15;
  var ATMO_LAYERS = [
    { name: "TROPOSPHERE", minAlt: 0, maxAlt: 12e3, skyRgb: [100, 160, 255] },
    { name: "STRATOSPHERE", minAlt: 12e3, maxAlt: 5e4, skyRgb: [30, 80, 200] },
    { name: "MESOSPHERE", minAlt: 5e4, maxAlt: 8e4, skyRgb: [10, 20, 80] },
    { name: "THERMOSPHERE", minAlt: 8e4, maxAlt: 69e4, skyRgb: [5, 8, 25] },
    { name: "EXOSPHERE", minAlt: 69e4, maxAlt: Infinity, skyRgb: [2, 3, 10] }
  ];
  var Atmosphere = class {
    /**
     * Air density at a given altitude above mean sea level (kg/m³).
     * Returns 0 above the atmosphere ceiling.
     *
     * @param altitudeM  Altitude in metres above Earth's surface
     */
    getDensity(altitudeM) {
      if (altitudeM >= ATMOSPHERE_CEILING)
        return 0;
      if (altitudeM < 0)
        altitudeM = 0;
      return RHO_0 * Math.exp(-altitudeM / SCALE_HEIGHT);
    }
    /**
     * Atmospheric pressure at a given altitude (Pa).
     * Uses a simple power-law approximation (ISA troposphere formula).
     *
     * @param altitudeM  Altitude in metres above Earth's surface
     */
    getPressure(altitudeM) {
      if (altitudeM >= ATMOSPHERE_CEILING)
        return 0;
      if (altitudeM < 0)
        altitudeM = 0;
      const T = T_0 - LAPSE_RATE * Math.min(altitudeM, 11e3);
      return P_0 * Math.pow(T / T_0, 5.2561);
    }
    /**
     * Returns true if the given altitude is within the sensible atmosphere
     * (i.e., drag and heating effects are non-negligible).
     *
     * @param altitudeM  Altitude in metres
     */
    isInAtmosphere(altitudeM) {
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
    getDynamicPressure(altitudeM, speedMs) {
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
    getHeatingIntensity(altitudeM, speedMs) {
      const rho = this.getDensity(altitudeM);
      const Ck = 174e-12;
      const raw = Ck * rho * speedMs * speedMs * speedMs;
      return Math.min(raw, 1);
    }
    /**
     * Sound speed in m/s at a given altitude (approximate).
     * Used to compute Mach number for drag effects.
     *
     * @param altitudeM  Altitude in metres
     */
    getSoundSpeed(altitudeM) {
      if (altitudeM >= ATMOSPHERE_CEILING)
        return 0;
      const T = Math.max(T_0 - LAPSE_RATE * Math.min(altitudeM, 11e3), 216.65);
      return Math.sqrt(1.4 * 287 * T);
    }
    // ─── Layer helpers ─────────────────────────────────────────────────────────
    getLayer(altitudeM) {
      const alt = Math.max(0, altitudeM);
      for (const layer of ATMO_LAYERS) {
        if (alt < layer.maxAlt)
          return layer;
      }
      return ATMO_LAYERS[ATMO_LAYERS.length - 1];
    }
    getLayerName(altitudeM) {
      return this.getLayer(altitudeM).name;
    }
    /** CSS rgba colour for the sky at the given altitude (used by Renderer). */
    getSkyColor(altitudeM, alpha = 1) {
      const [r, g, b] = this.getLayer(altitudeM).skyRgb;
      return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    }
  };

  // src/Renderer.ts
  function generateStars(count, seed = 42) {
    const stars = [];
    let s = seed;
    const rand = () => {
      s = s * 1664525 + 1013904223 & 4294967295;
      return (s >>> 0) / 4294967295;
    };
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(),
        y: rand(),
        r: rand() < 0.05 ? rand() * 1.8 + 0.8 : rand() * 0.8 + 0.3,
        bright: rand() * 0.7 + 0.3
      });
    }
    return stars;
  }
  var STARS = generateStars(600);
  var STAR_BUCKETS = Array.from({ length: 5 }, (_, i) => ({
    stars: [],
    bright: (i + 0.5) / 5
  }));
  for (const s of STARS) {
    STAR_BUCKETS[Math.min(4, Math.floor(s.bright * 5))].stars.push(s);
  }
  var Renderer = class _Renderer {
    constructor(ctx) {
      /** Elapsed time in seconds — used for animated effects */
      this.time = 0;
      /** Hit areas for warp buttons — updated each HUD render, read by Game.ts */
      this.warpDownBtn = { x: 0, y: 0, w: 28, h: 28 };
      this.warpUpBtn = { x: 0, y: 0, w: 28, h: 28 };
      /** Previous mpp — used to smooth zoom across SOI-boundary jumps */
      this._smoothMpp = -1;
      this.ctx = ctx;
      this.W = ctx.canvas.width;
      this.H = ctx.canvas.height;
    }
    resize(w, h) {
      this.W = w;
      this.H = h;
    }
    // ─── Full Flight Scene ────────────────────────────────────────────────────
    /**
     * Render one frame of the flight scene.
     * @param rocket      Current rocket state
     * @param frame       Latest physics frame data
     * @param throttle    Current throttle 0–1
     */
    renderFlight(rocket, frame, throttle, missionTime = 0, advancedDebug = false) {
      const ctx = this.ctx;
      const { H } = this;
      const alt = frame.altAboveNearest;
      const viewHeightM = alt < 1e5 ? 2e4 + alt * alt / 5e4 : 22e4 * Math.pow(alt / 1e5, 0.6);
      const targetMpp = isFinite(viewHeightM) && H > 0 ? viewHeightM / H : 1e3;
      if (this._smoothMpp < 0)
        this._smoothMpp = targetMpp;
      this._smoothMpp = Math.max(targetMpp / 3, Math.min(
        targetMpp * 3,
        this._smoothMpp * 0.82 + targetMpp * 0.18
      ));
      const mpp = this._smoothMpp;
      const camera = {
        focus: vec2.clone(rocket.body.pos),
        metersPerPixel: mpp
      };
      const skyAlt = frame.inMoonSOI ? 2e5 : frame.altitude;
      this._drawSkyBackground(skyAlt);
      const starFade = skyAlt < 3e4 ? skyAlt / 3e4 : 1;
      this._drawStars(camera, starFade);
      this._drawEarth(camera);
      const moonWorldPos = getMoonPosition(missionTime);
      this._drawMoon(moonWorldPos, camera);
      if (frame.inMoonSOI) {
        this._drawMoonSurface(moonWorldPos, camera);
      }
      this._drawLaunchpad(camera);
      const rocketScreenPos = this._worldToScreen(rocket.body.pos, camera);
      ctx.save();
      ctx.translate(rocketScreenPos.x, rocketScreenPos.y);
      ctx.rotate(rocket.body.angle);
      const partScale = Math.max(3 / mpp, 1);
      let stackH = 0, stackMaxW = 44 * partScale;
      for (const p of rocket.parts) {
        if (!p.def.radialMount)
          stackH += p.def.renderH * partScale;
        const pw = p.def.renderW * partScale;
        if (pw > stackMaxW)
          stackMaxW = pw;
      }
      if (rocket.isThrusting && throttle > 0) {
        this._drawExhaustPlume(rocket, partScale, throttle, stackH);
      }
      this._drawRocketParts(rocket, partScale, stackH);
      if (frame.dynamicPressure > 5e3 && Math.abs(frame.noseExposure) > 0.05) {
        this._drawAscentAero(rocket, partScale, frame, stackH, stackMaxW);
      }
      if (frame.heatFlux > 5e4 && Math.abs(frame.noseExposure) > 0.05) {
        this._drawAeroHeating(rocket, partScale, frame, stackH, stackMaxW);
      }
      ctx.restore();
      if (advancedDebug) {
        this._drawForceVectors(rocket, frame, rocketScreenPos);
      }
    }
    // ─── Debug Force Vectors ──────────────────────────────────────────────────
    _drawForceVectors(rocket, frame, origin) {
      const ctx = this.ctx;
      const { W } = this;
      const forces = [
        { vec: frame.forceGravity, color: "#FFD700", label: "G", fullName: "Gravity" },
        { vec: frame.forceThrust, color: "#00E5FF", label: "T", fullName: "Thrust" },
        { vec: frame.forceDrag, color: "#FF5555", label: "D", fullName: "Drag" },
        { vec: frame.forceNet, color: "#FFFFFF", label: "NET", fullName: "Net" }
      ];
      const MAX_ARROW_PX = 130;
      const maxMag = Math.max(...forces.map((f) => Math.hypot(f.vec.x, f.vec.y)), 1);
      const scale = MAX_ARROW_PX / maxMag;
      const ox = origin.x, oy = origin.y;
      ctx.save();
      for (const f of forces) {
        const mag = Math.hypot(f.vec.x, f.vec.y);
        if (mag < 0.1)
          continue;
        const len = mag * scale;
        const dx = f.vec.x / mag * len;
        const dy = -(f.vec.y / mag) * len;
        const ex = ox + dx, ey = oy + dy;
        const isNet = f.label === "NET";
        ctx.strokeStyle = f.color;
        ctx.lineWidth = isNet ? 2.5 : 1.8;
        ctx.setLineDash(isNet ? [6, 3] : []);
        ctx.globalAlpha = isNet ? 0.95 : 0.9;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        const headLen = Math.min(14, len * 0.28);
        const angle = Math.atan2(dy, dx);
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(angle + 2.7) * headLen, ey + Math.sin(angle + 2.7) * headLen);
        ctx.lineTo(ex + Math.cos(angle - 2.7) * headLen, ey + Math.sin(angle - 2.7) * headLen);
        ctx.closePath();
        ctx.fill();
        const tipDist = headLen + 4;
        const lx = ex + Math.cos(angle) * tipDist;
        const ly = ey + Math.sin(angle) * tipDist;
        const perpX = -Math.sin(angle) * 2;
        const perpY = Math.cos(angle) * 2;
        ctx.globalAlpha = 1;
        ctx.fillStyle = f.color;
        ctx.font = `bold 11px Courier New`;
        ctx.textAlign = dx >= 0 ? "left" : "right";
        ctx.fillText(f.label, lx + perpX, ly + perpY - 2);
        ctx.font = "10px Courier New";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.85;
        ctx.fillText(`${(mag / 1e3).toFixed(1)} kN`, lx + perpX, ly + perpY + 10);
        ctx.globalAlpha = isNet ? 0.95 : 0.9;
      }
      const hudY = 18;
      const colW = 110;
      const totalW = forces.length * colW;
      const startX = W / 2 - totalW / 2;
      ctx.globalAlpha = 1;
      forces.forEach((f, i) => {
        const mag = Math.hypot(f.vec.x, f.vec.y);
        const cx = startX + i * colW + colW / 2;
        ctx.fillStyle = f.color;
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(`${f.label} \u2014 ${f.fullName}`, cx, hudY);
        ctx.fillStyle = mag < 0.1 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)";
        ctx.font = "11px Courier New";
        ctx.fillText(`${(mag / 1e3).toFixed(1)} kN`, cx, hudY + 15);
      });
      ctx.fillStyle = "rgba(180,210,255,0.5)";
      ctx.font = "9px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(`FORCE DEBUG  \xB7  mass ${(rocket.body.mass / 1e3).toFixed(1)} t`, W / 2, hudY + 30);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // ─── Earth & Atmosphere ───────────────────────────────────────────────────
    _drawEarth(cam) {
      const ctx = this.ctx;
      const earthScreen = this._worldToScreen({ x: 0, y: 0 }, cam);
      const earthRadPx = R_EARTH / cam.metersPerPixel;
      const atmoRadPx = (R_EARTH + 7e4) / cam.metersPerPixel;
      if (earthScreen.x + atmoRadPx < 0 || earthScreen.x - atmoRadPx > this.W || earthScreen.y + atmoRadPx < 0 || earthScreen.y - atmoRadPx > this.H)
        return;
      const atmoGrad = ctx.createRadialGradient(
        earthScreen.x,
        earthScreen.y,
        earthRadPx * 0.98,
        earthScreen.x,
        earthScreen.y,
        atmoRadPx
      );
      atmoGrad.addColorStop(0, "rgba(80,160,255,0.35)");
      atmoGrad.addColorStop(0.5, "rgba(40,100,200,0.12)");
      atmoGrad.addColorStop(1, "rgba(0,30,80,0)");
      ctx.beginPath();
      ctx.arc(earthScreen.x, earthScreen.y, atmoRadPx, 0, Math.PI * 2);
      ctx.fillStyle = atmoGrad;
      ctx.fill();
      const earthGrad = ctx.createRadialGradient(
        earthScreen.x - earthRadPx * 0.3,
        earthScreen.y - earthRadPx * 0.3,
        earthRadPx * 0.1,
        earthScreen.x,
        earthScreen.y,
        earthRadPx
      );
      earthGrad.addColorStop(0, "#4a9eff");
      earthGrad.addColorStop(0.38, "#2266cc");
      earthGrad.addColorStop(0.68, "#1a5533");
      earthGrad.addColorStop(0.84, "#2e7d32");
      earthGrad.addColorStop(0.94, "#12380e");
      earthGrad.addColorStop(1, "#061008");
      ctx.beginPath();
      ctx.arc(earthScreen.x, earthScreen.y, earthRadPx, 0, Math.PI * 2);
      ctx.fillStyle = earthGrad;
      ctx.fill();
      if (earthRadPx < this.H * 0.45) {
        const grassW = Math.max(2, Math.min(earthRadPx * 0.018, 20));
        ctx.beginPath();
        ctx.arc(earthScreen.x, earthScreen.y, earthRadPx - grassW * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#3e8b30";
        ctx.lineWidth = grassW;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(earthScreen.x, earthScreen.y, earthRadPx, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(100,180,255,0.12)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // ─── Moon ────────────────────────────────────────────────────────────────
    _drawMoon(moonWorldPos, cam) {
      const ctx = this.ctx;
      const moonScreen = this._worldToScreen(moonWorldPos, cam);
      const moonRadPx = R_MOON / cam.metersPerPixel;
      if (moonRadPx < 0.5)
        return;
      const mx = moonScreen.x;
      const my = moonScreen.y;
      const moonGrad = ctx.createRadialGradient(
        mx - moonRadPx * 0.28,
        my - moonRadPx * 0.28,
        moonRadPx * 0.05,
        mx,
        my,
        moonRadPx
      );
      moonGrad.addColorStop(0, "#e8e8e0");
      moonGrad.addColorStop(0.4, "#b0b0a8");
      moonGrad.addColorStop(0.72, "#686860");
      moonGrad.addColorStop(0.9, "#383830");
      moonGrad.addColorStop(1, "#141410");
      ctx.beginPath();
      ctx.arc(mx, my, moonRadPx, 0, Math.PI * 2);
      ctx.fillStyle = moonGrad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mx, my, moonRadPx, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200,200,188,0.14)";
      ctx.lineWidth = Math.max(1, moonRadPx * 0.01);
      ctx.stroke();
    }
    // ─── Moon Surface Detail ──────────────────────────────────────────────────
    _drawMoonSurface(moonWorldPos, cam) {
      const ctx = this.ctx;
      const { W, H } = this;
      const moonScreen = this._worldToScreen(moonWorldPos, cam);
      const mpp = cam.metersPerPixel;
      const moonRPx = R_MOON / mpp;
      if (moonRPx < 0.5)
        return;
      const mx = moonScreen.x, my = moonScreen.y;
      if (mx + moonRPx < 0 || mx - moonRPx > W || my + moonRPx < 0 || my - moonRPx > H)
        return;
      const crustH = Math.max(2, Math.min(20, 20 / mpp));
      ctx.beginPath();
      ctx.arc(mx, my, moonRPx - crustH * 0.4, 0, Math.PI * 2);
      ctx.strokeStyle = "#c8c0b0";
      ctx.lineWidth = crustH;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, moonRPx - crustH * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#706860";
      ctx.lineWidth = crustH * 2;
      ctx.stroke();
      if (moonRPx > 30) {
        const craters = [
          [0.42, 1.1, 0.055],
          // [angle, radialFrac, craterRadiusFrac]
          [1.85, 0.97, 0.038],
          [3, 1.02, 0.045],
          [4.2, 0.99, 0.03],
          [5.5, 1.03, 0.06],
          [0.9, 1.01, 0.025],
          [2.3, 0.98, 0.042],
          [3.8, 1, 0.035],
          [5, 0.96, 0.022],
          [1.3, 1.04, 0.048],
          [4.7, 1.01, 0.028],
          [2.8, 0.99, 0.033]
        ];
        for (const [ang, rFrac, sizeFrac] of craters) {
          const cx = mx + Math.cos(ang) * moonRPx * rFrac;
          const cy = my - Math.sin(ang) * moonRPx * rFrac;
          const cr = moonRPx * sizeFrac;
          if (cr < 0.8)
            continue;
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(210,200,180,0.7)";
          ctx.lineWidth = Math.max(0.5, cr * 0.18);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, cr * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(50,45,40,0.55)";
          ctx.fill();
        }
      }
      ctx.beginPath();
      ctx.arc(mx, my, moonRPx, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(180,170,155,0.25)";
      ctx.lineWidth = Math.max(1, moonRPx * 4e-3);
      ctx.stroke();
    }
    // ─── Ground / Launchpad Surface ───────────────────────────────────────────
    _drawLaunchpad(cam) {
      const ls = this._worldToScreen({ x: 0, y: R_EARTH }, cam);
      const mpp = cam.metersPerPixel;
      const R_px = R_EARTH / mpp;
      if (ls.y < -300 || ls.y > this.H + 5)
        return;
      if (ls.x + R_px < 0 || ls.x - R_px > this.W)
        return;
      const ctx = this.ctx;
      const earthCentre = this._worldToScreen({ x: 0, y: 0 }, cam);
      const grassH = Math.max(3, Math.min(18, 18 / mpp));
      ctx.beginPath();
      ctx.arc(earthCentre.x, earthCentre.y, R_px - grassH * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#4aaa30";
      ctx.lineWidth = grassH;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(earthCentre.x, earthCentre.y, R_px - grassH * 2.8, 0, Math.PI * 2);
      ctx.strokeStyle = "#2a5820";
      ctx.lineWidth = grassH * 3;
      ctx.stroke();
      const padW = Math.max(8, 100 / mpp);
      const padH = Math.max(3, 8 / mpp);
      ctx.fillStyle = "#909088";
      ctx.fillRect(ls.x - padW / 2, ls.y - padH - grassH + 2, padW, padH);
      if (padW > 12) {
        ctx.strokeStyle = "#ffcc00";
        ctx.lineWidth = Math.max(1, padW / 30);
        ctx.beginPath();
        ctx.moveTo(ls.x, ls.y - grassH + 2);
        ctx.lineTo(ls.x, ls.y - padH - grassH + 2);
        ctx.stroke();
      }
      const towerH = 120 / mpp;
      if (towerH < 5)
        return;
      const tx = ls.x + padW * 0.38;
      const baseY = ls.y - padH - grassH + 2;
      ctx.strokeStyle = "#aaa890";
      ctx.lineWidth = Math.max(1.5, Math.min(5, 4 / mpp));
      ctx.beginPath();
      ctx.moveTo(tx, baseY);
      ctx.lineTo(tx, baseY - towerH);
      ctx.stroke();
      if (towerH > 18) {
        ctx.lineWidth = Math.max(1, Math.min(3, 2.5 / mpp));
        for (let i = 1; i <= 3; i++) {
          const armY = baseY - towerH * i / 4;
          const armLen = padW * 0.38 * (1 - i * 0.12);
          ctx.beginPath();
          ctx.moveTo(tx, armY);
          ctx.lineTo(tx - armLen, armY);
          ctx.stroke();
          if (towerH > 35) {
            ctx.beginPath();
            ctx.moveTo(tx - armLen * 0.55, armY);
            ctx.lineTo(tx, armY - towerH * 0.14);
            ctx.stroke();
          }
        }
      }
      if (towerH > 25) {
        const alpha = 0.4 + 0.55 * Math.abs(Math.sin(this.time * 2.2));
        ctx.beginPath();
        ctx.arc(tx, baseY - towerH, Math.max(2, 3 / mpp), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,60,20,${alpha.toFixed(2)})`;
        ctx.fill();
      }
    }
    // ─── Sky Background ───────────────────────────────────────────────────────
    _drawSkyBackground(altM) {
      const ctx = this.ctx;
      const { W, H } = this;
      let r, g, b;
      if (altM < 12e3) {
        const t = altM / 12e3;
        r = Math.round(100 - 70 * t);
        g = Math.round(160 - 80 * t);
        b = Math.round(255 - 55 * t);
      } else if (altM < 5e4) {
        const t = (altM - 12e3) / 38e3;
        r = Math.round(30 - 20 * t);
        g = Math.round(80 - 60 * t);
        b = Math.round(200 - 120 * t);
      } else if (altM < 8e4) {
        const t = (altM - 5e4) / 3e4;
        r = 10;
        g = Math.round(20 - 10 * t);
        b = Math.round(80 - 62 * t);
      } else {
        r = 10;
        g = 10;
        b = 18;
      }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, W, H);
    }
    // ─── Starfield ────────────────────────────────────────────────────────────
    _drawStars(cam, opacity = 1) {
      const ctx = this.ctx;
      const { W, H } = this;
      if (opacity <= 0)
        return;
      const px = cam.focus.x / R_EARTH * 80 % W;
      const py = cam.focus.y / R_EARTH * 80 % H;
      ctx.save();
      for (const bucket of STAR_BUCKETS) {
        const alpha = Math.round(bucket.bright * opacity * 100) / 100;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        for (const s of bucket.stars) {
          const sx = ((s.x * W + px) % W + W) % W;
          const sy = ((s.y * H + py) % H + H) % H;
          ctx.moveTo(sx + s.r, sy);
          ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.restore();
    }
    static {
      // ─── Rocket Parts ─────────────────────────────────────────────────────────
      /** Half-width of the standard centre stack (px, unscaled) — used for radial offset */
      this.STACK_HALF_W = 22;
    }
    static {
      /** Gap between main stack edge and radial part edge (px, unscaled) */
      this.RADIAL_GAP = 6;
    }
    /**
     * Draw all parts centred at origin (0,0) in local rocket space.
     * Radial parts (SRBs) are drawn offset left and right with struts.
     */
    _drawRocketParts(rocket, scale, totalH) {
      const ctx = this.ctx;
      if (rocket.parts.length === 0)
        return;
      let yBottom = totalH / 2;
      const mainHW = _Renderer.STACK_HALF_W * scale;
      const radGap = _Renderer.RADIAL_GAP * scale;
      for (const part of rocket.parts) {
        const w = part.def.renderW * scale;
        const h = part.def.renderH * scale;
        const y = yBottom - h;
        if (part.def.radialMount) {
          const sideOffset = mainHW + radGap + w / 2;
          for (const side of [-1, 1]) {
            const bx = side * sideOffset - w / 2;
            if (part.isDestroyed) {
              ctx.fillStyle = "#1a1008";
              this._roundRect(bx, y, w, h, 3 * scale);
              ctx.fill();
            } else {
              ctx.fillStyle = part.def.color;
              this._roundRect(bx, y, w, h, 3 * scale);
              ctx.fill();
              ctx.strokeStyle = "rgba(255,255,255,0.15)";
              ctx.lineWidth = 1 * scale;
              this._roundRect(bx, y, w, h, 3 * scale);
              ctx.stroke();
              this._drawPartDecoration(part.def.type, bx, y, w, h, scale, part);
              this._drawPartHeatGlow(ctx, bx, y, w, h, part.currentTemperature, scale);
            }
          }
          ctx.strokeStyle = "rgba(160,170,180,0.55)";
          ctx.lineWidth = 2 * scale;
          for (const strutFrac of [0.25, 0.68]) {
            const sy = y + h * strutFrac;
            for (const side of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(side * mainHW, sy);
              ctx.lineTo(side * (mainHW + radGap + w), sy);
              ctx.stroke();
            }
          }
        } else {
          const x = -w / 2;
          if (part.isDestroyed) {
            ctx.fillStyle = "#1a1008";
            this._roundRect(x, y, w, h, 3 * scale);
            ctx.fill();
          } else {
            ctx.fillStyle = part.def.color;
            this._roundRect(x, y, w, h, 3 * scale);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.lineWidth = 1 * scale;
            this._roundRect(x, y, w, h, 3 * scale);
            ctx.stroke();
            this._drawPartDecoration(part.def.type, x, y, w, h, scale, part);
            this._drawPartHeatGlow(ctx, x, y, w, h, part.currentTemperature, scale);
          }
        }
        if (!part.def.radialMount)
          yBottom -= h;
      }
    }
    _drawPartDecoration(type, x, y, w, h, scale, part) {
      const ctx = this.ctx;
      switch (type) {
        case 0 /* COMMAND_POD */: {
          ctx.beginPath();
          ctx.ellipse(x + w * 0.5, y + h * 0.35, w * 0.22, h * 0.18, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(150,220,255,0.6)";
          ctx.fill();
          ctx.fillStyle = "#aaa";
          ctx.fillRect(x + w * 0.45, y, w * 0.1, 5 * scale);
          break;
        }
        case 1 /* FUEL_TANK_S */:
        case 2 /* FUEL_TANK_L */: {
          const frac = part.def.maxFuelMass > 0 ? part.fuelRemaining / part.def.maxFuelMass : 0;
          const barH = (h - 8 * scale) * frac;
          ctx.fillStyle = frac > 0.3 ? "rgba(0,200,100,0.35)" : "rgba(255,80,0,0.45)";
          ctx.fillRect(x + w * 0.2, y + (h - 4 * scale) - barH, w * 0.6, barH);
          break;
        }
        case 3 /* ENGINE */: {
          const nozzleW = w * 1.1;
          ctx.beginPath();
          ctx.moveTo(x + (w - nozzleW) / 2, y + h * 0.7);
          ctx.lineTo(x + (w + nozzleW) / 2, y + h * 0.7);
          ctx.lineTo(x + w * 0.7, y + h);
          ctx.lineTo(x + w * 0.3, y + h);
          ctx.closePath();
          ctx.fillStyle = "#5a4030";
          ctx.fill();
          break;
        }
        case 4 /* ENGINE_VACUUM */: {
          const bellW = w * 1.55;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.3, y + h * 0.55);
          ctx.lineTo(x + w * 0.7, y + h * 0.55);
          ctx.bezierCurveTo(
            x + w * 0.75,
            y + h * 0.75,
            x + (w + bellW) / 2,
            y + h * 0.88,
            x + (w + bellW) / 2,
            y + h
          );
          ctx.lineTo(x + (w - bellW) / 2, y + h);
          ctx.bezierCurveTo(
            x + (w - bellW) / 2,
            y + h * 0.88,
            x + w * 0.25,
            y + h * 0.75,
            x + w * 0.3,
            y + h * 0.55
          );
          ctx.fillStyle = "#2a4a6a";
          ctx.fill();
          ctx.strokeStyle = "rgba(100,160,220,0.4)";
          ctx.lineWidth = 1 * scale;
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(x + w * 0.5, y + h * 0.42, w * 0.18, h * 0.12, 0, 0, Math.PI * 2);
          ctx.fillStyle = "#3a6a9a";
          ctx.fill();
          break;
        }
        case 5 /* DECOUPLER */: {
          ctx.fillStyle = "#ffcc00";
          ctx.fillRect(x, y + h * 0.3, w, h * 0.4);
          break;
        }
        case 7 /* HEAT_SHIELD */: {
          ctx.fillStyle = "rgba(255,100,0,0.25)";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#111";
          ctx.fillRect(x + 2 * scale, y + 2 * scale, w - 4 * scale, h * 0.4);
          break;
        }
        case 8 /* SRB */: {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5, y);
          ctx.lineTo(x + w * 0.12, y + h * 0.18);
          ctx.lineTo(x + w * 0.88, y + h * 0.18);
          ctx.closePath();
          ctx.fillStyle = "#6a4a3a";
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + w * 0.22, y + h * 0.88);
          ctx.lineTo(x + w * 0.78, y + h * 0.88);
          ctx.lineTo(x + w * 0.68, y + h);
          ctx.lineTo(x + w * 0.32, y + h);
          ctx.closePath();
          ctx.fillStyle = "#2a1a0a";
          ctx.fill();
          const finW = w * 0.5, finH = h * 0.28;
          ctx.beginPath();
          ctx.moveTo(x, y + h);
          ctx.lineTo(x - finW * 0.8, y + h);
          ctx.lineTo(x, y + h - finH);
          ctx.closePath();
          ctx.fillStyle = "#3a2212";
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + w, y + h);
          ctx.lineTo(x + w + finW * 0.8, y + h);
          ctx.lineTo(x + w, y + h - finH);
          ctx.closePath();
          ctx.fillStyle = "#3a2212";
          ctx.fill();
          ctx.fillStyle = "rgba(255,200,100,0.25)";
          ctx.fillRect(x + w * 0.1, y + h * 0.4, w * 0.8, h * 0.1);
          break;
        }
        case 6 /* FAIRING */: {
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y);
          ctx.lineTo(x + w * 0.05, y + h * 0.4);
          ctx.lineTo(x + w * 0.95, y + h * 0.4);
          ctx.closePath();
          ctx.fillStyle = "#2a4a6a";
          ctx.fill();
          break;
        }
        case 9 /* ENGINE_VAC_ADV */: {
          const bellW = w * 1.85;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.32, y + h * 0.5);
          ctx.lineTo(x + w * 0.68, y + h * 0.5);
          ctx.bezierCurveTo(
            x + w * 0.72,
            y + h * 0.72,
            x + (w + bellW) / 2,
            y + h * 0.9,
            x + (w + bellW) / 2,
            y + h
          );
          ctx.lineTo(x + (w - bellW) / 2, y + h);
          ctx.bezierCurveTo(
            x + (w - bellW) / 2,
            y + h * 0.9,
            x + w * 0.28,
            y + h * 0.72,
            x + w * 0.32,
            y + h * 0.5
          );
          ctx.fillStyle = "#1a3a6a";
          ctx.fill();
          ctx.strokeStyle = "rgba(80,140,255,0.5)";
          ctx.lineWidth = 1.5 * scale;
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(x + w * 0.5, y + h * 0.38, w * 0.16, h * 0.1, 0, 0, Math.PI * 2);
          ctx.fillStyle = "#4a8acc";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.38, w * 0.24, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(80,160,255,0.35)";
          ctx.lineWidth = 1 * scale;
          ctx.stroke();
          break;
        }
        case 10 /* FUEL_TANK_XL */: {
          const frac = part.def.maxFuelMass > 0 ? part.fuelRemaining / part.def.maxFuelMass : 0;
          const barH = (h - 10 * scale) * frac;
          ctx.fillStyle = frac > 0.3 ? "rgba(0,200,100,0.35)" : "rgba(255,80,0,0.45)";
          ctx.fillRect(x + w * 0.2, y + (h - 5 * scale) - barH, w * 0.6, barH);
          ctx.strokeStyle = "rgba(150,180,200,0.25)";
          ctx.lineWidth = 1 * scale;
          for (let i = 1; i <= 3; i++) {
            const ty = y + h * (i / 4);
            ctx.beginPath();
            ctx.moveTo(x + 2 * scale, ty);
            ctx.lineTo(x + w - 2 * scale, ty);
            ctx.stroke();
          }
          break;
        }
        case 11 /* COMMAND_POD_ADV */: {
          ctx.beginPath();
          ctx.ellipse(x + w * 0.5, y + h * 0.38, w * 0.28, h * 0.2, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(120,200,255,0.65)";
          ctx.fill();
          ctx.strokeStyle = "rgba(0,212,255,0.6)";
          ctx.lineWidth = 1 * scale;
          ctx.stroke();
          ctx.fillStyle = "#2a6a9a";
          ctx.fillRect(x - 3 * scale, y + h * 0.6, 5 * scale, 3 * scale);
          ctx.fillRect(x + w - 2 * scale, y + h * 0.6, 5 * scale, 3 * scale);
          ctx.fillStyle = "#88aacc";
          ctx.fillRect(x + w * 0.44, y, w * 0.12, 4 * scale);
          break;
        }
        case 12 /* HEAT_SHIELD_HEAVY */: {
          ctx.fillStyle = "rgba(200,60,0,0.18)";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#0a0a0a";
          ctx.fillRect(x + 2 * scale, y + 2 * scale, w - 4 * scale, h * 0.45);
          ctx.strokeStyle = "rgba(200,100,0,0.3)";
          ctx.lineWidth = 1 * scale;
          for (let i = 0; i < 3; i++) {
            const oy = y + h * (0.12 + i * 0.22);
            ctx.beginPath();
            ctx.moveTo(x + 2 * scale, oy + 5 * scale);
            ctx.lineTo(x + w / 2, oy);
            ctx.lineTo(x + w - 2 * scale, oy + 5 * scale);
            ctx.stroke();
          }
          break;
        }
        case 13 /* DECOUPLER_HEAVY */: {
          ctx.fillStyle = "#cc7700";
          ctx.fillRect(x, y + h * 0.25, w, h * 0.5);
          ctx.fillStyle = "#ffcc66";
          const boltCount = 5;
          for (let i = 0; i < boltCount; i++) {
            const bx = x + w * ((i + 0.5) / boltCount);
            ctx.beginPath();
            ctx.arc(bx, y + h * 0.5, 2 * scale, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 14 /* ENGINE_HEAVY */: {
          const bellW = w * 1.45;
          ctx.beginPath();
          ctx.moveTo(x + (w - bellW) / 2, y + h * 0.6);
          ctx.lineTo(x + (w - bellW) / 2 - bellW * 0.08, y + h);
          ctx.lineTo(x + (w + bellW) / 2 + bellW * 0.08, y + h);
          ctx.lineTo(x + (w + bellW) / 2, y + h * 0.6);
          ctx.closePath();
          ctx.fillStyle = "#6a1a04";
          ctx.fill();
          ctx.fillStyle = "#9a4422";
          ctx.fillRect(x + w * 0.25, y + h * 0.3, w * 0.5, h * 0.3);
          ctx.strokeStyle = "#cc5522";
          ctx.lineWidth = 2.5 * scale;
          ctx.strokeRect(x + w * 0.15, y + h * 0.55, w * 0.7, h * 0.08);
          break;
        }
        case 15 /* ENGINE_NTR */: {
          const nx = x + w * 0.5;
          ctx.beginPath();
          ctx.rect(x + w * 0.1, y + h * 0.08, w * 0.8, h * 0.52);
          ctx.fillStyle = "#0e3a1a";
          ctx.fill();
          ctx.strokeStyle = "#2a9a4a";
          ctx.lineWidth = 1.5 * scale;
          ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const sy = y + h * (0.14 + i * 0.15);
            ctx.fillStyle = i % 2 === 0 ? "rgba(0,200,80,0.25)" : "rgba(0,80,20,0.20)";
            ctx.fillRect(x + w * 0.1, sy, w * 0.8, h * 0.12);
          }
          const nozzW = w * 0.55;
          ctx.beginPath();
          ctx.moveTo(nx - nozzW * 0.3, y + h * 0.6);
          ctx.lineTo(nx - nozzW * 0.5, y + h);
          ctx.lineTo(nx + nozzW * 0.5, y + h);
          ctx.lineTo(nx + nozzW * 0.3, y + h * 0.6);
          ctx.closePath();
          ctx.fillStyle = "#1a5a2a";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(nx, y + h * 0.28, 4 * scale, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,255,100,0.70)";
          ctx.fill();
          break;
        }
        case 16 /* FUEL_TANK_XXL */: {
          const frac = part.def.maxFuelMass > 0 ? part.fuelRemaining / part.def.maxFuelMass : 0;
          const barH = (h - 8 * scale) * frac;
          ctx.fillStyle = frac > 0.3 ? "rgba(0,180,90,0.30)" : "rgba(255,60,0,0.42)";
          ctx.fillRect(x + w * 0.2, y + (h - 4 * scale) - barH, w * 0.6, barH);
          ctx.strokeStyle = "rgba(150,180,200,0.35)";
          ctx.lineWidth = scale;
          for (let t = 1; t <= 3; t++) {
            const ty = y + h * 0.05 + h * 0.9 * (1 - t * 0.25);
            ctx.beginPath();
            ctx.moveTo(x + w * 0.2, ty);
            ctx.lineTo(x + w * 0.35, ty);
            ctx.stroke();
          }
          ctx.fillStyle = "rgba(30,50,70,0.50)";
          ctx.fillRect(x, y + h * 0.495, w, h * 0.01);
          break;
        }
      }
    }
    // ─── Exhaust Plume ────────────────────────────────────────────────────────
    /** Draw a single exhaust plume centred at (cx, plumeY) pointing down in local space */
    _drawOnePlume(cx, plumeY, scale, throttle, small = false) {
      const ctx = this.ctx;
      const lenMult = small ? 0.6 : 1;
      const plumeLen = (80 + throttle * 120) * scale * lenMult;
      const plumeW = (small ? 14 : 22) * scale + throttle * (small ? 10 : 18) * scale;
      const grad = ctx.createLinearGradient(cx, plumeY, cx, plumeY + plumeLen);
      grad.addColorStop(0, THEME.exhaustCore);
      grad.addColorStop(0.08, THEME.exhaustMid);
      grad.addColorStop(0.4, THEME.engineFire);
      grad.addColorStop(1, THEME.exhaustEdge);
      ctx.beginPath();
      ctx.moveTo(cx, plumeY);
      ctx.bezierCurveTo(
        cx + plumeW / 2,
        plumeY + plumeLen * 0.3,
        cx + plumeW * 0.7,
        plumeY + plumeLen * 0.6,
        cx,
        plumeY + plumeLen
      );
      ctx.bezierCurveTo(
        cx - plumeW * 0.7,
        plumeY + plumeLen * 0.6,
        cx - plumeW / 2,
        plumeY + plumeLen * 0.3,
        cx,
        plumeY
      );
      ctx.fillStyle = grad;
      ctx.fill();
      const coreLen = plumeLen * 0.25;
      const coreGrad = ctx.createLinearGradient(cx, plumeY, cx, plumeY + coreLen);
      coreGrad.addColorStop(0, "rgba(255,255,255,0.9)");
      coreGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.ellipse(cx, plumeY + coreLen / 2, plumeW * 0.18, coreLen / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    }
    _drawExhaustPlume(rocket, scale, throttle, totalH) {
      const ctx = this.ctx;
      const stackBottom = totalH / 2;
      const mainHW = _Renderer.STACK_HALF_W * scale;
      const radGap = _Renderer.RADIAL_GAP * scale;
      const flicker = 1 + Math.sin(this.time * 40) * 0.05 + Math.cos(this.time * 67) * 0.03;
      ctx.save();
      ctx.scale(flicker, 1);
      const hasCentreThrust = rocket.parts.some((p) => p.isThrusting && !p.def.radialMount);
      if (hasCentreThrust) {
        this._drawOnePlume(0, stackBottom, scale, throttle, false);
      }
      let yBot = totalH / 2;
      for (const part of rocket.parts) {
        const h = part.def.renderH * scale;
        if (part.def.radialMount && part.isThrusting) {
          const srbHW = part.def.renderW * scale / 2;
          const sideX = mainHW + radGap + srbHW;
          this._drawOnePlume(-sideX, yBot, scale, 1, true);
          this._drawOnePlume(sideX, yBot, scale, 1, true);
        }
        if (!part.def.radialMount)
          yBot -= h;
      }
      ctx.restore();
    }
    // ─── Per-part Temperature Glow ───────────────────────────────────────────
    _drawPartHeatGlow(ctx, x, y, w, h, temp, _scale) {
      if (temp < 450)
        return;
      const t = Math.min((temp - 450) / 1550, 1);
      let r, g, b, a;
      if (t < 0.33) {
        const u = t / 0.33;
        r = 255;
        g = Math.round(120 - u * 80);
        b = 0;
        a = 0.18 + u * 0.18;
      } else if (t < 0.66) {
        const u = (t - 0.33) / 0.33;
        r = 255;
        g = Math.round(40 - u * 40);
        b = Math.round(u * 60);
        a = 0.36 + u * 0.18;
      } else {
        const u = (t - 0.66) / 0.34;
        r = 255;
        g = Math.round(u * 180);
        b = Math.round(60 + u * 195);
        a = 0.54 + u * 0.3;
      }
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
      this._roundRect(x, y, w, h, 2);
      ctx.fill();
      ctx.restore();
    }
    static {
      // ─── Ascent Aerodynamic Compression ─────────────────────────────────────
      /** Dynamic pressure thresholds (Pa) governing ascent visual tiers */
      this.Q_STREAK_START = 5e3;
    }
    static {
      // subtle haze begins
      this.Q_STREAK_FULL = 25e3;
    }
    static {
      // full white/blue streaks
      this.Q_ORANGE_START = 45e3;
    }
    static {
      // orange tint + Max-Q warning
      this.Q_EXTREME = 8e4;
    }
    // extreme orange sparks
    /**
     * Draw ascent-phase aerodynamic compression effects in local rocket space.
     * Effect tiers:
     *   5–25 kPa  : faint blue/white compression haze + thin streaks
     *  25–45 kPa  : stronger streaks + edge lines
     *  45–80 kPa  : haze turns orange, streaks turn orange, sparks appear
     */
    _drawAscentAero(_rocket, scale, frame, totalH, maxW) {
      const q = frame.dynamicPressure;
      if (q < _Renderer.Q_STREAK_START)
        return;
      const noseExp = frame.noseExposure;
      const exposure = Math.abs(noseExp);
      if (exposure < 0.05)
        return;
      const ctx = this.ctx;
      const t = this.time;
      const halfH = totalH / 2;
      const noseIsWindward = noseExp < 0;
      const windwardY = noseIsWindward ? -halfH : halfH;
      const streamSgn = noseIsWindward ? 1 : -1;
      const qFrac = Math.min((q - _Renderer.Q_STREAK_START) / (_Renderer.Q_EXTREME - _Renderer.Q_STREAK_START), 1);
      const qOrange = Math.max(0, (q - _Renderer.Q_ORANGE_START) / (_Renderer.Q_EXTREME - _Renderer.Q_ORANGE_START));
      const frand = (seed) => {
        let s = (seed ^ 4027435774) >>> 0;
        s = Math.imul(s ^ s >>> 16, 73244475) >>> 0;
        return ((s ^ s >>> 16) >>> 0) / 4294967295;
      };
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      {
        const hazeR = maxW * (0.45 + qFrac * 0.95);
        const hazeOY = windwardY - streamSgn * hazeR * 0.3;
        const hazeA = qFrac * 0.17 * exposure;
        const haze = ctx.createRadialGradient(0, hazeOY, 0, 0, windwardY, hazeR);
        if (qOrange <= 0) {
          haze.addColorStop(0, `rgba(195,228,255,${(hazeA * 1.25).toFixed(2)})`);
          haze.addColorStop(0.45, `rgba(110,175,255,${(hazeA * 0.5).toFixed(2)})`);
          haze.addColorStop(1, "rgba(55,115,255,0)");
        } else {
          const ob = Math.min(qOrange, 1);
          const g = Math.round(228 - ob * 150);
          haze.addColorStop(0, `rgba(255,${g},${Math.round(255 * (1 - ob))},${(hazeA * 1.35).toFixed(2)})`);
          haze.addColorStop(0.4, `rgba(255,${Math.round(g * 0.45)},0,${(hazeA * 0.45).toFixed(2)})`);
          haze.addColorStop(1, "rgba(200,30,0,0)");
        }
        ctx.beginPath();
        ctx.ellipse(0, windwardY, hazeR * 0.5, hazeR, 0, 0, Math.PI * 2);
        ctx.fillStyle = haze;
        ctx.fill();
      }
      {
        const numStreaks = Math.floor(2 + qFrac * 11);
        const streakLen = totalH * (0.22 + qFrac * 0.62);
        const halfSpread = maxW * 0.56;
        for (let i = 0; i < numStreaks; i++) {
          const sp = 1.7 + frand(i * 11) * 2.6;
          const phase = (t * sp + frand(i * 7 + 1)) % 1;
          if (phase > 0.85)
            continue;
          const alpha = qFrac * exposure * (0.48 - phase * 0.55);
          if (alpha < 0.015)
            continue;
          const xOff = (frand(i * 19 + 2) - 0.5) * halfSpread * 2;
          const xEnd = xOff * (0.22 + frand(i * 29 + 3) * 0.44);
          const startY = windwardY + streamSgn * phase * streakLen * 0.06;
          const endY = windwardY + streamSgn * phase * streakLen;
          let stroke;
          if (qOrange <= 0) {
            stroke = `hsla(${200 + frand(i) * 22},68%,88%,${alpha.toFixed(2)})`;
          } else {
            const hue = Math.round(200 - Math.min(qOrange, 1) * 172);
            stroke = `hsla(${hue},90%,80%,${alpha.toFixed(2)})`;
          }
          ctx.beginPath();
          ctx.moveTo(xOff, startY);
          ctx.quadraticCurveTo(xOff * 0.52, (startY + endY) * 0.5, xEnd, endY);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = (0.4 + frand(i * 37) * 0.9) * scale;
          ctx.stroke();
        }
      }
      if (qFrac > 0.15) {
        const edgeA = (qFrac - 0.15) / 0.85 * 0.32 * exposure;
        const bodyHW = maxW * 0.5;
        for (const side of [-1, 1]) {
          const ex = side * bodyHW;
          const gStart = windwardY;
          const gEnd = windwardY + streamSgn * halfH * 1.6;
          const eGrad = ctx.createLinearGradient(0, gStart, 0, gEnd);
          if (qOrange <= 0) {
            eGrad.addColorStop(0, `rgba(180,218,255,${edgeA.toFixed(2)})`);
            eGrad.addColorStop(0.55, `rgba(110,170,255,${(edgeA * 0.38).toFixed(2)})`);
            eGrad.addColorStop(1, "rgba(60,110,255,0)");
          } else {
            const ob = Math.min(qOrange, 1);
            eGrad.addColorStop(0, `rgba(255,${Math.round(200 - ob * 155)},55,${edgeA.toFixed(2)})`);
            eGrad.addColorStop(0.5, `rgba(255,70,0,${(edgeA * 0.32).toFixed(2)})`);
            eGrad.addColorStop(1, "rgba(220,30,0,0)");
          }
          ctx.beginPath();
          ctx.moveTo(ex, -halfH);
          ctx.lineTo(ex, halfH);
          ctx.strokeStyle = eGrad;
          ctx.lineWidth = (0.7 + qFrac * 1.3) * scale;
          ctx.stroke();
        }
      }
      if (qOrange > 0) {
        const sparkCount = Math.floor(qOrange * 5);
        for (let i = 0; i < sparkCount; i++) {
          const sp = 3 + frand(i * 41) * 4;
          const phase = (t * sp + frand(i * 53)) % 1;
          if (phase > 0.46)
            continue;
          const sx = (frand(i * 61 + 7) - 0.5) * maxW * 0.72;
          const sy = windwardY + streamSgn * phase * maxW * 1.05;
          const sr = (0.65 + frand(i * 71) * 1.9) * scale;
          const sa = Math.min((0.46 - phase) * 2.2 * qOrange, 0.92);
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,${Math.round(90 + frand(i * 83) * 90)},0,${sa.toFixed(2)})`;
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }
    // ─── Directional Aerodynamic Heating ─────────────────────────────────────
    /**
     * Draw windward-side heating effect in local rocket space (after ctx.translate+rotate).
     * noseExposure < 0 → nose (local y = -halfH) is windward.
     * noseExposure > 0 → tail (local y = +halfH) is windward.
     */
    _drawAeroHeating(_rocket, scale, frame, totalH, maxW) {
      const ctx = this.ctx;
      const t = this.time;
      const intensity = Math.min(frame.heatFlux / MAX_HEAT_FLUX, 1);
      const exposure = Math.abs(frame.noseExposure);
      if (intensity < 0.01 || exposure < 0.05)
        return;
      const halfH = totalH / 2;
      const noseIsWindward = frame.noseExposure < 0;
      const windwardY = noseIsWindward ? -halfH : halfH;
      const streamSgn = noseIsWindward ? 1 : -1;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const glowRadius = maxW * (0.8 + intensity * 1.4);
      const glowOffY = windwardY - streamSgn * glowRadius * 0.35;
      const shock = ctx.createRadialGradient(0, glowOffY, 0, 0, windwardY, glowRadius);
      if (intensity < 0.35) {
        const a = intensity * 2.5;
        shock.addColorStop(0, `rgba(255,200,60,${(a * 0.9).toFixed(2)})`);
        shock.addColorStop(0.45, `rgba(255,80,0,${(a * 0.5).toFixed(2)})`);
        shock.addColorStop(1, "rgba(255,40,0,0)");
      } else if (intensity < 0.65) {
        const a = 0.7 + (intensity - 0.35) * 0.6;
        shock.addColorStop(0, `rgba(255,120,60,${a.toFixed(2)})`);
        shock.addColorStop(0.35, `rgba(255,20,80,${(a * 0.65).toFixed(2)})`);
        shock.addColorStop(1, "rgba(200,0,120,0)");
      } else {
        const a = 0.88;
        shock.addColorStop(0, `rgba(255,240,255,${a.toFixed(2)})`);
        shock.addColorStop(0.25, `rgba(200,40,255,${(a * 0.75).toFixed(2)})`);
        shock.addColorStop(0.7, `rgba(80,0,200,${(a * 0.3).toFixed(2)})`);
        shock.addColorStop(1, "rgba(40,0,100,0)");
      }
      ctx.beginPath();
      ctx.ellipse(0, windwardY, glowRadius * 0.65, glowRadius, 0, 0, Math.PI * 2);
      ctx.fillStyle = shock;
      ctx.fill();
      const numStreaks = Math.floor(5 + intensity * 12);
      const streakLen = totalH * (0.4 + intensity * 1.2);
      const halfSpread = maxW * 0.55;
      const frand = (seed) => {
        let s = (seed ^ 3735928559) >>> 0;
        s = Math.imul(s ^ s >>> 16, 73244475) >>> 0;
        return ((s ^ s >>> 16) >>> 0) / 4294967295;
      };
      for (let i = 0; i < numStreaks; i++) {
        const speed = 1.5 + frand(i * 7) * 2.5;
        const phase = (t * speed + frand(i * 13)) % 1;
        if (phase > 0.82)
          continue;
        const alpha = intensity * exposure * (0.7 - phase * 0.85);
        if (alpha < 0.02)
          continue;
        const xOff = (frand(i * 17 + 1) - 0.5) * halfSpread * 2;
        const xEnd = xOff * (0.3 + frand(i * 23) * 0.5);
        const startY = windwardY + streamSgn * phase * streakLen * 0.08;
        const endY = windwardY + streamSgn * phase * streakLen;
        const hue = intensity < 0.35 ? 25 + frand(i) * 15 : intensity < 0.65 ? 355 + frand(i) * 20 : 285 + frand(i) * 40;
        const sat = intensity < 0.65 ? 100 : 80 + frand(i * 3) * 20;
        ctx.beginPath();
        ctx.moveTo(xOff, startY);
        ctx.quadraticCurveTo(xOff * 0.6, (startY + endY) / 2, xEnd, endY);
        ctx.strokeStyle = `hsla(${hue},${sat}%,72%,${alpha.toFixed(2)})`;
        ctx.lineWidth = (0.8 + frand(i * 31) * 1.4) * scale;
        ctx.stroke();
      }
      if (intensity > 0.2) {
        const coreR = maxW * 0.18 * intensity;
        const pulse = 0.85 + Math.sin(t * 18) * 0.15;
        const coreA = intensity * exposure * 0.9 * pulse;
        const coreGrad = ctx.createRadialGradient(0, windwardY, 0, 0, windwardY, coreR);
        coreGrad.addColorStop(0, `rgba(255,255,255,${coreA.toFixed(2)})`);
        coreGrad.addColorStop(0.5, intensity > 0.6 ? `rgba(220,120,255,${(coreA * 0.6).toFixed(2)})` : `rgba(255,160,60,${(coreA * 0.6).toFixed(2)})`);
        coreGrad.addColorStop(1, "rgba(255,0,0,0)");
        ctx.beginPath();
        ctx.arc(0, windwardY, coreR, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }
    static {
      // ─── VAB Preview ──────────────────────────────────────────────────────────
      /** Stage badge colors — index = stage number */
      this.STAGE_COLORS = ["#44cc66", "#ccaa22", "#cc6622", "#cc2222", "#8833cc"];
    }
    /**
     * Draw the rocket stack in the VAB build area, sitting on the launchpad.
     * @param cx              Centre-X of the build area in screen pixels
     * @param bottomY         Y coordinate of the launchpad line in screen pixels
     * @param showStageBadges Whether to draw stage number badges on engines/decouplers/SRBs
     * @returns               Screen bounds for each rendered part
     */
    renderVABRocket(rocket, cx, bottomY, showStageBadges = false) {
      const ctx = this.ctx;
      if (rocket.parts.length === 0)
        return [];
      const available = bottomY - 40;
      const naturalH = rocket.parts.reduce((s, p) => p.def.radialMount ? s : s + p.def.renderH, 0);
      const scale = naturalH > 0 ? Math.min(1.8, available / naturalH) : 1.8;
      const bounds = [];
      const mainHW = _Renderer.STACK_HALF_W * scale;
      const radGap = _Renderer.RADIAL_GAP * scale;
      ctx.save();
      let yBottom = bottomY;
      for (const part of rocket.parts) {
        const w = part.def.renderW * scale;
        const h = part.def.renderH * scale;
        const y = yBottom - h;
        if (part.def.radialMount) {
          const sideOffset = mainHW + radGap + w / 2;
          for (const side of [-1, 1]) {
            const bx = cx + side * sideOffset - w / 2;
            bounds.push({ id: part.id, x: bx, y, w, h });
            ctx.fillStyle = part.def.color;
            this._roundRect(bx, y, w, h, 4);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.lineWidth = 1;
            this._roundRect(bx, y, w, h, 4);
            ctx.stroke();
            this._drawPartDecoration(part.def.type, bx, y, w, h, scale, part);
          }
          ctx.strokeStyle = "rgba(160,170,180,0.5)";
          ctx.lineWidth = Math.max(1, 1.5 * scale);
          for (const strutFrac of [0.28, 0.7]) {
            const sy = y + h * strutFrac;
            for (const side of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(cx + side * mainHW, sy);
              ctx.lineTo(cx + side * (mainHW + radGap + w), sy);
              ctx.stroke();
            }
          }
          if (showStageBadges) {
            const si = part.stageIndex;
            const bCol = si >= 0 && si < _Renderer.STAGE_COLORS.length ? _Renderer.STAGE_COLORS[si] : "#444";
            const bLbl = si >= 0 ? `S${si}` : "\u2013";
            const rbx = cx + (mainHW + radGap + w / 2) - w / 2 + w - 1;
            const bby = y + 10;
            ctx.beginPath();
            ctx.arc(rbx, bby, 10, 0, Math.PI * 2);
            ctx.fillStyle = bCol;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = si >= 0 ? "#000" : "#aaa";
            ctx.font = "bold 8px Courier New";
            ctx.textAlign = "center";
            ctx.fillText(bLbl, rbx, bby + 3);
          }
        } else {
          const x = cx - w / 2;
          bounds.push({ id: part.id, x, y, w, h });
          ctx.fillStyle = part.def.color;
          this._roundRect(x, y, w, h, 4);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 1;
          this._roundRect(x, y, w, h, 4);
          ctx.stroke();
          this._drawPartDecoration(part.def.type, x, y, w, h, scale, part);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.font = "9px Courier New";
          ctx.textAlign = "center";
          ctx.fillText(part.def.name.slice(0, 14), cx, y + h * 0.55);
          if (showStageBadges && (isEnginePart(part.def.type) || isDecouplerPart(part.def.type))) {
            const si = part.stageIndex;
            const bCol = si >= 0 && si < _Renderer.STAGE_COLORS.length ? _Renderer.STAGE_COLORS[si] : "#444";
            const bLbl = si >= 0 ? `S${si}` : "\u2013";
            const bx2 = x + w - 1;
            const by2 = y + 10;
            ctx.beginPath();
            ctx.arc(bx2, by2, 10, 0, Math.PI * 2);
            ctx.fillStyle = bCol;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = si >= 0 ? "#000" : "#aaa";
            ctx.font = "bold 8px Courier New";
            ctx.textAlign = "center";
            ctx.fillText(bLbl, bx2, by2 + 3);
          }
        }
        if (!part.def.radialMount)
          yBottom -= h;
      }
      const topY = yBottom;
      ctx.beginPath();
      ctx.arc(cx, topY, 5, 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, topY, 9, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,212,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return bounds;
    }
    // ─── VAB Ghost (dragged part) ─────────────────────────────────────────────
    /**
     * Draw a semi-transparent ghost of a part centred at (cx, cy).
     * Radial parts (SRBs) are shown as a pair.
     */
    renderVABGhost(type, cx, cy) {
      const ctx = this.ctx;
      const def = PART_CATALOGUE[type];
      const scale = 1.5;
      const w = def.renderW * scale;
      const h = def.renderH * scale;
      const fake = {
        def,
        fuelRemaining: def.maxFuelMass,
        isActive: false,
        stageIndex: -1,
        slotIndex: 0,
        id: "__ghost__"
      };
      const drawOne = (bx, by) => {
        ctx.fillStyle = def.color;
        this._roundRect(bx, by, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 2;
        this._roundRect(bx, by, w, h, 4);
        ctx.stroke();
        this._drawPartDecoration(type, bx, by, w, h, scale, fake);
      };
      ctx.save();
      ctx.globalAlpha = 0.52;
      if (def.radialMount) {
        const mainHW = _Renderer.STACK_HALF_W * scale;
        const radGap = _Renderer.RADIAL_GAP * scale;
        const sideOffset = mainHW + radGap + w / 2;
        for (const side of [-1, 1]) {
          drawOne(cx + side * sideOffset - w / 2, cy - h / 2);
        }
      } else {
        drawOne(cx - w / 2, cy - h / 2);
      }
      ctx.restore();
    }
    // ─── HUD ──────────────────────────────────────────────────────────────────
    /**
     * Draw the in-flight HUD overlay (screen-space, no transform needed).
     */
    renderHUD(rocket, frame, throttle, currentStage, missionTime, warpFactor = 1) {
      const ctx = this.ctx;
      const { W, H } = this;
      const panelX = 16, panelY = 16, panelW = 220, panelH = 202;
      this._drawPanel(panelX, panelY, panelW, panelH);
      ctx.fillStyle = THEME.textDim;
      ctx.font = "11px Courier New";
      ctx.textAlign = "left";
      const altDisplay = frame.inMoonSOI ? frame.altAboveNearest : frame.altitude;
      const altLabel = frame.inMoonSOI ? "ALT \u263D" : "ALT";
      const altStr = altDisplay < 1e3 ? `${altDisplay.toFixed(0)} m` : altDisplay < 1e6 ? `${(altDisplay / 1e3).toFixed(2)} km` : `${(altDisplay / 1e6).toFixed(4)} Mm`;
      const bodyLabel = frame.inMoonSOI ? "MOON" : frame.atmoLayerName;
      const rows = [
        [altLabel, altStr],
        ["SPD", `${frame.speed.toFixed(1)} m/s`],
        ["VERT", `${frame.verticalSpeed > 0 ? "+" : ""}${frame.verticalSpeed.toFixed(1)} m/s`],
        ["MACH", frame.inMoonSOI ? "\u2014" : `${frame.mach.toFixed(2)}`],
        ["Q", frame.inMoonSOI ? "0.00 kPa" : `${(frame.dynamicPressure / 1e3).toFixed(2)} kPa`],
        ["\u0394V", `${rocket.getDeltaV().toFixed(0)} m/s`],
        ["T+", this._formatTime(missionTime)],
        ["BODY", bodyLabel]
      ];
      rows.forEach(([label, value], i) => {
        const ry = panelY + 22 + i * 22;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(label, panelX + 10, ry);
        if (label === "Q") {
          ctx.fillStyle = frame.dynamicPressure > _Renderer.Q_ORANGE_START ? THEME.danger : frame.dynamicPressure > _Renderer.Q_STREAK_FULL ? THEME.warning : THEME.text;
        } else {
          ctx.fillStyle = THEME.text;
        }
        ctx.fillText(value, panelX + 60, ry);
      });
      const fuelX = W - 200, fuelY = 16, fuelW = 184, fuelH = 100;
      this._drawPanel(fuelX, fuelY, fuelW, fuelH);
      ctx.fillStyle = THEME.textDim;
      ctx.font = "11px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("FUEL", fuelX + 10, fuelY + 20);
      const tanks = rocket.parts.filter((p) => p.def.maxFuelMass > 0);
      tanks.forEach((tank, i) => {
        const by = fuelY + 35 + i * 18;
        const bw = fuelW - 60;
        const frac = tank.fuelRemaining / tank.def.maxFuelMass;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(fuelX + 10, by, bw, 10);
        const col = frac > 0.5 ? THEME.success : frac > 0.2 ? THEME.warning : THEME.danger;
        ctx.fillStyle = col;
        ctx.fillRect(fuelX + 10, by, bw * frac, 10);
        ctx.fillStyle = THEME.textDim;
        ctx.font = "9px Courier New";
        ctx.fillText(`${(frac * 100).toFixed(0)}%`, fuelX + bw + 14, by + 9);
      });
      const stageW = 240, stageH = 44;
      const stageX = (W - stageW) / 2, stageY = H - stageH - 16;
      this._drawPanel(stageX, stageY, stageW, stageH);
      ctx.textAlign = "center";
      ctx.fillStyle = THEME.textDim;
      ctx.font = "10px Courier New";
      ctx.fillText("STAGE [SPACE]", W / 2, stageY + 14);
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 16px Courier New";
      const totalStages = rocket.stages.length;
      ctx.fillText(
        totalStages > 0 ? `${currentStage + 1} / ${totalStages}` : "\u2014",
        W / 2,
        stageY + 34
      );
      const thrX = W - 60, thrY = H - 160;
      ctx.fillStyle = THEME.textDim;
      ctx.font = "10px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("THR", thrX, thrY - 8);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(thrX - 12, thrY, 24, 120);
      const thrCol = throttle > 0.7 ? THEME.danger : throttle > 0.3 ? THEME.warning : THEME.success;
      ctx.fillStyle = thrCol;
      ctx.fillRect(thrX - 12, thrY + 120 * (1 - throttle), 24, 120 * throttle);
      ctx.fillStyle = THEME.text;
      ctx.fillText(`${Math.round(throttle * 100)}%`, thrX, thrY + 134);
      if (frame.dynamicPressure > _Renderer.Q_ORANGE_START) {
        const qFrac = Math.min((frame.dynamicPressure - _Renderer.Q_ORANGE_START) / 4e4, 1);
        const pulse = 0.7 + Math.sin(this.time * 9) * 0.3;
        const qAlpha = qFrac * pulse * 0.88;
        ctx.fillStyle = `rgba(80,120,255,${(qFrac * 0.1).toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(255,${Math.round(190 - qFrac * 90)},0,${qAlpha.toFixed(2)})`;
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("MAX-Q", W / 2, H / 2 + 8);
      }
      const heatIntensity = Math.min(frame.heatFlux / MAX_HEAT_FLUX, 1);
      if (heatIntensity > 0.08) {
        ctx.fillStyle = `rgba(255,60,0,${(heatIntensity * 0.22).toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(255,140,0,${Math.min(heatIntensity * 1.2, 1).toFixed(2)})`;
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        const noShield = heatIntensity > 0.55;
        ctx.fillText(
          noShield ? "\u26A0 CRITICAL HEATING \u26A0" : "\u26A0 HEATING",
          W / 2,
          H / 2 - 20
        );
      }
      const warpPanelW = 160, warpPanelH = 44;
      const warpPanelX = 16, warpPanelY = H - warpPanelH - 16;
      this._drawPanel(warpPanelX, warpPanelY, warpPanelW, warpPanelH);
      const btnW = 28, btnH = 28;
      const btnY = warpPanelY + (warpPanelH - btnH) / 2;
      this.warpDownBtn = { x: warpPanelX + 6, y: btnY, w: btnW, h: btnH };
      this.warpUpBtn = { x: warpPanelX + warpPanelW - 6 - btnW, y: btnY, w: btnW, h: btnH };
      const atMin = warpFactor === 1;
      ctx.fillStyle = atMin ? "rgba(255,255,255,0.08)" : THEME.accentDim;
      this._roundRect(this.warpDownBtn.x, this.warpDownBtn.y, btnW, btnH, 4);
      ctx.fill();
      ctx.fillStyle = atMin ? THEME.textDim : THEME.accent;
      ctx.font = "bold 14px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("\u25C0", this.warpDownBtn.x + btnW / 2, this.warpDownBtn.y + 19);
      const atMax = warpFactor === 1e4;
      ctx.fillStyle = atMax ? "rgba(255,255,255,0.08)" : THEME.accentDim;
      this._roundRect(this.warpUpBtn.x, this.warpUpBtn.y, btnW, btnH, 4);
      ctx.fill();
      ctx.fillStyle = atMax ? THEME.textDim : THEME.accent;
      ctx.fillText("\u25B6", this.warpUpBtn.x + btnW / 2, this.warpUpBtn.y + 19);
      ctx.fillStyle = warpFactor > 1 ? THEME.warning : THEME.textDim;
      ctx.font = warpFactor > 1 ? "bold 14px Courier New" : "12px Courier New";
      ctx.fillText(`\xD7${warpFactor}`, warpPanelX + warpPanelW / 2, warpPanelY + 20);
      ctx.fillStyle = THEME.textDim;
      ctx.font = "9px Courier New";
      ctx.fillText("WARP [,  .]", warpPanelX + warpPanelW / 2, warpPanelY + 35);
      if (missionTime < 10) {
        const alpha = Math.max(0, 1 - missionTime / 8);
        ctx.fillStyle = `rgba(100,160,200,${alpha})`;
        ctx.font = "11px Courier New";
        ctx.textAlign = "right";
        const hints = ["Shift/Ctrl \u2014 Throttle", "Z \u2014 Full  X \u2014 Cut", "A/D \u2014 Rotate", "SPACE \u2014 Stage", "M \u2014 Map", ". / , \u2014 Warp"];
        hints.forEach((h, i) => ctx.fillText(h, W - 20, H - 20 - i * 16));
      }
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────
    /** Convert a world-space position to screen-space pixels */
    _worldToScreen(worldPos, cam) {
      return {
        x: this.W / 2 + (worldPos.x - cam.focus.x) / cam.metersPerPixel,
        // Note: world +Y is up, canvas +Y is down → negate
        y: this.H / 2 - (worldPos.y - cam.focus.y) / cam.metersPerPixel
      };
    }
    /** Draw a dark panel with cyan border */
    _drawPanel(x, y, w, h) {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(10,15,25,0.82)";
      this._roundRect(x, y, w, h, 6);
      ctx.fill();
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      this._roundRect(x, y, w, h, 6);
      ctx.stroke();
    }
    /** Path a rounded rectangle (does not fill/stroke — caller does) */
    _roundRect(x, y, w, h, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
    _formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor(seconds % 3600 / 60);
      const s = Math.floor(seconds % 60);
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    // ─── Burn Guidance (flight HUD overlay when a maneuver node exists) ───────
    /**
     * Render a burn guidance panel when there is an active maneuver node.
     * Shows: time to node, total ΔV, heading alignment indicator.
     */
    renderBurnGuidance(rocket, node, missionTime, dvRemaining = null) {
      if (!node || node.executed)
        return;
      const totalDV = Math.hypot(node.progradeDV, node.normalDV);
      if (totalDV < 0.5)
        return;
      const ctx = this.ctx;
      const { W, H } = this;
      const timeToNode = node.time - missionTime;
      const isExecuting = timeToNode <= 0;
      const vel = rocket.body.vel;
      const pos = rocket.body.pos;
      const speed = Math.hypot(vel.x, vel.y);
      const prograde = speed > 1 ? { x: vel.x / speed, y: vel.y / speed } : { x: 0, y: 1 };
      const posLen = Math.hypot(pos.x, pos.y);
      const radialOut = posLen > 0 ? { x: pos.x / posLen, y: pos.y / posLen } : { x: 0, y: 1 };
      const burnX = node.progradeDV * prograde.x + node.normalDV * radialOut.x;
      const burnY = node.progradeDV * prograde.y + node.normalDV * radialOut.y;
      const burnLen = Math.hypot(burnX, burnY);
      const burnDir = burnLen > 0 ? { x: burnX / burnLen, y: burnY / burnLen } : prograde;
      const desiredAngle = Math.atan2(burnDir.x, burnDir.y);
      const currentAngle = rocket.body.angle;
      let angleDiff = desiredAngle - currentAngle;
      while (angleDiff > Math.PI)
        angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI)
        angleDiff += 2 * Math.PI;
      const aligned = Math.abs(angleDiff) < 0.05;
      const pw = 260, ph = isExecuting ? 130 : 116;
      const px = (W - pw) / 2;
      const py = H / 2 - ph - 20;
      this._drawPanel(px, py, pw, ph);
      const leftX = px + 12;
      if (isExecuting) {
        const almostDone = dvRemaining !== null && dvRemaining < 30;
        ctx.fillStyle = almostDone ? THEME.danger : "#ff8800";
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("\u25CF EXECUTING BURN", W / 2, py + 17);
        ctx.fillStyle = THEME.textDim;
        ctx.font = "10px Courier New";
        ctx.textAlign = "left";
        ctx.fillText("\u0394V rem", leftX, py + 38);
        ctx.fillStyle = almostDone ? THEME.danger : THEME.accent;
        ctx.font = "bold 15px Courier New";
        ctx.fillText(
          dvRemaining !== null ? `${dvRemaining.toFixed(0)} m/s` : "--- m/s",
          leftX + 52,
          py + 38
        );
        ctx.fillStyle = THEME.textDim;
        ctx.font = "10px Courier New";
        ctx.fillText(`of ${totalDV.toFixed(0)} m/s`, leftX + 52, py + 54);
        if (dvRemaining !== null) {
          const progress = Math.min(1, 1 - dvRemaining / totalDV);
          const bx = leftX, by = py + 62, bw = pw - 24 - 104, bh = 8;
          ctx.fillStyle = "rgba(40,40,40,0.8)";
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = almostDone ? THEME.danger : "#ff8800";
          ctx.fillRect(bx, by, bw * progress, bh);
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by, bw, bh);
        }
        if (almostDone) {
          ctx.fillStyle = THEME.danger;
          ctx.font = "bold 11px Courier New";
          ctx.textAlign = "left";
          ctx.fillText("\u25BC CUT ENGINES", leftX, py + 82);
        } else {
          const errDeg = (angleDiff * 180 / Math.PI).toFixed(1);
          const alignStr = aligned ? "\u2713 ALIGNED" : `HDG ${Number(errDeg) > 0 ? "+" : ""}${errDeg}\xB0`;
          ctx.fillStyle = aligned ? THEME.success : THEME.warning;
          ctx.font = "bold 10px Courier New";
          ctx.textAlign = "left";
          ctx.fillText(alignStr, leftX, py + 82);
        }
      } else {
        ctx.fillStyle = timeToNode < 30 ? THEME.danger : THEME.warning;
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("\u25B6 MANEUVER NODE", W / 2, py + 17);
        const rows = [
          ["\u0394V", `${totalDV.toFixed(0)} m/s`, THEME.accent],
          [
            "T\u2212",
            timeToNode <= 0 ? "BURN NOW" : this._fmtNodeTime(timeToNode),
            timeToNode < 30 ? THEME.danger : THEME.text
          ]
        ];
        rows.forEach(([label, value, color], i) => {
          const ry = py + 36 + i * 20;
          ctx.fillStyle = THEME.textDim;
          ctx.font = "10px Courier New";
          ctx.textAlign = "left";
          ctx.fillText(label, leftX, ry);
          ctx.fillStyle = color;
          ctx.fillText(value, leftX + 36, ry);
        });
        const errDeg = (angleDiff * 180 / Math.PI).toFixed(1);
        const alignStr = aligned ? "\u2713 ALIGNED" : `HDG ${Number(errDeg) > 0 ? "+" : ""}${errDeg}\xB0`;
        ctx.fillStyle = aligned ? THEME.success : THEME.warning;
        ctx.font = "bold 10px Courier New";
        ctx.textAlign = "left";
        ctx.fillText(alignStr, leftX, py + 80);
      }
      const cxc = px + pw - 50;
      const cyc = py + ph / 2 + 4;
      const cr = 36;
      ctx.beginPath();
      ctx.arc(cxc, cyc, cr, 0, Math.PI * 2);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (!aligned) {
        const arcEnd = -Math.PI / 2 + angleDiff;
        ctx.beginPath();
        ctx.moveTo(cxc, cyc);
        ctx.arc(cxc, cyc, cr - 4, -Math.PI / 2, arcEnd, angleDiff < 0);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,170,0,0.18)`;
        ctx.fill();
      }
      const da = desiredAngle - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cxc + Math.cos(da) * (cr - 8), cyc + Math.sin(da) * (cr - 8));
      ctx.lineTo(cxc + Math.cos(da) * 6, cyc + Math.sin(da) * 6);
      ctx.strokeStyle = THEME.success;
      ctx.lineWidth = 3;
      ctx.stroke();
      const ca = currentAngle - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cxc + Math.cos(ca) * (cr - 8), cyc + Math.sin(ca) * (cr - 8));
      ctx.lineTo(cxc + Math.cos(ca) * 6, cyc + Math.sin(ca) * 6);
      ctx.strokeStyle = "rgba(255,255,255,0.70)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cxc, cyc, 3, 0, Math.PI * 2);
      ctx.fillStyle = THEME.text;
      ctx.fill();
    }
    _fmtNodeTime(s) {
      if (s < 60)
        return `${Math.ceil(s)}s`;
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}m ${String(sec).padStart(2, "0")}s`;
    }
  };

  // src/UI.ts
  function drawButton(ctx, btn, hover) {
    const r = 6;
    const { x, y, w, h, label, accent } = btn;
    ctx.fillStyle = hover ? accent ? "rgba(0,180,220,0.35)" : "rgba(30,60,100,0.7)" : accent ? "rgba(0,120,160,0.25)" : "rgba(10,20,40,0.8)";
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = hover ? THEME.accent : accent ? THEME.accentDim : THEME.panelBorder;
    ctx.lineWidth = hover ? 1.5 : 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.fillStyle = hover ? THEME.accent : THEME.text;
    ctx.font = `${accent ? "bold " : ""}13px Courier New`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textBaseline = "alphabetic";
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function isHit(btn, mx, my) {
    return mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
  }
  function makeParticles(W, H, n) {
    return Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -Math.random() * 0.4 - 0.1,
      r: Math.random() * 1.2 + 0.3,
      alpha: Math.random() * 0.6 + 0.2
    }));
  }
  var UI = class {
    constructor(ctx, renderer) {
      /** Tracks mouse position for button hover */
      this.mouseX = 0;
      this.mouseY = 0;
      /** VAB: currently hovered palette part */
      this.hoveredPaletteIdx = -1;
      /** VAB: palette panel scroll offset in pixels (0 = top) */
      this._paletteScrollY = 0;
      /** VAB: screen bounds of each rendered rocket part */
      this.vabPartBounds = [];
      // ── VAB ghost / drag state ─────────────────────────────────────────────────
      /** Part type currently being dragged (null = no ghost) */
      this.vabGhostType = null;
      /** Stage index carried with the ghost so re-placing preserves staging */
      this.vabGhostStageIndex = -1;
      /** Insertion slot the ghost will snap to (0 = bottom of stack) */
      this.vabSnapSlot = 0;
      /** Screen Y of the snap insertion line */
      this.vabSnapLineY = -1;
      /** Build area geometry (set during renderVAB, read in mouse handlers) */
      this.vabBottomY = 0;
      this.vabBuildX = 0;
      /** Y coordinate of each insertion gap: index i = slot i */
      this.vabGapYs = [];
      // ── Staging ────────────────────────────────────────────────────────────────
      /** Stage badge hit circles from the last renderStaging call */
      this.stagingBadgeBounds = [];
      // ─── VAB Screen ────────────────────────────────────────────────────────────
      /** Width of the parts palette panel on the left */
      this.VAB_PALETTE_W = 200;
      this.ctx = ctx;
      this.renderer = renderer;
      this.W = ctx.canvas.width;
      this.H = ctx.canvas.height;
      this.particles = makeParticles(this.W, this.H, 80);
    }
    resize(w, h) {
      this.W = w;
      this.H = h;
      this.particles = makeParticles(w, h, 80);
    }
    // ─── Main Menu ─────────────────────────────────────────────────────────────
    renderMainMenu(time, onStart, onTutorial, onOptions, onExit) {
      const ctx = this.ctx;
      const { W, H } = this;
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, W, H);
      this._drawMenuStars(time);
      this._updateParticles();
      this._drawParticles();
      const titleY = H * 0.3;
      ctx.save();
      ctx.shadowColor = THEME.accent;
      ctx.shadowBlur = 40;
      ctx.fillStyle = THEME.accent;
      ctx.font = `bold ${Math.round(W * 0.07)}px Courier New`;
      ctx.textAlign = "center";
      ctx.fillText("ANTIGRAVITY", W / 2, titleY);
      ctx.restore();
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${Math.round(W * 0.018)}px Courier New`;
      ctx.textAlign = "center";
      ctx.fillText("A Space Exploration Simulator", W / 2, titleY + 36);
      ctx.fillStyle = "rgba(100,140,180,0.5)";
      ctx.font = "11px Courier New";
      ctx.fillText("v0.1.0", W / 2, titleY + 58);
      const bw = 220, bh = 44;
      const bx = W / 2 - bw / 2;
      const gap = 12;
      const by0 = H * 0.47;
      const buttons = [
        { x: bx, y: by0, w: bw, h: bh, label: "\u25B6  START GAME", action: onStart, accent: true },
        { x: bx, y: by0 + (bh + gap), w: bw, h: bh, label: "\u{1F4D6}  TUTORIAL", action: onTutorial },
        { x: bx, y: by0 + (bh + gap) * 2, w: bw, h: bh, label: "\u2699  OPTIONS", action: onOptions },
        { x: bx, y: by0 + (bh + gap) * 3, w: bw, h: bh, label: "\u2715  EXIT", action: onExit }
      ];
      for (const btn of buttons) {
        drawButton(ctx, btn, isHit(btn, this.mouseX, this.mouseY));
      }
      const earthY = H - 80;
      const earthR = 60;
      const earthGrad = ctx.createRadialGradient(W / 2, earthY + earthR, 0, W / 2, earthY + earthR, earthR);
      earthGrad.addColorStop(0, "#4a9eff");
      earthGrad.addColorStop(0.5, "#2266cc");
      earthGrad.addColorStop(1, "#0d2244");
      ctx.beginPath();
      ctx.arc(W / 2, earthY + earthR, earthR, 0, Math.PI * 2);
      ctx.fillStyle = earthGrad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W / 2, earthY + earthR, earthR + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(80,160,255,0.3)";
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    /** Handle click on main menu. Returns true if a button was hit. */
    handleMainMenuClick(mx, my, onStart, onTutorial, onOptions, onExit) {
      const { W, H } = this;
      const bw = 220, bh = 44;
      const bx = W / 2 - bw / 2;
      const gap = 12;
      const by0 = H * 0.47;
      const buttons = [
        { x: bx, y: by0, w: bw, h: bh, label: "\u25B6  START GAME", action: onStart, accent: true },
        { x: bx, y: by0 + (bh + gap), w: bw, h: bh, label: "\u{1F4D6}  TUTORIAL", action: onTutorial },
        { x: bx, y: by0 + (bh + gap) * 2, w: bw, h: bh, label: "\u2699  OPTIONS", action: onOptions },
        { x: bx, y: by0 + (bh + gap) * 3, w: bw, h: bh, label: "\u2715  EXIT", action: onExit }
      ];
      for (const btn of buttons) {
        if (isHit(btn, mx, my)) {
          btn.action();
          return true;
        }
      }
      return false;
    }
    // ─── Options Screen ────────────────────────────────────────────────────────
    renderOptions(advancedDebug, onBack) {
      const ctx = this.ctx;
      const { W, H } = this;
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, W, H);
      this._drawMenuStars(0);
      const pw = 480, ph = 400;
      const px = (W - pw) / 2, py = (H - ph) / 2;
      ctx.fillStyle = "rgba(10,15,25,0.92)";
      roundRect(ctx, px, py, pw, ph, 10);
      ctx.fill();
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, px, py, pw, ph, 10);
      ctx.stroke();
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 22px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("OPTIONS", W / 2, py + 40);
      ctx.font = "13px Courier New";
      ctx.textAlign = "left";
      const stubs = [
        { label: "Master Volume", value: "100%" },
        { label: "Graphics Quality", value: "High" },
        { label: "Show Trajectory", value: "On" },
        { label: "Physics Steps/s", value: "60" }
      ];
      stubs.forEach((opt, i) => {
        const oy = py + 80 + i * 44;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(opt.label, px + 30, oy);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        roundRect(ctx, px + 220, oy - 14, 180, 20, 4);
        ctx.fill();
        ctx.strokeStyle = THEME.panelBorder;
        ctx.lineWidth = 1;
        roundRect(ctx, px + 220, oy - 14, 180, 20, 4);
        ctx.stroke();
        ctx.fillStyle = THEME.accent;
        ctx.font = "12px Courier New";
        ctx.textAlign = "right";
        ctx.fillText(opt.value, px + pw - 30, oy);
        ctx.textAlign = "left";
        ctx.font = "13px Courier New";
      });
      const toggleY = py + 80 + stubs.length * 44 + 12;
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 20, toggleY - 10);
      ctx.lineTo(px + pw - 20, toggleY - 10);
      ctx.stroke();
      ctx.fillStyle = advancedDebug ? THEME.accent : THEME.textDim;
      ctx.font = "13px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("Advanced Debugging", px + 30, toggleY + 6);
      ctx.font = "11px Courier New";
      ctx.fillStyle = "rgba(140,180,220,0.6)";
      ctx.fillText("Show live force vectors on rocket during flight", px + 30, toggleY + 22);
      const tpx = px + pw - 80, tpy = toggleY - 8, tpw = 60, tph = 26;
      const on = advancedDebug;
      ctx.fillStyle = on ? "rgba(0,200,160,0.25)" : "rgba(60,60,80,0.5)";
      roundRect(ctx, tpx, tpy, tpw, tph, tph / 2);
      ctx.fill();
      ctx.strokeStyle = on ? "#00C8A0" : THEME.panelBorder;
      ctx.lineWidth = 1.5;
      roundRect(ctx, tpx, tpy, tpw, tph, tph / 2);
      ctx.stroke();
      const knobR = tph / 2 - 3;
      const knobX = on ? tpx + tpw - knobR - 4 : tpx + knobR + 4;
      ctx.fillStyle = on ? "#00C8A0" : "#606080";
      ctx.beginPath();
      ctx.arc(knobX, tpy + tph / 2, knobR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on ? "#00C8A0" : "#808090";
      ctx.font = "bold 10px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(on ? "ON" : "OFF", on ? tpx + 22 : tpx + tpw - 22, tpy + tph / 2 + 4);
      ctx.fillStyle = "rgba(100,140,180,0.4)";
      ctx.font = "11px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("(Stub options are cosmetic \u2014 full settings in a future update)", W / 2, py + ph - 52);
      const backBtn = { x: W / 2 - 90, y: py + ph - 44, w: 180, h: 36, label: "\u2190 BACK", action: onBack };
      drawButton(ctx, backBtn, isHit(backBtn, this.mouseX, this.mouseY));
    }
    /** Hit-test rect for the Advanced Debug toggle pill */
    _optionsToggleRect(_ph, pw, py, px) {
      const stubCount = 4;
      const toggleY = py + 80 + stubCount * 44 + 12;
      return { x: px + pw - 80, y: toggleY - 8, w: 60, h: 26 };
    }
    handleOptionsClick(mx, my, onBack, onToggleDebug, currentDebug = false) {
      const { W, H } = this;
      const pw = 480, ph = 400;
      const px = (W - pw) / 2, py = (H - ph) / 2;
      const backBtn = { x: W / 2 - 90, y: py + ph - 44, w: 180, h: 36, label: "\u2190 BACK", action: onBack };
      if (isHit(backBtn, mx, my)) {
        onBack();
        return true;
      }
      const tr = this._optionsToggleRect(ph, pw, py, px);
      if (mx >= tr.x && mx <= tr.x + tr.w && my >= tr.y && my <= tr.y + tr.h) {
        onToggleDebug(!currentDebug);
        return true;
      }
      return false;
    }
    renderVAB(rocket, onLaunch, onStaging, onBack) {
      const ctx = this.ctx;
      const { W, H } = this;
      ctx.fillStyle = THEME.panelBg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8,12,20,0.95)";
      ctx.fillRect(0, 0, this.VAB_PALETTE_W, H);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.VAB_PALETTE_W, 0);
      ctx.lineTo(this.VAB_PALETTE_W, H);
      ctx.stroke();
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 13px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("PARTS", this.VAB_PALETTE_W / 2, 28);
      const CARD_H = 62;
      const CARD_GAP = 4;
      const PALETTE_HEADER = 40;
      const PALETTE_FOOTER = 28;
      const listTop = PALETTE_HEADER;
      const listBottom = H - PALETTE_FOOTER;
      const listH = listBottom - listTop;
      const totalContentH = VAB_PALETTE.length * (CARD_H + CARD_GAP);
      const maxScroll = Math.max(0, totalContentH - listH);
      this._paletteScrollY = Math.max(0, Math.min(maxScroll, this._paletteScrollY));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, listTop, this.VAB_PALETTE_W, listH);
      ctx.clip();
      VAB_PALETTE.forEach((type, i) => {
        const def = PART_CATALOGUE[type];
        const cy = listTop + i * (CARD_H + CARD_GAP) - this._paletteScrollY;
        if (cy + CARD_H < listTop || cy > listBottom)
          return;
        const hovered = this.hoveredPaletteIdx === i;
        const isGhost = this.vabGhostType === type;
        ctx.fillStyle = isGhost ? "rgba(0,180,220,0.30)" : hovered ? "rgba(0,120,160,0.35)" : "rgba(15,25,40,0.8)";
        roundRect(ctx, 8, cy, this.VAB_PALETTE_W - 16, CARD_H, 5);
        ctx.fill();
        ctx.strokeStyle = isGhost ? THEME.accent : hovered ? THEME.accent : THEME.panelBorder;
        ctx.lineWidth = isGhost ? 1.5 : 1;
        roundRect(ctx, 8, cy, this.VAB_PALETTE_W - 16, CARD_H, 5);
        ctx.stroke();
        const swH = Math.min(42, CARD_H - 8);
        ctx.fillStyle = def.color;
        roundRect(ctx, 14, cy + (CARD_H - swH) / 2, 20, swH, 3);
        ctx.fill();
        ctx.fillStyle = hovered || isGhost ? THEME.accent : THEME.text;
        ctx.font = "10px Courier New";
        ctx.textAlign = "left";
        ctx.fillText(def.name.length > 16 ? def.name.slice(0, 16) + "\u2026" : def.name, 40, cy + CARD_H * 0.38);
        ctx.fillStyle = THEME.textDim;
        ctx.font = "9px Courier New";
        ctx.fillText(`${(def.dryMass / 1e3).toFixed(1)}t`, 40, cy + CARD_H * 0.6);
        if (def.maxThrust > 0)
          ctx.fillText(`${(def.maxThrust / 1e3).toFixed(0)}kN`, 76, cy + CARD_H * 0.6);
        if (def.maxFuelMass > 0)
          ctx.fillText(`\u26FD${(def.maxFuelMass / 1e3).toFixed(1)}t`, 40, cy + CARD_H * 0.8);
        if (def.ignoreThrottle) {
          ctx.fillStyle = "#cc8822";
          ctx.fillText("SOLID", 76, cy + CARD_H * 0.8);
        }
      });
      ctx.restore();
      if (maxScroll > 0) {
        const sbW = 4;
        const sbX = this.VAB_PALETTE_W - sbW - 3;
        const trackH = listH;
        const thumbH = Math.max(20, trackH * listH / totalContentH);
        const thumbY = listTop + this._paletteScrollY / maxScroll * (trackH - thumbH);
        ctx.fillStyle = "rgba(0,120,160,0.30)";
        ctx.fillRect(sbX, listTop, sbW, trackH);
        ctx.fillStyle = "rgba(0,180,220,0.65)";
        roundRect(ctx, sbX, thumbY, sbW, thumbH, 2);
        ctx.fill();
      }
      ctx.fillStyle = this.vabGhostType !== null ? THEME.accent : THEME.textDim;
      ctx.font = "9px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(
        this.vabGhostType !== null ? "Click to place" : maxScroll > 0 ? "\u25B2\u25BC scroll  \u2022  click to grab" : "Click to grab a part",
        this.VAB_PALETTE_W / 2,
        H - 10
      );
      const buildX = this.VAB_PALETTE_W;
      const buildW = W - buildX - 196;
      const bottomY = H - 80;
      this.vabBuildX = buildX;
      this.vabBottomY = bottomY;
      ctx.strokeStyle = "rgba(100,120,150,0.3)";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(buildX, bottomY);
      ctx.lineTo(buildX + buildW, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = THEME.textDim;
      ctx.font = "10px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("LAUNCHPAD", buildX + buildW / 2, bottomY + 16);
      if (rocket.parts.length > 0) {
        this.vabPartBounds = this.renderer.renderVABRocket(rocket, buildX + buildW / 2, bottomY, true);
      } else {
        this.vabPartBounds = [];
        ctx.fillStyle = THEME.textDim;
        ctx.font = "13px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("\u2190 Click a part to begin building", buildX + buildW / 2, H / 2);
      }
      this.vabGapYs = [bottomY];
      for (const b of this.vabPartBounds)
        this.vabGapYs.push(b.y);
      if (this.vabGhostType !== null && this.vabGapYs.length > 0) {
        const snapY = this.vabSnapLineY >= 0 ? this.vabSnapLineY : bottomY;
        ctx.save();
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 2;
        ctx.shadowColor = THEME.accent;
        ctx.shadowBlur = 6;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(buildX + 6, snapY);
        ctx.lineTo(buildX + buildW - 6, snapY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        this.renderer.renderVABGhost(this.vabGhostType, buildX + buildW / 2, snapY);
      }
      if (rocket.parts.length > 0 && this.vabGhostType === null) {
        ctx.fillStyle = THEME.textDim;
        ctx.font = "9px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("Click part to pick up  \u2022  Right-click to delete", buildX + buildW / 2, bottomY + 32);
      }
      const infoX = W - 196;
      ctx.fillStyle = "rgba(8,12,20,0.95)";
      ctx.fillRect(infoX, 0, 196, H);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(infoX, 0);
      ctx.lineTo(infoX, H);
      ctx.stroke();
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 12px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("VEHICLE STATS", infoX + 98, 28);
      const allEngineThrust = rocket.parts.filter((p) => isEnginePart(p.def.type)).reduce((s, p) => s + p.def.maxThrust, 0);
      const stats = [
        ["Parts", `${rocket.parts.length}`],
        ["Dry Mass", `${(rocket.parts.reduce((s, p) => s + p.def.dryMass, 0) / 1e3).toFixed(2)} t`],
        ["Wet Mass", `${(rocket.getTotalMass() / 1e3).toFixed(2)} t`],
        ["Fuel", `${(rocket.totalFuelCapacity / 1e3).toFixed(1)} t`],
        ["Thrust", `${(allEngineThrust / 1e3).toFixed(0)} kN`],
        ["\u0394V", `${rocket.getDeltaV().toFixed(0)} m/s`]
      ];
      stats.forEach(([k, v], i) => {
        const ry = 55 + i * 28;
        ctx.fillStyle = THEME.textDim;
        ctx.font = "10px Courier New";
        ctx.textAlign = "left";
        ctx.fillText(k, infoX + 12, ry);
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "right";
        ctx.fillText(v, infoX + 184, ry);
      });
      const twr = rocket.getTotalMass() > 0 ? allEngineThrust / (rocket.getTotalMass() * 9.81) : 0;
      const twrY = 55 + stats.length * 28;
      ctx.fillStyle = THEME.textDim;
      ctx.font = "10px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("TWR", infoX + 12, twrY);
      ctx.fillStyle = twr > 1.2 ? THEME.success : twr > 1 ? THEME.warning : THEME.danger;
      ctx.textAlign = "right";
      ctx.fillText(twr.toFixed(2), infoX + 184, twrY);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(infoX + 10, H - 170);
      ctx.lineTo(infoX + 186, H - 170);
      ctx.stroke();
      const bw = 170, bh = 36, bx2 = infoX + 13;
      const launchBtn = { x: bx2, y: H - 160, w: bw, h: bh, label: "\u{1F680} LAUNCH", action: onLaunch, accent: true };
      const stagingBtn = { x: bx2, y: H - 114, w: bw, h: bh, label: "\u{1F522} STAGING", action: onStaging };
      const backBtn = { x: bx2, y: H - 68, w: bw, h: bh, label: "\u2190 MAIN MENU", action: onBack };
      drawButton(ctx, launchBtn, isHit(launchBtn, this.mouseX, this.mouseY));
      drawButton(ctx, stagingBtn, isHit(stagingBtn, this.mouseX, this.mouseY));
      drawButton(ctx, backBtn, isHit(backBtn, this.mouseX, this.mouseY));
    }
    handleVABClick(mx, my, rocket, onLaunch, onStaging, onBack) {
      const { W, H } = this;
      const bw = 170, bh = 36;
      const infoX = W - 196;
      const bx2 = infoX + 13;
      if (mx >= infoX) {
        const launchBtn = { x: bx2, y: H - 160, w: bw, h: bh, label: "", action: onLaunch };
        const stagingBtn = { x: bx2, y: H - 114, w: bw, h: bh, label: "", action: onStaging };
        const backBtn = { x: bx2, y: H - 68, w: bw, h: bh, label: "", action: onBack };
        for (const btn of [launchBtn, stagingBtn, backBtn]) {
          if (isHit(btn, mx, my)) {
            this.vabGhostType = null;
            btn.action();
            return true;
          }
        }
        return false;
      }
      if (this.vabGhostType !== null) {
        if (mx >= this.vabBuildX && mx < infoX) {
          rocket.insertPartAt(this.vabGhostType, this.vabSnapSlot, this.vabGhostStageIndex);
          this.vabGhostType = null;
          this.vabGhostStageIndex = -1;
          return true;
        }
        if (mx < this.VAB_PALETTE_W) {
          const i = this._paletteIdxAt(mx, my);
          if (i >= 0) {
            this.vabGhostType = VAB_PALETTE[i];
            this.vabGhostStageIndex = -1;
          }
          return true;
        }
        return false;
      }
      if (mx < this.VAB_PALETTE_W) {
        const i = this._paletteIdxAt(mx, my);
        if (i >= 0) {
          this.vabGhostType = VAB_PALETTE[i];
          this.vabGhostStageIndex = -1;
          this.vabSnapSlot = rocket.parts.length;
          this.vabSnapLineY = this.vabGapYs[rocket.parts.length] ?? this.vabBottomY;
        }
        return true;
      }
      if (mx >= this.vabBuildX && mx < infoX) {
        for (const bounds of this.vabPartBounds) {
          if (mx >= bounds.x && mx <= bounds.x + bounds.w && my >= bounds.y && my <= bounds.y + bounds.h) {
            const part = rocket.parts.find((p) => p.id === bounds.id);
            if (part) {
              this.vabGhostType = part.def.type;
              this.vabGhostStageIndex = part.stageIndex;
              rocket.removePartById(bounds.id);
            }
            return true;
          }
        }
      }
      return false;
    }
    /** Cancel the active ghost (Escape key or right-click in empty space) */
    cancelVABGhost() {
      this.vabGhostType = null;
      this.vabGhostStageIndex = -1;
    }
    /** Right-click: cancel ghost if active, otherwise delete hovered part */
    handleVABRightClick(mx, my, rocket) {
      if (this.vabGhostType !== null) {
        this.vabGhostType = null;
        return;
      }
      for (const bounds of this.vabPartBounds) {
        if (mx >= bounds.x && mx <= bounds.x + bounds.w && my >= bounds.y && my <= bounds.y + bounds.h) {
          rocket.removePartById(bounds.id);
          return;
        }
      }
    }
    /** Returns the palette card index under (mx, my), accounting for scroll, or -1. */
    _paletteIdxAt(mx, my) {
      if (mx >= this.VAB_PALETTE_W)
        return -1;
      const CARD_H = 62, CARD_GAP = 4, HEADER = 40, FOOTER = 28;
      const listTop = HEADER;
      const listBottom = this.H - FOOTER;
      if (my < listTop || my > listBottom)
        return -1;
      const scrolled = my - listTop + this._paletteScrollY;
      const i = Math.floor(scrolled / (CARD_H + CARD_GAP));
      if (i < 0 || i >= VAB_PALETTE.length)
        return -1;
      if (scrolled % (CARD_H + CARD_GAP) > CARD_H)
        return -1;
      return i;
    }
    handleVABMouseMove(mx, my) {
      this.mouseX = mx;
      this.mouseY = my;
      this.hoveredPaletteIdx = this._paletteIdxAt(mx, my);
      if (this.vabGhostType !== null && this.vabGapYs.length > 0) {
        let bestSlot = 0;
        let bestDist = Infinity;
        for (let i = 0; i < this.vabGapYs.length; i++) {
          const d = Math.abs(my - this.vabGapYs[i]);
          if (d < bestDist) {
            bestDist = d;
            bestSlot = i;
          }
        }
        this.vabSnapSlot = bestSlot;
        this.vabSnapLineY = this.vabGapYs[bestSlot];
      }
    }
    /** Scroll the VAB palette panel with the mouse wheel. */
    handleVABScroll(mx, _my, deltaY) {
      if (mx >= this.VAB_PALETTE_W)
        return;
      const CARD_H = 62, CARD_GAP = 4, HEADER = 40, FOOTER = 28;
      const listH = this.H - HEADER - FOOTER;
      const totalContentH = VAB_PALETTE.length * (CARD_H + CARD_GAP);
      const maxScroll = Math.max(0, totalContentH - listH);
      this._paletteScrollY = Math.max(0, Math.min(maxScroll, this._paletteScrollY + deltaY * 0.6));
    }
    // ─── Staging Screen ────────────────────────────────────────────────────────
    renderStaging(rocket, onConfirm, onBack) {
      const ctx = this.ctx;
      const { W, H } = this;
      this.stagingBadgeBounds = [];
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 22px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("STAGING", W / 2, 36);
      ctx.fillStyle = THEME.textDim;
      ctx.font = "11px Courier New";
      ctx.fillText("Click a badge to cycle stage (S0 fires first on Space, then S1, S2\u2026)", W / 2, 58);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, 70);
      ctx.lineTo(W - 20, 70);
      ctx.stroke();
      const leftW = Math.min(360, W * 0.38);
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("ROCKET PARTS  (top \u2192 bottom)", 20, 88);
      const visualParts = [...rocket.parts].reverse();
      const rowH = Math.min(38, (H - 160) / Math.max(visualParts.length, 1));
      const listStartY = 96;
      const STAGE_COLS = Renderer.STAGE_COLORS;
      visualParts.forEach((part, i) => {
        const ry = listStartY + i * rowH;
        const isInteractive = isEnginePart(part.def.type) || isDecouplerPart(part.def.type);
        ctx.fillStyle = "rgba(15,25,40,0.7)";
        roundRect(ctx, 15, ry + 2, leftW - 10, rowH - 4, 4);
        ctx.fill();
        ctx.fillStyle = part.def.color;
        roundRect(ctx, 20, ry + (rowH - 22) / 2, 18, 22, 2);
        ctx.fill();
        ctx.fillStyle = isInteractive ? THEME.text : THEME.textDim;
        ctx.font = `${isInteractive ? "" : ""}10px Courier New`;
        ctx.textAlign = "left";
        ctx.fillText(part.def.name, 44, ry + rowH / 2 + 4);
        const bx = leftW - 14;
        const by2 = ry + rowH / 2;
        if (isInteractive) {
          const si = part.stageIndex;
          const badgeCol = si >= 0 && si < STAGE_COLS.length ? STAGE_COLS[si] : "#444";
          const badgeLabel = si >= 0 ? `S${si}` : "\u2013";
          const hovering = Math.hypot(this.mouseX - bx, this.mouseY - by2) <= 13;
          ctx.beginPath();
          ctx.arc(bx, by2, 13, 0, Math.PI * 2);
          ctx.fillStyle = badgeCol;
          ctx.fill();
          ctx.strokeStyle = hovering ? "#fff" : "rgba(255,255,255,0.3)";
          ctx.lineWidth = hovering ? 2 : 1;
          ctx.stroke();
          ctx.fillStyle = si >= 0 ? "#000" : "#bbb";
          ctx.font = "bold 8px Courier New";
          ctx.textAlign = "center";
          ctx.fillText(badgeLabel, bx, by2 + 3);
          this.stagingBadgeBounds.push({ partId: part.id, x: bx, y: by2, r: 14 });
        } else {
          ctx.fillStyle = "#333";
          ctx.font = "9px Courier New";
          ctx.textAlign = "center";
          ctx.fillText("\u2013", bx, by2 + 3);
        }
      });
      const rightX = leftW + 28;
      const rightW = W - rightX - 20;
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("FIRE SEQUENCE  (top fires first)", rightX, 88);
      const sortedStages = [...rocket.stages].sort((a, b) => a.stageIndex - b.stageIndex);
      let seqY = 100;
      if (sortedStages.length === 0) {
        ctx.fillStyle = THEME.textDim;
        ctx.font = "12px Courier New";
        ctx.textAlign = "left";
        ctx.fillText("No stages assigned.", rightX, seqY + 20);
        ctx.fillText("Click Auto-Stage or click badge buttons on the left.", rightX, seqY + 38);
      } else {
        for (let si = 0; si < sortedStages.length; si++) {
          const stage = sortedStages[si];
          const stageCol = stage.stageIndex < STAGE_COLS.length ? STAGE_COLS[stage.stageIndex] : "#888";
          const parts = stage.partIds.map((id) => rocket.parts.find((p) => p.id === id)).filter(Boolean);
          const fireLabel = stage.stageIndex === 0 ? "STAGE 0 \u2014 1st Space press" : `STAGE ${stage.stageIndex} \u2014 after stage ${stage.stageIndex - 1} burns out`;
          ctx.fillStyle = stageCol + "28";
          roundRect(ctx, rightX, seqY, rightW, 20, 4);
          ctx.fill();
          ctx.strokeStyle = stageCol;
          ctx.lineWidth = 1;
          roundRect(ctx, rightX, seqY, rightW, 20, 4);
          ctx.stroke();
          ctx.fillStyle = stageCol;
          ctx.font = "bold 10px Courier New";
          ctx.textAlign = "left";
          ctx.fillText(fireLabel, rightX + 10, seqY + 13);
          seqY += 24;
          for (const part of parts) {
            ctx.fillStyle = "rgba(15,25,40,0.7)";
            roundRect(ctx, rightX + 8, seqY, rightW - 16, 24, 3);
            ctx.fill();
            ctx.fillStyle = part.def.color;
            roundRect(ctx, rightX + 13, seqY + 4, 14, 16, 2);
            ctx.fill();
            ctx.fillStyle = THEME.text;
            ctx.font = "10px Courier New";
            ctx.textAlign = "left";
            ctx.fillText(part.def.name, rightX + 33, seqY + 15);
            seqY += 28;
          }
          if (si < sortedStages.length - 1) {
            ctx.fillStyle = THEME.textDim;
            ctx.font = "14px Courier New";
            ctx.textAlign = "left";
            ctx.fillText("\u2193 jettison / stage", rightX + 10, seqY + 14);
            seqY += 26;
          }
        }
      }
      const autoBtn = { x: 20, y: H - 52, w: 170, h: 36, label: "\u26A1 AUTO-STAGE", action: () => rocket.autoStage() };
      const backBtn2 = { x: 210, y: H - 52, w: 120, h: 36, label: "\u2190 BACK", action: onBack };
      const confirmBtn = { x: W - 200, y: H - 52, w: 180, h: 36, label: "\u2714 DONE", action: onConfirm, accent: true };
      drawButton(ctx, autoBtn, isHit(autoBtn, this.mouseX, this.mouseY));
      drawButton(ctx, backBtn2, isHit(backBtn2, this.mouseX, this.mouseY));
      drawButton(ctx, confirmBtn, isHit(confirmBtn, this.mouseX, this.mouseY));
    }
    handleStagingClick(mx, my, rocket, onConfirm, onBack) {
      const { W, H } = this;
      const autoBtn = { x: 20, y: H - 52, w: 170, h: 36, label: "", action: () => rocket.autoStage() };
      const backBtn = { x: 210, y: H - 52, w: 120, h: 36, label: "", action: onBack };
      const confirmBtn = { x: W - 200, y: H - 52, w: 180, h: 36, label: "", action: onConfirm };
      for (const btn of [autoBtn, backBtn, confirmBtn]) {
        if (isHit(btn, mx, my)) {
          btn.action();
          return true;
        }
      }
      for (const badge of this.stagingBadgeBounds) {
        if (Math.hypot(mx - badge.x, my - badge.y) <= badge.r) {
          rocket.cycleStage(badge.partId);
          return true;
        }
      }
      return false;
    }
    // ─── Pause / Message Overlay ───────────────────────────────────────────────
    renderMessage(title, body, btnLabel, onBtn) {
      const ctx = this.ctx;
      const { W, H } = this;
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(0, 0, W, H);
      const pw = 440, ph = 200;
      const px = (W - pw) / 2, py = (H - ph) / 2;
      ctx.fillStyle = THEME.panelBg;
      roundRect(ctx, px, py, pw, ph, 10);
      ctx.fill();
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, px, py, pw, ph, 10);
      ctx.stroke();
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 18px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(title, W / 2, py + 42);
      ctx.fillStyle = THEME.text;
      ctx.font = "13px Courier New";
      ctx.fillText(body, W / 2, py + 80);
      const btn = { x: W / 2 - 80, y: py + 120, w: 160, h: 40, label: btnLabel, action: onBtn };
      drawButton(ctx, btn, isHit(btn, this.mouseX, this.mouseY));
    }
    handleMessageClick(mx, my, onBtn) {
      const { W, H } = this;
      const ph = 200;
      const py = (H - ph) / 2;
      const btn = { x: W / 2 - 80, y: py + 120, w: 160, h: 40, label: "", action: onBtn };
      if (isHit(btn, mx, my)) {
        onBtn();
        return true;
      }
      return false;
    }
    // ─── Pause Overlay ────────────────────────────────────────────────────────
    renderPauseMenu(onResume, onOptions, onMainMenu) {
      const ctx = this.ctx;
      const { W, H } = this;
      ctx.fillStyle = "rgba(0,5,18,0.62)";
      ctx.fillRect(0, 0, W, H);
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.75);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,10,0.45)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
      const pw = 340, ph2 = 268;
      const px = (W - pw) / 2, py = (H - ph2) / 2;
      ctx.fillStyle = "rgba(6,12,26,0.97)";
      roundRect(ctx, px, py, pw, ph2, 12);
      ctx.fill();
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1.5;
      roundRect(ctx, px, py, pw, ph2, 12);
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = THEME.accent;
      ctx.shadowBlur = 20;
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 26px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", W / 2, py + 46);
      ctx.restore();
      ctx.strokeStyle = `${THEME.panelBorder}`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 24, py + 60);
      ctx.lineTo(px + pw - 24, py + 60);
      ctx.stroke();
      const bw = 260, bh = 44, bx2 = (W - bw) / 2;
      const gap = 10;
      const by0 = py + 76;
      const buttons = [
        { x: bx2, y: by0, w: bw, h: bh, label: "\u25B6  RESUME", action: onResume, accent: true },
        { x: bx2, y: by0 + bh + gap, w: bw, h: bh, label: "\u2699  OPTIONS", action: onOptions },
        { x: bx2, y: by0 + (bh + gap) * 2, w: bw, h: bh, label: "\u2715  BACK TO MAIN MENU", action: onMainMenu }
      ];
      for (const btn of buttons) {
        drawButton(ctx, btn, isHit(btn, this.mouseX, this.mouseY));
      }
      ctx.fillStyle = "rgba(100,140,180,0.45)";
      ctx.font = "11px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("ESC to resume", W / 2, py + ph2 - 13);
    }
    handlePauseClick(mx, my, onResume, onOptions, onMainMenu) {
      const { W, H } = this;
      const bw = 260, bh = 44, bx2 = (W - bw) / 2;
      const gap = 10;
      const ph2 = 268;
      const py = (H - ph2) / 2;
      const by0 = py + 76;
      const buttons = [
        { x: bx2, y: by0, w: bw, h: bh, label: "", action: onResume },
        { x: bx2, y: by0 + bh + gap, w: bw, h: bh, label: "", action: onOptions },
        { x: bx2, y: by0 + (bh + gap) * 2, w: bw, h: bh, label: "", action: onMainMenu }
      ];
      for (const btn of buttons) {
        if (isHit(btn, mx, my)) {
          btn.action();
          return true;
        }
      }
      return false;
    }
    // ─── Tutorial Select Screen ──────────────────────────────────────────────
    renderTutorialSelect(scenarios, completedIds, onSelect, onBack) {
      const ctx = this.ctx;
      const { W, H } = this;
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, W, H);
      this._drawMenuStars(0);
      ctx.save();
      ctx.shadowColor = THEME.accent;
      ctx.shadowBlur = 16;
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 26px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("TUTORIAL MISSIONS", W / 2, 52);
      ctx.restore();
      ctx.fillStyle = THEME.textDim;
      ctx.font = "12px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("Complete scenarios in order to master rocket science.", W / 2, 76);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 88);
      ctx.lineTo(W - 40, 88);
      ctx.stroke();
      const COLS = 2;
      const cw = Math.min(520, (W - 60) / COLS);
      const ch = 108;
      const gap = 14;
      const startX = (W - COLS * cw - (COLS - 1) * gap) / 2;
      const startY = 104;
      scenarios.forEach((sc, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const cx = startX + col * (cw + gap);
        const cy = startY + row * (ch + gap);
        const done = completedIds.has(sc.id);
        const hov = this.mouseX >= cx && this.mouseX <= cx + cw && this.mouseY >= cy && this.mouseY <= cy + ch;
        ctx.fillStyle = hov ? "rgba(0,100,140,0.25)" : "rgba(10,18,32,0.85)";
        roundRect(ctx, cx, cy, cw, ch, 8);
        ctx.fill();
        ctx.strokeStyle = done ? "#00C8A0" : hov ? THEME.accent : THEME.panelBorder;
        ctx.lineWidth = done ? 1.5 : 1;
        roundRect(ctx, cx, cy, cw, ch, 8);
        ctx.stroke();
        ctx.font = "28px serif";
        ctx.textAlign = "left";
        ctx.fillText(sc.icon, cx + 14, cy + 44);
        ctx.fillStyle = hov ? THEME.accent : THEME.text;
        ctx.font = "bold 14px Courier New";
        ctx.textAlign = "left";
        ctx.fillText(sc.title, cx + 54, cy + 34);
        ctx.fillStyle = THEME.textDim;
        ctx.font = "11px Courier New";
        ctx.fillText(sc.subtitle, cx + 54, cy + 52);
        ctx.fillStyle = THEME.textDim;
        ctx.font = "10px Courier New";
        ctx.fillText(`${sc.steps.length} steps`, cx + 54, cy + 68);
        if (done) {
          ctx.fillStyle = "#00C8A0";
          ctx.font = "bold 11px Courier New";
          ctx.textAlign = "right";
          ctx.fillText("\u2714 COMPLETE", cx + cw - 10, cy + 26);
        }
        const bw2 = 80, bh2 = 28;
        const btnX = cx + cw - bw2 - 10, btnY = cy + ch - bh2 - 10;
        const btnHov = hov && this.mouseX >= btnX && this.mouseX <= btnX + bw2 && this.mouseY >= btnY && this.mouseY <= btnY + bh2;
        ctx.fillStyle = btnHov ? "rgba(0,180,220,0.35)" : "rgba(0,120,160,0.20)";
        roundRect(ctx, btnX, btnY, bw2, bh2, 5);
        ctx.fill();
        ctx.strokeStyle = btnHov ? THEME.accent : THEME.accentDim;
        ctx.lineWidth = 1;
        roundRect(ctx, btnX, btnY, bw2, bh2, 5);
        ctx.stroke();
        ctx.fillStyle = btnHov ? THEME.accent : THEME.text;
        ctx.font = "bold 11px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(done ? "\u25B6 REPLAY" : "\u25B6 START", btnX + bw2 / 2, btnY + bh2 / 2 + 4);
      });
      const bk = { x: W / 2 - 90, y: H - 54, w: 180, h: 36, label: "\u2190 BACK", action: onBack };
      drawButton(ctx, bk, isHit(bk, this.mouseX, this.mouseY));
    }
    handleTutorialSelectClick(mx, my, scenarios, onSelect, onBack) {
      const { W, H } = this;
      const COLS = 2;
      const cw = Math.min(520, (W - 60) / COLS);
      const ch = 108;
      const gap = 14;
      const startX = (W - COLS * cw - (COLS - 1) * gap) / 2;
      const startY = 104;
      for (let i = 0; i < scenarios.length; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const cx = startX + col * (cw + gap);
        const cy = startY + row * (ch + gap);
        if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
          onSelect(i);
          return true;
        }
      }
      const bk = { x: W / 2 - 90, y: H - 54, w: 180, h: 36, label: "", action: onBack };
      if (isHit(bk, mx, my)) {
        onBack();
        return true;
      }
      return false;
    }
    // ─── Tutorial Overlay (drawn on top of any game screen) ──────────────────
    renderTutorialOverlay(tm) {
      if (!tm.isActive)
        return;
      const ctx = this.ctx;
      const { W, H } = this;
      if (tm.flashTimer > 0) {
        const alpha = Math.min(1, tm.flashTimer / 0.4);
        ctx.fillStyle = `rgba(0,160,100,${alpha * 0.88})`;
        ctx.fillRect(0, 0, W, 50);
        ctx.fillStyle = `rgba(0,255,160,${alpha})`;
        ctx.font = "bold 16px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(`\u2713  ${tm.flashTitle}`, W / 2, 30);
        if (tm.scenarioDone) {
          ctx.fillStyle = `rgba(0,255,160,${alpha * 0.7})`;
          ctx.font = "12px Courier New";
          ctx.fillText("Scenario Complete!  Click anywhere to continue.", W / 2, 46);
        }
        return;
      }
      if (tm.scenarioDone)
        return;
      const sc = tm.scenario;
      const step = tm.step;
      if (!sc || !step)
        return;
      const PW = Math.min(400, W * 0.42);
      const px = 12;
      const lineH = 16;
      const bodyLines = this._wrapText(step.body, PW - 28, "12px Courier New");
      const hintLines = step.hint ? this._wrapText(step.hint, PW - 28, "11px Courier New") : [];
      const contentH = 26 + bodyLines.length * lineH + (hintLines.length > 0 ? 8 + hintLines.length * 14 : 0) + 22;
      const PH = Math.max(100, contentH + 24);
      const py = H - PH - 12;
      ctx.fillStyle = "rgba(4,10,22,0.90)";
      roundRect(ctx, px, py, PW, PH, 8);
      ctx.fill();
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, px, py, PW, PH, 8);
      ctx.stroke();
      const total = sc.steps.length;
      const stepLabel = `Step ${tm.stepIdx + 1} / ${total}`;
      ctx.fillStyle = THEME.accentDim;
      ctx.font = "10px Courier New";
      ctx.textAlign = "right";
      ctx.fillText(stepLabel, px + PW - 10, py + 14);
      ctx.fillStyle = THEME.textDim;
      ctx.font = "10px Courier New";
      ctx.textAlign = "left";
      ctx.fillText(`${sc.icon}  ${sc.title}`, px + 10, py + 14);
      const barW = PW - 20;
      const barH = 2;
      const barX = px + 10, barY = py + 20;
      ctx.fillStyle = "rgba(0,80,120,0.5)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(barX, barY, barW * (tm.stepIdx / total), barH);
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 13px Courier New";
      ctx.textAlign = "left";
      ctx.fillText(step.title, px + 10, py + 38);
      ctx.fillStyle = THEME.text;
      ctx.font = "12px Courier New";
      let textY = py + 56;
      for (const line of bodyLines) {
        ctx.fillText(line, px + 10, textY);
        textY += lineH;
      }
      if (hintLines.length > 0) {
        textY += 6;
        ctx.fillStyle = THEME.textDim;
        ctx.font = "11px Courier New";
        for (const line of hintLines) {
          ctx.fillText(`\u2139  ${line}`, px + 10, textY);
          textY += 14;
        }
      }
      ctx.fillStyle = "rgba(100,140,180,0.4)";
      ctx.font = "10px Courier New";
      ctx.textAlign = "right";
      ctx.fillText("[ Skip tutorial ]", px + PW - 10, py + PH - 8);
    }
    /** Returns true if the "skip tutorial" link was clicked. */
    handleTutorialOverlayClick(mx, my, tm) {
      if (!tm.isActive)
        return false;
      const { W, H } = this;
      if (tm.flashTimer > 0 && tm.scenarioDone) {
        return true;
      }
      const sc = tm.scenario;
      const step = tm.step;
      if (!sc || !step)
        return false;
      const PW = Math.min(400, W * 0.42);
      const px = 12;
      const lineH = 16;
      const bodyLines = this._wrapText(step.body, PW - 28, "12px Courier New");
      const hintLines = step.hint ? this._wrapText(step.hint, PW - 28, "11px Courier New") : [];
      const contentH = 26 + bodyLines.length * lineH + (hintLines.length > 0 ? 8 + hintLines.length * 14 : 0) + 22;
      const PH = Math.max(100, contentH + 24);
      const py = H - PH - 12;
      const skipX = px + PW - 120, skipY = py + PH - 20;
      if (mx >= skipX && mx <= px + PW && my >= skipY && my <= py + PH) {
        return true;
      }
      return false;
    }
    // ─── Private Helpers ──────────────────────────────────────────────────────
    /** Word-wrap `text` (with \n line breaks) into lines fitting `maxWidth`. */
    _wrapText(text, maxWidth, font) {
      const ctx = this.ctx;
      const saved = ctx.font;
      ctx.font = font;
      const lines = [];
      for (const para of text.split("\n")) {
        const words = para.split(" ");
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current)
          lines.push(current);
      }
      ctx.font = saved;
      return lines;
    }
    _drawMenuStars(time) {
      const ctx = this.ctx;
      const { W, H } = this;
      for (let i = 0; i < 200; i++) {
        const seed = i * 7 + 13;
        const sx = (seed * 1664525 + 1013904223 & 16777215) % W;
        const sy = (seed * 22695477 + 1 & 16777215) % H;
        const r = (seed * 6364136223846793e3 & 255) / 255 * 1.2 + 0.2;
        const tw = Math.sin(time * 0.8 + i) * 0.15;
        ctx.fillStyle = `rgba(200,220,255,${0.35 + tw})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    _updateParticles() {
      const { W, H } = this;
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -5) {
          p.y = H + 5;
          p.x = Math.random() * W;
        }
      }
    }
    _drawParticles() {
      const ctx = this.ctx;
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,180,255,${p.alpha * 0.4})`;
        ctx.fill();
      }
    }
  };

  // src/MapView.ts
  function computeOrbitalElements(pos, vel, mu = MU_EARTH, bodyR = R_EARTH) {
    const r = vec2.length(pos);
    const v = vec2.length(vel);
    const energy = v * v / 2 - mu / r;
    if (energy >= 0) {
      return { sma: Infinity, ecc: 1, periAlt: -1, apoAlt: Infinity, period: Infinity };
    }
    const sma = -mu / (2 * energy);
    const h = pos.x * vel.y - pos.y * vel.x;
    const ecc2 = 1 - h * h / (mu * sma);
    const ecc = Math.sqrt(Math.max(0, ecc2));
    const periR = sma * (1 - ecc);
    const apoR = sma * (1 + ecc);
    const period = 2 * Math.PI * Math.sqrt(sma ** 3 / mu);
    return { sma, ecc, periAlt: periR - bodyR, apoAlt: apoR - bodyR, period };
  }
  var HANDLE_R = 38;
  var DV_PER_PX = 10;
  var DV_VIS_PX = 0.1;
  var MapView = class {
    constructor(ctx, atmo) {
      this.mpp = 1;
      this.userScale = 1;
      this.panX = 0;
      this.panY = 0;
      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartY = 0;
      this._didPan = false;
      // ── Maneuver node ─────────────────────────────────────────────────────────
      this.node = null;
      this._nodeIdx = 0;
      // ── Trajectory cache ──────────────────────────────────────────────────────
      // Pools are grown as needed and reused across frames to avoid GC pressure.
      this.cachedPath = [];
      this.postNodePath = [];
      this._pathPool = [];
      this._pnPool = [];
      this.pathAge = 0;
      this._moonPosAtRender = { x: 0, y: 0 };
      // ── Burn execution tracking ───────────────────────────────────────────────
      this._burnStartVel = null;
      this._burnTotalDV = 0;
      this._burnDirX = 1;
      // unit vector along planned burn direction
      this._burnDirY = 0;
      this._dvRemaining = null;
      this._prevTimeToNode = Infinity;
      // ── Encounter cache ───────────────────────────────────────────────────────
      this._encounter = null;
      this._postNodeEncounter = null;
      // ── Screen-space hit-test targets ─────────────────────────────────────────
      this._nodeScreenPt = null;
      this._progHandle = null;
      this._retroHandle = null;
      this._normHandle = null;
      this._antinormHandle = null;
      this._progradeScreenDir = { x: 0, y: -1 };
      this._radialScreenDir = { x: 1, y: 0 };
      // ── Handle drag state ─────────────────────────────────────────────────────
      this._dragging = null;
      this._dragLastX = 0;
      this._dragLastY = 0;
      this.ctx = ctx;
      this.atmo = atmo;
      this.W = ctx.canvas.width;
      this.H = ctx.canvas.height;
    }
    resize(w, h) {
      this.W = w;
      this.H = h;
    }
    // ─── Full Map Render ──────────────────────────────────────────────────────
    render(rocket, wallTime, missionTime, _onBack) {
      const ctx = this.ctx;
      const { W, H } = this;
      ctx.fillStyle = "rgba(4,8,16,0.90)";
      ctx.fillRect(0, 0, W, H);
      this.mpp = R_EARTH / (H * 0.2);
      this._drawGrid(missionTime);
      this._drawMoon(missionTime);
      this._drawEarth();
      const isExecutingBurn = this.node !== null && this.node.time - missionTime < 0;
      const moonPosNow = getMoonPosition(missionTime);
      this._moonPosAtRender = moonPosNow;
      this.pathAge++;
      if (this.pathAge > 60 || this.cachedPath.length === 0) {
        const moonPosCurr = moonPosNow;
        const moonDistCurr = vec2.length(vec2.sub(rocket.body.pos, moonPosCurr));
        const rocketInSOI = moonDistCurr < MOON_SOI;
        let predTime;
        let predEarthDt;
        if (rocketInSOI) {
          const moonVelCurr = getMoonVelocity(missionTime);
          const relPos = vec2.sub(rocket.body.pos, moonPosCurr);
          const relVel = vec2.sub(rocket.body.vel, moonVelCurr);
          const lunarOrb = computeOrbitalElements(relPos, relVel, MU_MOON, R_MOON);
          const lunarPeriod = isFinite(lunarOrb.period) && lunarOrb.period > 0 ? lunarOrb.period : 8800;
          predTime = Math.min(lunarPeriod * 2.5, 3 * 86400);
          predEarthDt = 2;
        } else {
          const orb = computeOrbitalElements(rocket.body.pos, rocket.body.vel);
          const period = isFinite(orb.period) && orb.period > 0 ? orb.period : 4 * 86400;
          predTime = Math.min(period * 2.5, 365 * 86400);
          predEarthDt = Math.max(10, period / 200);
        }
        this.cachedPath = this._predictPath(this._pathPool, rocket.body.pos, rocket.body.vel, missionTime, predTime, predEarthDt);
        this._encounter = this._findEncounter(this.cachedPath);
        this.pathAge = 0;
        if (this.node) {
          this._nodeIdx = this._findNodeIdx(this.node.time);
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
      if (this.node)
        this._drawManeuverNode(missionTime, rocket);
      this._drawOrbitalInfo(rocket, missionTime);
      if (!this._encounter && !this._postNodeEncounter) {
        this._drawTransferHints(rocket, missionTime);
      }
      ctx.fillStyle = THEME.accent;
      ctx.font = "bold 14px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("MAP VIEW", W / 2, 28);
      ctx.fillStyle = THEME.textDim;
      ctx.font = "11px Courier New";
      ctx.fillText("M \u2014 flight  |  Click trajectory \u2014 place node  |  Click node \u2014 delete", W / 2, 46);
    }
    /** ΔV remaining in the currently executing burn, or null if no burn is active. */
    get dvRemaining() {
      return this._dvRemaining;
    }
    /**
     * Update burn-execution state every game frame, even when the map is not visible.
     * Must be called from Game._updateFlight() before renderBurnGuidance.
     */
    tick(rocket, missionTime) {
      const timeToNode = this.node ? this.node.time - missionTime : Infinity;
      const isExecutingBurn = this.node !== null && timeToNode < 0;
      if (this.node && timeToNode < 0 && this._prevTimeToNode >= 0) {
        const vel = rocket.body.vel;
        const pos = rocket.body.pos;
        this._burnStartVel = { x: vel.x, y: vel.y };
        this._burnTotalDV = Math.hypot(this.node.progradeDV, this.node.normalDV);
        const speed = Math.hypot(vel.x, vel.y);
        const posLen = Math.hypot(pos.x, pos.y);
        const pgX = speed > 0 ? vel.x / speed : 0;
        const pgY = speed > 0 ? vel.y / speed : 1;
        const roX = posLen > 0 ? pos.x / posLen : 0;
        const roY = posLen > 0 ? pos.y / posLen : 1;
        const bx = this.node.progradeDV * pgX + this.node.normalDV * roX;
        const by = this.node.progradeDV * pgY + this.node.normalDV * roY;
        const bl = Math.hypot(bx, by);
        this._burnDirX = bl > 0 ? bx / bl : pgX;
        this._burnDirY = bl > 0 ? by / bl : pgY;
      }
      if (!this.node || !isExecutingBurn)
        this._burnStartVel = null;
      this._prevTimeToNode = timeToNode;
      if (isExecutingBurn && this._burnStartVel !== null) {
        const dx = rocket.body.vel.x - this._burnStartVel.x;
        const dy = rocket.body.vel.y - this._burnStartVel.y;
        const dvAccum = Math.max(0, dx * this._burnDirX + dy * this._burnDirY);
        const dvRem = this._burnTotalDV - dvAccum;
        this._dvRemaining = isFinite(dvRem) ? Math.max(0, dvRem) : null;
      } else {
        this._dvRemaining = null;
      }
    }
    // ─── Trajectory Prediction (patched conics) ───────────────────────────────
    _predictPath(pool, startPos, startVel, startT, maxTime, earthDt) {
      let count = 0;
      let pos = vec2.clone(startPos);
      let vel = vec2.clone(startVel);
      let t = startT;
      let prevAngle = Math.atan2(pos.y, pos.x);
      let totalAngle = 0;
      let moonPrevAngle = NaN;
      let moonOrbitAngle = 0;
      let elapsed = 0;
      for (let i = 0; i < 5e4 && elapsed < maxTime; i++) {
        const moonPos = getMoonPosition(t);
        const dx = pos.x - moonPos.x;
        const dy = pos.y - moonPos.y;
        const moonDist = Math.sqrt(dx * dx + dy * dy);
        const inSOI = moonDist < MOON_SOI && moonDist > 0;
        const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        let effectiveDt;
        if (inSOI) {
          effectiveDt = 2;
        } else {
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          const periDt = speed > 0 ? 0.05 * r / speed : earthDt;
          effectiveDt = Math.min(earthDt, Math.max(1, periDt));
        }
        let pt = pool[count];
        if (pt === void 0) {
          pt = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, t: 0, inMoonSOI: false };
          pool.push(pt);
        }
        pt.pos.x = pos.x;
        pt.pos.y = pos.y;
        pt.vel.x = vel.x;
        pt.vel.y = vel.y;
        pt.t = t;
        pt.inMoonSOI = inSOI;
        if (inSOI) {
          if (!pt.moonRelPos)
            pt.moonRelPos = { x: 0, y: 0 };
          pt.moonRelPos.x = dx;
          pt.moonRelPos.y = dy;
        } else {
          pt.moonRelPos = void 0;
        }
        count++;
        if (r < R_EARTH)
          break;
        if (moonDist < R_MOON)
          break;
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
            if (dA > Math.PI)
              dA -= 2 * Math.PI;
            if (dA < -Math.PI)
              dA += 2 * Math.PI;
            moonOrbitAngle += Math.abs(dA);
            if (i > 10 && moonOrbitAngle >= 2 * Math.PI * 1.05)
              break;
          }
          moonPrevAngle = moonRelAngle;
        } else {
          moonPrevAngle = NaN;
          const curAngle = Math.atan2(pos.y, pos.x);
          let dA = curAngle - prevAngle;
          if (dA > Math.PI)
            dA -= 2 * Math.PI;
          if (dA < -Math.PI)
            dA += 2 * Math.PI;
          totalAngle += Math.abs(dA);
          prevAngle = curAngle;
          if (i > 20 && totalAngle >= 2 * Math.PI * 1.02)
            break;
        }
        pos.x += vel.x * effectiveDt;
        pos.y += vel.y * effectiveDt;
        t += effectiveDt;
        elapsed += effectiveDt;
      }
      pool.length = count;
      return pool;
    }
    /** Find the path index whose time is closest to the given mission time. */
    _findNodeIdx(nodeTime) {
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < this.cachedPath.length; i++) {
        const diff = Math.abs(this.cachedPath[i].t - nodeTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      return bestIdx;
    }
    _recomputePostNode() {
      if (!this.node) {
        this.postNodePath = [];
        this._postNodeEncounter = null;
        return;
      }
      const base = this.cachedPath[this._nodeIdx];
      if (!base) {
        this.postNodePath = [];
        this._postNodeEncounter = null;
        return;
      }
      const prograde = vec2.normalize(base.vel);
      const radialOut = vec2.normalize(base.pos);
      const newVel = {
        x: base.vel.x + this.node.progradeDV * prograde.x + this.node.normalDV * radialOut.x,
        y: base.vel.y + this.node.progradeDV * prograde.y + this.node.normalDV * radialOut.y
      };
      const moonPosBase = getMoonPosition(base.t);
      const baseInSOI = vec2.length(vec2.sub(base.pos, moonPosBase)) < MOON_SOI;
      let pnTime;
      let pnEarthDt;
      if (baseInSOI) {
        const moonVelBase = getMoonVelocity(base.t);
        const relPosBase = vec2.sub(base.pos, moonPosBase);
        const relVelBase = vec2.sub(newVel, moonVelBase);
        const lunarOrbBase = computeOrbitalElements(relPosBase, relVelBase, MU_MOON, R_MOON);
        const lunarPeriodB = isFinite(lunarOrbBase.period) && lunarOrbBase.period > 0 ? lunarOrbBase.period : 8800;
        pnTime = Math.min(lunarPeriodB * 2.5, 3 * 86400);
        pnEarthDt = 2;
      } else {
        const orb = computeOrbitalElements(base.pos, newVel);
        const period = isFinite(orb.period) && orb.period > 0 ? orb.period : 4 * 86400;
        pnTime = Math.min(period * 2.5, 365 * 86400);
        pnEarthDt = Math.max(10, period / 200);
      }
      this.postNodePath = this._predictPath(this._pnPool, base.pos, newVel, base.t, pnTime, pnEarthDt);
      this._postNodeEncounter = this._findEncounter(this.postNodePath);
    }
    // ─── Encounter Detection ──────────────────────────────────────────────────
    _findEncounter(path) {
      let entryIdx = -1;
      let closestIdx = -1;
      let minDist = Infinity;
      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        if (!pt.inMoonSOI)
          continue;
        if (entryIdx === -1)
          entryIdx = i;
        const moonPos = getMoonPosition(pt.t);
        const dist = vec2.length(vec2.sub(pt.pos, moonPos)) - R_MOON;
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }
      if (entryIdx === -1)
        return null;
      if (entryIdx === 0)
        return null;
      return {
        entryIdx,
        entryT: path[entryIdx].t,
        closestIdx,
        closestDistFromSurface: minDist,
        isImpact: minDist < 0
      };
    }
    // ─── Interaction ─────────────────────────────────────────────────────────
    handleClick(mx, my) {
      if (this._didPan) {
        this._didPan = false;
        return false;
      }
      if (this.node && this._nodeScreenPt) {
        const d = Math.hypot(mx - this._nodeScreenPt.x, my - this._nodeScreenPt.y);
        if (d < 14) {
          this.node = null;
          this.postNodePath = [];
          this._postNodeEncounter = null;
          return true;
        }
      }
      if (this.cachedPath.length === 0)
        return false;
      let bestIdx = -1, bestDist = 22;
      for (let i = 0; i < this.cachedPath.length; i++) {
        const sp = this._w2s(this._displayPos(this.cachedPath[i], this._moonPosAtRender));
        const d = Math.hypot(mx - sp.x, my - sp.y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const pt = this.cachedPath[bestIdx];
        this.node = { time: pt.t, progradeDV: 0, normalDV: 0, executed: false };
        this._nodeIdx = bestIdx;
        this._recomputePostNode();
        return true;
      }
      return false;
    }
    handleMouseDown(mx, my) {
      this._didPan = false;
      this._dragging = null;
      if (this.node) {
        const handles = [
          ["prograde", this._progHandle],
          ["retrograde", this._retroHandle],
          ["normal", this._normHandle],
          ["antinormal", this._antinormHandle]
        ];
        for (const [label, sp] of handles) {
          if (sp && Math.hypot(mx - sp.x, my - sp.y) < 16) {
            this._dragging = label;
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
    handleMouseMove(mx, my) {
      if (this._dragging && this.node) {
        const dx = mx - this._dragLastX;
        const dy = my - this._dragLastY;
        this._dragLastX = mx;
        this._dragLastY = my;
        const pv = this._progradeScreenDir;
        const nr = this._radialScreenDir;
        switch (this._dragging) {
          case "prograde":
            this.node.progradeDV += (dx * pv.x + dy * pv.y) * DV_PER_PX;
            break;
          case "retrograde":
            this.node.progradeDV -= (dx * pv.x + dy * pv.y) * DV_PER_PX;
            break;
          case "normal":
            this.node.normalDV += (dx * nr.x + dy * nr.y) * DV_PER_PX;
            break;
          case "antinormal":
            this.node.normalDV -= (dx * nr.x + dy * nr.y) * DV_PER_PX;
            break;
        }
        this._recomputePostNode();
        return;
      }
      if (!this.isDragging)
        return;
      this._didPan = true;
      this.panX = mx - this.dragStartX;
      this.panY = my - this.dragStartY;
    }
    handleMouseUp() {
      this.isDragging = false;
      this._dragging = null;
    }
    handleWheel(e) {
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const rect = e.target.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const eMppBefore = this.eMpp;
      const worldX = (mx - this.W / 2 - this.panX) * eMppBefore;
      const worldY = -(my - this.H / 2 - this.panY) * eMppBefore;
      this.userScale = Math.max(5e-3, Math.min(80, this.userScale * factor));
      const eMppAfter = this.eMpp;
      this.panX = mx - this.W / 2 - worldX / eMppAfter;
      this.panY = my - this.H / 2 + worldY / eMppAfter;
    }
    resetView() {
      this.panX = 0;
      this.panY = 0;
      const mppNow = R_EARTH / (this.H * 0.2);
      const screenR = Math.min(this.W, this.H) * 0.38;
      this.userScale = mppNow * screenR / MOON_ORBIT_RADIUS;
    }
    // ─── Drawing Helpers ──────────────────────────────────────────────────────
    get eMpp() {
      return this.mpp / this.userScale;
    }
    _w2s(world) {
      return {
        x: this.W / 2 + world.x / this.eMpp + this.panX,
        y: this.H / 2 - world.y / this.eMpp + this.panY
      };
    }
    /** Returns the display-world position for a trajectory point.
     *  SOI points are shown Moon-relative (moonPosNow + moonRelPos) so the
     *  orbit arc appears fixed relative to the Moon graphic even as the Moon moves. */
    _displayPos(pt, moonPosNow) {
      if (pt.inMoonSOI && pt.moonRelPos) {
        return { x: moonPosNow.x + pt.moonRelPos.x, y: moonPosNow.y + pt.moonRelPos.y };
      }
      return pt.pos;
    }
    // ─── Draw Trajectory ──────────────────────────────────────────────────────
    _drawTrajectory(path, isPlanned, moonPosNow) {
      const ctx = this.ctx;
      const n = path.length;
      if (n < 2)
        return;
      ctx.save();
      ctx.setLineDash([]);
      for (let i = 1; i < n; i++) {
        const frac = i / n;
        const alpha = Math.max(0.08, (isPlanned ? 0.8 : 0.82) - frac * 0.72);
        const s0 = this._w2s(this._displayPos(path[i - 1], moonPosNow));
        const s1 = this._w2s(this._displayPos(path[i], moonPosNow));
        if (s0.x < -300 && s1.x < -300)
          continue;
        if (s0.x > this.W + 300 && s1.x > this.W + 300)
          continue;
        const inSOI = path[i].inMoonSOI;
        const alt = vec2.length(path[i].pos) - R_EARTH;
        const inAtmo = !inSOI && this.atmo.isInAtmosphere(alt);
        let color;
        if (inSOI) {
          color = isPlanned ? `rgba(100,255,200,${alpha.toFixed(2)})` : `rgba(60,220,160,${alpha.toFixed(2)})`;
        } else if (inAtmo) {
          color = isPlanned ? `rgba(255,200,80,${alpha.toFixed(2)})` : `rgba(255,150,50,${alpha.toFixed(2)})`;
        } else {
          color = isPlanned ? `rgba(255,210,0,${alpha.toFixed(2)})` : `rgba(0,210,255,${alpha.toFixed(2)})`;
        }
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = isPlanned ? 2.5 : 2;
        ctx.stroke();
      }
      const step = Math.max(8, Math.floor(n / 10));
      for (let i = step; i < n - 1; i += step) {
        const frac = i / n;
        if (frac > 0.88)
          break;
        const s0 = this._w2s(this._displayPos(path[i], moonPosNow));
        const s1 = this._w2s(this._displayPos(path[i + 1], moonPosNow));
        const dx = s1.x - s0.x, dy = s1.y - s0.y;
        if (Math.hypot(dx, dy) < 5)
          continue;
        const alpha = Math.max(0.15, 0.55 - frac * 0.4);
        const inSOI = path[i].inMoonSOI;
        const arrowColor = inSOI ? `rgba(80,240,170,${alpha.toFixed(2)})` : isPlanned ? `rgba(255,220,60,${alpha.toFixed(2)})` : `rgba(0,220,255,${alpha.toFixed(2)})`;
        ctx.save();
        ctx.translate((s0.x + s1.x) / 2, (s0.y + s1.y) / 2);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = arrowColor;
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, 3.5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, -3.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      const last = path[path.length - 1];
      const lastAlt = vec2.length(last.pos) - R_EARTH;
      if (lastAlt < 7e4 && !last.inMoonSOI) {
        const sp = this._w2s(last.pos);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,80,0,0.85)";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = THEME.danger;
        ctx.font = "bold 10px Courier New";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("IMPACT", sp.x + 9, sp.y);
        ctx.textBaseline = "alphabetic";
      }
      if (last.inMoonSOI && last.moonRelPos) {
        const dist = Math.hypot(last.moonRelPos.x, last.moonRelPos.y);
        if (dist < R_MOON * 1.05) {
          const sp = this._w2s(this._displayPos(last, moonPosNow));
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(200,120,0,0.9)";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = THEME.warning;
          ctx.font = "bold 10px Courier New";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("LUNAR IMPACT", sp.x + 9, sp.y);
          ctx.textBaseline = "alphabetic";
        }
      }
      ctx.restore();
    }
    // ─── Periapsis / Apoapsis markers ────────────────────────────────────────
    _drawOrbMarkers(path, moonPosNow) {
      if (path.length < 2)
        return;
      let soiCount = 0, earthCount = 0;
      let minD = Infinity, maxD = -Infinity;
      let minRel = { x: 0, y: 0 }, maxRel = { x: 0, y: 0 };
      let minR = Infinity, maxR = -Infinity;
      let minPos = path[0].pos, maxPos = path[0].pos;
      let firstEarthPos = null;
      for (const pt of path) {
        if (pt.inMoonSOI) {
          soiCount++;
          if (pt.moonRelPos) {
            const d = Math.hypot(pt.moonRelPos.x, pt.moonRelPos.y);
            if (d < minD) {
              minD = d;
              minRel = pt.moonRelPos;
            }
            if (d > maxD) {
              maxD = d;
              maxRel = pt.moonRelPos;
            }
          }
        } else {
          earthCount++;
          if (firstEarthPos === null) {
            firstEarthPos = pt.pos;
            minPos = pt.pos;
            maxPos = pt.pos;
          }
          const r = vec2.length(pt.pos);
          if (r < minR) {
            minR = r;
            minPos = pt.pos;
          }
          if (r > maxR) {
            maxR = r;
            maxPos = pt.pos;
          }
        }
      }
      if (soiCount > earthCount && soiCount > 4) {
        this._drawOrbMarkerMoon(minRel, moonPosNow, "Pe", THEME.warning);
        this._drawOrbMarkerMoon(maxRel, moonPosNow, "Ap", THEME.accent);
        return;
      }
      if (earthCount < 2 || firstEarthPos === null)
        return;
      this._drawOrbMarker(minPos, "Pe", THEME.warning);
      this._drawOrbMarker(maxPos, "Ap", THEME.accent);
    }
    _drawOrbMarkersPost(path) {
      if (path.length < 2)
        return;
      let minR = Infinity, maxR = -Infinity;
      let minPos = null, maxPos = null;
      let earthCount = 0;
      for (const pt of path) {
        if (pt.inMoonSOI)
          continue;
        earthCount++;
        const r = vec2.length(pt.pos);
        if (r < minR) {
          minR = r;
          minPos = pt.pos;
        }
        if (r > maxR) {
          maxR = r;
          maxPos = pt.pos;
        }
      }
      if (earthCount < 2 || minPos === null || maxPos === null)
        return;
      this._drawOrbMarker(minPos, "Pe", "#ffcc00");
      this._drawOrbMarker(maxPos, "Ap", "#ffaa00");
    }
    _drawOrbMarker(worldPos, label, color) {
      const ctx = this.ctx;
      const sp = this._w2s(worldPos);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "left";
      const alt = vec2.length(worldPos) - R_EARTH;
      const altStr = alt < 1e6 ? `${(alt / 1e3).toFixed(1)} km` : `${(alt / 1e6).toFixed(3)} Mm`;
      ctx.fillText(`${label}: ${altStr}`, sp.x + 8, sp.y - 4);
    }
    /** Same as _drawOrbMarker but takes Moon-relative position and shows Moon-relative altitude */
    _drawOrbMarkerMoon(moonRelPos, moonPosNow, label, color) {
      const ctx = this.ctx;
      const dispW = { x: moonPosNow.x + moonRelPos.x, y: moonPosNow.y + moonRelPos.y };
      const sp = this._w2s(dispW);
      const alt = Math.hypot(moonRelPos.x, moonRelPos.y) - R_MOON;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "left";
      const altStr = alt < 0 ? "SURFACE" : alt < 1e6 ? `${(alt / 1e3).toFixed(1)} km` : `${(alt / 1e6).toFixed(3)} Mm`;
      ctx.fillText(`${label}: ${altStr}`, sp.x + 8, sp.y - 4);
    }
    // ─── Moon Drawing ─────────────────────────────────────────────────────────
    _drawMoon(missionTime) {
      const ctx = this.ctx;
      const moonWorld = getMoonPosition(missionTime);
      const moonSP = this._w2s(moonWorld);
      const earthSP = this._w2s({ x: 0, y: 0 });
      const moonR = R_MOON / this.eMpp;
      const soiR = MOON_SOI / this.eMpp;
      const orbitR = MOON_ORBIT_RADIUS / this.eMpp;
      ctx.save();
      ctx.beginPath();
      ctx.arc(earthSP.x, earthSP.y, orbitR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(100,100,140,0.22)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 14]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(moonSP.x, moonSP.y, Math.max(soiR, 4), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(80,200,170,0.35)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if (soiR > 10) {
        ctx.fillStyle = "rgba(80,200,170,0.55)";
        ctx.font = "9px Courier New";
        ctx.textAlign = "right";
        ctx.fillText("SOI", moonSP.x + soiR - 3, moonSP.y - 4);
      }
      const drawR = Math.max(moonR, 4);
      const grad = ctx.createRadialGradient(
        moonSP.x - drawR * 0.28,
        moonSP.y - drawR * 0.28,
        drawR * 0.04,
        moonSP.x,
        moonSP.y,
        drawR
      );
      grad.addColorStop(0, "#d0d0d0");
      grad.addColorStop(0.5, "#a0a0a0");
      grad.addColorStop(1, "#585858");
      ctx.beginPath();
      ctx.arc(moonSP.x, moonSP.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(200,200,220,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(210,210,230,0.9)";
      ctx.font = "bold 10px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("MOON", moonSP.x + drawR + 5, moonSP.y + 4);
    }
    // ─── Encounter Marker ─────────────────────────────────────────────────────
    _drawEncounterMarker(enc, path, missionTime, isPlanned) {
      const ctx = this.ctx;
      const pt = path[enc.entryIdx];
      if (!pt)
        return;
      const moonPosNow = getMoonPosition(missionTime);
      const sp = this._w2s(this._displayPos(pt, moonPosNow));
      const color = isPlanned ? "#ffdd00" : "#00ffcc";
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = color + "44";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      const ca = path[enc.closestIdx];
      if (ca) {
        const caSP = this._w2s(this._displayPos(ca, moonPosNow));
        ctx.beginPath();
        ctx.arc(caSP.x, caSP.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = enc.isImpact ? THEME.danger : color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const timeToEnc = enc.entryT - missionTime;
      const distKm = Math.max(0, enc.closestDistFromSurface / 1e3).toFixed(0);
      const status = enc.isImpact ? "IMPACT TRAJECTORY" : enc.closestDistFromSurface < 5e6 ? "LUNAR ORBIT POSSIBLE" : "LUNAR FLYBY";
      const statusColor = enc.isImpact ? THEME.danger : enc.closestDistFromSurface < 5e6 ? THEME.success : THEME.warning;
      const pw = 210, ph = 108;
      let px = sp.x + 14;
      if (px + pw > this.W - 10)
        px = sp.x - pw - 14;
      const py = Math.max(10, Math.min(this.H - ph - 10, sp.y - ph / 2));
      ctx.fillStyle = "rgba(6,12,22,0.93)";
      this._roundRect(px, py, pw, ph, 6);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      this._roundRect(px, py, pw, ph, 6);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(isPlanned ? "PLANNED ENCOUNTER" : "MOON ENCOUNTER", px + pw / 2, py + 16);
      const rows = [
        ["T\u2212", timeToEnc < 0 ? "PAST" : this._fmtTime(timeToEnc), THEME.text],
        ["CA", `${distKm} km`, THEME.text],
        ["", status, statusColor]
      ];
      rows.forEach(([k, v, c], i) => {
        const ry = py + 32 + i * 22;
        if (k) {
          ctx.fillStyle = THEME.textDim;
          ctx.font = "10px Courier New";
          ctx.textAlign = "left";
          ctx.fillText(k, px + 10, ry);
        }
        ctx.fillStyle = c;
        ctx.font = k ? "10px Courier New" : "bold 10px Courier New";
        ctx.textAlign = k ? "right" : "center";
        ctx.fillText(v, k ? px + pw - 10 : px + pw / 2, ry);
      });
      ctx.fillStyle = THEME.textDim;
      ctx.font = "9px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("[click node to delete]", px + pw / 2, py + ph - 6);
    }
    // ─── Transfer Hints ───────────────────────────────────────────────────────
    _drawTransferHints(rocket, missionTime) {
      const ctx = this.ctx;
      const pos = rocket.body.pos;
      const vel = rocket.body.vel;
      const moonPosTH = getMoonPosition(missionTime);
      if (vec2.length(vec2.sub(pos, moonPosTH)) < MOON_SOI)
        return;
      const orb = computeOrbitalElements(pos, vel);
      if (orb.periAlt < 0 || orb.apoAlt === Infinity)
        return;
      const moonPos = getMoonPosition(missionTime);
      const moonOrbit = MOON_ORBIT_RADIUS - R_EARTH;
      const apoAlt = orb.apoAlt;
      const moonAngle = Math.atan2(moonPos.y, moonPos.x);
      const rktAngle = Math.atan2(pos.y, pos.x);
      let angleDiff = moonAngle - rktAngle;
      while (angleDiff > Math.PI)
        angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI)
        angleDiff += 2 * Math.PI;
      const hints = [];
      if (apoAlt < moonOrbit * 0.7) {
        hints.push("\u25B2 BURN PROGRADE to raise Ap toward Moon orbit");
      } else if (apoAlt >= moonOrbit * 0.7 && apoAlt <= moonOrbit * 1.4) {
        if (angleDiff > 0.35) {
          hints.push("\u21BB Moon is AHEAD \u2014 place node later or wait");
        } else if (angleDiff < -0.35) {
          hints.push("\u21BA Moon is BEHIND \u2014 place node earlier / burn now");
        } else {
          hints.push("\u2713 Ap near Moon orbit \u2014 add node at Pe to intercept");
        }
      } else if (apoAlt > moonOrbit * 1.4) {
        hints.push("\u25BC Ap past Moon orbit \u2014 trim retrograde to match");
      }
      if (hints.length === 0)
        return;
      const pw = 340, ph = 14 + hints.length * 18 + 10;
      const px = 16, py = this.H - ph - 60;
      ctx.fillStyle = "rgba(6,12,22,0.85)";
      this._roundRect(px, py, pw, ph, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,140,220,0.4)";
      ctx.lineWidth = 1;
      this._roundRect(px, py, pw, ph, 6);
      ctx.stroke();
      ctx.fillStyle = THEME.accentDim;
      ctx.font = "bold 9px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("TRANSFER GUIDANCE", px + 10, py + 12);
      hints.forEach((h, i) => {
        ctx.fillStyle = THEME.text;
        ctx.font = "10px Courier New";
        ctx.fillText(h, px + 10, py + 26 + i * 18);
      });
    }
    // ─── Maneuver Node Marker + Handles ──────────────────────────────────────
    _drawManeuverNode(missionTime, rocket) {
      if (!this.node)
        return;
      const base = this.cachedPath[this._nodeIdx];
      if (!base)
        return;
      const ctx = this.ctx;
      const sp = this._w2s(this._displayPos(base, this._moonPosAtRender));
      this._nodeScreenPt = sp;
      const vel = base.vel;
      const prog = vec2.length(vel) > 1 ? vec2.normalize(vel) : { x: 1, y: 0 };
      const radialBase = base.inMoonSOI && base.moonRelPos ? base.moonRelPos : base.pos;
      const rOut = vec2.normalize(radialBase);
      this._progradeScreenDir = { x: prog.x, y: -prog.y };
      this._radialScreenDir = { x: rOut.x, y: -rOut.y };
      const pv = this._progradeScreenDir;
      const nr = this._radialScreenDir;
      const proArm = HANDLE_R + Math.max(0, this.node.progradeDV) * DV_VIS_PX;
      const retroArm = HANDLE_R + Math.max(0, -this.node.progradeDV) * DV_VIS_PX;
      const normArm = HANDLE_R + Math.max(0, this.node.normalDV) * DV_VIS_PX;
      const antArm = HANDLE_R + Math.max(0, -this.node.normalDV) * DV_VIS_PX;
      this._progHandle = { x: sp.x + pv.x * proArm, y: sp.y + pv.y * proArm };
      this._retroHandle = { x: sp.x - pv.x * retroArm, y: sp.y - pv.y * retroArm };
      this._normHandle = { x: sp.x + nr.x * normArm, y: sp.y + nr.y * normArm };
      this._antinormHandle = { x: sp.x - nr.x * antArm, y: sp.y - nr.y * antArm };
      ctx.save();
      const drawArm = (end, color) => {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      };
      drawArm(this._progHandle, "#44ff88");
      drawArm(this._retroHandle, "#ff4444");
      drawArm(this._normHandle, "#ff88ff");
      drawArm(this._antinormHandle, "#44ffff");
      const drawHandle = (pos, color, label) => {
        const HR = 10;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, HR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
        const ang = Math.atan2(pos.y - sp.y, pos.x - sp.x);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(ang);
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.beginPath();
        ctx.moveTo(HR * 0.55, 0);
        ctx.lineTo(-HR * 0.3, HR * 0.38);
        ctx.lineTo(-HR * 0.3, -HR * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const lx = pos.x + (pos.x - sp.x) / Math.hypot(pos.x - sp.x, pos.y - sp.y || 1) * (HR + 10);
        const ly = pos.y + (pos.y - sp.y) / Math.hypot(pos.x - sp.x || 1, pos.y - sp.y) * (HR + 10);
        ctx.fillStyle = color;
        ctx.font = "bold 9px Courier New";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, lx, ly);
        ctx.textBaseline = "alphabetic";
      };
      drawHandle(this._progHandle, "#44ff88", "PRO");
      drawHandle(this._retroHandle, "#ff4444", "RET");
      drawHandle(this._normHandle, "#ff88ff", "NOR");
      drawHandle(this._antinormHandle, "#44ffff", "ANT");
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = THEME.warning;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u0394", sp.x, sp.y);
      ctx.textBaseline = "alphabetic";
      ctx.restore();
      this._drawNodeInfoPanel(missionTime, sp, rocket);
    }
    _drawNodeInfoPanel(missionTime, nodeSP, rocket) {
      const ctx = this.ctx;
      const node = this.node;
      const totalDV = Math.hypot(node.progradeDV, node.normalDV);
      const timeToNode = node.time - missionTime;
      const est = rocket.getBurnEstimate(totalDV);
      const halfBurn = isFinite(est.burnTime) ? est.burnTime / 2 : 0;
      const timeIgnit = timeToNode - halfBurn;
      const dvShort = est.hasEngines && totalDV > est.dvAvailable + 0.5;
      const pw = 220, ph = 168;
      const px = nodeSP.x + 20 + pw < this.W ? nodeSP.x + 20 : nodeSP.x - pw - 20;
      const py = Math.max(10, Math.min(this.H - ph - 10, nodeSP.y - ph / 2));
      ctx.fillStyle = "rgba(8,14,24,0.92)";
      this._roundRect(px, py, pw, ph, 6);
      ctx.fill();
      ctx.strokeStyle = dvShort ? THEME.danger : THEME.warning;
      ctx.lineWidth = 1;
      this._roundRect(px, py, pw, ph, 6);
      ctx.stroke();
      ctx.fillStyle = THEME.warning;
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("MANEUVER NODE", px + pw / 2, py + 16);
      const fmtBurn = (s) => {
        if (!isFinite(s) || s > 99999)
          return "---";
        if (s < 60)
          return `${s.toFixed(1)} s`;
        return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
      };
      const rows = [
        ["\u0394V", `${totalDV.toFixed(1)} m/s`, dvShort ? "danger" : "accent"],
        ["PRO", `${node.progradeDV.toFixed(1)} m/s`, null],
        ["RAD", `${node.normalDV.toFixed(1)} m/s`, null],
        [
          "T\u2212",
          timeToNode < 0 ? "PAST NODE" : this._fmtTime(timeToNode),
          timeToNode >= 0 && timeToNode < 60 ? "danger" : null
        ],
        [
          "BURN",
          est.hasEngines ? fmtBurn(est.burnTime) : "no engine",
          est.hasEngines ? null : "danger"
        ],
        [
          "IGNIT",
          timeToNode < 0 ? "NOW" : timeIgnit < 0 ? "BURN NOW" : this._fmtTime(timeIgnit),
          timeIgnit < 30 && timeToNode >= 0 ? "danger" : null
        ],
        [
          "AVAIL",
          est.hasEngines ? `${est.dvAvailable.toFixed(0)} m/s` : "---",
          dvShort ? "danger" : "success"
        ]
      ];
      rows.forEach(([k, v, style], i) => {
        const ry = py + 32 + i * 18;
        ctx.fillStyle = THEME.textDim;
        ctx.font = "10px Courier New";
        ctx.textAlign = "left";
        ctx.fillText(k, px + 10, ry);
        ctx.fillStyle = style === "danger" ? THEME.danger : style === "success" ? THEME.success : style === "accent" ? THEME.accent : THEME.text;
        ctx.textAlign = "right";
        ctx.fillText(v, px + pw - 10, ry);
      });
      if (dvShort) {
        ctx.fillStyle = THEME.danger;
        ctx.font = "bold 9px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("\u26A0 INSUFFICIENT \u0394V", px + pw / 2, py + ph - 18);
      }
      ctx.fillStyle = THEME.textDim;
      ctx.font = "9px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("[click node to delete]", px + pw / 2, py + ph - 6);
    }
    // ─── Earth & Grid ─────────────────────────────────────────────────────────
    _drawEarth() {
      const ctx = this.ctx;
      const centre = this._w2s({ x: 0, y: 0 });
      const earthR = R_EARTH / this.eMpp;
      const atmoR = (R_EARTH + 7e4) / this.eMpp;
      const atmoGrad = ctx.createRadialGradient(centre.x, centre.y, earthR * 0.95, centre.x, centre.y, atmoR);
      atmoGrad.addColorStop(0, "rgba(80,160,255,0.4)");
      atmoGrad.addColorStop(1, "rgba(0,60,120,0)");
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, atmoR, 0, Math.PI * 2);
      ctx.fillStyle = atmoGrad;
      ctx.fill();
      const earthGrad = ctx.createRadialGradient(
        centre.x - earthR * 0.3,
        centre.y - earthR * 0.3,
        earthR * 0.05,
        centre.x,
        centre.y,
        earthR
      );
      earthGrad.addColorStop(0, "#4a9eff");
      earthGrad.addColorStop(0.45, "#1d5ea8");
      earthGrad.addColorStop(0.8, "#164d30");
      earthGrad.addColorStop(1, "#0d2244");
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, earthR, 0, Math.PI * 2);
      ctx.fillStyle = earthGrad;
      ctx.fill();
    }
    _drawGrid(missionTime) {
      const ctx = this.ctx;
      const centre = this._w2s({ x: 0, y: 0 });
      const moonOrbitAlt = MOON_ORBIT_RADIUS - R_EARTH;
      const RINGS = [
        { alt: 1e5, label: "K\xE1rm\xE1n  100 km" },
        { alt: 5e5, label: "500 km" },
        { alt: 1e6, label: "1 Mm" },
        { alt: 3e6, label: "3 Mm" },
        { alt: 1e7, label: "10 Mm" },
        { alt: moonOrbitAlt, label: "Moon orbit", moon: true }
      ];
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
      const earthRings = RINGS.filter((r) => !r.moon);
      const closestRingTo = (target) => {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < earthRings.length; i++) {
          const d = Math.abs(earthRings[i].alt - target);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      };
      const apRingIdx = pnHasOrbit && isFinite(pnAp) ? closestRingTo(pnAp) : -1;
      const peRingIdx = pnHasOrbit && pnPe > -Infinity ? closestRingTo(pnPe) : -1;
      ctx.textAlign = "left";
      for (let i = 0; i < RINGS.length; i++) {
        const { alt, label, moon } = RINGS[i];
        const r = (R_EARTH + alt) / this.eMpp;
        const earthIdx = moon ? -1 : earthRings.findIndex((x) => x.alt === alt);
        const isAp = earthIdx >= 0 && earthIdx === apRingIdx;
        const isPe = earthIdx >= 0 && earthIdx === peRingIdx;
        const inBand = pnHasOrbit && !moon && alt >= pnPe && (pnAp === Infinity || alt <= pnAp);
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
        if (isAp) {
          ctx.strokeStyle = "rgba(80,220,120,0.80)";
          ctx.lineWidth = 1.4;
        } else if (isPe) {
          ctx.strokeStyle = "rgba(255,200,60,0.80)";
          ctx.lineWidth = 1.4;
        } else if (inBand) {
          ctx.strokeStyle = "rgba(30,140,210,0.65)";
          ctx.lineWidth = 0.8;
        } else if (moon) {
          ctx.strokeStyle = "rgba(100,100,140,0.35)";
          ctx.lineWidth = 0.5;
        } else {
          ctx.strokeStyle = "rgba(30,80,120,0.50)";
          ctx.lineWidth = 0.5;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const labelX = centre.x + r + 4;
        const suffix = isAp ? "  \u2190 Ap" : isPe ? "  \u2190 Pe" : "";
        ctx.font = isAp || isPe ? "bold 10px Courier New" : "10px Courier New";
        ctx.fillStyle = isAp ? "rgba(80,230,120,0.95)" : isPe ? "rgba(255,210,60,0.95)" : moon ? "rgba(120,120,160,0.70)" : inBand ? "rgba(80,160,220,0.90)" : "rgba(60,110,160,0.80)";
        ctx.fillText(label + suffix, labelX, centre.y - 4);
      }
    }
    // ─── Rocket Marker ────────────────────────────────────────────────────────
    _drawRocketMarker(rocket, time) {
      const ctx = this.ctx;
      const sp = this._w2s(rocket.body.pos);
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,212,255,${0.3 + pulse * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      const velScaled = vec2.scale(rocket.body.vel, 1e-3 / this.eMpp);
      if (vec2.length(velScaled) > 2) {
        const velEnd = { x: sp.x + velScaled.x, y: sp.y - velScaled.y };
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(velEnd.x, velEnd.y);
        ctx.strokeStyle = THEME.success;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = THEME.text;
      ctx.font = "10px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("\u25B2 Rocket", sp.x + 8, sp.y + 4);
    }
    // ─── Orbital Info Panel ───────────────────────────────────────────────────
    _drawOrbitalInfo(rocket, missionTime) {
      const ctx = this.ctx;
      const { W } = this;
      const moonPos = getMoonPosition(missionTime);
      const relToMoon = vec2.sub(rocket.body.pos, moonPos);
      const moonDist = vec2.length(relToMoon);
      const inSOI = moonDist < MOON_SOI;
      let title;
      let rows;
      const fmtAlt = (alt, label) => {
        if (alt < 0)
          return label ?? "SUBORBITAL";
        return alt < 1e6 ? `${(alt / 1e3).toFixed(1)} km` : `${(alt / 1e6).toFixed(3)} Mm`;
      };
      if (inSOI) {
        const moonVel = getMoonVelocity(missionTime);
        const relVel = vec2.sub(rocket.body.vel, moonVel);
        const orb = computeOrbitalElements(relToMoon, relVel, MU_MOON, R_MOON);
        const surfAlt = moonDist - R_MOON;
        title = "LUNAR ORBIT";
        rows = [
          ["Pe", orb.periAlt < 0 ? "IMPACT" : fmtAlt(orb.periAlt)],
          ["Ap", orb.apoAlt === Infinity ? "ESCAPE" : fmtAlt(orb.apoAlt)],
          ["Ecc", orb.ecc.toFixed(4)],
          ["Per", orb.period === Infinity ? "\u221E" : this._fmtTime(orb.period)],
          ["Alt", `${(surfAlt / 1e3).toFixed(0)} km`]
        ];
      } else {
        const orb = computeOrbitalElements(rocket.body.pos, rocket.body.vel);
        title = "ORBITAL DATA";
        rows = [
          ["Pe", fmtAlt(orb.periAlt, "SUBORBITAL")],
          ["Ap", orb.apoAlt === Infinity ? "ESCAPE" : fmtAlt(orb.apoAlt)],
          ["Ecc", orb.ecc.toFixed(4)],
          ["Per", orb.period === Infinity ? "\u221E" : this._fmtTime(orb.period)],
          ["SMA", orb.sma === Infinity ? "\u221E" : `${(orb.sma / 1e3).toFixed(0)} km`]
        ];
      }
      const pw = 200, ph = rows.length * 22 + 36;
      const px = W - pw - 16, py = 60;
      ctx.fillStyle = "rgba(8,14,24,0.88)";
      this._roundRect(px, py, pw, ph, 6);
      ctx.fill();
      ctx.strokeStyle = inSOI ? "rgba(80,200,170,0.6)" : THEME.panelBorder;
      ctx.lineWidth = 1;
      this._roundRect(px, py, pw, ph, 6);
      ctx.stroke();
      ctx.fillStyle = inSOI ? "rgba(80,220,180,1)" : THEME.accent;
      ctx.font = "bold 11px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(title, px + pw / 2, py + 18);
      rows.forEach(([k, v], i) => {
        const ry = py + 36 + i * 22;
        ctx.fillStyle = THEME.textDim;
        ctx.font = "10px Courier New";
        ctx.textAlign = "left";
        ctx.fillText(k, px + 10, ry);
        const danger = k === "Pe" && v === "IMPACT" || k === "Pe" && v === "SUBORBITAL";
        ctx.fillStyle = danger ? THEME.danger : THEME.text;
        ctx.textAlign = "right";
        ctx.fillText(v, px + pw - 10, ry);
      });
    }
    // ─── Utilities ────────────────────────────────────────────────────────────
    _roundRect(x, y, w, h, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
    _fmtTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor(seconds % 3600 / 60);
      const s = Math.floor(seconds % 60);
      return `${h}h ${m}m ${s}s`;
    }
  };

  // src/Tutorial.ts
  var G2 = 6674e-14;
  var M_EARTH2 = 5972e21;
  var R_EARTH2 = 6371e3;
  function earthOrbit(ctx) {
    const body = ctx.rocket.body;
    const mu = G2 * M_EARTH2;
    const r = Math.hypot(body.pos.x, body.pos.y);
    const v2 = body.vel.x ** 2 + body.vel.y ** 2;
    const eps = v2 / 2 - mu / r;
    if (eps >= 0)
      return { ap: Infinity, pe: r - R_EARTH2 };
    const a = -mu / (2 * eps);
    const h = body.pos.x * body.vel.y - body.pos.y * body.vel.x;
    const e = Math.sqrt(Math.max(0, 1 - h * h / (mu * a)));
    return {
      ap: a * (1 + e) - R_EARTH2,
      pe: a * (1 - e) - R_EARTH2
    };
  }
  function hasPod(ctx) {
    return ctx.rocket.parts.some(
      (p) => p.def.type === 0 /* COMMAND_POD */ || p.def.type === 11 /* COMMAND_POD_ADV */
    );
  }
  function hasTank(ctx) {
    return ctx.rocket.parts.some((p) => p.def.maxFuelMass > 0);
  }
  function hasEngine(ctx) {
    return ctx.rocket.parts.some((p) => isEnginePart(p.def.type));
  }
  function hasDecoupler(ctx) {
    return ctx.rocket.parts.some((p) => isDecouplerPart(p.def.type));
  }
  function hasStagingSet(ctx) {
    return ctx.rocket.parts.some((p) => isEnginePart(p.def.type) && p.stageIndex >= 0);
  }
  function tankCount(ctx) {
    return ctx.rocket.parts.filter((p) => p.def.maxFuelMass > 0).length;
  }
  function inFlight(ctx) {
    return ctx.screen === 4 /* FLIGHT */;
  }
  function inVAB(ctx) {
    return ctx.screen === 2 /* VAB */ || ctx.screen === 3 /* STAGING */;
  }
  var TUTORIAL_SCENARIOS = [
    // ── Scenario 1 ─────────────────────────────────────────────────────────────
    {
      id: "first_launch",
      title: "First Launch",
      subtitle: "Build and launch your very first rocket.",
      icon: "\u{1F680}",
      steps: [
        {
          title: "Welcome to Antigravity!",
          body: "This tutorial walks you through your first rocket launch.\nFrom the main menu, click START GAME to open the Vehicle Assembly Building (VAB).",
          check: (ctx) => ctx.screen !== 0 /* MAIN_MENU */ && ctx.screen !== 6 /* TUTORIAL_SELECT */
        },
        {
          title: "Build Your Rocket",
          body: "Click the Mk1 Command Pod in the parts list on the left, then click in the centre build area to place it.\nNext add an FL-T400 Fuel Tank below the pod, then an LV-T30 Booster engine at the bottom.",
          hint: "Click a part to pick it up \u2014 a dashed line shows where it will snap to.",
          check: (ctx) => inVAB(ctx) && hasPod(ctx) && hasTank(ctx) && hasEngine(ctx)
        },
        {
          title: "Set Up Staging",
          body: "Click STAGING in the right panel. Click the coloured badge next to your engine to assign it to Stage 0.\nOr just click AUTO-STAGE \u2014 it does it for you!",
          hint: "Stage 0 fires first when you press SPACE during flight.",
          check: (ctx) => hasStagingSet(ctx)
        },
        {
          title: "Launch!",
          body: "Click LAUNCH. Once on the pad:\n  W (or Shift)  \u2192 throttle up to full\n  SPACE         \u2192 activate Stage 0\nClimb to 1,000 m to complete this tutorial!",
          hint: "Keep throttle at 100 % for maximum thrust off the pad.",
          check: (ctx) => inFlight(ctx) && ctx.frame.altitude > 1e3
        }
      ]
    },
    // ── Scenario 2 ─────────────────────────────────────────────────────────────
    {
      id: "break_the_sky",
      title: "Breaking the Sky",
      subtitle: "Reach the K\xE1rm\xE1n Line \u2014 100 km altitude.",
      icon: "\u{1F324}",
      steps: [
        {
          title: "Build a Capable Rocket",
          body: "You need more fuel this time. Add a Command Pod, at least 2 FL-T800 tanks, and an LV-T30 engine.\nCheck the stats panel on the right \u2014 aim for \u0394V > 5,000 m/s.",
          hint: "Stacking tanks increases \u0394V. More tanks = more range.",
          check: (ctx) => inVAB(ctx) && tankCount(ctx) >= 2 && hasEngine(ctx)
        },
        {
          title: "Lift Off!",
          body: "Launch and climb straight up to 1 km with throttle fully open (W key).",
          check: (ctx) => inFlight(ctx) && ctx.frame.altitude > 1e3
        },
        {
          title: "Gravity Turn",
          body: "At 1 km start tilting east \u2014 press D (or Right Arrow) and hold it for a few seconds.\nA gravity turn saves huge amounts of fuel vs flying straight up.",
          hint: "Aim for about 45\xB0 from vertical by the time you hit 10 km.",
          check: (ctx) => inFlight(ctx) && ctx.frame.altitude > 3e4
        },
        {
          title: "Reach the K\xE1rm\xE1n Line",
          body: "Keep burning! Stage when fuel runs out (SPACE key).\nThe atmosphere ends at 70 km \u2014 reach 100 km to complete this scenario.",
          hint: "If you run short of fuel, add more tanks or a second stage next time.",
          check: (ctx) => inFlight(ctx) && ctx.frame.altitude > 1e5
        }
      ]
    },
    // ── Scenario 3 ─────────────────────────────────────────────────────────────
    {
      id: "orbit_earth",
      title: "Orbit the Earth",
      subtitle: "Achieve a stable orbit above 70 km.",
      icon: "\u{1F30D}",
      steps: [
        {
          title: "Build an Orbital Rocket",
          body: "You need two stages and ~9,000 m/s total \u0394V.\nSuggested build: Pod / FL-T800 / LV-909 / Decoupler / FL-T800 \xD7 2 / LV-T30.\nA booster (LV-T30) is required to lift off \u2014 the Terrier cannot launch from the pad.",
          hint: "Check the VAB stats: \u0394V > 7,500 m/s AND launch TWR > 1.2 required.",
          check: (ctx) => {
            if (inVAB(ctx)) {
              const totalMass = ctx.rocket.getTotalMass();
              const slThrust = ctx.rocket.parts.filter((p) => isEnginePart(p.def.type)).reduce((s, p) => s + p.def.maxThrust * p.def.thrustSL, 0);
              const launchTWR = totalMass > 0 ? slThrust / (totalMass * 9.81) : 0;
              return ctx.rocket.getDeltaV() > 7500 && launchTWR > 1.2 && hasDecoupler(ctx);
            }
            return inFlight(ctx);
          }
        },
        {
          title: "Gravity Turn and Climb",
          body: "After launch, pitch east at ~1 km and follow a shallow arc.\nKeep throttle at 100 % and aim to be nearly horizontal (>80\xB0) by 60 km.",
          check: (ctx) => inFlight(ctx) && ctx.frame.altitude > 2e4
        },
        {
          title: "Push Apoapsis Above 80 km",
          body: "Keep burning until your apoapsis (Ap) is above 80 km, then cut engines and coast.\nPress M to open the map view \u2014 it shows your predicted orbit arc.",
          hint: "Cut engines as soon as Ap reaches your target; burning further wastes fuel.",
          check: (ctx) => {
            if (!inFlight(ctx))
              return false;
            return earthOrbit(ctx).ap > 8e4;
          }
        },
        {
          title: "Coast to Apoapsis",
          body: "Engines off \u2014 coast up to your highest point.\nUse time warp [ / ] keys to speed up the wait.",
          check: (ctx) => inFlight(ctx) && ctx.frame.altitude > 7e4 && Math.abs(ctx.frame.verticalSpeed) < 600
        },
        {
          title: "Circularise!",
          body: "At apoapsis, point prograde (nose in your direction of travel) and burn.\nStop when your periapsis (Pe) is above 70 km \u2014 you are in orbit!",
          hint: "Prograde = the direction your rocket is already moving horizontally.",
          check: (ctx) => {
            if (!inFlight(ctx))
              return false;
            const { pe } = earthOrbit(ctx);
            return pe > 65e3 && ctx.frame.altitude > 65e3;
          }
        }
      ]
    },
    // ── Scenario 4 ─────────────────────────────────────────────────────────────
    {
      id: "to_the_moon",
      title: "To the Moon",
      subtitle: "Leave Earth orbit and enter lunar space.",
      icon: "\u{1F315}",
      steps: [
        {
          title: "Achieve Earth Orbit First",
          body: "Get into a stable orbit above 70 km before heading to the Moon.\nYou also need spare \u0394V for the Trans-Lunar Injection burn (~3,200 m/s).",
          hint: "Use an LV-1 Condor or LV-N Nerva upper stage for the best efficiency in space.",
          check: (ctx) => {
            if (!inFlight(ctx))
              return false;
            return earthOrbit(ctx).pe > 65e3;
          }
        },
        {
          title: "Plan a Trans-Lunar Injection (TLI)",
          body: "Open the map (M) and watch the Moon's position.\nWhen the Moon is about 60\xB0 ahead in its orbit, burn prograde until your Ap reaches ~384,000 km.",
          hint: "Time warp is your friend here \u2014 press ] to speed up to \xD71,000 or more.",
          check: (ctx) => {
            if (!inFlight(ctx))
              return false;
            return earthOrbit(ctx).ap > 3e8 || ctx.frame.inMoonSOI;
          }
        },
        {
          title: "Coast to the Moon",
          body: `The journey takes days of in-game time \u2014 crank up the time warp.
You'll know you've arrived when the HUD shows "ALT \u263D".`,
          hint: "High time warp (\xD710,000) covers the 3-day trip quickly. Watch the map!",
          check: (ctx) => ctx.frame.inMoonSOI
        },
        {
          title: "You Reached the Moon!",
          body: "You are now inside the Moon's sphere of influence.\nTo stay in lunar orbit, burn retrograde at closest approach to slow down (LOI burn).",
          hint: "Without slowing down you'll swing around the Moon and drift back toward Earth.",
          check: (ctx) => ctx.frame.inMoonSOI && ctx.frame.altAboveNearest < 5e5
        }
      ]
    },
    // ── Scenario 5 ─────────────────────────────────────────────────────────────
    {
      id: "lunar_landing",
      title: "Lunar Landing",
      subtitle: "Land a rocket on the surface of the Moon.",
      icon: "\u{1F311}",
      steps: [
        {
          title: "Enter Lunar Orbit",
          body: "Arrive at the Moon and slow down to be captured in orbit below 50 km.\nBurn retrograde at your closest approach to circularise.",
          check: (ctx) => {
            if (!inFlight(ctx) || !ctx.frame.inMoonSOI)
              return false;
            const { pe } = earthOrbit(ctx);
            return ctx.frame.altAboveNearest < 8e4 && ctx.frame.speed < 2500;
          }
        },
        {
          title: "Deorbit Burn",
          body: "Burn retrograde to lower your periapsis until it intersects the lunar surface.\nA short -20 m/s burn is enough to start descending.",
          hint: "Use the map view to see your updated trajectory after the burn.",
          check: (ctx) => inFlight(ctx) && ctx.frame.inMoonSOI && ctx.frame.altAboveNearest < 1e4
        },
        {
          title: "Powered Descent",
          body: "Slow your descent by burning retrograde (engines pointing toward your direction of travel).\nAim to arrive at the surface with less than 10 m/s vertical speed.",
          hint: "The Moon has no atmosphere \u2014 your engines are the only brake. Manage fuel carefully!",
          check: (ctx) => inFlight(ctx) && ctx.frame.inMoonSOI && ctx.frame.altAboveNearest < 300
        },
        {
          title: "Touchdown!",
          body: "Land safely on the Moon. Under 8 m/s impact speed is considered a safe landing.",
          hint: "Kill horizontal speed first, then descend slowly. Throttle down just before impact.",
          check: (ctx) => inFlight(ctx) && ctx.frame.inMoonSOI && ctx.frame.altAboveNearest < 30 && ctx.frame.speed < 8
        }
      ]
    },
    // ── Scenario 6 ─────────────────────────────────────────────────────────────
    {
      id: "return_to_earth",
      title: "Return to Earth",
      subtitle: "Launch from the Moon and survive reentry.",
      icon: "\u{1F320}",
      steps: [
        {
          title: "Lift Off from the Moon",
          body: "Launch from the lunar surface and achieve enough speed to escape the Moon's gravity.\nLunar escape velocity is ~2.4 km/s \u2014 point prograde and burn.",
          check: (ctx) => ctx.frame.inMoonSOI && ctx.frame.altAboveNearest > 5e3
        },
        {
          title: "Trans-Earth Injection",
          body: "Once in lunar orbit, burn prograde to set your trajectory back toward Earth.\nYour perigee should drop below 50 km to enter the atmosphere.",
          hint: "About 900 m/s of \u0394V escapes the Moon. Use the map view to verify your path.",
          check: (ctx) => !ctx.frame.inMoonSOI && ctx.frame.altitude < 4e8
        },
        {
          title: "Reentry",
          body: "You'll hit Earth's atmosphere at ~11 km/s \u2014 intense heating ahead!\nMake sure your heat shield is pointing retrograde (in the direction of travel).",
          hint: "Watch the plasma effect \u2014 beautiful but deadly without a proper heat shield.",
          check: (ctx) => !ctx.frame.inMoonSOI && ctx.frame.altitude < 8e4 && ctx.frame.speed > 4e3
        },
        {
          title: "Splashdown!",
          body: "Survive reentry and land safely on Earth.\nBelow 10 km the worst heat is behind you \u2014 slow to below 50 m/s.",
          hint: "Heat shields deplete on use. Make sure yours isn't destroyed before reentry!",
          check: (ctx) => !ctx.frame.inMoonSOI && ctx.frame.altitude < 200 && ctx.frame.speed < 80
        }
      ]
    }
  ];
  var TutorialManager = class {
    constructor() {
      this.scenarioIdx = -1;
      this.stepIdx = 0;
      this.isActive = false;
      this.scenarioDone = false;
      /** Counts down after a step completes — UI shows "✓" flash while > 0 */
      this.flashTimer = 0;
      /** Title of the last completed step, shown in the flash banner */
      this.flashTitle = "";
      /** Which scenario IDs have been fully completed this session */
      this.completedIds = /* @__PURE__ */ new Set();
    }
    start(idx) {
      this.scenarioIdx = Math.max(0, Math.min(idx, TUTORIAL_SCENARIOS.length - 1));
      this.stepIdx = 0;
      this.isActive = true;
      this.scenarioDone = false;
      this.flashTimer = 0;
      this.flashTitle = "";
    }
    stop() {
      this.isActive = false;
      this.flashTimer = 0;
    }
    get scenario() {
      return this.isActive ? TUTORIAL_SCENARIOS[this.scenarioIdx] ?? null : null;
    }
    get step() {
      const s = this.scenario;
      return s ? s.steps[this.stepIdx] ?? null : null;
    }
    /** Call once per frame.  Advances step when check() passes. */
    tick(ctx, dt) {
      if (!this.isActive)
        return;
      if (this.flashTimer > 0) {
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        return;
      }
      if (this.scenarioDone)
        return;
      const step = this.step;
      if (!step)
        return;
      if (step.check(ctx)) {
        this.flashTitle = step.title;
        this.flashTimer = 1.8;
        this.stepIdx++;
        const sc = this.scenario;
        if (this.stepIdx >= sc.steps.length) {
          this.scenarioDone = true;
          this.completedIds.add(sc.id);
        }
      }
    }
  };

  // src/Game.ts
  var PHYSICS_DT = 1 / 60;
  var MAX_PHYSICS_STEPS = 4;
  var THROTTLE_RATE = 0.5;
  var Game = class {
    constructor(canvas2) {
      // ── State ──────────────────────────────────────────────────────────────────
      this.screen = 0 /* MAIN_MENU */;
      this.isMapOpen = false;
      /** Player throttle 0–1 */
      this.throttle = 0;
      /** Physics accumulator (seconds) */
      this.accumulator = 0;
      /** Timestamp of last rAF call */
      this.lastTime = -1;
      /** Total wall-clock time (for animations) */
      this.wallTime = 0;
      /** Show force-vector debug overlay during flight */
      this.advancedDebug = false;
      /** True while the in-flight pause menu is visible */
      this.isPaused = false;
      /** True when OPTIONS was opened from the pause menu (back returns to flight, not main menu) */
      this._fromPausedFlight = false;
      /** Tutorial system — manages active scenario and step progression */
      this.tutorial = new TutorialManager();
      /** Input state flags */
      this.input = {
        throttleUp: false,
        throttleDown: false,
        rotateLeft: false,
        rotateRight: false,
        stage: false,
        toggleMap: false,
        escape: false
      };
      /** One-shot flags (reset each frame) */
      this.stagePressed = false;
      this.mapPressed = false;
      this.escPressed = false;
      this.warpUpPressed = false;
      this.warpDownPressed = false;
      /** Time warp: index into WARP_LEVELS.
       *  ≤10×  → many small PHYSICS_DT steps per frame.
       *  ≥100× → one large step (warpFactor/60 s) per frame; thrust disabled. */
      this.WARP_LEVELS = [1, 5, 10, 100, 1e3, 1e4];
      this.warpIndex = 0;
      // ── Message overlay state ──────────────────────────────────────────────────
      this.showMessage = false;
      this.messageTitle = "";
      this.messageBody = "";
      this.messageBtn = "";
      this.messageAction = null;
      // ── Cheat menu ────────────────────────────────────────────────────────────
      this.cheatOpen = false;
      this.cheatUnlimFuel = false;
      this.ctx = null;
      /** Bounding boxes of cheat menu buttons (rebuilt each render) */
      this._cheatBtns = [];
      this.canvas = canvas2;
      const ctx = canvas2.getContext("2d");
      if (!ctx)
        throw new Error("Canvas 2D context not available.");
      this.ctx = ctx;
      this.atmo = new Atmosphere();
      this.physics = new PhysicsEngine(this.atmo);
      this.rocket = new Rocket();
      this.renderer = new Renderer(ctx);
      this.ui = new UI(ctx, this.renderer);
      this.mapView = new MapView(ctx, this.atmo);
      this._bindInput();
    }
    // ─── Lifecycle ─────────────────────────────────────────────────────────────
    init() {
      this._resize();
      window.addEventListener("resize", () => this._resize());
    }
    /** Main loop — called by requestAnimationFrame */
    loop(timestamp) {
      if (this.lastTime < 0)
        this.lastTime = timestamp;
      const rawDt = Math.min((timestamp - this.lastTime) / 1e3, 0.1);
      this.lastTime = timestamp;
      this.wallTime += rawDt;
      this.renderer.time = this.wallTime;
      this._processInput(rawDt);
      switch (this.screen) {
        case 0 /* MAIN_MENU */:
          this._updateMainMenu();
          break;
        case 1 /* OPTIONS */:
          this._updateOptions();
          break;
        case 2 /* VAB */:
          this._updateVAB();
          break;
        case 3 /* STAGING */:
          this._updateStaging();
          break;
        case 4 /* FLIGHT */:
          this._updateFlight(rawDt);
          break;
        case 6 /* TUTORIAL_SELECT */:
          this._updateTutorialSelect();
          break;
        default:
          break;
      }
      if (this.tutorial.isActive) {
        const tutCtx = {
          screen: this.screen,
          frame: this.physics.lastFrame,
          rocket: this.rocket,
          throttle: this.throttle,
          missionTime: this.physics.missionTime
        };
        this.tutorial.tick(tutCtx, rawDt);
        if (this.screen !== 0 /* MAIN_MENU */ && this.screen !== 6 /* TUTORIAL_SELECT */) {
          this.ui.renderTutorialOverlay(this.tutorial);
        }
      }
      if (this.showMessage && this.messageAction) {
        this.ui.renderMessage(this.messageTitle, this.messageBody, this.messageBtn, this.messageAction);
      }
      if (this.cheatOpen)
        this._renderCheatMenu();
    }
    // ─── Screen Update Methods ─────────────────────────────────────────────────
    _updateMainMenu() {
      this.ui.renderMainMenu(
        this.wallTime,
        () => this._switchTo(2 /* VAB */),
        () => this._switchTo(6 /* TUTORIAL_SELECT */),
        () => this._switchTo(1 /* OPTIONS */),
        () => {
        }
      );
    }
    _updateTutorialSelect() {
      this.ui.renderTutorialSelect(
        TUTORIAL_SCENARIOS,
        this.tutorial.completedIds,
        (idx) => {
          this.tutorial.start(idx);
          this._switchTo(2 /* VAB */);
        },
        () => this._switchTo(0 /* MAIN_MENU */)
      );
    }
    _updateOptions() {
      const onBack = this._fromPausedFlight ? () => {
        this._fromPausedFlight = false;
        this._switchTo(4 /* FLIGHT */);
      } : () => this._switchTo(0 /* MAIN_MENU */);
      this.ui.renderOptions(this.advancedDebug, onBack);
    }
    _updateVAB() {
      this.ui.renderVAB(
        this.rocket,
        () => this._launchRocket(),
        () => this._switchTo(3 /* STAGING */),
        () => this._switchTo(0 /* MAIN_MENU */)
      );
    }
    _updateStaging() {
      this.ui.renderStaging(
        this.rocket,
        () => this._switchTo(2 /* VAB */),
        // confirm → back to VAB for now
        () => this._switchTo(2 /* VAB */)
      );
    }
    _updateFlight(rawDt) {
      const warpFactor = this.WARP_LEVELS[this.warpIndex];
      const highWarp = warpFactor >= 100;
      if (this.isPaused) {
      } else if (highWarp) {
        this.rocket.throttle = 0;
        this.throttle = 0;
        this.rocket.body.mass = this.rocket.getTotalMass();
        this.physics.stepWarp(this.rocket.body, warpFactor / 60);
        if (!isFinite(this.rocket.body.pos.x) || !isFinite(this.rocket.body.pos.y)) {
          this.rocket.body.pos.x = 0;
          this.rocket.body.pos.y = R_EARTH + 1;
          this.rocket.body.vel.x = 0;
          this.rocket.body.vel.y = 0;
          this.warpIndex = 0;
        }
      } else {
        this.accumulator += rawDt * warpFactor;
        const maxSteps = MAX_PHYSICS_STEPS * warpFactor;
        let steps = 0;
        while (this.accumulator >= PHYSICS_DT && steps < maxSteps) {
          this.rocket.body.mass = this.rocket.getTotalMass();
          this.physics.step(this.rocket.body, this.rocket, PHYSICS_DT);
          this.accumulator -= PHYSICS_DT;
          steps++;
        }
        if (this.accumulator > PHYSICS_DT * maxSteps) {
          this.accumulator = 0;
        }
      }
      if (!this.isPaused) {
        if (this.cheatUnlimFuel) {
          for (const part of this.rocket.parts) {
            if (part.def.maxFuelMass > 0) {
              part.fuelRemaining = part.def.maxFuelMass;
            }
          }
          this.rocket.body.mass = this.rocket.getTotalMass();
        }
        this.mapView.tick(this.rocket, this.physics.missionTime);
        this._checkFlightEvents();
      }
      const frame = this.physics.lastFrame;
      if (this.isMapOpen) {
        this.renderer.renderFlight(this.rocket, frame, this.throttle, this.physics.missionTime, this.advancedDebug);
        this.mapView.render(this.rocket, this.wallTime, this.physics.missionTime, () => {
          this.isMapOpen = false;
        });
      } else {
        this.renderer.renderFlight(this.rocket, frame, this.throttle, this.physics.missionTime, this.advancedDebug);
        this.renderer.renderHUD(
          this.rocket,
          frame,
          this.throttle,
          this.rocket.currentStage,
          this.physics.missionTime,
          warpFactor
        );
        this.renderer.renderBurnGuidance(this.rocket, this.mapView.node, this.physics.missionTime, this.mapView.dvRemaining);
      }
      if (this.isPaused && !this.isMapOpen) {
        this.ui.renderPauseMenu(
          () => {
            this.isPaused = false;
          },
          () => {
            this._fromPausedFlight = true;
            this._switchTo(1 /* OPTIONS */);
          },
          () => {
            this.isPaused = false;
            this._switchTo(0 /* MAIN_MENU */);
          }
        );
      }
    }
    // ─── Input Processing ──────────────────────────────────────────────────────
    _processInput(dt) {
      if (this.screen !== 4 /* FLIGHT */)
        return;
      if (this.escPressed) {
        this.escPressed = false;
        if (this.isMapOpen) {
          this.isMapOpen = false;
        } else {
          this.isPaused = !this.isPaused;
        }
      }
      if (this.isPaused)
        return;
      if (this.input.throttleUp)
        this.throttle = Math.min(1, this.throttle + THROTTLE_RATE * dt);
      if (this.input.throttleDown)
        this.throttle = Math.max(0, this.throttle - THROTTLE_RATE * dt);
      if (!this.isMapOpen && this.warpIndex === 0) {
        if (this.input.rotateLeft) {
          this.physics.applyRotation(this.rocket.body, -1, dt, this.rocket.hasCommandPod);
        }
        if (this.input.rotateRight) {
          this.physics.applyRotation(this.rocket.body, 1, dt, this.rocket.hasCommandPod);
        }
      }
      const node = this.mapView.node;
      const warpFactor = this.WARP_LEVELS[this.warpIndex];
      if (node && this.rocket.hasCommandPod) {
        const vel = this.rocket.body.vel;
        const pos = this.rocket.body.pos;
        const speed = Math.hypot(vel.x, vel.y);
        const posLen = Math.hypot(pos.x, pos.y);
        const prograde = speed > 1 ? { x: vel.x / speed, y: vel.y / speed } : { x: 0, y: 1 };
        const radialOut = posLen > 0 ? { x: pos.x / posLen, y: pos.y / posLen } : { x: 0, y: 1 };
        const burnX = node.progradeDV * prograde.x + node.normalDV * radialOut.x;
        const burnY = node.progradeDV * prograde.y + node.normalDV * radialOut.y;
        const burnLen = Math.hypot(burnX, burnY);
        let aligned = false;
        if (burnLen > 0.1) {
          const desiredAngle = Math.atan2(burnX, burnY);
          let angleDiff = desiredAngle - this.rocket.body.angle;
          while (angleDiff > Math.PI)
            angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI)
            angleDiff += 2 * Math.PI;
          aligned = Math.abs(angleDiff) < 0.087;
          if (this.warpIndex > 0) {
            this.rocket.body.angle = desiredAngle;
            this.rocket.body.angVel = 0;
            aligned = true;
          } else if (!this.input.rotateLeft && !this.input.rotateRight) {
            if (Math.abs(angleDiff) > 5e-3) {
              const alpha = this.physics.getRotationAlpha(
                this.rocket.body,
                this.rocket.hasCommandPod
              );
              const maxAngVel = Math.sqrt(2 * alpha * 0.04) * 0.8;
              const desiredAngVel = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff) * 8, maxAngVel);
              const velError = desiredAngVel - this.rocket.body.angVel;
              const dir = Math.max(-1, Math.min(1, velError * 3 / maxAngVel));
              this.physics.applyRotation(this.rocket.body, dir, dt, this.rocket.hasCommandPod);
            } else {
              this.rocket.body.angVel *= Math.pow(0.5, dt * 60);
            }
          }
        }
        const dvRem = this.mapView.dvRemaining;
        if (dvRem !== null && warpFactor < 100) {
          if (dvRem < 0.5) {
            this.throttle = 0;
            this.mapView.node = null;
          } else if (aligned) {
            this.throttle = Math.min(1, dvRem / 10);
          } else {
            this.throttle = 0;
          }
        }
      }
      if (this.warpUpPressed) {
        this.warpUpPressed = false;
        this.warpIndex = Math.min(this.warpIndex + 1, this.WARP_LEVELS.length - 1);
      }
      if (this.warpDownPressed) {
        this.warpDownPressed = false;
        this.warpIndex = Math.max(this.warpIndex - 1, 0);
      }
      this.rocket.throttle = this.throttle;
      if (this.stagePressed) {
        this.stagePressed = false;
        this.rocket.activateNextStage();
        if (this.rocket.pendingSeparationDV > 0) {
          const noseX = Math.sin(this.rocket.body.angle);
          const noseY = Math.cos(this.rocket.body.angle);
          this.rocket.body.vel.x += noseX * this.rocket.pendingSeparationDV;
          this.rocket.body.vel.y += noseY * this.rocket.pendingSeparationDV;
          this.rocket.pendingSeparationDV = 0;
        }
      }
      if (this.mapPressed) {
        this.mapPressed = false;
        this.isMapOpen = !this.isMapOpen;
        if (this.isMapOpen)
          this.mapView.resetView();
      }
    }
    // ─── Flight Events ─────────────────────────────────────────────────────────
    _checkFlightEvents() {
      const { lastFrame } = this.physics;
      if (!this.rocket.hasLaunched && lastFrame.altitude > 10) {
        this.rocket.hasLaunched = true;
      }
      if (lastFrame.altitude < 5 && lastFrame.verticalSpeed <= 0 && this.rocket.hasLaunched) {
        const speed = lastFrame.speed;
        if (speed < 10) {
          this._showMessage(
            "MISSION COMPLETE",
            "Rocket landed safely!",
            "OK",
            () => {
              this.showMessage = false;
              this._switchTo(0 /* MAIN_MENU */);
            }
          );
        } else if (speed > 200) {
          this.rocket.isDestroyed = true;
          this._showMessage(
            "ROCKET DESTROYED",
            `Crashed at ${speed.toFixed(0)} m/s`,
            "OK",
            () => {
              this.showMessage = false;
              this._switchTo(0 /* MAIN_MENU */);
            }
          );
        }
      }
      if (!this.rocket.isDestroyed && this.rocket.hasDestroyedCriticalPart) {
        this.rocket.isDestroyed = true;
        this._showMessage(
          "ROCKET DESTROYED",
          "Critical part burned through!",
          "OK",
          () => {
            this.showMessage = false;
            this._switchTo(0 /* MAIN_MENU */);
          }
        );
      }
    }
    // ─── Launch ────────────────────────────────────────────────────────────────
    _launchRocket() {
      if (this.rocket.parts.length === 0) {
        this._showMessage("NO ROCKET", "Build a rocket first!", "OK", () => {
          this.showMessage = false;
        });
        return;
      }
      if (this.rocket.stages.length === 0) {
        this.rocket.autoStage();
      }
      this.rocket.placeOnLaunchpad();
      this.physics.reset();
      this.throttle = 0;
      this.isMapOpen = false;
      this.accumulator = 0;
      this.showMessage = false;
      this.warpIndex = 0;
      this.isPaused = false;
      this._fromPausedFlight = false;
      this._switchTo(4 /* FLIGHT */);
    }
    // ─── Helpers ───────────────────────────────────────────────────────────────
    _switchTo(screen) {
      this.screen = screen;
      if (screen === 2 /* VAB */) {
      }
    }
    _showMessage(title, body, btn, action) {
      if (this.showMessage)
        return;
      this.messageTitle = title;
      this.messageBody = body;
      this.messageBtn = btn;
      this.messageAction = action;
      this.showMessage = true;
    }
    _resize() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      this.canvas.width = W;
      this.canvas.height = H;
      this.renderer.resize(W, H);
      this.ui.resize(W, H);
      this.mapView.resize(W, H);
    }
    // ─── Input Binding ─────────────────────────────────────────────────────────
    _bindInput() {
      window.addEventListener("keydown", (e) => {
        switch (e.code) {
          case "ShiftLeft":
          case "ShiftRight":
            this.input.throttleUp = true;
            break;
          case "ControlLeft":
          case "ControlRight":
            this.input.throttleDown = true;
            break;
          case "KeyZ":
            this.throttle = 1;
            break;
          case "KeyX":
            this.throttle = 0;
            break;
          case "KeyA":
          case "ArrowLeft":
            this.input.rotateLeft = true;
            break;
          case "KeyD":
          case "ArrowRight":
            this.input.rotateRight = true;
            break;
          case "Space":
            e.preventDefault();
            this.stagePressed = true;
            break;
          case "KeyM":
            this.mapPressed = true;
            break;
          case "Comma":
            this.warpDownPressed = true;
            break;
          case "Period":
            this.warpUpPressed = true;
            break;
          case "F1":
            if (e.ctrlKey) {
              e.preventDefault();
              this.cheatOpen = !this.cheatOpen;
            }
            break;
          case "Escape":
            if (this.cheatOpen) {
              this.cheatOpen = false;
            } else if (this.screen === 2 /* VAB */) {
              this.ui.cancelVABGhost();
            } else {
              this.escPressed = true;
            }
            break;
        }
      });
      window.addEventListener("keyup", (e) => {
        switch (e.code) {
          case "ShiftLeft":
          case "ShiftRight":
            this.input.throttleUp = false;
            break;
          case "ControlLeft":
          case "ControlRight":
            this.input.throttleDown = false;
            break;
          case "KeyA":
          case "ArrowLeft":
            this.input.rotateLeft = false;
            break;
          case "KeyD":
          case "ArrowRight":
            this.input.rotateRight = false;
            break;
        }
      });
      this.canvas.addEventListener("mousemove", (e) => {
        const mx = e.clientX, my = e.clientY;
        this.ui.mouseX = mx;
        this.ui.mouseY = my;
        if (this.screen === 2 /* VAB */)
          this.ui.handleVABMouseMove(mx, my);
        if (this.isMapOpen)
          this.mapView.handleMouseMove(mx, my);
      });
      this.canvas.addEventListener("mousedown", (e) => {
        if (this.isMapOpen)
          this.mapView.handleMouseDown(e.clientX, e.clientY);
      });
      this.canvas.addEventListener("mouseup", () => {
        if (this.isMapOpen)
          this.mapView.handleMouseUp();
      });
      this.canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (this.screen === 2 /* VAB */) {
          this.ui.handleVABRightClick(e.clientX, e.clientY, this.rocket);
        }
      });
      this.canvas.addEventListener("wheel", (e) => {
        if (this.isMapOpen) {
          e.preventDefault();
          this.mapView.handleWheel(e);
        } else if (this.screen === 2 /* VAB */) {
          e.preventDefault();
          this.ui.handleVABScroll(e.clientX, e.clientY, e.deltaY);
        }
      }, { passive: false });
      this.canvas.addEventListener("click", (e) => {
        const mx = e.clientX, my = e.clientY;
        if (this.cheatOpen) {
          for (const btn of this._cheatBtns) {
            if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
              btn.action();
            }
          }
          return;
        }
        if (this.showMessage && this.messageAction) {
          this.ui.handleMessageClick(mx, my, this.messageAction);
          return;
        }
        if (this.tutorial.isActive && this.screen !== 0 /* MAIN_MENU */ && this.screen !== 6 /* TUTORIAL_SELECT */) {
          const acted = this.ui.handleTutorialOverlayClick(mx, my, this.tutorial);
          if (acted) {
            if (this.tutorial.scenarioDone) {
              this.tutorial.stop();
              this._switchTo(6 /* TUTORIAL_SELECT */);
            } else {
              this.tutorial.stop();
            }
            return;
          }
        }
        switch (this.screen) {
          case 0 /* MAIN_MENU */:
            this.ui.handleMainMenuClick(
              mx,
              my,
              () => this._switchTo(2 /* VAB */),
              () => this._switchTo(6 /* TUTORIAL_SELECT */),
              () => this._switchTo(1 /* OPTIONS */),
              () => {
              }
            );
            break;
          case 6 /* TUTORIAL_SELECT */:
            this.ui.handleTutorialSelectClick(
              mx,
              my,
              TUTORIAL_SCENARIOS,
              (idx) => {
                this.tutorial.start(idx);
                this._switchTo(2 /* VAB */);
              },
              () => this._switchTo(0 /* MAIN_MENU */)
            );
            break;
          case 1 /* OPTIONS */: {
            const optBack = this._fromPausedFlight ? () => {
              this._fromPausedFlight = false;
              this._switchTo(4 /* FLIGHT */);
            } : () => this._switchTo(0 /* MAIN_MENU */);
            this.ui.handleOptionsClick(mx, my, optBack, (v) => {
              this.advancedDebug = v;
            }, this.advancedDebug);
            break;
          }
          case 2 /* VAB */:
            this.ui.handleVABClick(
              mx,
              my,
              this.rocket,
              () => this._launchRocket(),
              () => this._switchTo(3 /* STAGING */),
              () => this._switchTo(0 /* MAIN_MENU */)
            );
            break;
          case 3 /* STAGING */:
            this.ui.handleStagingClick(
              mx,
              my,
              this.rocket,
              () => this._switchTo(2 /* VAB */),
              () => this._switchTo(2 /* VAB */)
            );
            break;
          case 4 /* FLIGHT */:
            if (this.isPaused && !this.isMapOpen) {
              this.ui.handlePauseClick(
                mx,
                my,
                () => {
                  this.isPaused = false;
                },
                () => {
                  this._fromPausedFlight = true;
                  this._switchTo(1 /* OPTIONS */);
                },
                () => {
                  this.isPaused = false;
                  this._switchTo(0 /* MAIN_MENU */);
                }
              );
            } else if (this.isMapOpen) {
              this.mapView.handleClick(mx, my);
            } else {
              const wd = this.renderer.warpDownBtn;
              const wu = this.renderer.warpUpBtn;
              if (mx >= wd.x && mx <= wd.x + wd.w && my >= wd.y && my <= wd.y + wd.h) {
                this.warpIndex = Math.max(this.warpIndex - 1, 0);
              } else if (mx >= wu.x && mx <= wu.x + wu.w && my >= wu.y && my <= wu.y + wu.h) {
                this.warpIndex = Math.min(this.warpIndex + 1, this.WARP_LEVELS.length - 1);
              }
            }
            break;
        }
      });
    }
    // ─── Cheat Menu ────────────────────────────────────────────────────────────
    _renderCheatMenu() {
      const ctx = this.ctx;
      if (!ctx)
        return;
      const W = this.canvas.width;
      const H = this.canvas.height;
      this._cheatBtns = [];
      const pw = 340, ph = 280;
      const px = Math.round((W - pw) / 2);
      const py = Math.round((H - ph) / 2);
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#050d18";
      this._cheatRoundRect(ctx, px, py, pw, ph, 8);
      ctx.fill();
      ctx.strokeStyle = "#ff4444";
      ctx.lineWidth = 1.5;
      this._cheatRoundRect(ctx, px, py, pw, ph, 8);
      ctx.stroke();
      ctx.fillStyle = "#ff4444";
      ctx.font = "bold 15px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("\u26A0  DEBUG / CHEAT MENU  \u26A0", px + pw / 2, py + 24);
      ctx.fillStyle = "rgba(255,68,68,0.5)";
      ctx.fillRect(px + 12, py + 32, pw - 24, 1);
      ctx.fillStyle = "#4a6080";
      ctx.font = "10px Courier New";
      ctx.fillText("Ctrl+F1 or Esc to close", px + pw / 2, py + 46);
      const bw = pw - 40, bh = 38, bx = px + 20;
      const gap = 12;
      let by = py + 60;
      const addBtn = (label, active, action) => {
        const hovering = this.ui.mouseX >= bx && this.ui.mouseX <= bx + bw && this.ui.mouseY >= by && this.ui.mouseY <= by + bh;
        ctx.fillStyle = active === true ? "rgba(0,200,80,0.18)" : active === false ? "rgba(80,20,20,0.35)" : hovering ? "rgba(0,100,180,0.30)" : "rgba(10,20,40,0.80)";
        this._cheatRoundRect(ctx, bx, by, bw, bh, 5);
        ctx.fill();
        const borderCol = active === true ? "#00cc55" : active === false ? "#883333" : hovering ? "#0088cc" : "#1e3a5f";
        ctx.strokeStyle = borderCol;
        ctx.lineWidth = hovering ? 1.5 : 1;
        this._cheatRoundRect(ctx, bx, by, bw, bh, 5);
        ctx.stroke();
        ctx.fillStyle = active === true ? "#44ff88" : hovering ? "#88ccff" : "#c8d8e8";
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "left";
        ctx.fillText(label, bx + 14, by + bh / 2 + 4);
        if (active !== null) {
          const tag = active ? "\u25CF ON" : "\u25CB OFF";
          ctx.fillStyle = active ? "#44ff88" : "#664444";
          ctx.font = "bold 11px Courier New";
          ctx.textAlign = "right";
          ctx.fillText(tag, bx + bw - 14, by + bh / 2 + 4);
        }
        this._cheatBtns.push({ label, x: bx, y: by, w: bw, h: bh, action });
        by += bh + gap;
      };
      addBtn(
        "UNLIMITED FUEL",
        this.cheatUnlimFuel,
        () => {
          this.cheatUnlimFuel = !this.cheatUnlimFuel;
        }
      );
      addBtn(
        "TELEPORT \u2192 LOW EARTH ORBIT  (250 km)",
        null,
        () => {
          this._cheatTeleportEarthOrbit();
          this.cheatOpen = false;
        }
      );
      addBtn(
        "TELEPORT \u2192 LUNAR ORBIT  (100 km)",
        null,
        () => {
          this._cheatTeleportLunarOrbit();
          this.cheatOpen = false;
        }
      );
      addBtn(
        "REFILL ALL TANKS",
        null,
        () => {
          for (const p of this.rocket.parts) {
            if (p.def.maxFuelMass > 0)
              p.fuelRemaining = p.def.maxFuelMass;
          }
          this.rocket.body.mass = this.rocket.getTotalMass();
        }
      );
      addBtn(
        "CLOSE",
        null,
        () => {
          this.cheatOpen = false;
        }
      );
      ctx.fillStyle = "#1e2a3a";
      ctx.font = "9px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("For testing purposes only. Use responsibly.", px + pw / 2, py + ph - 10);
    }
    _cheatTeleportEarthOrbit() {
      const alt = 25e4;
      const r = R_EARTH + alt;
      const v = Math.sqrt(MU_EARTH / r);
      this.rocket.body.pos = { x: 0, y: r };
      this.rocket.body.vel = { x: v, y: 0 };
      this.rocket.body.angle = 0;
      this.rocket.body.angVel = 0;
      this.rocket.body.mass = this.rocket.getTotalMass();
      this.rocket.hasLaunched = true;
      this.rocket.isDestroyed = false;
      this.accumulator = 0;
      this.isMapOpen = false;
      this.warpIndex = 0;
      this._switchTo(4 /* FLIGHT */);
    }
    _cheatTeleportLunarOrbit() {
      const alt = 1e5;
      const r = R_MOON + alt;
      const v = Math.sqrt(MU_MOON / r);
      const moonPos = getMoonPosition(this.physics.missionTime);
      const moonVel = getMoonVelocity(this.physics.missionTime);
      this.rocket.body.pos = { x: moonPos.x, y: moonPos.y + r };
      this.rocket.body.vel = { x: moonVel.x + v, y: moonVel.y };
      this.rocket.body.angle = 0;
      this.rocket.body.angVel = 0;
      this.rocket.body.mass = this.rocket.getTotalMass();
      this.rocket.hasLaunched = true;
      this.rocket.isDestroyed = false;
      this.accumulator = 0;
      this.isMapOpen = false;
      this.warpIndex = 0;
      this._switchTo(4 /* FLIGHT */);
    }
    _cheatRoundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
  };

  // src/main.ts
  var canvas = document.getElementById("game");
  if (!canvas) {
    throw new Error('Could not find <canvas id="game"> element in the DOM.');
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var game = new Game(canvas);
  game.init();
  var cvs = canvas;
  var _crashed = false;
  function loop(timestamp) {
    if (_crashed)
      return;
    try {
      game.loop(timestamp);
    } catch (err) {
      _crashed = true;
      console.error("[Antigravity] Unhandled exception in game loop:", err);
      const ctx = cvs.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        ctx.fillStyle = "#ff4444";
        ctx.font = "bold 22px Courier New";
        ctx.textAlign = "center";
        ctx.fillText("RUNTIME ERROR \u2014 see browser console", cvs.width / 2, cvs.height / 2 - 16);
        ctx.fillStyle = "#aaa";
        ctx.font = "14px Courier New";
        const msg = err instanceof Error ? err.message : String(err);
        ctx.fillText(msg.slice(0, 120), cvs.width / 2, cvs.height / 2 + 16);
        ctx.fillStyle = "#666";
        ctx.font = "12px Courier New";
        ctx.fillText("Reload the page to restart.", cvs.width / 2, cvs.height / 2 + 42);
      }
      return;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
})();
//# sourceMappingURL=bundle.js.map
