import { PointerEvent, useEffect, useRef, useState } from "react";
import { Eraser, HandCoins, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInventoryLoan, useInventoryReturn } from "@/hooks/use-api";

function isoDatePlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const QUICK_RETURN = [
  { label: "1 semana", days: 7 },
  { label: "2 semanas", days: 14 },
  { label: "1 mes", days: 30 },
];

interface LoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  assetCode: string;
  itemName: string;
  onDone?: () => void;
}

export function InventoryLoanDialog({ open, onOpenChange, itemId, assetCode, itemName, onDone }: LoanDialogProps) {
  const loan = useInventoryLoan();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [returnDate, setReturnDate] = useState(isoDatePlusDays(7));
  const [hasSignature, setHasSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  useEffect(() => {
    if (!open) return;
    // El lienzo se monta un instante después de abrir el diálogo.
    const t = setTimeout(() => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "#111827";
      clearCanvas();
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  };

  const start = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };
  const stop = () => {
    drawingRef.current = false;
  };

  const canSubmit = firstName.trim().length >= 2 && lastName.trim().length >= 2 && phone.trim().length >= 6 && returnDate.length === 10 && hasSignature;

  const submit = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await loan.mutateAsync({
        itemId,
        borrowerFirstName: firstName.trim(),
        borrowerLastName: lastName.trim(),
        borrowerPhone: phone.trim(),
        borrowerEmail: email.trim(),
        expectedReturnDate: returnDate,
        signatureDataUrl: canvas.toDataURL("image/png"),
      });
    } catch {
      return; // el aviso con el motivo ya lo muestra el hook
    }
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setReturnDate(isoDatePlusDays(7));
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prestar activo</DialogTitle>
          <DialogDescription>{assetCode} · {itemName}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Nombre *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
            </div>
            <div className="grid gap-1">
              <Label>Apellidos *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Teléfono *</Label>
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Correo (opcional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Devolver antes del *</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_RETURN.map((q) => (
                <Button
                  key={q.days}
                  type="button"
                  size="sm"
                  variant={returnDate === isoDatePlusDays(q.days) ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setReturnDate(isoDatePlusDays(q.days))}
                >
                  {q.label}
                </Button>
              ))}
            </div>
            <Input type="date" value={returnDate} min={isoDatePlusDays(0)} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Firma de quien se lo lleva *</Label>
              <Button type="button" size="sm" variant="ghost" onClick={clearCanvas}><Eraser className="mr-1 h-3.5 w-3.5" />Borrar</Button>
            </div>
            <canvas
              ref={canvasRef}
              width={540}
              height={160}
              className="w-full touch-none rounded-xl border border-border bg-white"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
              onPointerLeave={stop}
            />
          </div>
          <Button className="h-12 rounded-2xl bg-amber-600 text-white hover:bg-amber-500" onClick={() => void submit()} disabled={loan.isPending || !canSubmit}>
            <HandCoins className="mr-2 h-4 w-4" />
            {loan.isPending ? "Registrando..." : "Registrar préstamo"}
          </Button>
          {!canSubmit ? <p className="text-center text-xs text-muted-foreground">Rellena los campos con * y firma en el recuadro blanco.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  borrowerName?: string | null;
  onDone?: () => void;
}

export function InventoryReturnDialog({ open, onOpenChange, loanId, borrowerName, onDone }: ReturnDialogProps) {
  const ret = useInventoryReturn();
  const [hasIncident, setHasIncident] = useState(false);
  const [notes, setNotes] = useState("");

  const submit = async () => {
    try {
      await ret.mutateAsync({ loanId, returnHasIncident: hasIncident, returnIncidentNotes: hasIncident ? notes.trim() : undefined });
    } catch {
      return;
    }
    setHasIncident(false);
    setNotes("");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar devolución</DialogTitle>
          <DialogDescription>{borrowerName ? `Lo devuelve ${borrowerName}.` : "Confirma que el activo ha vuelto."}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={hasIncident} onCheckedChange={(v) => setHasIncident(Boolean(v))} />
          Vuelve con algún daño o falta algo
        </label>
        {hasIncident ? (
          <Textarea placeholder="Describe qué le pasa (mínimo 3 letras)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        ) : null}
        <Button className="h-12 rounded-2xl" disabled={ret.isPending || (hasIncident && notes.trim().length < 3)} onClick={() => void submit()}>
          <Undo2 className="mr-2 h-4 w-4" />
          {ret.isPending ? "Guardando..." : "Confirmar devolución"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
