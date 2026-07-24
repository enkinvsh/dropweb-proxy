export type WebRtcResult =
  | { readonly kind: "protected" }
  | { readonly kind: "released" }
  | {
      readonly kind: "conflict";
      readonly reason: "controlled_by_other" | "not_controllable";
    }
  | { readonly kind: "error" };

export interface WebRtcGuard {
  protect(): Promise<WebRtcResult>;
  release(): Promise<WebRtcResult>;
}
