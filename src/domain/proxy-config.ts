export const PROXY_TYPES = ["http", "socks5"] as const;

export type ProxyType = (typeof PROXY_TYPES)[number];

export type ProxyConfig = {
  readonly type: ProxyType;
  readonly host: string;
  readonly port: number;
  readonly bypass: readonly string[];
};

export type ProxyConfigInput = {
  readonly type: string;
  readonly host: string;
  readonly port: string;
  readonly bypass: string;
};

export type ProxyOperation = "enable" | "disable" | "reapply";

export type ProxyStatus =
  | { readonly kind: "off" }
  | { readonly kind: "applying"; readonly operation: ProxyOperation }
  | { readonly kind: "on" }
  | {
      readonly kind: "conflict";
      readonly reason: "controlled_by_other" | "not_controllable";
    }
  | {
      readonly kind: "error";
      readonly operation: ProxyOperation | "save" | "initialize";
      readonly code:
        | "proxy_api"
        | "storage"
        | "invalid_message"
        | "firefox_private_access_required";
    };

export type StableProxyStatus = Exclude<ProxyStatus, { readonly kind: "applying" }>;

export type StoredProxyState = {
  readonly version: 1;
  readonly config: ProxyConfig;
  readonly status: StableProxyStatus;
};

export type FieldErrors = {
  readonly type?: "type_invalid";
  readonly host?: "host_required" | "host_invalid";
  readonly port?: "port_invalid";
  readonly bypass?: "bypass_invalid";
};

export type ParseProxyConfigResult =
  | { readonly ok: true; readonly value: ProxyConfig }
  | { readonly ok: false; readonly errors: FieldErrors };

type ValidationResult<TValue, TCode extends string> =
  | { readonly valid: true; readonly value: TValue }
  | { readonly valid: false; readonly code: TCode };

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  type: "http",
  host: "127.0.0.1",
  port: 7890,
  bypass: ["localhost", "127.0.0.1", "::1"],
};

export const DEFAULT_STORED_STATE: StoredProxyState = {
  version: 1,
  config: DEFAULT_PROXY_CONFIG,
  status: { kind: "off" },
};

function isValidProxyType(value: unknown): value is ProxyType {
  return PROXY_TYPES.some((proxyType) => proxyType === value);
}

function isValidProxyHost(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[\s/]/u.test(value);
}

function isValidProxyPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

export function isValidProxyConfig(value: unknown): value is ProxyConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("type" in value && "host" in value && "port" in value && "bypass" in value)) {
    return false;
  }
  return (
    isValidProxyType(value.type) &&
    isValidProxyHost(value.host) &&
    isValidProxyPort(value.port) &&
    Array.isArray(value.bypass) &&
    value.bypass.every((entry: unknown) => typeof entry === "string")
  );
}

export function parseProxyConfig(input: ProxyConfigInput): ParseProxyConfigResult {
  const typeResult: ValidationResult<ProxyType, "type_invalid"> = isValidProxyType(input.type)
    ? { valid: true, value: input.type }
    : { valid: false, code: "type_invalid" };

  const host = input.host.trim();
  const hostResult: ValidationResult<string, "host_required" | "host_invalid"> =
    host.length === 0
      ? { valid: false, code: "host_required" }
      : !isValidProxyHost(host)
        ? { valid: false, code: "host_invalid" }
        : { valid: true, value: host };

  const portText = input.port.trim();
  const port = Number(portText);
  const portResult: ValidationResult<number, "port_invalid"> =
    /^\d+$/u.test(portText) && isValidProxyPort(port)
      ? { valid: true, value: port }
      : { valid: false, code: "port_invalid" };

  const bypassEntries = input.bypass
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const bypassResult: ValidationResult<readonly string[], "bypass_invalid"> = bypassEntries.some(
    (entry) => entry.includes(","),
  )
    ? { valid: false, code: "bypass_invalid" }
    : { valid: true, value: [...new Set(bypassEntries)] };

  const errors: FieldErrors = {
    ...(typeResult.valid ? {} : { type: typeResult.code }),
    ...(hostResult.valid ? {} : { host: hostResult.code }),
    ...(portResult.valid ? {} : { port: portResult.code }),
    ...(bypassResult.valid ? {} : { bypass: bypassResult.code }),
  };

  if (!typeResult.valid || !hostResult.valid || !portResult.valid || !bypassResult.valid) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      type: typeResult.value,
      host: hostResult.value,
      port: portResult.value,
      bypass: bypassResult.value,
    },
  };
}
