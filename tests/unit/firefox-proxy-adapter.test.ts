import { describe, expect, it, vi } from "vitest";

import { createFirefoxProxyController } from "../../src/background/firefox-proxy-adapter";
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

function createSettingsPort(levelOfControl = "controllable_by_this_extension") {
  return {
    get: vi.fn(() => Promise.resolve({ levelOfControl })),
    set: vi.fn(() => Promise.resolve(true)),
    clear: vi.fn(() => Promise.resolve(true)),
  };
}

function createIncognitoPort(isAllowed = true) {
  return {
    isAllowedIncognitoAccess: vi.fn(() => Promise.resolve(isAllowed)),
  };
}

describe("Firefox proxy apply", () => {
  it("Given private access is denied When applied Then a private-access error is returned without reading or setting", async () => {
    const settingsPort = createSettingsPort();
    const incognitoPort = createIncognitoPort(false);
    const controller = createFirefoxProxyController(settingsPort, incognitoPort);

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "error", code: "firefox_private_access_required" });
    expect(settingsPort.get).not.toHaveBeenCalled();
    expect(settingsPort.set).not.toHaveBeenCalled();
  });

  it("Given an HTTP config When applied Then the exact manual HTTP payload has bracketed passthrough", async () => {
    const settingsPort = createSettingsPort();
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "applied" });
    expect(settingsPort.get).toHaveBeenCalledWith({});
    expect(settingsPort.set).toHaveBeenCalledWith({
      value: {
        proxyType: "manual",
        http: "proxy.local:8080",
        httpProxyAll: true,
        passthrough: "localhost, 127.0.0.1, [::1], [2001:db8::1]",
      },
    });
  });

  it("Given a SOCKS5 config When applied Then the exact manual SOCKS5 payload enables version 5 and proxy DNS", async () => {
    const settingsPort = createSettingsPort();
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.apply(SOCKS5_CONFIG);

    expect(result).toEqual({ kind: "applied" });
    expect(settingsPort.set).toHaveBeenCalledWith({
      value: {
        proxyType: "manual",
        socks: "proxy.local:8080",
        socksVersion: 5,
        proxyDNS: true,
        passthrough: "localhost, 127.0.0.1, [::1], [2001:db8::1]",
      },
    });
  });

  it.each([
    ["controlled_by_other_extensions", "controlled_by_other"],
    ["not_controllable", "not_controllable"],
  ])(
    "Given control level %s When applied Then conflict %s is returned without setting",
    async (levelOfControl, reason) => {
      const settingsPort = createSettingsPort(levelOfControl);
      const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

      const result = await controller.apply(HTTP_CONFIG);

      expect(result).toEqual({ kind: "conflict", reason });
      expect(settingsPort.set).not.toHaveBeenCalled();
    },
  );

  it("Given an unknown control level When applied Then proxy_api error is returned without setting", async () => {
    const settingsPort = createSettingsPort("future_browser_value");
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
    expect(settingsPort.set).not.toHaveBeenCalled();
  });

  it("Given settings set resolves false When applied Then proxy_api error is returned", async () => {
    const settingsPort = createSettingsPort();
    settingsPort.set.mockResolvedValueOnce(false);
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
  });

  it("Given settings set rejects When applied Then proxy_api error is returned", async () => {
    const settingsPort = createSettingsPort();
    settingsPort.set.mockRejectedValueOnce(new RangeError("proxy API rejected"));
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.apply(HTTP_CONFIG);

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
  });
});

describe("Firefox proxy clear", () => {
  it("Given clear resolves true When disabled Then settings are cleared without setting proxyType none", async () => {
    const settingsPort = createSettingsPort();
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.clear();

    expect(result).toEqual({ kind: "cleared" });
    expect(settingsPort.clear).toHaveBeenCalledOnce();
    expect(settingsPort.clear).toHaveBeenCalledWith({});
    expect(settingsPort.set).not.toHaveBeenCalled();
  });

  it("Given clear resolves false When disabled Then proxy_api error is returned", async () => {
    const settingsPort = createSettingsPort();
    settingsPort.clear.mockResolvedValueOnce(false);
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.clear();

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
  });

  it("Given clear rejects When disabled Then proxy_api error is returned", async () => {
    const settingsPort = createSettingsPort();
    settingsPort.clear.mockRejectedValueOnce(new RangeError("proxy API rejected"));
    const controller = createFirefoxProxyController(settingsPort, createIncognitoPort());

    const result = await controller.clear();

    expect(result).toEqual({ kind: "error", code: "proxy_api" });
  });
});
