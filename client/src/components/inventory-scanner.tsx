import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, QrCode } from "lucide-react";
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
      setHint("Tu navegador no soporta escaneo avanzado. Usa entrada manual.");
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
        // noop
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    setHint("Escaneo activo (modo compatibilidad)");
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
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText: string) => onDetected(extractAssetCode(decodedText)),
      );

      setHint("Escaneo activo");
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
        // noop
      }
      html5ScannerRef.current = null;
    }

    fallbackStreamRef.current?.getTracks().forEach((track) => track.stop());
    fallbackStreamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;

    setIsScanning(false);
  };

  return (
    <div className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-full bg-primary/20 p-2 text-primary"><QrCode className="h-4 w-4" /></div>
        <p className="text-sm font-medium">Escáner rápido</p>
      </div>

      <div id="inventory-scanner-region" ref={html5RegionRef} className="overflow-hidden rounded-2xl" />
      <video ref={videoRef} className="mt-2 h-56 w-full rounded-2xl border border-white/10 bg-black object-cover" muted playsInline />

      <Button className="mt-3 h-14 w-full rounded-2xl text-base font-semibold" onClick={isScanning ? stopScanner : startScanner}>
        <Camera className="mr-2 h-5 w-5" />
        {isScanning ? "Detener escaneo" : "ESCANEAR"}
      </Button>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 rounded-xl pl-9" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="ABM8-0001" />
        </div>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => manualCode && onDetected(extractAssetCode(manualCode))}>Abrir</Button>
      </div>

      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
