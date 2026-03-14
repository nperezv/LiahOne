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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  proximoEvento?: string | null;
  notas?: string | null;
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

function getLastSundays(n = 6): Date[] {
  const sundays: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  for (let i = n - 1; i >= 0; i--) {
    const s = new Date(d);
    s.setDate(d.getDate() - i * 7);
    sundays.push(s);
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

function formatMemberTime(dateStr: string): string {
  const start = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mes${months !== 1 ? "es" : ""}`;
  const years = Math.floor(months / 12);
  return `${years} año${years !== 1 ? "s" : ""}`;
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
                  <CheckCircle2 className="h-5 w-5 text-blue-500 fill-blue-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
            ) : (
              <span title={iso}>
                {attended ? (
                  <CheckCircle2 className="h-5 w-5 text-blue-500 fill-blue-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
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
// AddPersonaDialog
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [fechaPrimerContacto, setFechaPrimerContacto] = useState(
    new Date().toISOString().split("T")[0]
  );

  const createMutation = useMutation({
    mutationFn: (data: { nombre: string; tipo: PersonaTipo; fechaPrimerContacto: string }) =>
      apiRequest("POST", "/api/mission/personas", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
      toast({ title: "Persona agregada" });
      setNombre("");
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    createMutation.mutate({ nombre: nombre.trim(), tipo, fechaPrimerContacto });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar miembro</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nombre completo</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo"
              autoFocus
            />
          </div>
          <div>
            <Label>Fecha de primer contacto</Label>
            <Input
              type="date"
              value={fechaPrimerContacto}
              onChange={(e) => setFechaPrimerContacto(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
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
// BooleanRow helper
// ============================================================

function BooleanRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onToggle} />
    </div>
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

  const sundays = useMemo(() => getLastSundays(6), []);

  // Amigo add state
  const [newAmigoName, setNewAmigoName] = useState("");
  const [newAmigoMiembro, setNewAmigoMiembro] = useState(true);

  const addAmigoMutation = useMutation({
    mutationFn: (data: { nombre: string; es_miembro: boolean }) =>
      apiRequest("POST", `/api/mission/personas/${id}/amigos`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "amigos"] });
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", tipo] });
      setNewAmigoName("");
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

  // Sesion edit state
  const [editSesiones, setEditSesiones] = useState(false);

  const toggleSesionMutation = useMutation({
    mutationFn: (data: {
      principio_id: number;
      sesion_num: number;
      miembro_presente: boolean;
    }) => apiRequest("PUT", `/api/mission/personas/${id}/sesiones`, data),
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

  // Llamamiento
  const [llamamientoEdit, setLlamamientoEdit] = useState(false);
  const [llamamientoVal, setLlamamientoVal] = useState("");
  const llamamientoMutation = useMutation({
    mutationFn: (nombre: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}/llamamiento`, { nombre }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "llamamiento"] });
      setLlamamientoEdit(false);
      toast({ title: "Guardado" });
    },
  });

  // Ministración
  const [ministracionEdit, setMinistracionEdit] = useState(false);
  const [ministracionVal, setMinistracionVal] = useState("");
  const ministracionMutation = useMutation({
    mutationFn: (descripcion: string | null) =>
      apiRequest("PUT", `/api/mission/personas/${id}/ministracion`, { descripcion }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mission/personas", id, "ministracion"] });
      setMinistracionEdit(false);
      toast({ title: "Guardado" });
    },
  });

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
    mutationFn: ({ key, fecha }: { key: string; fecha: string | null }) =>
      apiRequest("PUT", `/api/mission/personas/${id}/compromisos-bautismo/${key}`, {
        fecha_invitado: fecha,
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
          <SheetTitle className="flex items-center gap-2">
            <User2 className="h-5 w-5 text-muted-foreground" />
            {persona.nombre}
            <Badge variant="outline" className="ml-2 text-xs">
              {tipo === "nuevo"
                ? "Nuevo"
                : tipo === "regresando"
                ? "Regresando"
                : "Enseñando"}
            </Badge>
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Primer contacto: {formatDisplayDate(persona.fechaPrimerContacto)} ·{" "}
            {formatMemberTime(persona.fechaPrimerContacto)}
          </p>
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
                editable
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => deleteAmigoMutation.mutate(a.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Nombre del amigo"
                  value={newAmigoName}
                  onChange={(e) => setNewAmigoName(e.target.value)}
                  className="h-8 text-sm"
                />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={newAmigoMiembro}
                    onChange={(e) => setNewAmigoMiembro(e.target.checked)}
                    className="h-3 w-3"
                  />
                  miembro
                </label>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!newAmigoName.trim()}
                  onClick={() => {
                    addAmigoMutation.mutate({
                      nombre: newAmigoName.trim(),
                      es_miembro: newAmigoMiembro,
                    });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
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
                {llamamientoEdit ? (
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-sm"
                      value={llamamientoVal}
                      onChange={(e) => setLlamamientoVal(e.target.value)}
                      placeholder="Nombre del llamamiento"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => llamamientoMutation.mutate(llamamientoVal || null)}
                    >
                      Guardar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setLlamamientoEdit(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {llamamiento.nombre || <span className="text-muted-foreground">Sin llamamiento</span>}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setLlamamientoVal(llamamiento.nombre || "");
                        setLlamamientoEdit(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </section>
            )}

            {/* Ministración (nuevo/regresando) */}
            {tipo !== "enseñando" && ministracion !== undefined && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Ministración
                </h3>
                {ministracionEdit ? (
                  <div className="space-y-1">
                    <Textarea
                      className="text-sm"
                      value={ministracionVal}
                      onChange={(e) => setMinistracionVal(e.target.value)}
                      placeholder="Descripción de ministración"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() => ministracionMutation.mutate(ministracionVal || null)}
                      >
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setMinistracionEdit(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="text-sm">
                      {ministracion.descripcion || (
                        <span className="text-muted-foreground">Sin descripción</span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => {
                        setMinistracionVal(ministracion.descripcion || "");
                        setMinistracionEdit(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </section>
            )}

            {/* Otros compromisos (enseñando only) */}
            {tipo === "enseñando" && otrosCompromisos && (
              <section>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  Otros compromisos
                </h3>
                <BooleanRow
                  label="Conocer al obispo"
                  value={otrosCompromisos.conocerObispo}
                  onToggle={(v) =>
                    otrosCompromisosMutation.mutate({ ...otrosCompromisos, conocerObispo: v })
                  }
                />
                <BooleanRow
                  label="Historia familiar"
                  value={otrosCompromisos.historiaFamiliar}
                  onToggle={(v) =>
                    otrosCompromisosMutation.mutate({ ...otrosCompromisos, historiaFamiliar: v })
                  }
                />
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
                />
                <BooleanRow
                  label="Bautismo por antepasados"
                  value={templo.bautismoAntepasados}
                  onToggle={(v) => temploMutation.mutate({ ...templo, bautismoAntepasados: v })}
                />
                <BooleanRow
                  label="Investido"
                  value={templo.investido}
                  onToggle={(v) => temploMutation.mutate({ ...templo, investido: v })}
                />
                <BooleanRow
                  label="Sellado a padres"
                  value={templo.selladoPadres}
                  onToggle={(v) => temploMutation.mutate({ ...templo, selladoPadres: v })}
                />
                <BooleanRow
                  label="Sellado a cónyuge"
                  value={templo.selladoConyuge}
                  onToggle={(v) => temploMutation.mutate({ ...templo, selladoConyuge: v })}
                />
                <div className="mt-2">
                  <Label className="text-xs">Fecha califica investidura</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm mt-1"
                    value={templo.fechaCalificaInvestidura || ""}
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Principios
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setEditSesiones((v) => !v)}
                >
                  {editSesiones ? "Listo" : <><Pencil className="h-3 w-3 mr-1" />Editar</>}
                </Button>
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
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: p.maxSesiones }, (_, i) => {
                          const sesNum = i + 1;
                          const key = `${p.id}-${sesNum}`;
                          const present = sesionMap[key] ?? false;
                          const exists = sesiones.some(
                            (s) => s.principioId === p.id && s.sesionNum === sesNum
                          );
                          return editSesiones ? (
                            <button
                              key={sesNum}
                              type="button"
                              onClick={() =>
                                toggleSesionMutation.mutate({
                                  principio_id: p.id,
                                  sesion_num: sesNum,
                                  miembro_presente: !present,
                                })
                              }
                              className="focus:outline-none"
                              title={`Sesión ${sesNum}`}
                            >
                              {present ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500 fill-green-500" />
                              ) : exists ? (
                                <CheckCircle2 className="h-4 w-4 text-blue-400 fill-blue-200" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          ) : (
                            <span key={sesNum} title={`Sesión ${sesNum}`}>
                              {present ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500 fill-green-500" />
                              ) : exists ? (
                                <CheckCircle2 className="h-4 w-4 text-blue-400 fill-blue-200" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
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
                  onToggle={(v) =>
                    selfRelianceMutation.mutate({ ...selfReliance, resilienciaEmocional: v })
                  }
                />
                <BooleanRow
                  label="Finanzas personales"
                  value={selfReliance.finanzasPersonales}
                  onToggle={(v) =>
                    selfRelianceMutation.mutate({ ...selfReliance, finanzasPersonales: v })
                  }
                />
                <BooleanRow
                  label="Negocio"
                  value={selfReliance.negocio}
                  onToggle={(v) =>
                    selfRelianceMutation.mutate({ ...selfReliance, negocio: v })
                  }
                />
                <BooleanRow
                  label="Educación y empleo"
                  value={selfReliance.educacionEmpleo}
                  onToggle={(v) =>
                    selfRelianceMutation.mutate({ ...selfReliance, educacionEmpleo: v })
                  }
                />
                <BooleanRow
                  label="Buscar empleo"
                  value={selfReliance.buscarEmpleo}
                  onToggle={(v) =>
                    selfRelianceMutation.mutate({ ...selfReliance, buscarEmpleo: v })
                  }
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
                    <div key={c.commitmentKey} className="flex items-center justify-between gap-2">
                      <span className="text-sm flex-1">{c.nombre}</span>
                      <Input
                        type="date"
                        className="h-7 text-xs w-36"
                        value={c.fechaInvitado || ""}
                        onChange={(e) =>
                          compBautismoMutation.mutate({
                            key: c.commitmentKey,
                            fecha: e.target.value || null,
                          })
                        }
                      />
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
// PersonaTable
// ============================================================

function PersonaTable({
  personas,
  sundays,
  onSelect,
  tipo,
}: {
  personas: Persona[];
  sundays: Date[];
  onSelect: (p: Persona) => void;
  tipo: PersonaTipo;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Persona</TableHead>
          <TableHead>Asistencia</TableHead>
          <TableHead>Amigos / Info</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {personas.map((p) => (
          <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50">
            {/* Col 1: Name */}
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{p.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {formatMemberTime(p.fechaPrimerContacto)}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5 w-fit"
                >
                  Ver detalles
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </TableCell>

            {/* Col 2: Attendance */}
            <TableCell>
              <AttendanceGrid asistencia={p.asistencia} sundays={sundays} />
            </TableCell>

            {/* Col 3: Friends + extra */}
            <TableCell>
              <div className="flex flex-col gap-1">
                <span
                  className={
                    p.amigosCount === 0
                      ? "text-sm font-semibold text-destructive"
                      : "text-sm font-semibold"
                  }
                >
                  <Users className="inline h-3 w-3 mr-1" />
                  {p.amigosCount} amigo{p.amigosCount !== 1 ? "s" : ""}
                </span>
                {tipo === "enseñando" && (
                  <>
                    {p.fechaBautismo && (
                      <span className="text-xs text-muted-foreground">
                        <CalendarDays className="inline h-3 w-3 mr-1" />
                        Bautismo: {formatDisplayDate(p.fechaBautismo)}
                      </span>
                    )}
                    {p.proximoEvento && (
                      <span className="text-xs text-muted-foreground">
                        Próx. evento: {formatDisplayDate(p.proximoEvento)}
                      </span>
                    )}
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {personas.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
              No hay personas en esta lista
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// ============================================================
// TabContent
// ============================================================

function TabContent({
  tipo,
  sundays,
  onSelect,
}: {
  tipo: PersonaTipo;
  sundays: Date[];
  onSelect: (p: Persona) => void;
}) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = usePersonas(tipo);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div>
      {/* Controls bar */}
      {(tipo === "regresando" || tipo === "enseñando") && (
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {tipo === "regresando" && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar miembro
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded" />
          ))}
        </div>
      ) : (
        <PersonaTable personas={filtered} sundays={sundays} onSelect={onSelect} tipo={tipo} />
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

  const sundays = useMemo(() => getLastSundays(6), []);

  const accessQuery = useQuery<{ allowed: boolean }>({
    queryKey: ["/api/mission/access"],
  });

  const nuevoQuery = usePersonas("nuevo");
  const regresandoQuery = usePersonas("regresando");
  const ensenandoQuery = usePersonas("enseñando");

  const totalNuevo = nuevoQuery.data?.length ?? 0;
  const totalRegresando = regresandoQuery.data?.length ?? 0;
  const totalEnsenando = ensenandoQuery.data?.length ?? 0;

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

        <TabContent tipo={section} sundays={sundays} onSelect={handleSelect} />

        <PersonaDetailSheet
          persona={selectedPersona}
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
