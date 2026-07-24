import { storage } from "wxt/utils/storage";

import {
  DEFAULT_STORED_STATE,
  isValidProxyConfig,
  type StableProxyStatus,
  type StoredProxyState,
} from "../domain/proxy-config";

type StorageOperation = "get" | "set" | "reset";

const proxyState = storage.defineItem<unknown>("local:proxyState", {
  fallback: DEFAULT_STORED_STATE,
});

function parseStableStatus(raw: unknown): StableProxyStatus | null {
  if (typeof raw !== "object" || raw === null || !("kind" in raw)) {
    return null;
  }
  switch (raw.kind) {
    case "off":
      return { kind: "off" };
    case "on":
      return { kind: "on" };
    case "conflict":
      if (
        "reason" in raw &&
        (raw.reason === "controlled_by_other" || raw.reason === "not_controllable")
      ) {
        return { kind: "conflict", reason: raw.reason };
      }
      return null;
    case "error":
      if (!("operation" in raw && "code" in raw)) {
        return null;
      }
      if (
        raw.operation !== "enable" &&
        raw.operation !== "disable" &&
        raw.operation !== "reapply" &&
        raw.operation !== "save" &&
        raw.operation !== "initialize"
      ) {
        return null;
      }
      if (
        raw.code !== "proxy_api" &&
        raw.code !== "storage" &&
        raw.code !== "invalid_message" &&
        raw.code !== "firefox_private_access_required"
      ) {
        return null;
      }
      return { kind: "error", operation: raw.operation, code: raw.code };
    default:
      return null;
  }
}

export function parseStoredState(raw: unknown): StoredProxyState {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("version" in raw && "config" in raw && "status" in raw) ||
    raw.version !== 1 ||
    !isValidProxyConfig(raw.config)
  ) {
    return DEFAULT_STORED_STATE;
  }
  const status = parseStableStatus(raw.status);
  return status === null ? DEFAULT_STORED_STATE : { version: 1, config: raw.config, status };
}

export class StorageError extends Error {
  override readonly name = "StorageError";

  constructor(
    readonly operation: StorageOperation,
    options: ErrorOptions,
  ) {
    super(`Storage ${operation} failed`, options);
  }
}

export async function getState(): Promise<StoredProxyState> {
  try {
    return parseStoredState(await proxyState.getValue());
  } catch (error) {
    throw new StorageError("get", { cause: error });
  }
}

export async function setState(state: StoredProxyState): Promise<void> {
  try {
    await proxyState.setValue(state);
  } catch (error) {
    throw new StorageError("set", { cause: error });
  }
}

export async function resetForInstall(): Promise<void> {
  try {
    await proxyState.setValue(DEFAULT_STORED_STATE);
  } catch (error) {
    throw new StorageError("reset", { cause: error });
  }
}
