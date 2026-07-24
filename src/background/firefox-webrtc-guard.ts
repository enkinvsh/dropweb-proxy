import { type ControlDecision, normalizeLevelOfControl } from "./proxy-adapter";
import type { WebRtcGuard, WebRtcResult } from "./webrtc-guard";

interface FirefoxWebRtcPort {
  get(details: Record<string, never>): Promise<{ readonly levelOfControl: string }>;
  set(details: { readonly value: boolean }): Promise<void>;
  clear(details: Record<string, never>): Promise<void>;
}

function assertNever(value: never): never {
  throw new RangeError(`Unsupported WebRTC control decision: ${String(value)}`);
}

export function createFirefoxWebRtcGuard(port: FirefoxWebRtcPort): WebRtcGuard {
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
          return port.set({ value: false }).then<WebRtcResult, WebRtcResult>(
            () => ({ kind: "protected" }),
            () => ({ kind: "error" }),
          );
        default:
          return assertNever(decision);
      }
    },
    release() {
      return port.clear({}).then<WebRtcResult, WebRtcResult>(
        () => ({ kind: "released" }),
        () => ({ kind: "error" }),
      );
    },
  };
}
