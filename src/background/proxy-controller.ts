import {
  type FieldErrors,
  type ProxyConfig,
  type ProxyConfigInput,
  type ProxyOperation,
  type ProxyStatus,
  parseProxyConfig,
  type StableProxyStatus,
  type StoredProxyState,
} from "../domain/proxy-config";
import { StorageError } from "../storage/settings-repository";
import type { MessageKey } from "../ui/i18n";
import type { HealthState } from "./health-monitor";
import { computeIndicator, iconPaths } from "./indicator";
import type { AdapterResult, ProxyController } from "./proxy-adapter";
import { type ProxyRequest, parseProxyRequest } from "./proxy-request";
import type { WebRtcGuard } from "./webrtc-guard";
import { syncWebRtc, type WebRtcState } from "./webrtc-sync";

export { type ProxyRequest, parseProxyRequest } from "./proxy-request";

export type AppSnapshot = {
  readonly config: ProxyConfig;
  readonly status: ProxyStatus;
  readonly webrtc: WebRtcState;
  readonly health: HealthState;
};

export type CommandResult =
  | { readonly kind: "snapshot"; readonly snapshot: AppSnapshot }
  | { readonly kind: "invalid"; readonly errors: FieldErrors };

interface RepositoryPort {
  getState(): Promise<StoredProxyState>;
  setState(state: StoredProxyState): Promise<void>;
}

interface ActionSurface {
  setIcon(details: { readonly path: Record<string, string> }): Promise<void>;
  setTitle(details: { readonly title: string }): Promise<void>;
}

interface TitleTranslator {
  title(key: MessageKey): string;
}

type ControllerDependencies = {
  readonly repository: RepositoryPort;
  readonly adapter: ProxyController;
  readonly webrtc: WebRtcGuard;
  readonly surface: ActionSurface;
  readonly translator: TitleTranslator;
  readonly probe: (config: ProxyConfig) => Promise<boolean>;
  readonly scheduleHealthProbes: (active: boolean) => Promise<void>;
};

type ApplyingStatus = Extract<ProxyStatus, { readonly kind: "applying" }>;

function assertNever(value: never): never {
  throw new RangeError(`Unsupported controller variant: ${String(value)}`);
}

function mapAdapterResult(result: AdapterResult, operation: ProxyOperation): StableProxyStatus {
  switch (result.kind) {
    case "applied":
      return { kind: "on" };
    case "cleared":
      return { kind: "off" };
    case "conflict":
      return { kind: "conflict", reason: result.reason };
    case "error":
      return { kind: "error", operation, code: result.code };
    default:
      return assertNever(result);
  }
}

