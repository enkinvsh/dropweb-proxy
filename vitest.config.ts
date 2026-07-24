import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
            "tests/**/*.{test,spec}.?(c|m)[jt]s?(x)",
          ],
          exclude: ["src/ui/**", "tests/e2e/**", "tests/unit/*view*"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["src/ui/**/*.{test,spec}.?(c|m)[jt]s?(x)", "tests/unit/*view*"],
        },
      },
    ],
  },
});
