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
import { PhysicsEngine } from './Physics';
import { Atmosphere } from './Atmosphere';
import { Renderer } from './Renderer';
import { UI } from './UI';
import { MapView } from './MapView';

// ─── Physics Config ───────────────────────────────────────────────────────────

/** Fixed physics time step (seconds) */
const PHYSICS_DT = 1 / 60;

/** Maximum physics sub-steps per render frame (prevents spiral of death) */
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

  /** Time warp: index into WARP_LEVELS */
  private readonly WARP_LEVELS = [1, 2, 5, 10] as const;
  private warpIndex = 0;

  // ── Message overlay state ──────────────────────────────────────────────────
  private showMessage = false;
  private messageTitle = '';
  private messageBody  = '';
  private messageBtn   = '';
  private messageAction: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available.');

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
      case GameScreen.MAIN_MENU: this._updateMainMenu(); break;
      case GameScreen.OPTIONS:   this._updateOptions();  break;
      case GameScreen.VAB:       this._updateVAB();      break;
      case GameScreen.STAGING:   this._updateStaging();  break;
      case GameScreen.FLIGHT:    this._updateFlight(rawDt); break;
      default: break;
    }

    // Message overlay (rendered on top of anything)
    if (this.showMessage && this.messageAction) {
      this.ui.renderMessage(this.messageTitle, this.messageBody, this.messageBtn, this.messageAction);
    }
  }

  // ─── Screen Update Methods ─────────────────────────────────────────────────

  private _updateMainMenu(): void {
    this.ui.renderMainMenu(
      this.wallTime,
      () => this._switchTo(GameScreen.VAB),
      () => this._switchTo(GameScreen.OPTIONS),
      () => { /* exit: no-op in browser */ },
    );
  }

  private _updateOptions(): void {
    this.ui.renderOptions(() => this._switchTo(GameScreen.MAIN_MENU));
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
    const warpFactor = this.WARP_LEVELS[this.warpIndex];

    // ── Physics sub-steps ─────────────────────────────────────────────────
    this.accumulator += rawDt * warpFactor;
    const maxSteps = MAX_PHYSICS_STEPS * warpFactor;
    let steps = 0;

    while (this.accumulator >= PHYSICS_DT && steps < maxSteps) {
      // Pass throttle into physics via getThrust override
      this.rocket.body.mass = this.rocket.getTotalMass();
      this.physics.step(this.rocket.body, this.rocket, PHYSICS_DT);
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    // Discard leftover accumulator to prevent runaway
    if (this.accumulator > PHYSICS_DT * maxSteps) {
      this.accumulator = 0;
    }

    // ── Check mission events ──────────────────────────────────────────────
    this._checkFlightEvents();

    // ── Render ────────────────────────────────────────────────────────────
    const frame = this.physics.lastFrame;

    if (this.isMapOpen) {
      // Render flight behind map
      this.renderer.renderFlight(this.rocket, frame, this.throttle);
      this.mapView.render(this.rocket, this.wallTime, this.physics.missionTime, () => { this.isMapOpen = false; });
    } else {
      this.renderer.renderFlight(this.rocket, frame, this.throttle);
      this.renderer.renderHUD(
        this.rocket,
        frame,
        this.throttle,
        this.rocket.currentStage,
        this.physics.missionTime,
        warpFactor,
      );
      this.renderer.renderBurnGuidance(this.rocket, this.mapView.node, this.physics.missionTime);
    }
  }

  // ─── Input Processing ──────────────────────────────────────────────────────

  private _processInput(dt: number): void {
    if (this.screen !== GameScreen.FLIGHT) return;

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
    }

    if (this.mapPressed) {
      this.mapPressed = false;
      this.isMapOpen = !this.isMapOpen;
      if (this.isMapOpen) this.mapView.resetView();
    }

    if (this.escPressed) {
      this.escPressed = false;
      if (this.isMapOpen) {
        this.isMapOpen = false;
      } else {
        this._switchTo(GameScreen.MAIN_MENU);
      }
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
    this.throttle    = 0;
    this.isMapOpen   = false;
    this.accumulator = 0;
    this.showMessage = false;
    this.warpIndex   = 0;

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
        case 'Escape':
          if (this.screen === GameScreen.VAB) {
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
      }
    }, { passive: false });

    this.canvas.addEventListener('click', (e: MouseEvent) => {
      const mx = e.clientX, my = e.clientY;

      // Message overlay takes priority
      if (this.showMessage && this.messageAction) {
        this.ui.handleMessageClick(mx, my, this.messageAction);
        return;
      }

      switch (this.screen) {
        case GameScreen.MAIN_MENU:
          this.ui.handleMainMenuClick(
            mx, my,
            () => this._switchTo(GameScreen.VAB),
            () => this._switchTo(GameScreen.OPTIONS),
            () => {},
          );
          break;

        case GameScreen.OPTIONS:
          this.ui.handleOptionsClick(mx, my, () => this._switchTo(GameScreen.MAIN_MENU));
          break;

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
          if (this.isMapOpen) {
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
}
