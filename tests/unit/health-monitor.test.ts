import { describe, expect, it, vi } from "vitest";

import { PROBE_TIMEOUT_MS, probeProxy } from "../../src/background/health-monitor";
import type { ProxyConfig } from "../../src/domain/proxy-config";

const CONFIG: ProxyConfig = {
  type: "http",
  host: "127.0.0.1",
  port: 7890,
  bypass: ["localhost"],
};

describe("probeProxy", () => {
  it("returns true when the endpoint answers at all", async () => {
    const fetchFn = vi.fn().mockResolvedValue({});
    await expect(probeProxy(CONFIG, fetchFn)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:7890/",
      expect.objectContaining({ mode: "no-cors", cache: "no-store" }),
    );
  });

  it("returns false when the connection is refused or times out", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(probeProxy(CONFIG, fetchFn)).resolves.toBe(false);
  });

  it("passes an abort signal so a hung port cannot stall the caller", async () => {
    const fetchFn = vi.fn().mockResolvedValue({});
    await probeProxy(CONFIG, fetchFn);
    const init = fetchFn.mock.calls[0]?.[1] as { signal: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(PROBE_TIMEOUT_MS).toBe(1500);
  });
});
