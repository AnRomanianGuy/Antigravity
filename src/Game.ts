/**
 * Game.ts — Central game state machine and main loop.
 *
 * Manages:
 *   • Screen transitions (Main Menu → VAB → Staging → Flight → Map)
 *   • requestAnimationFrame game loop with capped dt
 *   • Keyboard and mouse input routing
 *   • Physics update calls
 *   • Orchestrates Renderer, UI, and MapView for each screen
 *
 * Physics time step:
 *   The simulation runs at most MAX_PHYSICS_STEPS per frame to prevent
 *   spiral-of-death on slow devices.  Each step is fixed at PHYSICS_DT.
 */

import { GameScreen, InputState } from './types';
import { Rocket } from './Rocket';
import { PhysicsEngine, R_EARTH, MU_EARTH, R_MOON, MU_MOON, getMoonPosition, getMoonVelocity } from './Physics';
import { Atmosphere } from './Atmosphere';
import { Renderer } from './Renderer';
import { UI } from './UI';
import { MapView } from './MapView';
import { TutorialManager, TUTORIAL_SCENARIOS } from './Tutorial';

// ─── Physics Config ───────────────────────────────────────────────────────────

/** Fixed physics time step at normal warp (seconds) */
const PHYSICS_DT = 1 / 60;

/** Max sub-steps per frame at 1× warp */
const MAX_PHYSICS_STEPS = 4;

/** Throttle change rate per second (Shift/Ctrl keys) */
const THROTTLE_RATE = 0.5;

// ─── Game Class ───────────────────────────────────────────────────────────────

export class Game {
  private canvas: HTMLCanvasElement;

  // ── Sub-systems ────────────────────────────────────────────────────────────
  private rocket:   Rocket;
  private physics:  PhysicsEngine;
  private atmo:     Atmosphere;
  private renderer: Renderer;
  private ui:       UI;
  private mapView:  MapView;

  // ── State ──────────────────────────────────────────────────────────────────
  private screen: GameScreen = GameScreen.MAIN_MENU;
  private isMapOpen = false;

  /** Player throttle 0–1 */
  private throttle = 0;

  /** Physics accumulator (seconds) */
  private accumulator = 0;

  /** Timestamp of last rAF call */
  private lastTime = -1;

  /** Total wall-clock time (for animations) */
  private wallTime = 0;

  /** Show force-vector debug overlay during flight */
  advancedDebug = false;

  /** True while the in-flight pause menu is visible */
  private isPaused = false;

  /** True when OPTIONS was opened from the pause menu (back returns to flight, not main menu) */
  private _fromPausedFlight = false;

  /** Tutorial system — manages active scenario and step progression */
  private tutorial = new TutorialManager();

  /** Input state flags */
  private input: InputState = {
    throttleUp: false, throttleDown: false,
    rotateLeft: false, rotateRight: false,
    stage: false, toggleMap: false, escape: false,
  };

  /** One-shot flags (reset each frame) */
  private stagePressed    = false;
  private mapPressed      = false;
  private escPressed      = false;
  private warpUpPressed   = false;
  private warpDownPressed = false;

  /** Time warp: index into WARP_LEVELS.
   *  ≤10×  → many small PHYSICS_DT steps per frame.
   *  ≥100× → one large step (warpFactor/60 s) per frame; thrust disabled. */
  private readonly WARP_LEVELS = [1, 5, 10, 100, 1000, 10000] as const;
  private warpIndex = 0;

  // ── Message overlay state ──────────────────────────────────────────────────
  private showMessage = false;
  private messageTitle = '';
  private messageBody  = '';
  private messageBtn   = '';
  private messageAction: (() => void) | null = null;

  // ── Cheat menu ────────────────────────────────────────────────────────────
  private cheatOpen        = false;
  private cheatUnlimFuel   = false;
  private ctx: CanvasRenderingContext2D | null = null;

  /** Bounding boxes of cheat menu buttons (rebuilt each render) */
  private _cheatBtns: Array<{ label: string; x: number; y: number; w: number; h: number; action: () => void }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available.');
    this.ctx = ctx;

    this.atmo     = new Atmosphere();
    this.physics  = new PhysicsEngine(this.atmo);
    this.rocket   = new Rocket();
    this.renderer = new Renderer(ctx);
    this.ui       = new UI(ctx, this.renderer);
    this.mapView  = new MapView(ctx, this.atmo);

