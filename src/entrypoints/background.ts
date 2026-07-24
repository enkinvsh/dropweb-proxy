import { browser } from "@wxt-dev/browser";

import { createChromeProxyController } from "../background/chrome-proxy-adapter";
import { createChromeWebRtcGuard } from "../background/chrome-webrtc-guard";
import { createFirefoxProxyController } from "../background/firefox-proxy-adapter";
import { createFirefoxWebRtcGuard } from "../background/firefox-webrtc-guard";
import { probeProxy } from "../background/health-monitor";
import { createProxyController } from "../background/proxy-controller";
import { getState, resetForInstall, setState } from "../storage/settings-repository";

const HEALTH_ALARM = "health-probe";

async function callFirefoxWebRtcSetting(
  method: "get" | "set" | "clear",
  details: object,
): Promise<unknown> {
  const setting: unknown = Reflect.get(browser.privacy.network, "peerConnectionEnabled");
  if (typeof setting !== "object" || setting === null) {
    throw new RangeError("Firefox WebRTC privacy setting is unavailable");
  }
  const callable: unknown = Reflect.get(setting, method);
  if (typeof callable !== "function") {
    throw new RangeError(`Firefox WebRTC privacy method is unavailable: ${method}`);
  }
  return await Reflect.apply(callable, setting, [details]);
}

export default defineBackground(() => {
  // Chrome persists action badge text across extension updates; clear the legacy badge once per SW start.
  void browser.action.setBadgeText({ text: "" }).catch(() => undefined);

  const adapter = import.meta.env.FIREFOX
    ? createFirefoxProxyController(
        {
          async get(details) {
            const { levelOfControl } = await browser.proxy.settings.get(details);
            return { levelOfControl };
          },
          async set(details) {
            const result: unknown = await Reflect.apply(
              browser.proxy.settings.set,
              browser.proxy.settings,
              [details],
            );
            return typeof result === "boolean" ? result : true;
          },
          async clear(details) {
            const result: unknown = await Reflect.apply(
              browser.proxy.settings.clear,
              browser.proxy.settings,
              [details],
            );
            return typeof result === "boolean" ? result : true;
          },
        },
        { isAllowedIncognitoAccess: () => browser.extension.isAllowedIncognitoAccess() },
      )
    : createChromeProxyController({
        async get(details) {
          const { levelOfControl } = await browser.proxy.settings.get(details);
          return { levelOfControl };
        },
        async set(details) {
          await Reflect.apply(browser.proxy.settings.set, browser.proxy.settings, [details]);
        },
        async clear(details) {
          await Reflect.apply(browser.proxy.settings.clear, browser.proxy.settings, [details]);
        },
      });
  const webrtc = import.meta.env.FIREFOX
    ? createFirefoxWebRtcGuard({
        async get(details) {
          const result = await callFirefoxWebRtcSetting("get", details);
          if (
            typeof result !== "object" ||
            result === null ||
            !("levelOfControl" in result) ||
            typeof result.levelOfControl !== "string"
          ) {
            throw new RangeError("Firefox WebRTC privacy result is invalid");
          }
          return { levelOfControl: result.levelOfControl };
        },
        async set(details) {
          await callFirefoxWebRtcSetting("set", details);
        },
        async clear(details) {
          await callFirefoxWebRtcSetting("clear", details);
        },
      })
    : createChromeWebRtcGuard({
        async get(details) {
          const { levelOfControl } =
            await browser.privacy.network.webRTCIPHandlingPolicy.get(details);
          return { levelOfControl };
        },
        async set(details) {
          await browser.privacy.network.webRTCIPHandlingPolicy.set(details);
        },
        async clear(details) {
          await browser.privacy.network.webRTCIPHandlingPolicy.clear(details);
        },
      });
  const controller = createProxyController({
    repository: { getState, setState },
    adapter,
    webrtc,
    surface: browser.action,
    translator: { title: (key) => browser.i18n.getMessage(key) },
    probe: (config) => probeProxy(config),
    scheduleHealthProbes: async (active) => {
      if (active) {
        await browser.alarms.create(HEALTH_ALARM, { periodInMinutes: 0.5 });
      } else {
        await browser.alarms.clear(HEALTH_ALARM);
      }
    },
  });

  type ProxyErrorEvent = { addListener(callback: () => void): void };
  const proxyEvents = browser.proxy as Partial<{
    onProxyError: ProxyErrorEvent;
    onError: ProxyErrorEvent;
  }>;
  (proxyEvents.onProxyError ?? proxyEvents.onError)?.addListener(() => {
    void controller.noteProxyError().catch(() => {});
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEALTH_ALARM) {
      void controller.refreshIndicator().catch(() => {});
    }
  });

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === "install") {
      await resetForInstall();
    }
    await controller.refreshIndicator();
  });
  browser.runtime.onStartup.addListener(() => {
    void controller.refreshIndicator().catch(() => {});
  });
  browser.runtime.onMessage.addListener((message: unknown) => controller.handleMessage(message));
});
