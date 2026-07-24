import { describe, expect, it, vi } from "vitest";

import type { AdapterResult } from "../../src/background/proxy-adapter";
import type { WebRtcResult } from "../../src/background/webrtc-guard";
import type { WebRtcState } from "../../src/background/webrtc-sync";
import type { StoredProxyState } from "../../src/domain/proxy-config";
import { StorageError } from "../../src/storage/settings-repository";
import {
  CONFIG,
  createHarness,
  NEW_CONFIG,
  NEW_INPUT,
  OFF_STATE,
} from "./proxy-controller-harness";

describe("proxy controller enable and disable", () => {
  it("Given off state When enable applies Then on is persisted after the applying badge", async () => {
    const { controller, setState, webrtc, events } = createHarness();

    const result = await controller.handle({ type: "proxy/enable" });

    expect(result).toMatchObject({ snapshot: { status: { kind: "on" }, webrtc: "protected" } });
    expect(setState).toHaveBeenCalledWith({ version: 1, config: CONFIG, status: { kind: "on" } });
    expect(webrtc.protect).toHaveBeenCalledOnce();
    expect(webrtc.release).not.toHaveBeenCalled();
    expect(events.filter((event) => event.startsWith("icon:"))).toEqual([
      "icon:/icons/off-48.png",
      "icon:/icons/on-48.png",
    ]);
  });

  it.each([
    [
      { kind: "conflict", reason: "controlled_by_other" },
      { kind: "conflict", reason: "controlled_by_other" },
    ],
    [
      { kind: "error", code: "proxy_api" },
      { kind: "error", operation: "enable", code: "proxy_api" },
    ],
  ] satisfies readonly [AdapterResult, StoredProxyState["status"]][])(
    "Given an unsuccessful apply When enabled Then its stable result is persisted",
    async (adapterResult, expectedStatus) => {
      const { controller, apply, webrtc, state } = createHarness();
      apply.mockResolvedValueOnce(adapterResult);

      const result = await controller.handle({ type: "proxy/enable" });

      expect(result).toMatchObject({ snapshot: { status: expectedStatus, webrtc: "inactive" } });
      expect(state().status).toEqual(expectedStatus);
      expect(webrtc.release).toHaveBeenCalledOnce();
      expect(webrtc.protect).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ kind: "conflict", reason: "controlled_by_other" }, "conflict"],
    [{ kind: "error" }, "unprotected"],
  ] satisfies readonly [WebRtcResult, WebRtcState][])(
    "Given proxy enable succeeds but WebRTC returns %o When enabled Then proxy stays on and WebRTC is %s",
    async (guardResult, expectedWebRtc) => {
      const { controller, webrtc, events } = createHarness();
      webrtc.protect.mockResolvedValueOnce(guardResult);

      const result = await controller.handle({ type: "proxy/enable" });

      expect(result).toMatchObject({
        snapshot: { status: { kind: "on" }, webrtc: expectedWebRtc },
      });
      expect(events).toContain("icon:/icons/problem-48.png");
    },
  );

  it("Given on state When clear succeeds Then off is persisted", async () => {
    const { controller, webrtc, state } = createHarness({ ...OFF_STATE, status: { kind: "on" } });

    await expect(controller.handle({ type: "proxy/disable" })).resolves.toMatchObject({
      snapshot: { status: { kind: "off" }, webrtc: "inactive" },
    });
    expect(state().status).toEqual({ kind: "off" });
    expect(webrtc.release).toHaveBeenCalledOnce();
  });

  it("Given on state When clear fails Then disable error is persisted instead of off", async () => {
    const { controller, clear, state } = createHarness({ ...OFF_STATE, status: { kind: "on" } });
    clear.mockResolvedValueOnce({ kind: "error", code: "proxy_api" });

    await controller.handle({ type: "proxy/disable" });

    expect(state().status).toEqual({ kind: "error", operation: "disable", code: "proxy_api" });
  });
});

