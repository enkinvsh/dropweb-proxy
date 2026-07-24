import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROXY_CONFIG,
  type ProxyConfigInput,
  parseProxyConfig,
} from "../../src/domain/proxy-config";

const VALID_INPUT: ProxyConfigInput = {
  type: "http",
  host: "127.0.0.1",
  port: "7890",
  bypass: "localhost\n127.0.0.1\n::1",
};

describe("proxy configuration defaults", () => {
  it("Given the domain defaults When read Then they equal the approved proxy configuration exactly", () => {
    expect(DEFAULT_PROXY_CONFIG).toEqual({
      type: "http",
      host: "127.0.0.1",
      port: 7890,
      bypass: ["localhost", "127.0.0.1", "::1"],
    });
  });
});

describe("proxy type parsing", () => {
  it.each(["http", "socks5"])(
    "Given type %s When parsed Then the proxy type is accepted",
    (type) => {
      expect(parseProxyConfig({ ...VALID_INPUT, type })).toEqual({
        ok: true,
        value: { ...DEFAULT_PROXY_CONFIG, type },
      });
    },
  );

  it.each(["https", "ftp", ""])(
    "Given unsupported type %s When parsed Then type_invalid is returned",
    (type) => {
      expect(parseProxyConfig({ ...VALID_INPUT, type })).toEqual({
        ok: false,
        errors: { type: "type_invalid" },
      });
    },
  );
});

describe("proxy host parsing", () => {
  it.each(["", "   "])("Given blank host %j When parsed Then host_required is returned", (host) => {
    expect(parseProxyConfig({ ...VALID_INPUT, host })).toEqual({
      ok: false,
      errors: { host: "host_required" },
    });
  });

  it.each(["http://127.0.0.1", "127.0.0.1/path", "a b"])(
    "Given malformed host %s When parsed Then host_invalid is returned",
    (host) => {
      expect(parseProxyConfig({ ...VALID_INPUT, host })).toEqual({
        ok: false,
        errors: { host: "host_invalid" },
      });
    },
  );

  it.each(["127.0.0.1", "proxy.local", "::1"])(
    "Given host %s When parsed Then the trimmed host is accepted",
    (host) => {
      expect(parseProxyConfig({ ...VALID_INPUT, host: `  ${host}  ` })).toEqual({
        ok: true,
        value: { ...DEFAULT_PROXY_CONFIG, host },
      });
    },
  );
});

describe("proxy port parsing", () => {
  it.each(["", "0", "65536", "12.5", "abc"])(
    "Given invalid port %j When parsed Then port_invalid is returned",
    (port) => {
      expect(parseProxyConfig({ ...VALID_INPUT, port })).toEqual({
        ok: false,
        errors: { port: "port_invalid" },
      });
    },
  );

  it.each([
    ["1", 1],
    ["7890", 7890],
    ["65535", 65535],
  ])("Given port %s When parsed Then numeric port %i is returned", (port, expectedPort) => {
    expect(parseProxyConfig({ ...VALID_INPUT, port })).toEqual({
      ok: true,
      value: { ...DEFAULT_PROXY_CONFIG, port: expectedPort },
    });
  });
});

describe("proxy bypass parsing", () => {
  it("Given one bypass entry per line When parsed Then entries are trimmed and ordered duplicates are removed", () => {
    expect(
      parseProxyConfig({
        ...VALID_INPUT,
        bypass: " localhost \nproxy.local\nlocalhost\n\n 127.0.0.1 ",
      }),
    ).toEqual({
      ok: true,
      value: {
        ...DEFAULT_PROXY_CONFIG,
        bypass: ["localhost", "proxy.local", "127.0.0.1"],
      },
    });
  });

  it("Given an empty bypass value When parsed Then an empty bypass list is returned", () => {
    expect(parseProxyConfig({ ...VALID_INPUT, bypass: "" })).toEqual({
      ok: true,
      value: { ...DEFAULT_PROXY_CONFIG, bypass: [] },
    });
  });

  it("Given a bypass line containing a comma When parsed Then bypass_invalid is returned", () => {
    expect(parseProxyConfig({ ...VALID_INPUT, bypass: "localhost,127.0.0.1" })).toEqual({
      ok: false,
      errors: { bypass: "bypass_invalid" },
    });
  });
});
