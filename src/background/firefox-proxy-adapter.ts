import type { ProxyConfig } from "../domain/proxy-config";
import {
  type AdapterResult,
  type ControlDecision,
  normalizeLevelOfControl,
  type ProxyController,
} from "./proxy-adapter";

export type FirefoxProxyValue =
  | {
      readonly proxyType: "manual";
      readonly http: string;
      readonly httpProxyAll: true;
      readonly passthrough: string;
    }
  | {
      readonly proxyType: "manual";
      readonly socks: string;
      readonly socksVersion: 5;
      readonly proxyDNS: true;
      readonly passthrough: string;
    };

interface FirefoxSettingsPort {
  get(details: Record<string, never>): Promise<{ readonly levelOfControl: string }>;
  set(details: { readonly value: FirefoxProxyValue }): Promise<boolean>;
  clear(details: Record<string, never>): Promise<boolean>;
}

interface FirefoxIncognitoPort {
  isAllowedIncognitoAccess(): Promise<boolean>;
}

type PrivateAccessDecision =
  | { readonly kind: "allowed" }
  | { readonly kind: "denied" }
  | { readonly kind: "error" };

function assertNever(value: never): never {
  throw new RangeError(`Unsupported proxy type: ${String(value)}`);
}

function buildProxyValue(config: ProxyConfig): FirefoxProxyValue {
  const endpoint = `${config.host}:${config.port}`;
  const passthrough = config.bypass
    .map((entry) =>
      entry.includes(":") && !(entry.startsWith("[") && entry.endsWith("]")) ? `[${entry}]` : entry,
    )
    .join(", ");

  switch (config.type) {
    case "http":
      return {
        proxyType: "manual",
        http: endpoint,
        httpProxyAll: true,
        passthrough,
      };
    case "socks5":
      return {
        proxyType: "manual",
        socks: endpoint,
        socksVersion: 5,
        proxyDNS: true,
        passthrough,
      };
    default:
      return assertNever(config.type);
  }
}

function applyControlDecision(
  decision: ControlDecision,
  settingsPort: FirefoxSettingsPort,
  config: ProxyConfig,
): Promise<AdapterResult> {
  switch (decision.kind) {
    case "conflict":
      return Promise.resolve(decision);
    case "unknown":
      return Promise.resolve({ kind: "error", code: "proxy_api" });
    case "controllable":
      return settingsPort
        .set({ value: buildProxyValue(config) })
        .then<AdapterResult, AdapterResult>(
          (applied) => (applied ? { kind: "applied" } : { kind: "error", code: "proxy_api" }),
          () => ({ kind: "error", code: "proxy_api" }),
        );
    default:
      return assertNever(decision);
  }
}

export function createFirefoxProxyController(
  settingsPort: FirefoxSettingsPort,
  incognitoPort: FirefoxIncognitoPort,
): ProxyController {
  return {
    async apply(config) {
      const privateAccess = await incognitoPort
        .isAllowedIncognitoAccess()
        .then<PrivateAccessDecision, PrivateAccessDecision>(
          (allowed) => (allowed ? { kind: "allowed" } : { kind: "denied" }),
          () => ({ kind: "error" }),
        );

      switch (privateAccess.kind) {
        case "denied":
          return { kind: "error", code: "firefox_private_access_required" };
        case "error":
          return { kind: "error", code: "proxy_api" };
        case "allowed": {
          const decision = await settingsPort.get({}).then<ControlDecision, ControlDecision>(
            ({ levelOfControl }) => normalizeLevelOfControl(levelOfControl),
            () => ({ kind: "unknown" }),
          );
          return applyControlDecision(decision, settingsPort, config);
        }
        default:
          return assertNever(privateAccess);
      }
    },
    clear() {
      return settingsPort.clear({}).then<AdapterResult, AdapterResult>(
        (cleared) => (cleared ? { kind: "cleared" } : { kind: "error", code: "proxy_api" }),
        () => ({ kind: "error", code: "proxy_api" }),
      );
    },
  };
}
