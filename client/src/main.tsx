import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const SW_HARD_RESET_KEY = "sw-hard-reset-v6";

const hardResetLegacyServiceWorkerCaches = async () => {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return;
  if (window.localStorage.getItem(SW_HARD_RESET_KEY) === "done") return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));

    window.localStorage.setItem(SW_HARD_RESET_KEY, "done");
    window.location.reload();
  } catch (error) {
    console.error("Legacy SW cache hard reset failed:", error);
  }
};

void hardResetLegacyServiceWorkerCaches();

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}

window.addEventListener("beforeinstallprompt", (event: Event) => {
  event.preventDefault();
  (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt =
    event as BeforeInstallPromptEvent;
});

window.addEventListener("appinstalled", () => {
  (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt = undefined;
});
