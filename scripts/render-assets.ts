import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const SIZES = [16, 32, 48, 128] as const;

function plateHtml(size: number, inner: string): string {
  const radius = Math.round((size * 26) / 128);
  return `<!doctype html><style>
    html, body { margin: 0; background: transparent; }
    .plate { width: ${size}px; height: ${size}px; border-radius: ${radius}px;
      background: #0a0a0d; display: grid; place-items: center; overflow: hidden; }
    svg { width: ${Math.round(size * 0.66)}px; height: auto; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  </style><div class="plate">${inner}</div>`;
}

const mark = await readFile("assets/brand/dropweb-logo.svg", "utf8");
const colorIcon = await readFile("assets/brand/icon-color.png");
const header = await readFile("assets/brand/header.png");
const colorSrc = `data:image/png;base64,${colorIcon.toString("base64")}`;
const headerSrc = `data:image/png;base64,${header.toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir("public/icons", { recursive: true });

for (const size of SIZES) {
  const variants: readonly [string, string][] = [
    ["off", mark],
    ["problem", mark.replaceAll("#FAFAFA", "#F59E0B")],
    ["on", `<img src="${colorSrc}">`],
  ];
  for (const [name, inner] of variants) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(plateHtml(size, inner));
    const shot = await page.screenshot({ omitBackground: true, type: "png" });
    await writeFile(`public/icons/${name}-${size}.png`, shot);
  }
}

await page.setViewportSize({ width: 1200, height: 220 });
await page.setContent(`<!doctype html><style>html,body{margin:0}</style>`);
const dataUrl = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new RangeError("no 2d context");
  const scale = Math.max(1200 / img.width, 220 / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (1200 - dw) / 2, (220 - dh) * 0.38, dw, dh);
  return canvas.toDataURL("image/webp", 0.8);
}, headerSrc);
const payload = dataUrl.split(",")[1];
if (payload === undefined) throw new RangeError("webp encode failed");
await writeFile("src/assets/header-strip.webp", Buffer.from(payload, "base64"));
await browser.close();
