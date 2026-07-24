import { type ControlDecision, normalizeLevelOfControl } from "./proxy-adapter";
import type { WebRtcGuard, WebRtcResult } from "./webrtc-guard";

interface ChromeWebRtcPort {
  get(details: Record<string, never>): Promise<{ readonly levelOfControl: string }>;
  set(details: {
    readonly value: "disable_non_proxied_udp";
    readonly scope: "regular";
  }): Promise<void>;
  clear(details: { readonly scope: "regular" }): Promise<void>;
}

function assertNever(value: never): never {
  throw new RangeError(`Unsupported WebRTC control decision: ${String(value)}`);
}

export function createChromeWebRtcGuard(port: ChromeWebRtcPort): WebRtcGuard {
  return {
    async protect() {
      const decision = await port.get({}).then<ControlDecision, ControlDecision>(
        ({ levelOfControl }) => normalizeLevelOfControl(levelOfControl),
        () => ({ kind: "unknown" }),
      );

      switch (decision.kind) {
        case "conflict":
          return decision;
        case "unknown":
          return { kind: "error" };
        case "controllable":
          return port
            .set({ value: "disable_non_proxied_udp", scope: "regular" })
            .then<WebRtcResult, WebRtcResult>(
              () => ({ kind: "protected" }),
              () => ({ kind: "error" }),
            );
        default:
          return assertNever(decision);
      }
    },
    release() {
      return port.clear({ scope: "regular" }).then<WebRtcResult, WebRtcResult>(
        () => ({ kind: "released" }),
        () => ({ kind: "error" }),
      );
    },
  };
}
