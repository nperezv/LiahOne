import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InventoryScannerProps {
  onDetected: (assetCode: string) => void;
}

const extractAssetCode = (payload: string) => payload.split("/").at(-1)?.trim() ?? payload.trim();

export function InventoryScanner({ onDetected }: InventoryScannerProps) {
  const [manualCode, setManualCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [hint, setHint] = useState<string>("");
  const html5ScannerRef = useRef<any>(null);
  const html5RegionRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  const startFallbackScanner = async () => {
    if (!("BarcodeDetector" in window)) {
      setHint("Instala html5-qrcode para máxima compatibilidad. Fallback no disponible en este navegador.");
      return;
    }

    const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    fallbackStreamRef.current = media;
    if (videoRef.current) {
      videoRef.current.srcObject = media;
      await videoRef.current.play();
    }

    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
    let active = true;

    const tick = async () => {
      if (!active || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const raw = String(codes?.[0]?.rawValue ?? "");
        if (raw) {
          onDetected(extractAssetCode(raw));
          active = false;
          await stopScanner();
          return;
        }
      } catch {
        // ignore frame errors
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    setHint("Modo fallback BarcodeDetector activo.");
    return () => {
      active = false;
    };
  };

  const startScanner = async () => {
    if (isScanning) return;
    setIsScanning(true);

    try {
      const Html5Qrcode = (window as any).Html5Qrcode;
      if (!Html5Qrcode || !html5RegionRef.current) throw new Error("html5-qrcode no disponible");

      const scanner = new Html5Qrcode(html5RegionRef.current.id);
      html5ScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText: string) => onDetected(extractAssetCode(decodedText)),
      );

      setHint("Escaneo con html5-qrcode");
      return;
    } catch {
      await startFallbackScanner();
    }
  };

  const stopScanner = async () => {
    if (html5ScannerRef.current) {
      try {
        await html5ScannerRef.current.stop();
        await html5ScannerRef.current.clear();
      } catch {
        // ignore stop errors
      }
      html5ScannerRef.current = null;
    }

    fallbackStreamRef.current?.getTracks().forEach((track) => track.stop());
    fallbackStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div id="inventory-scanner-region" ref={html5RegionRef} className="overflow-hidden rounded-xl" />
      <video ref={videoRef} className="h-56 w-full rounded-xl bg-black object-cover" muted playsInline />

      <Button className="h-14 w-full text-base font-semibold" onClick={isScanning ? stopScanner : startScanner}>
        {isScanning ? "DETENER" : "ESCANEAR"}
      </Button>

      <div className="flex gap-2">
        <Input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="ABM8-0001" />
        <Button variant="outline" onClick={() => manualCode && onDetected(extractAssetCode(manualCode))}>Abrir</Button>
      </div>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