describe("proxy controller save", () => {
  it("Given off state When valid config is saved Then config changes without adapter apply", async () => {
    const { controller, apply, state } = createHarness();

    const result = await controller.handle({ type: "config/save", input: NEW_INPUT });

    expect(result).toEqual({
      kind: "snapshot",
      snapshot: {
        config: NEW_CONFIG,
        status: { kind: "off" },
        webrtc: "inactive",
        health: "unknown",
      },
    });
    expect(state()).toEqual({ version: 1, config: NEW_CONFIG, status: { kind: "off" } });
    expect(apply).not.toHaveBeenCalled();
  });

  it("Given invalid config When saved Then field errors return without persistence", async () => {
    const { controller, setState } = createHarness();

    const result = await controller.handle({
      type: "config/save",
      input: { ...NEW_INPUT, port: "0" },
    });

    expect(result).toEqual({ kind: "invalid", errors: { port: "port_invalid" } });
    expect(setState).not.toHaveBeenCalled();
  });

  it("Given on state When save reapply is in flight Then concurrent state reports applying before on", async () => {
    const deferred = Promise.withResolvers<AdapterResult>();
    const applyStarted = Promise.withResolvers<void>();
    const harness = createHarness({ ...OFF_STATE, status: { kind: "on" } });
    harness.apply.mockImplementationOnce(async () => {
      applyStarted.resolve();
      return await deferred.promise;
    });
    const save = harness.controller.handle({ type: "config/save", input: NEW_INPUT });
    await applyStarted.promise;
    await expect(harness.controller.handle({ type: "state/get" })).resolves.toMatchObject({
      snapshot: { status: { kind: "applying", operation: "reapply" } },
    });
    deferred.resolve({ kind: "applied" });
    await expect(save).resolves.toMatchObject({ snapshot: { status: { kind: "on" } } });
  });

  it("Given on state When save reapplies the new config Then WebRTC protection follows the final on status", async () => {
    const { controller, apply, webrtc } = createHarness({ ...OFF_STATE, status: { kind: "on" } });

    const result = await controller.handle({ type: "config/save", input: NEW_INPUT });

    expect(apply).toHaveBeenCalledWith(NEW_CONFIG);
    expect(webrtc.protect).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ snapshot: { status: { kind: "on" }, webrtc: "protected" } });
  });

  it("Given proxy on When save persistence rejects Then WebRTC stays protected for the stored on state", async () => {
    const { controller, setState, webrtc } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });
    setState.mockRejectedValueOnce(new StorageError("set", { cause: new RangeError("full") }));

    const failedSave = await controller.handle({ type: "config/save", input: NEW_INPUT });
    const currentState = await controller.handle({ type: "state/get" });

    expect({
      failedSave,
      currentState,
      protectCalls: webrtc.protect.mock.calls.length,
      releaseCalls: webrtc.release.mock.calls.length,
    }).toMatchObject({
      failedSave: {
        snapshot: {
          status: { kind: "error", operation: "reapply", code: "storage" },
          webrtc: "protected",
        },
      },
      currentState: { snapshot: { status: { kind: "on" }, webrtc: "protected" } },
      protectCalls: 1,
      releaseCalls: 0,
    });
  });

  it.each([
    [{ kind: "applied" }, { kind: "on" }],
    [
      { kind: "error", code: "proxy_api" },
      { kind: "error", operation: "reapply", code: "proxy_api" },
    ],
  ] satisfies readonly [AdapterResult, StoredProxyState["status"]][])(
    "Given on state When new config is saved Then it persists before reapply and keeps its result",
    async (adapterResult, expectedStatus) => {
      const { controller, apply, setState, state } = createHarness({
        ...OFF_STATE,
        status: { kind: "on" },
      });
      apply.mockResolvedValueOnce(adapterResult);

      const result = await controller.handle({ type: "config/save", input: NEW_INPUT });

      expect(setState.mock.calls[0]?.[0]).toEqual({
        version: 1,
        config: NEW_CONFIG,
        status: { kind: "on" },
      });
      expect(apply).toHaveBeenCalledWith(NEW_CONFIG);
      expect(result).toMatchObject({ snapshot: { config: NEW_CONFIG, status: expectedStatus } });
      expect(state()).toEqual({ version: 1, config: NEW_CONFIG, status: expectedStatus });
    },
  );
});

