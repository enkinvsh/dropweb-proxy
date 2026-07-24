import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing";

import { DEFAULT_STORED_STATE, type StoredProxyState } from "../../src/domain/proxy-config";
import {
  getState,
  resetForInstall,
  StorageError,
  setState,
} from "../../src/storage/settings-repository";

const ROUND_TRIP_STATES: readonly StoredProxyState[] = [
  {
    version: 1,
    config: { type: "http", host: "proxy.local", port: 8080, bypass: ["localhost"] },
    status: { kind: "off" },
  },
  {
    version: 1,
    config: { type: "socks5", host: "::1", port: 1080, bypass: [] },
    status: { kind: "on" },
  },
  {
    version: 1,
    config: { type: "http", host: "192.0.2.1", port: 3128, bypass: ["example.test"] },
    status: { kind: "conflict", reason: "controlled_by_other" },
  },
  {
    version: 1,
    config: { type: "socks5", host: "proxy.local", port: 9050, bypass: ["::1"] },
    status: { kind: "error", operation: "save", code: "storage" },
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

describe("settings repository defaults", () => {
  it("Given empty local storage When state is read Then the approved stored default is returned", async () => {
    await expect(getState()).resolves.toEqual(DEFAULT_STORED_STATE);
  });

  it("Given existing state When reset for install runs Then defaults with off status are written", async () => {
    await fakeBrowser.storage.local.set({ proxyState: ROUND_TRIP_STATES[1] });

    await resetForInstall();

    await expect(fakeBrowser.storage.local.get("proxyState")).resolves.toEqual({
      proxyState: DEFAULT_STORED_STATE,
    });
  });
});

describe("settings repository persistence", () => {
  it.each(ROUND_TRIP_STATES)(
    "Given an edited $config.type configuration with $status.kind status When stored and read Then the state round-trips",
    async (state) => {
      await setState(state);

      await expect(getState()).resolves.toEqual(state);
    },
  );
});

describe("settings repository parsing", () => {
  it.each([
    { caseName: "bad version", value: { ...DEFAULT_STORED_STATE, version: 2 } },
    { caseName: "non-object config", value: { ...DEFAULT_STORED_STATE, config: null } },
    { caseName: "missing config fields", value: { ...DEFAULT_STORED_STATE, config: {} } },
    {
      caseName: "invalid proxy type",
      value: { ...DEFAULT_STORED_STATE, config: { ...DEFAULT_STORED_STATE.config, type: "https" } },
    },
    {
      caseName: "out-of-range port",
      value: { ...DEFAULT_STORED_STATE, config: { ...DEFAULT_STORED_STATE.config, port: 65_536 } },
    },
    {
      caseName: "non-integer port",
      value: { ...DEFAULT_STORED_STATE, config: { ...DEFAULT_STORED_STATE.config, port: 80.5 } },
    },
    {
      caseName: "non-array bypass",
      value: {
        ...DEFAULT_STORED_STATE,
        config: { ...DEFAULT_STORED_STATE.config, bypass: "localhost" },
      },
    },
    { caseName: "unknown status", value: { ...DEFAULT_STORED_STATE, status: { kind: "paused" } } },
  ] satisfies readonly { readonly caseName: string; readonly value: unknown }[])(
    "Given persisted state with $caseName When state is read Then approved defaults are returned",
    async ({ value }) => {
      await fakeBrowser.storage.local.set({ proxyState: value });

      await expect(getState()).resolves.toEqual(DEFAULT_STORED_STATE);
    },
  );
});

describe("settings repository failures", () => {
  it("Given a rejecting storage backend When state is read Then a typed StorageError preserves the cause", async () => {
    const backendError = new RangeError("storage backend rejected");
    vi.spyOn(fakeBrowser.storage.local, "get").mockRejectedValueOnce(backendError);

    const read = getState();

    await expect(read).rejects.toBeInstanceOf(StorageError);
    await expect(read).rejects.toMatchObject({ operation: "get", cause: backendError });
  });
});
