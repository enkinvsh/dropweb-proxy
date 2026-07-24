import { describe, expect, it, vi } from "vitest";

import { createChromeWebRtcGuard } from "../../src/background/chrome-webrtc-guard";

function createPort(levelOfControl = "controllable_by_this_extension") {
  return {
    get: vi.fn(() => Promise.resolve({ levelOfControl })),
    set: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  };
}

describe("Chrome WebRTC protect", () => {
  it("Given a controllable setting When protected Then non-proxied UDP is disabled for regular scope", async () => {
    const port = createPort();
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.protect();

    expect(result).toEqual({ kind: "protected" });
    expect(port.get).toHaveBeenCalledWith({});
    expect(port.set).toHaveBeenCalledOnce();
    expect(port.set).toHaveBeenCalledWith({
      value: "disable_non_proxied_udp",
      scope: "regular",
    });
  });

  it("Given control by another extension When protected Then conflict is returned without setting", async () => {
    const port = createPort("controlled_by_other_extensions");
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.protect();

    expect(result).toEqual({ kind: "conflict", reason: "controlled_by_other" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given a non-controllable setting When protected Then conflict is returned without setting", async () => {
    const port = createPort("not_controllable");
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.protect();

    expect(result).toEqual({ kind: "conflict", reason: "not_controllable" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given an unknown control level When protected Then error is returned without setting", async () => {
    const port = createPort("future_browser_value");
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.protect();

    expect(result).toEqual({ kind: "error" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given get rejects When protected Then error is returned without setting", async () => {
    const port = createPort();
    port.get.mockRejectedValueOnce(new RangeError("privacy API rejected"));
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.protect();

    expect(result).toEqual({ kind: "error" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given a rejecting settings write When protected Then error is returned", async () => {
    const port = createPort();
    port.set.mockRejectedValueOnce(new RangeError("privacy API rejected"));
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.protect();

    expect(result).toEqual({ kind: "error" });
  });
});

describe("Chrome WebRTC release", () => {
  it("Given a resolving clear call When released Then regular control is cleared once", async () => {
    const port = createPort();
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.release();

    expect(result).toEqual({ kind: "released" });
    expect(port.clear).toHaveBeenCalledOnce();
    expect(port.clear).toHaveBeenCalledWith({ scope: "regular" });
  });

  it("Given a rejecting clear call When released Then error is returned", async () => {
    const port = createPort();
    port.clear.mockRejectedValueOnce(new RangeError("privacy API rejected"));
    const guard = createChromeWebRtcGuard(port);

    const result = await guard.release();

    expect(result).toEqual({ kind: "error" });
  });
});