describe("proxy controller serialization and failures", () => {
  it("Given enable in flight When commands arrive Then applying is returned without duplicate work", async () => {
    const { promise, resolve } = Promise.withResolvers<AdapterResult>();
    const { controller, apply, setState, events } = createHarness();
    apply.mockReturnValueOnce(promise);

    const first = controller.handle({ type: "proxy/enable" });

    await expect(controller.handle({ type: "state/get" })).resolves.toMatchObject({
      snapshot: { status: { kind: "applying", operation: "enable" } },
    });
    await expect(controller.handle({ type: "proxy/enable" })).resolves.toMatchObject({
      snapshot: { status: { kind: "applying" } },
    });
    await expect(controller.handle({ type: "proxy/disable" })).resolves.toMatchObject({
      snapshot: { status: { kind: "applying" } },
    });
    await expect(
      controller.handle({ type: "config/save", input: NEW_INPUT }),
    ).resolves.toMatchObject({ snapshot: { status: { kind: "applying" } } });
    expect(events[0]).toBe("icon:/icons/off-48.png");
    expect(apply).toHaveBeenCalledOnce();
    expect(setState).not.toHaveBeenCalled();

    resolve({ kind: "applied" });
    await expect(first).resolves.toMatchObject({ snapshot: { status: { kind: "on" } } });
  });

  it("Given storage rejects stable enable When completed Then storage error returns and applying clears", async () => {
    const { controller, setState, webrtc } = createHarness();
    setState.mockRejectedValueOnce(new StorageError("set", { cause: new RangeError("full") }));

    await expect(controller.handle({ type: "proxy/enable" })).resolves.toMatchObject({
      snapshot: { status: { kind: "error", operation: "enable", code: "storage" } },
    });
    await expect(controller.handle({ type: "state/get" })).resolves.toMatchObject({
      snapshot: { status: { kind: "off" } },
    });
    expect(webrtc.release).toHaveBeenCalledOnce();
  });

  it("Given storage rejects stable disable When completed Then WebRTC is released", async () => {
    const { controller, setState, webrtc } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });
    setState.mockRejectedValueOnce(new StorageError("set", { cause: new RangeError("full") }));

    await expect(controller.handle({ type: "proxy/disable" })).resolves.toMatchObject({
      snapshot: { status: { kind: "error", operation: "disable", code: "storage" } },
    });
    expect(webrtc.release).toHaveBeenCalledOnce();
  });

  it("Given stored on status When indicator refreshes Then WebRTC protection is reasserted", async () => {
    const { controller, apply, clear, webrtc, events } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });

    await controller.refreshIndicator();

    expect(events).toContain("icon:/icons/on-48.png");
    expect(events.some((event) => /^title:.+/u.test(event))).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(webrtc.protect).toHaveBeenCalledOnce();
    expect(webrtc.release).not.toHaveBeenCalled();
  });

  it("Given stored off status When indicator refreshes Then WebRTC protection is released", async () => {
    const { controller, webrtc, events } = createHarness();

    await controller.refreshIndicator();

    expect(events).toContain("icon:/icons/off-48.png");
    expect(webrtc.release).toHaveBeenCalledOnce();
    expect(webrtc.protect).not.toHaveBeenCalled();
  });
});

