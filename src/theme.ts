/**
 * Light, dark, or whatever the device says.
 *
 * The palette itself lives entirely in `styles.css`: `prefers-color-scheme`
 * supplies the default and `[data-theme]` overrides it. All this module does is
 * write that one attribute and remember the choice, which is why switching
 * themes needs no re-render — nothing in React reads a colour.
 *
 * "system" deliberately removes the attribute rather than resolving it to a
 * concrete value. A person who has not chosen should follow their device when
 * it changes at sunset, without the app having to watch for that.
 */

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "tiktok-creator-sop-tool.theme.v1";

export const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  helper: string;
}> = [
  { value: "system", label: "跟随系统", helper: "跟着电脑的深浅色设置走" },
  { value: "light", label: "浅色", helper: "始终用浅色" },
  { value: "dark", label: "深色", helper: "始终用深色" },
];

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function loadThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : "system";
  } catch {
    // Private windows and blocked site data both throw on read. Following the
    // device is a fine answer when we cannot remember a choice.
    return "system";
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // The theme still applies for this session; only the memory of it is lost.
  }
}

/** Writes the choice onto <html>, where the stylesheet is watching for it. */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (preference === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preference;
  }
}

/**
 * Applied before React mounts, so a dark-mode user never sees a white flash
 * while the bundle boots. Called from `main.tsx`.
 */
export function initTheme(): ThemePreference {
  const preference = loadThemePreference();
  applyThemePreference(preference);
  return preference;
}
