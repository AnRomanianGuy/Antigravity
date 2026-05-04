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
import { PhysicsFrame, R_EARTH, MAX_HEAT_FLUX } from './Physics';

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

  /** Hit areas for warp buttons — updated each HUD render, read by Game.ts */
  warpDownBtn = { x: 0, y: 0, w: 28, h: 28 };
  warpUpBtn   = { x: 0, y: 0, w: 28, h: 28 };

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

    // Ascent aerodynamic compression (q-based: white/blue streaks, orange sparks at extreme q)
    if (frame.dynamicPressure > 5_000 && Math.abs(frame.noseExposure) > 0.05) {
      this._drawAscentAero(rocket, partScale, frame);
    }

    // Thermal heating / reentry plasma (heatFlux-based, renders on top of compression)
    if (frame.heatFlux > 200 && Math.abs(frame.noseExposure) > 0.05) {
      this._drawAeroHeating(rocket, partScale, frame);
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

    // Only draw when ground is within or just at the screen edge
    if (ls.y < -300 || ls.y > this.H + 5) return;

    const ctx = this.ctx;

    // Grass and soil as arcs — follows Earth curvature at any altitude
    const earthCentre = this._worldToScreen({ x: 0, y: 0 }, cam);
    const R_px   = R_EARTH / mpp;
    const grassH = Math.max(3, Math.min(18, 18 / mpp));

    // Bright grass ring at surface
    ctx.beginPath();
    ctx.arc(earthCentre.x, earthCentre.y, R_px - grassH * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#4aaa30';
    ctx.lineWidth = grassH;
    ctx.stroke();

    // Dark soil ring just inside
    ctx.beginPath();
    ctx.arc(earthCentre.x, earthCentre.y, R_px - grassH * 2.8, 0, Math.PI * 2);
    ctx.strokeStyle = '#2a5820';
    ctx.lineWidth = grassH * 3;
    ctx.stroke();

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

  /** Half-width of the standard centre stack (px, unscaled) — used for radial offset */
  private static readonly STACK_HALF_W = 22;
  /** Gap between main stack edge and radial part edge (px, unscaled) */
  private static readonly RADIAL_GAP = 6;

  /**
   * Draw all parts centred at origin (0,0) in local rocket space.
   * Radial parts (SRBs) are drawn offset left and right with struts.
   */
  private _drawRocketParts(rocket: Rocket, scale: number): void {
    const ctx = this.ctx;
    if (rocket.parts.length === 0) return;

    const totalH = rocket.parts.reduce((s, p) => p.def.radialMount ? s : s + p.def.renderH * scale, 0);
    let yBottom = totalH / 2;

    const mainHW  = Renderer.STACK_HALF_W  * scale;
    const radGap  = Renderer.RADIAL_GAP    * scale;

    for (const part of rocket.parts) {
      const w = part.def.renderW * scale;
      const h = part.def.renderH * scale;
      const y = yBottom - h;

      if (part.def.radialMount) {
        const sideOffset = mainHW + radGap + w / 2;

        for (const side of [-1, 1] as const) {
          const bx = side * sideOffset - w / 2;
          if (part.isDestroyed) {
            // Charred remnant
            ctx.fillStyle = '#1a1008';
            this._roundRect(bx, y, w, h, 3 * scale);
            ctx.fill();
          } else {
            ctx.fillStyle = part.def.color;
            this._roundRect(bx, y, w, h, 3 * scale);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1 * scale;
            this._roundRect(bx, y, w, h, 3 * scale);
            ctx.stroke();
            this._drawPartDecoration(part.def.type, bx, y, w, h, scale, part);
            this._drawPartHeatGlow(ctx, bx, y, w, h, part.currentTemperature, scale);
          }
        }

        // Struts
        ctx.strokeStyle = 'rgba(160,170,180,0.55)';
        ctx.lineWidth = 2 * scale;
        for (const strutFrac of [0.25, 0.68]) {
          const sy = y + h * strutFrac;
          for (const side of [-1, 1] as const) {
            ctx.beginPath();
            ctx.moveTo(side * mainHW, sy);
            ctx.lineTo(side * (mainHW + radGap + w), sy);
            ctx.stroke();
          }
        }
      } else {
        const x = -w / 2;
        if (part.isDestroyed) {
          ctx.fillStyle = '#1a1008';
          this._roundRect(x, y, w, h, 3 * scale);
          ctx.fill();
        } else {
          ctx.fillStyle = part.def.color;
          this._roundRect(x, y, w, h, 3 * scale);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 1 * scale;
          this._roundRect(x, y, w, h, 3 * scale);
          ctx.stroke();
          this._drawPartDecoration(part.def.type, x, y, w, h, scale, part);
          this._drawPartHeatGlow(ctx, x, y, w, h, part.currentTemperature, scale);
        }
      }

      if (!part.def.radialMount) yBottom -= h;
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
        // Nozzle bell — compact, for atmospheric use
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
      case PartType.ENGINE_VACUUM: {
        // Large expansion-ratio bell — wide, trumpet-shaped for vacuum
        const bellW = w * 1.55;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.3, y + h * 0.55);
        ctx.lineTo(x + w * 0.7, y + h * 0.55);
        ctx.bezierCurveTo(
          x + w * 0.75, y + h * 0.75,
          x + (w + bellW) / 2, y + h * 0.88,
          x + (w + bellW) / 2, y + h,
        );
        ctx.lineTo(x + (w - bellW) / 2, y + h);
        ctx.bezierCurveTo(
          x + (w - bellW) / 2, y + h * 0.88,
          x + w * 0.25, y + h * 0.75,
          x + w * 0.3, y + h * 0.55,
        );
        ctx.fillStyle = '#2a4a6a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,160,220,0.4)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();
        // Engine core / injector plate
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.42, w * 0.18, h * 0.12, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a6a9a';
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
      case PartType.SRB: {
        // Nosecone tip
        ctx.beginPath();
        ctx.moveTo(x + w * 0.5, y);
        ctx.lineTo(x + w * 0.12, y + h * 0.18);
        ctx.lineTo(x + w * 0.88, y + h * 0.18);
        ctx.closePath();
        ctx.fillStyle = '#6a4a3a';
        ctx.fill();
        // Nozzle (compact, for solid motor)
        ctx.beginPath();
        ctx.moveTo(x + w * 0.22, y + h * 0.88);
        ctx.lineTo(x + w * 0.78, y + h * 0.88);
        ctx.lineTo(x + w * 0.68, y + h);
        ctx.lineTo(x + w * 0.32, y + h);
        ctx.closePath();
        ctx.fillStyle = '#2a1a0a';
        ctx.fill();
        // Left fin
        const finW = w * 0.5, finH = h * 0.28;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x - finW * 0.8, y + h);
        ctx.lineTo(x, y + h - finH);
        ctx.closePath();
        ctx.fillStyle = '#3a2212';
        ctx.fill();
        // Right fin
        ctx.beginPath();
        ctx.moveTo(x + w, y + h);
        ctx.lineTo(x + w + finW * 0.8, y + h);
        ctx.lineTo(x + w, y + h - finH);
        ctx.closePath();
        ctx.fillStyle = '#3a2212';
        ctx.fill();
        // Body stripe
        ctx.fillStyle = 'rgba(255,200,100,0.25)';
        ctx.fillRect(x + w * 0.1, y + h * 0.4, w * 0.8, h * 0.1);
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
      case PartType.ENGINE_VAC_ADV: {
        // Extravagant expansion bell — wider than ENGINE_VACUUM, dark blue
        const bellW = w * 1.85;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.32, y + h * 0.5);
        ctx.lineTo(x + w * 0.68, y + h * 0.5);
        ctx.bezierCurveTo(
          x + w * 0.72, y + h * 0.72,
          x + (w + bellW) / 2, y + h * 0.90,
          x + (w + bellW) / 2, y + h,
        );
        ctx.lineTo(x + (w - bellW) / 2, y + h);
        ctx.bezierCurveTo(
          x + (w - bellW) / 2, y + h * 0.90,
          x + w * 0.28, y + h * 0.72,
          x + w * 0.32, y + h * 0.5,
        );
        ctx.fillStyle = '#1a3a6a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,140,255,0.5)';
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();
        // Injector core
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.38, w * 0.16, h * 0.10, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#4a8acc';
        ctx.fill();
        // Blue accent ring
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.38, w * 0.24, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(80,160,255,0.35)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();
        break;
      }
      case PartType.FUEL_TANK_XL: {
        // Fuel level bar (same style as S/L but with tick marks)
        const frac = part.def.maxFuelMass > 0 ? part.fuelRemaining / part.def.maxFuelMass : 0;
        const barH = (h - 10 * scale) * frac;
        ctx.fillStyle = frac > 0.3 ? 'rgba(0,200,100,0.35)' : 'rgba(255,80,0,0.45)';
        ctx.fillRect(x + w * 0.2, y + (h - 5 * scale) - barH, w * 0.6, barH);
        // Horizontal weld lines (structural detail)
        ctx.strokeStyle = 'rgba(150,180,200,0.25)';
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
      case PartType.COMMAND_POD_ADV: {
        // Larger visor window + side thrusters
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.38, w * 0.28, h * 0.20, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,200,255,0.65)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,212,255,0.6)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();
        // Side RCS nubs
        ctx.fillStyle = '#2a6a9a';
        ctx.fillRect(x - 3 * scale, y + h * 0.6, 5 * scale, 3 * scale);
        ctx.fillRect(x + w - 2 * scale, y + h * 0.6, 5 * scale, 3 * scale);
        // Antenna nub
        ctx.fillStyle = '#88aacc';
        ctx.fillRect(x + w * 0.44, y, w * 0.12, 4 * scale);
        break;
      }
      case PartType.HEAT_SHIELD_HEAVY: {
        // Thick ablative surface — dark with orange heat-soak tinting
        ctx.fillStyle = 'rgba(200,60,0,0.18)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(x + 2 * scale, y + 2 * scale, w - 4 * scale, h * 0.45);
        // Chevron pattern on surface
        ctx.strokeStyle = 'rgba(200,100,0,0.3)';
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
      case PartType.DECOUPLER_HEAVY: {
        // Thick orange-amber separation band with bolts
        ctx.fillStyle = '#cc7700';
        ctx.fillRect(x, y + h * 0.25, w, h * 0.5);
        // Bolt dots
        ctx.fillStyle = '#ffcc66';
        const boltCount = 5;
        for (let i = 0; i < boltCount; i++) {
          const bx = x + w * ((i + 0.5) / boltCount);
          ctx.beginPath();
          ctx.arc(bx, y + h * 0.5, 2 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  }

  // ─── Exhaust Plume ────────────────────────────────────────────────────────

  /** Draw a single exhaust plume centred at (cx, plumeY) pointing down in local space */
  private _drawOnePlume(cx: number, plumeY: number, scale: number, throttle: number, small = false): void {
    const ctx     = this.ctx;
    const lenMult = small ? 0.60 : 1.0;
    const plumeLen = (80 + throttle * 120) * scale * lenMult;
    const plumeW   = (small ? 14 : 22) * scale + throttle * (small ? 10 : 18) * scale;

    const grad = ctx.createLinearGradient(cx, plumeY, cx, plumeY + plumeLen);
    grad.addColorStop(0,    THEME.exhaustCore);
    grad.addColorStop(0.08, THEME.exhaustMid);
    grad.addColorStop(0.4,  THEME.engineFire);
    grad.addColorStop(1,    THEME.exhaustEdge);

    ctx.beginPath();
    ctx.moveTo(cx, plumeY);
    ctx.bezierCurveTo(
      cx + plumeW / 2, plumeY + plumeLen * 0.3,
      cx + plumeW * 0.7, plumeY + plumeLen * 0.6,
      cx, plumeY + plumeLen,
    );
    ctx.bezierCurveTo(
      cx - plumeW * 0.7, plumeY + plumeLen * 0.6,
      cx - plumeW / 2, plumeY + plumeLen * 0.3,
      cx, plumeY,
    );
    ctx.fillStyle = grad;
    ctx.fill();

    const coreLen = plumeLen * 0.25;
    const coreGrad = ctx.createLinearGradient(cx, plumeY, cx, plumeY + coreLen);
    coreGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.ellipse(cx, plumeY + coreLen / 2, plumeW * 0.18, coreLen / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();
  }

  private _drawExhaustPlume(rocket: Rocket, scale: number, throttle: number): void {
    const ctx     = this.ctx;
    const totalH  = rocket.parts.reduce((s, p) => p.def.radialMount ? s : s + p.def.renderH * scale, 0);
    const stackBottom = totalH / 2;

    const mainHW = Renderer.STACK_HALF_W * scale;
    const radGap = Renderer.RADIAL_GAP   * scale;

    const flicker = 1 + Math.sin(this.time * 40) * 0.05 + Math.cos(this.time * 67) * 0.03;
    ctx.save();
    ctx.scale(flicker, 1);

    // ── Centre-stack engine plume (non-radial thrusting engines) ─────────────
    const hasCentreThrust = rocket.parts.some(p => p.isThrusting && !p.def.radialMount);
    if (hasCentreThrust) {
      this._drawOnePlume(0, stackBottom, scale, throttle, false);
    }

    // ── SRB side plumes ───────────────────────────────────────────────────────
    // Walk the stack to find each radial (SRB) part's bottom Y position
    let yBot = totalH / 2;
    for (const part of rocket.parts) {
      const h = part.def.renderH * scale;
      if (part.def.radialMount && part.isThrusting) {
        const srbHW    = part.def.renderW * scale / 2;
        const sideX    = mainHW + radGap + srbHW;
        // plume from bottom of this SRB on each side
        this._drawOnePlume(-sideX, yBot, scale, 1.0, true);
        this._drawOnePlume( sideX, yBot, scale, 1.0, true);
      }
      if (!part.def.radialMount) yBot -= h;
    }

    ctx.restore();
  }

  // ─── Per-part Temperature Glow ───────────────────────────────────────────

  private _drawPartHeatGlow(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    temp: number,
    _scale: number,
  ): void {
    if (temp < 450) return;
    const t = Math.min((temp - 450) / 1550, 1); // 0 at 450K, 1 at 2000K+
    let r: number, g: number, b: number, a: number;
    if (t < 0.33) {
      // orange glow
      const u = t / 0.33;
      r = 255; g = Math.round(120 - u * 80); b = 0; a = 0.18 + u * 0.18;
    } else if (t < 0.66) {
      // red
      const u = (t - 0.33) / 0.33;
      r = 255; g = Math.round(40 - u * 40); b = Math.round(u * 60); a = 0.36 + u * 0.18;
    } else {
      // pink/white-hot
      const u = (t - 0.66) / 0.34;
      r = 255; g = Math.round(u * 180); b = Math.round(60 + u * 195); a = 0.54 + u * 0.30;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
    this._roundRect(x, y, w, h, 2);
    ctx.fill();
    ctx.restore();
  }

  // ─── Ascent Aerodynamic Compression ─────────────────────────────────────

  /** Dynamic pressure thresholds (Pa) governing ascent visual tiers */
  private static readonly Q_STREAK_START =  5_000;   // subtle haze begins
  private static readonly Q_STREAK_FULL  = 25_000;   // full white/blue streaks
  private static readonly Q_ORANGE_START = 45_000;   // orange tint + Max-Q warning
  private static readonly Q_EXTREME      = 80_000;   // extreme orange sparks

  /**
   * Draw ascent-phase aerodynamic compression effects in local rocket space.
   * Effect tiers:
   *   5–25 kPa  : faint blue/white compression haze + thin streaks
   *  25–45 kPa  : stronger streaks + edge lines
   *  45–80 kPa  : haze turns orange, streaks turn orange, sparks appear
   */
  private _drawAscentAero(rocket: Rocket, scale: number, frame: PhysicsFrame): void {
    const q = frame.dynamicPressure;
    if (q < Renderer.Q_STREAK_START) return;

    const noseExp  = frame.noseExposure;
    const exposure = Math.abs(noseExp);
    if (exposure < 0.05) return;

    const ctx = this.ctx;
    const t   = this.time;

    const totalH = rocket.parts.reduce((s, p) => p.def.radialMount ? s : s + p.def.renderH * scale, 0);
    const halfH  = totalH / 2;
    const maxW   = rocket.parts.reduce((m, p) => Math.max(m, p.def.renderW * scale), 44 * scale);

    // noseExp < 0 → nose (top, localY = -halfH) is windward during ascent
    const noseIsWindward = noseExp < 0;
    const windwardY = noseIsWindward ? -halfH :  halfH;
    const streamSgn = noseIsWindward ?      1 :     -1;

    // Normalised intensity fractions
    const qFrac   = Math.min((q - Renderer.Q_STREAK_START) /
                             (Renderer.Q_EXTREME - Renderer.Q_STREAK_START), 1.0);
    const qOrange = Math.max(0, (q - Renderer.Q_ORANGE_START) /
                                (Renderer.Q_EXTREME - Renderer.Q_ORANGE_START));

    // Lightweight seeded "random" (same result every frame → no flicker at rest)
    const frand = (seed: number): number => {
      let s = (seed ^ 0xf00dcafe) >>> 0;
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
      return (s ^ (s >>> 16)) / 0xffffffff;
    };

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // ── Compression haze cap at windward face ─────────────────────────────
    {
      const hazeR  = maxW * (0.45 + qFrac * 0.95);
      const hazeOY = windwardY - streamSgn * hazeR * 0.30;
      const hazeA  = qFrac * 0.17 * exposure;

      const haze = ctx.createRadialGradient(0, hazeOY, 0, 0, windwardY, hazeR);
      if (qOrange <= 0) {
        haze.addColorStop(0,   `rgba(195,228,255,${(hazeA * 1.25).toFixed(2)})`);
        haze.addColorStop(0.45,`rgba(110,175,255,${(hazeA * 0.50).toFixed(2)})`);
        haze.addColorStop(1,   'rgba(55,115,255,0)');
      } else {
        const ob = Math.min(qOrange, 1);
        const g  = Math.round(228 - ob * 150);
        haze.addColorStop(0,   `rgba(255,${g},${Math.round(255*(1-ob))},${(hazeA * 1.35).toFixed(2)})`);
        haze.addColorStop(0.4, `rgba(255,${Math.round(g*0.45)},0,${(hazeA * 0.45).toFixed(2)})`);
        haze.addColorStop(1,   'rgba(200,30,0,0)');
      }

      ctx.beginPath();
      ctx.ellipse(0, windwardY, hazeR * 0.50, hazeR, 0, 0, Math.PI * 2);
      ctx.fillStyle = haze;
      ctx.fill();
    }

    // ── Airflow streaks flowing from windward face ────────────────────────
    {
      const numStreaks = Math.floor(2 + qFrac * 11);
      const streakLen  = totalH * (0.22 + qFrac * 0.62);
      const halfSpread = maxW * 0.56;

      for (let i = 0; i < numStreaks; i++) {
        const sp    = 1.7 + frand(i * 11) * 2.6;
        const phase = (t * sp + frand(i * 7 + 1)) % 1.0;
        if (phase > 0.85) continue;

        const alpha = qFrac * exposure * (0.48 - phase * 0.55);
        if (alpha < 0.015) continue;

        const xOff  = (frand(i * 19 + 2) - 0.5) * halfSpread * 2;
        const xEnd  = xOff * (0.22 + frand(i * 29 + 3) * 0.44);
        const startY = windwardY + streamSgn * phase * streakLen * 0.06;
        const endY   = windwardY + streamSgn * phase * streakLen;

        let stroke: string;
        if (qOrange <= 0) {
          stroke = `hsla(${200 + frand(i)*22},68%,88%,${alpha.toFixed(2)})`;
        } else {
          const hue = Math.round(200 - Math.min(qOrange, 1) * 172);
          stroke = `hsla(${hue},90%,80%,${alpha.toFixed(2)})`;
        }

        ctx.beginPath();
        ctx.moveTo(xOff, startY);
        ctx.quadraticCurveTo(xOff * 0.52, (startY + endY) * 0.5, xEnd, endY);
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = (0.4 + frand(i * 37) * 0.9) * scale;
        ctx.stroke();
      }
    }

    // ── Edge compression lines along rocket body sides ────────────────────
    if (qFrac > 0.15) {
      const edgeA = (qFrac - 0.15) / 0.85 * 0.32 * exposure;
      const bodyHW = maxW * 0.50;

      for (const side of [-1, 1] as const) {
        const ex = side * bodyHW;
        const gStart = windwardY;
        const gEnd   = windwardY + streamSgn * halfH * 1.6;
        const eGrad  = ctx.createLinearGradient(0, gStart, 0, gEnd);

        if (qOrange <= 0) {
          eGrad.addColorStop(0,    `rgba(180,218,255,${edgeA.toFixed(2)})`);
          eGrad.addColorStop(0.55, `rgba(110,170,255,${(edgeA * 0.38).toFixed(2)})`);
          eGrad.addColorStop(1,    'rgba(60,110,255,0)');
        } else {
          const ob = Math.min(qOrange, 1);
          eGrad.addColorStop(0,    `rgba(255,${Math.round(200 - ob*155)},55,${edgeA.toFixed(2)})`);
          eGrad.addColorStop(0.5,  `rgba(255,70,0,${(edgeA * 0.32).toFixed(2)})`);
          eGrad.addColorStop(1,    'rgba(220,30,0,0)');
        }

        ctx.beginPath();
        ctx.moveTo(ex, -halfH);
        ctx.lineTo(ex,  halfH);
        ctx.strokeStyle = eGrad;
        ctx.lineWidth   = (0.7 + qFrac * 1.3) * scale;
        ctx.stroke();
      }
    }

    // ── Orange sparks at extreme dynamic pressure ─────────────────────────
    if (qOrange > 0) {
      const sparkCount = Math.floor(qOrange * 5);
      for (let i = 0; i < sparkCount; i++) {
        const sp    = 3.0 + frand(i * 41) * 4.0;
        const phase = (t * sp + frand(i * 53)) % 1.0;
        if (phase > 0.46) continue;

        const sx = (frand(i * 61 + 7) - 0.5) * maxW * 0.72;
        const sy = windwardY + streamSgn * phase * maxW * 1.05;
        const sr = (0.65 + frand(i * 71) * 1.9) * scale;
        const sa = Math.min((0.46 - phase) * 2.2 * qOrange, 0.92);

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${Math.round(90 + frand(i*83)*90)},0,${sa.toFixed(2)})`;
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ─── Directional Aerodynamic Heating ─────────────────────────────────────

  /**
   * Draw windward-side heating effect in local rocket space (after ctx.translate+rotate).
   * noseExposure < 0 → nose (local y = -halfH) is windward.
   * noseExposure > 0 → tail (local y = +halfH) is windward.
   */
  private _drawAeroHeating(rocket: Rocket, scale: number, frame: PhysicsFrame): void {
    const ctx       = this.ctx;
    const t         = this.time;
    const intensity = Math.min(frame.heatFlux / MAX_HEAT_FLUX, 1.0);
    const exposure  = Math.abs(frame.noseExposure);
    if (intensity < 0.01 || exposure < 0.05) return;

    const totalH = rocket.parts.reduce((s, p) => p.def.radialMount ? s : s + p.def.renderH * scale, 0);
    const halfH  = totalH / 2;
    // Widest part — governs glow spread
    const maxW   = rocket.parts.reduce((m, p) => Math.max(m, p.def.renderW * scale), 44 * scale);

    // noseExposure < 0 → nose (top, localY=-halfH) is windward
    const noseIsWindward = frame.noseExposure < 0;
    const windwardY = noseIsWindward ? -halfH : halfH;
    const streamSgn = noseIsWindward ? 1 : -1;  // +1 = streams flow downward (nose→tail)

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // ── Shock cap / bow-wave glow ─────────────────────────────────────────
    const glowRadius = maxW * (0.8 + intensity * 1.4);
    const glowOffY   = windwardY - streamSgn * glowRadius * 0.35; // slightly beyond face
    const shock = ctx.createRadialGradient(0, glowOffY, 0, 0, windwardY, glowRadius);

    if (intensity < 0.35) {
      const a = intensity * 2.5;
      shock.addColorStop(0, `rgba(255,200,60,${(a * 0.9).toFixed(2)})`);
      shock.addColorStop(0.45, `rgba(255,80,0,${(a * 0.5).toFixed(2)})`);
      shock.addColorStop(1, 'rgba(255,40,0,0)');
    } else if (intensity < 0.65) {
      const a = 0.7 + (intensity - 0.35) * 0.6;
      shock.addColorStop(0, `rgba(255,120,60,${a.toFixed(2)})`);
      shock.addColorStop(0.35, `rgba(255,20,80,${(a * 0.65).toFixed(2)})`);
      shock.addColorStop(1, 'rgba(200,0,120,0)');
    } else {
      const a = 0.88;
      shock.addColorStop(0, `rgba(255,240,255,${a.toFixed(2)})`);
      shock.addColorStop(0.25, `rgba(200,40,255,${(a * 0.75).toFixed(2)})`);
      shock.addColorStop(0.7, `rgba(80,0,200,${(a * 0.3).toFixed(2)})`);
      shock.addColorStop(1, 'rgba(40,0,100,0)');
    }

    ctx.beginPath();
    ctx.ellipse(0, windwardY, glowRadius * 0.65, glowRadius, 0, 0, Math.PI * 2);
    ctx.fillStyle = shock;
    ctx.fill();

    // ── Plasma streaks trailing from windward face ────────────────────────
    const numStreaks = Math.floor(5 + intensity * 12);
    const streakLen  = totalH * (0.4 + intensity * 1.2);
    const halfSpread = maxW * 0.55;

    // Lightweight deterministic "random" for streak positions
    const frand = (seed: number) => {
      let s = (seed ^ 0xdeadbeef) >>> 0;
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
      return (s ^ (s >>> 16)) / 0xffffffff;
    };

    for (let i = 0; i < numStreaks; i++) {
      const speed  = 1.5 + frand(i * 7)    * 2.5;
      const phase  = (t * speed + frand(i * 13)) % 1.0;
      if (phase > 0.82) continue;  // brief gap at wrap

      const alpha  = intensity * exposure * (0.7 - phase * 0.85);
      if (alpha < 0.02) continue;

      const xOff   = (frand(i * 17 + 1) - 0.5) * halfSpread * 2;
      const xEnd   = xOff * (0.3 + frand(i * 23) * 0.5);  // converge toward axis
      const startY = windwardY + streamSgn * phase * streakLen * 0.08;
      const endY   = windwardY + streamSgn * phase * streakLen;

      // Colour: orange→red→pink/purple based on intensity
      const hue = intensity < 0.35 ? 25 + frand(i) * 15
                : intensity < 0.65 ? 355 + frand(i) * 20
                : 285 + frand(i) * 40;
      const sat = intensity < 0.65 ? 100 : 80 + frand(i * 3) * 20;

      ctx.beginPath();
      ctx.moveTo(xOff, startY);
      ctx.quadraticCurveTo(xOff * 0.6, (startY + endY) / 2, xEnd, endY);
      ctx.strokeStyle = `hsla(${hue},${sat}%,72%,${alpha.toFixed(2)})`;
      ctx.lineWidth   = (0.8 + frand(i * 31) * 1.4) * scale;
      ctx.stroke();
    }

    // ── Bright stagnation point core ─────────────────────────────────────
    if (intensity > 0.2) {
      const coreR  = maxW * 0.18 * intensity;
      const pulse  = 0.85 + Math.sin(t * 18) * 0.15;
      const coreA  = intensity * exposure * 0.9 * pulse;
      const coreGrad = ctx.createRadialGradient(0, windwardY, 0, 0, windwardY, coreR);
      coreGrad.addColorStop(0, `rgba(255,255,255,${coreA.toFixed(2)})`);
      coreGrad.addColorStop(0.5, intensity > 0.6
        ? `rgba(220,120,255,${(coreA * 0.6).toFixed(2)})`
        : `rgba(255,160,60,${(coreA * 0.6).toFixed(2)})`);
      coreGrad.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.beginPath();
      ctx.arc(0, windwardY, coreR, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ─── VAB Preview ──────────────────────────────────────────────────────────

  /** Stage badge colors — index = stage number */
  static readonly STAGE_COLORS = ['#44cc66', '#ccaa22', '#cc6622', '#cc2222', '#8833cc'];

  /**
   * Draw the rocket stack in the VAB build area, sitting on the launchpad.
   * @param cx              Centre-X of the build area in screen pixels
   * @param bottomY         Y coordinate of the launchpad line in screen pixels
   * @param showStageBadges Whether to draw stage number badges on engines/decouplers/SRBs
   * @returns               Screen bounds for each rendered part
   */
  renderVABRocket(
    rocket: Rocket,
    cx: number,
    bottomY: number,
    showStageBadges = false,
  ): Array<{id: string, x: number, y: number, w: number, h: number}> {
    const ctx = this.ctx;
    if (rocket.parts.length === 0) return [];

    // Auto-scale so the rocket fits in the available vertical space
    // Radial parts share vertical space with the centre stack — exclude them from height
    const available = bottomY - 40;   // 40 px top margin
    const naturalH  = rocket.parts.reduce((s, p) => p.def.radialMount ? s : s + p.def.renderH, 0);
    const scale = naturalH > 0 ? Math.min(1.8, available / naturalH) : 1.8;

    const bounds: Array<{id: string, x: number, y: number, w: number, h: number}> = [];

    const mainHW = Renderer.STACK_HALF_W * scale;
    const radGap = Renderer.RADIAL_GAP   * scale;

    ctx.save();
    let yBottom = bottomY;

    for (const part of rocket.parts) {
      const w = part.def.renderW * scale;
      const h = part.def.renderH * scale;
      const y = yBottom - h;

      if (part.def.radialMount) {
        // Two side boosters — store separate hit bounds for each
        const sideOffset = mainHW + radGap + w / 2;

        for (const side of [-1, 1] as const) {
          const bx = cx + side * sideOffset - w / 2;
          bounds.push({ id: part.id, x: bx, y, w, h });

          ctx.fillStyle = part.def.color;
          this._roundRect(bx, y, w, h, 4);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1;
          this._roundRect(bx, y, w, h, 4);
          ctx.stroke();
          this._drawPartDecoration(part.def.type, bx, y, w, h, scale, part);
        }

        // Struts
        ctx.strokeStyle = 'rgba(160,170,180,0.5)';
        ctx.lineWidth = Math.max(1, 1.5 * scale);
        for (const strutFrac of [0.28, 0.70]) {
          const sy = y + h * strutFrac;
          for (const side of [-1, 1] as const) {
            ctx.beginPath();
            ctx.moveTo(cx + side * mainHW, sy);
            ctx.lineTo(cx + side * (mainHW + radGap + w), sy);
            ctx.stroke();
          }
        }

        // Stage badge on the right booster
        if (showStageBadges) {
          const si  = part.stageIndex;
          const bCol = si >= 0 && si < Renderer.STAGE_COLORS.length ? Renderer.STAGE_COLORS[si] : '#444';
          const bLbl = si >= 0 ? `S${si}` : '–';
          const rbx  = cx + (mainHW + radGap + w / 2) - w / 2 + w - 1;  // right edge of right booster
          const bby  = y + 10;
          ctx.beginPath();
          ctx.arc(rbx, bby, 10, 0, Math.PI * 2);
          ctx.fillStyle = bCol; ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = si >= 0 ? '#000' : '#aaa';
          ctx.font = 'bold 8px Courier New'; ctx.textAlign = 'center';
          ctx.fillText(bLbl, rbx, bby + 3);
        }
      } else {
        const x = cx - w / 2;
        bounds.push({ id: part.id, x, y, w, h });

        ctx.fillStyle = part.def.color;
        this._roundRect(x, y, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        this._roundRect(x, y, w, h, 4);
        ctx.stroke();
        this._drawPartDecoration(part.def.type, x, y, w, h, scale, part);

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(part.def.name.slice(0, 14), cx, y + h * 0.55);

        if (showStageBadges && (isEnginePart(part.def.type) || isDecouplerPart(part.def.type))) {
          const si  = part.stageIndex;
          const bCol = si >= 0 && si < Renderer.STAGE_COLORS.length ? Renderer.STAGE_COLORS[si] : '#444';
          const bLbl = si >= 0 ? `S${si}` : '–';
          const bx2  = x + w - 1;
          const by2  = y + 10;
          ctx.beginPath();
          ctx.arc(bx2, by2, 10, 0, Math.PI * 2);
          ctx.fillStyle = bCol; ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = si >= 0 ? '#000' : '#aaa';
          ctx.font = 'bold 8px Courier New'; ctx.textAlign = 'center';
          ctx.fillText(bLbl, bx2, by2 + 3);
        }
      }

      if (!part.def.radialMount) yBottom -= h;
    }

    // Attachment node at the top of the stack
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

  // ─── VAB Ghost (dragged part) ─────────────────────────────────────────────

  /**
   * Draw a semi-transparent ghost of a part centred at (cx, cy).
   * Radial parts (SRBs) are shown as a pair.
   */
  renderVABGhost(type: PartType, cx: number, cy: number): void {
    const ctx   = this.ctx;
    const def   = PART_CATALOGUE[type];
    const scale = 1.5;
    const w = def.renderW * scale;
    const h = def.renderH * scale;

    const fake = {
      def, fuelRemaining: def.maxFuelMass,
      isActive: false, stageIndex: -1, slotIndex: 0, id: '__ghost__',
    } as unknown as PartInstance;

    const drawOne = (bx: number, by: number) => {
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
      const mainHW = Renderer.STACK_HALF_W * scale;
      const radGap = Renderer.RADIAL_GAP   * scale;
      const sideOffset = mainHW + radGap + w / 2;
      for (const side of [-1, 1] as const) {
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
  renderHUD(rocket: Rocket, frame: PhysicsFrame, throttle: number, currentStage: number, missionTime: number, warpFactor = 1): void {
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
      // Colour-code the Q row: white → warning → danger at Max-Q
      if (label === 'Q') {
        ctx.fillStyle = frame.dynamicPressure > Renderer.Q_ORANGE_START ? THEME.danger
                      : frame.dynamicPressure > Renderer.Q_STREAK_FULL  ? THEME.warning
                      : THEME.text;
      } else {
        ctx.fillStyle = THEME.text;
      }
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

    // ── Max-Q warning ─────────────────────────────────────────────────────
    if (frame.dynamicPressure > Renderer.Q_ORANGE_START) {
      const qFrac  = Math.min((frame.dynamicPressure - Renderer.Q_ORANGE_START) / 40_000, 1);
      const pulse  = 0.70 + Math.sin(this.time * 9) * 0.30;
      const qAlpha = qFrac * pulse * 0.88;
      // Subtle screen tint (blue — compression, not heat)
      ctx.fillStyle = `rgba(80,120,255,${(qFrac * 0.10).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,${Math.round(190 - qFrac * 90)},0,${qAlpha.toFixed(2)})`;
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('MAX-Q', W / 2, H / 2 + 8);
    }

    // ── Heat warning ─────────────────────────────────────────────────────
    const heatIntensity = Math.min(frame.heatFlux / MAX_HEAT_FLUX, 1);
    if (heatIntensity > 0.08) {
      ctx.fillStyle = `rgba(255,60,0,${(heatIntensity * 0.22).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = `rgba(255,140,0,${Math.min(heatIntensity * 1.2, 1).toFixed(2)})`;
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      const noShield = heatIntensity > 0.55;
      ctx.fillText(
        noShield ? '⚠ CRITICAL HEATING ⚠' : '⚠ HEATING',
        W / 2, H / 2 - 20,
      );
    }

    // ── Bottom left: Warp control ─────────────────────────────────────────
    const warpPanelW = 160, warpPanelH = 44;
    const warpPanelX = 16, warpPanelY = H - warpPanelH - 16;
    this._drawPanel(warpPanelX, warpPanelY, warpPanelW, warpPanelH);

    const btnW = 28, btnH = 28;
    const btnY = warpPanelY + (warpPanelH - btnH) / 2;
    this.warpDownBtn = { x: warpPanelX + 6,                          y: btnY, w: btnW, h: btnH };
    this.warpUpBtn   = { x: warpPanelX + warpPanelW - 6 - btnW,     y: btnY, w: btnW, h: btnH };

    // ◀ decrease button
    const atMin = warpFactor === 1;
    ctx.fillStyle = atMin ? 'rgba(255,255,255,0.08)' : THEME.accentDim;
    this._roundRect(this.warpDownBtn.x, this.warpDownBtn.y, btnW, btnH, 4);
    ctx.fill();
    ctx.fillStyle = atMin ? THEME.textDim : THEME.accent;
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('◀', this.warpDownBtn.x + btnW / 2, this.warpDownBtn.y + 19);

    // ▶ increase button
    const atMax = warpFactor === 10;
    ctx.fillStyle = atMax ? 'rgba(255,255,255,0.08)' : THEME.accentDim;
    this._roundRect(this.warpUpBtn.x, this.warpUpBtn.y, btnW, btnH, 4);
    ctx.fill();
    ctx.fillStyle = atMax ? THEME.textDim : THEME.accent;
    ctx.fillText('▶', this.warpUpBtn.x + btnW / 2, this.warpUpBtn.y + 19);

    // Centre: warp multiplier label
    ctx.fillStyle = warpFactor > 1 ? THEME.warning : THEME.textDim;
    ctx.font = warpFactor > 1 ? 'bold 14px Courier New' : '12px Courier New';
    ctx.fillText(`×${warpFactor}`, warpPanelX + warpPanelW / 2, warpPanelY + 20);
    ctx.fillStyle = THEME.textDim;
    ctx.font = '9px Courier New';
    ctx.fillText('WARP [,  .]', warpPanelX + warpPanelW / 2, warpPanelY + 35);

    // ── Controls hint (fades after 10 seconds) ───────────────────────────
    if (missionTime < 10) {
      const alpha = Math.max(0, 1 - missionTime / 8);
      ctx.fillStyle = `rgba(100,160,200,${alpha})`;
      ctx.font = '11px Courier New';
      ctx.textAlign = 'right';
      const hints = ['Shift/Ctrl — Throttle', 'Z — Full  X — Cut', 'A/D — Rotate', 'SPACE — Stage', 'M — Map', '. / , — Warp'];
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

  // ─── Burn Guidance (flight HUD overlay when a maneuver node exists) ───────

  /**
   * Render a burn guidance panel when there is an active maneuver node.
   * Shows: time to node, total ΔV, heading alignment indicator.
   */
  renderBurnGuidance(
    rocket: Rocket,
    node: { time: number; progradeDV: number; normalDV: number; executed: boolean } | null,
    missionTime: number,
  ): void {
    if (!node || node.executed) return;

    const totalDV = Math.hypot(node.progradeDV, node.normalDV);
    if (totalDV < 0.5) return;

    const ctx = this.ctx;
    const { W, H } = this;
    const timeToNode = node.time - missionTime;

    // ── Compute desired burn direction ──────────────────────────────────────
    const vel = rocket.body.vel;
    const pos = rocket.body.pos;
    const speed = Math.hypot(vel.x, vel.y);

    const prograde  = speed > 1 ? { x: vel.x / speed, y: vel.y / speed } : { x: 0, y: 1 };
    const posLen    = Math.hypot(pos.x, pos.y);
    const radialOut = posLen > 0 ? { x: pos.x / posLen, y: pos.y / posLen } : { x: 0, y: 1 };

    const burnX = node.progradeDV * prograde.x + node.normalDV * radialOut.x;
    const burnY = node.progradeDV * prograde.y + node.normalDV * radialOut.y;
    const burnLen = Math.hypot(burnX, burnY);
    const burnDir = burnLen > 0 ? { x: burnX / burnLen, y: burnY / burnLen } : prograde;

    // Desired heading = atan2(burnDir.x, burnDir.y)  (angle=0 → nose points +Y)
    const desiredAngle = Math.atan2(burnDir.x, burnDir.y);
    const currentAngle = rocket.body.angle;
    let angleDiff = desiredAngle - currentAngle;
    while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    const aligned = Math.abs(angleDiff) < 0.05; // ~3°

    // ── Panel layout ───────────────────────────────────────────────────────
    const pw = 260, ph = 116;
    const px = (W - pw) / 2;
    const py = H / 2 - ph - 20;   // just above screen centre

    this._drawPanel(px, py, pw, ph);

    // Header
    ctx.fillStyle = timeToNode < 30 ? THEME.danger : THEME.warning;
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('▶ MANEUVER NODE', W / 2, py + 17);

    // ── Left text info ─────────────────────────────────────────────────────
    const leftX = px + 12;
    const rows: [string, string, string][] = [
      ['ΔV',  `${totalDV.toFixed(0)} m/s`,  THEME.accent],
      ['T−',  timeToNode <= 0 ? 'BURN NOW' : this._fmtNodeTime(timeToNode),
              timeToNode < 30 ? THEME.danger : THEME.text],
    ];

    rows.forEach(([label, value, color], i) => {
      const ry = py + 36 + i * 20;
      ctx.fillStyle = THEME.textDim;
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(label, leftX, ry);
      ctx.fillStyle = color;
      ctx.fillText(value, leftX + 36, ry);
    });

    // Heading error text
    const errDeg = (angleDiff * 180 / Math.PI).toFixed(1);
    const alignStr = aligned ? '✓ ALIGNED' : `HDG ${Number(errDeg) > 0 ? '+' : ''}${errDeg}°`;
    ctx.fillStyle = aligned ? THEME.success : THEME.warning;
    ctx.font = 'bold 10px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText(alignStr, leftX, py + 80);

    // ── Heading alignment circle (right side) ─────────────────────────────
    const cxc = px + pw - 50;
    const cyc = py + ph / 2 + 4;
    const cr  = 36;

    // Outer ring
    ctx.beginPath();
    ctx.arc(cxc, cyc, cr, 0, Math.PI * 2);
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Alignment fill arc (shows how far off)
    if (!aligned) {
      const arcEnd = -Math.PI / 2 + angleDiff;
      ctx.beginPath();
      ctx.moveTo(cxc, cyc);
      ctx.arc(cxc, cyc, cr - 4, -Math.PI / 2, arcEnd, angleDiff < 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,170,0,0.18)`;
      ctx.fill();
    }

    // Desired heading arrow (green)
    const da = desiredAngle - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cxc + Math.cos(da) * (cr - 8), cyc + Math.sin(da) * (cr - 8));
    ctx.lineTo(cxc + Math.cos(da) * 6,        cyc + Math.sin(da) * 6);
    ctx.strokeStyle = THEME.success;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Current heading arrow (white)
    const ca = currentAngle - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cxc + Math.cos(ca) * (cr - 8), cyc + Math.sin(ca) * (cr - 8));
    ctx.lineTo(cxc + Math.cos(ca) * 6,        cyc + Math.sin(ca) * 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.70)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Centre dot
    ctx.beginPath();
    ctx.arc(cxc, cyc, 3, 0, Math.PI * 2);
    ctx.fillStyle = THEME.text;
    ctx.fill();
  }

  private _fmtNodeTime(s: number): string {
    if (s < 60) return `${Math.ceil(s)}s`;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}m ${String(sec).padStart(2, '0')}s`;
  }
}

// Import needed after class definition to avoid circular dependency issues
import { PartInstance, PART_CATALOGUE, isEnginePart, isDecouplerPart } from './Part';
