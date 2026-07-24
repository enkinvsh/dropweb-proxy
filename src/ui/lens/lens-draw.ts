// Canvas 2D lens renderer — a strict-TS port of the draw()/glyph pipeline in
// dropweb-site/public/theme/index.html (~413-660). Same layer order and
// constants; the simulator UI, magic rings (ringsOn=false) and the 3-orb
// background mesh (the popup keeps its own single .orb) are omitted.

import { clamp01, mix, mixA, orbGlow, rgba } from "./lens-color";

export type LensConfig = {
  readonly running: boolean;
  readonly accent: string;
  readonly orb1: string;
  readonly orb2: string;
  readonly bodyInner: string;
  readonly bodyOuter: string;
  readonly buttonSize: number;
  readonly iconRatio: number;
  readonly bodyRadius: number;
  readonly veilAlpha: number;
  readonly insetWidth: number;
  readonly insetAlpha: number;
  readonly specAlpha: number;
  readonly specWidth: number;
  readonly innerIdle: number;
  readonly innerRunning: number;
  readonly innerWidth: number;
  readonly irisPeak: number;
  readonly irisSettled: number;
  readonly iconStrokeColor: string;
  readonly iconStrokeWidth: number;
  readonly iconStrokeBlur: number;
  readonly iconStrokeAlpha: number;
};

export type LensDynamics = {
  readonly time: number;
  readonly pressT: number;
  readonly irisT: number;
  readonly haloPulse: number;
};

// HugeIcons strokeRoundedPower (viewBox 24x24), exactly as the app. Built
// lazily so happy-dom (no Path2D) never touches it — the popup unit tests
// mount the lens against a null 2D context and this is never reached.
let powerPaths: readonly Path2D[] | null = null;
function getPowerPaths(): readonly Path2D[] {
  if (powerPaths === null) {
    powerPaths = [
      new Path2D(
        "M18.7083 6C20.1334 7.59227 21 9.69494 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 9.69494 3.86656 7.59227 5.29168 6",
      ),
      new Path2D("M12 3V12"),
    ];
  }
  return powerPaths;
}

function clipCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
}

// Draw a set of viewBox-24 paths scaled to display size s. lineWidth/blur are
// in display px (the context carries no scale), so stroke weights are intuitive.
function drawGlyphPaths(
  ctx: CanvasRenderingContext2D,
  paths: readonly Path2D[],
  s: number,
  lineWidth: number,
  strokeStyle: string | CanvasGradient,
  blurPx: number,
): void {
  const k = s / 24;
  const m = new DOMMatrix();
  m.scaleSelf(k, k);
  m.translateSelf(-12, -12);
  ctx.save();
  if (blurPx > 0) {
    ctx.filter = `blur(${blurPx}px)`;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const bp of paths) {
    const tp = new Path2D();
    tp.addPath(bp, m);
    ctx.stroke(tp);
  }
  ctx.restore();
}

