import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, HandCoins, MoveRight, ScanLine } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useInventoryLoan } from "@/hooks/use-api";

interface InventoryItemActionsCardProps {
  itemId: string;
  assetCode: string;
  uid?: string;
  name: string;
  category?: string;
  location?: string;
  photoUrl?: string | null;
  defaultExpanded?: boolean;
}

export function InventoryItemActionsCard({
  itemId,
  assetCode,
  uid,
  name,
  category,
  location,
  photoUrl,
  defaultExpanded = false,
}: InventoryItemActionsCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isLoanOpen, setIsLoanOpen] = useState(false);
  const [borrowerFirstName, setBorrowerFirstName] = useState("");
  const [borrowerLastName, setBorrowerLastName] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const loanMutation = useInventoryLoan();

  const resolvedCategory = useMemo(() => category || "Sin categoría", [category]);
  const resolvedLocation = useMemo(() => location || "Sin armario", [location]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { x, y } = getCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    context.beginPath();
    context.moveTo(x, y);
  };

  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { x, y } = getCanvasPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  useEffect(() => {
    if (!isLoanOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineWidth = 2.6;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    clearCanvas();
  }, [isLoanOpen]);

  const submitLoan = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    await loanMutation.mutateAsync({
      itemId,
      borrowerFirstName,
      borrowerLastName,
      borrowerPhone,
      borrowerEmail,
      expectedReturnDate,
      signatureDataUrl: canvas.toDataURL("image/png"),
    });

    setIsLoanOpen(false);
    setBorrowerFirstName("");
    setBorrowerLastName("");
    setBorrowerPhone("");
    setBorrowerEmail("");
    setExpectedReturnDate("");
  };

  return (
    <>
      <article className={cn("rounded-2xl border border-border/70 bg-background/70 p-3", expanded && "shadow-[0_0_0_1px_rgba(59,130,246,0.25)]") }>
        {uid ? <p className="text-xs uppercase tracking-wide text-muted-foreground">UID: {uid}</p> : null}

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 flex w-full items-center gap-3 text-left"
        >
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-xs text-muted-foreground">IMG</div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">{resolvedCategory}</p>
            <p className="text-sm text-muted-foreground">{resolvedLocation}</p>
          </div>
        </button>

        {expanded ? (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/inventory/${assetCode}`}>
                <Button className="h-11 w-full rounded-xl" variant="secondary">
                  <MoveRight className="mr-2 h-4 w-4" />Mover
                </Button>
              </Link>
              <Button className="h-11 w-full rounded-xl bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50" onClick={() => setIsLoanOpen(true)} disabled={!itemId}>
                <HandCoins className="mr-2 h-4 w-4" />Prestar
              </Button>
            </div>

            <Link href={`/inventory/${assetCode}`}>
              <Button className="h-11 w-full rounded-xl" variant="outline">
                <ArrowRight className="mr-2 h-4 w-4" />Ver detalles
              </Button>
            </Link>

            <Link href="/inventory/scan">
              <Button className="h-11 w-full rounded-xl" variant="ghost">
                <ScanLine className="mr-2 h-4 w-4" />Escanear ubicación destino
              </Button>
            </Link>
          </div>
        ) : null}
      </article>

      <Dialog open={isLoanOpen} onOpenChange={setIsLoanOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Solicitud de préstamo de activo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Código de activo</Label>
              <Input value={assetCode} readOnly />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>Nombres</Label>
                <Input value={borrowerFirstName} onChange={(e) => setBorrowerFirstName(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>Apellidos</Label>
                <Input value={borrowerLastName} onChange={(e) => setBorrowerLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>Teléfono</Label>
                <Input value={borrowerPhone} onChange={(e) => setBorrowerPhone(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>Correo</Label>
                <Input type="email" value={borrowerEmail} onChange={(e) => setBorrowerEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Fecha estimada de devolución</Label>
              <Input type="date" value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Firma del solicitante</Label>
              <canvas
                ref={canvasRef}
                width={540}
                height={150}
                className="w-full rounded-md border border-border bg-white"
                onPointerDown={startDrawing}
                onPointerMove={drawSignature}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                onPointerLeave={stopDrawing}
              />
              <Button type="button" variant="outline" onClick={clearCanvas}>Limpiar firma</Button>
            </div>
            <Button
              onClick={() => void submitLoan()}
              disabled={loanMutation.isPending || !borrowerFirstName || !borrowerLastName || !borrowerPhone || !borrowerEmail || !expectedReturnDate}
            >
              {loanMutation.isPending ? "Solicitando..." : "Solicitar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