describe("proxy controller runtime health (never gates state)", () => {
  it("Given enable applies but the app is unreachable Then state is on yet health is unreachable (fail-closed)", async () => {
    const { controller, events } = createHarness(
      OFF_STATE,
      vi.fn(async () => false),
    );

    const result = await controller.handle({ type: "proxy/enable" });

    expect(result).toMatchObject({
      snapshot: { status: { kind: "on" }, webrtc: "protected", health: "unreachable" },
    });
    expect(events).toContain("icon:/icons/problem-48.png");
    expect(events).toContain("title:browser_action_title_unreachable");
  });

  it("Given enable applies and the app answers the probe Then health is reachable and the badge reads ON", async () => {
    const { controller, probe, events } = createHarness();

    const result = await controller.handle({ type: "proxy/enable" });

    expect(result).toMatchObject({ snapshot: { status: { kind: "on" }, health: "reachable" } });
    expect(probe).toHaveBeenCalledWith(CONFIG);
    expect(events).toContain("icon:/icons/on-48.png");
  });

  it("Given on state When disabled Then health resets to unknown", async () => {
    const { controller, probe } = createHarness({ ...OFF_STATE, status: { kind: "on" } });

    const result = await controller.handle({ type: "proxy/disable" });

    expect(result).toMatchObject({ snapshot: { status: { kind: "off" }, health: "unknown" } });
    expect(probe).not.toHaveBeenCalled();
  });

  it("Given the proxy is off When health/check finds it unreachable Then status stays off and the badge stays empty", async () => {
    const { controller, events } = createHarness(
      OFF_STATE,
      vi.fn(async () => false),
    );

    const result = await controller.handle({ type: "health/check" });

    expect(result).toMatchObject({ snapshot: { status: { kind: "off" }, health: "unreachable" } });
    expect(events).toContain("icon:/icons/off-48.png");
    expect(events).not.toContain("icon:/icons/problem-48.png");
  });

  it("Given the proxy is on When a passive proxy error is noted Then the badge flips to the unreachable mark", async () => {
    const { controller, events } = createHarness({ ...OFF_STATE, status: { kind: "on" } });

    await controller.noteProxyError();

    expect(events).toContain("icon:/icons/problem-48.png");
  });

  it("Given the proxy is off When a passive proxy error is noted Then it is a no-op and the probe is never called", async () => {
    const { controller, events, probe } = createHarness();

    await controller.noteProxyError();

    expect(events).toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });

  it("Given an unreachable proxy error already noted When noted again Then the second call is debounced", async () => {
    const { controller, getState, surface } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });

    await controller.noteProxyError();
    const readsAfterFirst = getState.mock.calls.length;
    const badgeWritesAfterFirst = surface.setIcon.mock.calls.length;

    await controller.noteProxyError();

    expect(getState.mock.calls.length).toBe(readsAfterFirst);
    expect(surface.setIcon.mock.calls.length).toBe(badgeWritesAfterFirst);
  });

  it("Given enable fails at the adapter Then the probe is skipped and health stays unknown", async () => {
    const { controller, apply, probe } = createHarness();
    apply.mockResolvedValueOnce({ kind: "error", code: "proxy_api" });

    const result = await controller.handle({ type: "proxy/enable" });

    expect(result).toMatchObject({
      snapshot: {
        status: { kind: "error", operation: "enable", code: "proxy_api" },
        health: "unknown",
      },
    });
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("proxy controller advisory repaints are guarded against concurrent mutations", () => {
  const lastEvent = (events: readonly string[], prefix: string): string | undefined =>
    events.filter((event) => event.startsWith(prefix)).at(-1);

  it("Given health/check probing on When disable completes mid-probe Then the stale ON repaint is suppressed", async () => {
    const probeGate = Promise.withResolvers<boolean>();
    const probe = vi.fn(() => probeGate.promise);
    const { controller, events } = createHarness({ ...OFF_STATE, status: { kind: "on" } }, probe);

    const healthPromise = controller.handle({ type: "health/check" });
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));

    await expect(controller.handle({ type: "proxy/disable" })).resolves.toMatchObject({
      snapshot: { status: { kind: "off" } },
    });
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");

    probeGate.resolve(true);
    await healthPromise;

    // The committed state is off; the delayed health/check must NOT repaint ON over it.
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");
    expect(lastEvent(events, "title:")).not.toBe("title:browser_action_title_on");
  });

  it("Given health/check probing on When a reapply conflicts mid-probe Then the badge stays conflict red", async () => {
    const probeGate = Promise.withResolvers<boolean>();
    const probe = vi.fn(() => probeGate.promise);
    const { controller, apply, events } = createHarness(
      { ...OFF_STATE, status: { kind: "on" } },
      probe,
    );
    apply.mockResolvedValueOnce({ kind: "conflict", reason: "controlled_by_other" });

    const healthPromise = controller.handle({ type: "health/check" });
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));

    await expect(
      controller.handle({ type: "config/save", input: NEW_INPUT }),
    ).resolves.toMatchObject({ snapshot: { status: { kind: "conflict" } } });
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/problem-48.png");

    probeGate.resolve(true);
    await healthPromise;

    // Committed state is conflict (red); the stale health/check must NOT repaint amber/green.
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/problem-48.png");
  });

  it("Given noteProxyError reading state When disable completes mid-read Then the stale unreachable repaint is suppressed", async () => {
    const { controller, getState, events } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });
    const readGate = Promise.withResolvers<StoredProxyState>();
    getState.mockImplementationOnce(() => readGate.promise);

    const notePromise = controller.noteProxyError();
    await vi.waitFor(() => expect(getState).toHaveBeenCalledTimes(1));

    await expect(controller.handle({ type: "proxy/disable" })).resolves.toMatchObject({
      snapshot: { status: { kind: "off" } },
    });
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");

    readGate.resolve({ ...OFF_STATE, status: { kind: "on" } });
    await notePromise;

    // Disable owns the indicator; the delayed proxy-error must NOT flip the badge to "!".
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");
    expect(events).not.toContain("icon:/icons/problem-48.png");
  });
});

