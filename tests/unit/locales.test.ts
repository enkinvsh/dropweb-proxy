import { describe, expect, it } from "vitest";

import enMessages from "../../public/_locales/en/messages.json";
import ruMessages from "../../public/_locales/ru/messages.json";
import { MESSAGE_KEYS } from "../../src/ui/i18n";

describe("native locale catalogs", () => {
  it("Given English and Russian catalogs When their keys are compared Then the same non-empty key set is present", () => {
    const englishKeys = Object.keys(enMessages).sort();
    const russianKeys = Object.keys(ruMessages).sort();

    expect(englishKeys.length).toBeGreaterThan(0);
    expect(russianKeys).toEqual(englishKeys);
  });

  it.each([
    { catalogName: "English", messages: enMessages },
    { catalogName: "Russian", messages: ruMessages },
  ])(
    "Given the $catalogName catalog When runtime message keys are checked Then every key exists",
    ({ messages }) => {
      const missingKeys = MESSAGE_KEYS.filter((key) => !(key in messages));

      expect(missingKeys).toEqual([]);
    },
  );
});
