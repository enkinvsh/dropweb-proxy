import type { ProxyConfig } from "../domain/proxy-config";

export type AdapterResult =
  | { readonly kind: "applied" }
  | { readonly kind: "cleared" }
  | {
      readonly kind: "conflict";
      readonly reason: "controlled_by_other" | "not_controllable";
    }
  | {
      readonly kind: "error";
      readonly code: "proxy_api" | "firefox_private_access_required";
    };

export interface ProxyController {
  apply(config: ProxyConfig): Promise<AdapterResult>;
  clear(): Promise<AdapterResult>;
}

export type ControlDecision =
  | { readonly kind: "controllable" }
  | {
      readonly kind: "conflict";
      readonly reason: "controlled_by_other" | "not_controllable";
    }
  | { readonly kind: "unknown" };

export function normalizeLevelOfControl(levelOfControl: string): ControlDecision {
  switch (levelOfControl) {
    case "controlled_by_this_extension":
    case "controllable_by_this_extension":
      return { kind: "controllable" };
    case "controlled_by_other_extensions":
      return { kind: "conflict", reason: "controlled_by_other" };
    case "not_controllable":
      return { kind: "conflict", reason: "not_controllable" };
    default:
      return { kind: "unknown" };
  }
}
