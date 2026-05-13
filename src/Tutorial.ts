/**
 * Tutorial.ts — Scenario definitions and TutorialManager.
 *
 * Each scenario is a sequence of TutorialSteps.  A step is complete when its
 * `check` function returns true.  TutorialManager.tick() advances the step
 * index automatically and signals the UI via `flashTimer` / `scenarioDone`.
 */

import { GameScreen, PartType } from './types';
import { isEnginePart, isDecouplerPart } from './Part';
import { Rocket } from './Rocket';
import { PhysicsFrame } from './Physics';

// ─── Re-declare orbital constants (avoids circular import) ───────────────────

const G       = 6.674e-11;
const M_EARTH = 5.972e24;
const R_EARTH = 6_371_000;

// ─── Context passed to every step's check() ──────────────────────────────────

export interface TutorialCtx {
  screen:      GameScreen;
  frame:       PhysicsFrame;
  rocket:      Rocket;
  throttle:    number;
  missionTime: number;
}

// ─── Step and Scenario types ─────────────────────────────────────────────────

export interface TutorialStep {
  title: string;
  body:  string;
  hint?: string;
  check: (ctx: TutorialCtx) => boolean;
}

export interface TutorialScenario {
  id:       string;
  title:    string;
  subtitle: string;
  icon:     string;
  steps:    TutorialStep[];
}

// ─── Orbital helpers ──────────────────────────────────────────────────────────

/** Compute keplerian apoapsis/periapsis altitudes above Earth surface (metres).
 *  Returns Infinity for ap if trajectory is hyperbolic. */
function earthOrbit(ctx: TutorialCtx): { ap: number; pe: number } {
  const body = ctx.rocket.body;
  const mu   = G * M_EARTH;
  const r    = Math.hypot(body.pos.x, body.pos.y);
  const v2   = body.vel.x ** 2 + body.vel.y ** 2;
  const eps  = v2 / 2 - mu / r;
  if (eps >= 0) return { ap: Infinity, pe: r - R_EARTH };
  const a  = -mu / (2 * eps);
  const h  = body.pos.x * body.vel.y - body.pos.y * body.vel.x;
  const e  = Math.sqrt(Math.max(0, 1 - (h * h) / (mu * a)));
  return {
    ap: a * (1 + e) - R_EARTH,
    pe: a * (1 - e) - R_EARTH,
  };
}

function hasPod(ctx: TutorialCtx): boolean {
  return ctx.rocket.parts.some(
    p => p.def.type === PartType.COMMAND_POD || p.def.type === PartType.COMMAND_POD_ADV,
  );
}
function hasTank(ctx: TutorialCtx): boolean {
  return ctx.rocket.parts.some(p => p.def.maxFuelMass > 0);
}
function hasEngine(ctx: TutorialCtx): boolean {
  return ctx.rocket.parts.some(p => isEnginePart(p.def.type));
}
function hasDecoupler(ctx: TutorialCtx): boolean {
  return ctx.rocket.parts.some(p => isDecouplerPart(p.def.type));
}
function hasStagingSet(ctx: TutorialCtx): boolean {
  return ctx.rocket.parts.some(p => isEnginePart(p.def.type) && p.stageIndex >= 0);
}
function tankCount(ctx: TutorialCtx): number {
  return ctx.rocket.parts.filter(p => p.def.maxFuelMass > 0).length;
}
function inFlight(ctx: TutorialCtx): boolean {
  return ctx.screen === GameScreen.FLIGHT;
}
function inVAB(ctx: TutorialCtx): boolean {
  return ctx.screen === GameScreen.VAB || ctx.screen === GameScreen.STAGING;
}

// ─── Scenario Definitions ────────────────────────────────────────────────────

