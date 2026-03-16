import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/auth-tokens";
import { useAuth } from "@/lib/auth.tsx";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  User2,
  Pencil,
  Plus,
  Search,
  CalendarDays,
  Users,
  CheckCircle2,
  Circle,
  X,
  ChevronRight,
  Check,
  TrendingUp,
  CalendarCheck,
  UserCheck,
  Waves,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

type PersonaTipo = "nuevo" | "regresando" | "enseñando";

interface Persona {
  id: string;
  nombre: string;
  fotoUrl?: string | null;
  tipo: PersonaTipo;
  fechaPrimerContacto: string;
  fechaBautismo?: string | null;
  fechaEntrevistaBautismal?: string | null;
  fechaVisitaMisioneros?: string | null;
  fechaConfirmacion?: string | null;
  fechaIngreso: string;
  proximoEvento?: string | null;
  proximoEventoDescripcion?: string | null;
  notas?: string | null;
  phone?: string | null;
  email?: string | null;
  isArchived: boolean;
  asistencia: { fecha_domingo: string; asistio: boolean }[];
  amigosCount: number;
}

interface Principio {
  id: number;
  nombre: string;
  orden: number;
  maxSesiones: number;
}

interface Sesion {
  personaId: string;
  principioId: number;
  sesionNum: number;
  miembroPresente: boolean;
  fecha?: string | null;
}

interface Amigo {
  id: string;
  personaId: string;
  nombre: string;
  esMiembro: boolean;
}

interface CompromisoBautismo {
  id: string;
  personaId: string;
  commitmentKey: string;
  nombre: string;
  orden: number;
  fechaInvitado?: string | null;
  fechaCumplido?: string | null;
}

interface Sacerdocio {
  personaId: string;
  oficio?: string | null;
  fechaOrdenacion?: string | null;
  fechaCalifica?: string | null;
  estado: string;
}

interface TemploOrdinanzas {
  personaId: string;
  nombreFamiliarPreparado: boolean;
  bautismoAntepasados: boolean;
  investido: boolean;
  selladoPadres: boolean;
  selladoConyuge: boolean;
  fechaCalificaInvestidura?: string | null;
}

interface SelfReliance {
  personaId: string;
  resilienciaEmocional: boolean;
  finanzasPersonales: boolean;
  negocio: boolean;
  educacionEmpleo: boolean;
  buscarEmpleo: boolean;
}

interface Llamamiento {
  personaId: string;
  nombre?: string | null;
}

interface Ministracion {
  personaId: string;
  descripcion?: string | null;
}

interface OtroCompromiso {
  personaId: string;
  conocerObispo: boolean;
  historiaFamiliar: boolean;
}

// ============================================================
// Helpers
// ============================================================

/** Sundays of the current calendar month */
function getCurrentMonthSundays(): Date[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const sundays: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month) {
    sundays.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return sundays;
}


/** Last N Sundays (including today if today is Sunday), oldest -> newest */
function getLastSundays(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentOrLastSunday = new Date(today);
  while (currentOrLastSunday.getDay() !== 0) {
    currentOrLastSunday.setDate(currentOrLastSunday.getDate() - 1);
  }

  const sundays: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(currentOrLastSunday);
    d.setDate(currentOrLastSunday.getDate() - i * 7);
    sundays.push(d);
  }

  return sundays;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatShortDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("es", { month: "short" }).replace(".", "");
  return `${day} ${month}.`;
}

/** "Miembro por X días / meses / X año(s) Y mes(es)" from confirmation date */
function formatMemberTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const start = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 30) return `Miembro por ${days} día${days !== 1 ? "s" : ""}`;
  const totalMonths = Math.floor(days / 30.44);
  if (totalMonths < 12) return `Miembro por ${totalMonths} mes${totalMonths !== 1 ? "es" : ""}`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (months === 0) return `Miembro por ${years} año${years !== 1 ? "s" : ""}`;
  return `Miembro por ${years} año${years !== 1 ? "s" : ""} y ${months} mes${months !== 1 ? "es" : ""}`;
}

/** Months since confirmation date */
function monthsSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr + "T12:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

// ============================================================
// API Hooks
// ============================================================

function missionFetch(url: string) {
  const token = getAccessToken();
  return fetch(url, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => r.json());
}

function usePersonas(tipo: PersonaTipo) {
  return useQuery<Persona[]>({
    queryKey: ["/api/mission/personas", tipo],
    queryFn: () => missionFetch(`/api/mission/personas?tipo=${encodeURIComponent(tipo)}`),
  });
}

function usePrincipios() {
  return useQuery<Principio[]>({
    queryKey: ["/api/mission/principios"],
  });
}

function usePersonaAmigos(id: string | null) {
  return useQuery<Amigo[]>({
    queryKey: ["/api/mission/personas", id, "amigos"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/amigos`),
    enabled: !!id,
  });
}

function usePersonaAsistencia(id: string | null) {
  return useQuery<{ fecha_domingo: string; asistio: boolean }[]>({
    queryKey: ["/api/mission/personas", id, "asistencia"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/asistencia`),
    enabled: !!id,
  });
}

function usePersonaSesiones(id: string | null) {
  return useQuery<Sesion[]>({
    queryKey: ["/api/mission/personas", id, "sesiones"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/sesiones`),
    enabled: !!id,
  });
}

function usePersonaCompromisosBautismo(id: string | null) {
  return useQuery<CompromisoBautismo[]>({
    queryKey: ["/api/mission/personas", id, "compromisos-bautismo"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/compromisos-bautismo`),
    enabled: !!id,
  });
}

function usePersonaSacerdocio(id: string | null) {
  return useQuery<Sacerdocio>({
    queryKey: ["/api/mission/personas", id, "sacerdocio"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/sacerdocio`),
    enabled: !!id,
  });
}

function usePersonaTemplo(id: string | null) {
  return useQuery<TemploOrdinanzas>({
    queryKey: ["/api/mission/personas", id, "templo"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/templo`),
    enabled: !!id,
  });
}

function usePersonaSelfReliance(id: string | null) {
  return useQuery<SelfReliance>({
    queryKey: ["/api/mission/personas", id, "self-reliance"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/self-reliance`),
    enabled: !!id,
  });
}

function usePersonaLlamamiento(id: string | null) {
  return useQuery<Llamamiento>({
    queryKey: ["/api/mission/personas", id, "llamamiento"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/llamamiento`),
    enabled: !!id,
  });
}

