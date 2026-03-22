import React, { useState, useMemo, useRef } from "react";
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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { BudgetRequestDialog } from "@/components/budget-request-dialog";
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
  CheckSquare,
  Square,
  AlertTriangle,
  Music,
  Handshake,
  BookOpen,
  Trash2,
  ClipboardList,
  Shirt,
  Mic2,
  Utensils,
  Sparkles,
  Tv2,
  ExternalLink,
  Clock,
  Upload,
  FileText,
  Loader2,
} from "lucide-react";
import { useMembers, useUsers, useHymns, useAllMemberCallings } from "@/hooks/use-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeMemberName } from "@/lib/utils";

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
  // Strip time component before parsing to avoid timezone issues
  const datePart = dateStr.split(/[T ]/)[0];
  const d = new Date(datePart + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
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

// Session names per principio ID (from DB seed: 2=Restauración, 3=Plan, 4=Evangelio, 5=Discípulos)
const SESSION_NAMES: Record<number, string[]> = {
  2: [
    "Dios es nuestro amoroso Padre Celestial",
    "El Evangelio bendice a las familias y a las personas en forma individual",
    "Nuestro Padre Celestial revela Su Evangelio en cada dispensación",
    "El ministerio terrenal y la expiación del Salvador",
    "La Gran Apostasía",
    "La restauración del evangelio de Jesucristo por conducto de José Smith",
    "El Libro de Mormón: Otro Testamento de Jesucristo",
  ],
  3: [
    "La vida preterrenal: el propósito y el plan de Dios para nosotros",
    "La Creación",
    "El albedrío y la caída de Adán y Eva",
    "Nuestra vida en la tierra",
    "La expiación de Jesucristo",
    "El mundo de los espíritus",
    "La resurrección, la salvación y la exaltación",
    "El juicio y los grados de gloria",
  ],
  4: [
    "La misión divina de Jesucristo",
    "El evangelio de Cristo y la doctrina de Cristo",
    "La fe en Jesucristo",
    "El arrepentimiento mediante la expiación de Jesucristo",
    "El bautismo: nuestro primer convenio con Dios",
    "El don del Espíritu Santo",
    "Perseverar hasta el fin",
  ],
  5: [
    "Orar a menudo",
    "Estudiar las escrituras",
    "Santificar el día de reposo",
    "Bautismo y confirmación",
    "Seguir al profeta",
    "Guardar los Diez Mandamientos",
    "Vivir la ley de castidad",
    "Obedecer la Palabra de Sabiduría",
    "Guardar la ley del diezmo",
    "Observar la ley del ayuno",
    "Obedecer y honrar la ley",
    "La obra misional",
    "El matrimonio eterno",
    "Los templos y la historia familiar",
    "Servicio",
    "La enseñanza y el aprendizaje en la Iglesia",
    "Perseverar hasta el fin",
  ],
};

function getSesionLabel(principioId: number, sesionNum: number): string {
  return SESSION_NAMES[principioId]?.[sesionNum - 1] ?? `Sesión ${sesionNum}`;
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
  const { user } = useAuth();
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "mission_leader";
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
  const [fechaPrimerContactoVal, setFechaPrimerContactoVal] = useState("");
  const [fechaVisitaVal, setFechaVisitaVal] = useState("");
  const [proximoEventoVal, setProximoEventoVal] = useState("");
  const [proximoEventoDescVal, setProximoEventoDescVal] = useState("");

  const fechaPrimerContactoMutation = useMutation({
    mutationFn: (fecha: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}`, { fechaPrimerContacto: fecha }),
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
      fecha?: string | null;
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
        fecha: data.fecha ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "sesiones"] });
    },
  });

  const [sesionModal, setSesionModal] = React.useState<{
    principioId: number;
    principioNombre: string;
    sesionNum: number;
    exists: boolean;
  } | null>(null);
  const [modalFecha, setModalFecha] = React.useState("");
  const [modalConMiembro, setModalConMiembro] = React.useState(true);

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
    setFechaPrimerContactoVal(persona?.fechaPrimerContacto ?? "");
  }, [persona?.fechaPrimerContacto]);
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "compromisos-bautismo"] });
      if (vars.key === "bautizado_confirmado") {
        qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
        qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
      }
      if (vars.key === "entrevista_bautismo") {
        qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
        qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
        qc.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
      }
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

  // Permanent delete (obispado only)
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/mission/personas/${id}/permanent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
      onOpenChange(false);
      toast({ title: "Persona eliminada permanentemente" });
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
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-4xl overflow-y-auto p-0">
        {/* Name + button — sticky only in edit mode */}
        <div className={editMode ? "px-6 pt-5 pb-4 sticky top-0 z-10 bg-background border-b" : "px-6 pt-5 pb-4"}>
          <div className="text-left">
            {tipo === "enseñando" ? (
              <>
                <p className="text-2xl sm:text-3xl font-medium">{persona.nombre}</p>
                <button
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode
                    ? <><Check className="h-2.5 w-2.5" />Listo</>
                    : <><TrendingUp className="h-2.5 w-2.5" />Actualizar progreso</>}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-medium">{persona.nombre}</p>
                  <Badge variant="outline" className="text-xs">
                    {tipo === "nuevo" ? "Nuevo" : "Regresando"}
                  </Badge>
                </div>
                <button
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode
                    ? <><Check className="h-2.5 w-2.5" />Listo</>
                    : <><TrendingUp className="h-2.5 w-2.5" />Actualizar progreso</>}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metadata — dates/events, always scrollable */}
        <div className="px-6 pt-3 pb-4 border-b">
          {tipo === "enseñando" ? (
            <>
              <div className="flex gap-8 flex-wrap items-start">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Primera enseñanza</p>
                  {editMode ? (
                    <Input
                      type="date"
                      value={fechaPrimerContactoVal}
                      onChange={(e) => {
                        setFechaPrimerContactoVal(e.target.value);
                        fechaPrimerContactoMutation.mutate(e.target.value || null);
                      }}
                      className="h-7 text-sm w-40 mt-1"
                    />
                  ) : (
                    <p className="text-sm">{formatDisplayDate(persona.fechaPrimerContacto)}</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <BaptismDateIcon />
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Fecha bautismal</p>
                  </div>
                  {(() => {
                    const bc = compromisosBautismo.find((c) => c.commitmentKey === "bautizado_confirmado");
                    if (bc?.fechaCumplido) return (
                      <div className="flex items-center gap-1.5 mt-0.5 px-2 py-1 rounded-md bg-green-50 border border-green-200 w-fit">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <p className="text-sm font-medium text-green-700">{formatDisplayDate(bc.fechaCumplido)}</p>
                      </div>
                    );
                    if (bc?.fechaInvitado) return (
                      <div className="flex items-center gap-1.5 mt-0.5 px-2 py-1 rounded-md bg-muted/60 border w-fit">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <p className="text-sm text-foreground">{formatDisplayDate(bc.fechaInvitado)}</p>
                      </div>
                    );
                    return <p className="text-sm text-muted-foreground">—</p>;
                  })()}
                </div>
              </div>
              <div className="border-t mt-4" />
              {/* Próximos eventos — solo los que tienen fecha, o todos en modo edición */}
              {(() => {
                const entrevistaCommitment = compromisosBautismo.find((c) => c.commitmentKey === "entrevista_bautismo");
                const bautizadoCommitment = compromisosBautismo.find((c) => c.commitmentKey === "bautizado_confirmado");
                const eventos = [
                  ...(entrevistaCommitment?.fechaInvitado && !entrevistaCommitment.fechaCumplido ? [{
                    key: "entrevista",
                    label: "Entrevista bautismal",
                    icon: <UserCheck className="h-3.5 w-3.5" />,
                    fecha: entrevistaCommitment.fechaInvitado,
                    editEl: null,
                  }] : []),
                  ...(bautizadoCommitment?.fechaInvitado && !bautizadoCommitment.fechaCumplido ? [{
                    key: "bautismo_compromiso",
                    label: "Servicio bautismal",
                    icon: <Waves className="h-3.5 w-3.5" />,
                    fecha: bautizadoCommitment.fechaInvitado,
                    editEl: null,
                  }] : []),
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
                ];
                const visibles = editMode ? eventos : eventos.filter((e) => e.fecha);
                if (visibles.length === 0 && !editMode) return null;
                return (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Próximos eventos</p>
                    <div className="flex flex-col gap-2">
                      {visibles.map((ev) => (
                        <div key={ev.key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-muted/30">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                            {ev.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-muted-foreground">{ev.label}</p>
                            {editMode && ev.editEl
                              ? ev.editEl
                              : <p className="text-sm font-medium">{ev.fecha ? formatDisplayDate(ev.fecha) : "—"}</p>
                            }
                          </div>
                        </div>
                      ))}
                      {/* Evento Otros */}
                      {(editMode || (persona.proximoEvento && persona.proximoEventoDescripcion)) && (
                        <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border bg-muted/30">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary mt-0.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-muted-foreground">Otros</p>
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
                                <p className="text-sm font-medium">{persona.proximoEventoDescripcion}</p>
                                <p className="text-xs text-muted-foreground">{persona.proximoEvento ? formatDisplayDate(persona.proximoEvento) : ""}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="flex gap-8 flex-wrap">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Primer contacto</p>
                <p className="text-sm">{formatDisplayDate(persona.fechaPrimerContacto)} · {formatMemberTime(persona.fechaConfirmacion)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {/* ─── LEFT COLUMN ─── */}
          <div className="divide-y">
            {/* Asistencia */}
            <section className="py-5 first:pt-3">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {(() => {
                  const now = new Date();
                  return `Asistencia — ${now.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`;
                })()}
              </h3>
              <AttendanceGrid
                asistencia={asistencia}
                sundays={sundays}
                personaId={id ?? undefined}
                editable={editMode}
              />
              {(() => {
                const attendedSet = new Set(asistencia.filter((a) => a.asistio).map((a) => a.fecha_domingo));
                const count = sundays.filter((s) => attendedSet.has(toISODate(s))).length;
                if (count === 0) return null;
                return <p className="text-xs text-green-600 mt-2">Asistió {count} domingo{count !== 1 ? "s" : ""} este mes</p>;
              })()}
            </section>

            {/* Amigos */}
            <section className="py-5">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
              <section className="py-5">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
              <section className="py-5">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
              <section className="py-5">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
              <section className="py-5">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
          <div className="divide-y border-t md:border-t-0">
            {/* Templo ordinanzas (nuevo/regresando) */}
            {tipo !== "enseñando" && templo && (
              <section className="py-5 first:pt-3">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
            <section className="py-5 first:pt-3">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
                          const sesionData = sesiones.find(
                            (s) => s.principioId === p.id && s.sesionNum === sesNum
                          );
                          const exists = !!sesionData;
                          const sesionLabel = getSesionLabel(p.id, sesNum);
                          const tooltipTitle = exists
                            ? `${sesionLabel}${sesionData?.fecha ? ` · ${sesionData.fecha}` : ""}${exists ? (present ? " · Con miembro" : " · Sin miembro") : ""}`
                            : sesionLabel;
                          return editMode ? (
                            <button
                              key={sesNum}
                              type="button"
                              onClick={() => {
                                setSesionModal({ principioId: p.id, principioNombre: p.nombre, sesionNum: sesNum, exists });
                                setModalFecha(sesionData?.fecha ?? "");
                                setModalConMiembro(sesionData?.miembroPresente ?? true);
                              }}
                              className="focus:outline-none p-0.5"
                              title={sesionLabel}
                            >
                              <LessonStatusIcon present={present} exists={exists} />
                            </button>
                          ) : (
                            <span key={sesNum} title={tooltipTitle}>
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
              <section className="py-5">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
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
              <section className="py-5 first:pt-3">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Compromisos bautismales
                </h3>
                <div className="divide-y">
                  {compromisosBautismo.map((c) => (
                    <div key={c.commitmentKey} className="py-2">
                      <div className="flex items-center gap-2">
                        {c.fechaCumplido ? (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-primary/70 shrink-0" />
                        )}
                        <span className="text-sm flex-1">{c.nombre}</span>
                        {!editMode && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {c.fechaInvitado ? `Invitado ${formatDisplayDate(c.fechaInvitado)}` : "—"}
                          </span>
                        )}
                      </div>
                      {editMode && (
                        <div className="ml-6 mt-1.5 grid grid-cols-2 gap-2">
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
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Archive button */}
        <div className="mt-8 pt-4 border-t flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            {archiveMutation.isPending ? "Archivando..." : "Archivar persona"}
          </Button>
          {isObispado && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => {
                if (window.confirm(`¿Eliminar permanentemente a ${persona?.nombre}? Esta acción no se puede deshacer.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar permanentemente"}
            </Button>
          )}
        </div>
        </div>
      </SheetContent>
    </Sheet>

    {/* Mini modal para registrar sesión de principio */}
    <Dialog open={!!sesionModal} onOpenChange={(v) => { if (!v) setSesionModal(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            {sesionModal?.principioNombre}
          </DialogTitle>
          {sesionModal && (
            <p className="text-xs text-muted-foreground pt-0.5">
              {getSesionLabel(sesionModal.principioId, sesionModal.sesionNum)}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Fecha de la lección</Label>
            <Input type="date" value={modalFecha} onChange={(e) => setModalFecha(e.target.value)} className="h-8 text-sm" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={modalConMiembro} onCheckedChange={setModalConMiembro} />
            <span className="text-sm">Con miembro presente</span>
          </label>
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          {sesionModal?.exists && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!sesionModal) return;
                toggleSesionMutation.mutate({ action: "delete", principio_id: sesionModal.principioId, sesion_num: sesionModal.sesionNum });
                setSesionModal(null);
              }}>
              Eliminar
            </Button>
          )}
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              if (!sesionModal) return;
              toggleSesionMutation.mutate({
                action: "set",
                principio_id: sesionModal.principioId,
                sesion_num: sesionModal.sesionNum,
                miembro_presente: modalConMiembro,
                fecha: modalFecha || null,
              });
              setSesionModal(null);
            }}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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

// ── Baptism Sheet Helpers ─────────────────────────────────────────────────────

type HymnOption = { value: string; number: number; title: string };
type MemberOption = { value: string };

const filterHymnOptions = (options: HymnOption[], query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return options;
  const lowerQuery = trimmed.toLowerCase();
  return options.filter((o) => String(o.number).startsWith(trimmed) || o.value.toLowerCase().includes(lowerQuery));
};

const HymnAutocomplete = ({
  value, options, placeholder, onChange, onBlur, onNormalize, testId, className,
}: {
  value: string; options: HymnOption[]; placeholder?: string;
  onChange: (v: string) => void; onBlur: () => void; onNormalize: (v: string) => void;
  testId?: string; className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterHymnOptions(options, value), [options, value]);

  const handleSelect = (o: HymnOption) => {
    onChange(o.value);
    onNormalize(o.value);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testId}
        className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); onBlur(); onNormalize(value); }}
      />
      {open && value.trim().length > 0 && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm">
          {filtered.slice(0, 20).map((o) => (
            <li
              key={o.number}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(o); }}
            >
              <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">{o.number}</span>
              <span className="truncate">{o.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const filterMemberOptions = (options: MemberOption[], query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return options;
  return options.filter((o) => o.value.toLowerCase().includes(trimmed.toLowerCase()));
};

const MemberAutocomplete = ({
  value, options, placeholder, onChange, onBlur, testId, className,
}: {
  value: string; options: MemberOption[]; placeholder?: string;
  onChange: (v: string) => void; onBlur?: () => void; testId?: string; className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterMemberOptions(options, value), [options, value]);

  const handleSelect = (o: MemberOption) => {
    onChange(o.value);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testId}
        className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); onBlur?.(); }}
      />
      {open && value.trim().length > 0 && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm">
          {filtered.slice(0, 15).map((o) => (
            <li
              key={o.value}
              className="px-3 py-2 cursor-pointer hover:bg-accent truncate"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(o); }}
            >
              {o.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const BaptismSectionHead = ({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-4">
    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
      {icon}
    </div>
    <p className="text-sm font-semibold">{title}</p>
    {action && <span className="ml-auto">{action}</span>}
  </div>
);

// ── Baptism Service Sheet ─────────────────────────────────────────────────────

const PROGRAM_ITEM_LABELS: Record<string, string> = {
  preside: "Preside",
  dirige: "Dirige",
  dirige_musica: "Dirige la música",
  acompanamiento_piano: "Acompañamiento en el piano",
  primer_himno: "Primer himno",
  oracion_apertura: "Oración de apertura",
  primer_mensaje: "Primer mensaje",
  numero_especial: "Número especial",
  segundo_mensaje: "Segundo mensaje",
  ordenanza_bautismo: "Ordenanza: Efectúa la ordenanza del Bautismo",
  ordenanza_confirmacion: "Efectúa la ordenanza de la Confirmación",
  ultimo_himno: "Último himno",
  ultima_oracion: "Última oración",
};

const PROGRAM_ORDER = [
  "preside",
  "dirige",
  "dirige_musica",
  "acompanamiento_piano",
  "primer_himno",
  "oracion_apertura",
  "primer_mensaje",
  "numero_especial",
  "segundo_mensaje",
  "ordenanza_bautismo",
  "ordenanza_confirmacion",
  "ultimo_himno",
  "ultima_oracion",
];

interface ProgramItem {
  id: string;
  type: string;
  order: number;
  title: string | null;
  participant_display_name: string | null;
  notes: string | null;
  public_visibility: boolean;
}

interface BaptismServiceDetail extends BaptismService {
  approval_comment: string | null;
  program_items: ProgramItem[] | null;
  assignments: any[] | null;
  candidates: Array<{ id: string; nombre: string; entrevista_invitado?: string | null; entrevista_fecha?: string | null }> | null;
}

const ProgramRow = ({ type, label, children }: { type: string; label?: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[160px_1fr] items-center gap-3 py-2 border-b last:border-b-0">
    <p className="text-xs text-muted-foreground leading-tight">{label ?? PROGRAM_ITEM_LABELS[type as keyof typeof PROGRAM_ITEM_LABELS]}</p>
    {children}
  </div>
);

function BaptismalServiceSheet({
  service,
  open,
  onOpenChange,
  userRole,
  initialEditMode = false,
}: {
  service: BaptismService | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userRole?: string;
  initialEditMode?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"agenda" | "checklist" | "coordinacion" | "aprobacion">("agenda");
  const [editMode, setEditMode] = useState(false);

  React.useEffect(() => {
    if (open) setEditMode(initialEditMode);
  }, [open, initialEditMode]);
  const [locationVal, setLocationVal] = useState("");
  const [locationAddrVal, setLocationAddrVal] = useState("");
  const [serviceAtVal, setServiceAtVal] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [programDraft, setProgramDraft] = React.useState<Record<string, string>>({});
  const isObispo = userRole === "obispo" || userRole === "consejero_obispo";
  const isMissionLeader = userRole === "mission_leader" || userRole === "ward_missionary" || userRole === "full_time_missionary";
  const isLiderActividades = userRole === "lider_actividades";
  const showMisionSections = isObispo || isMissionLeader;
  const showLogisticsSections = isLiderActividades; // only lider_actividades edits logistics
  const showLogisticsStatus = isObispo || isMissionLeader; // others see a status card

  // Data hooks
  const { data: members = [] } = useMembers();
  const { data: usersData = [] as any[] } = useUsers();
  const { data: hymns = [] as any[] } = useHymns();
  const { data: memberCallings = [] } = useAllMemberCallings();

  const memberOptions = useMemo(
    () => Array.from(new Set(
      members.map((m: any) => normalizeMemberName(m.nameSurename)).filter((n): n is string => Boolean(n))
    )).map((value) => ({ value })),
    [members]
  );

  const hymnOptions = useMemo(
    () => hymns.map((h: any) => ({ value: `${h.number} - ${h.title}`, number: h.number, title: h.title })),
    [hymns]
  );

  const bishopricOptions = useMemo(
    () => (usersData as any[])
      .filter((u) => u.role === "obispo" || u.role === "consejero_obispo")
      .map((u) => u.fullName || u.name || u.email || "")
      .filter(Boolean),
    [usersData]
  );

  const misionLeadersOptions = useMemo(
    () => (usersData as any[])
      .filter((u) => u.role === "mission_leader" || u.role === "ward_missionary")
      .map((u) => u.fullName || u.name || u.email || "")
      .filter(Boolean),
    [usersData]
  );

  const normalizeText = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const isMusicDirectorCalling = (v: string) => { const n = normalizeText(v); return n.includes("director de musica") || n.includes("directora de musica") || n.includes("director de coro") || n.includes("directora de coro"); };
  const isPianistCalling = (v: string) => normalizeText(v).startsWith("pianista");
  const isQuorumPresidencyCalling = (v: string) => { const n = normalizeText(v); return n.includes("presidente del cuorum") || n.includes("consejero de la presidencia del cuorum") || n.includes("secretario del cuorum"); };

  const dirigenteOptions = useMemo(() => {
    // Mission leaders from users table
    const leaderNames = misionLeadersOptions;
    // Quorum presidency from callings
    const callingNames = (memberCallings as any[])
      .filter((c) => c.memberName && c.isActive && isQuorumPresidencyCalling(c.callingName || ""))
      .map((c) => normalizeMemberName(c.memberName) || c.memberName);
    const all = Array.from(new Set([...leaderNames, ...callingNames].filter(Boolean))) as string[];
    return all.map((value) => ({ value }));
  }, [misionLeadersOptions, memberCallings]);

  const musicDirectorOptions = useMemo(() => {
    const names = (memberCallings as any[]).filter((c) => c.memberName && c.isActive && isMusicDirectorCalling(c.callingName || "")).map((c) => normalizeMemberName(c.memberName) || c.memberName);
    const unique = Array.from(new Set(names.filter(Boolean))) as string[];
    return unique.length > 0 ? unique.map((value) => ({ value })) : memberOptions;
  }, [memberCallings, memberOptions]);

  const pianistOptions = useMemo(() => {
    const names = (memberCallings as any[]).filter((c) => c.memberName && c.isActive && isPianistCalling(c.callingName || "")).map((c) => normalizeMemberName(c.memberName) || c.memberName);
    const unique = Array.from(new Set(names.filter(Boolean))) as string[];
    return unique.length > 0 ? unique.map((value) => ({ value })) : memberOptions;
  }, [memberCallings, memberOptions]);

  const detailQuery = useQuery<BaptismServiceDetail>({
    queryKey: ["/api/mission/baptism-services", service?.id],
    queryFn: () => missionFetch(`/api/mission/baptism-services/${service?.id}`),
    enabled: open && !!service?.id,
  });

  const detail = detailQuery.data;
  const programItems: ProgramItem[] = detail?.program_items ?? [];
  const liveService = detail ? { ...service, approval_status: detail.approval_status, approval_comment: detail.approval_comment } : service;

  React.useEffect(() => {
    if (service?.service_at) setServiceAtVal(service.service_at.split(/[T ]/)[0]);
    if (service?.location_name) setLocationVal(service.location_name);
    if (service?.location_address) setLocationAddrVal(service.location_address ?? "");
  }, [service?.service_at, service?.location_name, service?.location_address]);

  React.useEffect(() => {
    if (!open) { setEditMode(false); setActiveTab("agenda"); setCoordDraft({ logistics: {}, baptismDetails: {} }); }
  }, [open]);

  React.useEffect(() => {
    if (detail?.program_items) {
      const values: Record<string, string> = {};
      for (const item of detail.program_items) {
        values[item.type] = item.participant_display_name ?? "";
      }
      setProgramDraft(values);
    }
  }, [detail?.program_items]);

  const updateServiceMutation = useMutation({
    mutationFn: (data: { locationName?: string; locationAddress?: string; serviceAt?: string }) =>
      apiRequest("PATCH", `/api/mission/baptism-services/${service?.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveProgramMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/baptisms/services/${service?.id}/program`, {
        items: effectiveProgramOrder.map((type) => ({
          type,
          participantDisplayName: programDraft[type] || null,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
      qc.invalidateQueries({ queryKey: ["/api/baptisms/services", service?.id, "checklist"] });
      setEditMode(false);
      const complete = effectiveProgramOrder.every((t) => programDraft[t]?.trim());
      if (complete) {
        setActiveTab("coordinacion");
        toast({ title: "Agenda guardada", description: "Coordina los detalles del servicio" });
      } else {
        toast({ title: "Agenda guardada", description: "Completa todos los campos para continuar" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checklistQuery = useQuery<{ items: any[]; completedCount: number; totalCount: number }>({
    queryKey: ["/api/baptisms/services", service?.id, "checklist"],
    queryFn: () => missionFetch(`/api/baptisms/services/${service?.id}/activity-checklist`),
    enabled: open && !!service?.id,
  });

  // Fetch service task for logistics status (used by obispo + mission leader)
  const serviceTaskQuery = useQuery<{ id: string; status: string; assigned_to: string; assignedUserName?: string } | null>({
    queryKey: ["/api/service-tasks", service?.id],
    queryFn: async () => {
      const tasks = await missionFetch(`/api/service-tasks`);
      return (tasks as any[]).find((t: any) => t.baptism_service_id === service?.id) ?? null;
    },
    enabled: open && !!service?.id && showLogisticsStatus,
  });

  type CoordData = { logistics: Record<string, any>; baptismDetails: Record<string, any> };
  const [coordDraft, setCoordDraft] = React.useState<CoordData>({ logistics: {}, baptismDetails: {} });
  const coordQuery = useQuery<CoordData>({
    queryKey: ["/api/baptisms/services", service?.id, "coordination"],
    queryFn: () => missionFetch(`/api/baptisms/services/${service?.id}/coordination`),
    enabled: open && !!service?.id,
  });
  React.useEffect(() => {
    if (coordQuery.data) {
      setCoordDraft({
        logistics: coordQuery.data.logistics ?? {},
        baptismDetails: coordQuery.data.baptismDetails ?? {},
      });
    }
  }, [coordQuery.data]);
  const saveCoordMutation = useMutation({
    mutationFn: (data: CoordData) =>
      apiRequest("PUT", `/api/baptisms/services/${service?.id}/coordination`, data),
    onSuccess: (_res, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/baptisms/services", service?.id, "coordination"] });
      qc.invalidateQueries({ queryKey: ["/api/baptisms/services", service?.id, "checklist"] });
      toast({ title: "Coordinación guardada" });
      // Auto-complete arreglo_espacios when at least one participant and hora are set
      const log = variables.logistics;
      const participantes: string[] = log.arreglo_participantes ?? [];
      const hasParticipant = participantes.some((p: string) => p.trim().length > 0);
      const hasHora = Boolean(log.arreglo_hora?.trim());
      if (hasParticipant && hasHora) {
        const ci = getChkItem("arreglo_espacios");
        if (ci && !ci.completed) {
          toggleChecklistItemMutation.mutate({ itemId: ci.id, completed: true });
        }
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Interview completion state
  const [interviewConfirm, setInterviewConfirm] = React.useState<{
    personaId: string;
    nombre: string;
    fechaInvitado: string;
    step: "ask" | "date";
    customDate: string;
  } | null>(null);
  const markInterviewCompleteMutation = useMutation({
    mutationFn: ({ personaId, fecha }: { personaId: string; fecha: string }) =>
      apiRequest("PUT", `/api/mission/personas/${personaId}/compromisos-bautismo/entrevista_bautismo`, {
        fecha_cumplido: fecha,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baptisms/services", service?.id, "checklist"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
      setInterviewConfirm(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Interview edit state (edit proposed + completion date from coordination tab)
  const [interviewEdit, setInterviewEdit] = React.useState<{
    personaId: string;
    nombre: string;
    fechaInvitado: string;
    fechaCumplido: string;
  } | null>(null);
  const editInterviewMutation = useMutation({
    mutationFn: ({ personaId, fechaInvitado, fechaCumplido }: { personaId: string; fechaInvitado: string; fechaCumplido: string }) =>
      apiRequest("PUT", `/api/mission/personas/${personaId}/compromisos-bautismo/entrevista_bautismo`, {
        fecha_invitado: fechaInvitado || null,
        fecha_cumplido: fechaCumplido || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baptisms/services", service?.id, "checklist"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
      setInterviewEdit(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setLog = (field: string, value: any) =>
    setCoordDraft((d) => ({ ...d, logistics: { ...d.logistics, [field]: value } }));
  const setBap = (field: string, value: any) =>
    setCoordDraft((d) => ({ ...d, baptismDetails: { ...d.baptismDetails, [field]: value } }));

  // ── Arreglo de espacios — task check state (local only, resets on reopen) ──
  const [arregloTareasDone, setArregloTareasDone] = React.useState<boolean[]>([]);
  React.useEffect(() => {
    const tareas = coordDraft.logistics.arreglo_tareas ?? [];
    setArregloTareasDone((prev) => tareas.map((_: any, i: number) => prev[i] ?? false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(coordDraft.logistics.arreglo_tareas ?? []).length]);

  const arregloParticipantes: string[] = coordDraft.logistics.arreglo_participantes ?? [""];
  const setArregloParticipantes = (list: string[]) => {
    setLog("arreglo_participantes", list);
    setLog("arreglo_responsable", list[0] ?? null);
  };

  const arregloTareas: string[] = coordDraft.logistics.arreglo_tareas ?? [];
  const setArregloTareas = (list: string[]) => setLog("arreglo_tareas", list);

  // New task-card model for arreglo
  type ArregloTask = { persona: string; asignacion: string; hora: string };
  const arregloTasks: ArregloTask[] = coordDraft.logistics.arreglo_tasks
    ?? (coordDraft.logistics.arreglo_participantes?.length
        ? (coordDraft.logistics.arreglo_participantes as string[]).map((p) => ({
            persona: p,
            asignacion: "",
            hora: coordDraft.logistics.arreglo_hora ?? "",
          }))
        : [{ persona: "", asignacion: "", hora: "" }]);
  const setArregloTasks = (tasks: ArregloTask[]) => {
    setCoordDraft((d) => ({
      ...d,
      logistics: {
        ...d.logistics,
        arreglo_tasks: tasks,
        // keep legacy fields in sync for saveCoordMutation auto-complete logic
        arreglo_participantes: tasks.map((t) => t.persona).filter((p) => p.trim()),
        arreglo_responsable: tasks[0]?.persona || null,
        arreglo_hora: tasks.find((t) => t.hora)?.hora || null,
      },
    }));
  };

  // Refrigerio responsables helpers
  const refrigerioResponsables: string[] =
    (coordDraft.logistics.refrigerio_responsables as string[] | null | undefined)?.length
      ? (coordDraft.logistics.refrigerio_responsables as string[])
      : coordDraft.logistics.refrigerio_responsable
        ? [coordDraft.logistics.refrigerio_responsable as string]
        : [""];
  const setRefrigerioResponsables = (names: string[]) => {
    setCoordDraft((d) => ({
      ...d,
      logistics: {
        ...d.logistics,
        refrigerio_responsables: names,
        refrigerio_responsable: names[0] ?? null,
      },
    }));
  };

  // Accordion open state — fully user-controlled, starts collapsed
  const [coordOpenSections, setCoordOpenSections] = React.useState<string[]>([]);
  const [arregloBudgetOpen, setArregloBudgetOpen] = React.useState(false);
  const [refrigerioBudgetOpen, setRefrigeriBudgetOpen] = React.useState(false);

  const toggleChecklistItemMutation = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      apiRequest("PATCH", `/api/baptisms/services/${service?.id}/checklist-item/${itemId}`, { completed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baptisms/services", service?.id, "checklist"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const comprobanteRef = React.useRef<HTMLInputElement>(null);
  const [uploadingComprobante, setUploadingComprobante] = React.useState(false);

  const handleComprobanteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingComprobante(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAccessToken();
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!uploadRes.ok) throw new Error("No se pudo subir el comprobante");
      const uploaded = await uploadRes.json();
      const updatedLogistics = {
        ...coordDraft.logistics,
        espacio_comprobante_url: uploaded.url,
        espacio_comprobante_nombre: file.name,
      };
      setCoordDraft((d) => ({ ...d, logistics: updatedLogistics }));
      await saveCoordMutation.mutateAsync({ logistics: updatedLogistics, baptismDetails: coordDraft.baptismDetails });
      const ci = getChkItem("espacio_calendario");
      if (ci && !ci.completed) {
        toggleChecklistItemMutation.mutate({ itemId: ci.id, completed: true });
      }
    } catch (err: any) {
      toast({ title: "Error al subir", description: err.message ?? "No se pudo subir el comprobante", variant: "destructive" });
    } finally {
      setUploadingComprobante(false);
      if (comprobanteRef.current) comprobanteRef.current.value = "";
    }
  };

  const submitForApprovalMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/baptisms/services/${service?.id}/submit-for-approval`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
      qc.invalidateQueries({ queryKey: ["/api/baptisms/services", service?.id, "checklist"] });
      toast({ title: "Solicitud enviada al obispado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/baptisms/services/${service?.id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
      toast({ title: "Servicio aprobado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (comment: string) =>
      apiRequest("POST", `/api/baptisms/services/${service?.id}/reject`, { comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
      setApprovalComment("");
      toast({ title: "Se solicitaron cambios al líder misional" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/mission/baptism-services/${service?.id}`, { approvalStatus: "draft", approvalComment: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services", service?.id] });
      toast({ title: "Aprobación revocada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!service) return null;

  const approvalBadge = () => {
    const status = liveService?.approval_status;
    if (status === "approved") return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Aprobado</span>;
    if (status === "needs_revision") return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Necesita revisión</span>;
    if (status === "pending_approval") return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pendiente aprobación</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Borrador</span>;
  };

  const setProgramField = (type: string, value: string) =>
    setProgramDraft((d) => ({ ...d, [type]: value }));

  const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const formatServiceDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.getUTCDate()} de ${MESES_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  };

  // Build effective program order — one ordinance row per candidate when multi-candidate
  const serviceCandidates = detail?.candidates ?? [];
  const ordinanceBautismoKeys = serviceCandidates.length > 1
    ? serviceCandidates.map((_, i) => i === 0 ? "ordenanza_bautismo" : `ordenanza_bautismo_${i + 1}`)
    : ["ordenanza_bautismo"];
  const ordinanceConfirmKeys = serviceCandidates.length > 1
    ? serviceCandidates.map((_, i) => i === 0 ? "ordenanza_confirmacion" : `ordenanza_confirmacion_${i + 1}`)
    : ["ordenanza_confirmacion"];
  const effectiveProgramOrder = [
    ...PROGRAM_ORDER.filter((k) => k !== "ordenanza_bautismo" && k !== "ordenanza_confirmacion"),
    ...ordinanceBautismoKeys,
    ...ordinanceConfirmKeys,
  ];

  const programComplete = effectiveProgramOrder.every((t) => programDraft[t]?.trim());

  const coordComplete = (() => {
    const secEntrevista = serviceCandidates.length === 0
      ? !!coordDraft.baptismDetails.entrevista_notas?.trim()
      : serviceCandidates.every((c: any) => !!c.entrevista_fecha);
    const secRopa = !!coordDraft.baptismDetails.ropa_responsable?.trim() && !!coordDraft.baptismDetails.prueba_responsable?.trim();
    const secReserva = !!coordDraft.logistics.espacio_comprobante_url;
    const arregloNecesitaPresupuesto = !!coordDraft.logistics.arreglo_necesita_presupuesto;
    const arregloPresupuestoSolicitado = !!coordDraft.logistics.arreglo_presupuesto_solicitado;
    const secArreglo = arregloTasks.some((t: any) => t.persona.trim()) &&
      (!arregloNecesitaPresupuesto || arregloPresupuestoSolicitado);
    const secEquipo = !!coordDraft.logistics.equipo_responsable?.trim();
    const refrigerioNecesitaPresupuesto = !!coordDraft.logistics.refrigerio_necesita_presupuesto;
    const refrigerioPresupuestoSolicitado = !!coordDraft.logistics.refrigerio_presupuesto_solicitado;
    const secRefrigerio = refrigerioResponsables.some((r: string) => r.trim()) &&
      !!(coordDraft.logistics.refrigerio_detalle as string | null | undefined)?.trim() &&
      (!refrigerioNecesitaPresupuesto || refrigerioPresupuestoSolicitado);
    const secLimpieza = !!coordDraft.logistics.limpieza_responsable?.trim();
    const misionDone = showMisionSections ? [secEntrevista, secRopa] : [];
    const logisticsDone = showLogisticsSections ? [secReserva, secArreglo, secEquipo, secRefrigerio, secLimpieza] : [];
    const all = [...misionDone, ...logisticsDone];
    return all.length > 0 && all.every(Boolean);
  })();

  const checklistData = checklistQuery.data;

  // Mission leader only needs to complete mission-relevant checklist items;
  // logistics items (espacio, arreglo, equipo, refrigerio, limpieza) belong to lider de actividades.
  const MISSION_CHECKLIST_KEYS = ["programa", "ropa_bautismal", "entrevista_bautismal"];
  const LOGISTICS_CHECKLIST_KEYS = ["espacio_calendario", "arreglo_espacios", "equipo_tecnologia", "presupuesto_refrigerio", "limpieza"];

  const visibleChecklistItems = (() => {
    if (!checklistData?.items) return null;
    if (isObispo) return checklistData.items; // obispo sees everything
    if (isMissionLeader) return (checklistData.items as any[]).filter((i) =>
      MISSION_CHECKLIST_KEYS.includes(i.itemKey ?? i.item_key)
    );
    return checklistData.items;
  })();

  const checklistComplete = (() => {
    if (!visibleChecklistItems || visibleChecklistItems.length === 0) return false;
    return (visibleChecklistItems as any[]).every((i) => i.completed);
  })();

  // Helper: find a checklist item by its key
  const getChkItem = (key: string) => checklistData?.items?.find((i: any) => (i.itemKey ?? i.item_key) === key);

  // Obispo can navigate freely; others need previous step done
  const stepAprobacionLocked = !isObispo && !(programComplete && checklistComplete);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg flex flex-col p-0 gap-0">

        {/* Header */}
        <div className="px-5 pt-5 pb-0 border-b shrink-0">
          <div className="min-w-0 mb-4">
            {(detail?.candidates && detail.candidates.length > 0 ? detail.candidates : null)?.map((c) => (
              <p key={c.id} className="text-xl font-semibold leading-tight">{c.nombre}</p>
            )) ?? <p className="text-xl font-semibold">{service.persona_nombre}</p>}
            <div className="flex items-center gap-2 mt-1">
              {approvalBadge()}
              <span className="text-xs text-muted-foreground">{formatServiceDate(service.service_at)}</span>
            </div>
          </div>

          {/* Stepper: [Programa | Coordinación] → [Resumen] → [Aprobación] */}
          <div className="flex items-stretch gap-1">
            {/* Row 1: Programa + Coordinación (always accessible, side by side) */}
            {(["agenda", "coordinacion"] as const).map((key, idx) => {
              const label = key === "agenda" ? "Programa" : "Coordinación";
              const done = key === "agenda" ? programComplete : coordComplete;
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 border-b-2 transition-colors text-center cursor-pointer hover:bg-muted/40
                    ${isActive ? "border-primary" : "border-transparent"}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0
                    ${done ? "bg-green-500 text-white" : isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                  </div>
                  <span className={`text-[11px] font-medium leading-none ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </button>
              );
            })}

            {/* Resumen (always accessible) */}
            {(() => {
              const isActive = activeTab === "checklist";
              return (
                <button
                  type="button"
                  onClick={() => setActiveTab("checklist")}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 border-b-2 transition-colors text-center cursor-pointer hover:bg-muted/40
                    ${isActive ? "border-primary" : "border-transparent"}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0
                    ${checklistComplete ? "bg-green-500 text-white" : isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {checklistComplete ? <Check className="h-3.5 w-3.5" /> : 3}
                  </div>
                  <span className={`text-[11px] font-medium leading-none ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    Resumen
                  </span>
                </button>
              );
            })()}

            {/* Aprobación (locked until Resumen complete) */}
            {(() => {
              const isActive = activeTab === "aprobacion";
              const canClick = !stepAprobacionLocked;
              const done = liveService?.approval_status === "approved";
              return (
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => canClick && setActiveTab("aprobacion")}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 border-b-2 transition-colors text-center
                    ${isActive ? "border-primary" : "border-transparent"}
                    ${!canClick ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted/40"}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0
                    ${done ? "bg-green-500 text-white" : isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : 4}
                  </div>
                  <span className={`text-[11px] font-medium leading-none ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    Aprobación
                  </span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">

          {/* ── PASO 1: AGENDA ── */}
          {activeTab === "agenda" && (
            <div className="space-y-6">
              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{programComplete ? 1 : 0} de 1 listo</span>
                  {programComplete && <span className="text-green-600 font-medium">Completo</span>}
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: programComplete ? "100%" : "0%" }} />
                </div>
              </div>
              {editMode && (
                <div>
                  <BaptismSectionHead icon={<CalendarDays className="h-4 w-4" />} title="Información del servicio" />
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
                      <Input type="date" value={serviceAtVal}
                        onChange={(e) => setServiceAtVal(e.target.value)}
                        onBlur={() => updateServiceMutation.mutate({ serviceAt: serviceAtVal })}
                        className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Lugar</Label>
                      <Input value={locationVal}
                        onChange={(e) => setLocationVal(e.target.value)}
                        onBlur={() => updateServiceMutation.mutate({ locationName: locationVal })}
                        className="h-8 text-sm" placeholder="Nombre del lugar" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Dirección</Label>
                      <Input value={locationAddrVal}
                        onChange={(e) => setLocationAddrVal(e.target.value)}
                        onBlur={() => updateServiceMutation.mutate({ locationAddress: locationAddrVal || undefined })}
                        className="h-8 text-sm" placeholder="Dirección (opcional)" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <BaptismSectionHead icon={<UserCheck className="h-4 w-4" />} title="Autoridades" />
                {detailQuery.isLoading ? (
                  <div className="space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                ) : (
                  <div>
                    <ProgramRow type="preside">
                      {editMode ? (
                        <Select value={programDraft["preside"] ?? ""} onValueChange={(v) => setProgramField("preside", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                          <SelectContent>
                            {bishopricOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm">{programDraft["preside"] || <span className="text-muted-foreground/60">—</span>}</p>
                      )}
                    </ProgramRow>
                    <ProgramRow type="dirige">
                      {editMode ? (
                        <MemberAutocomplete value={programDraft["dirige"] ?? ""} options={dirigenteOptions} placeholder="Nombre" onChange={(v) => setProgramField("dirige", v)} className="h-8 text-sm" />
                      ) : (
                        <p className="text-sm">{programDraft["dirige"] || <span className="text-muted-foreground/60">—</span>}</p>
                      )}
                    </ProgramRow>
                    <ProgramRow type="dirige_musica">
                      {editMode ? (
                        <MemberAutocomplete value={programDraft["dirige_musica"] ?? ""} options={musicDirectorOptions} placeholder="Nombre" onChange={(v) => setProgramField("dirige_musica", v)} className="h-8 text-sm" />
                      ) : (
                        <p className="text-sm">{programDraft["dirige_musica"] || <span className="text-muted-foreground/60">—</span>}</p>
                      )}
                    </ProgramRow>
                    <ProgramRow type="acompanamiento_piano">
                      {editMode ? (
                        <MemberAutocomplete value={programDraft["acompanamiento_piano"] ?? ""} options={pianistOptions} placeholder="Nombre" onChange={(v) => setProgramField("acompanamiento_piano", v)} className="h-8 text-sm" />
                      ) : (
                        <p className="text-sm">{programDraft["acompanamiento_piano"] || <span className="text-muted-foreground/60">—</span>}</p>
                      )}
                    </ProgramRow>
                  </div>
                )}
              </div>

              <div>
                <BaptismSectionHead icon={<Music className="h-4 w-4" />} title="Himnos" />
                <div>
                  <ProgramRow type="primer_himno">
                    {editMode ? (
                      <HymnAutocomplete value={programDraft["primer_himno"] ?? ""} options={hymnOptions} placeholder="Número o nombre" onChange={(v) => setProgramField("primer_himno", v)} onBlur={() => {}} onNormalize={(v) => setProgramField("primer_himno", v)} className="h-8 text-sm" />
                    ) : (
                      <p className="text-sm">{programDraft["primer_himno"] || <span className="text-muted-foreground/60">—</span>}</p>
                    )}
                  </ProgramRow>
                  <ProgramRow type="ultimo_himno">
                    {editMode ? (
                      <HymnAutocomplete value={programDraft["ultimo_himno"] ?? ""} options={hymnOptions} placeholder="Número o nombre" onChange={(v) => setProgramField("ultimo_himno", v)} onBlur={() => {}} onNormalize={(v) => setProgramField("ultimo_himno", v)} className="h-8 text-sm" />
                    ) : (
                      <p className="text-sm">{programDraft["ultimo_himno"] || <span className="text-muted-foreground/60">—</span>}</p>
                    )}
                  </ProgramRow>
                </div>
              </div>

              <div>
                <BaptismSectionHead icon={<Handshake className="h-4 w-4" />} title="Oraciones y mensajes" />
                <div>
                  {["oracion_apertura", "primer_mensaje", "numero_especial", "segundo_mensaje", "ultima_oracion"].map((type) => (
                    <ProgramRow key={type} type={type}>
                      {editMode ? (
                        <MemberAutocomplete value={programDraft[type] ?? ""} options={memberOptions} placeholder="Nombre" onChange={(v) => setProgramField(type, v)} className="h-8 text-sm" />
                      ) : (
                        <p className="text-sm">{programDraft[type] || <span className="text-muted-foreground/60">—</span>}</p>
                      )}
                    </ProgramRow>
                  ))}
                </div>
              </div>

              <div>
                <BaptismSectionHead icon={<Waves className="h-4 w-4" />} title="Ordenanzas" />
                <div>
                  {ordinanceBautismoKeys.map((type, idx) => {
                    const candidateName = serviceCandidates[idx]?.nombre;
                    const label = serviceCandidates.length > 1 ? `Bautismo de ${candidateName}` : "Bautismo";
                    return (
                      <ProgramRow key={type} type={type} label={label}>
                        {editMode ? (
                          <MemberAutocomplete value={programDraft[type] ?? ""} options={memberOptions} placeholder="Nombre" onChange={(v) => setProgramField(type, v)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm">{programDraft[type] || <span className="text-muted-foreground/60">—</span>}</p>
                        )}
                      </ProgramRow>
                    );
                  })}
                  {ordinanceConfirmKeys.map((type, idx) => {
                    const candidateName = serviceCandidates[idx]?.nombre;
                    const label = serviceCandidates.length > 1 ? `Confirmación de ${candidateName}` : "Confirmación";
                    return (
                      <ProgramRow key={type} type={type} label={label}>
                        {editMode ? (
                          <MemberAutocomplete value={programDraft[type] ?? ""} options={memberOptions} placeholder="Nombre" onChange={(v) => setProgramField(type, v)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm">{programDraft[type] || <span className="text-muted-foreground/60">—</span>}</p>
                        )}
                      </ProgramRow>
                    );
                  })}
                </div>
              </div>

              {editMode ? (
                <Button onClick={() => saveProgramMutation.mutate()} disabled={saveProgramMutation.isPending} className="w-full">
                  {saveProgramMutation.isPending ? "Guardando..." : "Guardar agenda"}
                </Button>
              ) : (
                <Button
                  onClick={() => setActiveTab("coordinacion")}
                  disabled={!programComplete}
                  className="w-full"
                  variant={programComplete ? "default" : "outline"}>
                  {programComplete ? "Siguiente: Coordinación →" : "Completa la agenda para continuar"}
                </Button>
              )}
            </div>
          )}

          {/* ── RESUMEN ── */}
          {activeTab === "checklist" && (
            <div className="space-y-4">
              <BaptismSectionHead icon={<CheckSquare className="h-4 w-4" />} title="Resumen de preparación" />

              {checklistQuery.isLoading && (
                <div className="space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              )}

              {/* Warning cards */}
              {!programComplete && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800">Programa incompleto</p>
                    <p className="text-xs text-amber-700 mt-0.5">Completa el programa del servicio antes de enviar al obispo.</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 text-xs h-7 border-amber-300"
                    onClick={() => setActiveTab("agenda")}>
                    Ir al Programa
                  </Button>
                </div>
              )}

              {programComplete && !checklistComplete && visibleChecklistItems && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800">Coordinación incompleta</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {(() => {
                        const pending = (visibleChecklistItems as any[]).filter((i) => !i.completed).length;
                        return `${pending} sección${pending !== 1 ? "es" : ""} pendiente${pending !== 1 ? "s" : ""}`;
                      })()}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 text-xs h-7 border-amber-300"
                    onClick={() => setActiveTab("coordinacion")}>
                    Ir a Coordinación
                  </Button>
                </div>
              )}

              {visibleChecklistItems && (
                <>
                  {(() => {
                    const total = (visibleChecklistItems as any[]).length;
                    const completed = (visibleChecklistItems as any[]).filter((i) => i.completed).length;
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{completed} de {total} completados</span>
                        <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-green-500 transition-all"
                            style={{ width: total > 0 ? `${(completed / total) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Checklist items — grouped by responsible when obispo */}
                  {(() => {
                    const renderItem = (item: any) => {
                      const itemKey = item.itemKey ?? item.item_key;
                      const isEntrevista = itemKey === "entrevista_bautismal";
                      let candidates: Array<{ nombre: string; fecha: string | null }> | null = null;
                      if (isEntrevista && item.notes) {
                        try { candidates = JSON.parse(item.notes); } catch { /* ignore */ }
                      }
                      return (
                        <div key={item.id}>
                          <div className="w-full flex items-center gap-2.5 text-sm py-1.5 px-1 rounded">
                            {item.completed
                              ? <CheckSquare className="h-4 w-4 text-green-600 shrink-0" />
                              : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                            <span className={item.completed ? "text-muted-foreground line-through" : ""}>
                              {itemKey === "arreglo_espacios" ? "Arreglo y preparación" : item.label}
                            </span>
                          </div>
                          {candidates && candidates.length > 0 && (
                            <div className="ml-6 space-y-0.5 pb-1">
                              {candidates.map((c, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground px-1">
                                  <span>{c.nombre}</span>
                                  {c.fecha
                                    ? <span className="text-green-700">{c.fecha}</span>
                                    : <span className="italic">Pendiente</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    };

                    if (isObispo) {
                      const misionItems = (visibleChecklistItems as any[]).filter((i) =>
                        MISSION_CHECKLIST_KEYS.includes(i.itemKey ?? i.item_key)
                      );
                      const logisticsItems = (visibleChecklistItems as any[]).filter((i) =>
                        LOGISTICS_CHECKLIST_KEYS.includes(i.itemKey ?? i.item_key)
                      );
                      return (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Líder misional</p>
                            <div className="space-y-1">{misionItems.map(renderItem)}</div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Líder de actividades</p>
                            <div className="space-y-1">{logisticsItems.map(renderItem)}</div>
                          </div>
                        </div>
                      );
                    }

                    return <div className="space-y-1">{(visibleChecklistItems as any[]).map(renderItem)}</div>;
                  })()}

                  {programComplete && checklistComplete && (
                    <Button
                      className="w-full mt-2"
                      onClick={() => submitForApprovalMutation.mutate(undefined, {
                        onSuccess: () => { onOpenChange(false); toast({ title: "Solicitud enviada al obispado" }); },
                      })}
                      disabled={submitForApprovalMutation.isPending}>
                      {submitForApprovalMutation.isPending ? "Enviando..." : "Enviar al obispo para aprobación"}
                    </Button>
                  )}
                </>
              )}

              {!visibleChecklistItems && !checklistQuery.isLoading && (
                <p className="text-sm text-muted-foreground">No hay checklist vinculado a este servicio.</p>
              )}
            </div>
          )}

          {/* ── PASO 3: APROBACIÓN ── */}
          {activeTab === "aprobacion" && (
            <div className="space-y-4">
              <BaptismSectionHead icon={<UserCheck className="h-4 w-4" />} title="Solicitud de aprobación" />

              {!isObispo && (
                <div className="space-y-3">
                  {approvalBadge()}
                  {liveService?.approval_status === "needs_revision" && liveService?.approval_comment && (
                    <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2.5 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{liveService.approval_comment}</span>
                    </div>
                  )}
                  {liveService?.approval_status === "pending_approval" && (
                    <p className="text-sm text-muted-foreground">Solicitud enviada. En espera de respuesta del obispado.</p>
                  )}
                  {liveService?.approval_status === "approved" && (
                    <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">Servicio aprobado por el obispado.</p>
                  )}
                </div>
              )}

              {isObispo && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">{approvalBadge()}</div>
                  {liveService?.approval_status !== "approved" && (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Comentario <span className="text-red-500">*requerido para solicitar revisión</span>
                        </Label>
                        <Textarea value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)}
                          placeholder="Añade indicaciones para el líder misional..."
                          className="text-sm min-h-[60px] resize-none" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs"
                          onClick={() => approveMutation.mutate()}
                          disabled={approveMutation.isPending || rejectMutation.isPending}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Aprobar
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => {
                            if (!approvalComment.trim()) { toast({ title: "Se requiere un comentario", variant: "destructive" }); return; }
                            rejectMutation.mutate(approvalComment.trim());
                          }}
                          disabled={approveMutation.isPending || rejectMutation.isPending}>
                          <X className="h-3.5 w-3.5 mr-1" /> Necesita revisión
                        </Button>
                      </div>
                    </>
                  )}
                  {liveService?.approval_status === "approved" && (
                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground"
                      onClick={() => revokeMutation.mutate()} disabled={revokeMutation.isPending}>
                      Revocar aprobación
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PASO 2: COORDINACIÓN ── */}
          {activeTab === "coordinacion" && (
            <div className="space-y-4">
              {coordQuery.isLoading && (
                <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              )}

              {!coordQuery.isLoading && (() => {
                // Section completion booleans (used for dots and progress bar)
                const secEntrevista = serviceCandidates.length === 0
                  ? !!coordDraft.baptismDetails.entrevista_notas?.trim()
                  : serviceCandidates.every((c) => !!c.entrevista_fecha);
                const secReserva = !!coordDraft.logistics.espacio_comprobante_url;
                const arregloNecesitaPresupuesto = !!coordDraft.logistics.arreglo_necesita_presupuesto;
                const arregloPresupuestoSolicitado = !!coordDraft.logistics.arreglo_presupuesto_solicitado;
                const secArreglo = arregloTasks.some((t) => t.persona.trim()) &&
                  (!arregloNecesitaPresupuesto || arregloPresupuestoSolicitado);
                const secEquipo = !!coordDraft.logistics.equipo_responsable?.trim();
                const refrigerioNecesitaPresupuesto = !!coordDraft.logistics.refrigerio_necesita_presupuesto;
                const refrigerioPresupuestoSolicitado = !!coordDraft.logistics.refrigerio_presupuesto_solicitado;
                const secRefrigerio = refrigerioResponsables.some((r) => r.trim()) &&
                  !!(coordDraft.logistics.refrigerio_detalle as string | null | undefined)?.trim() &&
                  (!refrigerioNecesitaPresupuesto || refrigerioPresupuestoSolicitado);
                const secLimpieza = !!coordDraft.logistics.limpieza_responsable?.trim();
                const secRopa = !!coordDraft.baptismDetails.ropa_responsable?.trim() && !!coordDraft.baptismDetails.prueba_responsable?.trim();
                const misionSectionDone = showMisionSections ? [secEntrevista, secRopa] : [];
                const logisticsSectionDone = showLogisticsSections ? [secReserva, secArreglo, secEquipo, secRefrigerio, secLimpieza] : [];
                const visibleSectionDone = [...misionSectionDone, ...logisticsSectionDone];
                const coordSectionsComplete = visibleSectionDone.filter(Boolean).length;
                const totalSections = visibleSectionDone.length;
                const allCoordComplete = totalSections > 0 && coordSectionsComplete === totalSections;

                const dot = (done: boolean) => (
                  <span className={`h-2 w-2 rounded-full shrink-0 ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />
                );
                const accordionItemClass = (done: boolean) =>
                  `border rounded-lg px-3 border-b-0 transition-colors ${done ? "border-primary/40 bg-primary/5" : ""}`;

                return (
                  <>
                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{coordSectionsComplete} de {totalSections} listos</span>
                        {allCoordComplete && <span className="text-green-600 font-medium">Completo</span>}
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: totalSections > 0 ? `${(coordSectionsComplete / totalSections) * 100}%` : "0%" }}
                        />
                      </div>
                    </div>

                    {/* Accordion sections */}
                    <Accordion
                      type="multiple"
                      value={coordOpenSections}
                      onValueChange={setCoordOpenSections}
                      className="space-y-1"
                    >
                      {/* Entrevista bautismal — líder misional */}
                      {showMisionSections && <AccordionItem value="entrevista" className={accordionItemClass(secEntrevista)}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <Mic2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">Entrevista bautismal</span>
                            <span className="ml-auto mr-2">{dot(secEntrevista)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-1">
                            {serviceCandidates.length > 0 && (
                              <div className="space-y-2">
                                {serviceCandidates.map((c, idx) => (
                                  <div key={idx} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium">{c.nombre}</span>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {c.entrevista_fecha ? (
                                          <span className="text-xs text-green-700 flex items-center gap-1">
                                            <CheckSquare className="h-3.5 w-3.5" />
                                            {formatDisplayDate(c.entrevista_fecha)}
                                          </span>
                                        ) : c.entrevista_invitado ? (
                                          <button
                                            type="button"
                                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            onClick={() => setInterviewConfirm({
                                              personaId: c.id,
                                              nombre: c.nombre,
                                              fechaInvitado: c.entrevista_invitado!,
                                              step: "ask",
                                              customDate: "",
                                            })}
                                          >
                                            <Square className="h-3.5 w-3.5" />
                                            Marcar completada
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="text-muted-foreground hover:text-foreground transition-colors"
                                          title="Editar fechas de entrevista"
                                          onClick={() => setInterviewEdit({
                                            personaId: c.id,
                                            nombre: c.nombre,
                                            fechaInvitado: c.entrevista_invitado ?? "",
                                            fechaCumplido: c.entrevista_fecha ?? "",
                                          })}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                    {!c.entrevista_fecha && c.entrevista_invitado && (
                                      <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                                        <Clock className="h-3 w-3 shrink-0" />
                                        <span>Pendiente confirmación con misioneros de tiempo completo</span>
                                        <span className="ml-auto font-medium whitespace-nowrap">{formatDisplayDate(c.entrevista_invitado)}</span>
                                      </div>
                                    )}
                                    {!c.entrevista_fecha && !c.entrevista_invitado && (
                                      <p className="text-xs text-muted-foreground italic">Sin fecha propuesta aún</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <Textarea className="text-sm min-h-[44px] resize-none" placeholder="Notas (opcional)"
                              value={coordDraft.baptismDetails.entrevista_notas ?? ""}
                              onChange={(e) => setBap("entrevista_notas", e.target.value)} />
                          </div>
                        </AccordionContent>
                      </AccordionItem>}

                      {showLogisticsSections && <AccordionItem value="reserva" className={accordionItemClass(secReserva)}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">Reserva de ambientes</span>
                            <span className="ml-auto mr-2">{dot(secReserva)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-1">
                            <div className="flex flex-col gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => window.open("https://www.churchofjesuschrist.org/calendar", "_blank")}
                              >
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                                Ir al calendario
                              </Button>
                              <button
                                type="button"
                                disabled={uploadingComprobante}
                                onClick={() => comprobanteRef.current?.click()}
                                className="relative w-full overflow-hidden rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed"
                              >
                                <span
                                  className="pointer-events-none absolute inset-y-0 left-0 rounded-[5px] bg-emerald-500/25 transition-none"
                                  style={uploadingComprobante
                                    ? { animation: "btn-fill 5s ease-out forwards" }
                                    : { width: 0 }}
                                />
                                <span className="relative z-10 flex items-center justify-center gap-1.5">
                                  <Upload className="h-3.5 w-3.5 shrink-0" />
                                  {uploadingComprobante ? "Cargando..." : "Cargar comprobante de la reserva"}
                                </span>
                              </button>
                              <input
                                ref={comprobanteRef}
                                type="file"
                                accept="application/pdf,image/jpeg,image/jpg,image/heic,image/heif,.pdf,.jpg,.jpeg,.heic,.heif"
                                className="hidden"
                                onChange={handleComprobanteUpload}
                              />
                            </div>
                            {coordDraft.logistics.espacio_comprobante_url && (
                              <div className="flex items-center gap-1.5 text-xs bg-muted/50 px-2 py-1.5 rounded-md">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-green-600" />
                                <a
                                  href={coordDraft.logistics.espacio_comprobante_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="truncate hover:underline text-foreground"
                                >
                                  {coordDraft.logistics.espacio_comprobante_nombre ?? "Comprobante"}
                                </a>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>}

                      {showLogisticsSections && <AccordionItem value="arreglo" className={accordionItemClass(secArreglo)}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">Arreglo y preparación</span>
                            <span className="ml-auto mr-2">{dot(secArreglo)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-1">
                            {/* Presupuesto — al inicio */}
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                  checked={!!coordDraft.logistics.arreglo_necesita_presupuesto}
                                  onCheckedChange={(v) => setLog("arreglo_necesita_presupuesto", v)} />
                                <span className="text-xs text-muted-foreground">Necesito solicitar presupuesto</span>
                              </label>
                              {coordDraft.logistics.arreglo_necesita_presupuesto && (
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant={coordDraft.logistics.arreglo_presupuesto_solicitado ? "default" : "outline"}
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setArregloBudgetOpen(true)}
                                  >
                                    {coordDraft.logistics.arreglo_presupuesto_solicitado ? "✓ Presupuesto solicitado" : "Solicitar presupuesto"}
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Task cards */}
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground block">Tareas</Label>
                              {arregloTasks.map((task, i) => (
                                <div key={i} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 space-y-2">
                                      <div>
                                        <Label className="text-[11px] text-muted-foreground mb-0.5 block">Persona asignada</Label>
                                        <MemberAutocomplete
                                          value={task.persona}
                                          options={memberOptions}
                                          placeholder="Nombre del miembro"
                                          className="h-7 text-sm"
                                          onChange={(v) => {
                                            const updated = [...arregloTasks];
                                            updated[i] = { ...updated[i], persona: v };
                                            setArregloTasks(updated);
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] text-muted-foreground mb-0.5 block">Asignación</Label>
                                        <Input
                                          className="h-7 text-sm"
                                          placeholder="Ej: Decorar el salón"
                                          value={task.asignacion}
                                          onChange={(e) => {
                                            const updated = [...arregloTasks];
                                            updated[i] = { ...updated[i], asignacion: e.target.value };
                                            setArregloTasks(updated);
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] text-muted-foreground mb-0.5 block">Hora</Label>
                                        <Input
                                          type="time"
                                          className="h-7 text-sm"
                                          value={task.hora}
                                          onChange={(e) => {
                                            const updated = [...arregloTasks];
                                            updated[i] = { ...updated[i], hora: e.target.value };
                                            setArregloTasks(updated);
                                          }}
                                        />
                                      </div>
                                    </div>
                                    {arregloTasks.length > 1 && (
                                      <button
                                        type="button"
                                        className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
                                        onClick={() => setArregloTasks(arregloTasks.filter((_, j) => j !== i))}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setArregloTasks([...arregloTasks, { persona: "", asignacion: "", hora: "" }])}
                              >
                                <Plus className="h-3 w-3" /> Añadir tarea
                              </button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>}

                      {showLogisticsSections && <AccordionItem value="equipo" className={accordionItemClass(secEquipo)}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <Tv2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">Equipo y tecnología</span>
                            <span className="ml-auto mr-2">{dot(secEquipo)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
                                <Input className="h-8 text-sm" placeholder="Nombre"
                                  value={coordDraft.logistics.equipo_responsable ?? ""}
                                  onChange={(e) => setLog("equipo_responsable", e.target.value)} />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
                                <Input type="date" className="h-8 text-sm"
                                  value={coordDraft.logistics.equipo_fecha ?? ""}
                                  onChange={(e) => setLog("equipo_fecha", e.target.value || null)} />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Lista de equipo / notas</Label>
                              <Textarea className="text-sm min-h-[56px] resize-none" placeholder="Micrófono, proyector, pila bautismal..."
                                value={coordDraft.logistics.equipo_lista ?? ""}
                                onChange={(e) => setLog("equipo_lista", e.target.value)} />
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>}

                      {showLogisticsSections && <AccordionItem value="refrigerio" className={accordionItemClass(secRefrigerio)}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <Utensils className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">Refrigerio</span>
                            <span className="ml-auto mr-2">{dot(secRefrigerio)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-1">
                            {/* Presupuesto — al inicio */}
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                  checked={!!coordDraft.logistics.refrigerio_necesita_presupuesto}
                                  onCheckedChange={(v) => setLog("refrigerio_necesita_presupuesto", v)} />
                                <span className="text-xs text-muted-foreground">Necesito solicitar presupuesto</span>
                              </label>
                              {coordDraft.logistics.refrigerio_necesita_presupuesto && (
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant={coordDraft.logistics.refrigerio_presupuesto_solicitado ? "default" : "outline"}
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setRefrigeriBudgetOpen(true)}
                                  >
                                    {coordDraft.logistics.refrigerio_presupuesto_solicitado ? "✓ Presupuesto solicitado" : "Solicitar presupuesto"}
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Qué se preparará */}
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Qué se preparará</Label>
                              <Textarea className="text-sm min-h-[44px] resize-none" placeholder="Ej: Pastas, refrescos, tarta..."
                                value={(coordDraft.logistics.refrigerio_detalle as string | null | undefined) ?? ""}
                                onChange={(e) => setLog("refrigerio_detalle", e.target.value)} />
                            </div>

                            {/* Responsables */}
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground block">Responsables</Label>
                              {refrigerioResponsables.map((name, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="flex-1">
                                    <MemberAutocomplete
                                      value={name}
                                      options={memberOptions}
                                      placeholder="Nombre del miembro"
                                      className="h-7 text-sm"
                                      onChange={(v) => {
                                        const updated = [...refrigerioResponsables];
                                        updated[i] = v;
                                        setRefrigerioResponsables(updated);
                                      }}
                                    />
                                  </div>
                                  {refrigerioResponsables.length > 1 && (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive shrink-0"
                                      onClick={() => setRefrigerioResponsables(refrigerioResponsables.filter((_, j) => j !== i))}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setRefrigerioResponsables([...refrigerioResponsables, ""])}
                              >
                                <Plus className="h-3 w-3" /> Añadir responsable
                              </button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>}

                      {showLogisticsSections && <AccordionItem value="limpieza" className={accordionItemClass(secLimpieza)}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">Limpieza</span>
                            <span className="ml-auto mr-2">{dot(secLimpieza)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
                                <Input className="h-8 text-sm" placeholder="Nombre"
                                  value={coordDraft.logistics.limpieza_responsable ?? ""}
                                  onChange={(e) => setLog("limpieza_responsable", e.target.value)} />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
                                <Input type="date" className="h-8 text-sm"
                                  value={coordDraft.logistics.limpieza_fecha ?? ""}
                                  onChange={(e) => setLog("limpieza_fecha", e.target.value || null)} />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Notas / tareas</Label>
                              <Textarea className="text-sm min-h-[44px] resize-none"
                                value={coordDraft.logistics.limpieza_notas ?? ""}
                                onChange={(e) => setLog("limpieza_notas", e.target.value)} />
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>}

                      {/* Ropa bautismal — líder misional */}
                      {showMisionSections && <AccordionItem value="ropa" className={accordionItemClass(secRopa)}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1">
                            <Shirt className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">Ropa bautismal</span>
                            <span className="ml-auto mr-2">{dot(secRopa)}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 pt-1">
                            {/* Prueba de ropa */}
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prueba de ropa</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
                                  <Input type="date" className="h-8 text-sm"
                                    value={coordDraft.baptismDetails.prueba_fecha ?? ""}
                                    onChange={(e) => setBap("prueba_fecha", e.target.value || null)} />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
                                  <MemberAutocomplete
                                    value={coordDraft.baptismDetails.prueba_responsable ?? ""}
                                    options={memberOptions}
                                    placeholder="Nombre del miembro"
                                    className="h-8 text-sm"
                                    onChange={(v) => setBap("prueba_responsable", v)}
                                  />
                                </div>
                              </div>
                            </div>
                            {/* Recojo de ropa mojada */}
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recojo de ropa mojada</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
                                  <p className="text-sm text-foreground px-1 h-8 flex items-center">
                                    {service?.service_at ? formatServiceDate(service.service_at) : "—"}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
                                  <MemberAutocomplete
                                    value={coordDraft.baptismDetails.ropa_responsable ?? ""}
                                    options={memberOptions}
                                    placeholder="Nombre del miembro"
                                    className="h-8 text-sm"
                                    onChange={(v) => setBap("ropa_responsable", v)}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>}

                      {/* Logistics status card — obispo + líder misional */}
                      {showLogisticsStatus && (() => {
                        const task = serviceTaskQuery.data;
                        const statusLabel = task?.status === "completed" ? "Completado"
                          : task?.status === "in_progress" ? "En progreso"
                          : task ? "Pendiente" : "Sin asignar";
                        const statusColor = task?.status === "completed" ? "bg-green-500"
                          : task?.status === "in_progress" ? "bg-primary"
                          : "bg-muted-foreground/30";
                        return (
                          <div className={`border rounded-lg px-3 py-3 transition-colors ${task?.status === "completed" ? "border-primary/40 bg-primary/5" : ""}`}>
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${statusColor}`} />
                              <span className="text-sm font-medium flex-1">Logística de coordinación</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                task?.status === "completed" ? "bg-green-100 text-green-700"
                                : task?.status === "in_progress" ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                              }`}>{statusLabel}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 pl-4">
                              Reserva de ambientes, arreglo y preparación, equipo, refrigerio y limpieza — a cargo del líder de actividades
                            </p>
                          </div>
                        );
                      })()}
                    </Accordion>

                    {/* Smart save button */}
                    <Button
                      className="w-full"
                      onClick={() => saveCoordMutation.mutate(coordDraft, {
                        onSuccess: () => {
                          if (allCoordComplete) {
                            setActiveTab("checklist");
                          } else {
                            const pending = totalSections - coordSectionsComplete;
                            toast({
                              title: "Coordinación guardada",
                              description: `${pending} sección${pending !== 1 ? "es" : ""} pendiente${pending !== 1 ? "s" : ""}`,
                            });
                          }
                        },
                      })}
                      disabled={saveCoordMutation.isPending}
                    >
                      {saveCoordMutation.isPending
                        ? "Guardando..."
                        : allCoordComplete
                          ? "Guardar y ver Resumen →"
                          : "Guardar coordinación"}
                    </Button>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Budget request dialogs */}
    <BudgetRequestDialog
      open={arregloBudgetOpen}
      onOpenChange={setArregloBudgetOpen}
      defaultDescription="Arreglo y preparación del servicio bautismal"
      onSuccess={() => setLog("arreglo_presupuesto_solicitado", true)}
    />
    <BudgetRequestDialog
      open={refrigerioBudgetOpen}
      onOpenChange={setRefrigeriBudgetOpen}
      defaultDescription="Refrigerio para el servicio bautismal"
      onSuccess={() => setLog("refrigerio_presupuesto_solicitado", true)}
    />

    {/* Interview edit dialog */}
    <Dialog open={!!interviewEdit} onOpenChange={(v) => { if (!v) setInterviewEdit(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{interviewEdit?.nombre}</DialogTitle>
          <p className="text-xs text-muted-foreground pt-0.5">Entrevista bautismal</p>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Fecha propuesta</Label>
            <Input
              type="date"
              className="h-8 text-sm"
              value={interviewEdit?.fechaInvitado ?? ""}
              onChange={(e) => setInterviewEdit((prev) => prev ? { ...prev, fechaInvitado: e.target.value } : null)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Fecha completada</Label>
            <Input
              type="date"
              className="h-8 text-sm"
              value={interviewEdit?.fechaCumplido ?? ""}
              onChange={(e) => setInterviewEdit((prev) => prev ? { ...prev, fechaCumplido: e.target.value } : null)}
            />
          </div>
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" size="sm" onClick={() => setInterviewEdit(null)}>Cancelar</Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={editInterviewMutation.isPending}
            onClick={() => interviewEdit && editInterviewMutation.mutate({
              personaId: interviewEdit.personaId,
              fechaInvitado: interviewEdit.fechaInvitado,
              fechaCumplido: interviewEdit.fechaCumplido,
            })}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Interview completion confirmation dialog */}
    <Dialog open={!!interviewConfirm} onOpenChange={(v) => { if (!v) setInterviewConfirm(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{interviewConfirm?.nombre}</DialogTitle>
          <p className="text-xs text-muted-foreground pt-0.5">Entrevista bautismal</p>
        </DialogHeader>
        {interviewConfirm?.step === "ask" && (
          <div className="space-y-4 py-1">
            <p className="text-sm">
              ¿Se completó la entrevista en la fecha prevista?{" "}
              <span className="font-medium">{formatDisplayDate(interviewConfirm.fechaInvitado)}</span>
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                onClick={() => markInterviewCompleteMutation.mutate({
                  personaId: interviewConfirm.personaId,
                  fecha: interviewConfirm.fechaInvitado,
                })}
                disabled={markInterviewCompleteMutation.isPending}>
                Sí
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                size="sm"
                onClick={() => setInterviewConfirm((prev) => prev ? { ...prev, step: "date" } : null)}>
                No, ingresar fecha
              </Button>
            </div>
          </div>
        )}
        {interviewConfirm?.step === "date" && (
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Fecha real de la entrevista</Label>
              <Input
                type="date"
                className="h-8 text-sm"
                value={interviewConfirm.customDate}
                onChange={(e) => setInterviewConfirm((prev) => prev ? { ...prev, customDate: e.target.value } : null)}
              />
            </div>
            <DialogFooter className="flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInterviewConfirm((prev) => prev ? { ...prev, step: "ask" } : null)}>
                Atrás
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!interviewConfirm.customDate || markInterviewCompleteMutation.isPending}
                onClick={() => markInterviewCompleteMutation.mutate({
                  personaId: interviewConfirm.personaId,
                  fecha: interviewConfirm.customDate,
                })}>
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

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

type SectionType = PersonaTipo | "servicios_bautismales";

interface BaptismService {
  id: string;
  candidate_persona_id: string | null;
  persona_nombre: string;
  candidates: Array<{ id: string; nombre: string }> | null;
  fecha_bautismo: string | null;
  service_at: string;
  location_name: string;
  location_address: string | null;
  maps_url: string | null;
  status: string;
  approval_status: string;
  approval_comment: string | null;
  prep_deadline_at: string;
}

export default function MissionWork() {
  const { user } = useAuth();
  const [section, setSection] = useState<SectionType | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<BaptismService | null>(null);
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [serviceInitialEditMode, setServiceInitialEditMode] = useState(false);

  const accessQuery = useQuery<{ allowed: boolean }>({
    queryKey: ["/api/mission/access"],
  });

  const nuevoQuery = usePersonas("nuevo");
  const regresandoQuery = usePersonas("regresando");
  const ensenandoQuery = usePersonas("enseñando");

  const baptismServicesQuery = useQuery<BaptismService[]>({
    queryKey: ["/api/mission/baptism-services"],
    queryFn: () => missionFetch("/api/mission/baptism-services"),
  });

  const qc = useQueryClient();
  const deleteServiceMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/mission/baptism-services/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/baptism-services"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", "enseñando"] });
      setServiceSheetOpen(false);
      setSelectedService(null);
    },
  });

  const totalNuevo = nuevoQuery.data?.length ?? 0;
  const totalRegresando = regresandoQuery.data?.length ?? 0;
  const totalEnsenando = ensenandoQuery.data?.length ?? 0;
  const totalBautismos = baptismServicesQuery.data?.length ?? 0;

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

  // ── Baptism services section ──────────────────────────────
  if (section === "servicios_bautismales") {
    const services = baptismServicesQuery.data ?? [];
    const canDeleteService = user?.role === "obispo" || user?.role === "consejero_obispo";
    const MESES_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const parseServiceDate = (iso: string) => {
      const datePart = iso.split(/[T ]/)[0];
      const d = new Date(datePart + "T12:00:00");
      return isNaN(d.getTime()) ? null : d;
    };

    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setSection(null)}>
            <ChevronRight className="h-4 w-4 rotate-180" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold mb-1">Servicios Bautismales</h1>
            <p className="text-sm text-muted-foreground">Planificación y programa de los servicios bautismales</p>
          </div>
        </div>

        {baptismServicesQuery.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : services.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">
            <Waves className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay servicios bautismales programados.</p>
            <p className="text-xs mt-1">Se crean automáticamente al registrar una fecha bautismal.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {services.map((svc) => {
              const d = parseServiceDate(svc.service_at);
              const approvalColor =
                svc.approval_status === "approved" ? "bg-green-500/10 text-green-600" :
                svc.approval_status === "pending_approval" ? "bg-yellow-500/10 text-yellow-600" :
                svc.approval_status === "needs_revision" ? "bg-red-500/10 text-red-600" :
                "bg-muted/60 text-muted-foreground";
              const approvalLabel =
                svc.approval_status === "approved" ? "Aprobado" :
                svc.approval_status === "pending_approval" ? "Pendiente" :
                svc.approval_status === "needs_revision" ? "Revisión" : "Borrador";
              const names = svc.candidates && svc.candidates.length > 0
                ? svc.candidates.map(c => c.nombre)
                : [svc.persona_nombre];

              return (
                <div
                  key={svc.id}
                  className="group flex items-stretch rounded-xl bg-card hover:bg-accent/30 transition-all cursor-pointer overflow-hidden border"
                  onClick={() => { setSelectedService(svc); setServiceInitialEditMode(false); setServiceSheetOpen(true); }}
                >
                  {/* Date block */}
                  {d ? (
                    <div className="flex flex-col items-center justify-center px-4 py-3 min-w-[52px] shrink-0 bg-muted/20">
                      <span className="text-lg font-black leading-none tabular-nums">{d.getUTCDate()}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{MESES_SHORT[d.getUTCMonth()]}</span>
                    </div>
                  ) : null}

                  {/* Body */}
                  <div className="flex-1 px-3.5 py-2.5 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${approvalColor}`}>
                        {approvalLabel}
                      </span>
                    </div>
                    {names.map((n, i) => (
                      <p key={i} className="text-sm font-semibold truncate leading-tight">{n}</p>
                    ))}
                    <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{svc.location_name}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-center justify-center gap-0.5 px-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-all"
                      title="Editar"
                      onClick={() => { setSelectedService(svc); setServiceInitialEditMode(true); setServiceSheetOpen(true); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {canDeleteService && (
                      <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                        title="Eliminar"
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el servicio bautismal de ${names.join(", ")}? Se borrará el programa y se eliminará la fecha de bautismo de los candidatos.`)) {
                            deleteServiceMutation.mutate(svc.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <BaptismalServiceSheet
          service={selectedService}
          open={serviceSheetOpen}
          initialEditMode={serviceInitialEditMode}
          onOpenChange={(v) => {
            setServiceSheetOpen(v);
            if (!v) { setSelectedService(null); setServiceInitialEditMode(false); }
          }}
          userRole={user?.role}
        />
      </div>
    );
  }

  // ── Persona section view ───────────────────────────────────
  if (section) {
    const meta = SECTION_META[section as PersonaTipo];
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

        <TabContent tipo={section as PersonaTipo} onSelect={handleSelect} />

        <PersonaDetailSheet
          persona={livePersona}
          open={sheetOpen}
          onOpenChange={(v) => {
            setSheetOpen(v);
            if (!v) setSelectedPersona(null);
          }}
          tipo={selectedPersona?.tipo ?? (section as PersonaTipo)}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        {/* Baptism services card */}
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setSection("servicios_bautismales")}
        >
          <CardContent className="p-6">
            {baptismServicesQuery.isLoading ? (
              <Skeleton className="h-8 w-12 mb-2" />
            ) : (
              <p className="text-3xl font-bold mb-1">{totalBautismos}</p>
            )}
            <p className="font-medium mb-1">Servicios Bautismales</p>
            <p className="text-xs text-muted-foreground">Planificación y programa de bautismos</p>
            <div className="flex items-center gap-1 mt-4 text-xs text-primary">
              Ver lista <ChevronRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
