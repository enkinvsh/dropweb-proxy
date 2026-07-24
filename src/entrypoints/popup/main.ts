import { browser } from "@wxt-dev/browser";

import type { AppSnapshot, CommandResult, ProxyRequest } from "../../background/proxy-controller";
import { DEFAULT_PROXY_CONFIG } from "../../domain/proxy-config";
import { createBrowserTranslator, type Translator } from "../../ui/i18n";
import { type PopupHandlers, renderPopup } from "../../ui/popup-view";

const INACTIVE_HANDLERS: PopupHandlers = {
  onEnable() {},
  onDisable() {},
  onOpenSettings() {},
};

let interactionEpoch = 0;

async function send(request: ProxyRequest): Promise<CommandResult> {
  return browser.runtime.sendMessage<ProxyRequest, CommandResult>(request);
}

function previewSnapshot(): AppSnapshot | null {
  const preview = new URLSearchParams(location.hash.slice(1)).get("preview");
  switch (preview) {
    case "off":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "off" },
        webrtc: "inactive",
        health: "unknown",
      };
    case "applying":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "applying", operation: "enable" },
        webrtc: "inactive",
        health: "unknown",
      };
    case "on":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "on" },
        webrtc: "protected",
        health: "unknown",
      };
    case "on-conflict":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "on" },
        webrtc: "conflict",
        health: "unknown",
      };
    case "on-unprotected":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "on" },
        webrtc: "unprotected",
        health: "unknown",
      };
    case "conflict":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "conflict", reason: "controlled_by_other" },
        webrtc: "inactive",
        health: "unknown",
      };
    case "error":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "error", operation: "enable", code: "proxy_api" },
        webrtc: "inactive",
        health: "unknown",
      };
    case "unreachable":
      return {
        config: DEFAULT_PROXY_CONFIG,
        status: { kind: "on" },
        webrtc: "inactive",
        health: "unreachable",
      };
    default:
      return null;
  }
}

function runtimeHandlers(root: HTMLElement, t: Translator, snapshot: AppSnapshot): PopupHandlers {
  const update = async (request: ProxyRequest): Promise<void> => {
    const result = await send(request);
    switch (result.kind) {
      case "snapshot":
        renderPopup(root, result.snapshot, t, runtimeHandlers(root, t, result.snapshot));
        return;
      case "invalid":
        throw new RangeError("Popup command returned field validation errors");
      default:
        throw new RangeError(`Unsupported popup response: ${String(result)}`);
    }
  };

  return {
    onEnable() {
      interactionEpoch += 1;
      const epoch = interactionEpoch;
      renderPopup(
        root,
        {
          config: snapshot.config,
          status: { kind: "applying", operation: "enable" },
          webrtc: "inactive",
          health: snapshot.health,
        },
        t,
        INACTIVE_HANDLERS,
      );
      update({ type: "proxy/enable" }).catch(() => {
        if (interactionEpoch === epoch) {
          renderPopup(root, snapshot, t, runtimeHandlers(root, t, snapshot));
        }
      });
    },
    onDisable() {
      interactionEpoch += 1;
      const epoch = interactionEpoch;
      renderPopup(
        root,
        {
          config: snapshot.config,
          status: { kind: "applying", operation: "disable" },
          webrtc: "inactive",
          health: snapshot.health,
        },
        t,
        INACTIVE_HANDLERS,
      );
      update({ type: "proxy/disable" }).catch(() => {
        if (interactionEpoch === epoch) {
          renderPopup(root, snapshot, t, runtimeHandlers(root, t, snapshot));
        }
      });
    },
    onOpenSettings() {
      void browser.runtime.openOptionsPage();
    },
  };
}

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new RangeError("Popup root is missing");
}
const t = createBrowserTranslator();
document.title = t.getMessage("app_name");
const preview = previewSnapshot();
if (preview === null) {
  const result = await send({ type: "state/get" });
  switch (result.kind) {
    case "snapshot": {
      renderPopup(root, result.snapshot, t, runtimeHandlers(root, t, result.snapshot));
      const epochAtSend = interactionEpoch;
      void send({ type: "health/check" }).then((refreshed) => {
        if (refreshed.kind === "snapshot" && interactionEpoch === epochAtSend) {
          renderPopup(root, refreshed.snapshot, t, runtimeHandlers(root, t, refreshed.snapshot));
        }
      });
      break;
    }
    case "invalid":
      throw new RangeError("State request returned field validation errors");
    default:
      throw new RangeError(`Unsupported popup response: ${String(result)}`);
  }
} else {
  renderPopup(root, preview, t, INACTIVE_HANDLERS);
}
