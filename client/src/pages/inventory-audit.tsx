import { useEffect, useMemo, useState } from "react";
import { ScanLine, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventoryScanner } from "@/components/inventory-scanner";
import { useCreateAudit, useInventoryByNfc, useVerifyAuditItem } from "@/hooks/use-api";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";

export default function InventoryAuditPage() {
  const createAudit = useCreateAudit();
  const [auditId, setAuditId] = useState<string>("");
  const verifyItem = useVerifyAuditItem(auditId || "temp");
  const [verifiedCodes, setVerifiedCodes] = useState<string[]>([]);
  const [auditName, setAuditName] = useState(`Auditoría ${new Date().toLocaleDateString()}`);

  const [scanMode, setScanMode] = useState<"qr" | "nfc">("nfc");
  const [nfcUid, setNfcUid] = useState("");
  const [lastResolvedAsset, setLastResolvedAsset] = useState("");
  const [lastProcessedUid, setLastProcessedUid] = useState("");

  const nfcLookup = useInventoryByNfc(nfcUid || undefined);
  const nfc = useNfcScanner((uid) => {
    setNfcUid(uid);
  });

  const progress = useMemo(() => ({ verified: verifiedCodes.length }), [verifiedCodes]);

  const onCreateAudit = async () => {
    const created = await createAudit.mutateAsync({ name: auditName });
    setAuditId(created.id);
  };

  const onDetected = async (assetCode: string) => {
    if (!auditId) return;
    await verifyItem.mutateAsync(assetCode);
    setVerifiedCodes((prev) => [assetCode, ...prev.filter((code) => code !== assetCode)]);
    setLastResolvedAsset(assetCode);
  };

  useEffect(() => {
    if (!auditId) return;
    if (!nfcUid || lastProcessedUid === nfcUid) return;

    const resolved = nfcLookup.data as { type?: string; asset_code?: string } | undefined;
    if (!resolved || resolved.type !== "item" || !resolved.asset_code) return;

    setLastProcessedUid(nfcUid);
    void onDetected(resolved.asset_code);
  }, [auditId, nfcLookup.data, nfcUid, lastProcessedUid]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <InventoryPageHeader subtitle="Auditoría de inventario" />

      {!auditId && (
        <Card>
          <CardHeader><CardTitle>Nueva auditoría</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={auditName} onChange={(event) => setAuditName(event.target.value)} />
            <Button onClick={onCreateAudit} disabled={createAudit.isPending}>{createAudit.isPending ? "Creando..." : "Iniciar auditoría"}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Modo de escaneo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant={scanMode === "qr" ? "default" : "outline"} onClick={() => setScanMode("qr")}><QrCode className="mr-2 h-4 w-4" />QR / Código</Button>
            <Button variant={scanMode === "nfc" ? "default" : "outline"} onClick={() => setScanMode("nfc")}><ScanLine className="mr-2 h-4 w-4" />NFC</Button>
          </div>

          {scanMode === "qr" ? (
            <InventoryScanner onDetected={onDetected} />
          ) : (
            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-sm text-muted-foreground">Acerca el móvil al sticker NFC del activo. Si está vinculado, se identifica y se marca como verificado automáticamente.</p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={!nfc.isSupported} onClick={nfc.isScanning ? nfc.stop : nfc.start}>
                  <ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning ? "Detener lectura NFC" : "Leer NFC"}
                </Button>
                <Input value={nfcUid} onChange={(event) => setNfcUid(event.target.value.toUpperCase())} placeholder="UID NFC" />
              </div>
              {(() => {
                const resolved = nfcLookup.data as { type?: string; asset_code?: string } | undefined;
                if (!resolved) return null;

                return (
                  <p className="text-sm">
                    {resolved.type === "item" && resolved.asset_code
                      ? <>Activo detectado: <b>{resolved.asset_code}</b></>
                      : <>NFC sin activo vinculado</>}
                  </p>
                );
              })()}
              {lastResolvedAsset && <p className="text-sm text-emerald-700">Último verificado por NFC: <b>{lastResolvedAsset}</b></p>}
              {nfc.error && <p className="text-xs text-red-600">{nfc.error}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Progreso</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Verificados: {progress.verified}</p>
          {verifiedCodes.map((code) => <div key={code} className="rounded-lg border p-2 text-sm">{code} · verificado</div>)}
        </CardContent>
      </Card>
    </div>
  );
}
