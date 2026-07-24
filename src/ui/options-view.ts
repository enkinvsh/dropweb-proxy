import type {
  FieldErrors,
  ProxyConfig,
  ProxyConfigInput,
  ProxyStatus,
} from "../domain/proxy-config";
import type { MessageKey, Translator } from "./i18n";

export interface OptionsHandlers {
  onSave(input: ProxyConfigInput): void;
  onCancel(): void;
}

export type OptionsViewModel = {
  readonly config: ProxyConfig;
  readonly errors?: FieldErrors;
  readonly savedVisible?: boolean;
  readonly applyStatus?: ProxyStatus;
};

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type FieldGroupOptions = {
  readonly labelText: string;
  readonly control: FormControl;
  readonly error: NonNullable<FieldErrors[keyof FieldErrors]> | undefined;
  readonly t: Translator;
};

function assertNever(value: never): never {
  throw new RangeError(`Unsupported options variant: ${String(value)}`);
}

function errorKey(error: NonNullable<FieldErrors[keyof FieldErrors]>): MessageKey {
  switch (error) {
    case "type_invalid":
      return "error_type_invalid";
    case "host_required":
      return "error_host_required";
    case "host_invalid":
      return "error_host_invalid";
    case "port_invalid":
      return "error_port_invalid";
    case "bypass_invalid":
      return "error_bypass_invalid";
    default:
      return assertNever(error);
  }
}

function statusKey(status: ProxyStatus): MessageKey {
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

function fieldGroup(options: FieldGroupOptions): HTMLDivElement {
  const group = document.createElement("div");
  group.className = "field-group";
  const label = document.createElement("label");
  label.htmlFor = options.control.id;
  label.textContent = options.labelText;
  group.append(label, options.control);
  if (options.error !== undefined) {
    const message = document.createElement("p");
    message.id = `${options.control.id}-error`;
    message.className = "field-error";
    message.textContent = options.t.getMessage(errorKey(options.error));
    options.control.classList.add("field-control-error");
    options.control.setAttribute("aria-invalid", "true");
    options.control.setAttribute("aria-describedby", message.id);
    group.append(message);
  }
  return group;
}

function textInput(id: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.id = id;
  input.name = id;
  input.value = value;
  return input;
}

export function renderOptions(
  root: HTMLElement,
  model: OptionsViewModel,
  t: Translator,
  handlers: OptionsHandlers,
): void {
  const applying = model.applyStatus?.kind === "applying";
  const heading = document.createElement("h1");
  heading.textContent = t.getMessage("options_title");

  const form = document.createElement("form");
  const type = document.createElement("select");
  type.id = "type";
  type.name = "type";
  for (const [value, key] of [
    ["http", "proxy_type_http"],
    ["socks5", "proxy_type_socks5"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t.getMessage(key);
    type.append(option);
  }
  type.value = model.config.type;

  const host = textInput("host", model.config.host);
  host.type = "text";
  host.autocomplete = "off";
  const port = textInput("port", String(model.config.port));
  port.type = "text";
  port.inputMode = "numeric";
  const bypass = document.createElement("textarea");
  bypass.id = "bypass";
  bypass.name = "bypass";
  bypass.rows = 3;
  bypass.value = model.config.bypass.join("\n");

  const typeGroup = fieldGroup({
    labelText: t.getMessage("field_type_label"),
    control: type,
    error: model.errors?.type,
    t,
  });
  const hostGroup = fieldGroup({
    labelText: t.getMessage("field_host_label"),
    control: host,
    error: model.errors?.host,
    t,
  });
  const portGroup = fieldGroup({
    labelText: t.getMessage("field_port_label"),
    control: port,
    error: model.errors?.port,
    t,
  });
  const bypassGroup = fieldGroup({
    labelText: t.getMessage("field_bypass_label"),
    control: bypass,
    error: model.errors?.bypass,
    t,
  });
  const bypassHint = document.createElement("p");
  bypassHint.className = "field-hint";
  bypassHint.textContent = t.getMessage("field_bypass_hint");
  bypassGroup.insertBefore(bypassHint, bypass.nextSibling);

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "button button-primary";
  save.textContent = t.getMessage(applying ? "action_saving" : "action_save");
  save.title = t.getMessage("action_save_title");
  save.disabled = applying;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-secondary";
  cancel.textContent = t.getMessage("action_cancel");
  cancel.title = t.getMessage("action_cancel_title");
  cancel.disabled = applying;
  cancel.addEventListener("click", handlers.onCancel);
  actions.append(save, cancel);

  const message = document.createElement("div");
  message.className = "form-message";
  message.setAttribute("aria-live", "polite");
  message.setAttribute("aria-label", t.getMessage("aria_system_message"));
  if (model.savedVisible === true) {
    const saved = document.createElement("p");
    saved.className = "save-success";
    saved.textContent = t.getMessage("save_success");
    message.append(saved);
  }
  if (model.applyStatus !== undefined) {
    const status = document.createElement("p");
    status.textContent = t.getMessage(statusKey(model.applyStatus));
    if (model.applyStatus.kind === "error") {
      status.setAttribute("role", "alert");
    }
    message.append(status);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onSave({
      type: type.value,
      host: host.value,
      port: port.value,
      bypass: bypass.value,
    });
  });
  form.append(typeGroup, hostGroup, portGroup, bypassGroup, actions, message);
  root.replaceChildren(heading, form);
}

export function showSaveSuccess(root: HTMLElement, t: Translator): void {
  const message = root.querySelector<HTMLElement>(".form-message");
  if (message === null) {
    return;
  }
  const saved = document.createElement("p");
  saved.className = "save-success";
  saved.textContent = t.getMessage("save_success");
  message.replaceChildren(saved);
}
