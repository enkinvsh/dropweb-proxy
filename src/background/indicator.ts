import type { ProxyStatus } from "../domain/proxy-config";
import type { MessageKey } from "../ui/i18n";
import type { HealthState } from "./health-monitor";
import type { WebRtcState } from "./webrtc-sync";

export type IconVariant = "off" | "on" | "problem";

export type Indicator = {
  readonly iconVariant: IconVariant;
  readonly titleKey: MessageKey;
};

const ICON_SIZES = ["16", "32", "48", "128"] as const;

export function iconPaths(variant: IconVariant): Record<string, string> {
  return Object.fromEntries(ICON_SIZES.map((size) => [size, `/icons/${variant}-${size}.png`]));
}

function assertNever(status: never): never {
  throw new RangeError(`Unsupported proxy status: ${String(status)}`);
}

export function computeIndicator(
  status: ProxyStatus,
  health: HealthState,
  webrtc: WebRtcState,
): Indicator {
  if (status.kind === "on" && health === "unreachable") {
    return { iconVariant: "problem", titleKey: "browser_action_title_unreachable" };
  }
  if (status.kind === "on" && (webrtc === "conflict" || webrtc === "unprotected")) {
    return { iconVariant: "problem", titleKey: "browser_action_title_webrtc_leak" };
  }
  switch (status.kind) {
    case "off":
      return { iconVariant: "off", titleKey: "browser_action_title_off" };
    case "applying":
      return { iconVariant: "off", titleKey: "browser_action_title_applying" };
    case "on":
      return { iconVariant: "on", titleKey: "browser_action_title_on" };
    case "conflict":
      return { iconVariant: "problem", titleKey: "browser_action_title_conflict" };
    case "error":
      return { iconVariant: "problem", titleKey: "browser_action_title_error" };
    default:
      return assertNever(status);
  }
}
