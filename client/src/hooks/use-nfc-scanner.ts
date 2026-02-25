import { useCallback, useRef, useState } from "react";

interface NfcState {
  isSupported: boolean;
  isScanning: boolean;
  lastUid?: string;
  error?: string;
}

export function useNfcScanner(onUid: (uid: string) => void) {
  const [state, setState] = useState<NfcState>({
    isSupported: typeof window !== "undefined" && "NDEFReader" in window,
    isScanning: false,
  });
  const readerRef = useRef<any>(null);

  const start = useCallback(async () => {
    if (!("NDEFReader" in window)) {
      setState((prev) => ({ ...prev, error: "Web NFC no disponible en este dispositivo." }));
      return;
    }

    try {
      const reader = new (window as any).NDEFReader();
      readerRef.current = reader;
      await reader.scan();
      setState((prev) => ({ ...prev, isScanning: true, error: undefined }));

      reader.onreading = (event: any) => {
        const uid = String(event.serialNumber ?? "").toUpperCase();
        setState((prev) => ({ ...prev, lastUid: uid }));
        if (uid) onUid(uid);
      };

      reader.onreadingerror = () => {
        setState((prev) => ({ ...prev, error: "No se pudo leer la etiqueta NFC." }));
      };
    } catch (error: any) {
      setState((prev) => ({ ...prev, error: error?.message ?? "Error al iniciar NFC" }));
    }
  }, [onUid]);

  const stop = useCallback(() => {
    readerRef.current = null;
    setState((prev) => ({ ...prev, isScanning: false }));
  }, []);

  return { ...state, start, stop };
}