export const TUTORIAL_SCENARIOS: TutorialScenario[] = [

  // ── Scenario 1 ─────────────────────────────────────────────────────────────
  {
    id:       'first_launch',
    title:    'First Launch',
    subtitle: 'Build and launch your very first rocket.',
    icon:     '🚀',
    steps: [
      {
        title: 'Welcome to Antigravity!',
        body:  'This tutorial walks you through your first rocket launch.\nFrom the main menu, click START GAME to open the Vehicle Assembly Building (VAB).',
        check: ctx => ctx.screen !== GameScreen.MAIN_MENU && ctx.screen !== GameScreen.TUTORIAL_SELECT,
      },
      {
        title: 'Build Your Rocket',
        body:  'Click the Mk1 Command Pod in the parts list on the left, then click in the centre build area to place it.\nNext add an FL-T400 Fuel Tank below the pod, then an LV-T30 Booster engine at the bottom.',
        hint:  'Click a part to pick it up — a dashed line shows where it will snap to.',
        check: ctx => inVAB(ctx) && hasPod(ctx) && hasTank(ctx) && hasEngine(ctx),
      },
      {
        title: 'Set Up Staging',
        body:  'Click STAGING in the right panel. Click the coloured badge next to your engine to assign it to Stage 0.\nOr just click AUTO-STAGE — it does it for you!',
        hint:  'Stage 0 fires first when you press SPACE during flight.',
        check: ctx => hasStagingSet(ctx),
      },
      {
        title: 'Launch!',
        body:  'Click LAUNCH. Once on the pad:\n  W (or Shift)  → throttle up to full\n  SPACE         → activate Stage 0\nClimb to 1,000 m to complete this tutorial!',
        hint:  'Keep throttle at 100 % for maximum thrust off the pad.',
        check: ctx => inFlight(ctx) && ctx.frame.altitude > 1_000,
      },
    ],
  },

  // ── Scenario 2 ─────────────────────────────────────────────────────────────
  {
    id:       'break_the_sky',
    title:    'Breaking the Sky',
    subtitle: 'Reach the Kármán Line — 100 km altitude.',
    icon:     '🌤',
    steps: [
      {
        title: 'Build a Capable Rocket',
        body:  'You need more fuel this time. Add a Command Pod, at least 2 FL-T800 tanks, and an LV-T30 engine.\nCheck the stats panel on the right — aim for ΔV > 5,000 m/s.',
        hint:  'Stacking tanks increases ΔV. More tanks = more range.',
        check: ctx => inVAB(ctx) && tankCount(ctx) >= 2 && hasEngine(ctx),
      },
      {
        title: 'Lift Off!',
        body:  'Launch and climb straight up to 1 km with throttle fully open (W key).',
        check: ctx => inFlight(ctx) && ctx.frame.altitude > 1_000,
      },
      {
        title: 'Gravity Turn',
        body:  'At 1 km start tilting east — press D (or Right Arrow) and hold it for a few seconds.\nA gravity turn saves huge amounts of fuel vs flying straight up.',
        hint:  'Aim for about 45° from vertical by the time you hit 10 km.',
        check: ctx => inFlight(ctx) && ctx.frame.altitude > 30_000,
      },
      {
        title: 'Reach the Kármán Line',
        body:  'Keep burning! Stage when fuel runs out (SPACE key).\nThe atmosphere ends at 70 km — reach 100 km to complete this scenario.',
        hint:  'If you run short of fuel, add more tanks or a second stage next time.',
        check: ctx => inFlight(ctx) && ctx.frame.altitude > 100_000,
      },
    ],
  },

  // ── Scenario 3 ─────────────────────────────────────────────────────────────
  {
    id:       'orbit_earth',
    title:    'Orbit the Earth',
    subtitle: 'Achieve a stable orbit above 70 km.',
    icon:     '🌍',
    steps: [
      {
        title: 'Build an Orbital Rocket',
        body:  'You need two stages and ~9,000 m/s total ΔV.\nSuggested build: Pod / FL-T800 / LV-909 / Decoupler / FL-T800 × 2 / LV-T30.\nA booster (LV-T30) is required to lift off — the Terrier cannot launch from the pad.',
        hint:  'Check the VAB stats: ΔV > 7,500 m/s AND launch TWR > 1.2 required.',
        check: ctx => {
          if (inVAB(ctx)) {
            // Require a proper booster (sea-level TWR > 1.2), enough ΔV, and staging
            const totalMass = ctx.rocket.getTotalMass();
            const slThrust  = ctx.rocket.parts
              .filter(p => isEnginePart(p.def.type))
              .reduce((s, p) => s + p.def.maxThrust * p.def.thrustSL, 0);
            const launchTWR = totalMass > 0 ? slThrust / (totalMass * 9.81) : 0;
            return ctx.rocket.getDeltaV() > 7_500 && launchTWR > 1.2 && hasDecoupler(ctx);
          }
          return inFlight(ctx);
        },
      },
      {
        title: 'Gravity Turn and Climb',
        body:  'After launch, pitch east at ~1 km and follow a shallow arc.\nKeep throttle at 100 % and aim to be nearly horizontal (>80°) by 60 km.',
        check: ctx => inFlight(ctx) && ctx.frame.altitude > 20_000,
      },
      {
        title: 'Push Apoapsis Above 80 km',
        body:  'Keep burning until your apoapsis (Ap) is above 80 km, then cut engines and coast.\nPress M to open the map view — it shows your predicted orbit arc.',
        hint:  'Cut engines as soon as Ap reaches your target; burning further wastes fuel.',
        check: ctx => {
          if (!inFlight(ctx)) return false;
          return earthOrbit(ctx).ap > 80_000;
        },
      },
      {
        title: 'Coast to Apoapsis',
        body:  'Engines off — coast up to your highest point.\nUse time warp [ / ] keys to speed up the wait.',
        check: ctx => inFlight(ctx) && ctx.frame.altitude > 70_000
                   && Math.abs(ctx.frame.verticalSpeed) < 600,
      },
      {
        title: 'Circularise!',
        body:  'At apoapsis, point prograde (nose in your direction of travel) and burn.\nStop when your periapsis (Pe) is above 70 km — you are in orbit!',
        hint:  'Prograde = the direction your rocket is already moving horizontally.',
        check: ctx => {
          if (!inFlight(ctx)) return false;
          const { pe } = earthOrbit(ctx);
          return pe > 65_000 && ctx.frame.altitude > 65_000;
        },
      },
    ],
  },

  // ── Scenario 4 ─────────────────────────────────────────────────────────────
  {
    id:       'to_the_moon',
    title:    'To the Moon',
    subtitle: 'Leave Earth orbit and enter lunar space.',
    icon:     '🌕',
    steps: [
      {
        title: 'Achieve Earth Orbit First',
        body:  'Get into a stable orbit above 70 km before heading to the Moon.\nYou also need spare ΔV for the Trans-Lunar Injection burn (~3,200 m/s).',
        hint:  'Use an LV-1 Condor or LV-N Nerva upper stage for the best efficiency in space.',
        check: ctx => {
          if (!inFlight(ctx)) return false;
          return earthOrbit(ctx).pe > 65_000;
        },
      },
      {
        title: 'Plan a Trans-Lunar Injection (TLI)',
        body:  'Open the map (M) and watch the Moon\'s position.\nWhen the Moon is about 60° ahead in its orbit, burn prograde until your Ap reaches ~384,000 km.',
        hint:  'Time warp is your friend here — press ] to speed up to ×1,000 or more.',
        check: ctx => {
          if (!inFlight(ctx)) return false;
          return earthOrbit(ctx).ap > 300_000_000 || ctx.frame.inMoonSOI;
        },
      },
      {
        title: 'Coast to the Moon',
        body:  'The journey takes days of in-game time — crank up the time warp.\nYou\'ll know you\'ve arrived when the HUD shows "ALT ☽".',
        hint:  'High time warp (×10,000) covers the 3-day trip quickly. Watch the map!',
        check: ctx => ctx.frame.inMoonSOI,
      },
      {
        title: 'You Reached the Moon!',
        body:  'You are now inside the Moon\'s sphere of influence.\nTo stay in lunar orbit, burn retrograde at closest approach to slow down (LOI burn).',
        hint:  'Without slowing down you\'ll swing around the Moon and drift back toward Earth.',
        check: ctx => ctx.frame.inMoonSOI && ctx.frame.altAboveNearest < 500_000,
      },
    ],
  },

  // ── Scenario 5 ─────────────────────────────────────────────────────────────
  {
    id:       'lunar_landing',
    title:    'Lunar Landing',
    subtitle: 'Land a rocket on the surface of the Moon.',
    icon:     '🌑',
    steps: [
      {
        title: 'Enter Lunar Orbit',
        body:  'Arrive at the Moon and slow down to be captured in orbit below 50 km.\nBurn retrograde at your closest approach to circularise.',
        check: ctx => {
          if (!inFlight(ctx) || !ctx.frame.inMoonSOI) return false;
          const { pe } = earthOrbit(ctx);   // Pe is relative to Moon body when in SOI
          return ctx.frame.altAboveNearest < 80_000 && ctx.frame.speed < 2_500;
        },
      },
      {
        title: 'Deorbit Burn',
        body:  'Burn retrograde to lower your periapsis until it intersects the lunar surface.\nA short -20 m/s burn is enough to start descending.',
        hint:  'Use the map view to see your updated trajectory after the burn.',
        check: ctx => inFlight(ctx) && ctx.frame.inMoonSOI && ctx.frame.altAboveNearest < 10_000,
      },
      {
        title: 'Powered Descent',
        body:  'Slow your descent by burning retrograde (engines pointing toward your direction of travel).\nAim to arrive at the surface with less than 10 m/s vertical speed.',
        hint:  'The Moon has no atmosphere — your engines are the only brake. Manage fuel carefully!',
        check: ctx => inFlight(ctx) && ctx.frame.inMoonSOI && ctx.frame.altAboveNearest < 300,
      },
      {
        title: 'Touchdown!',
        body:  'Land safely on the Moon. Under 8 m/s impact speed is considered a safe landing.',
        hint:  'Kill horizontal speed first, then descend slowly. Throttle down just before impact.',
        check: ctx => inFlight(ctx) && ctx.frame.inMoonSOI
                   && ctx.frame.altAboveNearest < 30 && ctx.frame.speed < 8,
      },
    ],
  },

  // ── Scenario 6 ─────────────────────────────────────────────────────────────
  {
    id:       'return_to_earth',
    title:    'Return to Earth',
    subtitle: 'Launch from the Moon and survive reentry.',
    icon:     '🌠',
    steps: [
      {
        title: 'Lift Off from the Moon',
        body:  'Launch from the lunar surface and achieve enough speed to escape the Moon\'s gravity.\nLunar escape velocity is ~2.4 km/s — point prograde and burn.',
        check: ctx => ctx.frame.inMoonSOI && ctx.frame.altAboveNearest > 5_000,
      },
      {
        title: 'Trans-Earth Injection',
        body:  'Once in lunar orbit, burn prograde to set your trajectory back toward Earth.\nYour perigee should drop below 50 km to enter the atmosphere.',
        hint:  'About 900 m/s of ΔV escapes the Moon. Use the map view to verify your path.',
        check: ctx => !ctx.frame.inMoonSOI && ctx.frame.altitude < 400_000_000,
      },
      {
        title: 'Reentry',
        body:  'You\'ll hit Earth\'s atmosphere at ~11 km/s — intense heating ahead!\nMake sure your heat shield is pointing retrograde (in the direction of travel).',
        hint:  'Watch the plasma effect — beautiful but deadly without a proper heat shield.',
        check: ctx => !ctx.frame.inMoonSOI && ctx.frame.altitude < 80_000 && ctx.frame.speed > 4_000,
      },
      {
        title: 'Splashdown!',
        body:  'Survive reentry and land safely on Earth.\nBelow 10 km the worst heat is behind you — slow to below 50 m/s.',
        hint:  'Heat shields deplete on use. Make sure yours isn\'t destroyed before reentry!',
        check: ctx => !ctx.frame.inMoonSOI && ctx.frame.altitude < 200 && ctx.frame.speed < 80,
      },
    ],
  },
];

