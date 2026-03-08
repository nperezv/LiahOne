import { useCallback, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const isIosUserAgent = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

const isStandaloneDisplay = () => {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay());
    const storedPrompt = (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent })
      .deferredPwaPrompt;

    if (storedPrompt) {
      setDeferredPrompt(storedPrompt);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const isIos = useMemo(() => isIosUserAgent(), []);
  const canPromptInstall = Boolean(deferredPrompt);
  const showIosInstallHint = isIos && !isStandalone;

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return { outcome: "dismissed" as const, platform: "manual" };
    }

    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt = undefined;
    setDeferredPrompt(null);
    return result;
  }, [deferredPrompt]);

  return {
    canPromptInstall,
    isIos,
    isStandalone,
    promptInstall,
    showIosInstallHint,
  };
}

