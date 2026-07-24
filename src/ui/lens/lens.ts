// Public lens controller: mounts the canonical Canvas 2D renderer onto a
// canvas, drives it with a rAF loop (or a single static frame under reduced
// motion), and exposes running/palette/pulsing state + press feedback.

import { drawLens, type LensConfig } from "./lens-draw";

export type LensPalette = "green" | "amber";

export type LensState = {
  readonly running: boolean;
  readonly palette: LensPalette;
  readonly pulsing: boolean;
};

export interface LensController {
  update(state: LensState): void;
  setPressed(pressed: boolean): void;
  destroy(): void;
}

const PALETTES: Record<
  LensPalette,
  { readonly accent: string; readonly orb1: string; readonly orb2: string }
> = {
  green: { accent: "#15803d", orb1: "#009938", orb2: "#2bff7a" },
  amber: { accent: "#f59e0b", orb1: "#fbbf24", orb2: "#b45309" },
};

// Logical canvas box: larger than the 160px button so the halo + depth shadow
// bleed has room; the renderer centres the button in it.
const LOGICAL = 260;
const PULSE_PERIOD_MS = 2600;
const PULSE_AMPLITUDE = 0.18;

const NOOP: LensController = {
  update() {},
  setPressed() {},
  destroy() {},
};

function buildConfig(state: LensState): LensConfig {
  const p = PALETTES[state.palette];
  return {
    running: state.running,
    accent: p.accent,
    orb1: p.orb1,
    orb2: p.orb2,
    bodyInner: "#15151d",
    bodyOuter: "#080810",
    buttonSize: 160,
    iconRatio: 0.4,
    bodyRadius: 1.6,
    veilAlpha: 0.19,
    insetWidth: 0.21,
    insetAlpha: 0.75,
    specAlpha: 0.12,
    specWidth: 0.04,
    innerIdle: 0.055,
    innerRunning: 0.205,
    innerWidth: 0.12,
    irisPeak: 0.34,
    irisSettled: 0.18,
    iconStrokeColor: "#000000",
    iconStrokeWidth: 1,
    iconStrokeBlur: 5.5,
    iconStrokeAlpha: 0.72,
  };
}

// Exponential smoothing toward a target with time constant tau (ms).
function approach(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

function currentDpr(): number {
  return typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

export function mountLens(canvas: HTMLCanvasElement, state: LensState): LensController {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }
  if (context === null) {
    return NOOP; // happy-dom / no 2D backend — unit tests stay DOM-only.
  }
  const ctx = context;

  // Backing store follows devicePixelRatio; re-applied whenever the dpr changes
  // (browser zoom, dragging the window to a display with a different scale).
  let dpr = currentDpr();
  const applyBacking = (): void => {
    canvas.width = LOGICAL * dpr;
    canvas.height = LOGICAL * dpr;
    canvas.style.width = `${LOGICAL}px`;
    canvas.style.height = `${LOGICAL}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const syncDpr = (): void => {
    const next = currentDpr();
    if (next !== dpr) {
      dpr = next;
      applyBacking();
    }
  };
  applyBacking();

  let current = state;
  let cfg = buildConfig(current);
  let pressed = false;
  let pressT = 0;
  let irisT = current.running ? 1 : 0;

  const paintStatic = (): void => {
    syncDpr();
    drawLens(ctx, cfg, LOGICAL, {
      time: 0,
      pressT: 0,
      irisT: current.running ? 1 : 0,
      haloPulse: 0,
    });
  };

  let raf: number | null = null;
  let last = 0;
  const loop = (now: number): void => {
    syncDpr();
    const dt = Math.min(64, now - last);
    last = now;
    pressT = approach(pressT, pressed ? 1 : 0, dt, 90);
    irisT = approach(irisT, current.running ? 1 : 0, dt, 160);
    const haloPulse = current.pulsing
      ? PULSE_AMPLITUDE * (0.5 + 0.5 * Math.sin((now / PULSE_PERIOD_MS) * 2 * Math.PI))
      : 0;
    drawLens(ctx, cfg, LOGICAL, { time: now, pressT, irisT, haloPulse });
    raf = requestAnimationFrame(loop);
  };
  const startLoop = (): void => {
    if (raf !== null) {
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const stopLoop = (): void => {
    if (raf === null) {
      return;
    }
    cancelAnimationFrame(raf);
    raf = null;
  };

  // Static (reduced-motion) mode has no rAF loop to re-check the dpr, so watch a
  // resolution query and re-init the backing + redraw when it fires; the query
  // pins the current dppx, so each fire must re-subscribe to the new one.
  let dppxMql: MediaQueryList | null = null;
  function stopDppxWatch(): void {
    dppxMql?.removeEventListener("change", onDppxChange);
    dppxMql = null;
  }
  function onDppxChange(): void {
    syncDpr();
    paintStatic();
    watchDppx();
  }
  function watchDppx(): void {
    if (typeof matchMedia !== "function") {
      return;
    }
    stopDppxWatch();
    dppxMql = matchMedia(`(resolution: ${currentDpr()}dppx)`);
    dppxMql.addEventListener("change", onDppxChange);
  }

  const mql =
    typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const onMotionChange = (): void => {
    if (mql?.matches) {
      stopLoop();
      paintStatic();
      watchDppx();
    } else {
      stopDppxWatch();
      startLoop();
    }
  };
  mql?.addEventListener("change", onMotionChange);

  if (mql?.matches) {
    paintStatic();
    watchDppx();
  } else {
    startLoop();
  }

  return {
    update(next) {
      current = next;
      cfg = buildConfig(next);
      if (raf === null) {
        paintStatic(); // reduced-motion: no loop, so repaint the static frame now.
      }
    },
    setPressed(next) {
      pressed = next;
    },
    destroy() {
      stopLoop();
      stopDppxWatch();
      mql?.removeEventListener("change", onMotionChange);
    },
  };
}