    this._bindInput();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  init(): void {
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /** Main loop — called by requestAnimationFrame */
  loop(timestamp: number): void {
    if (this.lastTime < 0) this.lastTime = timestamp;

    // Wall-clock dt, capped to prevent huge jumps on tab-switch
    const rawDt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime  = timestamp;
    this.wallTime += rawDt;

    this.renderer.time = this.wallTime;

    // Process input
    this._processInput(rawDt);

    // Update / render the active screen
    switch (this.screen) {
      case GameScreen.MAIN_MENU:       this._updateMainMenu();      break;
      case GameScreen.OPTIONS:         this._updateOptions();       break;
      case GameScreen.VAB:             this._updateVAB();           break;
      case GameScreen.STAGING:         this._updateStaging();       break;
      case GameScreen.FLIGHT:          this._updateFlight(rawDt);   break;
      case GameScreen.TUTORIAL_SELECT: this._updateTutorialSelect(); break;
      default: break;
    }

    // Tutorial tick + overlay (visible on VAB, Staging, and Flight screens)
    if (this.tutorial.isActive) {
      const tutCtx = {
        screen:      this.screen,
        frame:       this.physics.lastFrame,
        rocket:      this.rocket,
        throttle:    this.throttle,
        missionTime: this.physics.missionTime,
      };
      this.tutorial.tick(tutCtx, rawDt);
      if (this.screen !== GameScreen.MAIN_MENU && this.screen !== GameScreen.TUTORIAL_SELECT) {
        this.ui.renderTutorialOverlay(this.tutorial);
      }
    }

    // Message overlay (rendered on top of anything)
    if (this.showMessage && this.messageAction) {
      this.ui.renderMessage(this.messageTitle, this.messageBody, this.messageBtn, this.messageAction);
    }

    // Cheat menu — always topmost
    if (this.cheatOpen) this._renderCheatMenu();
  }

  // ─── Screen Update Methods ─────────────────────────────────────────────────

  private _updateMainMenu(): void {
    this.ui.renderMainMenu(
      this.wallTime,
      () => this._switchTo(GameScreen.VAB),
      () => this._switchTo(GameScreen.TUTORIAL_SELECT),
      () => this._switchTo(GameScreen.OPTIONS),
      () => { /* exit: no-op in browser */ },
    );
  }

  private _updateTutorialSelect(): void {
    this.ui.renderTutorialSelect(
      TUTORIAL_SCENARIOS,
      this.tutorial.completedIds,
      (idx) => {
        this.tutorial.start(idx);
        this._switchTo(GameScreen.VAB);  // resets rocket to empty; tutorial overlay guides from here
      },
      () => this._switchTo(GameScreen.MAIN_MENU),
    );
  }

  private _updateOptions(): void {
    const onBack = this._fromPausedFlight
      ? () => { this._fromPausedFlight = false; this._switchTo(GameScreen.FLIGHT); }
      : () => this._switchTo(GameScreen.MAIN_MENU);
    this.ui.renderOptions(this.advancedDebug, onBack);
  }

  private _updateVAB(): void {
    this.ui.renderVAB(
      this.rocket,
      () => this._launchRocket(),
      () => this._switchTo(GameScreen.STAGING),
      () => this._switchTo(GameScreen.MAIN_MENU),
    );
  }

  private _updateStaging(): void {
    this.ui.renderStaging(
      this.rocket,
      () => this._switchTo(GameScreen.VAB),   // confirm → back to VAB for now
      () => this._switchTo(GameScreen.VAB),
    );
  }

  private _updateFlight(rawDt: number): void {
    const warpFactor  = this.WARP_LEVELS[this.warpIndex];
    const highWarp    = warpFactor >= 100;

    // ── Physics sub-steps (skipped while paused) ──────────────────────────
    if (this.isPaused) {
      // Do nothing — accumulator stays frozen
    } else if (highWarp) {
      this.rocket.throttle = 0;
      this.throttle        = 0;
      this.rocket.body.mass = this.rocket.getTotalMass();
      this.physics.stepWarp(this.rocket.body, warpFactor / 60);
      // Guard: non-finite means something went badly wrong
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
      // ── Unlimited fuel cheat ────────────────────────────────────────────
      if (this.cheatUnlimFuel) {
        for (const part of this.rocket.parts) {
          if (part.def.maxFuelMass > 0) {
            part.fuelRemaining = part.def.maxFuelMass;
          }
        }
        this.rocket.body.mass = this.rocket.getTotalMass();
      }

      // ── Burn-node state ─────────────────────────────────────────────────
      this.mapView.tick(this.rocket, this.physics.missionTime);

      // ── Check mission events ────────────────────────────────────────────
      this._checkFlightEvents();
    }

    // ── Render ────────────────────────────────────────────────────────────
    const frame = this.physics.lastFrame;

    if (this.isMapOpen) {
      this.renderer.renderFlight(this.rocket, frame, this.throttle, this.physics.missionTime, this.advancedDebug);
      this.mapView.render(this.rocket, this.wallTime, this.physics.missionTime, () => { this.isMapOpen = false; });
    } else {
      this.renderer.renderFlight(this.rocket, frame, this.throttle, this.physics.missionTime, this.advancedDebug);
      this.renderer.renderHUD(
        this.rocket,
        frame,
        this.throttle,
        this.rocket.currentStage,
        this.physics.missionTime,
        warpFactor,
      );
      this.renderer.renderBurnGuidance(this.rocket, this.mapView.node, this.physics.missionTime, this.mapView.dvRemaining);
    }

    // ── Pause overlay (topmost, only in flight view) ──────────────────────
    if (this.isPaused && !this.isMapOpen) {
      this.ui.renderPauseMenu(
        () => { this.isPaused = false; },
        () => { this._fromPausedFlight = true; this._switchTo(GameScreen.OPTIONS); },
        () => { this.isPaused = false; this._switchTo(GameScreen.MAIN_MENU); },
      );
    }
  }

  // ─── Input Processing ──────────────────────────────────────────────────────

  private _processInput(dt: number): void {
    if (this.screen !== GameScreen.FLIGHT) return;

    // ESC toggles pause (or closes map) — always handled first
    if (this.escPressed) {
      this.escPressed = false;
      if (this.isMapOpen) {
        this.isMapOpen = false;
      } else {
        this.isPaused = !this.isPaused;
      }
    }

    // All other flight input is suppressed while paused
    if (this.isPaused) return;

    // Throttle
    if (this.input.throttleUp)   this.throttle = Math.min(1, this.throttle + THROTTLE_RATE * dt);
    if (this.input.throttleDown) this.throttle = Math.max(0, this.throttle - THROTTLE_RATE * dt);

    // Rotation (only at 1x warp and not in map view)
    if (!this.isMapOpen && this.warpIndex === 0) {
      if (this.input.rotateLeft) {
        this.physics.applyRotation(this.rocket.body, -1, dt, this.rocket.hasCommandPod);
      }
      if (this.input.rotateRight) {
        this.physics.applyRotation(this.rocket.body, +1, dt, this.rocket.hasCommandPod);
      }
    }

    // ── Auto-align + auto-execute maneuver node ────────────────────────────
    const node       = this.mapView.node;
    const warpFactor = this.WARP_LEVELS[this.warpIndex];
    if (node && this.rocket.hasCommandPod) {
      const vel    = this.rocket.body.vel;
      const pos    = this.rocket.body.pos;
      const speed  = Math.hypot(vel.x, vel.y);
      const posLen = Math.hypot(pos.x, pos.y);

      const prograde  = speed  > 1 ? { x: vel.x / speed,  y: vel.y / speed  } : { x: 0, y: 1 };
      const radialOut = posLen > 0 ? { x: pos.x / posLen, y: pos.y / posLen } : { x: 0, y: 1 };

      const burnX   = node.progradeDV * prograde.x + node.normalDV * radialOut.x;
      const burnY   = node.progradeDV * prograde.y + node.normalDV * radialOut.y;
      const burnLen = Math.hypot(burnX, burnY);

      let aligned = false;

      if (burnLen > 0.1) {
        // desiredAngle uses atan2(x,y) to match the game's (sin,cos) angle convention
        const desiredAngle = Math.atan2(burnX, burnY);
        let   angleDiff    = desiredAngle - this.rocket.body.angle;
        while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        aligned = Math.abs(angleDiff) < 0.087;  // within ~5°

        if (this.warpIndex > 0) {
          // Warp > 1×: instant snap
          this.rocket.body.angle  = desiredAngle;
          this.rocket.body.angVel = 0;
          aligned = true;
        } else if (!this.input.rotateLeft && !this.input.rotateRight) {
          // Angular-velocity setpoint controller.
          // maxAngVel is derived from the rocket's actual braking alpha so the rocket
          // can always stop within ~1.5° — prevents the overshoot oscillation that
          // made the old bang-bang controller unreliable after the torque increase.
          if (Math.abs(angleDiff) > 0.005) {
            const alpha = this.physics.getRotationAlpha(
              this.rocket.body, this.rocket.hasCommandPod,
            );
            // sqrt(2 * alpha * stop_angle) gives the velocity that decelerates to 0
            // over stop_angle. 0.8 safety margin keeps overshoot < 1.5°.
            const maxAngVel = Math.sqrt(2.0 * alpha * 0.04) * 0.8;
            const desiredAngVel = Math.sign(angleDiff)
              * Math.min(Math.abs(angleDiff) * 8.0, maxAngVel);
            const velError = desiredAngVel - this.rocket.body.angVel;
            const dir = Math.max(-1.0, Math.min(1.0, velError * 3.0 / maxAngVel));
            this.physics.applyRotation(this.rocket.body, dir, dt, this.rocket.hasCommandPod);
          } else {
            // Inside dead-zone — kill residual spin quickly
            this.rocket.body.angVel *= Math.pow(0.5, dt * 60);
          }
        }
      }

      // ── Auto-execute: fire engines when T− < 0, cut when done ──────────
      const dvRem = this.mapView.dvRemaining;
      if (dvRem !== null && warpFactor < 100) {
        if (dvRem < 0.5) {
          // Burn complete — cut throttle and clear node
          this.throttle = 0;
          this.mapView.node = null;
        } else if (aligned) {
          // Taper throttle in last 10 m/s to avoid overshoot
          this.throttle = Math.min(1, dvRem / 10);
        } else {
          // Not aligned yet — hold off
          this.throttle = 0;
        }
      }
    }

    // Warp (one-shot)
    if (this.warpUpPressed) {
      this.warpUpPressed = false;
      this.warpIndex = Math.min(this.warpIndex + 1, this.WARP_LEVELS.length - 1);
    }
    if (this.warpDownPressed) {
      this.warpDownPressed = false;
      this.warpIndex = Math.max(this.warpIndex - 1, 0);
    }

    // Sync throttle to rocket — physics.step calls rocket.getThrust() which reads this
    this.rocket.throttle = this.throttle;

    // Single-fire keys
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
      if (this.isMapOpen) this.mapView.resetView();
    }

  }

