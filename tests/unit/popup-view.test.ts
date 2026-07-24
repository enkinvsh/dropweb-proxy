import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HealthState } from "../../src/background/health-monitor";
import type { WebRtcState } from "../../src/background/webrtc-sync";
import type { ProxyStatus } from "../../src/domain/proxy-config";
import type { Translator } from "../../src/ui/i18n";
import { renderPopup } from "../../src/ui/popup-view";

const CONFIG = {
  type: "socks5",
  host: "proxy.local",
  port: 1080,
  bypass: ["localhost"],
} as const;

const t: Translator = {
  getMessage(key) {
    return key;
  },
};

function required<TElement extends Element>(element: TElement | null): TElement {
  if (element === null) {
    throw new RangeError("Expected DOM element");
  }
  return element;
}

function render(
  status: ProxyStatus,
  webrtc: WebRtcState = "inactive",
  health: HealthState = "unknown",
) {
  const root = document.createElement("main");
  const handlers = {
    onEnable: vi.fn(),
    onDisable: vi.fn(),
    onOpenSettings: vi.fn(),
  };
  renderPopup(root, { config: CONFIG, status, webrtc, health }, t, handlers);
  const power = required(root.querySelector<HTMLButtonElement>(".power"));
  const settings = required(root.querySelector<HTMLButtonElement>(".settings-link"));
  return { root, handlers, power, settings };
}

describe("popup view", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("Given off status When rendered Then it is an unpressed, enabled power button routing to onEnable", () => {
    const { root, handlers, power, settings } = render({ kind: "off" });

    expect(root.className).toBe("popup state-off");
    expect(power.getAttribute("aria-pressed")).toBe("false");
    expect(power.disabled).toBe(false);

    const status = required(root.querySelector<HTMLElement>('[role="status"]'));
    expect(status.textContent).toBe("status_off");
    expect(status.classList.contains("sr-only")).toBe(true);

    expect(settings.textContent).toBe("popup_settings_label");

    const orb = required(root.querySelector<HTMLElement>(".orb"));
    expect(orb.getAttribute("aria-hidden")).toBe("true");

    power.click();
    expect(handlers.onEnable).toHaveBeenCalledOnce();
    expect(handlers.onDisable).not.toHaveBeenCalled();

    settings.click();
    expect(handlers.onOpenSettings).toHaveBeenCalledOnce();
  });

  it("Given applying status When rendered Then the power button is disabled and fires no handler", () => {
    const { root, handlers, power } = render({ kind: "applying", operation: "enable" });

    expect(root.className).toBe("popup state-applying");
    expect(power.disabled).toBe(true);

    power.click();
    expect(handlers.onEnable).not.toHaveBeenCalled();
    expect(handlers.onDisable).not.toHaveBeenCalled();
  });

  it("Given on with protected WebRTC When rendered Then it is a pressed on-state button routing to onDisable", () => {
    const { root, handlers, power } = render({ kind: "on" }, "protected", "unknown");

    expect(root.className).toBe("popup state-on");
    expect(power.getAttribute("aria-pressed")).toBe("true");
    expect(power.disabled).toBe(false);

    const status = required(root.querySelector<HTMLElement>('[role="status"]'));
    expect(status.textContent).toContain("status_on");
    expect(status.textContent).toContain("webrtc_status_protected");

    power.click();
    expect(handlers.onDisable).toHaveBeenCalledOnce();
    expect(handlers.onEnable).not.toHaveBeenCalled();
  });

  it("Given on but unreachable When rendered Then it is a problem state alerting the unreachable hint", () => {
    const { root } = render({ kind: "on" }, "protected", "unreachable");

    expect(root.className).toBe("popup state-problem");
    const alert = required(root.querySelector<HTMLElement>('[role="alert"]'));
    expect(alert.textContent).toContain("status_unreachable_hint");
    expect(alert.classList.contains("sr-only")).toBe(true);
    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it.each([
    ["conflict", "webrtc_status_conflict"],
    ["unprotected", "webrtc_status_unprotected"],
  ] satisfies readonly [WebRtcState, string][])(
    "Given on with WebRTC %s When rendered Then it is a problem state alerting %s",
    (webrtc, detailKey) => {
      const { root, power } = render({ kind: "on" }, webrtc, "reachable");

      expect(root.className).toBe("popup state-problem");
      expect(power.getAttribute("aria-pressed")).toBe("true");
      const alert = required(root.querySelector<HTMLElement>('[role="alert"]'));
      expect(alert.textContent).toContain(detailKey);
    },
  );

  it("Given a controlled-by-other conflict When rendered Then it is an unpressed problem button routing to onEnable", () => {
    const { root, handlers, power } = render({ kind: "conflict", reason: "controlled_by_other" });

    expect(root.className).toBe("popup state-problem");
    expect(power.getAttribute("aria-pressed")).toBe("false");

    const alert = required(root.querySelector<HTMLElement>('[role="alert"]'));
    expect(alert.textContent).toBe("status_conflict_controlled_by_other");

    power.click();
    expect(handlers.onEnable).toHaveBeenCalledOnce();
    expect(handlers.onDisable).not.toHaveBeenCalled();
  });

  it("Given an apply error When rendered Then it is a problem button alerting the error and routing to onEnable", () => {
    const { root, handlers, power } = render({
      kind: "error",
      operation: "enable",
      code: "proxy_api",
    });

    expect(root.className).toBe("popup state-problem");
    const alert = required(root.querySelector<HTMLElement>('[role="alert"]'));
    expect(alert.textContent).toBe("status_error_proxy_api");

    power.click();
    expect(handlers.onEnable).toHaveBeenCalledOnce();
    expect(handlers.onDisable).not.toHaveBeenCalled();
  });

  it("Given off and unreachable When rendered Then it stays off with the neutral pre-flight status", () => {
    const { root } = render({ kind: "off" }, "inactive", "unreachable");

    expect(root.className).toBe("popup state-off");
    const status = required(root.querySelector<HTMLElement>('[role="status"]'));
    expect(status.textContent).toContain("status_unreachable_hint_off");
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it("Given any state When rendered Then no text is visible besides the settings label", () => {
    const { root } = render({ kind: "on" }, "conflict", "reachable");

    const detail = required(root.querySelector<HTMLElement>(".sr-only"));
    expect(detail.textContent).toContain("webrtc_status_conflict");

    const visible = Array.from(root.children)
      .filter((el) => !el.classList.contains("sr-only"))
      .map((el) => el.textContent?.trim() ?? "")
      .join("");
    expect(visible).toBe("popup_settings_label");
  });
});
