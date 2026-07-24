import { describe, expect, it } from "vitest";

import { parseProxyRequest } from "../../src/background/proxy-controller";
import type { WebRtcState } from "../../src/background/webrtc-sync";
import type { StoredProxyState } from "../../src/domain/proxy-config";
import { createHarness, OFF_STATE, SAVE_REQUEST } from "./proxy-controller-harness";

describe("proxy request parsing", () => {
  it.each([
    [{ type: "state/get" }, { type: "state/get" }],
    [SAVE_REQUEST, SAVE_REQUEST],
    [{ type: "proxy/enable" }, { type: "proxy/enable" }],
    [{ type: "proxy/disable" }, { type: "proxy/disable" }],
    [{ type: "health/check" }, { type: "health/check" }],
    [{ type: "proxy/enable", extra: true }, { type: "proxy/enable" }],
  ])("Given a valid raw request When parsed Then its typed shape is returned", (raw, expected) => {
    expect(parseProxyRequest(raw)).toEqual(expected);
  });

  it.each([null, {}, { type: 1 }, { type: "bogus" }, { type: "config/save", input: {} }])(
    "Given an invalid raw request When parsed Then null is returned",
    (raw) => {
      expect(parseProxyRequest(raw)).toBeNull();
    },
  );
});

describe("proxy controller reads and messages", () => {
  it("Given stored stable state When requested Then its config and status are returned", async () => {
    const { controller } = createHarness();

    await expect(controller.handle({ type: "state/get" })).resolves.toEqual({
      kind: "snapshot",
      snapshot: {
        config: {
          type: "http",
          host: "127.0.0.1",
          port: 7890,
          bypass: ["localhost"],
        },
        status: { kind: "off" },
        webrtc: "inactive",
        health: "unknown",
      },
    });
  });

  it("Given an unparseable message When handled Then current state returns without side effects", async () => {
    const { controller, apply, clear, setState } = createHarness();

    await expect(controller.handleMessage({ type: "bogus" })).resolves.toMatchObject({
      kind: "snapshot",
      snapshot: { status: { kind: "off" } },
    });
    expect(apply).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "off" }, "release", "inactive"],
    [{ kind: "on" }, "protect", "protected"],
  ] satisfies readonly [StoredProxyState["status"], "protect" | "release", WebRtcState][])(
    "Given stored status %o and an unexpected command rejection When messaged Then WebRTC is resynchronized",
    async (status, guardMethod, expectedWebRtc) => {
      const { controller, apply, webrtc } = createHarness({ ...OFF_STATE, status });
      apply.mockRejectedValueOnce(new RangeError("unexpected adapter rejection"));

      await expect(controller.handleMessage({ type: "proxy/enable" })).resolves.toMatchObject({
        snapshot: { status, webrtc: expectedWebRtc },
      });
      expect(webrtc[guardMethod]).toHaveBeenCalledOnce();
    },
  );
});
