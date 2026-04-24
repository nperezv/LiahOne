export type ThemePreference =
  | "light"
  | "dark"
  | "system"
  | "white-black"
  | "blue-black"
  | "terracotta"
  | "graphite-mint";

export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "zendapp-theme";
const THEME_CHANGE_EVENT = "zendapp-theme-change";

const THEMES: ThemePreference[] = [
  "light",
  "dark",
  "system",
  "white-black",
  "blue-black",
  "terracotta",
  "graphite-mint",
];

const CUSTOM_THEME_CLASSES = ["theme-white-black", "theme-blue-black", "theme-terracotta", "theme-graphite-mint"];

const isThemePreference = (value: string | null): value is ThemePreference =>
  !!value && THEMES.includes(value as ThemePreference);

const getSystemTheme = (): ResolvedTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const getResolvedTheme = (preference: ThemePreference): ResolvedTheme =>
  preference === "system"
    ? getSystemTheme()
    : preference === "light"
      ? "light"
      : "dark";

export const getStoredTheme = (): ThemePreference => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemePreference(stored)) {
    return stored;
  }
  return "dark";
};

export const applyTheme = (preference: ThemePreference) => {
  if (typeof window === "undefined") return;

  const resolved = getResolvedTheme(preference);
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === "dark");
  root.classList.remove(...CUSTOM_THEME_CLASSES);

  if (preference === "white-black") {
    root.classList.add("theme-white-black");
  } else if (preference === "blue-black") {
    root.classList.add("theme-blue-black");
  } else if (preference === "terracotta") {
    root.classList.add("theme-terracotta");
  } else if (preference === "graphite-mint") {
    root.classList.add("theme-graphite-mint");
  }

  root.setAttribute("data-theme-preference", preference);
};

export const setStoredTheme = (preference: ThemePreference) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: preference }));
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
