export type ThemePreference = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "liahonapp-theme";
const THEME_CHANGE_EVENT = "liahonapp-theme-change";

const getSystemTheme = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const getStoredTheme = (): ThemePreference => {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
};

export const applyTheme = (preference: ThemePreference) => {
  if (typeof window === "undefined") return;
  const resolved = preference === "system" ? getSystemTheme() : preference;
  document.documentElement.classList.toggle("dark", resolved === "dark");
};

export const setStoredTheme = (preference: ThemePreference) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGE_EVENT, { detail: preference })
  );
};

export const listenThemeChange = (handler: (preference: ThemePreference) => void) => {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ThemePreference>).detail;
    if (detail) {
      handler(detail);
    }
  };
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
};

export const watchSystemTheme = (handler: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => handler();
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", listener);
  } else {
    mediaQuery.addListener(listener);
  }
  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener("change", listener);
    } else {
      mediaQuery.removeListener(listener);
    }
  };
};