  // ─── Flight Events ─────────────────────────────────────────────────────────

  private _checkFlightEvents(): void {
    const { lastFrame } = this.physics;

    // Mark as launched once the rocket climbs off the pad
    if (!this.rocket.hasLaunched && lastFrame.altitude > 10) {
      this.rocket.hasLaunched = true;
    }

    // Landed (altitude near 0 and vertical speed ≤ 0)
    if (lastFrame.altitude < 5 && lastFrame.verticalSpeed <= 0 && this.rocket.hasLaunched) {
      const speed = lastFrame.speed;
      if (speed < 10) {
        this._showMessage('MISSION COMPLETE', 'Rocket landed safely!', 'OK',
          () => { this.showMessage = false; this._switchTo(GameScreen.MAIN_MENU); });
      } else if (speed > 200) {
        this.rocket.isDestroyed = true;
        this._showMessage('ROCKET DESTROYED', `Crashed at ${speed.toFixed(0)} m/s`, 'OK',
          () => { this.showMessage = false; this._switchTo(GameScreen.MAIN_MENU); });
      }
    }

    // Heat destruction — critical part burned through
    if (!this.rocket.isDestroyed && this.rocket.hasDestroyedCriticalPart) {
      this.rocket.isDestroyed = true;
      this._showMessage('ROCKET DESTROYED', 'Critical part burned through!', 'OK',
        () => { this.showMessage = false; this._switchTo(GameScreen.MAIN_MENU); });
    }

    // Out of fuel — just a HUD event (engines already cut in Rocket.consumeFuel)
  }

