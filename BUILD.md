# Building Dropweb Proxy from source

These instructions let a reviewer (e.g. addons.mozilla.org) reproduce the exact
packaged add-on from this source.

## Toolchain

- **Bun 1.3.14** (this project uses Bun, **not** npm/node). Node.js is not required.
- WXT 0.20.27 (build powered by Vite/Rollup + esbuild). Standard minification only —
  **no obfuscation** is used.
- Lockfile: `bun.lock` (committed) pins every dependency version.

> ⚠️ The default AMO reviewer environment ships Node/npm. This project builds with
> **Bun** instead — please install Bun first (one command, no Node needed).

## Prerequisites

```bash
# Install Bun (macOS/Linux)
curl -fsSL https://bun.sh/install | bash
# then restart your shell, or: export PATH="$HOME/.bun/bin:$PATH"
bun --version   # expect 1.3.x
```

## Build

```bash
bun install --frozen-lockfile   # installs pinned deps from bun.lock
bun run zip:firefox             # builds + packages the Firefox add-on
```

## Output

- Packaged add-on: `.output/dropweb-proxy-<version>-firefox.zip`
  — this is the file uploaded to AMO.
- Unpacked build (for inspection): `.output/firefox-mv3/`

For Chrome: `bun run zip:chrome` → `.output/dropweb-proxy-<version>-chrome.zip`.

## Verify (optional)

```bash
bun run check   # Biome lint + strict TypeScript
bun run test    # unit tests (Vitest)
```

Build configuration lives in `wxt.config.ts` and `package.json`. The extension
source is under `src/` and static assets under `public/`.
