import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