  // ─── Launch ────────────────────────────────────────────────────────────────

  private _launchRocket(): void {
    if (this.rocket.parts.length === 0) {
      this._showMessage('NO ROCKET', 'Build a rocket first!', 'OK', () => { this.showMessage = false; });
      return;
    }

    // Auto-stage if no stages assigned
    if (this.rocket.stages.length === 0) {
      this.rocket.autoStage();
    }

    this.rocket.placeOnLaunchpad();
    this.physics.reset();
    this.throttle          = 0;
    this.isMapOpen         = false;
    this.accumulator       = 0;
    this.showMessage       = false;
    this.warpIndex         = 0;
    this.isPaused          = false;
    this._fromPausedFlight = false;

    this._switchTo(GameScreen.FLIGHT);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private _switchTo(screen: GameScreen): void {
    this.screen = screen;
    if (screen === GameScreen.VAB) {
      // Reset the rocket to empty for a fresh build each time we enter VAB
      // Only reset if coming from menu (not from staging)
      // We keep the rocket if coming from staging back to VAB
    }
  }

  private _showMessage(title: string, body: string, btn: string, action: () => void): void {
    if (this.showMessage) return;   // don't stack messages
    this.messageTitle  = title;
    this.messageBody   = body;
    this.messageBtn    = btn;
    this.messageAction = action;
    this.showMessage   = true;
  }

  private _resize(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.canvas.width  = W;
    this.canvas.height = H;
    this.renderer.resize(W, H);
    this.ui.resize(W, H);
    this.mapView.resize(W, H);
  }

  // ─── Input Binding ─────────────────────────────────────────────────────────

  private _bindInput(): void {
    // ── Keyboard ──────────────────────────────────────────────────────────
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      switch (e.code) {
        // Throttle: hold Shift = up, hold Ctrl = down, Z = full, X = cut
        case 'ShiftLeft':   case 'ShiftRight':   this.input.throttleUp   = true; break;
        case 'ControlLeft': case 'ControlRight': this.input.throttleDown = true; break;
        case 'KeyZ': this.throttle = 1; break;
        case 'KeyX': this.throttle = 0; break;
        case 'KeyA': case 'ArrowLeft':  this.input.rotateLeft  = true; break;
        case 'KeyD': case 'ArrowRight': this.input.rotateRight = true; break;
        case 'Space':
          e.preventDefault();
          this.stagePressed = true;
          break;
        case 'KeyM':
          this.mapPressed = true;
          break;
        case 'Comma':
          this.warpDownPressed = true;
          break;
        case 'Period':
          this.warpUpPressed = true;
          break;
        case 'F1':
          if (e.ctrlKey) {
            e.preventDefault();
            this.cheatOpen = !this.cheatOpen;
          }
          break;
        case 'Escape':
          if (this.cheatOpen) {
            this.cheatOpen = false;
          } else if (this.screen === GameScreen.VAB) {
            this.ui.cancelVABGhost();
          } else {
            this.escPressed = true;
          }
          break;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ShiftLeft':   case 'ShiftRight':   this.input.throttleUp   = false; break;
        case 'ControlLeft': case 'ControlRight': this.input.throttleDown = false; break;
        case 'KeyA': case 'ArrowLeft':  this.input.rotateLeft  = false; break;
        case 'KeyD': case 'ArrowRight': this.input.rotateRight = false; break;
      }
    });

