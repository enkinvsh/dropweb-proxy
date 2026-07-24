import type { ProxyConfigInput } from "../domain/proxy-config";

export type ProxyRequest =
  | { readonly type: "state/get" }
  | { readonly type: "config/save"; readonly input: ProxyConfigInput }
  | { readonly type: "proxy/enable" }
  | { readonly type: "proxy/disable" }
  | { readonly type: "health/check" };

function parseConfigInput(raw: unknown): ProxyConfigInput | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  if (!("type" in raw && "host" in raw && "port" in raw && "bypass" in raw)) {
    return null;
  }
  if (
    typeof raw.type !== "string" ||
    typeof raw.host !== "string" ||
    typeof raw.port !== "string" ||
    typeof raw.bypass !== "string"
  ) {
    return null;
  }
  return { type: raw.type, host: raw.host, port: raw.port, bypass: raw.bypass };
}

export function parseProxyRequest(raw: unknown): ProxyRequest | null {
  if (typeof raw !== "object" || raw === null || !("type" in raw)) {
    return null;
  }
  switch (raw.type) {
    case "state/get":
      return { type: "state/get" };
    case "config/save": {
      const input = "input" in raw ? parseConfigInput(raw.input) : null;
      return input === null ? null : { type: "config/save", input };
    }
    case "proxy/enable":
      return { type: "proxy/enable" };
    case "proxy/disable":
      return { type: "proxy/disable" };
    case "health/check":
      return { type: "health/check" };
    default:
      return null;
  }
}