describe("proxy controller serialized commits guard advisory repaints begun mid-mutation", () => {
  const lastEvent = (events: readonly string[], prefix: string): string | undefined =>
    events.filter((event) => event.startsWith(prefix)).at(-1);

  it("Given health/check begins while a disable is in flight When disable commits Then no stale ON is painted", async () => {
    const probeGate = Promise.withResolvers<boolean>();
    const clearGate = Promise.withResolvers<AdapterResult>();
    const probe = vi.fn(() => probeGate.promise);
    const { controller, clear, events } = createHarness(
      { ...OFF_STATE, status: { kind: "on" } },
      probe,
    );
    clear.mockImplementationOnce(() => clearGate.promise);

    // Disable is parked at its (deferred) adapter.clear() — the mutation is in flight.
    const disablePromise = controller.handle({ type: "proxy/disable" });
    await vi.waitFor(() => expect(clear).toHaveBeenCalled());

    // An advisory health/check that BEGINS during the mutation must not paint over the commit.
    const healthPromise = controller.handle({ type: "health/check" });
    // Let a pre-fix health/check read the still-on state and park at its probe await.
    await new Promise((resolve) => setTimeout(resolve, 0));

    clearGate.resolve({ kind: "cleared" });
    await disablePromise;
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");

    probeGate.resolve(true);
    await healthPromise;

    // The committed state is off; the delayed health/check must NOT repaint ON over it.
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");
    expect(events).not.toContain("icon:/icons/on-48.png");
  });

  it("Given a mutation in flight When health/check arrives Then it returns immediately without probing", async () => {
    const clearGate = Promise.withResolvers<AdapterResult>();
    const probe = vi.fn(async (): Promise<boolean> => true);
    const { controller, clear, events } = createHarness(
      { ...OFF_STATE, status: { kind: "on" } },
      probe,
    );
    clear.mockImplementationOnce(() => clearGate.promise);

    const disablePromise = controller.handle({ type: "proxy/disable" });
    await vi.waitFor(() => expect(clear).toHaveBeenCalled());

    const result = await controller.handle({ type: "health/check" });

    // Busy-skip at entry: no probe, no ON repaint while the mutation owns the indicator.
    expect(result.kind).toBe("snapshot");
    expect(probe).not.toHaveBeenCalled();
    expect(events).not.toContain("icon:/icons/on-48.png");

    clearGate.resolve({ kind: "cleared" });
    await disablePromise;
  });

  it("Given refreshIndicator is mid-release When an enable runs Then protect is serialized after the release, never during it", async () => {
    const releaseGate = Promise.withResolvers<WebRtcResult>();
    const { controller, webrtc } = createHarness(OFF_STATE);
    webrtc.release.mockImplementationOnce(() => releaseGate.promise);

    // refreshIndicator (off state) is parked inside its WebRTC release().
    const refreshPromise = controller.refreshIndicator();
    await vi.waitFor(() => expect(webrtc.release).toHaveBeenCalledTimes(1));

    // An enable arrives while the release is still in flight; it must NOT protect yet.
    const enablePromise = controller.handle({ type: "proxy/enable" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const protectedWhileReleasePending = webrtc.protect.mock.calls.length > 0;

    releaseGate.resolve({ kind: "released" });
    await refreshPromise;
    await enablePromise;

    // Serialized: protect only runs once the stale release has fully committed.
    expect(protectedWhileReleasePending).toBe(false);
    expect(webrtc.protect).toHaveBeenCalledTimes(1);
    // The enable's protect is the final WebRTC state — a stale release cannot overwrite it.
    const current = await controller.handle({ type: "state/get" });
    expect(current).toMatchObject({ snapshot: { status: { kind: "on" }, webrtc: "protected" } });
  });

  it("Given two proxy errors fire together When both note the failure Then only one unreachable repaint occurs", async () => {
    const { controller, events } = createHarness({ ...OFF_STATE, status: { kind: "on" } });

    await Promise.all([controller.noteProxyError(), controller.noteProxyError()]);

    expect(events.filter((event) => event === "icon:/icons/problem-48.png").length).toBe(1);
  });
});

describe("proxy controller advisory generation is captured before the state read", () => {
  const lastEvent = (events: readonly string[], prefix: string): string | undefined =>
    events.filter((event) => event.startsWith(prefix)).at(-1);

  it("Given health/check parked in getState When a disable commits during the stall Then no stale ON is painted", async () => {
    const onState: StoredProxyState = { ...OFF_STATE, status: { kind: "on" } };
    const getGate = Promise.withResolvers<StoredProxyState>();
    const { controller, getState, events } = createHarness(onState);
    // Defer ONLY health/check's read; the disable's own getState resolves normally.
    getState.mockImplementationOnce(() => getGate.promise);

    const healthPromise = controller.handle({ type: "health/check" });
    await vi.waitFor(() => expect(getState).toHaveBeenCalledTimes(1));

    await controller.handle({ type: "proxy/disable" });
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");

    getGate.resolve(onState);
    await healthPromise;

    // The committed state is off; the stalled read must not resume with a fresh generation and paint ON.
    expect(lastEvent(events, "icon:")).toBe("icon:/icons/off-48.png");
    expect(events).not.toContain("icon:/icons/on-48.png");
  });

  it("Given refreshIndicator parked in getState When an enable commits during the stall Then WebRTC is not stale-released", async () => {
    const getGate = Promise.withResolvers<StoredProxyState>();
    const { controller, getState, webrtc } = createHarness(OFF_STATE);
    getState.mockImplementationOnce(() => getGate.promise);

    const refreshPromise = controller.refreshIndicator();
    await vi.waitFor(() => expect(getState).toHaveBeenCalledTimes(1));

    await controller.handle({ type: "proxy/enable" });
    expect(webrtc.protect).toHaveBeenCalledTimes(1);

    getGate.resolve(OFF_STATE);
    await refreshPromise;

    // The stalled off-read must not resume and release WebRTC after the enable protected it.
    const current = await controller.handle({ type: "state/get" });
    expect(current).toMatchObject({ snapshot: { status: { kind: "on" }, webrtc: "protected" } });
    expect(webrtc.release).not.toHaveBeenCalled();
  });

  it("Given a health probe for the old config When config-save commits during the probe Then the stale health does not paint", async () => {
    const probeGate = Promise.withResolvers<boolean>();
    const probe = vi.fn(() => probeGate.promise);
    const { controller, surface } = createHarness(OFF_STATE, probe);

    const healthPromise = controller.handle({ type: "health/check" });
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));

    await controller.handle({ type: "config/save", input: NEW_INPUT });
    const writesAfterSave = surface.setIcon.mock.calls.length;

    probeGate.resolve(true);
    await healthPromise;

    // config-save bumped the generation, so the stale probe for the replaced config adds no paint.
    expect(surface.setIcon.mock.calls.length).toBe(writesAfterSave);
  });
});

