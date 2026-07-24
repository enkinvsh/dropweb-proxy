import { vi } from "vitest";

import type { AdapterResult } from "../../src/background/proxy-adapter";
import { createProxyController } from "../../src/background/proxy-controller";
import type { WebRtcResult } from "../../src/background/webrtc-guard";
import type {
  ProxyConfig,
  ProxyConfigInput,
  StoredProxyState,
} from "../../src/domain/proxy-config";
import type { MessageKey } from "../../src/ui/i18n";

export const CONFIG: ProxyConfig = {
  type: "http",
  host: "127.0.0.1",
  port: 7890,
  bypass: ["localhost"],
};
export const NEW_INPUT: ProxyConfigInput = {
  type: "socks5",
  host: "proxy.local",
  port: "1080",
  bypass: "localhost\n::1",
};
export const SAVE_REQUEST = { type: "config/save", input: NEW_INPUT } as const;
export const NEW_CONFIG: ProxyConfig = {
  type: "socks5",
  host: "proxy.local",
  port: 1080,
  bypass: ["localhost", "::1"],
};
export const OFF_STATE: StoredProxyState = {
  version: 1,
  config: CONFIG,
  status: { kind: "off" },
};

export function createHarness(
  initialState: StoredProxyState = OFF_STATE,
  probe: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<boolean> => true),
) {
  let state = initialState;
  const events: string[] = [];
  const getState = vi.fn(async (): Promise<StoredProxyState> => state);
  const setState = vi.fn(async (next: StoredProxyState): Promise<void> => {
    state = next;
  });
  const apply = vi.fn(async (): Promise<AdapterResult> => ({ kind: "applied" }));
  const clear = vi.fn(async (): Promise<AdapterResult> => ({ kind: "cleared" }));
  const webrtc = {
    protect: vi.fn(async (): Promise<WebRtcResult> => ({ kind: "protected" })),
    release: vi.fn(async (): Promise<WebRtcResult> => ({ kind: "released" })),
  };
  const surface = {
    setIcon: vi.fn(async ({ path }: { readonly path: Record<string, string> }) => {
      events.push(`icon:${path["48"] ?? ""}`);
    }),
    setTitle: vi.fn(async ({ title }: { readonly title: string }) => {
      events.push(`title:${title}`);
    }),
  };
  const scheduleHealthProbes = vi.fn(async (): Promise<void> => {});
  const controller = createProxyController({
    repository: { getState, setState },
    adapter: { apply, clear },
    webrtc,
    surface,
    translator: { title: vi.fn((key: MessageKey) => key) },
    probe: probe as (config: ProxyConfig) => Promise<boolean>,
    scheduleHealthProbes,
  });
  return {
    controller,
    getState,
    setState,
    apply,
    clear,
    webrtc,
    surface,
    events,
    probe,
    scheduleHealthProbes,
    state: () => state,
  };
}
