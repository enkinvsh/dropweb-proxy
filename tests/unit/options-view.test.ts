import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProxyConfig } from "../../src/domain/proxy-config";
import type { Translator } from "../../src/ui/i18n";
import { renderOptions, showSaveSuccess } from "../../src/ui/options-view";

const CONFIG: ProxyConfig = {
  type: "socks5",
  host: "proxy.local",
  port: 1080,
  bypass: ["localhost", "::1"],
};

const t: Translator = {
  getMessage(key) {
    return key;
  },
};

function required<TElement extends Element>(element: TElement | null): TElement {
  if (element === null) {
    throw new RangeError("Expected DOM element");
  }
  return element;
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === name,
  );
  if (match === undefined) {
    throw new RangeError(`Expected button ${name}`);
  }
  return match;
}

function render() {
  const root = document.createElement("main");
  const handlers = { onSave: vi.fn(), onCancel: vi.fn() };
  renderOptions(root, { config: CONFIG }, t, handlers);
  return { root, handlers };
}

describe("options view", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("Given a config When rendered Then native labeled controls contain its values", () => {
    const { root } = render();

    const select = required(root.querySelector<HTMLSelectElement>('select[name="type"]'));
    const host = required(root.querySelector<HTMLInputElement>('input[name="host"]'));
    const port = required(root.querySelector<HTMLInputElement>('input[name="port"]'));
    const bypass = required(root.querySelector<HTMLTextAreaElement>('textarea[name="bypass"]'));
    expect(Array.from(root.querySelectorAll("label"), (label) => label.textContent)).toEqual([
      "field_type_label",
      "field_host_label",
      "field_port_label",
      "field_bypass_label",
    ]);
    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      "proxy_type_http",
      "proxy_type_socks5",
    ]);
    expect(select.value).toBe("socks5");
    expect(host.value).toBe("proxy.local");
    expect(port.value).toBe("1080");
    expect(bypass.value).toBe("localhost\n::1");
    expect(bypass.getAttribute("rows")).toBe("3");
    expect(button(root, "action_save").type).toBe("submit");
    expect(button(root, "action_cancel").type).toBe("button");
  });

  it("Given field errors When rendered Then every invalid field describes its adjacent message", () => {
    const root = document.createElement("main");
    renderOptions(
      root,
      {
        config: CONFIG,
        errors: { host: "host_invalid", port: "port_invalid", bypass: "bypass_invalid" },
      },
      t,
      { onSave: vi.fn(), onCancel: vi.fn() },
    );

    for (const [name, key] of [
      ["host", "error_host_invalid"],
      ["port", "error_port_invalid"],
      ["bypass", "error_bypass_invalid"],
    ] as const) {
      const field = required(
        root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`),
      );
      const descriptionId = field.getAttribute("aria-describedby");
      expect(descriptionId).not.toBeNull();
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.classList.contains("field-control-error")).toBe(true);
      expect(required(root.querySelector(`#${descriptionId}`)).textContent).toBe(key);
    }
  });

  it("Given a saved model When rendered Then localized confirmation is live", () => {
    const root = document.createElement("main");
    renderOptions(root, { config: CONFIG, savedVisible: true }, t, {
      onSave: vi.fn(),
      onCancel: vi.fn(),
    });

    const liveRegion = required(root.querySelector('[aria-live="polite"]'));
    expect(liveRegion.textContent).toContain("save_success");
  });

  it("Given an applying re-save When rendered Then both actions are disabled with saving copy", () => {
    const root = document.createElement("main");
    renderOptions(
      root,
      { config: CONFIG, applyStatus: { kind: "applying", operation: "reapply" } },
      t,
      { onSave: vi.fn(), onCancel: vi.fn() },
    );

    expect(button(root, "action_saving").disabled).toBe(true);
    expect(button(root, "action_cancel").disabled).toBe(true);
  });

  it("Given edited fields When saved Then raw strings are passed to the handler", () => {
    const { root, handlers } = render();
    required(root.querySelector<HTMLSelectElement>('select[name="type"]')).value = "http";
    required(root.querySelector<HTMLInputElement>('input[name="host"]')).value = "127.0.0.1";
    required(root.querySelector<HTMLInputElement>('input[name="port"]')).value = "7890";
    required(root.querySelector<HTMLTextAreaElement>('textarea[name="bypass"]')).value =
      "localhost\n127.0.0.1";

    required(root.querySelector<HTMLFormElement>("form")).requestSubmit();

    expect(handlers.onSave).toHaveBeenCalledOnce();
    expect(handlers.onSave).toHaveBeenCalledWith({
      type: "http",
      host: "127.0.0.1",
      port: "7890",
      bypass: "localhost\n127.0.0.1",
    });
  });

  it("Given the options form When cancel is clicked Then onCancel runs exactly once", () => {
    const { root, handlers } = render();

    button(root, "action_cancel").click();

    expect(handlers.onCancel).toHaveBeenCalledOnce();
  });

  it("Given a saved config When success is revealed Then the message shows without rebuilding the form", () => {
    const { root } = render();
    const host = required(root.querySelector<HTMLInputElement>('input[name="host"]'));
    host.value = "10.0.0.1";

    showSaveSuccess(root, t);

    const liveRegion = required(root.querySelector('[aria-live="polite"]'));
    expect(liveRegion.textContent).toContain("save_success");
    expect(root.querySelector<HTMLInputElement>('input[name="host"]')).toBe(host);
    expect(host.value).toBe("10.0.0.1");
  });
});
