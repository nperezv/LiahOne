import { useMemo, useRef, useState, type PointerEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateMember,
  useDeleteMember,
  useMembers,
  useOrganizations,
  useUpdateMember,
} from "@/hooks/use-api";
import { Pencil, Phone, Search, Send, Trash2, Users } from "lucide-react";

const memberSchema = z.object({
  nameSurename: z.string().min(1, "El nombre es requerido"),
  sex: z.string().min(1, "El sexo es requerido"),
  birthday: z.string().min(1, "La fecha de nacimiento es requerida"),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
});

type MemberFormValues = z.infer<typeof memberSchema>;

const formatDateForInput = (value?: string | Date | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function DirectoryPage() {
  const [, setLocation] = useLocation();
  const { data: members = [], isLoading } = useMembers();
  const { data: organizations = [] } = useOrganizations();
  const createMemberMutation = useCreateMember();
  const updateMemberMutation = useUpdateMember();
  const deleteMemberMutation = useDeleteMember();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [currentRevealWidth, setCurrentRevealWidth] = useState(120);
  const [sheetMember, setSheetMember] = useState<any>(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pointerStartX = useRef(0);
  const pointerDragging = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const lastLongPressAt = useRef(0);
  const swipeStartOffset = useRef(0);
  const cardWidthRef = useRef(0);
  const maxRevealRef = useRef(120);
  const rafRef = useRef<number | null>(null);
  const pendingOffset = useRef(0);
  const actionReveal = 120;
  const sheetStartY = useRef(0);
  const sheetDragging = useRef(false);
  const sheetCloseTimer = useRef<number | null>(null);

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      nameSurename: "",
      sex: "",
      birthday: "",
      phone: "",
      email: "",
      organizationId: "none",
    },
  });

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => {
      const haystack = [
        member.nameSurename,
        member.phone ?? "",
        member.email ?? "",
        member.organizationName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [members, query]);

  const formatAge = (birthday: string) => {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age;
  };

  const buildWhatsappLink = (phone?: string | null) => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  };

  const handleOpenCreate = () => {
    setEditingMember(null);
    form.reset({
      nameSurename: "",
      sex: "",
      birthday: "",
      phone: "",
      email: "",
      organizationId: "none",
    });
    setIsDialogOpen(true);
  };

  const handleEditMember = (member: any) => {
    setEditingMember(member);
    form.reset({
      nameSurename: member.nameSurename,
      sex: member.sex,
      birthday: formatDateForInput(member.birthday),
      phone: member.phone ?? "",
      email: member.email ?? "",
      organizationId: member.organizationId ?? "none",
    });
    setIsDialogOpen(true);
  };

  const handleSubmitMember = (data: MemberFormValues) => {
    const payload = {
      ...data,
      birthday: new Date(data.birthday).toISOString(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      organizationId: data.organizationId === "none" ? null : data.organizationId || null,
    };

    if (editingMember) {
      updateMemberMutation.mutate(
        { id: editingMember.id, payload },
        {
          onSuccess: () => {
            setIsDialogOpen(false);
            setEditingMember(null);
            form.reset();
          },
        }
      );
    } else {
      createMemberMutation.mutate(payload, {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
        },
      });
    }
  };

  const handleRequestDelete = (member: any) => {
    setDeleteCandidate(member);
    setDeleteConfirmText("");
  };

  const handleConfirmDelete = () => {
    if (!deleteCandidate) return;
    deleteMemberMutation.mutate(deleteCandidate.id, {
      onSuccess: () => {
        setDeleteCandidate(null);
        setDeleteConfirmText("");
      },
    });
  };

  const resetSwipe = () => {
    setSwipeOffset(0);
    setActiveSwipeId(null);
    setCurrentRevealWidth(actionReveal);
    swipeStartOffset.current = 0;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const handleCopyMember = (member: any) => {
    const phone = member.phone?.trim();
    const text = phone ? `${member.nameSurename} — ${phone}` : member.nameSurename;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    toast({ title: "Copiado al portapapeles", duration: 1800 });
  };

  const handleOpenSheet = (member: any) => {
    resetSwipe();
    setSheetMember(member);
    setSheetOffset(0);
    if (sheetCloseTimer.current) {
      window.clearTimeout(sheetCloseTimer.current);
      sheetCloseTimer.current = null;
    }
    requestAnimationFrame(() => setSheetOpen(true));
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    if (sheetCloseTimer.current) {
      window.clearTimeout(sheetCloseTimer.current);
    }
    sheetCloseTimer.current = window.setTimeout(() => {
      setSheetMember(null);
      setSheetOffset(0);
    }, 280);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, memberId: string, member: any) => {
    pointerStartX.current = event.clientX;
    pointerDragging.current = true;
    longPressTriggered.current = false;
    cardWidthRef.current = event.currentTarget.getBoundingClientRect().width;
    const nextMaxReveal = cardWidthRef.current * 0.35;
    maxRevealRef.current = Math.max(0, nextMaxReveal);
    setCurrentRevealWidth(maxRevealRef.current);
    if (memberId !== activeSwipeId) {
      setSwipeOffset(0);
    }
    setActiveSwipeId(memberId);
    swipeStartOffset.current = memberId === activeSwipeId ? swipeOffset : 0;
    pendingOffset.current = swipeStartOffset.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
    }
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      lastLongPressAt.current = Date.now();
      resetSwipe();
      pointerDragging.current = false;
      handleCopyMember(member);
    }, 500);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointerDragging.current || longPressTriggered.current) return;
    const delta = event.clientX - pointerStartX.current;
    if (Math.abs(delta) > 8 && longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const swipeDistance = swipeStartOffset.current + delta;
    const maxTranslate = Math.min(Math.abs(swipeDistance), maxRevealRef.current);
    const nextOffset = Math.sign(swipeDistance || 1) * maxTranslate;
    pendingOffset.current = nextOffset;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        setSwipeOffset(pendingOffset.current);
        rafRef.current = null;
      });
    }
  };

  const handlePointerEnd = (event?: PointerEvent<HTMLDivElement>) => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (!pointerDragging.current) return;
    pointerDragging.current = false;
    if (event) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (Math.abs(swipeOffset) < 60) {
      resetSwipe();
      return;
    }
    const maxSnap = maxRevealRef.current;
    const snapped = swipeOffset > 0 ? maxSnap : -maxSnap;
    setSwipeOffset(snapped);
  };

  const handleSheetPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    sheetStartY.current = event.clientY;
    sheetDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSheetPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!sheetDragging.current) return;
    const delta = event.clientY - sheetStartY.current;
    if (delta < 0) {
      setSheetOffset(0);
      return;
    }
    setSheetOffset(Math.min(delta, 220));
  };

  const handleSheetPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!sheetDragging.current) return;
    sheetDragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (sheetOffset > 90) {
      handleCloseSheet();
      return;
    }
    setSheetOffset(0);
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Directorio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los miembros del barrio y sus datos de contacto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLocation("/birthdays")}>
            Ver cumpleaños
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreate}>Agregar miembro</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingMember ? "Editar miembro" : "Agregar miembro"}</DialogTitle>
                <DialogDescription>
                  {editingMember
                    ? "Actualiza los datos del miembro del barrio."
                    : "Registra un nuevo miembro del barrio en el directorio."}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmitMember)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="nameSurename"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre y Apellido</FormLabel>
                        <FormControl>
                          <Input placeholder="María López" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="sex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sexo</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="masculino">Masculino</SelectItem>
                              <SelectItem value="femenino">Femenino</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="birthday"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de nacimiento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono (opcional)</FormLabel>
                          <FormControl>
                            <Input placeholder="+56 9 1111 2222" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (opcional)</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="correo@ejemplo.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                      name="organizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organización (opcional)</FormLabel>
                        <Select value={field.value || "none"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona una organización" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Sin organización</SelectItem>
                            {organizations.map((org: any) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createMemberMutation.isPending || updateMemberMutation.isPending}>
                      {editingMember ? "Guardar cambios" : "Agregar miembro"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-0 bg-transparent text-white shadow-none">
        <CardHeader className="px-0">
          <CardTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5 text-[#0A84FF]" />
            Miembros del barrio
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4 px-0 text-white"
          style={{ fontFamily: "system-ui, -apple-system" }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, teléfono o correo"
                className="border-white/10 bg-[#151820] pl-9 text-white placeholder:text-[#9AA0A6]"
              />
            </div>
            <Badge
              variant="outline"
              className="self-start border-white/10 text-[#9AA0A6] sm:self-auto"
            >
              {filteredMembers.length} miembros
            </Badge>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-[14px] border border-white/10 bg-[#151820] p-3"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-32" />
                </div>
              ))}
            </div>
          ) : filteredMembers.length > 0 ? (
            <div className="space-y-3">
              {filteredMembers.map((member) => {
                const whatsappLink = buildWhatsappLink(member.phone);
                const isActive = activeSwipeId === member.id;
                const translateX = isActive ? swipeOffset : 0;
                const isRightSwipe = isActive && swipeOffset > 6;
                const isLeftSwipe = isActive && swipeOffset < -6;
                const initials = member.nameSurename?.charAt(0)?.toUpperCase() || "?";
                const hasPhone = Boolean(member.phone);
                const contactDisabled = !hasPhone;
                const actionWidth = isActive ? currentRevealWidth : actionReveal;
                return (
                  <div
                    key={member.id}
                    className="relative overflow-hidden rounded-[14px] border border-white/10 bg-[#151820]"
                  >
                    <div
                      className={`absolute inset-0 flex items-center justify-start rounded-[14px] text-white transition-opacity duration-150 ${
                        isRightSwipe ? "opacity-100" : "pointer-events-none opacity-0"
                      } ${contactDisabled ? "bg-[#2c2c2e]" : "bg-gradient-to-r from-[#1f3b2d] to-[#34C759]"}`}
                    >
                      <div className="grid h-full grid-cols-2" style={{ width: actionWidth }}>
                        {hasPhone ? (
                          <a
                            href={`tel:${member.phone}`}
                            className="flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium"
                            onClick={resetSwipe}
                          >
                            <Phone className="h-5 w-5" />
                            Llamar
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium opacity-40 grayscale pointer-events-none cursor-default"
                          >
                            <Phone className="h-5 w-5" />
                            Llamar
                          </button>
                        )}
                        {hasPhone ? (
                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium"
                            onClick={resetSwipe}
                          >
                            <Send className="h-5 w-5" />
                            WhatsApp
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium opacity-40 grayscale pointer-events-none cursor-default"
                          >
                            <Send className="h-5 w-5" />
                            WhatsApp
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      className={`absolute inset-0 flex items-center justify-end rounded-[14px] bg-[#2c2c2e] text-white transition-opacity duration-150 ${
                        isLeftSwipe ? "opacity-100" : "pointer-events-none opacity-0"
                      }`}
                    >
                      <div className="grid h-full grid-cols-2" style={{ width: actionWidth }}>
                        <button
                          type="button"
                          className="flex h-full flex-col items-center justify-center gap-1 bg-[#2c2c2e] text-[11px] font-medium"
                          onClick={() => {
                            resetSwipe();
                            handleEditMember(member);
                          }}
                        >
                          <Pencil className="h-5 w-5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="flex h-full flex-col items-center justify-center gap-1 bg-[#FF453A] text-[11px] font-medium"
                          onClick={() => {
                            resetSwipe();
                            handleRequestDelete(member);
                          }}
                        >
                          <Trash2 className="h-5 w-5" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      className={`relative z-10 flex min-h-[68px] w-full items-center gap-3 bg-[#151820] px-4 will-change-transform ${
                        isActive && pointerDragging.current ? "transition-none" : ""
                      }`}
                      style={{
                        transform: `translateX(${translateX}px)`,
                        touchAction: "pan-y",
                        transition: pointerDragging.current
                          ? "none"
                          : "transform 280ms cubic-bezier(0.22,1,0.36,1)",
                      }}
                      onClick={() => {
                        if (Date.now() - lastLongPressAt.current < 800) return;
                        if (isActive && (isLeftSwipe || isRightSwipe)) {
                          resetSwipe();
                          return;
                        }
                        handleOpenSheet(member);
                      }}
                      onPointerDown={(event) => handlePointerDown(event, member.id, member)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerEnd}
                      onPointerCancel={handlePointerEnd}
                      onPointerLeave={handlePointerEnd}
                      onPointerCapture={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B0B0F] text-sm font-semibold text-white">
                        {initials}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center px-1 text-left">
                        <p className="text-left text-sm font-semibold text-white">
                          {member.nameSurename}
                        </p>
                        <p className="text-left text-xs text-[#9AA0A6]">
                          {member.organizationName ?? "Sin organización"} · {formatAge(member.birthday)} años
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[14px] border border-dashed border-white/10 bg-[#151820] p-6 text-sm text-[#9AA0A6]">
              No hay miembros para mostrar con ese filtro.
            </div>
          )}
        </CardContent>
      </Card>

      {sheetMember && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            style={{
              opacity: sheetOpen ? 1 : 0,
              transition: "opacity 280ms cubic-bezier(0.22,1,0.36,1)",
            }}
            onClick={handleCloseSheet}
          />
          <div
            className="relative w-full max-w-2xl rounded-t-[20px] border border-white/10 bg-[#151820] px-6 pb-8 pt-4 text-white shadow-2xl"
            style={{
              transform: `translateY(${sheetOpen ? sheetOffset : 32}px)`,
              opacity: sheetOpen ? 1 : 0,
              transition: sheetDragging.current
                ? "none"
                : "transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 280ms cubic-bezier(0.22,1,0.36,1)",
            }}
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerEnd}
            onPointerCancel={handleSheetPointerEnd}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#9AA0A6]">Miembro</p>
                <p className="mt-1 text-lg font-semibold text-white">{sheetMember.nameSurename}</p>
              </div>
              <Button
                className="w-full bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90"
                onClick={() => {
                  setLocation(`/interviews?memberId=${sheetMember.id}`);
                  handleCloseSheet();
                }}
              >
                Agendar entrevista
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={handleOpenCreate}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[#0A84FF] text-2xl text-white shadow-lg"
      >
        +
      </Button>

      <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por eliminar a <strong>{deleteCandidate?.nameSurename}</strong>. Esta acción no se puede
              deshacer. Escribe <strong>ELIMINAR</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-3">
            <Input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder="Escribe ELIMINAR"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteCandidate(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText.trim().toUpperCase() !== "ELIMINAR"}
              onClick={handleConfirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
