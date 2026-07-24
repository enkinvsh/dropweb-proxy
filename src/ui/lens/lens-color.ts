// Color helpers ported from dropweb-site/public/theme/index.html (~348-403).
// The theme's colour-filter machinery is dropped: the popup renders at the
// "fidelity" variant, so effAccent/effOrb are the identity and only the
// orb-glow lightness lift survives (used by the aurora core + holo ring).

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex: string, a: number): string {
  const c = hexToRgb(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

export function mix(h1: string, h2: string, t: number): string {
  const a = hexToRgb(h1);
  const b = hexToRgb(h2);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

export function mixA(h1: string, a1: number, h2: string, a2: number, t: number): string {
  const c1 = hexToRgb(h1);
  const c2 = hexToRgb(h2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  const a = a1 + (a2 - a1) * t;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lum(hex: string): number {
  const c = hexToRgb(hex);
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

function hexToHsl(hex: string): { readonly h: number; readonly s: number; readonly l: number } {
  const c = hexToRgb(hex);
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const cc = (1 - Math.abs(2 * l - 1)) * s;
  const x = cc * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - cc / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = cc;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = cc;
  } else if (hh < 180) {
    g = cc;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = cc;
  } else if (hh < 300) {
    r = x;
    b = cc;
  } else {
    r = cc;
    b = x;
  }
  const to = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// orbGlow (port of home.dart orbGlow): drop near-black orbs to a fallback,
// then lift merely-dark orbs to a lightness floor of 0.5 so the hue still
// reads on the dark glass.
export function orbGlow(hex: string, fallback: string): string {
  if (lum(hex) < 0.04) {
    return fallback;
  }
  const { h, s, l } = hexToHsl(hex);
  return l < 0.5 ? hslToHex(h, s, 0.5) : hex;
}