function drawPowerIcon(
  ctx: CanvasRenderingContext2D,
  cfg: LensConfig,
  cx: number,
  cy: number,
  pressT: number,
  irisT: number,
): void {
  const iconSize = cfg.buttonSize * cfg.iconRatio;
  const iconScale = cfg.running ? 1 : 0.94; // dormant: slight squeeze (hasProfile)
  const s = iconSize * iconScale;
  const color = cfg.running ? cfg.accent : mix("#15151d", cfg.accent, 0.28);
  const k = s / 24;
  const baseLW = (pressT > 0 ? 3 : 2) * k;
  const paths = getPowerPaths();
  ctx.save();
  ctx.translate(cx, cy);
  // Dark under-stroke: the same path, thicker + blurred, beneath the glyph.
  if (cfg.iconStrokeAlpha > 0 && cfg.iconStrokeWidth > 0) {
    drawGlyphPaths(
      ctx,
      paths,
      s,
      baseLW + cfg.iconStrokeWidth * 2,
      rgba(cfg.iconStrokeColor, cfg.iconStrokeAlpha),
      cfg.iconStrokeBlur,
    );
  }
  drawGlyphPaths(ctx, paths, s, baseLW, color, 0);
  // Glyph Fresnel rim (port of _rimGlyph): white-top / accent-sides conic
  // sweep stroked onto the same paths, alive only, at globalAlpha 0.75.
  if (cfg.running || irisT > 0.01) {
    const rim = ctx.createConicGradient(-Math.PI / 2, 0, 0.625 * iconSize);
    rim.addColorStop(0, rgba("#ffffff", 1));
    rim.addColorStop(0.25, rgba(cfg.accent, 0.5));
    rim.addColorStop(0.5, rgba("#ffffff", 0.12));
    rim.addColorStop(0.75, rgba(cfg.accent, 0.5));
    rim.addColorStop(1, rgba("#ffffff", 1));
    ctx.save();
    ctx.globalAlpha = 0.75;
    drawGlyphPaths(ctx, paths, s, baseLW, rim, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function drawLens(
  ctx: CanvasRenderingContext2D,
  cfg: LensConfig,
  logical: number,
  dyn: LensDynamics,
): void {
  const { time, pressT, irisT, haloPulse } = dyn;
  ctx.clearRect(0, 0, logical, logical);
  const cx = logical / 2;
  const cy = logical / 2;
  const r = cfg.buttonSize / 2;
  const accent = cfg.accent;
  const running = cfg.running;
  const auraT = (time / 1000 / 8) % 1; // 8s aurora-drift / holo-rotation phase
  const auroraLive = irisT;
  const orbPrimary = orbGlow(cfg.orb1, accent);
  const orbSecondary = orbGlow(cfg.orb2, orbPrimary);

  // outer perimeter halo (haloPulse adds the applying heartbeat)
  const haloAlpha = clamp01(0.2 + 0.39 * irisT + pressT * 0.18 + haloPulse);
  const haloBlur = 16 + pressT * 10;
  ctx.save();
  const og = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r + haloBlur);
  og.addColorStop(0, rgba(accent, haloAlpha));
  og.addColorStop(0.6, rgba(accent, haloAlpha * 0.5));
  og.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = og;
  ctx.beginPath();
  ctx.arc(cx, cy, r + haloBlur, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // dark depth shadows under the lens
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, r - 6), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 1. body
  ctx.save();
  const byc = cy + 0.25 * r;
  const bodyR = cfg.bodyRadius * r;
  const bg = ctx.createRadialGradient(cx, byc, 0, cx, byc, bodyR);
  bg.addColorStop(0, cfg.bodyInner);
  bg.addColorStop(0.55, cfg.bodyInner);
  bg.addColorStop(1, cfg.bodyOuter);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. accent veil
  ctx.save();
  clipCircle(ctx, cx, cy, r);
  const vyc = cy - 0.15 * r;
  const vg = ctx.createRadialGradient(cx, vyc, 0, cx, vyc, 0.9 * r);
  vg.addColorStop(0, rgba(accent, cfg.veilAlpha));
  vg.addColorStop(0.55, rgba(accent, cfg.veilAlpha * 0.38));
  vg.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = vg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2b. aurora mesh core — three drifting colour blobs through the glass
  if (auroraLive > 0.01) {
    const ang = auraT * 2 * Math.PI;
    ctx.save();
    clipCircle(ctx, cx, cy, r);
    const blob = (color: string, a: number, ox: number, oy: number, br: number): void => {
      const px = cx + ox * r;
      const py = cy + oy * r;
      const rad = br * r;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, rgba(color, a * auroraLive));
      g.addColorStop(1, rgba(color, 0));
      ctx.save();
      ctx.filter = `blur(${0.2 * r}px)`;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    blob(accent, 0.22, 0.3 * Math.cos(ang) - 0.12, 0.3 * Math.sin(ang) - 0.08, 0.8);
    blob(
      orbPrimary,
      0.2,
      0.28 * Math.cos(ang + 2.1) + 0.18,
      0.28 * Math.sin(ang + 2.1) + 0.12,
      0.78,
    );
    blob(orbSecondary, 0.168, 0.24 * Math.cos(ang + 4.2), 0.24 * Math.sin(ang + 4.2) + 0.22, 0.78);
    ctx.restore();
  }

  // 3. concave inset (dark bottom arc, blurred)
  if (cfg.insetWidth > 0 && cfg.insetAlpha > 0) {
    ctx.save();
    clipCircle(ctx, cx, cy, r - 1);
    ctx.filter = `blur(${0.045 * r}px)`;
    const cg = ctx.createConicGradient(-Math.PI / 2, cx, cy);
    cg.addColorStop(0, "rgba(0, 0, 0, 0)");
    cg.addColorStop(0.08, "rgba(0, 0, 0, 0)");
    cg.addColorStop(0.5, rgba("#000000", cfg.insetAlpha));
    cg.addColorStop(0.92, "rgba(0, 0, 0, 0)");
    cg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.strokeStyle = cg;
    ctx.lineWidth = cfg.insetWidth * r;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.085 * r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.filter = "none";
    ctx.restore();
  }

  // 4. top specular arc
  if (cfg.specAlpha > 0) {
    ctx.save();
    ctx.filter = `blur(${0.04 * r}px)`;
    ctx.strokeStyle = rgba("#ffffff", cfg.specAlpha);
    ctx.lineWidth = cfg.specWidth * r;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy + 0.025 * r, r - 0.045 * r, -Math.PI * 0.78, -Math.PI * 0.78 + Math.PI * 0.55);
    ctx.stroke();
    ctx.filter = "none";
    ctx.restore();
  }

  // 5. inner edge glow
  const innerAlpha = (running ? cfg.innerRunning : cfg.innerIdle) + pressT * 0.16;
  if (innerAlpha > 0.005) {
    ctx.save();
    clipCircle(ctx, cx, cy, r);
    ctx.filter = `blur(${0.055 * r}px)`;
    ctx.strokeStyle = rgba(accent, innerAlpha);
    ctx.lineWidth = cfg.innerWidth * r;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.035 * r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.filter = "none";
    ctx.restore();
  }

  // 5b. iris bloom
  if (irisT > 0.001) {
    const settled = cfg.irisSettled;
    const peak = cfg.irisPeak;
    const overshoot = (peak - settled) * 4 * irisT * (1 - irisT);
    const irisAlpha = clamp01(settled * irisT + overshoot);
    if (irisAlpha > 0.001) {
      ctx.save();
      clipCircle(ctx, cx, cy, r);
      const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      ig.addColorStop(0, rgba(accent, irisAlpha));
      ig.addColorStop(0.55, rgba(accent, irisAlpha * 0.4));
      ig.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 6. rim — alive: rotating iridescent holo ring + white lip; dormant: Fresnel.
  if (irisT > 0.01) {
    const rot = auraT * (8 / 3) * 2 * Math.PI - Math.PI / 2;
    const hg = ctx.createConicGradient(rot, cx, cy);
    hg.addColorStop(0, rgba(accent, irisT));
    hg.addColorStop(0.33, rgba(orbPrimary, irisT));
    hg.addColorStop(0.67, rgba(orbSecondary, irisT));
    hg.addColorStop(1, rgba(accent, irisT));
    ctx.save();
    ctx.strokeStyle = hg;
    ctx.lineWidth = r * 0.021;
    ctx.beginPath();
    ctx.arc(cx, cy, r - r * 0.015, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba("#ffffff", 0.18 * irisT);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else {
    const rimBoost = 1 / 0.55;
    const rb = (a: number): number => clamp01(a * rimBoost);
    const rimTop = mixA("#ffffff", rb(0.6), accent, rb(0.35), 0.41);
    const rimSide = mixA("#ffffff", rb(0.14), accent, rb(0.18), 0.369);
    const rimBottom = rgba("#ffffff", rb(0.05));
    const warmTop =
      pressT > 0
        ? mixA("#ffffff", rb(0.6), accent, rb(0.6), Math.min(1, 0.41 + pressT * 0.6))
        : rimTop;
    const warmSide =
      pressT > 0
        ? mixA("#ffffff", rb(0.14), accent, rb(0.3), Math.min(1, 0.369 + pressT * 0.45))
        : rimSide;
    ctx.save();
    const rg = ctx.createConicGradient(-Math.PI / 2, cx, cy);
    rg.addColorStop(0, warmTop);
    rg.addColorStop(0.25, warmSide);
    rg.addColorStop(0.5, rimBottom);
    rg.addColorStop(0.75, warmSide);
    rg.addColorStop(1, warmTop);
    ctx.strokeStyle = rg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawPowerIcon(ctx, cfg, cx, cy, pressT, irisT);
}
