/**
 * Renderer.ts — All canvas drawing for the Antigravity game.
 *
 * Drawing pipeline (flight scene, bottom to top):
 *   1. Clear / deep-space background
 *   2. Starfield (procedural, parallax-shifted based on rocket position)
 *   3. Earth (filled circle + atmosphere glow halo)
 *   4. Rocket body (stacked part rectangles, rotated)
 *   5. Exhaust plume (tapered gradient cone below active engine)
 *   6. Heat glow (radial orange gradient, intensity = heatingIntensity)
 *   7. Plasma effect (reentry: animated cyan/magenta arc streaks)
 *   8. HUD (altitude, velocity, heading, fuel bars, stage display) — screen-space
 *
 * The camera follows the rocket, keeping it centred on screen.
 * Scale auto-adjusts so Earth fills a reasonable fraction of the screen
 * at low altitudes, then zooms out as altitude increases.
 */

import { vec2, Vec2, THEME, PartType } from './types';
import { Rocket } from './Rocket';
import { PhysicsFrame, R_EARTH } from './Physics';

// ─── Star Catalogue (generated once) ──────────────────────────────────────────

interface Star { x: number; y: number; r: number; bright: number }

function generateStars(count: number, seed = 42): Star[] {
  const stars: Star[] = [];
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand(),
      y: rand(),
      r: rand() < 0.05 ? rand() * 1.8 + 0.8 : rand() * 0.8 + 0.3,
      bright: rand() * 0.7 + 0.3,
    });
  }
  return stars;
}

const STARS = generateStars(600);

// ─── Camera ────────────────────────────────────────────────────────────────────

interface Camera {
  /** Screen centre offset (world metres per pixel at current zoom) */
  metersPerPixel: number;
  /** World position the camera is centred on */
  focus: Vec2;
}

