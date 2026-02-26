import { Nfc, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ScanScreen({
  onMockNfc,
  onMockQr,
}: {
  onMockNfc: () => void;
  onMockQr: () => void;
}) {
  return (
    <div className="space-y-8 pt-4 text-center">
      <h1 className="text-3xl font-semibold tracking-wide">ESCANEAR</h1>
      <div className="mx-auto flex h-72 w-72 items-center justify-center rounded-full border border-cyan-300/30 bg-[radial-gradient(circle,rgba(34,211,238,.22),rgba(10,16,28,.2)_45%,rgba(10,16,28,.95)_80%)] shadow-[0_0_70px_rgba(34,211,238,.35)]">
        <div className="flex h-52 w-52 items-center justify-center rounded-full border-2 border-cyan-200/80 text-cyan-100">
          <Nfc className="h-16 w-16" />
        </div>
      </div>
      <p className="text-xl text-slate-100">Acerca una etiqueta NFC</p>
      <p className="-mt-5 text-xl text-slate-300">o Escanea un código QR</p>
      <div className="grid grid-cols-2 gap-3">
        <Button className="rounded-2xl bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={onMockNfc}>
          <Nfc className="mr-2 h-4 w-4" /> NFC
        </Button>
        <Button variant="secondary" className="rounded-2xl border border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={onMockQr}>
          <QrCode className="mr-2 h-4 w-4" /> QR
        </Button>
      </div>
    </div>
  );
}
