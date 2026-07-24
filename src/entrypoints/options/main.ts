import { browser } from "@wxt-dev/browser";

import type { AppSnapshot, CommandResult, ProxyRequest } from "../../background/proxy-controller";
import {
  DEFAULT_PROXY_CONFIG,
  type FieldErrors,
  type ProxyConfigInput,
} from "../../domain/proxy-config";
import { createBrowserTranslator, type Translator } from "../../ui/i18n";
import {
  type OptionsHandlers,
  type OptionsViewModel,
  renderOptions,
  showSaveSuccess,
} from "../../ui/options-view";

type OptionsContext = {
  readonly root: HTMLElement;
  readonly t: Translator;
};

const INACTIVE_HANDLERS: OptionsHandlers = { onSave() {}, onCancel() {} };

async function send(request: ProxyRequest): Promise<CommandResult> {
  return browser.runtime.sendMessage<ProxyRequest, CommandResult>(request);
}

function renderSnapshot(
  context: OptionsContext,
  snapshot: AppSnapshot,
  savedVisible: boolean,
): void {
  const handlers: OptionsHandlers = {
    onSave(input) {
      void save(context, snapshot, input);
    },
    onCancel() {
      renderSnapshot(context, snapshot, false);
    },
  };
  renderOptions(
    context.root,
    {
      config: snapshot.config,
      ...(savedVisible ? { savedVisible: true } : {}),
    },
    context.t,
    handlers,
  );
}

function renderInvalid(context: OptionsContext, snapshot: AppSnapshot, errors: FieldErrors): void {
  renderOptions(context.root, { config: snapshot.config, errors }, context.t, {
    onSave(input) {
      void save(context, snapshot, input);
    },
    onCancel() {
      renderSnapshot(context, snapshot, false);
    },
  });
}

async function save(
  context: OptionsContext,
  snapshot: AppSnapshot,
  input: ProxyConfigInput,
): Promise<void> {
  const saveButton = context.root.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (saveButton !== null) {
    saveButton.disabled = true;
  }
  const result = await send({ type: "config/save", input });
  switch (result.kind) {
    case "snapshot":
      if (saveButton !== null) {
        saveButton.disabled = false;
      }
      showSaveSuccess(context.root, context.t);
      return;
    case "invalid":
      renderInvalid(context, snapshot, result.errors);
      return;
    default:
      throw new RangeError(`Unsupported options response: ${String(result)}`);
  }
}

function previewModel(): OptionsViewModel | null {
  const preview = new URLSearchParams(location.hash.slice(1)).get("preview");
  switch (preview) {
    case "defaults":
      return { config: DEFAULT_PROXY_CONFIG };
    case "field-error":
      return {
        config: DEFAULT_PROXY_CONFIG,
        errors: { host: "host_invalid", port: "port_invalid", bypass: "bypass_invalid" },
      };
    default:
      return null;
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new RangeError("Options root is missing");
}
const t = createBrowserTranslator();
const context: OptionsContext = { root, t };
document.title = t.getMessage("options_title");
const preview = previewModel();
if (preview === null) {
  const result = await send({ type: "state/get" });
  switch (result.kind) {
    case "snapshot":
      renderSnapshot(context, result.snapshot, false);
      break;
    case "invalid":
      throw new RangeError("State request returned field validation errors");
    default:
      throw new RangeError(`Unsupported options response: ${String(result)}`);
  }
} else {
  renderOptions(root, preview, t, INACTIVE_HANDLERS);
}