// ─── Renderer ──────────────────────────────────────────────────────────────────

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private W: number;
  private H: number;

  /** Elapsed time in seconds — used for animated effects */
  time = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.W = ctx.canvas.width;
    this.H = ctx.canvas.height;
  }

  resize(w: number, h: number): void {
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
  renderFlight(rocket: Rocket, frame: PhysicsFrame, throttle: number): void {
    const ctx = this.ctx;
    const { H } = this;

    // ── Camera / zoom ──────────────────────────────────────────────────────
    // Starts close (20 km at launch) and zooms out quadratically with altitude.
    // ~20 km @ ground → ~220 km @ 100 km → ~820 km @ 200 km → ~10 Mm @ 700 km
    const alt = frame.altitude;
    const viewHeightM = 20_000 + alt * alt / 50_000;
    const mpp = viewHeightM / H;

    const camera: Camera = {
      focus:          vec2.clone(rocket.body.pos),
      metersPerPixel: mpp,
    };

    // ── Background: sky colour shifts with altitude ─────────────────────────
    this._drawSkyBackground(alt);

    // ── Stars: fade in above ~10 km, fully visible above 30 km ────────────
    const starFade = alt < 30_000 ? alt / 30_000 : 1.0;
    this._drawStars(camera, starFade);

    // ── Earth ─────────────────────────────────────────────────────────────
    this._drawEarth(camera);

    // ── Launchpad / ground ─────────────────────────────────────────────
    this._drawLaunchpad(camera);

    // ── Rocket (body + effects) ────────────────────────────────────────────
    const rocketScreenPos = this._worldToScreen(rocket.body.pos, camera);

    ctx.save();
    ctx.translate(rocketScreenPos.x, rocketScreenPos.y);
    ctx.rotate(rocket.body.angle);

    // Scale: show rocket at a physical width of ~3 m equivalent, minimum 1.0px/nominal
    const partScale = Math.max(3 / mpp, 1.0);

    // Exhaust plume (behind rocket body)
    if (rocket.isThrusting && throttle > 0) {
      this._drawExhaustPlume(rocket, partScale, throttle);
    }

    // Rocket parts
    this._drawRocketParts(rocket, partScale);

    // Heat glow
    if (frame.heatingIntensity > 0.01) {
      this._drawHeatGlow(rocket, partScale, frame.heatingIntensity);
    }

    // Plasma (reentry)
    if (frame.heatingIntensity > 0.3 && frame.speed > 3000) {
      this._drawPlasma(rocket, partScale, frame.heatingIntensity);
    }

    ctx.restore();
  }

  // ─── Earth & Atmosphere ───────────────────────────────────────────────────

  private _drawEarth(cam: Camera): void {
    const ctx = this.ctx;
    const earthScreen = this._worldToScreen({ x: 0, y: 0 }, cam);
    const earthRadPx  = R_EARTH / cam.metersPerPixel;

    // Atmosphere glow halo (70 km thick)
    const atmoRadPx = (R_EARTH + 70_000) / cam.metersPerPixel;
    const atmoGrad = ctx.createRadialGradient(
      earthScreen.x, earthScreen.y, earthRadPx * 0.98,
      earthScreen.x, earthScreen.y, atmoRadPx,
    );
    atmoGrad.addColorStop(0, 'rgba(80,160,255,0.35)');
    atmoGrad.addColorStop(0.5, 'rgba(40,100,200,0.12)');
    atmoGrad.addColorStop(1,   'rgba(0,30,80,0)');
    ctx.beginPath();
    ctx.arc(earthScreen.x, earthScreen.y, atmoRadPx, 0, Math.PI * 2);
    ctx.fillStyle = atmoGrad;
    ctx.fill();

    // Earth body
    const earthGrad = ctx.createRadialGradient(
      earthScreen.x - earthRadPx * 0.3, earthScreen.y - earthRadPx * 0.3, earthRadPx * 0.1,
      earthScreen.x, earthScreen.y, earthRadPx,
    );
    earthGrad.addColorStop(0,    '#4a9eff');   // lit ocean
    earthGrad.addColorStop(0.38, '#2266cc');   // deep ocean
    earthGrad.addColorStop(0.68, '#1a5533');   // land/continent
    earthGrad.addColorStop(0.84, '#2e7d32');   // green land (visible from orbit)
    earthGrad.addColorStop(0.94, '#12380e');   // dark toward limb
    earthGrad.addColorStop(1.0,  '#061008');   // very dark limb edge (realistic from space)

    ctx.beginPath();
    ctx.arc(earthScreen.x, earthScreen.y, earthRadPx, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad;
    ctx.fill();

    // Thin grass ring — only when Earth is small enough to appear as a sphere
    // (prevents it showing as a thick green band at low altitude)
    if (earthRadPx < this.H * 0.45) {
      const grassW = Math.max(2, Math.min(earthRadPx * 0.018, 20));
      ctx.beginPath();
      ctx.arc(earthScreen.x, earthScreen.y, earthRadPx - grassW * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#3e8b30';
      ctx.lineWidth = grassW;
      ctx.stroke();
    }

    // Subtle ocean shimmer
    ctx.beginPath();
    ctx.arc(earthScreen.x, earthScreen.y, earthRadPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,180,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ─── Ground / Launchpad Surface ───────────────────────────────────────────

  private _drawLaunchpad(cam: Camera): void {
    // World-space launch site: (0, R_EARTH) — top of Earth circle
    const ls = this._worldToScreen({ x: 0, y: R_EARTH }, cam);
    const mpp = cam.metersPerPixel;

    if (ls.y < -300 || ls.y > this.H + 50) return;

    const ctx = this.ctx;
    const { W } = this;

    // Grass horizon strip
    const grassH = Math.max(3, 18 / mpp);
    ctx.fillStyle = '#3a7a28';
    ctx.fillRect(0, ls.y - grassH, W, grassH + 2);

    // Earth fill below horizon
    ctx.fillStyle = '#2a5a20';
    ctx.fillRect(0, ls.y, W, Math.min(60, grassH * 3));

    // Concrete launchpad (100 m wide)
    const padW = Math.max(8, 100 / mpp);
    const padH = Math.max(3, 8 / mpp);
    ctx.fillStyle = '#909088';
    ctx.fillRect(ls.x - padW / 2, ls.y - padH - grassH + 2, padW, padH);

    // Pad centre marking
    if (padW > 12) {
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = Math.max(1, padW / 30);
      ctx.beginPath();
      ctx.moveTo(ls.x, ls.y - grassH + 2);
      ctx.lineTo(ls.x, ls.y - padH - grassH + 2);
      ctx.stroke();
    }

    // Launch tower (120 m tall) — only when large enough to see
    const towerH = 120 / mpp;
    if (towerH < 5) return;

    const tx = ls.x + padW * 0.38;
    const baseY = ls.y - padH - grassH + 2;

    ctx.strokeStyle = '#aaa890';
    ctx.lineWidth = Math.max(1.5, Math.min(5, 4 / mpp));

    // Main vertical column
    ctx.beginPath();
    ctx.moveTo(tx, baseY);
    ctx.lineTo(tx, baseY - towerH);
    ctx.stroke();

    // Horizontal support arms (3 levels)
    if (towerH > 18) {
      ctx.lineWidth = Math.max(1, Math.min(3, 2.5 / mpp));
      for (let i = 1; i <= 3; i++) {
        const armY   = baseY - towerH * i / 4;
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

    // Flashing red beacon at top
    if (towerH > 25) {
      const alpha = 0.4 + 0.55 * Math.abs(Math.sin(this.time * 2.2));
      ctx.beginPath();
      ctx.arc(tx, baseY - towerH, Math.max(2, 3 / mpp), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,60,20,${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }

  // ─── Sky Background ───────────────────────────────────────────────────────

  private _drawSkyBackground(altM: number): void {
    const ctx = this.ctx;
    const { W, H } = this;

    let r: number, g: number, b: number;
    if (altM < 12_000) {
      const t = altM / 12_000;
      r = Math.round(100 - 70 * t);   // 100 → 30
      g = Math.round(160 - 80 * t);   // 160 → 80
      b = Math.round(255 - 55 * t);   // 255 → 200
    } else if (altM < 50_000) {
      const t = (altM - 12_000) / 38_000;
      r = Math.round(30 - 20 * t);    // 30 → 10
      g = Math.round(80 - 60 * t);    // 80 → 20
      b = Math.round(200 - 120 * t);  // 200 → 80
    } else if (altM < 80_000) {
      const t = (altM - 50_000) / 30_000;
      r = 10;
      g = Math.round(20 - 10 * t);    // 20 → 10
      b = Math.round(80 - 62 * t);    // 80 → 18
    } else {
      r = 10; g = 10; b = 18;         // space — matches THEME.bg
    }

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ─── Starfield ────────────────────────────────────────────────────────────

  private _drawStars(cam: Camera, opacity = 1): void {
    const ctx  = this.ctx;
    const { W, H } = this;

    if (opacity <= 0) return;

    // Parallax: stars shift very slowly relative to rocket position
    const px = (cam.focus.x / R_EARTH) * 80 % W;
    const py = (cam.focus.y / R_EARTH) * 80 % H;

    ctx.save();
    for (const s of STARS) {
      const sx = ((s.x * W + px) % W + W) % W;
      const sy = ((s.y * H + py) % H + H) % H;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(s.bright * opacity).toFixed(2)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  // ─── Rocket Parts ─────────────────────────────────────────────────────────

  /**
   * Draw all parts as coloured rectangles centred at origin (0,0),
   * stacked vertically (slot 0 at bottom, highest slot at top).
   * The caller must have already applied rocket position + rotation transforms.
   */
  private _drawRocketParts(rocket: Rocket, scale: number): void {
    const ctx = this.ctx;
    if (rocket.parts.length === 0) return;

    // Compute y-offset of the bottom of the stack from the rocket's centre of mass
    const totalH = rocket.parts.reduce((s, p) => s + p.def.renderH * scale, 0);
    let yBottom = totalH / 2;   // bottom of stack at +totalH/2 (screen-Y down = positive in canvas)

    for (const part of rocket.parts) {
      const w  = part.def.renderW  * scale;
      const h  = part.def.renderH  * scale;
      const x  = -w / 2;
      const y  = yBottom - h;          // top of this part

      // Part body
      ctx.fillStyle = part.def.color;
      this._roundRect(x, y, w, h, 3 * scale);
      ctx.fill();

      // Highlight edge
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1 * scale;
      this._roundRect(x, y, w, h, 3 * scale);
      ctx.stroke();

      // Part-specific decorations
      this._drawPartDecoration(part.def.type, x, y, w, h, scale, part);

      yBottom -= h;
    }
  }

  private _drawPartDecoration(
    type: PartType,
    x: number, y: number, w: number, h: number,
    scale: number,
    part: PartInstance,
  ): void {
    const ctx = this.ctx;

    switch (type) {
      case PartType.COMMAND_POD: {
        // Window
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.35, w * 0.22, h * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(150,220,255,0.6)';
        ctx.fill();
        // Antenna nub
        ctx.fillStyle = '#aaa';
        ctx.fillRect(x + w * 0.45, y, w * 0.10, 5 * scale);
        break;
      }
      case PartType.FUEL_TANK_S:
      case PartType.FUEL_TANK_L: {
        // Fuel level bar
        const frac = part.def.maxFuelMass > 0 ? part.fuelRemaining / part.def.maxFuelMass : 0;
        const barH = (h - 8 * scale) * frac;
        ctx.fillStyle = frac > 0.3 ? 'rgba(0,200,100,0.35)' : 'rgba(255,80,0,0.45)';
        ctx.fillRect(x + w * 0.2, y + (h - 4 * scale) - barH, w * 0.6, barH);
        break;
      }
      case PartType.ENGINE: {
        // Nozzle bell
        const nozzleW = w * 1.1;
        ctx.beginPath();
        ctx.moveTo(x + (w - nozzleW) / 2, y + h * 0.7);
        ctx.lineTo(x + (w + nozzleW) / 2, y + h * 0.7);
        ctx.lineTo(x + w * 0.7, y + h);
        ctx.lineTo(x + w * 0.3, y + h);
        ctx.closePath();
        ctx.fillStyle = '#5a4030';
        ctx.fill();
        break;
      }
      case PartType.DECOUPLER: {
        // Yellow separation band
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(x, y + h * 0.3, w, h * 0.4);
        break;
      }
      case PartType.HEAT_SHIELD: {
        // Ablative surface pattern
        ctx.fillStyle = 'rgba(255,100,0,0.25)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#111';
        ctx.fillRect(x + 2 * scale, y + 2 * scale, w - 4 * scale, h * 0.4);
        break;
      }
      case PartType.FAIRING: {
        // Pointed nose
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w * 0.05, y + h * 0.4);
        ctx.lineTo(x + w * 0.95, y + h * 0.4);
        ctx.closePath();
        ctx.fillStyle = '#2a4a6a';
        ctx.fill();
        break;
      }
    }
  }

  // ─── Exhaust Plume ────────────────────────────────────────────────────────

  private _drawExhaustPlume(rocket: Rocket, scale: number, throttle: number): void {
    const ctx = this.ctx;
    const totalH = rocket.parts.reduce((s, p) => s + p.def.renderH * scale, 0);
    // Plume starts at the bottom of the stack (in local coords, +y is down)
    const plumeY = totalH / 2;
    const plumeLen = (80 + throttle * 120) * scale;
    const plumeW   = (22 + throttle * 18) * scale;

    const grad = ctx.createLinearGradient(0, plumeY, 0, plumeY + plumeLen);
    grad.addColorStop(0,    THEME.exhaustCore);
    grad.addColorStop(0.08, THEME.exhaustMid);
    grad.addColorStop(0.4,  THEME.engineFire);
    grad.addColorStop(1,    THEME.exhaustEdge);

    ctx.save();
    // Flicker
    const flicker = 1 + (Math.sin(this.time * 40) * 0.05 + Math.cos(this.time * 67) * 0.03);
    ctx.scale(flicker, 1);

    ctx.beginPath();
    ctx.moveTo(0, plumeY);
    ctx.bezierCurveTo(
      plumeW / 2, plumeY + plumeLen * 0.3,
      plumeW * 0.7, plumeY + plumeLen * 0.6,
      0, plumeY + plumeLen,
    );
    ctx.bezierCurveTo(
      -plumeW * 0.7, plumeY + plumeLen * 0.6,
      -plumeW / 2, plumeY + plumeLen * 0.3,
      0, plumeY,
    );
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner core (bright white)
    const coreLen = plumeLen * 0.25;
    const coreGrad = ctx.createLinearGradient(0, plumeY, 0, plumeY + coreLen);
    coreGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.ellipse(0, plumeY + coreLen / 2, plumeW * 0.18, coreLen / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    ctx.restore();
  }

  // ─── Heat Glow ────────────────────────────────────────────────────────────

  private _drawHeatGlow(_rocket: Rocket, scale: number, intensity: number): void {
    const ctx = this.ctx;
    const glowR = (80 + intensity * 200) * scale;

    // Glow is centred on the rocket body
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    const alpha = Math.min(intensity * 0.85, 0.75);
    grad.addColorStop(0,   `rgba(255,220,80,${alpha})`);
    grad.addColorStop(0.3, `rgba(255,100,0,${alpha * 0.6})`);
    grad.addColorStop(0.7, `rgba(200,0,0,${alpha * 0.2})`);
    grad.addColorStop(1,   'rgba(200,0,0,0)');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ─── Plasma Effect (reentry) ──────────────────────────────────────────────

  private _drawPlasma(_rocket: Rocket, scale: number, intensity: number): void {
    const ctx = this.ctx;
    const t    = this.time;
    const streakR = (50 + intensity * 150) * scale;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Draw 14 arcing plasma streaks around the rocket
    for (let i = 0; i < 14; i++) {
      const phase   = (i / 14) * Math.PI * 2 + t * 4.5;
      const spread  = 0.4 + intensity * 0.6;
      const startA  = phase - spread;
      const endA    = phase + spread;
      const r       = streakR * (0.6 + Math.sin(t * 7 + i) * 0.4);

      const hue    = 180 + Math.sin(t * 3 + i) * 40;   // cyan → blue range
      const alpha  = intensity * (0.5 + Math.sin(t * 5 + i * 1.3) * 0.3);

      ctx.beginPath();
      ctx.arc(0, 0, r, startA, endA);
      ctx.strokeStyle = `hsla(${hue},100%,75%,${alpha.toFixed(2)})`;
      ctx.lineWidth   = (3 + Math.sin(t * 11 + i) * 2) * scale;
      ctx.stroke();
    }

    // Bright core shock
    const shockGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, streakR * 0.5);
    shockGrad.addColorStop(0, `rgba(200,240,255,${intensity * 0.5})`);
    shockGrad.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.beginPath();
    ctx.arc(0, 0, streakR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = shockGrad;
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ─── VAB Preview ──────────────────────────────────────────────────────────

  /**
   * Draw the rocket stack in the VAB build area, sitting on the launchpad.
   * @param cx       Centre-X of the build area in screen pixels
   * @param bottomY  Y coordinate of the launchpad line in screen pixels
   * @returns        Screen bounds for each rendered part (used for click-to-remove)
   */
  renderVABRocket(
    rocket: Rocket,
    cx: number,
    bottomY: number,
  ): Array<{id: string, x: number, y: number, w: number, h: number}> {
    const ctx = this.ctx;
    if (rocket.parts.length === 0) return [];

    // Auto-scale so the rocket fits in the available vertical space
    const available = bottomY - 40;   // 40 px top margin
    const naturalH  = rocket.parts.reduce((s, p) => s + p.def.renderH, 0);
    const scale = naturalH > 0 ? Math.min(1.8, available / naturalH) : 1.8;

    const bounds: Array<{id: string, x: number, y: number, w: number, h: number}> = [];

    ctx.save();
    let yBottom = bottomY;   // start at launchpad, build upward

    for (const part of rocket.parts) {   // slot 0 = bottom (engine end) → drawn first, lowest on screen
      const w = part.def.renderW * scale;
      const h = part.def.renderH * scale;
      const x = cx - w / 2;
      const y = yBottom - h;

      bounds.push({ id: part.id, x, y, w, h });

      // Body
      ctx.fillStyle = part.def.color;
      this._roundRect(x, y, w, h, 4);
      ctx.fill();

      // Edge highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      this._roundRect(x, y, w, h, 4);
      ctx.stroke();

      // Decorations (nozzle, window, fuel bar, etc.)
      this._drawPartDecoration(part.def.type, x, y, w, h, scale, part);

      // Part name label
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '9px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(part.def.name.slice(0, 14), cx, y + h * 0.55);

      yBottom -= h;
    }

    // Attachment node at the top of the stack (snap target indicator)
    const topY = yBottom;
    ctx.beginPath();
    ctx.arc(cx, topY, 5, 0, Math.PI * 2);
    ctx.fillStyle = THEME.accent;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, topY, 9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,212,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
    return bounds;
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  /**
   * Draw the in-flight HUD overlay (screen-space, no transform needed).
   */
  renderHUD(rocket: Rocket, frame: PhysicsFrame, throttle: number, currentStage: number, missionTime: number): void {
    const ctx = this.ctx;
    const { W, H } = this;

    // ── Left panel: Altitude / Velocity ───────────────────────────────────
    const panelX = 16, panelY = 16, panelW = 220, panelH = 202;
    this._drawPanel(panelX, panelY, panelW, panelH);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px Courier New';
    ctx.textAlign = 'left';

    const alt    = frame.altitude;
    const altStr = alt < 1000
      ? `${alt.toFixed(0)} m`
      : alt < 1_000_000
        ? `${(alt / 1000).toFixed(2)} km`
        : `${(alt / 1_000_000).toFixed(4)} Mm`;

    const rows: [string, string][] = [
      ['ALT',  altStr],
      ['SPD',  `${frame.speed.toFixed(1)} m/s`],
      ['VERT', `${frame.verticalSpeed > 0 ? '+' : ''}${frame.verticalSpeed.toFixed(1)} m/s`],
      ['MACH', `${frame.mach.toFixed(2)}`],
      ['Q',    `${(frame.dynamicPressure / 1000).toFixed(2)} kPa`],
      ['ΔV',   `${rocket.getDeltaV().toFixed(0)} m/s`],
      ['T+',   this._formatTime(missionTime)],
      ['ATMO', frame.atmoLayerName],
    ];

    rows.forEach(([label, value], i) => {
      const ry = panelY + 22 + i * 22;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, panelX + 10, ry);
      ctx.fillStyle = THEME.text;
      ctx.fillText(value, panelX + 60, ry);
    });

    // ── Right panel: Fuel gauges ───────────────────────────────────────────
    const fuelX = W - 200, fuelY = 16, fuelW = 184, fuelH = 100;
    this._drawPanel(fuelX, fuelY, fuelW, fuelH);

    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', fuelX + 10, fuelY + 20);

    const tanks = rocket.parts.filter(p => p.def.maxFuelMass > 0);
    tanks.forEach((tank, i) => {
      const by = fuelY + 35 + i * 18;
      const bw = fuelW - 60;
      const frac = tank.fuelRemaining / tank.def.maxFuelMass;

      // Background bar
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(fuelX + 10, by, bw, 10);

      // Filled portion
      const col = frac > 0.5 ? THEME.success : frac > 0.2 ? THEME.warning : THEME.danger;
      ctx.fillStyle = col;
      ctx.fillRect(fuelX + 10, by, bw * frac, 10);

      // Label
      ctx.fillStyle = THEME.textDim;
      ctx.font = '9px Courier New';
      ctx.fillText(`${(frac * 100).toFixed(0)}%`, fuelX + bw + 14, by + 9);
    });

    // ── Bottom centre: Stage indicator ────────────────────────────────────
    const stageW = 240, stageH = 44;
    const stageX = (W - stageW) / 2, stageY = H - stageH - 16;
    this._drawPanel(stageX, stageY, stageW, stageH);

    ctx.textAlign = 'center';
    ctx.fillStyle = THEME.textDim;
    ctx.font = '10px Courier New';
    ctx.fillText('STAGE [SPACE]', W / 2, stageY + 14);

    ctx.fillStyle = THEME.accent;
    ctx.font = 'bold 16px Courier New';
    const totalStages = rocket.stages.length;
    ctx.fillText(
      totalStages > 0 ? `${currentStage + 1} / ${totalStages}` : '—',
      W / 2, stageY + 34,
    );

    // ── Bottom right: Throttle ────────────────────────────────────────────
    const thrX = W - 60, thrY = H - 160;
    ctx.fillStyle = THEME.textDim;
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('THR', thrX, thrY - 8);

    // Bar background
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(thrX - 12, thrY, 24, 120);

    // Bar fill (bottom to top)
    const thrCol = throttle > 0.7 ? THEME.danger : throttle > 0.3 ? THEME.warning : THEME.success;
    ctx.fillStyle = thrCol;
    ctx.fillRect(thrX - 12, thrY + 120 * (1 - throttle), 24, 120 * throttle);

    ctx.fillStyle = THEME.text;
    ctx.fillText(`${Math.round(throttle * 100)}%`, thrX, thrY + 134);

    // ── Heat warning ─────────────────────────────────────────────────────
    if (frame.heatingIntensity > 0.1) {
      const heatAlpha = Math.min(frame.heatingIntensity, 1);
      ctx.fillStyle = `rgba(255,80,0,${(heatAlpha * 0.25).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = `rgba(255,140,0,${heatAlpha.toFixed(2)})`;
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(
        frame.heatingIntensity > 0.7 ? '⚠ CRITICAL HEATING ⚠' : '⚠ HEATING',
        W / 2, H / 2 - 20,
      );
    }

    // ── Controls hint (fades after 10 seconds) ───────────────────────────
    if (missionTime < 10) {
      const alpha = Math.max(0, 1 - missionTime / 8);
      ctx.fillStyle = `rgba(100,160,200,${alpha})`;
      ctx.font = '11px Courier New';
      ctx.textAlign = 'right';
      const hints = ['Shift/Ctrl — Throttle', 'Z — Full  X — Cut', 'A/D — Rotate', 'SPACE — Stage', 'M — Map'];
      hints.forEach((h, i) => ctx.fillText(h, W - 20, H - 20 - i * 16));
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Convert a world-space position to screen-space pixels */
  private _worldToScreen(worldPos: Vec2, cam: Camera): Vec2 {
    return {
      x: this.W / 2 + (worldPos.x - cam.focus.x) / cam.metersPerPixel,
      // Note: world +Y is up, canvas +Y is down → negate
      y: this.H / 2 - (worldPos.y - cam.focus.y) / cam.metersPerPixel,
    };
  }

  /** Draw a dark panel with cyan border */
  private _drawPanel(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,15,25,0.82)';
    this._roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    this._roundRect(x, y, w, h, 6);
    ctx.stroke();
  }

  /** Path a rounded rectangle (does not fill/stroke — caller does) */
  private _roundRect(x: number, y: number, w: number, h: number, r: number): void {
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

  private _formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
}

// Import needed after class definition to avoid circular dependency issues
import type { PartInstance } from './Part';
