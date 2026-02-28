import { useCallback, useRef, useState } from "react";

interface NfcState {
  isSupported: boolean;
  isScanning: boolean;
  lastUid?: string;
  error?: string;
}

const NFC_TEXT_DECODER = new TextDecoder();

const decodeNdefTextRecord = (data: ArrayBuffer) => {
  const bytes = new Uint8Array(data);
  if (!bytes.length) return "";

  const status = bytes[0];
  const languageLength = status & 0x3f;
  const payloadStart = 1 + languageLength;
  if (payloadStart >= bytes.length) return "";

  return NFC_TEXT_DECODER.decode(bytes.slice(payloadStart));
};

export function useNfcScanner(onUid: (uid: string) => void) {
  const [state, setState] = useState<NfcState>({
    isSupported: typeof window !== "undefined" && "NDEFReader" in window,
    isScanning: false,
  });
  const readerRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  const normalizeId = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

  const extractIdFromPayload = (payload: string) => {
    const text = payload.trim();
    if (!text) return "";

    const upper = normalizeId(text);
    const marker = "NFC_ID:";
    const markerIndex = upper.indexOf(marker);
    if (markerIndex >= 0) return upper.slice(markerIndex + marker.length).trim();

    const urlMatch = text.match(/\/inventory\/nfc\/([A-Za-z0-9_-]+)/i) ?? text.match(/nfc=([A-Za-z0-9_-]+)/i);
    if (urlMatch?.[1]) return normalizeId(urlMatch[1]);

    try {
      const parsed = JSON.parse(text);
      const fromJson = parsed?.nfcId ?? parsed?.nfc_id ?? parsed?.id;
      if (fromJson) return normalizeId(fromJson);
    } catch {
      // noop
    }

    return upper;
  };

  const getUidFromEvent = (event: any) => {
    const message = event?.message;
    if (message?.records) {
      for (const record of message.records) {
        const fromId = normalizeId(record?.id);
        if (fromId) return fromId;

        const data = record?.data;
        if (data) {
          const decoded = record?.recordType === "text"
            ? decodeNdefTextRecord(data)
            : NFC_TEXT_DECODER.decode(data);
          const fromPayload = extractIdFromPayload(decoded);
          if (fromPayload) return fromPayload;
        }
      }
    }

    // Fallback para compatibilidad con etiquetas antiguas basadas en UID física
    return normalizeId(event?.serialNumber);
  };

  const start = useCallback(async () => {
    if (!("NDEFReader" in window)) {
      setState((prev) => ({ ...prev, error: "Web NFC no disponible en este dispositivo." }));
      return;
    }

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const reader = new (window as any).NDEFReader();
      readerRef.current = reader;
      await reader.scan({ signal: controller.signal });
      setState((prev) => ({ ...prev, isScanning: true, error: undefined }));

      reader.onreading = (event: any) => {
        const uid = getUidFromEvent(event);

        if (!uid) {
          setState((prev) => ({
            ...prev,
            error: "Etiqueta NFC detectada pero sin ID NDEF legible. Graba un valor (ej: NFC_ID:ARMARIO01) y vuelve a escanear.",
          }));
          return;
        }

        setState((prev) => ({ ...prev, lastUid: uid, error: undefined }));
        onUid(uid);
      };

      reader.onreadingerror = () => {
        setState((prev) => ({
          ...prev,
          error: "No se pudo leer la etiqueta NFC. Revisa que tenga un registro NDEF con ID y vuelve a probar.",
        }));
      };
    } catch (error: any) {
      setState((prev) => ({ ...prev, error: error?.message ?? "Error al iniciar NFC" }));
    }
  }, [onUid]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current = null;
    setState((prev) => ({ ...prev, isScanning: false }));
  }, []);

  return { ...state, start, stop };
}
