import { browser } from "@wxt-dev/browser";

export const MESSAGE_KEYS = [
  "app_name",
  "popup_settings_label",
  "options_title",
  "field_type_label",
  "field_host_label",
  "field_port_label",
  "field_bypass_label",
  "field_bypass_hint",
  "proxy_type_http",
  "proxy_type_socks5",
  "action_enable",
  "action_disable",
  "action_open_settings",
  "action_save",
  "action_cancel",
  "action_applying",
  "action_saving",
  "action_enable_title",
  "action_disable_title",
  "action_open_settings_title",
  "action_save_title",
  "action_cancel_title",
  "save_success",
  "status_off",
  "status_applying",
  "status_on",
  "webrtc_status_protected",
  "webrtc_status_conflict",
  "webrtc_status_unprotected",
  "status_conflict_controlled_by_other",
  "status_conflict_not_controllable",
  "status_error_proxy_api",
  "status_error_storage",
  "status_error_invalid_message",
  "status_error_firefox_private_access_required",
  "aria_status",
  "aria_status_indicator",
  "aria_system_message",
  "error_type_invalid",
  "error_host_required",
  "error_host_invalid",
  "error_port_invalid",
  "error_bypass_invalid",
  "browser_action_title_off",
  "browser_action_title_applying",
  "browser_action_title_on",
  "browser_action_title_webrtc_leak",
  "browser_action_title_conflict",
  "browser_action_title_error",
  "browser_action_title_unreachable",
  "status_unreachable_hint",
  "status_unreachable_hint_off",
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

export interface Translator {
  getMessage(
    messageName: MessageKey,
    substitutions?: string | readonly (string | number)[],
  ): string;
}

export function createBrowserTranslator(): Translator {
  document.documentElement.lang = browser.i18n.getUILanguage();

  return {
    getMessage(messageName, substitutions) {
      return browser.i18n.getMessage(
        messageName,
        typeof substitutions === "string" || substitutions === undefined
          ? substitutions
          : [...substitutions],
      );
    },
  };
}
