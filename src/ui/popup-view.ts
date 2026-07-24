import type { HealthState } from "../background/health-monitor";
import type { AppSnapshot } from "../background/proxy-controller";
import type { WebRtcState } from "../background/webrtc-sync";
import type { ProxyStatus } from "../domain/proxy-config";
import type { MessageKey, Translator } from "./i18n";
import { type LensController, type LensState, mountLens } from "./lens/lens";

export interface PopupHandlers {
  onEnable(): void;
  onDisable(): void;
  onOpenSettings(): void;
}

type VisualState = "off" | "applying" | "on" | "problem";

type PopupState = {
  readonly visual: VisualState;
  readonly statusKey: MessageKey;
  readonly detailKey: MessageKey | null;
  readonly toggleDisabled: boolean;
  readonly pressed: boolean;
};

const lensControllers = new WeakMap<HTMLElement, LensController>();

function assertNever(value: never): never {
  throw new RangeError(`Unsupported popup status: ${String(value)}`);
}

function lensStateOf(visual: VisualState): LensState {
  switch (visual) {
    case "on":
      return { running: true, palette: "green", pulsing: false };
    case "off":
      return { running: false, palette: "green", pulsing: false };
    case "applying":
      return { running: false, palette: "green", pulsing: true };
    case "problem":
      return { running: true, palette: "amber", pulsing: false };
    default:
      return assertNever(visual);
  }
}

function statusKeyOf(status: ProxyStatus): MessageKey {
  switch (status.kind) {
    case "off":
      return "status_off";
    case "applying":
      return "status_applying";
    case "on":
      return "status_on";
    case "conflict":
      return status.reason === "controlled_by_other"
        ? "status_conflict_controlled_by_other"
        : "status_conflict_not_controllable";
    case "error":
      switch (status.code) {
        case "proxy_api":
          return "status_error_proxy_api";
        case "storage":
          return "status_error_storage";
        case "invalid_message":
          return "status_error_invalid_message";
        case "firefox_private_access_required":
          return "status_error_firefox_private_access_required";
        default:
          return assertNever(status.code);
      }
    default:
      return assertNever(status);
  }
}

function popupState(status: ProxyStatus, health: HealthState, webrtc: WebRtcState): PopupState {
  const statusKey = statusKeyOf(status);
  if (status.kind === "applying") {
    return { visual: "applying", statusKey, detailKey: null, toggleDisabled: true, pressed: false };
  }
  if (status.kind === "off") {
    return {
      visual: "off",
      statusKey,
      detailKey: health === "unreachable" ? "status_unreachable_hint_off" : null,
      toggleDisabled: false,
      pressed: false,
    };
  }
  if (status.kind === "on") {
    if (health === "unreachable") {
      return {
        visual: "problem",
        statusKey,
        detailKey: "status_unreachable_hint",
        toggleDisabled: false,
        pressed: true,
      };
    }
    switch (webrtc) {
      case "conflict":
        return {
          visual: "problem",
          statusKey,
          detailKey: "webrtc_status_conflict",
          toggleDisabled: false,
          pressed: true,
        };
      case "unprotected":
        return {
          visual: "problem",
          statusKey,
          detailKey: "webrtc_status_unprotected",
          toggleDisabled: false,
          pressed: true,
        };
      case "protected":
        return {
          visual: "on",
          statusKey,
          detailKey: "webrtc_status_protected",
          toggleDisabled: false,
          pressed: true,
        };
      case "inactive":
        return { visual: "on", statusKey, detailKey: null, toggleDisabled: false, pressed: true };
      default:
        return assertNever(webrtc);
    }
  }
  return { visual: "problem", statusKey, detailKey: null, toggleDisabled: false, pressed: false };
}

export function renderPopup(
  root: HTMLElement,
  snapshot: AppSnapshot,
  t: Translator,
  handlers: PopupHandlers,
): void {
  const state = popupState(snapshot.status, snapshot.health, snapshot.webrtc);
  root.className = `popup state-${state.visual}`;

  const previous = lensControllers.get(root);
  if (previous !== undefined) {
    previous.destroy();
    lensControllers.delete(root);
  }

  const orb = document.createElement("div");
  orb.className = "orb";
  orb.setAttribute("aria-hidden", "true");

  const power = document.createElement("button");
  power.type = "button";
  power.className = "power";
  power.disabled = state.toggleDisabled;
  power.setAttribute("aria-pressed", String(state.pressed));
  power.setAttribute("aria-label", t.getMessage(state.statusKey));
  power.title = t.getMessage(state.pressed ? "action_disable_title" : "action_enable_title");

  const canvas = document.createElement("canvas");
  canvas.className = "power-canvas";
  canvas.setAttribute("aria-hidden", "true");
  power.append(canvas);

  const controller = mountLens(canvas, lensStateOf(state.visual));
  lensControllers.set(root, controller);
  const releasePress = (): void => {
    controller.setPressed(false);
  };
  power.addEventListener("pointerdown", () => {
    controller.setPressed(true);
  });
  power.addEventListener("pointerup", releasePress);
  power.addEventListener("pointercancel", releasePress);
  power.addEventListener("pointerleave", releasePress);
  power.addEventListener("click", state.pressed ? handlers.onDisable : handlers.onEnable);

  const status = document.createElement("span");
  status.className = "sr-only";
  status.setAttribute("role", state.visual === "problem" ? "alert" : "status");
  const statusText = t.getMessage(state.statusKey);
  status.textContent =
    state.detailKey === null ? statusText : `${statusText} — ${t.getMessage(state.detailKey)}`;

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "settings-link";
  settings.textContent = t.getMessage("popup_settings_label");
  settings.title = t.getMessage("action_open_settings_title");
  settings.addEventListener("click", handlers.onOpenSettings);

  root.replaceChildren(orb, power, status, settings);
}
