import type { StableProxyStatus } from "../domain/proxy-config";
import type { WebRtcGuard } from "./webrtc-guard";

export type WebRtcState = "protected" | "conflict" | "unprotected" | "inactive";

function assertNever(value: never): never {
  throw new RangeError(`Unsupported WebRTC synchronization variant: ${String(value)}`);
}

export async function syncWebRtc(
  guard: WebRtcGuard,
  status: StableProxyStatus,
): Promise<WebRtcState> {
  switch (status.kind) {
    case "off":
    case "conflict":
    case "error":
      await guard.release();
      return "inactive";
    case "on":
      break;
    default:
      return assertNever(status);
  }

  const result = await guard.protect();
  switch (result.kind) {
    case "protected":
      return "protected";
    case "conflict":
      return "conflict";
    case "error":
      return "unprotected";
    case "released":
      return "inactive";
    default:
      return assertNever(result);
  }
}