export function createProxyController(deps: ControllerDependencies): {
  handle(request: ProxyRequest): Promise<CommandResult>;
  handleMessage(raw: unknown): Promise<CommandResult>;
  refreshIndicator(): Promise<void>;
  noteProxyError(): Promise<void>;
} {
  let busy = false;
  let opGeneration = 0;
  let applying: ApplyingStatus | null = null;
  let webrtcState: WebRtcState = "inactive";
  let health: HealthState = "unknown";

  let settle: Promise<unknown> = Promise.resolve();
  const runSerial = <T>(work: () => Promise<T>): Promise<T> => {
    const result = settle.then(work, work);
    settle = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const refreshHealth = async (config: ProxyConfig): Promise<void> => {
    health = (await deps.probe(config)) ? "reachable" : "unreachable";
  };

  const updateIndicator = async (status: ProxyStatus): Promise<void> => {
    const indicator = computeIndicator(status, health, webrtcState);
    await deps.surface.setIcon({ path: iconPaths(indicator.iconVariant) });
    await deps.surface.setTitle({ title: deps.translator.title(indicator.titleKey) });
  };

  const snapshot = async (): Promise<CommandResult> => {
    const stored = await deps.repository.getState();
    return {
      kind: "snapshot",
      snapshot: {
        config: stored.config,
        status: applying ?? stored.status,
        webrtc: webrtcState,
        health,
      },
    };
  };

  const persistStable = (
    config: ProxyConfig,
    status: StableProxyStatus,
    operation: ProxyOperation,
  ): Promise<CommandResult> =>
    runSerial(async () => {
      let finalStatus = status;
      try {
        await deps.repository.setState({ version: 1, config, status });
      } catch (error) {
        if (!(error instanceof StorageError)) {
          throw error;
        }
        finalStatus = { kind: "error", operation, code: "storage" };
      }
      applying = null;
      opGeneration += 1;
      await deps.scheduleHealthProbes(finalStatus.kind === "on").catch(() => {});
      webrtcState = await syncWebRtc(deps.webrtc, finalStatus);
      await updateIndicator(finalStatus);
      return {
        kind: "snapshot",
        snapshot: { config, status: finalStatus, webrtc: webrtcState, health },
      };
    });

  const saveConfig = async (input: ProxyConfigInput): Promise<CommandResult> => {
    const parsed = parseProxyConfig(input);
    if (!parsed.ok) {
      return { kind: "invalid", errors: parsed.errors };
    }

    const stored = await deps.repository.getState();
    try {
      await deps.repository.setState({ version: 1, config: parsed.value, status: stored.status });
    } catch (error) {
      if (!(error instanceof StorageError)) {
        throw error;
      }
      let operation: ProxyOperation | "save";
      switch (stored.status.kind) {
        case "on":
          operation = "reapply";
          break;
        case "off":
        case "conflict":
        case "error":
          operation = "save";
          break;
        default:
          return assertNever(stored.status);
      }
      const status: StableProxyStatus = { kind: "error", operation, code: "storage" };
      return runSerial(async () => {
        opGeneration += 1;
        webrtcState = await syncWebRtc(deps.webrtc, stored.status);
        await updateIndicator(status);
        return {
          kind: "snapshot",
          snapshot: { config: stored.config, status, webrtc: webrtcState, health },
        };
      });
    }

    opGeneration += 1;

    switch (stored.status.kind) {
      case "on": {
        const applyingStatus: ApplyingStatus = { kind: "applying", operation: "reapply" };
        applying = applyingStatus;
        await runSerial(() => updateIndicator(applyingStatus));
        const result = await deps.adapter.apply(parsed.value);
        const mapped = mapAdapterResult(result, "reapply");
        if (mapped.kind === "on") {
          await refreshHealth(parsed.value);
        } else {
          health = "unknown";
        }
        return persistStable(parsed.value, mapped, "reapply");
      }
      case "off":
      case "conflict":
      case "error":
        return runSerial(async () => {
          health = "unknown";
          await updateIndicator(stored.status);
          return {
            kind: "snapshot",
            snapshot: { config: parsed.value, status: stored.status, webrtc: webrtcState, health },
          };
        });
      default:
        return assertNever(stored.status);
    }
  };

  const handle = async (request: ProxyRequest): Promise<CommandResult> => {
    switch (request.type) {
      case "state/get":
        return snapshot();
      case "health/check": {
        if (busy) {
          return snapshot();
        }
        const generation = opGeneration;
        const stored = await deps.repository.getState();
        const reachable = await deps.probe(stored.config);
        await runSerial(async () => {
          if (opGeneration !== generation || busy) {
            return;
          }
          health = reachable ? "reachable" : "unreachable";
          await updateIndicator(applying ?? stored.status);
        });
        return snapshot();
      }
      case "config/save":
      case "proxy/enable":
      case "proxy/disable":
        break;
      default:
        return assertNever(request);
    }
    if (busy) {
      return snapshot();
    }
    busy = true;
    try {
      switch (request.type) {
        case "config/save":
          return await saveConfig(request.input);
        case "proxy/enable": {
          const applyingStatus: ApplyingStatus = { kind: "applying", operation: "enable" };
          applying = applyingStatus;
          await runSerial(() => updateIndicator(applyingStatus));
          const stored = await deps.repository.getState();
          const result = await deps.adapter.apply(stored.config);
          const mapped = mapAdapterResult(result, "enable");
          if (mapped.kind === "on") {
            await refreshHealth(stored.config);
          } else {
            health = "unknown";
          }
          return await persistStable(stored.config, mapped, "enable");
        }
        case "proxy/disable": {
          const applyingStatus: ApplyingStatus = { kind: "applying", operation: "disable" };
          applying = applyingStatus;
          await runSerial(() => updateIndicator(applyingStatus));
          const stored = await deps.repository.getState();
          const result = await deps.adapter.clear();
          health = "unknown";
          return await persistStable(stored.config, mapAdapterResult(result, "disable"), "disable");
        }
        default:
          return assertNever(request);
      }
    } finally {
      busy = false;
    }
  };

  return {
    handle,
    async handleMessage(raw) {
      const request = parseProxyRequest(raw);
      const response = request === null ? snapshot() : handle(request);
      return await response.then<CommandResult, CommandResult>(undefined, () =>
        runSerial(async () => {
          applying = null;
          opGeneration += 1;
          const stored = await deps.repository.getState();
          webrtcState = await syncWebRtc(deps.webrtc, stored.status);
          await updateIndicator(stored.status);
          return {
            kind: "snapshot",
            snapshot: { config: stored.config, status: stored.status, webrtc: webrtcState, health },
          };
        }),
      );
    },
    async refreshIndicator() {
      if (busy) {
        return;
      }
      const generation = opGeneration;
      const stored = await deps.repository.getState();
      const reachable = stored.status.kind === "on" ? await deps.probe(stored.config) : null;
      await runSerial(async () => {
        if (opGeneration !== generation || busy) {
          return; // a user mutation started/committed; it owns the indicator
        }
        if (reachable !== null) {
          health = reachable ? "reachable" : "unreachable";
        }
        await deps.scheduleHealthProbes(stored.status.kind === "on").catch(() => {});
        webrtcState = await syncWebRtc(deps.webrtc, stored.status);
        await updateIndicator(stored.status);
      });
    },
    async noteProxyError() {
      if (health === "unreachable" || busy) {
        return; // debounce: onProxyError fires per failed request; avoid a storage read + badge write each time
      }
      const generation = opGeneration;
      const stored = await deps.repository.getState();
      await runSerial(async () => {
        if (health === "unreachable" || opGeneration !== generation || busy) {
          return; // a state mutation committed/owns the indicator, or another error already repainted
        }
        if (stored.status.kind !== "on") {
          return;
        }
        health = "unreachable";
        await updateIndicator(stored.status);
      });
    },
  };
}
