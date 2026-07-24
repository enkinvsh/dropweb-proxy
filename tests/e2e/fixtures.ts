import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Worker } from "@playwright/test";
import { test as base, chromium, expect } from "@playwright/test";

const EXTENSION_PATH = resolve(".output/chrome-mv3");

type ExtensionFixtures = {
  readonly extensionId: string;
  readonly serviceWorker: Worker;
  readonly userDataDir: string;
};

export const test = base.extend<ExtensionFixtures>({
  userDataDir: async ({ browserName }, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), `dropweb-proxy-${browserName}-e2e-`));
    await use(userDataDir);
    await rm(userDataDir, { recursive: true, force: true });
  },
  context: async ({ userDataDir }, use) => {
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const registeredServiceWorker = context.serviceWorkers()[0];
    const serviceWorker = registeredServiceWorker ?? (await context.waitForEvent("serviceworker"));
    await use(serviceWorker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export { expect };
