import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  initTheme,
  loadThemePreference,
  saveThemePreference,
} from "./theme";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => vi.restoreAllMocks());

describe("theme preference", () => {
  it("follows the device until someone chooses otherwise", () => {
    expect(loadThemePreference()).toBe("system");

    // "system" is the absence of an attribute, not a resolved value: the page
    // has to keep following the device when it flips at sunset.
    applyThemePreference("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("remembers an explicit choice and writes it onto <html>", () => {
    saveThemePreference("dark");
    applyThemePreference("dark");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(loadThemePreference()).toBe("dark");
  });

  it("forgets the choice rather than storing 'system'", () => {
    saveThemePreference("light");
    saveThemePreference("system");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(loadThemePreference()).toBe("system");
  });

  it("ignores a stored value that is not a theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "solarized");
    expect(loadThemePreference()).toBe("system");
  });

  it("falls back to the device when storage throws", () => {
    // Private windows and blocked site data both throw on read.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadThemePreference()).toBe("system");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => saveThemePreference("dark")).not.toThrow();
  });

  it("applies the saved theme before the app mounts", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    expect(initTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