describe("proxy controller schedules background health probes only while on", () => {
  const lastCall = (fn: ReturnType<typeof vi.fn>): readonly unknown[] | undefined =>
    fn.mock.calls.at(-1);

  it("Given off state When enable applies Then background probes are scheduled active", async () => {
    const { controller, scheduleHealthProbes } = createHarness();

    await controller.handle({ type: "proxy/enable" });

    expect(lastCall(scheduleHealthProbes)).toEqual([true]);
  });

  it("Given on state When disable completes Then background probes are cancelled", async () => {
    const { controller, scheduleHealthProbes } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });

    await controller.handle({ type: "proxy/disable" });

    expect(lastCall(scheduleHealthProbes)).toEqual([false]);
  });

  it("Given enable maps to conflict Then background probes are cancelled", async () => {
    const { controller, apply, scheduleHealthProbes } = createHarness();
    apply.mockResolvedValueOnce({ kind: "conflict", reason: "controlled_by_other" });

    await controller.handle({ type: "proxy/enable" });

    expect(lastCall(scheduleHealthProbes)).toEqual([false]);
  });

  it("Given stored on status When indicator refreshes Then probes are (re)scheduled active", async () => {
    const { controller, scheduleHealthProbes } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });

    await controller.refreshIndicator();

    expect(lastCall(scheduleHealthProbes)).toEqual([true]);
  });

  it("Given stored off status When indicator refreshes Then probes are cancelled", async () => {
    const { controller, scheduleHealthProbes } = createHarness();

    await controller.refreshIndicator();

    expect(lastCall(scheduleHealthProbes)).toEqual([false]);
  });

  it("Given scheduleHealthProbes rejects When enable applies Then the on-snapshot still commits and paints", async () => {
    const { controller, scheduleHealthProbes, webrtc, events } = createHarness();
    scheduleHealthProbes.mockRejectedValueOnce(new Error("alarms unavailable"));

    const result = await controller.handle({ type: "proxy/enable" });

    expect(result).toMatchObject({ snapshot: { status: { kind: "on" }, webrtc: "protected" } });
    expect(webrtc.protect).toHaveBeenCalledOnce();
    expect(events).toContain("icon:/icons/on-48.png");
  });

  it("Given scheduleHealthProbes rejects When indicator refreshes on Then it still paints the badge", async () => {
    const { controller, scheduleHealthProbes, events } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });
    scheduleHealthProbes.mockRejectedValueOnce(new Error("alarms unavailable"));

    await controller.refreshIndicator();

    expect(events).toContain("icon:/icons/on-48.png");
  });
});

