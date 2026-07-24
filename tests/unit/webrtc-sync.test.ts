import { describe, expect, it, vi } from "vitest";
import type { WebRtcGuard, WebRtcResult } from "../../src/background/webrtc-guard";
import { syncWebRtc, type WebRtcState } from "../../src/background/webrtc-sync";
import type { StableProxyStatus } from "../../src/domain/proxy-config";

function createGuard(result: WebRtcResult): WebRtcGuard {
  return {
    protect: vi.fn(async () => result),
    release: vi.fn(async (): Promise<WebRtcResult> => ({ kind: "released" })),
  };
}

describe("WebRTC synchronization", () => {
  it.each([
    [{ kind: "protected" }, "protected"],
    [{ kind: "conflict", reason: "controlled_by_other" }, "conflict"],
    [{ kind: "error" }, "unprotected"],
    [{ kind: "released" }, "inactive"],
  ] satisfies readonly [WebRtcResult, WebRtcState][])(
    "Given proxy on and guard result %o When synchronized Then WebRTC state is %s",
    async (guardResult, expectedState) => {
      const guard = createGuard(guardResult);

      const state = await syncWebRtc(guard, { kind: "on" });

      expect(state).toBe(expectedState);
      expect(guard.protect).toHaveBeenCalledOnce();
      expect(guard.release).not.toHaveBeenCalled();
    },
  );

  it.each([
    { kind: "off" },
    { kind: "conflict", reason: "not_controllable" },
    { kind: "error", operation: "enable", code: "proxy_api" },
  ] satisfies readonly StableProxyStatus[])(
    "Given non-on proxy status %o When synchronized Then WebRTC is released and inactive",
    async (status) => {
      const guard = createGuard({ kind: "protected" });

      const state = await syncWebRtc(guard, status);

      expect(state).toBe("inactive");
      expect(guard.release).toHaveBeenCalledOnce();
      expect(guard.protect).not.toHaveBeenCalled();
    },
  );
});
