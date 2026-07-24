import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  hooks: {
    "entrypoints:found": (_wxt, entrypoints) => {
      if (entrypoints.length === 0) {
        entrypoints.push({
          inputPath: "virtual:user-background",
          name: "background",
          type: "background",
        });
      }
    },
    "entrypoints:resolved": (_wxt, entrypoints) => {
      if (entrypoints[0]?.inputPath === "virtual:user-background") {
        entrypoints.splice(0, 1);
      }
    },
    "build:manifestGenerated": (_wxt, manifest) => {
      if (manifest.options_ui !== undefined) {
        manifest.options_ui.open_in_tab = true;
      }
    },
  },
  manifest: ({ browser }) => ({
    name: "__MSG_extension_name__",
    description: "__MSG_extension_description__",
    permissions: ["alarms", "privacy", "proxy", "storage"],
    default_locale: "en",
    icons: {
      16: "icons/on-16.png",
      32: "icons/on-32.png",
      48: "icons/on-48.png",
      128: "icons/on-128.png",
    },
    action: {
      default_icon: {
        16: "icons/off-16.png",
        32: "icons/off-32.png",
        48: "icons/off-48.png",
        128: "icons/off-128.png",
      },
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "dropweb-proxy@enkinvsh.github.io",
              strict_min_version: "109.0",
            },
          },
        }
      : {}),
  }),
});
