import type { BrowserContext, Page, Worker } from "@playwright/test";

import { expect, test } from "./fixtures";

type ExtensionPage = "options.html" | "popup.html";

type OptionsInput = {
  readonly type: "http" | "socks5";
  readonly host: string;
  readonly port: string;
};

type ProxySettingProjection = {
  readonly levelOfControl: string;
  readonly mode: string;
  readonly scheme: string | undefined;
  readonly host: string | undefined;
  readonly port: number | undefined;
};

type WebRtcSettingProjection = {
  readonly levelOfControl: string;
  readonly value: string;
};

type ManifestProjection = {
  readonly permissions: readonly string[];
  readonly host_permissions?: readonly string[];
};

async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  pageName: ExtensionPage,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pageName}`);
  return page;
}

async function readProxySetting(serviceWorker: Worker): Promise<ProxySettingProjection> {
  return serviceWorker.evaluate<ProxySettingProjection>(`(async () => {
    const state = await chrome.proxy.settings.get({});
    const singleProxy = state.value.rules?.singleProxy;
    return {
      levelOfControl: state.levelOfControl,
      mode: state.value.mode,
      scheme: singleProxy?.scheme,
      host: singleProxy?.host,
      port: singleProxy?.port,
    };
  })()`);
}

async function readWebRtcSetting(serviceWorker: Worker): Promise<WebRtcSettingProjection> {
  return serviceWorker.evaluate<WebRtcSettingProjection>(
    "chrome.privacy.network.webRTCIPHandlingPolicy.get({}).then(d => ({ value: d.value, levelOfControl: d.levelOfControl }))",
  );
}

async function readActionTitle(serviceWorker: Worker): Promise<string> {
  return serviceWorker.evaluate<string>("chrome.action.getTitle({})");
}

async function i18nMessage(serviceWorker: Worker, key: string): Promise<string> {
  return serviceWorker.evaluate<string>(`chrome.i18n.getMessage(${JSON.stringify(key)})`);
}

async function saveOptions(page: Page, input: OptionsInput): Promise<void> {
  await page.locator('select[name="type"]').selectOption(input.type);
  await page.locator('input[name="host"]').fill(input.host);
  await page.locator('input[name="port"]').fill(input.port);
  await page.locator("form .button-primary").click();
  await expect(page.locator(".save-success")).toBeVisible();
}

test("first install is off with defaults and no proxy ownership", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const popup = await openExtensionPage(context, extensionId, "popup.html");

  await expect(popup.locator(".power")).toHaveAttribute("aria-pressed", "false");

  const options = await openExtensionPage(context, extensionId, "options.html");
  await expect(options.locator('input[name="host"]')).toHaveValue("127.0.0.1");
  await expect(options.locator('input[name="port"]')).toHaveValue("7890");

  expect((await readProxySetting(serviceWorker)).levelOfControl).not.toBe(
    "controlled_by_this_extension",
  );
  const offTitle = await i18nMessage(serviceWorker, "browser_action_title_off");
  await expect.poll(() => readActionTitle(serviceWorker)).toBe(offTitle);
  await expect
    .poll(() => serviceWorker.evaluate<string>("chrome.action.getBadgeText({})"))
    .toBe("");
});

test("manifest grants only the required permissions and no host access", async ({
  serviceWorker,
}) => {
  const manifest = await serviceWorker.evaluate<ManifestProjection>("chrome.runtime.getManifest()");

  expect([...manifest.permissions].sort()).toEqual(["alarms", "privacy", "proxy", "storage"]);
  expect(manifest.host_permissions).toBeUndefined();
});

test("WebRTC protection follows proxy enable and disable", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const popup = await openExtensionPage(context, extensionId, "popup.html");

  expect((await readWebRtcSetting(serviceWorker)).value).not.toBe("disable_non_proxied_udp");

  await popup.locator(".power").click();

  await expect
    .poll(() => readWebRtcSetting(serviceWorker))
    .toEqual({
      value: "disable_non_proxied_udp",
      levelOfControl: "controlled_by_this_extension",
    });
  await expect(popup.locator(".power")).toHaveAttribute("aria-pressed", "true");
  await expect(popup.locator(".sr-only")).toHaveText(/\S/);

  await popup.locator(".power").click();

  await expect.poll(async () => (await readWebRtcSetting(serviceWorker)).value).toBe("default");
  await expect(popup.locator(".power")).toHaveAttribute("aria-pressed", "false");
});

test("saving while off persists without applying proxy settings", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const options = await openExtensionPage(context, extensionId, "options.html");

  await saveOptions(options, { type: "socks5", host: "127.0.0.1", port: "1080" });
  await options.close();
  const reopened = await openExtensionPage(context, extensionId, "options.html");

  await expect(reopened.locator('select[name="type"]')).toHaveValue("socks5");
  await expect(reopened.locator('input[name="host"]')).toHaveValue("127.0.0.1");
  await expect(reopened.locator('input[name="port"]')).toHaveValue("1080");
  expect((await readProxySetting(serviceWorker)).levelOfControl).not.toBe(
    "controlled_by_this_extension",
  );
});

test("enabling applies the default fixed server and action indicator", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const popup = await openExtensionPage(context, extensionId, "popup.html");

  await popup.locator(".power").click();

  await expect
    .poll(() => readProxySetting(serviceWorker))
    .toMatchObject({
      levelOfControl: "controlled_by_this_extension",
      mode: "fixed_servers",
      scheme: "http",
      host: "127.0.0.1",
      port: 7890,
    });
  const enabledTitles = await Promise.all(
    [
      "browser_action_title_on",
      "browser_action_title_unreachable",
      "browser_action_title_webrtc_leak",
    ].map((key) => i18nMessage(serviceWorker, key)),
  );
  await expect
    .poll(async () => enabledTitles.includes(await readActionTitle(serviceWorker)))
    .toBe(true);
  await expect(popup.locator(".power")).toHaveAttribute("aria-pressed", "true");
});

test("saving SOCKS5 while on reapplies the live setting and persists", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const popup = await openExtensionPage(context, extensionId, "popup.html");
  await popup.locator(".power").click();
  await expect(popup.locator(".power")).toHaveAttribute("aria-pressed", "true");
  const options = await openExtensionPage(context, extensionId, "options.html");

  await saveOptions(options, { type: "socks5", host: "127.0.0.1", port: "7890" });

  await expect
    .poll(() => readProxySetting(serviceWorker))
    .toMatchObject({
      levelOfControl: "controlled_by_this_extension",
      mode: "fixed_servers",
      scheme: "socks5",
      host: "127.0.0.1",
      port: 7890,
    });
  await options.close();
  const reopened = await openExtensionPage(context, extensionId, "options.html");
  await expect(reopened.locator('select[name="type"]')).toHaveValue("socks5");
});

test("disabling releases control and preserves the saved configuration", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const options = await openExtensionPage(context, extensionId, "options.html");
  await saveOptions(options, { type: "socks5", host: "127.0.0.1", port: "1080" });
  const popup = await openExtensionPage(context, extensionId, "popup.html");
  const offTitle = await i18nMessage(serviceWorker, "browser_action_title_off");
  await expect.poll(() => readActionTitle(serviceWorker)).toBe(offTitle);
  await popup.locator(".power").click();
  await expect(popup.locator(".power")).toHaveAttribute("aria-pressed", "true");

  await popup.locator(".power").click();

  await expect
    .poll(async () => (await readProxySetting(serviceWorker)).levelOfControl)
    .not.toBe("controlled_by_this_extension");
  await expect.poll(() => readActionTitle(serviceWorker)).toBe(offTitle);
  await expect(popup.locator(".power")).toHaveAttribute("aria-pressed", "false");
  await options.close();
  const reopened = await openExtensionPage(context, extensionId, "options.html");
  await expect(reopened.locator('select[name="type"]')).toHaveValue("socks5");
  await expect(reopened.locator('input[name="host"]')).toHaveValue("127.0.0.1");
  await expect(reopened.locator('input[name="port"]')).toHaveValue("1080");
});
