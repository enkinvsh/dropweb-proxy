import type { ProxyConfig } from "../domain/proxy-config";

export type HealthState = "unknown" | "reachable" | "unreachable";

export type ProbeFetch = (
  input: string,
  init: {
    readonly mode: "no-cors";
    readonly cache: "no-store";
    readonly signal: AbortSignal;
  },
) => Promise<unknown>;

export const PROBE_TIMEOUT_MS = 1500;

/**
 * Advisory reachability probe. Any HTTP answer (mihomo mixed port replies 4xx
 * to a plain GET) means something is listening; rejection means nothing is.
 * NEVER used to gate state transitions — display only (fail-closed invariant).
 */
export async function probeProxy(
  config: ProxyConfig,
  fetchFn: ProbeFetch = fetch,
): Promise<boolean> {
  try {
    await fetchFn(`http://${config.host}:${config.port}/`, {
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}
