import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventoryScanner } from "@/components/inventory-scanner";
import { useCreateAudit, useVerifyAuditItem } from "@/hooks/use-api";

export default function InventoryAuditPage() {
  const createAudit = useCreateAudit();
  const [auditId, setAuditId] = useState<string>("");
  const verifyItem = useVerifyAuditItem(auditId || "temp");
  const [verifiedCodes, setVerifiedCodes] = useState<string[]>([]);
  const [auditName, setAuditName] = useState(`Auditoría ${new Date().toLocaleDateString()}`);

  const progress = useMemo(() => ({ verified: verifiedCodes.length }), [verifiedCodes]);

  const onCreateAudit = async () => {
    const created = await createAudit.mutateAsync({ name: auditName });
    setAuditId(created.id);
  };

  const onDetected = async (assetCode: string) => {
    if (!auditId) return;
    await verifyItem.mutateAsync(assetCode);
    setVerifiedCodes((prev) => [assetCode, ...prev.filter((code) => code !== assetCode)]);
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">Auditoría de inventario</h1>

      {!auditId && (
        <Card>
          <CardHeader><CardTitle>Nueva auditoría</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={auditName} onChange={(event) => setAuditName(event.target.value)} />
            <Button onClick={onCreateAudit} disabled={createAudit.isPending}>{createAudit.isPending ? "Creando..." : "Iniciar auditoría"}</Button>
          </CardContent>
        </Card>
      )}

      <InventoryScanner onDetected={onDetected} />

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
