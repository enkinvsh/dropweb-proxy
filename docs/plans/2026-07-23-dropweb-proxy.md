# Dropweb Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a compact extension that stores one local HTTP or SOCKS5 proxy configuration and explicitly enables or disables it.

**Architecture:** Shared strict TypeScript provides configuration, storage, locales, and vanilla UI. The background owns the controller and target adapter: Chrome writes `fixed_servers`; Firefox writes static `proxy.settings`. Popup and options exchange typed messages only.

**Tech Stack:** Bun with `bun.lock`, WXT `~0.20.27`, strict TypeScript, vanilla HTML/CSS/TS, Biome, Vitest/WxtVitest, Playwright, and native RU/EN extension localization.

---

## Fixed Scope

- Support exactly `HTTP` and `SOCKS5`, with no third protocol or credentials.
- First install persists `HTTP`, `127.0.0.1`, port `7890`, bypass `localhost`, `127.0.0.1`, `::1`, and status `off`.
- Manifest permissions are exactly `proxy` and `storage`; do not declare host permissions, PAC, `proxy.onRequest`, or `webextension-polyfill`.
- Browser proxy APIs run only in background code. Chrome uses `fixed_servers`; Firefox uses static `proxy.settings`. Disable releases extension control in both targets.
- Save in `off` persists only. Save in `on` persists first, moves through `applying`, then re-applies to `on`, `conflict`, or `error`; a failed reapply retains the new configuration.
- Popup is 320px and shows text plus an 8px status dot. `applying` disables both controls; `Enable` is available in `off`, `conflict`, and `error`; `Disable` is available in `on`, `conflict`, and `error`. Never claim connectivity or traffic flow.
- Preserve `DESIGN.md` and `docs/plans/2026-07-23-dropweb-proxy-design.md` unchanged. Do not initialize Git or add commit steps.

## Execution Rules

- Use only `bun install`, `bun run`, and `bunx`.
- Before any `.ts` edit, read `references/typescript/README.md` plus its required strict configuration, type patterns, data-modeling, and error-handling references.
- Write and observe a failing test before every production behavior, then record the matching GREEN command and result.
- Read `DESIGN.md` before Task 5. Run diagnostics, no-excuse checks, LOC audit, accessibility, screenshot QA, and review once in Task 7.

## Task 1: Scaffold

**Files:**
- Create: `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `wxt.config.ts`, `vitest.config.ts`, `playwright.config.ts`

1. Read the mandatory TypeScript references, then configure WXT `~0.20.27` with `srcDir: "src"`, strict TypeScript, Biome, Vitest/WxtVitest, Playwright, and separate Chrome and Firefox MV3 targets. Use only vanilla entrypoints.
2. Add `dev`, `dev:firefox`, `build:chrome`, `build:firefox`, `build`, `check`, `test`, and `test:e2e`. `check` runs Biome and `tsc --noEmit`; `test` runs the full Vitest suite; `test:e2e` runs the full Playwright suite.
3. Configure manifest permissions as exactly `proxy` and `storage`, with no host permissions.
4. Verify:

```bash
bun install
bun run check
bun run build:chrome
bun run build:firefox
bun -e 'const expected = ["proxy", "storage"].sort(); for (const file of [".output/chrome-mv3/manifest.json", ".output/firefox-mv3/manifest.json"]) { const manifest = await Bun.file(file).json(); const permissions = [...(manifest.permissions ?? [])].sort(); if (JSON.stringify(permissions) !== JSON.stringify(expected) || "host_permissions" in manifest) throw new Error(`invalid manifest: ${file}`); }'
```

Expected: all commands exit 0; `bun.lock` exists; both generated manifests contain only the required permission set.

## Task 2: Domain, Storage, and Locales

**Files:**
- Create: `src/domain/proxy-config.ts`, `src/storage/settings-repository.ts`, `src/ui/i18n.ts`
- Create: `public/_locales/en/messages.json`, `public/_locales/ru/messages.json`
- Create: `tests/unit/proxy-config.test.ts`, `tests/unit/settings-repository.test.ts`, `tests/unit/locales.test.ts`

1. Write failing tests for defaults; HTTP/SOCKS5-only parsing; host, port, and bypass validation returning typed field errors; first-install storage defaults and persistence via WxtVitest `fakeBrowser`; and RU/EN locale-key parity only.
2. RED: `bunx vitest run tests/unit/proxy-config.test.ts tests/unit/settings-repository.test.ts tests/unit/locales.test.ts`. Expected: FAIL because modules and catalogs are absent.
3. Implement the single domain file with types, defaults, and validation; the storage repository; native locale catalogs; and the locale lookup helper. Keep all UI copy in locale keys.
4. GREEN: rerun the RED command. Expected: PASS.

## Task 3: Browser Adapters

**Files:**
- Create: `src/background/chrome-proxy-adapter.ts`, `src/background/firefox-proxy-adapter.ts`
- Create: `tests/unit/chrome-proxy-adapter.test.ts`, `tests/unit/firefox-proxy-adapter.test.ts`

**Parallelism:** Chrome and Firefox implementations may proceed in parallel after their tests exist.

1. Write Chrome tests for exact `fixed_servers` payloads for HTTP and SOCKS5, including `bypassList` and bracketed IPv6; `controlled_by_other_extensions` and `not_controllable` normalizing to `conflict`; `clear({ scope: "regular" })` on disable; and API rejection normalizing to `error`.
2. Write Firefox tests for exact manual `proxy.settings` payloads: HTTP with `httpProxyAll: true`; SOCKS5 with `socksVersion: 5` and `proxyDNS: true`; comma-joined passthrough; `isAllowedIncognitoAccess` producing `firefox_private_access_required`; and `clear({})` on disable.
3. RED: `bunx vitest run tests/unit/chrome-proxy-adapter.test.ts tests/unit/firefox-proxy-adapter.test.ts`. Expected: FAIL because adapters are absent.
4. Implement each adapter with local structural types only. Do not add `@types/chrome`; do not expose browser APIs to UI code.
5. GREEN: rerun the RED command. Expected: PASS.

## Task 4: Controller and Background Entrypoint

**Files:**
- Create: `src/background/proxy-controller.ts`, `src/entrypoints/background.ts`
- Create: `tests/unit/proxy-controller.test.ts`

1. Write failing controller tests for typed `state/get`, `config/save`, `proxy/enable`, and `proxy/disable`; enable success/conflict/error; disable success and failed clear without persisting `off`; save in `off`; save in `on` through `applying` to each outcome; failed reapply retaining new config; and serialization while `applying` using deferred promises.
2. RED: `bunx vitest run tests/unit/proxy-controller.test.ts`. Expected: FAIL because the controller and entrypoint are absent.
3. Implement the state machine and badge/title mapping from `DESIGN.md` in `proxy-controller.ts`. Split only a small indicator helper if the 250-LOC limit requires it. In `background.ts`, use `defineBackground` for first-install defaults and `off`, startup badge refresh, message routing, and adapter selection through `import.meta.env.FIREFOX`.
4. GREEN: rerun the RED command, then run `bun run build:chrome`. Expected: PASS and a successful Chrome build.

## Task 5: Popup and Options UI

**Files:**
- Create: `src/ui/popup-view.ts`, `src/ui/options-view.ts`, `src/styles/tokens.css`
- Create: `src/entrypoints/popup/index.html`, `src/entrypoints/popup/main.ts`, `src/entrypoints/popup/style.css`
- Create: `src/entrypoints/options/index.html`, `src/entrypoints/options/main.ts`, `src/entrypoints/options/style.css`
- Create: `tests/unit/popup-view.test.ts`, `tests/unit/options-view.test.ts`

1. Read `DESIGN.md`. Write happy-dom tests for five status labels and dots; button availability; `aria-live` and `role="alert"`; field errors with `aria-invalid` and `aria-describedby`; and cancel restoring form values.
2. RED: `bunx vitest run tests/unit/popup-view.test.ts tests/unit/options-view.test.ts`. Expected: FAIL because views are absent.
3. Implement native, localized controls and approved styles. All copy uses locale keys. UI sends typed messages only and never calls proxy APIs.
4. Add a small `#preview=<state>` affordance to each entrypoint main module. When present, render only the matching static state locally without contacting background; it exists solely for screenshots and never invokes proxy APIs.
5. GREEN: rerun the RED command. Expected: PASS.