describe("proxy controller config-save takes serialized ownership of the indicator", () => {
  it("Given stale unreachable health while off When a new config is saved Then health resets to unknown and the indicator repaints", async () => {
    const probe = vi.fn(async (): Promise<boolean> => false);
    const { controller, events } = createHarness(OFF_STATE, probe);

    const preflight = await controller.handle({ type: "health/check" });
    expect(preflight).toMatchObject({
      snapshot: { status: { kind: "off" }, health: "unreachable" },
    });

    const eventsBeforeSave = events.length;
    const saved = await controller.handle({ type: "config/save", input: NEW_INPUT });

    expect(saved).toMatchObject({
      snapshot: { config: NEW_CONFIG, status: { kind: "off" }, health: "unknown" },
    });
    expect(events.slice(eventsBeforeSave)).toContain("icon:/icons/off-48.png");
  });

  it("Given a stale unreachable advisory blocked mid-probe When config-save reapplies first Then the advisory yields ownership and never repaints the surface", async () => {
    const probeGate = Promise.withResolvers<void>();
    const { controller, events, probe } = createHarness({
      ...OFF_STATE,
      status: { kind: "on" },
    });
    // Probe #1 is the blocked advisory (unreachable); probe #2 is the reapply (reachable, default).
    probe.mockImplementationOnce(async (): Promise<boolean> => {
      await probeGate.promise;
      return false;
    });

    const advisory = controller.handle({ type: "health/check" });
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));

    const saved = await controller.handle({ type: "config/save", input: NEW_INPUT });

    probeGate.resolve();
    await advisory;

    expect(saved).toMatchObject({ snapshot: { status: { kind: "on" }, health: "reachable" } });
    const iconEvents = events.filter((event) => event.startsWith("icon:"));
    const titleEvents = events.filter((event) => event.startsWith("title:"));
    expect(iconEvents).not.toContain("icon:/icons/problem-48.png");
    expect(titleEvents).not.toContain("title:browser_action_title_unreachable");
    expect(iconEvents.at(-1)).toBe("icon:/icons/on-48.png");
    expect(titleEvents.at(-1)).toBe("title:browser_action_title_on");
    expect(events.at(-1)).toBe("title:browser_action_title_on");
  });
});