    // ── Mouse ─────────────────────────────────────────────────────────────
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const mx = e.clientX, my = e.clientY;
      this.ui.mouseX = mx;
      this.ui.mouseY = my;
      if (this.screen === GameScreen.VAB) this.ui.handleVABMouseMove(mx, my);
      if (this.isMapOpen) this.mapView.handleMouseMove(mx, my);
    });

    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isMapOpen) this.mapView.handleMouseDown(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('mouseup', () => {
      if (this.isMapOpen) this.mapView.handleMouseUp();
    });

    this.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      if (this.screen === GameScreen.VAB) {
        this.ui.handleVABRightClick(e.clientX, e.clientY, this.rocket);
      }
    });

    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      if (this.isMapOpen) {
        e.preventDefault();
        this.mapView.handleWheel(e);
      } else if (this.screen === GameScreen.VAB) {
        e.preventDefault();
        this.ui.handleVABScroll(e.clientX, e.clientY, e.deltaY);
      }
    }, { passive: false });

    this.canvas.addEventListener('click', (e: MouseEvent) => {
      const mx = e.clientX, my = e.clientY;

      // Cheat menu takes top priority
      if (this.cheatOpen) {
        for (const btn of this._cheatBtns) {
          if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
            btn.action();
          }
        }
        return;
      }

      // Message overlay takes priority
      if (this.showMessage && this.messageAction) {
        this.ui.handleMessageClick(mx, my, this.messageAction);
        return;
      }

      // Tutorial overlay skip / scenario-complete dismiss — checked before screen routing
      if (this.tutorial.isActive &&
          this.screen !== GameScreen.MAIN_MENU &&
          this.screen !== GameScreen.TUTORIAL_SELECT) {
        const acted = this.ui.handleTutorialOverlayClick(mx, my, this.tutorial);
        if (acted) {
          if (this.tutorial.scenarioDone) {
            this.tutorial.stop();
            this._switchTo(GameScreen.TUTORIAL_SELECT);
          } else {
            this.tutorial.stop();
          }
          return;
        }
      }

      switch (this.screen) {
        case GameScreen.MAIN_MENU:
          this.ui.handleMainMenuClick(
            mx, my,
            () => this._switchTo(GameScreen.VAB),
            () => this._switchTo(GameScreen.TUTORIAL_SELECT),
            () => this._switchTo(GameScreen.OPTIONS),
            () => {},
          );
          break;

        case GameScreen.TUTORIAL_SELECT:
          this.ui.handleTutorialSelectClick(
            mx, my,
            TUTORIAL_SCENARIOS,
            (idx) => {
              this.tutorial.start(idx);
              this._switchTo(GameScreen.VAB);
            },
            () => this._switchTo(GameScreen.MAIN_MENU),
          );
          break;

        case GameScreen.OPTIONS: {
          const optBack = this._fromPausedFlight
            ? () => { this._fromPausedFlight = false; this._switchTo(GameScreen.FLIGHT); }
            : () => this._switchTo(GameScreen.MAIN_MENU);
          this.ui.handleOptionsClick(mx, my, optBack, (v) => { this.advancedDebug = v; }, this.advancedDebug);
          break;
        }

        case GameScreen.VAB:
          this.ui.handleVABClick(
            mx, my, this.rocket,
            () => this._launchRocket(),
            () => this._switchTo(GameScreen.STAGING),
            () => this._switchTo(GameScreen.MAIN_MENU),
          );
          break;

        case GameScreen.STAGING:
          this.ui.handleStagingClick(
            mx, my, this.rocket,
            () => this._switchTo(GameScreen.VAB),
            () => this._switchTo(GameScreen.VAB),
          );
          break;

        case GameScreen.FLIGHT:
          if (this.isPaused && !this.isMapOpen) {
            this.ui.handlePauseClick(
              mx, my,
              () => { this.isPaused = false; },
              () => { this._fromPausedFlight = true; this._switchTo(GameScreen.OPTIONS); },
              () => { this.isPaused = false; this._switchTo(GameScreen.MAIN_MENU); },
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

  private _renderCheatMenu(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const W = this.canvas.width;
    const H = this.canvas.height;

    this._cheatBtns = [];

    const pw = 340, ph = 280;
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);

    // Dark scrim
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);

    // Panel
    ctx.fillStyle = '#050d18';
    this._cheatRoundRect(ctx, px, py, pw, ph, 8);
    ctx.fill();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1.5;
    this._cheatRoundRect(ctx, px, py, pw, ph, 8);
    ctx.stroke();

    // ── Header ───────────────────────────────────────────────────────────
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 15px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('⚠  DEBUG / CHEAT MENU  ⚠', px + pw / 2, py + 24);

    ctx.fillStyle = 'rgba(255,68,68,0.5)';
    ctx.fillRect(px + 12, py + 32, pw - 24, 1);

    ctx.fillStyle = '#4a6080';
    ctx.font = '10px Courier New';
    ctx.fillText('Ctrl+F1 or Esc to close', px + pw / 2, py + 46);

    // ── Buttons ───────────────────────────────────────────────────────────
    const bw = pw - 40, bh = 38, bx = px + 20;
    const gap = 12;
    let by = py + 60;

    const addBtn = (label: string, active: boolean | null, action: () => void) => {
      const hovering = this.ui.mouseX >= bx && this.ui.mouseX <= bx + bw
                    && this.ui.mouseY >= by && this.ui.mouseY <= by + bh;

      ctx.fillStyle = active === true  ? 'rgba(0,200,80,0.18)'
                    : active === false ? 'rgba(80,20,20,0.35)'
                    : hovering         ? 'rgba(0,100,180,0.30)'
                    :                    'rgba(10,20,40,0.80)';
      this._cheatRoundRect(ctx, bx, by, bw, bh, 5);
      ctx.fill();

      const borderCol = active === true  ? '#00cc55'
                      : active === false ? '#883333'
                      : hovering         ? '#0088cc'
                      :                    '#1e3a5f';
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = hovering ? 1.5 : 1;
      this._cheatRoundRect(ctx, bx, by, bw, bh, 5);
      ctx.stroke();

      ctx.fillStyle = active === true ? '#44ff88'
                    : hovering        ? '#88ccff'
                    :                   '#c8d8e8';
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(label, bx + 14, by + bh / 2 + 4);

      if (active !== null) {
        const tag = active ? '● ON' : '○ OFF';
        ctx.fillStyle = active ? '#44ff88' : '#664444';
        ctx.font = 'bold 11px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(tag, bx + bw - 14, by + bh / 2 + 4);
      }

      this._cheatBtns.push({ label, x: bx, y: by, w: bw, h: bh, action });
      by += bh + gap;
    };

    addBtn(
      'UNLIMITED FUEL',
      this.cheatUnlimFuel,
      () => { this.cheatUnlimFuel = !this.cheatUnlimFuel; },
    );

    addBtn(
      'TELEPORT → LOW EARTH ORBIT  (250 km)',
      null,
      () => { this._cheatTeleportEarthOrbit(); this.cheatOpen = false; },
    );

    addBtn(
      'TELEPORT → LUNAR ORBIT  (100 km)',
      null,
      () => { this._cheatTeleportLunarOrbit(); this.cheatOpen = false; },
    );

    addBtn(
      'REFILL ALL TANKS',
      null,
      () => {
        for (const p of this.rocket.parts) {
          if (p.def.maxFuelMass > 0) p.fuelRemaining = p.def.maxFuelMass;
        }
        this.rocket.body.mass = this.rocket.getTotalMass();
      },
    );

    addBtn(
      'CLOSE',
      null,
      () => { this.cheatOpen = false; },
    );

    // Footer
    ctx.fillStyle = '#1e2a3a';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('For testing purposes only. Use responsibly.', px + pw / 2, py + ph - 10);
  }

  private _cheatTeleportEarthOrbit(): void {
    const alt = 250_000;
    const r   = R_EARTH + alt;
    const v   = Math.sqrt(MU_EARTH / r);

    this.rocket.body.pos    = { x: 0,  y: r };
    this.rocket.body.vel    = { x: v,  y: 0 };
    this.rocket.body.angle  = 0;
    this.rocket.body.angVel = 0;
    this.rocket.body.mass   = this.rocket.getTotalMass();
    this.rocket.hasLaunched = true;
    this.rocket.isDestroyed = false;
    this.accumulator        = 0;
    this.isMapOpen          = false;
    this.warpIndex          = 0;
    this._switchTo(GameScreen.FLIGHT);
  }

  private _cheatTeleportLunarOrbit(): void {
    const alt      = 100_000;
    const r        = R_MOON + alt;
    const v        = Math.sqrt(MU_MOON / r);
    const moonPos  = getMoonPosition(this.physics.missionTime);
    const moonVel  = getMoonVelocity(this.physics.missionTime);

    // Place above the Moon (+Y from Moon centre) with circular prograde velocity
    this.rocket.body.pos    = { x: moonPos.x,     y: moonPos.y + r  };
    this.rocket.body.vel    = { x: moonVel.x + v, y: moonVel.y      };
    this.rocket.body.angle  = 0;
    this.rocket.body.angVel = 0;
    this.rocket.body.mass   = this.rocket.getTotalMass();
    this.rocket.hasLaunched = true;
    this.rocket.isDestroyed = false;
    this.accumulator        = 0;
    this.isMapOpen          = false;
    this.warpIndex          = 0;
    this._switchTo(GameScreen.FLIGHT);
  }

  private _cheatRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,     y,     x + r, y,          r);
    ctx.closePath();
  }
}