## Task 6: Chrome E2E and Builds

**Files:**
- Create: `tests/e2e/fixtures.ts`, `tests/e2e/extension.spec.ts`
- Modify: `playwright.config.ts`

1. Write E2E scenarios against the real Chrome artifact: first install shows `off` and defaults; options save in `off` survives reopen while proxy settings remain uncontrolled; enable makes `chrome.proxy.settings.get` report expected `fixed_servers` host and port; saving SOCKS5 while on changes the live setting without another enable click; disable clears settings while preserving config; badge text transitions.
2. RED: `bunx playwright install chromium` then `bunx playwright test tests/e2e/extension.spec.ts`. Expected: FAIL because the persistent-context fixture that loads `.output/chrome-mv3` and obtains the extension ID from its service worker is absent.
3. Implement that fixture with no test seam. The assertions read real `chrome.proxy.settings` effects from the loaded extension.
4. GREEN: rerun `bunx playwright test tests/e2e/extension.spec.ts`. Expected: PASS.
5. Re-run `bun run build:chrome`, `bun run build:firefox`, and the Task 1 sorted manifest inspection command. Expected: all exit 0.

## Task 7: Final Gates and QA

**Files:**
- Modify only files required to correct a failed gate. Do not modify the approved design documents.

1. Run:

```bash
bun install
bun run check
bun run test
bun run build
bun run test:e2e
bun /Users/mac/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/dist/skills/programming/scripts/typescript/check-no-excuse-rules.ts $(rg --files src tests -g '*.ts')
rg --files src tests -g '*.ts' | xargs wc -l
```

Expected: every gate exits 0; each source file is at most 250 pure LOC. If a file exceeds the limit, load `refactor`, split it, and rerun affected tests.

2. Run `lsp_diagnostics` on every changed TS, HTML, and CSS file.
3. Run `bun run dev:firefox` in WXT's temporary profile. Verify: defaults are `off`; options allow only HTTP/SOCKS5; save persists; private-window permission behavior is visible; enable/disable work; save-while-on reapplies; the private-access error is localized; keyboard order and focus-visible work.
4. Use Playwright on the real popup and options pages to capture default states plus `#preview=applying`, `#preview=conflict`, and `#preview=error`. Verify 320px popup width, no overflow, visible focus, and status distinction without color alone. Run an axe accessibility audit on both pages.
5. Complete final review: Fixed Scope, adapter isolation, exact permissions, no reachability claims, approved documents untouched, and recorded RED/GREEN evidence.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-07-23-dropweb-proxy.md`. Two execution options:

1. **Subagent-Driven, this session.** Load `subagent-driven-development`, use one fresh implementation agent per task or parallel adapter, and review each RED/GREEN result.
2. **Separate session.** Start a new session in this repository, load `executing-plans` plus `start-work`, and execute tasks sequentially with final-gate checkpoints.
