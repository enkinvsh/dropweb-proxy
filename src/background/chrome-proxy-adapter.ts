import type { ProxyConfig } from "../domain/proxy-config";
import {
  type AdapterResult,
  type ControlDecision,
  normalizeLevelOfControl,
  type ProxyController,
} from "./proxy-adapter";

interface ChromeProxyPort {
  get(details: { readonly incognito?: boolean }): Promise<{ readonly levelOfControl: string }>;
  set(details: { readonly value: unknown; readonly scope: "regular" }): Promise<void>;
  clear(details: { readonly scope: "regular" }): Promise<void>;
}

type ChromeProxyValue = {
  readonly mode: "fixed_servers";
  readonly rules: {
    readonly singleProxy: {
      readonly scheme: "http" | "socks5";
      readonly host: string;
      readonly port: number;
    };
    readonly bypassList: readonly string[];
  };
};

function assertNever(value: never): never {
  throw new RangeError(`Unsupported proxy type: ${String(value)}`);
}

function buildProxyValue(config: ProxyConfig): ChromeProxyValue {
  let scheme: "http" | "socks5";
  switch (config.type) {
    case "http":
      scheme = "http";
      break;
    case "socks5":
      scheme = "socks5";
      break;
    default:
      return assertNever(config.type);
  }

  return {
    mode: "fixed_servers",
    rules: {
      singleProxy: { scheme, host: config.host, port: config.port },
      bypassList: config.bypass.map((entry) =>
        entry.includes(":") && !(entry.startsWith("[") && entry.endsWith("]"))
          ? `[${entry}]`
          : entry,
      ),
    },
  };
}

function applyControlDecision(
  decision: ControlDecision,
  port: ChromeProxyPort,
  config: ProxyConfig,
): Promise<AdapterResult> {
  switch (decision.kind) {
    case "conflict":
      return Promise.resolve(decision);
    case "unknown":
      return Promise.resolve({ kind: "error", code: "proxy_api" });
    case "controllable":
      return port
        .set({ value: buildProxyValue(config), scope: "regular" })
        .then<AdapterResult, AdapterResult>(
          () => ({ kind: "applied" }),
          () => ({ kind: "error", code: "proxy_api" }),
        );
    default:
      return assertNever(decision);
  }
}

export function createChromeProxyController(port: ChromeProxyPort): ProxyController {
  return {
    async apply(config) {
      const decision = await port.get({ incognito: false }).then<ControlDecision, ControlDecision>(
        ({ levelOfControl }) => normalizeLevelOfControl(levelOfControl),
        () => ({ kind: "unknown" }),
      );
      return applyControlDecision(decision, port, config);
    },
    clear() {
      return port.clear({ scope: "regular" }).then<AdapterResult, AdapterResult>(
        () => ({ kind: "cleared" }),
        () => ({ kind: "error", code: "proxy_api" }),
      );
    },
  };
}
