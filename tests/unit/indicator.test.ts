import { describe, expect, it } from "vitest";
import type { HealthState } from "../../src/background/health-monitor";
import { computeIndicator, iconPaths } from "../../src/background/indicator";
import type { ProxyStatus } from "../../src/domain/proxy-config";

const CASES: readonly [ProxyStatus, string, string][] = [
  [{ kind: "off" }, "off", "browser_action_title_off"],
  [{ kind: "applying", operation: "enable" }, "off", "browser_action_title_applying"],
  [{ kind: "on" }, "on", "browser_action_title_on"],
  [{ kind: "conflict", reason: "controlled_by_other" }, "problem", "browser_action_title_conflict"],
  [
    { kind: "error", operation: "enable", code: "proxy_api" },
    "problem",
    "browser_action_title_error",
  ],
];

describe("browser action indicator", () => {
  it.each(CASES)(
    "Given $0.kind status When the indicator is computed Then its icon variant and title are exact",
    (status, iconVariant, titleKey) => {
      expect(computeIndicator(status, "unknown", "inactive")).toEqual({ iconVariant, titleKey });
    },
  );

  it("goes problem-orange when on but the proxy is unreachable", () => {
    expect(computeIndicator({ kind: "on" }, "unreachable", "protected")).toEqual({
      iconVariant: "problem",
      titleKey: "browser_action_title_unreachable",
    });
  });

  it("goes problem-orange on WebRTC leak risk while on", () => {
    for (const webrtc of ["conflict", "unprotected"] as const) {
      expect(computeIndicator({ kind: "on" }, "reachable", webrtc)).toEqual({
        iconVariant: "problem",
        titleKey: "browser_action_title_webrtc_leak",
      });
    }
  });

  it("keeps the colored on icon when health is fine and WebRTC is quiet", () => {
    for (const health of ["reachable", "unknown"] satisfies HealthState[]) {
      expect(computeIndicator({ kind: "on" }, health, "protected").iconVariant).toBe("on");
    }
  });

  it("keeps the off icon when off and unreachable (fail-closed: off is honest)", () => {
    expect(computeIndicator({ kind: "off" }, "unreachable", "inactive").iconVariant).toBe("off");
  });

  it("maps a variant to root-absolute manifest icon paths for every density", () => {
    expect(iconPaths("problem")).toEqual({
      "16": "/icons/problem-16.png",
      "32": "/icons/problem-32.png",
      "48": "/icons/problem-48.png",
      "128": "/icons/problem-128.png",
    });
  });
});
