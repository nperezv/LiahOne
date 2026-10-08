import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowRight,
  Camera,
  Download,
  FileText,
  HandCoins,
  Loader2,
  MapPin,
  MoveRight,
  Package,
  Pencil,
  Printer,
  QrCode,
  Trash2,
  Undo2,
  Wifi,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";
import { InventoryLoanDialog, InventoryReturnDialog } from "@/components/inventory/inventory-loan-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { assetPublicUrl, itemLabelPdf, qrDataUrl, uploadInventoryPhoto } from "@/lib/inventory-files";
import {
  INVENTORY_STATUS_LABELS,
  useDeleteInventoryItem,
  useInventoryCategories,
  useInventoryItem,
  useInventoryLocations,
  useMoveInventoryItem,
  useUpdateInventoryItem,
} from "@/hooks/use-api";

const STATUS_STYLE: Record<string, string> = {
  available: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  loaned: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  maintenance: "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const LOAN_STATUS: Record<string, string> = { active: "En curso", returned: "Devuelto", overdue: "Vencido" };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(expected?: string | null) {
  if (!expected) return false;
  return expected < new Date().toISOString().slice(0, 10);
}

export default function InventoryDetailPage() {
  const { assetCode = "" } = useParams<{ assetCode: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const canDelete = ["obispo", "consejero_obispo"].includes(String(user?.role ?? ""));

  const { data, isLoading } = useInventoryItem(assetCode);
  const { data: locations = [] } = useInventoryLocations();
  const { data: categories = [] } = useInventoryCategories();
  const moveItem = useMoveInventoryItem(assetCode);
  const updateItem = useUpdateInventoryItem(assetCode);
  const deleteItem = useDeleteInventoryItem();

  const [loanOpen, setLoanOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [toLocation, setToLocation] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [labelLoading, setLabelLoading] = useState(false);
  const [qrImage, setQrImage] = useState("");

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  const item = data?.item;
  const activeLoan = data?.activeLoan;

  useEffect(() => {
    if (!qrOpen || !item) return;
    qrDataUrl(assetPublicUrl(item.assetCode)).then(setQrImage).catch(() => setQrImage(""));
  }, [qrOpen, item]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;
  if (!item) {
    return (
      <div className="space-y-4 p-6">
        <p>No se encontró el activo <b>{assetCode}</b>. Puede que se haya eliminado.</p>
        <Link href="/inventory/map"><Button variant="outline">Ir a armarios</Button></Link>
      </div>
    );
  }

  const openEdit = () => {
    setEditName(item.name ?? "");
    setEditDescription(item.description ?? "");
    setEditCategory(item.categoryId ?? "");
    setEditPhoto(item.photoUrl ?? "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    try {
      await updateItem.mutateAsync({
        name: editName.trim(),
        description: editDescription.trim() || null,
        categoryId: editCategory || undefined,
        photoUrl: editPhoto || null,
      });
      setEditOpen(false);
    } catch {
      // aviso mostrado por el hook
    }
  };

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    setPhotoUploading(true);
    try {
      setEditPhoto(await uploadInventoryPhoto(file));
    } catch (e) {
      toast({ title: "No se pudo subir la foto", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  };

  const doMove = async () => {
    try {
      await moveItem.mutateAsync({ toLocation, note: moveNote.trim() || undefined });
      toast({ title: "Activo movido", description: "La nueva ubicación ya está guardada." });
      setMoveOpen(false);
      setToLocation("");
      setMoveNote("");
    } catch {
      // aviso mostrado por el hook
    }
  };

  const doLabel = async () => {
    setLabelLoading(true);
    try {
      await itemLabelPdf(item.assetCode);
    } catch (e) {
      toast({ title: "No se pudo generar la etiqueta", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLabelLoading(false);
    }
  };

  const toggleMaintenance = () =>
    updateItem.mutate({ status: item.status === "maintenance" ? "available" : "maintenance" });

  const doDelete = async () => {
    try {
      await deleteItem.mutateAsync(item.assetCode);
      setDeleteOpen(false);
      navigate("/inventory/map");
    } catch {
      // aviso mostrado por el hook
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-8">
      <InventoryPageHeader subtitle="Ficha del activo" backHref="/inventory/map" />

      {/* Cabecera */}
      <Card className="overflow-hidden rounded-3xl">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
          {item.photoUrl ? (
            <img src={item.photoUrl} alt={item.name} className="h-40 w-full rounded-2xl object-cover sm:h-32 sm:w-32" />
          ) : (
            <button type="button" onClick={openEdit} className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-xs text-muted-foreground sm:w-32">
              <Camera className="h-6 w-6" />Añadir foto
            </button>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{item.name}</h1>
              <Badge variant="outline" className={STATUS_STYLE[item.status]}>
                {INVENTORY_STATUS_LABELS[item.status as keyof typeof INVENTORY_STATUS_LABELS] ?? item.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{item.assetCode}{item.categoryName ? ` · ${item.categoryName}` : ""}</p>
            <p className="flex items-center gap-1 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{item.locationName ? `${item.locationName} · ${item.locationCode}` : "Sin armario asignado"}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Wifi className="h-3.5 w-3.5" />{item.hasNfc ? "Tiene etiqueta NFC" : "Sin etiqueta NFC"}</p>
            {item.description ? <p className="text-sm">{item.description}</p> : null}
          </div>
        </CardContent>
      </Card>

      {/* Préstamo en curso */}
      {activeLoan ? (
        <div className={`rounded-2xl border p-4 text-sm ${isOverdue(activeLoan.expectedReturnDate) ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"}`}>
          <p className="font-semibold">
            {isOverdue(activeLoan.expectedReturnDate) ? "⚠️ Préstamo vencido" : "Prestado"} a {activeLoan.borrowerName}
          </p>
          <p className="mt-1 text-muted-foreground">
            Desde {formatDate(activeLoan.dateOut)} · Devolver antes del {formatDate(activeLoan.expectedReturnDate)}
          </p>
          {activeLoan.borrowerPhone ? (
            <a className="mt-1 inline-block underline" href={`tel:${activeLoan.borrowerPhone}`}>Llamar: {activeLoan.borrowerPhone}</a>
          ) : null}
        </div>
      ) : null}

      {/* Acciones principales */}
      <div className="grid grid-cols-2 gap-2">
        {activeLoan ? (
          <Button className="col-span-2 h-12 rounded-2xl" onClick={() => setReturnOpen(true)}>
            <Undo2 className="mr-2 h-4 w-4" />Registrar devolución
          </Button>
        ) : (
          <Button
            className="col-span-2 h-12 rounded-2xl bg-amber-600 text-white hover:bg-amber-500"
            disabled={item.status === "maintenance"}
            onClick={() => setLoanOpen(true)}
          >
            <HandCoins className="mr-2 h-4 w-4" />{item.status === "maintenance" ? "En mantenimiento: no se puede prestar" : "Prestar"}
          </Button>
        )}
        <Button variant="secondary" className="h-11 rounded-xl" onClick={() => setMoveOpen(true)}><MoveRight className="mr-2 h-4 w-4" />Mover</Button>
        <Button variant="secondary" className="h-11 rounded-xl" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => setQrOpen(true)}><QrCode className="mr-2 h-4 w-4" />Ver QR</Button>
        <Button variant="outline" className="h-11 rounded-xl" disabled={labelLoading} onClick={() => void doLabel()}>
          {labelLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}Etiqueta
        </Button>
        {!activeLoan ? (
          <Button variant="ghost" className="h-11 rounded-xl" disabled={updateItem.isPending} onClick={toggleMaintenance}>
            <Wrench className="mr-2 h-4 w-4" />{item.status === "maintenance" ? "Ya está reparado" : "A mantenimiento"}
          </Button>
        ) : null}
        {canDelete ? (
          <Button variant="ghost" className="h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />Eliminar
          </Button>
        ) : null}
      </div>

      {/* Préstamos */}
      <Card className="rounded-3xl">
        <CardHeader><CardTitle className="text-base">Préstamos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.loans.length === 0 ? <p className="text-sm text-muted-foreground">Nunca se ha prestado.</p> : null}
          {data.loans.map((loan: any) => (
            <div key={loan.id} className="space-y-1 rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{loan.borrowerName}</p>
                <Badge variant="secondary">{LOAN_STATUS[loan.status] ?? loan.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Salida {formatDate(loan.dateOut)} · Prevista {formatDate(loan.expectedReturnDate)} · Devuelto {formatDate(loan.dateReturn)}
              </p>
              {loan.returnHasIncident ? <p className="text-xs text-amber-700">Incidencia: {loan.returnIncidentNotes || "sin notas"}</p> : null}
              {loan.requestPdfUrl ? (
                <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={loan.requestPdfUrl} target="_blank" rel="noreferrer">
                  <FileText className="h-3.5 w-3.5" />Hoja de préstamo firmada
                </a>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Movimientos */}
      <Card className="rounded-3xl">
        <CardHeader><CardTitle className="text-base">Historial de ubicaciones</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.movements.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p> : null}
          {data.movements.map((m: any) => (
            <div key={m.id} className="rounded-xl border p-3 text-sm">
              <p className="flex flex-wrap items-center gap-1">
                <span>{m.fromLocationName ?? "Sin armario"}</span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="font-medium">{m.toLocationName ?? "Sin armario"}</span>
              </p>
              <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("es-ES")}</p>
              {m.note ? <p className="mt-1 text-xs">{m.note}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Diálogos */}
      <InventoryLoanDialog open={loanOpen} onOpenChange={setLoanOpen} itemId={item.id} assetCode={item.assetCode} itemName={item.name} />
      {activeLoan ? (
        <InventoryReturnDialog open={returnOpen} onOpenChange={setReturnOpen} loanId={activeLoan.id} borrowerName={activeLoan.borrowerName} />
      ) : null}

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mover a otro armario</DialogTitle>
            <DialogDescription>Ahora está en: {item.locationName ?? "sin armario"}</DialogDescription>
          </DialogHeader>
          <Select value={toLocation} onValueChange={setToLocation}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Elige el armario de destino" /></SelectTrigger>
            <SelectContent>
              {locations.filter((l) => l.id !== item.locationId).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Nota (opcional)" value={moveNote} onChange={(e) => setMoveNote(e.target.value)} />
          <Button className="h-11 rounded-xl" disabled={!toLocation || moveItem.isPending} onClick={() => void doMove()}>
            {moveItem.isPending ? "Moviendo..." : "Mover aquí"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            ¿Con NFC? Usa <Link href="/inventory/scan" className="underline">Escanear</Link>: toca el activo y luego el armario.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>Editar activo</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1"><Label>Nombre</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Descripción</Label><Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
            <div className="grid gap-1">
              <Label>Categoría</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Foto</Label>
              {editPhoto ? <img src={editPhoto} alt="" className="h-32 w-full rounded-xl object-cover" /> : null}
              <div className="flex gap-2">
                <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm">
                  {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {photoUploading ? "Subiendo..." : editPhoto ? "Cambiar foto" : "Hacer o subir foto"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)} />
                </label>
                {editPhoto ? <Button variant="ghost" onClick={() => setEditPhoto("")}>Quitar</Button> : null}
              </div>
            </div>
            <Button className="h-11 rounded-xl" disabled={updateItem.isPending || photoUploading || editName.trim().length < 2} onClick={() => void saveEdit()}>
              {updateItem.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
            <p className="text-xs text-muted-foreground">El código {item.assetCode} no cambia aunque cambies la categoría, para que las etiquetas impresas sigan valiendo.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR de {item.assetCode}</DialogTitle>
            <DialogDescription>Al escanearlo se abre esta ficha.</DialogDescription>
          </DialogHeader>
          {qrImage ? <img src={qrImage} alt={`QR ${item.assetCode}`} className="mx-auto w-64 rounded-xl bg-white p-2" /> : <Package className="mx-auto h-10 w-10 animate-pulse text-muted-foreground" />}
          <p className="break-all text-center text-xs text-muted-foreground">{assetPublicUrl(item.assetCode)}</p>
          {qrImage ? (
            <a href={qrImage} download={`qr-${item.assetCode}.png`}>
              <Button variant="outline" className="w-full rounded-xl"><Download className="mr-2 h-4 w-4" />Descargar imagen</Button>
            </a>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará del inventario junto con su historial de préstamos y movimientos. Su etiqueta NFC quedará libre. Esta acción no se puede deshacer.
              {activeLoan ? " Ahora mismo está prestado: registra antes la devolución." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteItem.isPending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteItem.isPending || Boolean(activeLoan)} onClick={() => void doDelete()}>
              <Trash2 className="mr-2 h-4 w-4" />{deleteItem.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