function usePersonaMinistracion(id: string | null) {
  return useQuery<Ministracion>({
    queryKey: ["/api/mission/personas", id, "ministracion"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/ministracion`),
    enabled: !!id,
  });
}

function usePersonaOtrosCompromisos(id: string | null) {
  return useQuery<OtroCompromiso>({
    queryKey: ["/api/mission/personas", id, "otros-compromisos"],
    queryFn: () => missionFetch(`/api/mission/personas/${id}/otros-compromisos`),
    enabled: !!id,
  });
}

// ============================================================
// AttendanceGrid component
// ============================================================

function AttendanceGrid({
  asistencia,
  sundays,
  personaId,
  editable = false,
}: {
  asistencia: { fecha_domingo: string; asistio: boolean }[];
  sundays: Date[];
  personaId?: string;
  editable?: boolean;
}) {
  const qc = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: async ({ fecha, asistio }: { fecha: string; asistio: boolean }) => {
      if (!personaId) return;
      if (!asistio) {
        // delete
        await apiRequest("DELETE", `/api/mission/personas/${personaId}/asistencia/${fecha}`);
      } else {
        await apiRequest("POST", `/api/mission/personas/${personaId}/asistencia`, {
          fecha_domingo: fecha,
          asistio: true,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas"] });
      if (personaId) {
        qc.invalidateQueries({ queryKey: ["/api/mission/personas", personaId, "asistencia"] });
      }
    },
  });

  const attendedSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of asistencia) {
      if (a.asistio) s.add(a.fecha_domingo);
    }
    return s;
  }, [asistencia]);

  return (
    <div className="flex gap-1 items-center">
      {sundays.map((s) => {
        const iso = toISODate(s);
        const attended = attendedSet.has(iso);
        return (
          <div key={iso} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground leading-none">
              {formatShortDate(s)}
            </span>
            {editable ? (
              <button
                type="button"
                onClick={() => toggleMutation.mutate({ fecha: iso, asistio: !attended })}
                className="focus:outline-none"
                title={attended ? "Marcar ausente" : "Marcar presente"}
              >
                {attended ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-primary/70" />
                )}
              </button>
            ) : (
              <span title={iso}>
                {attended ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-primary/70" />
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// AddPersonaDialog — member picker (nuevo / regresando)
// ============================================================

interface DirectoryMember {
  id: string;
  nameSurename: string;
  phone?: string | null;
  email?: string | null;
  organizationName?: string | null;
}

function AddFromDirectoryDialog({
  open,
  onOpenChange,
  tipo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: "nuevo" | "regresando";
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DirectoryMember | null>(null);
  const [fechaPrimerContacto, setFechaPrimerContacto] = useState(
    new Date().toISOString().split("T")[0]
  );

  const membersQuery = useQuery<DirectoryMember[]>({ queryKey: ["/api/members"] });

  const filtered = useMemo(() => {
    const members = membersQuery.data ?? [];
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((m) => m.nameSurename.toLowerCase().includes(q));
  }, [membersQuery.data, search]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/mission/personas", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
      toast({ title: "Persona agregada al seguimiento" });
      setSelected(null);
      setSearch("");
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!selected) return;
    createMutation.mutate({
      nombre: selected.nameSurename,
      tipo,
      fechaPrimerContacto,
      phone: selected.phone ?? null,
      email: selected.email ?? null,
      memberId: selected.id,
    });
  };

  const getInitials = (name: string) =>
    name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelected(null); setSearch(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tipo === "nuevo" ? "Agregar miembro nuevo" : "Agregar miembro que regresa"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar en el directorio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          {/* Member list */}
          <div className="max-h-56 overflow-y-auto space-y-1 rounded-md border p-1">
            {membersQuery.isLoading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Cargando directorio...</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m)}
                  className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    selected?.id === m.id ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
                    {getInitials(m.nameSurename)}
                  </div>
                  <div>
                    <p className="font-medium leading-tight">{m.nameSurename}</p>
                    {m.organizationName && (
                      <p className="text-xs text-muted-foreground">{m.organizationName}</p>
                    )}
                  </div>
                  {selected?.id === m.id && (
                    <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Date */}
          {selected && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Fecha de {tipo === "nuevo" ? "bautismo / primer contacto" : "inicio de seguimiento"}
              </Label>
              <Input
                type="date"
                value={fechaPrimerContacto}
                onChange={(e) => setFechaPrimerContacto(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={!selected || createMutation.isPending}>
            {createMutation.isPending ? "Agregando..." : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// AddPersonaDialog — manual entry (enseñando)
// ============================================================

function AddEnsenandoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fechaPrimerContacto, setFechaPrimerContacto] = useState(
    new Date().toISOString().split("T")[0]
  );

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/mission/personas", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", "enseñando"] });
      toast({ title: "Persona agregada al seguimiento" });
      setNombre(""); setPhone(""); setEmail("");
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    createMutation.mutate({
      nombre: nombre.trim(),
      tipo: "enseñando",
      fechaPrimerContacto,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar persona a enseñar</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Nombre completo <span className="text-destructive">*</span></Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" autoFocus />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" type="tel" />
          </div>
          <div>
            <Label>Correo electrónico</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" type="email" />
          </div>
          <div>
            <Label>Primera enseñanza</Label>
            <Input type="date" value={fechaPrimerContacto} onChange={(e) => setFechaPrimerContacto(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending || !nombre.trim()}>
              {createMutation.isPending ? "Guardando..." : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// AddPersonaDialog — router
// ============================================================

function AddPersonaDialog({
  open,
  onOpenChange,
  tipo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: PersonaTipo;
}) {
  if (tipo === "enseñando") {
    return <AddEnsenandoDialog open={open} onOpenChange={onOpenChange} />;
  }
  return <AddFromDirectoryDialog open={open} onOpenChange={onOpenChange} tipo={tipo} />;
}

// ============================================================
// BooleanRow helper
// ============================================================

function BooleanRow({
  label,
  value,
  onToggle,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onToggle} disabled={disabled} />
    </div>
  );
}

function LessonStatusIcon({
  present,
  exists,
}: {
  present: boolean;
  exists: boolean;
}) {
  if (present) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <User2 className="h-3 w-3" />
      </span>
    );
  }

  if (exists) {
    return <span className="block h-5 w-5 rounded-full bg-primary/80" />;
  }

  return <span className="block h-5 w-5 rounded-full border-2 border-white/55 bg-transparent" />;
}

function BaptismDateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary/70" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.42519 8.92249C6.84619 8.92249 5.56219 7.59449 5.56219 5.96149C5.56219 4.32849 6.84619 3.00049 8.42519 3.00049C10.0042 3.00049 11.2882 4.32849 11.2882 5.96149C11.2882 7.59449 10.0042 8.92249 8.42519 8.92249ZM16.516 21.6798C15.4003 21.6798 14.7854 21.2118 14.2418 20.7982L14.24 20.7968L14.2372 20.7947C13.7265 20.4057 13.3223 20.0978 12.406 20.0978C11.933 20.0978 11.628 20.3258 11.167 20.6708L11.1662 20.6714C10.5653 21.1203 9.81641 21.6798 8.53699 21.6798C7.45287 21.6798 6.7681 21.1417 6.21734 20.7088L6.21599 20.7078C5.75899 20.3468 5.42999 20.0878 4.93199 20.0878C3.89687 20.0878 3.48493 20.5201 3.47036 20.5354L3.46999 20.5358C3.33299 20.7128 3.11999 20.8178 2.88799 20.8178C2.72299 20.8178 2.56699 20.7638 2.43499 20.6628C2.27899 20.5418 2.17799 20.3668 2.15399 20.1708C2.12799 19.9738 2.18099 19.7798 2.30299 19.6228C2.38299 19.5188 3.14399 18.6058 4.93199 18.6058C5.94299 18.6058 6.57399 19.1018 7.12999 19.5398C7.61499 19.9228 7.96399 20.1978 8.53699 20.1978C9.32262 20.1978 9.74459 19.8831 10.2792 19.4843L10.28 19.4838C10.825 19.0768 11.441 18.6168 12.406 18.6168C13.823 18.6168 14.552 19.1708 15.137 19.6168C15.596 19.9668 15.899 20.1978 16.516 20.1978C17.2309 20.1978 17.549 19.9318 17.9889 19.5639L17.989 19.5638L17.9893 19.5635C18.4663 19.1635 19.1183 18.6168 20.295 18.6168C21.626 18.6168 22.24 19.1258 22.732 19.5338C22.884 19.6608 22.979 19.8398 22.996 20.0368C23.015 20.2348 22.955 20.4268 22.828 20.5788C22.687 20.7478 22.48 20.8458 22.258 20.8458C22.086 20.8458 21.918 20.7848 21.786 20.6748L21.7847 20.6737C21.3814 20.3393 21.0901 20.0978 20.295 20.0978C19.658 20.0978 19.372 20.3378 18.942 20.6998L18.9412 20.7004C18.4193 21.1373 17.7714 21.6798 16.516 21.6798ZM13.1062 5.96149C13.1062 7.59449 14.3902 8.92249 15.9692 8.92249C17.5482 8.92249 18.8332 7.59449 18.8332 5.96149C18.8332 4.32849 17.5482 3.00049 15.9692 3.00049C14.3902 3.00049 13.1062 4.32849 13.1062 5.96149ZM8.53749 18.6925C7.96349 18.6925 7.61449 18.4175 7.13249 18.0365C6.57349 17.5965 5.94249 17.1005 4.93249 17.1005C4.86652 17.1005 4.80355 17.1025 4.74057 17.1045L4.74049 17.1045L4.75949 13.3545C4.75949 13.3545 1.00049 12.6665 1.00049 9.49449L1.17449 4.52449C1.17449 4.02049 1.50649 3.61049 1.91649 3.61049C2.32549 3.61049 2.65949 4.02049 2.65949 4.52449L2.82749 8.85649C2.91649 9.92149 3.89649 10.3905 4.61449 10.3905L10.9745 10.3885C10.9745 10.3885 10.3335 10.7295 10.1005 11.3125C9.93749 11.7205 9.86949 12.1505 9.86949 12.5795V18.2735C9.48749 18.5265 9.10549 18.6925 8.53749 18.6925ZM15.137 18.1115C15.596 18.4615 15.899 18.6925 16.516 18.6925C17.2302 18.6925 17.5474 18.4278 17.9867 18.0612L17.99 18.0585C18.466 17.6585 19.12 17.1105 20.295 17.1105C20.403 17.1105 20.505 17.1145 20.603 17.1205V12.5795C20.603 11.3715 19.62 10.3885 18.412 10.3885H13.527C12.319 10.3885 11.336 11.3715 11.336 12.5795V17.3255C11.682 17.1815 12.035 17.1105 12.406 17.1105C13.823 17.1105 14.552 17.6655 15.137 18.1115Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ============================================================
// PersonaDetailSheet
// ============================================================

function PersonaDetailSheet({
  persona,
  open,
  onOpenChange,
  tipo,
}: {
  persona: Persona | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: PersonaTipo;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const id = persona?.id ?? null;

  const amigosQuery = usePersonaAmigos(id);
  const asistenciaQuery = usePersonaAsistencia(id);
  const sesionesQuery = usePersonaSesiones(id);
  const principiosQuery = usePrincipios();
  const compBautismoQuery = usePersonaCompromisosBautismo(id);
  const sacerdocioQuery = usePersonaSacerdocio(tipo !== "enseñando" ? id : null);
  const temploQuery = usePersonaTemplo(tipo !== "enseñando" ? id : null);
  const selfRelianceQuery = usePersonaSelfReliance(tipo !== "enseñando" ? id : null);
  const llamamientoQuery = usePersonaLlamamiento(tipo !== "enseñando" ? id : null);
  const ministracionQuery = usePersonaMinistracion(tipo !== "enseñando" ? id : null);
  const otrosCompromisosQuery = usePersonaOtrosCompromisos(tipo === "enseñando" ? id : null);

  const sundays = useMemo(() => getCurrentMonthSundays(), []);

  // Amigo add state
  const [selectedFriend, setSelectedFriend] = useState<DirectoryMember | null>(null);
  const [friendSearch, setFriendSearch] = useState("");

  const membersQuery = useQuery<DirectoryMember[]>({
    queryKey: ["/api/members"],
    enabled: open,
  });

  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return [] as DirectoryMember[];
    return (membersQuery.data ?? [])
      .filter((m) => m.nameSurename.toLowerCase().includes(q))
      .slice(0, 12);
  }, [friendSearch, membersQuery.data]);

  const addAmigoMutation = useMutation({
    mutationFn: (data: { nombre: string; es_miembro: boolean }) =>
      apiRequest("POST", `/api/mission/personas/${id}/amigos`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "amigos"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
      setSelectedFriend(null);
      setFriendSearch("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAmigoMutation = useMutation({
    mutationFn: (amigoId: string) =>
      apiRequest("DELETE", `/api/mission/amigos/${amigoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "amigos"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
    },
  });

  // Global edit mode (reset when persona changes or sheet closes)
  const [editMode, setEditMode] = useState(false);
  React.useEffect(() => { setEditMode(false); }, [id, open]);

  // Text field local values — synced from server data
  const [llamamientoVal, setLlamamientoVal] = useState("");
  const [ministracionVal, setMinistracionVal] = useState("");
  const [fechaBautismoVal, setFechaBautismoVal] = useState("");
  const [fechaEntrevistaVal, setFechaEntrevistaVal] = useState("");
  const [fechaVisitaVal, setFechaVisitaVal] = useState("");
  const [proximoEventoVal, setProximoEventoVal] = useState("");
  const [proximoEventoDescVal, setProximoEventoDescVal] = useState("");

  const fechaBautismoMutation = useMutation({
    mutationFn: (fecha: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}`, { fechaBautismo: fecha }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const fechaEntrevistaMutation = useMutation({
    mutationFn: (fecha: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}`, { fechaEntrevistaBautismal: fecha }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const fechaVisitaMutation = useMutation({
    mutationFn: (fecha: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}`, { fechaVisitaMisioneros: fecha }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const proximoEventoMutation = useMutation({
    mutationFn: (data: { proximoEvento?: string | null; proximoEventoDescripcion?: string | null }) =>
      apiRequest("PUT", `/api/mission/personas/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleSesionMutation = useMutation({
    mutationFn: (data: {
      principio_id: number;
      sesion_num: number;
      miembro_presente?: boolean;
      action: "set" | "delete";
    }) => {
      if (data.action === "delete") {
        return apiRequest(
          "DELETE",
          `/api/mission/personas/${id}/sesiones/${data.principio_id}/${data.sesion_num}`
        );
      }
      return apiRequest("PUT", `/api/mission/personas/${id}/sesiones`, {
        principio_id: data.principio_id,
        sesion_num: data.sesion_num,
        miembro_presente: !!data.miembro_presente,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "sesiones"] });
    },
  });

  // Sacerdocio
  const sacerdocioMutation = useMutation({
    mutationFn: (data: Partial<Sacerdocio>) =>
      apiRequest("PUT", `/api/mission/personas/${id}/sacerdocio`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "sacerdocio"] });
      toast({ title: "Guardado" });
    },
  });

  // Templo
  const temploMutation = useMutation({
    mutationFn: (data: Partial<TemploOrdinanzas>) =>
      apiRequest("PUT", `/api/mission/personas/${id}/templo`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "templo"] });
    },
  });

  // Self-reliance
  const selfRelianceMutation = useMutation({
    mutationFn: (data: Partial<SelfReliance>) =>
      apiRequest("PUT", `/api/mission/personas/${id}/self-reliance`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "self-reliance"] });
    },
  });

  // Derived data — declared before mutations/effects that reference them
  const sacerdocio = sacerdocioQuery.data;
  const templo = temploQuery.data;
  const selfReliance = selfRelianceQuery.data;
  const llamamiento = llamamientoQuery.data;
  const ministracion = ministracionQuery.data;
  const otrosCompromisos = otrosCompromisosQuery.data;
  const principios = principiosQuery.data ?? [];
  const sesiones = sesionesQuery.data ?? [];
  const compromisosBautismo = compBautismoQuery.data ?? [];
  const amigos = amigosQuery.data ?? [];
  const asistencia = asistenciaQuery.data ?? [];

  // Llamamiento
  const llamamientoMutation = useMutation({
    mutationFn: (nombre: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}/llamamiento`, { nombre }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "llamamiento"] });
    },
  });
  React.useEffect(() => {
    setLlamamientoVal(llamamiento?.nombre ?? "");
  }, [llamamiento?.nombre]);

  // Ministración
  const ministracionMutation = useMutation({
    mutationFn: (descripcion: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}/ministracion`, { descripcion }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "ministracion"] });
    },
  });
  React.useEffect(() => {
    setMinistracionVal(ministracion?.descripcion ?? "");
  }, [ministracion?.descripcion]);
  React.useEffect(() => {
    setFechaBautismoVal(persona?.fechaBautismo ?? "");
  }, [persona?.fechaBautismo]);
  React.useEffect(() => {
    setFechaEntrevistaVal(persona?.fechaEntrevistaBautismal ?? "");
  }, [persona?.fechaEntrevistaBautismal]);
  React.useEffect(() => {
    setFechaVisitaVal(persona?.fechaVisitaMisioneros ?? "");
  }, [persona?.fechaVisitaMisioneros]);
  React.useEffect(() => {
    setProximoEventoVal(persona?.proximoEvento ?? "");
  }, [persona?.proximoEvento]);
  React.useEffect(() => {
    setProximoEventoDescVal(persona?.proximoEventoDescripcion ?? "");
  }, [persona?.proximoEventoDescripcion]);

  // Otros compromisos
  const otrosCompromisosMutation = useMutation({
    mutationFn: (data: Partial<OtroCompromiso>) =>
      apiRequest("PUT", `/api/mission/personas/${id}/otros-compromisos`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "otros-compromisos"] });
    },
  });

  // Compromisos bautismo
  const compBautismoMutation = useMutation({
    mutationFn: ({
      key,
      fechaInvitado,
      fechaCumplido,
    }: {
      key: string;
      fechaInvitado?: string | null;
      fechaCumplido?: string | null;
    }) =>
      apiRequest("PUT", `/api/mission/personas/${id}/compromisos-bautismo/${key}`, {
        fecha_invitado: fechaInvitado,
        fecha_cumplido: fechaCumplido,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "compromisos-bautismo"] });
    },
  });

  // Archive persona
  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/mission/personas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
      onOpenChange(false);
      toast({ title: "Persona archivada" });
    },
  });

  const sesionMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of sesiones) {
      m[`${s.principioId}-${s.sesionNum}`] = s.miembroPresente;
    }
    return m;
  }, [sesiones]);

  if (!persona) return null;

  const countSesiones = (principioId: number) =>
    sesiones.filter((s) => s.principioId === principioId).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-4xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex-1 min-w-0">
              {tipo === "enseñando" ? (
                <>
                  <p className="text-2xl sm:text-3xl font-medium text-left">{persona.nombre}</p>
                  <button
                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                    onClick={() => setEditMode((v) => !v)}
                  >
                    {editMode
                      ? <><Check className="h-2.5 w-2.5" />Listo</>
                      : <><TrendingUp className="h-2.5 w-2.5" />Actualizar progreso</>}
                  </button>
                  <div className="mt-1 flex flex-wrap items-start gap-8 text-base text-left">
                    <div className="min-w-[220px]">
                      <p className="font-semibold">Se le enseñó por primera vez</p>
                      <p className="text-muted-foreground">{formatDisplayDate(persona.fechaPrimerContacto)}</p>
                    </div>
                    <div className="min-w-[220px]">
                      <p className="font-semibold inline-flex items-center gap-1">
                        <BaptismDateIcon />Fecha bautismal
                      </p>
                      {editMode ? (
                        <Input
                          type="date"
                          value={fechaBautismoVal}
                          onChange={(e) => {
                            setFechaBautismoVal(e.target.value);
                            fechaBautismoMutation.mutate(e.target.value || null);
                          }}
                          className="h-7 text-sm w-40 mt-1"
                        />
                      ) : (
                        <p className="text-muted-foreground">
                          {persona.fechaBautismo ? formatDisplayDate(persona.fechaBautismo) : "—"}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Próximos eventos — solo los que tienen fecha, o todos en modo edición */}
                  {(() => {
                    const eventos = [
                      {
                        key: "entrevista",
                        label: "Entrevista Bautismal",
                        icon: <UserCheck className="h-3.5 w-3.5" />,
                        fecha: persona.fechaEntrevistaBautismal,
                        editEl: (
                          <Input type="date" value={fechaEntrevistaVal}
                            onChange={(e) => { setFechaEntrevistaVal(e.target.value); fechaEntrevistaMutation.mutate(e.target.value || null); }}
                            className="h-7 text-sm w-40 mt-1" />
                        ),
                      },
                      {
                        key: "visita",
                        label: "Visita de los misioneros",
                        icon: <CalendarCheck className="h-3.5 w-3.5" />,
                        fecha: persona.fechaVisitaMisioneros,
                        editEl: (
                          <Input type="date" value={fechaVisitaVal}
                            onChange={(e) => { setFechaVisitaVal(e.target.value); fechaVisitaMutation.mutate(e.target.value || null); }}
                            className="h-7 text-sm w-40 mt-1" />
                        ),
                      },
                      {
                        key: "bautismo",
                        label: "Servicio Bautismal",
                        icon: <Waves className="h-3.5 w-3.5" />,
                        fecha: persona.fechaBautismo,
                        editEl: null, // solo lectura — se edita desde Fecha bautismal
                      },
                    ];
                    const visibles = editMode ? eventos : eventos.filter((e) => e.fecha);
                    if (visibles.length === 0 && !editMode) return null;
                    return (
                      <div className="mt-3 flex flex-wrap gap-6">
                        {visibles.map((ev) => (
                          <div key={ev.key} className="min-w-[180px]">
                            <p className="font-semibold inline-flex items-center gap-1 text-sm">
                              {ev.icon}{ev.label}
                            </p>
                            {editMode && ev.editEl
                              ? ev.editEl
                              : <p className="text-muted-foreground text-sm">{ev.fecha ? formatDisplayDate(ev.fecha) : "—"}</p>
                            }
                          </div>
                        ))}
                        {/* Evento Otros */}
                        {(editMode || (persona.proximoEvento && persona.proximoEventoDescripcion)) && (
                          <div className="min-w-[180px]">
                            <p className="font-semibold inline-flex items-center gap-1 text-sm">
                              <CalendarDays className="h-3.5 w-3.5" />Otros
                            </p>
                            {editMode ? (
                              <div className="flex flex-col gap-1 mt-1">
                                <Input
                                  placeholder="Descripción del evento"
                                  value={proximoEventoDescVal}
                                  onChange={(e) => setProximoEventoDescVal(e.target.value)}
                                  onBlur={() => proximoEventoMutation.mutate({ proximoEventoDescripcion: proximoEventoDescVal || null })}
                                  className="h-7 text-sm w-48"
                                />
                                <Input
                                  type="date"
                                  value={proximoEventoVal}
                                  onChange={(e) => { setProximoEventoVal(e.target.value); proximoEventoMutation.mutate({ proximoEvento: e.target.value || null }); }}
                                  className="h-7 text-sm w-40"
                                />
                              </div>
                            ) : (
                              <div>
                                <p className="text-muted-foreground text-sm">{persona.proximoEventoDescripcion}</p>
                                <p className="text-muted-foreground text-sm">{persona.proximoEvento ? formatDisplayDate(persona.proximoEvento) : ""}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <SheetTitle className="flex items-center gap-2">
                    <User2 className="h-5 w-5 text-muted-foreground" />
                    {persona.nombre}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {tipo === "nuevo" ? "Nuevo" : "Regresando"}
                    </Badge>
                  </SheetTitle>
                  <p className="text-sm text-muted-foreground">
                    Primer contacto: {formatDisplayDate(persona.fechaPrimerContacto)} ·{" "}
                    {formatMemberTime(persona.fechaPrimerContacto)}
                  </p>
                  <div className="mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => setEditMode((v) => !v)}
                    >
                      {editMode
                        ? <><Check className="h-3 w-3 mr-1" />Listo</>
                        : <><TrendingUp className="h-3 w-3 mr-1" />Actualizar progreso</>}
                    </Button>
                  </div>
                </>
              )}
            </div>
        </SheetHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ─── LEFT COLUMN ─── */}
          <div className="space-y-5">
            {/* Asistencia */}
            <section>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Asistencia
              </h3>
              <AttendanceGrid
                asistencia={asistencia}
                sundays={sundays}
                personaId={id ?? undefined}
                editable={editMode}
              />
            </section>

            {/* Amigos */}
            <section>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Amigos ({amigos.length})
              </h3>
              <div className="space-y-1 mb-2">
                {amigos.map((a) => (
                  <div key={a.id} className="flex items-center justify-between">
                    <span className="text-sm">
                      {a.nombre}
                      {a.esMiembro && (
                        <Badge variant="secondary" className="ml-1 text-xs">
                          miembro
                        </Badge>
                      )}
                    </span>
                    {editMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => deleteAmigoMutation.mutate(a.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {editMode && <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs text-muted-foreground">Agregar amigo (Dentro de la estaca)</Label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar en el directorio..."
                      value={friendSearch}
                      onChange={(e) => {
                        setFriendSearch(e.target.value);
                        setSelectedFriend(null);
                      }}
                      className="h-8 text-sm pl-8"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!selectedFriend}
                    onClick={() => {
                      if (!selectedFriend) return;
                      addAmigoMutation.mutate({
                        nombre: selectedFriend.nameSurename,
                        es_miembro: true,
                      });
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Asignar amigo
                  </Button>
                </div>

                <div className="max-h-40 overflow-y-auto rounded-md border p-1">
                  {!friendSearch.trim() ? null : membersQuery.isLoading ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">Cargando...</p>
                  ) : filteredFriends.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">Sin resultados.</p>
                  ) : (
                    filteredFriends.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${
                          selectedFriend?.id === m.id ? "bg-primary/10" : ""
                        }`}
                        onClick={() => {
                          setSelectedFriend(m);
                          setFriendSearch(m.nameSurename);
                        }}
                      >
                        <span className="font-medium">{m.nameSurename}</span>
                        {selectedFriend?.id === m.id && (
                          <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>}
            </section>

            {/* Sacerdocio (nuevo/regresando only) */}
            {tipo !== "enseñando" && sacerdocio && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Sacerdocio
                </h3>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Oficio</Label>
                    <select
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                      value={sacerdocio.oficio || ""}
                      disabled={!editMode}
                      onChange={(e) =>
                        sacerdocioMutation.mutate({
                          ...sacerdocio,
                          oficio: (e.target.value as any) || null,
                        })
                      }
                    >
                      <option value="">Sin definir</option>
                      <option value="diacono">Diácono</option>
                      <option value="maestro">Maestro</option>
                      <option value="sacerdote">Sacerdote</option>
                      <option value="elder">Élder</option>
                      <option value="sumo_sacerdote">Sumo Sacerdote</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <select
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                      value={sacerdocio.estado || "pendiente"}
                      disabled={!editMode}
                      onChange={(e) =>
                        sacerdocioMutation.mutate({
                          ...sacerdocio,
                          estado: e.target.value as any,
                        })
                      }
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="califica">Califica</option>
                      <option value="ordenado">Ordenado</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Fecha ordenación</Label>
                    <Input
                      type="date"
                      className="h-8 text-sm"
                      value={sacerdocio.fechaOrdenacion || ""}
                      disabled={!editMode}
                      onChange={(e) =>
                        sacerdocioMutation.mutate({
                          ...sacerdocio,
                          fechaOrdenacion: e.target.value || null,
                        })
                      }
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Llamamiento (nuevo/regresando) */}
            {tipo !== "enseñando" && llamamiento !== undefined && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Llamamiento
                </h3>
                {editMode ? (
                  <Input
                    className="h-8 text-sm"
                    value={llamamientoVal}
                    onChange={(e) => setLlamamientoVal(e.target.value)}
                    onBlur={() => llamamientoMutation.mutate(llamamientoVal || null)}
                    placeholder="Nombre del llamamiento"
                  />
                ) : (
                  <span className="text-sm">
                    {llamamiento.nombre || <span className="text-muted-foreground">Sin llamamiento</span>}
                  </span>
                )}
              </section>
            )}

            {/* Ministración (nuevo/regresando) */}
            {tipo !== "enseñando" && ministracion !== undefined && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Ministración
                </h3>
                {editMode ? (
                  <Textarea
                    className="text-sm"
                    value={ministracionVal}
                    onChange={(e) => setMinistracionVal(e.target.value)}
                    onBlur={() => ministracionMutation.mutate(ministracionVal || null)}
                    placeholder="Descripción de ministración"
                    rows={2}
                  />
                ) : (
                  <span className="text-sm">
                    {ministracion.descripcion || (
                      <span className="text-muted-foreground">Sin descripción</span>
                    )}
                  </span>
                )}
              </section>
            )}

            {/* Otros compromisos (enseñando only) */}
            {tipo === "enseñando" && otrosCompromisos && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Otros compromisos
                </h3>
                <div className="space-y-1.5 text-sm">
                  <button
                    type="button"
                    disabled={!editMode}
                    className="flex items-center gap-2 disabled:cursor-default"
                    onClick={() =>
                      otrosCompromisosMutation.mutate({
                        ...otrosCompromisos,
                        conocerObispo: !otrosCompromisos.conocerObispo,
                      })
                    }
                  >
                    {otrosCompromisos.conocerObispo ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-primary/70" />
                    )}
                    <span>Conocer al obispo</span>
                  </button>
                  <button
                    type="button"
                    disabled={!editMode}
                    className="flex items-center gap-2 disabled:cursor-default"
                    onClick={() =>
                      otrosCompromisosMutation.mutate({
                        ...otrosCompromisos,
                        historiaFamiliar: !otrosCompromisos.historiaFamiliar,
                      })
                    }
                  >
                    {otrosCompromisos.historiaFamiliar ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-primary/70" />
                    )}
                    <span>Participar en la historia familiar</span>
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* ─── RIGHT COLUMN ─── */}
          <div className="space-y-5">
            {/* Templo ordinanzas (nuevo/regresando) */}
            {tipo !== "enseñando" && templo && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Ordenanzas del templo
                </h3>
                <BooleanRow
                  label="Nombre familiar preparado"
                  value={templo.nombreFamiliarPreparado}
                  onToggle={(v) => temploMutation.mutate({ ...templo, nombreFamiliarPreparado: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Bautismo por antepasados"
                  value={templo.bautismoAntepasados}
                  onToggle={(v) => temploMutation.mutate({ ...templo, bautismoAntepasados: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Investido"
                  value={templo.investido}
                  onToggle={(v) => temploMutation.mutate({ ...templo, investido: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Sellado a padres"
                  value={templo.selladoPadres}
                  onToggle={(v) => temploMutation.mutate({ ...templo, selladoPadres: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Sellado a cónyuge"
                  value={templo.selladoConyuge}
                  onToggle={(v) => temploMutation.mutate({ ...templo, selladoConyuge: v })}
                  disabled={!editMode}
                />
                <div className="mt-2">
                  <Label className="text-xs">Fecha califica investidura</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm mt-1"
                    value={templo.fechaCalificaInvestidura || ""}
                    disabled={!editMode}
                    onChange={(e) =>
                      temploMutation.mutate({
                        ...templo,
                        fechaCalificaInvestidura: e.target.value || null,
                      })
                    }
                  />
                </div>
              </section>
            )}

            {/* Principios grid */}
            <section>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Principios
              </h3>
              <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><LessonStatusIcon present exists />Miembro presente</span>
                <span className="inline-flex items-center gap-1"><LessonStatusIcon present={false} exists />Lección sin miembro</span>
              </div>
              <div className="space-y-2">
                {principios.map((p) => {
                  const done = countSesiones(p.id);
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{p.nombre}</span>
                        <span className="text-muted-foreground">
                          {done}/{p.maxSesiones}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {Array.from({ length: p.maxSesiones }, (_, i) => {
                          const sesNum = i + 1;
                          const key = `${p.id}-${sesNum}`;
                          const present = sesionMap[key] ?? false;
                          const exists = sesiones.some(
                            (s) => s.principioId === p.id && s.sesionNum === sesNum
                          );
                          return editMode ? (
                            <button
                              key={sesNum}
                              type="button"
                              onClick={() => {
                                if (!exists) {
                                  toggleSesionMutation.mutate({
                                    action: "set",
                                    principio_id: p.id,
                                    sesion_num: sesNum,
                                    miembro_presente: true,
                                  });
                                  return;
                                }
                                if (present) {
                                  toggleSesionMutation.mutate({
                                    action: "set",
                                    principio_id: p.id,
                                    sesion_num: sesNum,
                                    miembro_presente: false,
                                  });
                                  return;
                                }
                                toggleSesionMutation.mutate({
                                  action: "delete",
                                  principio_id: p.id,
                                  sesion_num: sesNum,
                                });
                              }}
                              className="focus:outline-none p-0.5"
                              title={`Sesión ${sesNum}`}
                            >
                              <LessonStatusIcon present={present} exists={exists} />
                            </button>
                          ) : (
                            <span key={sesNum} title={`Sesión ${sesNum}`}>
                              <LessonStatusIcon present={present} exists={exists} />
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Self-reliance (nuevo/regresando) */}
            {tipo !== "enseñando" && selfReliance && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Autosuficiencia
                </h3>
                <BooleanRow
                  label="Resiliencia emocional"
                  value={selfReliance.resilienciaEmocional}
                  onToggle={(v) => selfRelianceMutation.mutate({ ...selfReliance, resilienciaEmocional: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Finanzas personales"
                  value={selfReliance.finanzasPersonales}
                  onToggle={(v) => selfRelianceMutation.mutate({ ...selfReliance, finanzasPersonales: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Negocio"
                  value={selfReliance.negocio}
                  onToggle={(v) => selfRelianceMutation.mutate({ ...selfReliance, negocio: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Educación y empleo"
                  value={selfReliance.educacionEmpleo}
                  onToggle={(v) => selfRelianceMutation.mutate({ ...selfReliance, educacionEmpleo: v })}
                  disabled={!editMode}
                />
                <BooleanRow
                  label="Buscar empleo"
                  value={selfReliance.buscarEmpleo}
                  onToggle={(v) => selfRelianceMutation.mutate({ ...selfReliance, buscarEmpleo: v })}
                  disabled={!editMode}
                />
              </section>
            )}

            {/* Compromisos bautismales (enseñando) */}
            {tipo === "enseñando" && compromisosBautismo.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Compromisos bautismales
                </h3>
                <div className="space-y-2">
                  {compromisosBautismo.map((c) => (
                    <div
                      key={c.commitmentKey}
                      className={editMode ? "rounded-md border p-2" : "py-1"}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm">{c.nombre}</span>
                        {c.fechaCumplido && !editMode && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      {editMode ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Invitado</Label>
                            <Input
                              type="date"
                              className="h-7 text-xs"
                              value={c.fechaInvitado || ""}
                              onChange={(e) =>
                                compBautismoMutation.mutate({
                                  key: c.commitmentKey,
                                  fechaInvitado: e.target.value || null,
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Cumplido</Label>
                            <Input
                              type="date"
                              className="h-7 text-xs"
                              value={c.fechaCumplido || ""}
                              onChange={(e) =>
                                compBautismoMutation.mutate({
                                  key: c.commitmentKey,
                                  fechaCumplido: e.target.value || null,
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Invitado: {c.fechaInvitado ? formatDisplayDate(c.fechaInvitado) : "—"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Archive button */}
        <div className="mt-8 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            {archiveMutation.isPending ? "Archivando..." : "Archivar persona"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// PersonaCard
// ============================================================

function PersonaCard({
  persona,
  sundays,
  onSelect,
  tipo,
}: {
  persona: Persona;
  sundays: Date[];
  onSelect: (p: Persona) => void;
  tipo: PersonaTipo;
}) {
  const asistenciaQuery = usePersonaAsistencia(persona.id);
  const asistenciaData = asistenciaQuery.data ?? persona.asistencia;

  const attendedSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of asistenciaData) if (a.asistio) s.add(a.fecha_domingo);
    return s;
  }, [asistenciaData]);

  const today = toISODate(new Date());
  // Show all current-month sundays
  const visibleSundays = sundays;

  const attendedCount = visibleSundays.filter((s) => attendedSet.has(toISODate(s))).length;
  // Only count missed sundays that have already passed
  const pastSundays = visibleSundays.filter((s) => toISODate(s) <= today);
  const missedCount = pastSundays.length - pastSundays.filter((s) => attendedSet.has(toISODate(s))).length;

  const initials = persona.nombre.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  const memberTime = formatMemberTime(persona.fechaConfirmacion);

  return (
    <Card className="flex flex-col gap-0">
      {/* Header — clickable for detail */}
      <button
        type="button"
        onClick={() => onSelect(persona)}
        className="flex items-center gap-3 p-4 pb-3 text-left hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold leading-tight truncate">{persona.nombre}</p>
          {memberTime && (
            <p className="text-xs text-muted-foreground mt-0.5">{memberTime}</p>
          )}
        </div>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {/* Attendance */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            Reunión sacramental
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {visibleSundays.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin domingos este mes aún</p>
            ) : visibleSundays.map((s) => {
              const iso = toISODate(s);
              const attended = attendedSet.has(iso);
              return (
                <div key={iso} className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground leading-none">
                    {formatShortDate(s)}
                  </span>
                  <span title={iso}>
                    {attended
                      ? <CheckCircle2 className="h-5 w-5 text-primary" />
                      : <Circle className="h-5 w-5 text-primary/70" />}
                  </span>
                </div>
              );
            })}
          </div>
          {visibleSundays.length > 0 && (
            attendedCount >= 3
              ? <p className="text-xs font-medium text-green-600 mt-1">Asistió {attendedCount} domingo{attendedCount !== 1 ? "s" : ""} este mes</p>
              : <p className="text-xs font-medium text-destructive mt-1">{missedCount} domingo{missedCount !== 1 ? "s" : ""} sin asistir</p>
          )}
        </div>

        {/* Friends */}
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {persona.amigosCount > 0 ? (
            <span className="text-sm">
              {persona.amigosCount} amigo{persona.amigosCount !== 1 ? "s" : ""} identificado{persona.amigosCount !== 1 ? "s" : ""} en la Iglesia
            </span>
          ) : (
            <span className="text-sm text-destructive font-medium">
              Amigos en la Iglesia no identificados
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// TabContent
// ============================================================

function TabContent({
  tipo,
  onSelect,
}: {
  tipo: PersonaTipo;
  onSelect: (p: Persona) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = usePersonas(tipo);

  const sundays = useMemo(() => getCurrentMonthSundays(), []);

  return (
    <div>
      {/* Controls bar */}
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {tipo === "enseñando" ? "Agregar persona" : "Agregar miembro"}
        </Button>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              sundays={sundays}
              onSelect={onSelect}
              tipo={tipo}
            />
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-16">
          <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay personas en esta sección todavía.</p>
        </div>
      )}

      <AddPersonaDialog open={addOpen} onOpenChange={setAddOpen} tipo={tipo} />
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

const SECTION_META: Record<PersonaTipo, { label: string; subtitle: string }> = {
  nuevo: {
    label: "Miembros nuevos",
    subtitle: "Miembros bautizados recientemente en seguimiento",
  },
  regresando: {
    label: "Regresando a la actividad",
    subtitle: "Miembros que están regresando a la actividad",
  },
  enseñando: {
    label: "Personas a las que se está enseñando",
    subtitle: "Personas que están recibiendo las discusiones misioneras",
  },
};

export default function MissionWork() {
  const [section, setSection] = useState<PersonaTipo | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const accessQuery = useQuery<{ allowed: boolean }>({
    queryKey: ["/api/mission/access"],
  });

  const nuevoQuery = usePersonas("nuevo");
  const regresandoQuery = usePersonas("regresando");
  const ensenandoQuery = usePersonas("enseñando");

  const totalNuevo = nuevoQuery.data?.length ?? 0;
  const totalRegresando = regresandoQuery.data?.length ?? 0;
  const totalEnsenando = ensenandoQuery.data?.length ?? 0;

  // Always read the up-to-date persona from the list cache (must be before early returns)
  const livePersona = useMemo(() => {
    if (!selectedPersona) return null;
    const all = [
      ...(nuevoQuery.data ?? []),
      ...(regresandoQuery.data ?? []),
      ...(ensenandoQuery.data ?? []),
    ];
    return all.find((p) => p.id === selectedPersona.id) ?? selectedPersona;
  }, [selectedPersona, nuevoQuery.data, regresandoQuery.data, ensenandoQuery.data]);

  if (accessQuery.isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96" />
      </div>
    );
  }

  if (!accessQuery.data?.allowed) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Progreso de la senda de los convenios</h1>
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  const handleSelect = (p: Persona) => {
    setSelectedPersona(p);
    setSheetOpen(true);
  };

  // ── Section view ──────────────────────────────────────────
  if (section) {
    const meta = SECTION_META[section];
    return (
      <div className="p-8">
        <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSection(null)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold mb-1">{meta.label}</h1>
              <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
            </div>
          </div>
        </div>

        <TabContent tipo={section} onSelect={handleSelect} />

        <PersonaDetailSheet
          persona={livePersona}
          open={sheetOpen}
          onOpenChange={(v) => {
            setSheetOpen(v);
            if (!v) setSelectedPersona(null);
          }}
          tipo={selectedPersona?.tipo ?? section}
        />
      </div>
    );
  }

  // ── Home view (cards) ─────────────────────────────────────
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Progreso de la senda de los convenios</h1>
        <p className="text-sm text-muted-foreground">
          Seguimiento de miembros nuevos, quienes regresan y personas que están siendo enseñadas
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(
          [
            { tipo: "nuevo" as PersonaTipo, count: totalNuevo, loading: nuevoQuery.isLoading },
            { tipo: "regresando" as PersonaTipo, count: totalRegresando, loading: regresandoQuery.isLoading },
            { tipo: "enseñando" as PersonaTipo, count: totalEnsenando, loading: ensenandoQuery.isLoading },
          ] as const
        ).map(({ tipo, count, loading }) => {
          const meta = SECTION_META[tipo];
          return (
            <Card
              key={tipo}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSection(tipo)}
            >
              <CardContent className="p-6">
                {loading ? (
                  <Skeleton className="h-8 w-12 mb-2" />
                ) : (
                  <p className="text-3xl font-bold mb-1">{count}</p>
                )}
                <p className="font-medium mb-1">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
                <div className="flex items-center gap-1 mt-4 text-xs text-primary">
                  Ver lista <ChevronRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
