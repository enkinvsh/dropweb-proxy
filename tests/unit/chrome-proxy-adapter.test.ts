import { describe, expect, it, vi } from "vitest";

import { createChromeProxyController } from "../../src/background/chrome-proxy-adapter";
import type { ProxyConfig } from "../../src/domain/proxy-config";

const HTTP_CONFIG: ProxyConfig = {
  type: "http",
  host: "proxy.local",
  port: 8080,
  bypass: ["localhost", "127.0.0.1", "::1", "[2001:db8::1]"],
};

const SOCKS5_CONFIG: ProxyConfig = {
  ...HTTP_CONFIG,
  type: "socks5",
};

function createPort(levelOfControl = "controllable_by_this_extension") {
  return {
    get: vi.fn(() => Promise.resolve({ levelOfControl })),
    set: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  };
}

describe("Chrome proxy apply", () => {
  it("Given an HTTP config When applied Then the exact fixed_servers payload has bracketed IPv6 bypass entries", async () => {
    const port = createPort();
    const controller = createChromeProxyController(port);

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "applied" });
    expect(port.get).toHaveBeenCalledWith({ incognito: false });
    expect(port.set).toHaveBeenCalledWith({
      scope: "regular",
      value: {
        mode: "fixed_servers",
        rules: {
          singleProxy: { scheme: "http", host: "proxy.local", port: 8080 },
          bypassList: ["localhost", "127.0.0.1", "[::1]", "[2001:db8::1]"],
        },
      },
    });
  });

  it("Given a SOCKS5 config When applied Then only the fixed server scheme is socks5", async () => {
    const port = createPort();
    const controller = createChromeProxyController(port);

    const result = await controller.apply(SOCKS5_CONFIG);

    expect(result).toEqual({ kind: "applied" });
    expect(port.set).toHaveBeenCalledWith({
      scope: "regular",
      value: {
        mode: "fixed_servers",
        rules: {
          singleProxy: { scheme: "socks5", host: "proxy.local", port: 8080 },
          bypassList: ["localhost", "127.0.0.1", "[::1]", "[2001:db8::1]"],
        },
      },
    });
  });

  it("Given control by another extension When applied Then conflict is returned without setting", async () => {
    const port = createPort("controlled_by_other_extensions");
    const controller = createChromeProxyController(port);

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "conflict", reason: "controlled_by_other" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given a non-controllable setting When applied Then not_controllable is returned without setting", async () => {
    const port = createPort("not_controllable");
    const controller = createChromeProxyController(port);

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "conflict", reason: "not_controllable" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given an unknown control level When applied Then proxy_api error is returned without setting", async () => {
    const port = createPort("future_browser_value");
    const controller = createChromeProxyController(port);

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given a rejecting settings write When applied Then proxy_api error is returned", async () => {
    const port = createPort();
    port.set.mockRejectedValueOnce(new RangeError("proxy API rejected"));
    const controller = createChromeProxyController(port);

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
  });
});

describe("Chrome proxy clear", () => {
  it("Given a resolving clear call When disabled Then regular control is cleared once", async () => {
    const port = createPort();
    const controller = createChromeProxyController(port);

    const result = await controller.clear();

    expect(result).toEqual({ kind: "cleared" });
    expect(port.clear).toHaveBeenCalledOnce();
    expect(port.clear).toHaveBeenCalledWith({ scope: "regular" });
    expect(port.set).not.toHaveBeenCalled();
  });

  it("Given a rejecting clear call When disabled Then proxy_api error is returned", async () => {
    const port = createPort();
    port.clear.mockRejectedValueOnce(new RangeError("proxy API rejected"));
    const controller = createChromeProxyController(port);

    const result = await controller.clear();

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
  });
});