// ─── Tutorial Manager ─────────────────────────────────────────────────────────

export class TutorialManager {
  scenarioIdx  = -1;
  stepIdx      = 0;
  isActive     = false;
  scenarioDone = false;

  /** Counts down after a step completes — UI shows "✓" flash while > 0 */
  flashTimer  = 0;
  /** Title of the last completed step, shown in the flash banner */
  flashTitle  = '';

  /** Which scenario IDs have been fully completed this session */
  completedIds: Set<string> = new Set();

  start(idx: number): void {
    this.scenarioIdx  = Math.max(0, Math.min(idx, TUTORIAL_SCENARIOS.length - 1));
    this.stepIdx      = 0;
    this.isActive     = true;
    this.scenarioDone = false;
    this.flashTimer   = 0;
    this.flashTitle   = '';
  }

  stop(): void {
    this.isActive     = false;
    this.flashTimer   = 0;
  }

  get scenario(): TutorialScenario | null {
    return this.isActive ? (TUTORIAL_SCENARIOS[this.scenarioIdx] ?? null) : null;
  }

  get step(): TutorialStep | null {
    const s = this.scenario;
    return s ? (s.steps[this.stepIdx] ?? null) : null;
  }

  /** Call once per frame.  Advances step when check() passes. */
  tick(ctx: TutorialCtx, dt: number): void {
    if (!this.isActive) return;

    // Count down the "step complete" flash
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      return;   // don't advance again while flash is showing
    }

    if (this.scenarioDone) return;

    const step = this.step;
    if (!step) return;

    if (step.check(ctx)) {
      this.flashTitle = step.title;
      this.flashTimer = 1.8;
      this.stepIdx++;

      const sc = this.scenario!;
      if (this.stepIdx >= sc.steps.length) {
        this.scenarioDone = true;
        this.completedIds.add(sc.id);
      }
    }
  }
}
