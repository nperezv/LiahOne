import { useCallback, useEffect, useMemo, useRef, useState, Component } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FileText, Edit, Trash2, Download, X, ChevronRight, Music, Handshake, Users, BookOpen, Megaphone, Eye, Calendar, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, normalizeMemberName, shortMemberName, shortUserName } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSacramentalMeetings,
  useCreateSacramentalMeeting,
  useUpdateSacramentalMeeting,
  useDeleteSacramentalMeeting,
  useOrganizations,
  useUsers,
  useHymns,
  useMembers,
  useAllMemberCallings,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { generateSacramentalMeetingPDF } from "@/lib/pdf-utils";
import { exportSacramentalMeetings } from "@/lib/export";
import { SacramentalProgramView } from "@/components/sacramental-program-view";

// ─── Types ────────────────────────────────────────────────────────────────────
type HymnOption = { value: string; number: number; title: string };
type MemberOption = { value: string };
type TabId = "general" | "autoridades" | "himnos" | "oraciones" | "mensajes" | "asuntos" | "preview";

// ─── HymnAutocomplete ─────────────────────────────────────────────────────────
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

// Stable empty array — prevents the memberCallings default `[]` from creating
// a new reference every render, which would cascade through useMemo/useCallback
// and trigger the releases useEffect in an infinite loop.
const EMPTY_CALLINGS: never[] = [];

// ─── MemberAutocomplete ───────────────────────────────────────────────────────
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

// ─── Schema (unchanged) ───────────────────────────────────────────────────────
const meetingSchema = z.object({
  date: z.string().optional(),
  presider: z.string().optional(),
  director: z.string().optional(),
  musicDirector: z.string().optional(),
  pianist: z.string().optional(),
  visitingAuthority: z.string().optional(),
  announcements: z.string().optional(),
  openingHymn: z.string().optional(),
  openingPrayer: z.string().optional(),
  intermediateHymn: z.string().optional(),
  intermediateHymnType: z.enum(["congregation", "choir"]).optional(),
  sacramentHymn: z.string().optional(),
  closingHymn: z.string().optional(),
  closingPrayer: z.string().optional(),
  stakeBusiness: z.string().optional(),
  isTestimonyMeeting: z.boolean().default(false),
  assignments: z.array(z.object({ name: z.string(), assignment: z.string() })).optional(),
});

type MeetingFormValues = z.infer<typeof meetingSchema>;
type MemberFieldName = "musicDirector" | "pianist" | "openingPrayer" | "closingPrayer";

const formatDateForInput = (value?: string | Date | null) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

// ─── UI Sub-components ────────────────────────────────────────────────────────

/** Section header inside the form panel */
const SectionHead = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
      {icon}
    </div>
    <div>
      <div className="text-sm font-semibold leading-tight">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </div>
  </div>
);

/** Collapsible optional block */
const OptBlock = ({
  color, label, sub, checked, onToggle, children,
}: {
  color?: string; label: string; sub?: string;
  checked: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode;
}) => (
  <div className="border border-border rounded-xl overflow-hidden mb-2">
    <div
      className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
      onClick={() => onToggle(!checked)}
    >
      <div className="flex items-center gap-2.5">
        {color && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
        <div>
          <div className="text-sm font-medium">{label}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </div>
      <Checkbox checked={checked} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
    </div>
    {checked && children && (
      <div className="px-3.5 pb-3.5 pt-2 border-t border-border bg-muted/20">
        {children}
      </div>
    )}
  </div>
);

/** Hymn row — numbered, colored, labeled */
const HymnRow = ({
  num, label, color, children,
}: { num: number; label: string; color: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <div
      className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 mt-2 border"
      style={{ background: `${color}15`, borderColor: `${color}30`, color }}
    >
      {num}
    </div>
    <div className="flex-1 min-w-0">{children}</div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-2.5 shrink-0 min-w-[68px] text-right" style={{ color }}>
      {label}
    </div>
  </div>
);

/** Connector line between hymn rows */
const HymnConnector = () => (
  <div className="ml-3 my-0.5 w-px h-3 bg-border" />
);

/** Meeting list card */
// ─── Meeting status helper ────────────────────────────────────────────────────
const getMeetingStatus = (meetingDate: Date): "live" | "upcoming" | "past" => {
  const now = new Date();
  const meetingDay = new Date(meetingDate);
  // Same calendar day?
  const sameDay =
    meetingDay.getFullYear() === now.getFullYear() &&
    meetingDay.getMonth() === now.getMonth() &&
    meetingDay.getDate() === now.getDate();
  if (sameDay) {
    // "En curso" until 16:00 local time
    const cutoff = new Date(meetingDay);
    cutoff.setHours(16, 0, 0, 0);
    return now < cutoff ? "live" : "past";
  }
  return meetingDay > now ? "upcoming" : "past";
};

const MeetingCard = ({
  meeting, onDetails, onEdit, onDelete, onPDF, onPrograma, canEdit, parsePersonValue, isTestimonyValue,
}: any) => {
  const isTestimony = isTestimonyValue(meeting.isTestimonyMeeting);
  const presider = parsePersonValue(meeting.presider).name;
  const director = parsePersonValue(meeting.director).name;
  const date = new Date(meeting.date);
  const day = date.getDate();
  const month = date.toLocaleDateString("es-ES", { month: "short" });
  const status = getMeetingStatus(date);
  const presideLabel = status === "live" ? "Preside" : status === "upcoming" ? "Presidirá" : "Presidió";
  const direLabel    = status === "live" ? "Dirige"  : status === "upcoming" ? "Dirigirá"  : "Dirigió";

  const hymns = [
    meeting.openingHymn && { label: "Apertura", val: meeting.openingHymn },
    meeting.sacramentHymn && { label: "Sacram.", val: meeting.sacramentHymn },
    meeting.intermediateHymn && { label: "Interm.", val: meeting.intermediateHymn },
    meeting.closingHymn && { label: "Final", val: meeting.closingHymn },
  ].filter(Boolean) as { label: string; val: string }[];
  const speakers = (meeting.discourses || []).filter((d: any) => d.speaker);

  return (
    <div
      className={cn(
        "group flex items-stretch rounded-xl transition-all cursor-pointer overflow-hidden",
        "bg-card hover:bg-accent/30",
        status === "live" && "shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_4px_20px_hsl(var(--primary)/0.08)] hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3),0_6px_24px_hsl(var(--primary)/0.12)]",
        status === "upcoming" && "opacity-50 hover:opacity-75",
        status === "past" && "opacity-60 hover:opacity-100",
      )}
      onClick={() => onPrograma(meeting)}
    >
      {/* Date block — no border, subtle bg shift */}
      <div className={cn(
        "flex flex-col items-center justify-center px-4 py-3 min-w-[52px] shrink-0",
        status === "live" ? "bg-primary/10" : "bg-muted/20",
      )}>
        <span className="text-lg font-black leading-none tabular-nums">{day}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{month}</span>
        {status === "live" && (
          <span className="mt-1.5 text-[7px] font-bold uppercase tracking-widest text-primary leading-none">live</span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 px-3.5 py-2.5 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn(
            "inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
            isTestimony
              ? "bg-teal-500/10 text-teal-400"
              : "bg-amber-500/10 text-amber-400",
          )}>
            {isTestimony ? "Testimonio" : "Regular"}
          </span>
        </div>

        {/* Presider */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold truncate">{presider || "Sin definir"}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{presideLabel}</span>
        </div>

        {/* Director */}
        {director && (
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xs font-medium text-muted-foreground truncate">{director}</span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">{direLabel}</span>
          </div>
        )}

        {/* Music + pianist */}
        {(meeting.musicDirector || meeting.pianist) && (
          <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
            {meeting.musicDirector && `Dir. música: ${meeting.musicDirector}`}
            {meeting.pianist && ` · Pianista: ${meeting.pianist}`}
          </div>
        )}

        {/* Speakers */}
        {speakers.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-2">
            {speakers.slice(0, 3).map((d: any, i: number) => (
              <div key={i} className="flex items-baseline gap-1.5 text-[11px]">
                <span className="text-[10px] text-muted-foreground/50 w-3 shrink-0 font-mono">{i + 1}.</span>
                <span className="font-medium text-muted-foreground truncate">{d.speaker}</span>
                {d.topic && <span className="text-muted-foreground/50 hidden sm:inline truncate">— {d.topic}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Hymns */}
        {hymns.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {hymns.map(({ label, val }, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 bg-muted/40 rounded px-1.5 py-0.5">
                ♪ {label}·{val.split(" - ")[0]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions — no left border */}
      <div className="flex flex-col items-center justify-center gap-0.5 px-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-all"
          onClick={() => onPDF(meeting)} title="Descargar PDF"
        >
          <FileText className="w-3.5 h-3.5" />
        </button>
        {canEdit && (
          <>
            <button
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-all"
              onClick={() => onEdit(meeting)} title="Editar"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
              onClick={() => onDelete(meeting.id)} title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
// ─── Error Boundary ──────────────────────────────────────────────────────────
// Catches render errors so the app never goes fully black.
// The user sees a friendly message and a button to retry.
class SacramentalErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error?.message || "Error desconocido" };
  }
  componentDidCatch(error: Error, info: any) {
    // In production you'd send this to Sentry / your error tracker
    console.error("[SacramentalMeetingPage]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive text-2xl">!</div>
          <div>
            <p className="font-semibold text-sm">Algo salió mal</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">{this.state.error}</p>
          </div>
          <button
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-all"
            onClick={() => this.setState({ hasError: false, error: "" })}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function SacramentalMeetingPageInner() {
  // ── All original state ──
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsMeeting, setDetailsMeeting] = useState<any>(null);
  const [isTestimonyMeeting, setIsTestimonyMeeting] = useState(false);
  const [hasReleasesAndSustainments, setHasReleasesAndSustainments] = useState(false);
  const [hasNewMembers, setHasNewMembers] = useState(false);
  const [hasOrderings, setHasOrderings] = useState(false);
  const [hasChildBlessings, setHasChildBlessings] = useState(false);
  const [hasConfirmations, setHasConfirmations] = useState(false);
  const [hasStakeBusiness, setHasStakeBusiness] = useState(false);
  const [discourses, setDiscourses] = useState<Array<{ speaker: string; topic: string }>>([{ speaker: "", topic: "" }]);
  const [assignments, setAssignments] = useState<Array<{ name: string; assignment: string }>>([{ name: "", assignment: "" }]);
  const [releases, setReleases] = useState<Array<{ name: string; oldCalling: string; organizationId?: string }>>([{ name: "", oldCalling: "" }]);
  const [sustainments, setSustainments] = useState<Array<{ name: string; calling: string; organizationId?: string }>>([{ name: "", calling: "" }]);
  const [newMembers, setNewMembers] = useState<string[]>([""]);
  const [aaronicOrderings, setAaronicOrderings] = useState<string[]>([""]);
  const [childBlessings, setChildBlessings] = useState<string[]>([""]);
  const [confirmations, setConfirmations] = useState<string[]>([""]);
  const [showPastView, setShowPastView] = useState(false);
  const [intermediateHymnType, setIntermediateHymnType] = useState<"congregation" | "choir" | "">("");
  const [directorSelection, setDirectorSelection] = useState("");
  const [directorCustom, setDirectorCustom] = useState("");
  const [directorCustomCalling, setDirectorCustomCalling] = useState("");
  const [presiderSelection, setPresiderSelection] = useState("");
  const [presiderCustomName, setPresiderCustomName] = useState("");
  const [presiderAuthorityType, setPresiderAuthorityType] = useState("");
  const presiderAuthoritySelection = "autoridad_presidente";
  const directorAssignedSelection = "lider_asignado";

  // ── All original data hooks (unchanged) ──
  const { data: members = [] } = useMembers();
  const memberOptions = useMemo(
    () => members.map((m) => shortMemberName(m)).filter((n): n is string => Boolean(n)),
    [members]
  );
  const uniqueMemberOptions = useMemo(
    () => Array.from(new Set(memberOptions)).map((value) => ({ value })),
    [memberOptions]
  );
  const { user } = useAuth();
  const canReadAllMemberCallings = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero"].includes(user?.role || "");
  const { data: memberCallings = EMPTY_CALLINGS } = useAllMemberCallings({ enabled: canReadAllMemberCallings });

  const normalizeText = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const isMusicDirectorCalling = (value: string) => {
    const n = normalizeText(value);
    return n.includes("director de musica") || n.includes("directora de musica") || n.includes("director de coro") || n.includes("directora de coro");
  };
  const isPianistCalling = (value: string) => normalizeText(value).startsWith("pianista");

  const memberCallingsWithMembers = useMemo(() => memberCallings.filter((c) => c.memberName), [memberCallings]);
  const memberCallingsWithoutMembers = useMemo(() => memberCallings.filter((c) => !c.memberName), [memberCallings]);
  const activeMemberCallings = useMemo(() => memberCallingsWithMembers.filter((c) => c.isActive), [memberCallingsWithMembers]);
  const activeVacantCallings = useMemo(() => memberCallingsWithoutMembers.filter((c) => c.isActive), [memberCallingsWithoutMembers]);

  const musicDirectorCandidates = useMemo(() => {
    const names = activeMemberCallings
      .filter((c) => isMusicDirectorCalling(c.callingName))
      .map((c) => normalizeMemberName(c.memberName || "") || c.memberName || "")
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [activeMemberCallings]);

  const pianistCandidates = useMemo(() => {
    const names = activeMemberCallings
      .filter((c) => isPianistCalling(c.callingName))
      .map((c) => normalizeMemberName(c.memberName || "") || c.memberName || "")
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [activeMemberCallings]);

  const callingsByOrgType: Record<string, string[]> = {
    "obispado": ["Obispo", "Primer consejero", "Segundo consejero", "Secretario", "Secretario Ejecutivo", "Secretario Financiero"],
    "cuorum_elderes": ["Presidente", "Primer consejero", "Segundo consejero", "Secretario", "Maestro", "Líder de ministración"],
    "sociedad_socorro": ["Presidenta", "Primera consejera", "Segunda consejera", "Secretaria", "Maestra", "Coordinadora de ministración"],
    "mujeres_jovenes": ["Presidenta", "Primera consejera", "Segunda consejera", "Secretaria", "Asesora de clases", "Especialistas de Mujeres Jóvenes"],
    "hombres_jovenes": ["Presidente del Sacerdocio Aarónico", "Primer consejero del Sacerdocio Aarónico", "Segundo consejero del Sacerdocio Aarónico", "Asesor de Hombres Jóvenes", "Especialista de Hombres Jóvenes", "Presidente de quórum de diáconos", "Primer consejero de quórum de diáconos", "Segundo consejero de quórum de diáconos", "Secretario de quórum de diáconos", "Presidente de quórum de maestros", "Primer consejero de quórum de maestros", "Segundo consejero de quórum de maestros", "Secretario de quórum de maestros", "Presidente de quórum de presbíteros", "Primer ayudante de quórum de presbíteros", "Segundo ayudante de quórum de presbíteros"],
    "primaria": ["Presidenta", "Primera consejera", "Segunda consejera", "Secretaria", "Líder de música", "Pianista", "Maestro", "Maestra", "Líder de guardería"],
    "escuela_dominical": ["Presidente", "Primer consejero", "Segundo consejero", "Secretario", "Maestro", "Maestra"],
    "jas": ["Líder"],
    "barrio": ["Director de música del barrio", "Directora de música del barrio", "Pianista", "Director de coro", "Directora de coro", "Pianista de coro", "Lider de la Obra del Templo e Historia Familiar", "Consultor de Historia Familiar", "Coordinador de Historia Familiar", "Líder misional del barrio", "Misionero de Barrio", "Misionera de Barrio", "Maestro de preparación misional", "Maestra de preparación misional", "Especialista de tecnología", "Líder de autosuficiencia", "Líder de la Noche de hermanamiento", "Representante de Comunicaciones", "Coordinador de actividades", "Coordinadora de actividades", "Coordinador de servicio", "Director de deportes", "Representante de JustServe", "Bibliotecario", "Coordinador de limpieza"],
  };

  const getOrganizationsForReleases = () => (organizations as any[]).filter((o: any) => o.type !== "cuorum_elderes" && o.type !== "obispado");
  const getOrganizationsForSustainments = () => (organizations as any[]).filter((o: any) => o.type !== "cuorum_elderes");
  const getOrganizationType = (orgId?: string) => !orgId ? "" : (organizations as any[]).find((o: any) => o.id === orgId)?.type || "";

  const getCallingsForOrg = (orgId?: string): string[] => {
    if (!orgId) return [];
    return Array.from(new Set(activeMemberCallings.filter((c) => c.organizationId === orgId).map((c) => c.callingName).filter(Boolean)));
  };
  const getVacantCallingsForOrg = (orgId?: string): string[] => {
    if (!orgId) return [];
    const orgType = getOrganizationType(orgId);
    const orgCallings = callingsByOrgType[orgType] || [];
    if (!orgCallings.length) return [];
    const assigned = getCallingsForOrg(orgId).map((c) => normalizeText(c));
    return Array.from(new Set(orgCallings.filter((c) => !assigned.includes(normalizeText(c)))));
  };
  const getCallingsForOrgWithCurrent = (orgId?: string, current?: string) => {
    const callings = getCallingsForOrg(orgId);
    return current && !callings.includes(current) ? [...callings, current] : callings;
  };
  // Para relevos: activos en el sistema + fallback al listado estándar por tipo de org
  const getCallingsForOrgRelease = (orgId?: string, current?: string): string[] => {
    if (!orgId) return [];
    const active = activeMemberCallings
      .filter((c) => c.organizationId === orgId)
      .map((c) => c.callingName)
      .filter(Boolean);
    const orgType = getOrganizationType(orgId);
    const standard = callingsByOrgType[orgType] || [];
    const merged = Array.from(new Set([...active, ...standard]));
    return current && !merged.includes(current) ? [...merged, current] : merged;
  };
  const getVacantCallingsForOrgWithCurrent = (orgId?: string, current?: string) => {
    const callings = getVacantCallingsForOrg(orgId);
    // Include callings being released in this same program — they're effectively free
    const beingReleased = releases
      .filter((r) => r.organizationId === orgId && r.oldCalling)
      .map((r) => r.oldCalling);
    const merged = Array.from(new Set([...callings, ...beingReleased]));
    return current && !merged.includes(current) ? [...merged, current] : merged;
  };
  const getMemberNameForCalling = useCallback((orgId?: string, callingName?: string) => {
    if (!orgId || !callingName) return "";
    const nc = normalizeText(callingName);
    const match = memberCallingsWithMembers.find((c) => c.organizationId === orgId && normalizeText(c.callingName) === nc);
    if (match?.memberName) return match.memberName;
    const fb = memberCallingsWithMembers.filter((c) => normalizeText(c.callingName) === nc);
    return fb.length === 1 ? fb[0]?.memberName || "" : "";
  }, [memberCallingsWithMembers]);
  const getMemberCallingsByName = useCallback((name?: string) => {
    if (!name) return [];
    const nn = normalizeText(name);
    return memberCallingsWithMembers.filter((c) => normalizeText(c.memberName || "") === nn);
  }, [memberCallingsWithMembers]);
  const getCallingsForMemberAndOrg = useCallback((name?: string, orgId?: string) => {
    if (!name || !orgId) return [];
    const nn = normalizeText(name);
    return memberCallingsWithMembers.filter((c) => normalizeText(c.memberName || "") === nn && c.organizationId === orgId);
  }, [memberCallingsWithMembers]);
  const getMatchingOrganizationId = (matches: typeof memberCallingsWithMembers) => {
    const ids = Array.from(new Set(matches.map((c) => c.organizationId).filter(Boolean)));
    return ids.length === 1 ? ids[0] || "" : "";
  };
  const getMatchingCallingName = (matches: typeof memberCallingsWithMembers) => {
    const callings = Array.from(new Set(matches.map((c) => c.callingName).filter(Boolean)));
    return callings.length === 1 ? callings[0] || "" : "";
  };

  const { data: meetings = [] as any[], isLoading = false } = useSacramentalMeetings();
  const { data: organizations = [] as any[] } = useOrganizations();
  const { data: users = [] as any[] } = useUsers();
  const { data: hymns = [] as any[] } = useHymns();
  const createMutation = useCreateSacramentalMeeting();
  const updateMutation = useUpdateSacramentalMeeting();
  const deleteMutation = useDeleteSacramentalMeeting();

  const bishopricMembers = useMemo(() => users.filter((m: any) => ["obispo", "consejero_obispo"].includes(m.role)), [users]);
  const getMemberLabel = (m?: any) => m ? (shortUserName(m) || m?.email || "") : "";
  const parsePersonValue = (value?: string | null) => {
    const trimmed = (value ?? "").toString().trim();
    if (!trimmed) return { name: "", calling: "" };
    if (trimmed.includes("|")) { const [n, c] = trimmed.split("|").map((p) => p.trim()); return { name: n || "", calling: c || "" }; }
    if (trimmed.includes(",")) { const [n, ...cp] = trimmed.split(",").map((p) => p.trim()); return { name: n || "", calling: cp.join(", ").trim() }; }
    const [n, c] = trimmed.split("|").map((p) => p.trim());
    return { name: n || "", calling: c || "" };
  };
  const buildPersonValue = (name: string, calling?: string) => {
    const n = name.trim(); if (!n) return "";
    const c = calling?.trim(); return c ? `${n} | ${c}` : n;
  };
  const bishopricNames = useMemo(() => bishopricMembers.map((m: any) => getMemberLabel(m)).filter(Boolean), [bishopricMembers]);
  const bishopricByName = useMemo(() => { const map = new Map<string, any>(); bishopricMembers.forEach((m: any) => { const l = getMemberLabel(m); if (l) map.set(l, m); }); return map; }, [bishopricMembers]);
  const bishopricNamesKey = bishopricNames.join("|");
  const bishopName = bishopricMembers.find((m: any) => m.role === "obispo");
  const bishopLabel = getMemberLabel(bishopName);
  const obispadoOrgId = useMemo(() => (organizations as any[]).find((o: any) => o.type === "obispado")?.id, [organizations]);
  const obispadoCallingNames = useMemo(() => callingsByOrgType.obispado.map((c) => normalizeText(c)), []);
  const normalizeMemberLabel = (value?: string) => normalizeMemberName(value || "") || value || "";
  const formatBishopricCalling = (calling?: string, role?: string, callingOrder?: number | null) => {
    const trimmed = calling?.trim();
    if (trimmed) {
      const lower = trimmed.toLowerCase(); let label = trimmed;
      if (lower.includes("consejero") && !lower.includes("primer") && !lower.includes("segundo")) {
        if (callingOrder === 1) label = "Primer consejero";
        if (callingOrder === 2) label = "Segundo consejero";
      }
      if (label.toLowerCase().includes("consejero") && !label.toLowerCase().includes("obispado")) return `${label} del Obispado`;
      return label;
    }
    return role === "obispo" ? "Obispo" : "Consejero del Obispado";
  };
  const getBishopricCalling = (name: string) => {
    const member = bishopricByName.get(name); if (!member) return "";
    const nn = normalizeMemberLabel(name);
    const match = memberCallingsWithMembers.find((c) => normalizeMemberLabel(c.memberName || "") === nn && (!obispadoOrgId || c.organizationId === obispadoOrgId) && obispadoCallingNames.includes(normalizeText(c.callingName || "")));
    return formatBishopricCalling(match?.callingName, member.role, match?.callingOrder);
  };
  const isTestimonyValue = (value: any) => typeof value === "string" ? value === "true" : Boolean(value);
  const authorityOptions = useMemo(() => [
    { value: "presidente_estaca", label: "Presidente de estaca", calling: "Presidente de Estaca" },
    { value: "primer_consejero_estaca", label: "1er consejero de la presidencia de estaca", calling: "1er Consejero de la Presidencia de Estaca" },
    { value: "segundo_consejero_estaca", label: "2do consejero de la presidencia de estaca", calling: "2do Consejero de la Presidencia de Estaca" },
    { value: "setenta_area", label: "Setenta de área", calling: "Setenta de Área" },
    { value: "setenta_autoridad_general", label: "Setenta autoridad general", calling: "Setenta Autoridad General" },
    { value: "apostol", label: "Apóstol", calling: "Apóstol" },
  ], []);

  const hymnOptions = useMemo<HymnOption[]>(() => hymns.map((h: any) => ({ value: `${h.number} - ${h.title}`, number: h.number, title: h.title })), [hymns]);
  const hymnsByNumber = useMemo(() => { const map = new Map<number, { number: number; title: string }>(); hymnOptions.forEach((o) => map.set(o.number, { number: o.number, title: o.title })); return map; }, [hymnOptions]);
  const normalizeHymnInput = (value?: string) => {
    const trimmed = value?.trim() || ""; if (!trimmed) return "";
    const match = trimmed.match(/^(\d{1,4})/); if (!match) return trimmed;
    const n = Number.parseInt(match[1], 10); if (Number.isNaN(n)) return trimmed;
    const hymn = hymnsByNumber.get(n); return hymn ? `${hymn.number} - ${hymn.title}` : trimmed;
  };
  const applyHymnNormalization = (fieldName: keyof MeetingFormValues, value: string) => {
    const normalized = normalizeHymnInput(value);
    if (normalized && normalized !== value) form.setValue(fieldName, normalized, { shouldDirty: true });
  };
  const normalizeMemberIfComma = (value?: string) => {
    const v = value || ""; if (!v.includes(",")) return v;
    return normalizeMemberName(v) || v;
  };
  const applyMemberNormalization = (fieldName: MemberFieldName) => {
    const v = form.getValues(fieldName) || "";
    const n = normalizeMemberIfComma(v);
    if (n && n !== v) form.setValue(fieldName, n, { shouldDirty: true });
  };
  const normalizeMemberField = (value?: string) => normalizeMemberIfComma(value);
  const authorityCallingByValue = (value: string) => authorityOptions.find((o) => o.value === value)?.calling || "";

  const canEdit = user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario_ejecutivo";

  const resetMeetingFormState = () => {
    form.reset();
    setDiscourses([{ speaker: "", topic: "" }]);
    setAssignments([{ name: "", assignment: "" }]);
    setReleases([{ name: "", oldCalling: "" }]);
    setSustainments([{ name: "", calling: "" }]);
    setNewMembers([""]);
    setAaronicOrderings([""]);
    setChildBlessings([""]);
    setConfirmations([""]);
    setIntermediateHymnType("");
    setIsTestimonyMeeting(false);
    setHasReleasesAndSustainments(false);
    setHasNewMembers(false);
    setHasOrderings(false);
    setHasChildBlessings(false);
    setHasConfirmations(false);
    setHasStakeBusiness(false);
    setDirectorSelection("");
    setDirectorCustom("");
    setDirectorCustomCalling("");
    setPresiderSelection("");
    setPresiderCustomName("");
    setPresiderAuthorityType("");
  };

  const openPanel = (tab: TabId = "general") => { setActiveTab(tab); setIsPanelOpen(true); };
  const closePanel = () => { setIsPanelOpen(false); setEditingId(null); };

  const handleOpenDetails = (meeting: any) => { setDetailsMeeting(meeting); setIsDetailsOpen(true); };

  const handleEdit = (meeting: any) => {
    setEditingId(meeting.id);
    // Sanitize: replace any null/undefined string fields with "" to prevent render crashes
    const safe = (v: any) => (v == null ? "" : String(v));
    form.reset({
      ...meeting,
      date: formatDateForInput(meeting.date),
      presider: safe(meeting.presider),
      director: safe(meeting.director),
      musicDirector: safe(meeting.musicDirector),
      pianist: safe(meeting.pianist),
      visitingAuthority: safe(meeting.visitingAuthority),
      announcements: safe(meeting.announcements),
      openingHymn: safe(meeting.openingHymn),
      openingPrayer: safe(meeting.openingPrayer),
      intermediateHymn: safe(meeting.intermediateHymn),
      sacramentHymn: safe(meeting.sacramentHymn),
      closingHymn: safe(meeting.closingHymn),
      closingPrayer: safe(meeting.closingPrayer),
      stakeBusiness: safe(meeting.stakeBusiness),
    });
    setIsTestimonyMeeting(meeting.isTestimonyMeeting);
    setDiscourses(meeting.discourses || [{ speaker: "", topic: "" }]);
    setAssignments(meeting.assignments?.length > 0 ? meeting.assignments : [{ name: "", assignment: "" }]);
    setReleases(meeting.releases?.length > 0 ? meeting.releases : [{ name: "", oldCalling: "" }]);
    setSustainments(meeting.sustainments?.length > 0 ? meeting.sustainments : [{ name: "", calling: "" }]);
    setNewMembers(meeting.newMembers || [""]);
    setAaronicOrderings(meeting.aaronicOrderings || [""]);
    setChildBlessings(meeting.childBlessings || [""]);
    setConfirmations(meeting.confirmations || [""]);
    setHasReleasesAndSustainments((meeting.releases?.length || 0) > 0 || (meeting.sustainments?.length || 0) > 0);
    setHasNewMembers((meeting.newMembers?.length || 0) > 0);
    setHasOrderings((meeting.aaronicOrderings?.length || 0) > 0);
    setHasChildBlessings((meeting.childBlessings?.length || 0) > 0);
    setHasConfirmations((meeting.confirmations?.length || 0) > 0);
    setHasStakeBusiness(!!meeting.stakeBusiness);
    const pd = parsePersonValue(meeting.director);
    const isBD = bishopricNames.includes(pd.name);
    setDirectorSelection(isBD ? pd.name : pd.name ? directorAssignedSelection : "");
    setDirectorCustom(isBD ? "" : pd.name);
    setDirectorCustomCalling(isBD ? "" : pd.calling);
    const pp = parsePersonValue(meeting.presider);
    const isBP = bishopricNames.includes(pp.name);
    setPresiderSelection(isBP ? pp.name : pp.name ? presiderAuthoritySelection : "");
    setPresiderCustomName(isBP ? "" : pp.name);
    setPresiderAuthorityType(isBP ? "" : authorityOptions.find((o) => o.calling === pp.calling)?.value || "");
    openPanel("general");
  };

  const handleDelete = (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar esta reunión sacramental?")) deleteMutation.mutate(id);
  };

  const [programMeeting, setProgramMeeting] = useState<any>(null);

  // For the PDF: raw bishopric members (PDF does its own filtering logic)
  const getBishopricForPDF = () =>
    bishopricMembers.map((m: any) => { const name = getMemberLabel(m); return { name, role: m.role, calling: name ? getBishopricCalling(name) : "" }; }).filter((m: any) => m.name);

  // For the HTML viewer: full combined list matching PDF output logic
  const getRecognitionMembers = (meeting: any) => {
    const parseName = (v: string) => { const t = (v ?? "").trim(); return t.includes("|") ? t.slice(0, t.indexOf("|")).trim() : t; };
    const dirName = parseName(String(meeting.director || ""));
    const presName = parseName(String(meeting.presider || ""));

    // Manual visiting authority entries (from the visitingAuthority field)
    const manual = typeof meeting.visitingAuthority === "string"
      ? meeting.visitingAuthority.split(",").map((e: string) => e.trim()).filter((e: string) => {
          if (!e) return false;
          const n = parseName(e);
          return n !== dirName && n !== presName;
        }).map((e: string) => {
          const idx = e.indexOf("|");
          return idx >= 0
            ? { name: e.slice(0, idx).trim(), role: "", calling: e.slice(idx + 1).trim() }
            : { name: e, role: "", calling: "" };
        })
      : [];

    // Auto bishopric entries — only when director is a bishopric member
    const dirIsBishopric = dirName ? bishopricMembers.some((m: any) => getMemberLabel(m) === dirName) : false;
    const auto = dirIsBishopric
      ? bishopricMembers
          .map((m: any) => {
            const name = getMemberLabel(m);
            if (!name || name === dirName || name === presName) return null;
            return { name, role: m.role ?? "", calling: getBishopricCalling(name) };
          })
          .filter(Boolean)
      : [];

    // Combine and deduplicate by name
    const all = [...manual, ...auto] as { name: string; role: string; calling: string }[];
    const seen = new Set<string>();
    return all.filter((m) => { const k = m.name.toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  };

  const handleViewPrograma = (meeting: any) => setProgramMeeting(meeting);

  const handleGeneratePDF = async (meeting: any) => {
    const recognitionMembers = getBishopricForPDF();
    const doc = await generateSacramentalMeetingPDF(meeting, organizations as any[], recognitionMembers);
    doc.save(`programa-sacramental-${new Date(meeting.date).toISOString().split("T")[0]}.pdf`);
  };

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: { date: "", presider: "", director: "", musicDirector: "", pianist: "", visitingAuthority: "", announcements: "", openingHymn: "", openingPrayer: "", intermediateHymn: "", intermediateHymnType: undefined, sacramentHymn: "", closingHymn: "", closingPrayer: "", stakeBusiness: "", isTestimonyMeeting: false },
  });

  const directorValue = useWatch({ control: form.control, name: "director" });
  const presiderValue = useWatch({ control: form.control, name: "presider" });

  // All original effects (unchanged)
  useEffect(() => {
    if (!isPanelOpen || editingId) return;
    // Use presiderValue (useWatch) instead of form.getValues to avoid stale closure
    // in React 18 concurrent mode — form.getValues() can return a stale value between renders.
    if (!presiderValue?.trim() && bishopLabel) { const calling = getBishopricCalling(bishopLabel); form.setValue("presider", buildPersonValue(bishopLabel, calling)); setPresiderSelection(bishopLabel); }
  }, [bishopLabel, editingId, form, isPanelOpen, presiderValue]);

  useEffect(() => {
    if (!directorValue) return;
    const pd = parsePersonValue(directorValue);
    if (!pd.name.trim() || !bishopricNames.includes(pd.name.trim())) return;
    const names = (form.getValues("visitingAuthority") || "").split(",").map((n) => n.trim()).filter(Boolean);
    const manual = names.filter((n) => !bishopricNames.includes(n));
    if (names.length !== manual.length) { const next = manual.join(", "); if (next !== form.getValues("visitingAuthority")) form.setValue("visitingAuthority", next, { shouldDirty: true }); }
  }, [bishopricNamesKey, directorValue, form]);

  useEffect(() => {
    if (!isPanelOpen) return;
    // Use directorValue (useWatch) instead of form.getValues to avoid stale closure
    const pd = parsePersonValue(directorValue);
    const d = pd.name.trim();
    if (!d) { if (directorSelection !== directorAssignedSelection) { if (directorSelection) setDirectorSelection(""); if (directorCustom) setDirectorCustom(""); if (directorCustomCalling) setDirectorCustomCalling(""); } return; }
    if (bishopricNames.includes(d)) { if (directorSelection !== d) setDirectorSelection(d); if (directorCustom) setDirectorCustom(""); if (directorCustomCalling) setDirectorCustomCalling(""); return; }
    if (directorSelection !== directorAssignedSelection) setDirectorSelection(directorAssignedSelection);
    if (!directorCustom) setDirectorCustom(d);
    if (!directorCustomCalling && pd.calling) setDirectorCustomCalling(pd.calling);
  }, [bishopricNamesKey, directorCustom, directorCustomCalling, directorSelection, directorValue, isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen) return;
    const pp = parsePersonValue(presiderValue);
    const pn = pp.name.trim();
    if (!pn) { if (presiderSelection !== presiderAuthoritySelection) { if (presiderSelection) setPresiderSelection(""); if (presiderCustomName) setPresiderCustomName(""); if (presiderAuthorityType) setPresiderAuthorityType(""); } return; }
    if (bishopricNames.includes(pn)) { if (presiderSelection !== pn) setPresiderSelection(pn); if (presiderCustomName) setPresiderCustomName(""); if (presiderAuthorityType) setPresiderAuthorityType(""); return; }
    if (presiderSelection !== presiderAuthoritySelection) setPresiderSelection(presiderAuthoritySelection);
    if (!presiderCustomName) setPresiderCustomName(pn);
    if (!presiderAuthorityType && pp.calling) { const m = authorityOptions.find((o) => o.calling === pp.calling)?.value || ""; if (m) setPresiderAuthorityType(m); }
  }, [authorityOptions, bishopricNamesKey, presiderAuthorityType, presiderCustomName, presiderSelection, presiderValue, isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen) return;
    setReleases((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (r.name || !r.organizationId || !r.oldCalling) return r;
        const name = getMemberNameForCalling(r.organizationId, r.oldCalling);
        if (!name) return r;
        changed = true; return { ...r, name };
      });
      return changed ? next : prev;
    });
  }, [memberCallingsWithMembers, getMemberNameForCalling, isPanelOpen]);

  // ── Form panel height: fill the main scroll container ──
  useEffect(() => {
    if (!isPanelOpen) return;
    const mainEl = document.querySelector(".app-scroll-container") as HTMLElement | null;
    if (!mainEl) return;
    const update = () => {
      if (formPanelRef.current) {
        const paddingBottom = parseFloat(window.getComputedStyle(mainEl).paddingBottom) || 0;
        formPanelRef.current.style.height = `${mainEl.clientHeight - paddingBottom}px`;
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(mainEl);
    return () => ro.disconnect();
  }, [isPanelOpen]);

  // ── onSubmit (unchanged) ──
  const onSubmit = (data: MeetingFormValues) => {
    if (!data.date) { form.setError("date", { message: "La fecha es requerida" }); return; }
    const payload = {
      ...data, date: data.date, presider: data.presider || "", director: data.director || "",
      musicDirector: normalizeMemberField(data.musicDirector), pianist: normalizeMemberField(data.pianist),
      visitingAuthority: data.visitingAuthority || "", announcements: data.announcements || "",
      openingHymn: data.openingHymn || "", openingPrayer: data.openingPrayer || "",
      intermediateHymn: data.intermediateHymn || "", intermediateHymnType: intermediateHymnType || "",
      sacramentHymn: data.sacramentHymn || "", closingHymn: data.closingHymn || "", closingPrayer: data.closingPrayer || "",
      isTestimonyMeeting, discourses: isTestimonyMeeting ? [] : discourses,
      assignments: assignments.filter((a) => a.name.trim() && a.assignment.trim()),
      releases: hasReleasesAndSustainments ? releases.filter((r) => r.name && r.oldCalling).map((r) => ({ name: r.name, oldCalling: r.oldCalling, ...(r.organizationId && { organizationId: r.organizationId }) })) : [],
      sustainments: hasReleasesAndSustainments ? sustainments.filter((s) => s.name && s.calling).map((s) => ({ name: s.name, calling: s.calling, ...(s.organizationId && { organizationId: s.organizationId }) })) : [],
      newMembers: hasNewMembers ? newMembers.filter((m) => m.trim()) : [],
      aaronicOrderings: hasOrderings ? aaronicOrderings.filter((o) => o.trim()) : [],
      childBlessings: hasChildBlessings ? childBlessings.filter((b) => b.trim()) : [],
      confirmations: hasConfirmations ? confirmations.filter((c) => c.trim()) : [],
      stakeBusiness: hasStakeBusiness ? (data.stakeBusiness || "") : "",
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, { onSuccess: () => { closePanel(); form.reset(); } });
    } else {
      createMutation.mutate(payload, { onSuccess: () => { closePanel(); resetMeetingFormState(); } });
    }
  };

  // ── Discourse / assignment helpers (unchanged) ──
  const addDiscourse = () => setDiscourses([...discourses, { speaker: "", topic: "" }]);
  const removeDiscourse = (i: number) => setDiscourses(discourses.filter((_, idx) => idx !== i));
  const updateDiscourse = (i: number, field: "speaker" | "topic", value: string) => { const u = [...discourses]; u[i][field] = value; setDiscourses(u); };
  const addAssignment = () => setAssignments([...assignments, { name: "", assignment: "" }]);
  const removeAssignment = (i: number) => setAssignments(assignments.filter((_, idx) => idx !== i));
  const updateAssignment = (i: number, field: "name" | "assignment", value: string) => { const u = [...assignments]; u[i][field] = value; setAssignments(u); };
  const addSustainment = () => setSustainments([...sustainments, { name: "", calling: "" }]);
  const addSustainmentToOrg = (organizationId: string) => setSustainments([...sustainments, { name: "", calling: "", organizationId }]);
  const removeSustainment = (i: number) => setSustainments(sustainments.filter((_, idx) => idx !== i));
  const updateSustainment = (i: number, field: "name" | "calling", value: string) => { const u = [...sustainments]; u[i][field] = value; setSustainments(u); };
  const addRelease = () => setReleases([...releases, { name: "", oldCalling: "" }]);
  const addReleaseToOrg = (organizationId: string) => setReleases([...releases, { name: "", oldCalling: "", organizationId }]);
  const removeRelease = (i: number) => setReleases(releases.filter((_, idx) => idx !== i));
  const updateReleaseCalling = (i: number, callingName: string) => {
    const u = [...releases]; u[i].oldCalling = callingName;
    const resolved = getMemberNameForCalling(u[i].organizationId, callingName);
    u[i].name = normalizeMemberIfComma(resolved || ""); setReleases(u);
  };
  const updateReleaseName = (i: number, value: string) => {
    const u = [...releases]; const nn = normalizeMemberIfComma(value); u[i].name = nn;
    const matches = getMemberCallingsByName(nn);
    if (matches.length === 1) { u[i].organizationId = matches[0]?.organizationId; u[i].oldCalling = matches[0]?.callingName || ""; setReleases(u); return; }
    if (matches.length > 1) {
      const cOrgId = u[i].organizationId;
      if (cOrgId) { const om = getCallingsForMemberAndOrg(value, cOrgId); if (om.length === 1) { u[i].oldCalling = om[0]?.callingName || ""; setReleases(u); return; } }
      const inferredOrgId = getMatchingOrganizationId(matches);
      if (inferredOrgId) { u[i].organizationId = inferredOrgId; const ic = getCallingsForMemberAndOrg(value, inferredOrgId); const icn = getMatchingCallingName(ic); if (icn) u[i].oldCalling = icn; }
    }
    setReleases(u);
  };

  // ─── Tabs config ────────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "autoridades", label: "Autoridades", icon: <UserCheck className="w-3.5 h-3.5" /> },
    { id: "himnos", label: "Himnos", icon: <Music className="w-3.5 h-3.5" /> },
    { id: "oraciones", label: "Oraciones", icon: <Handshake className="w-3.5 h-3.5" /> },
    { id: "mensajes", label: "Mensajes", icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: "asuntos", label: "Anuncios y asuntos", icon: <Megaphone className="w-3.5 h-3.5" /> },
    { id: "preview", label: "Preview", icon: <Eye className="w-3.5 h-3.5" /> },
  ];

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 space-y-3">
        <Skeleton className="h-8 w-64" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  // ── Sort & classify meetings ─────────────────────────────────────────────────
  const sortedMeetings = [...meetings].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const liveMeetings  = sortedMeetings.filter((m: any) => getMeetingStatus(new Date(m.date)) === "live");
  const upcoming      = sortedMeetings.filter((m: any) => getMeetingStatus(new Date(m.date)) === "upcoming").reverse();
  const past          = sortedMeetings.filter((m: any) => getMeetingStatus(new Date(m.date)) === "past");
  const hasCurrentOrUpcoming = liveMeetings.length > 0 || upcoming.length > 0;
  const fallbackMeeting = !hasCurrentOrUpcoming && past.length > 0 ? [past[0]] : [];

  // Format date as "Domingo, 15 de marzo de 2026"
  const DIAS_ES  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const formatPanelDate = (iso: string) => {
    if (!iso) return "Sin fecha";
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return `${DIAS_ES[d.getDay()]}, ${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="relative flex min-h-full overflow-hidden">

      {/* ── LEFT: Meeting list — always visible on desktop, hidden on mobile when panel open ── */}
      <div className={cn("flex flex-col flex-1 min-w-0 transition-all duration-300", isPanelOpen && "hidden md:flex")}>

        {/* Page header */}
        <div className="px-4 md:px-6 pt-4 pb-3 md:py-5 shrink-0">
          {/* Title row */}
          <div className="flex items-center gap-3 mb-3">
            {showPastView && (
              <button
                onClick={() => setShowPastView(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">
                {showPastView ? "Reuniones anteriores" : "Reunión Sacramental"}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {showPastView ? `${past.length} reuniones` : `${meetings.length} reuniones registradas`}
              </p>
            </div>
          </div>
          {/* Actions row — wraps on mobile */}
          {!showPastView && (
            <div className="flex items-center gap-2 flex-wrap">
              {past.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowPastView(true)}>
                  <FileText className="h-4 w-4 mr-1.5" />
                  Anteriores
                  <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-bold">{past.length}</span>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => exportSacramentalMeetings(meetings)} data-testid="button-export-sacramental">
                <Download className="h-4 w-4 mr-1.5" />
                Exportar
              </Button>
              {canEdit && (
                <Button size="sm" onClick={() => { resetMeetingFormState(); openPanel("general"); }} data-testid="button-create-meeting">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nueva reunión
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Meeting cards */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 space-y-5">

          {showPastView ? (
            /* ── VISTA ANTERIORES ── */
            <div className="space-y-2">
              {past.map((m: any) => (
                <MeetingCard key={m.id} meeting={m} onDetails={handleOpenDetails} onEdit={handleEdit} onDelete={handleDelete} onPDF={handleGeneratePDF} onPrograma={handleViewPrograma} canEdit={canEdit} parsePersonValue={parsePersonValue} isTestimonyValue={isTestimonyValue} />
              ))}
            </div>
          ) : (
            <>
              {/* ── En curso ── */}
              {liveMeetings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                      </span>
                      En curso
                    </span>
                  </div>
                  <div className="space-y-2">
                    {liveMeetings.map((m: any) => (
                      <MeetingCard key={m.id} meeting={m} onDetails={handleOpenDetails} onEdit={handleEdit} onDelete={handleDelete} onPDF={handleGeneratePDF} onPrograma={handleViewPrograma} canEdit={canEdit} parsePersonValue={parsePersonValue} isTestimonyValue={isTestimonyValue} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Próximas ── */}
              {upcoming.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Próximas</span>
                  </div>
                  <div className="space-y-2">
                    {upcoming.map((m: any) => (
                      <MeetingCard key={m.id} meeting={m} onDetails={handleOpenDetails} onEdit={handleEdit} onDelete={handleDelete} onPDF={handleGeneratePDF} onPrograma={handleViewPrograma} canEdit={canEdit} parsePersonValue={parsePersonValue} isTestimonyValue={isTestimonyValue} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Fallback: última anterior si no hay en curso ni próximas ── */}
              {fallbackMeeting.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Última reunión</span>
                  </div>
                  <div className="space-y-2">
                    {fallbackMeeting.map((m: any) => (
                      <MeetingCard key={m.id} meeting={m} onDetails={handleOpenDetails} onEdit={handleEdit} onDelete={handleDelete} onPDF={handleGeneratePDF} onPrograma={handleViewPrograma} canEdit={canEdit} parsePersonValue={parsePersonValue} isTestimonyValue={isTestimonyValue} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Sin reuniones ── */}
              {meetings.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <p className="font-semibold">Sin reuniones registradas</p>
                  <p className="text-sm text-muted-foreground mt-1">Crea la primera reunión sacramental</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: Form panel ──
           Mobile: replaces the list entirely (no fixed/overlay, no z-index fights with app layout)
           Desktop: flex column sidebar next to the list
      ── */}
      {isPanelOpen && (
          <div
            ref={formPanelRef}
            className={cn(
              "flex min-h-0 flex-col bg-background overflow-hidden",
              "w-full md:w-[420px] lg:w-[460px] md:shrink-0",
              "flex-1 md:flex-none",
            )}
          >
          <Form {...form}>
            <form onSubmit={(e) => { e.preventDefault(); onSubmit(form.getValues()); }} className="flex h-full min-h-0 flex-1 flex-col">

              {/* Panel header */}
              <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 shrink-0">
                <div>
                  <h2 className="text-sm font-bold">{editingId ? "Editar reunión" : "Nueva reunión"}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatPanelDate(form.watch("date"))}</p>
                </div>
                <button type="button" onClick={closePanel} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Step progress bar */}
              {(() => {
                const idx = tabs.findIndex((t) => t.id === activeTab);
                const pct = Math.round(((idx + 1) / tabs.length) * 100);
                return (
                  <div className="px-4 md:px-5 pt-1 pb-2 shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Paso {idx + 1} de {tabs.length}
                      </span>
                      <span className="text-[10px] font-semibold text-primary">{tabs[idx].label}</span>
                    </div>
                    <div className="h-0.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* Tab pills — scrollable, compact */}
              <div className="flex overflow-x-auto overflow-y-hidden shrink-0 px-2 border-b border-border/40 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map((tab, i) => {
                  const idx = tabs.findIndex((t) => t.id === activeTab);
                  const done = i < idx;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 mb-[-1px]",
                        activeTab === tab.id
                          ? "border-primary text-primary"
                          : done
                          ? "border-transparent text-muted-foreground/60 hover:text-foreground hover:border-border"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      {done ? (
                        <span className="w-3 h-3 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[8px] font-black">✓</span>
                      ) : (
                        tab.icon
                      )}
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Scrollable body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-5 pt-4 pb-6">

                {/* ── TAB: GENERAL ── */}
                {activeTab === "general" && (
                  <div className="space-y-4">
                    <SectionHead icon={<Calendar className="w-4 h-4" />} title="Información general" desc="Fecha y músicos del programa" />
                    <FormField control={form.control} name="date" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha de la reunión</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="musicDirector" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dirige los Himnos</FormLabel>
                          <FormControl>
                            <MemberAutocomplete value={field.value || ""} options={musicDirectorCandidates.map((v) => ({ value: v }))} placeholder="Nombre completo" onChange={field.onChange} onBlur={() => { field.onBlur(); applyMemberNormalization("musicDirector"); }} testId="input-music-director" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="pianist" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pianista</FormLabel>
                          <FormControl>
                            <MemberAutocomplete value={field.value || ""} options={pianistCandidates.map((v) => ({ value: v }))} placeholder="Nombre completo" onChange={field.onChange} onBlur={() => { field.onBlur(); applyMemberNormalization("pianist"); }} testId="input-pianist" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                )}

                {/* ── TAB: AUTORIDADES ── */}
                {activeTab === "autoridades" && (
                  <div className="space-y-4">
                    <SectionHead icon={<UserCheck className="w-4 h-4" />} title="Autoridades" desc="Quién preside y dirige la reunión" />
                    <FormField control={form.control} name="presider" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preside</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Select value={presiderSelection} onValueChange={(v) => {
                              if (v === presiderAuthoritySelection) { setPresiderSelection(v); setPresiderCustomName(""); setPresiderAuthorityType(""); field.onChange(""); return; }
                              setPresiderSelection(v); setPresiderCustomName(""); setPresiderAuthorityType("");
                              field.onChange(buildPersonValue(v, getBishopricCalling(v)));
                            }}>
                              <SelectTrigger><SelectValue placeholder="Selecciona al obispado o autoridad" /></SelectTrigger>
                              <SelectContent>
                                {bishopricNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                                <SelectItem value={presiderAuthoritySelection}>Autoridad presidente</SelectItem>
                              </SelectContent>
                            </Select>
                            {presiderSelection === presiderAuthoritySelection && (
                              <div className="grid grid-cols-2 gap-2">
                                <Select value={presiderAuthorityType} onValueChange={(v) => { setPresiderAuthorityType(v); const calling = authorityCallingByValue(v); if (presiderCustomName) field.onChange(buildPersonValue(presiderCustomName, calling)); }}>
                                  <SelectTrigger><SelectValue placeholder="Autoridad presidente" /></SelectTrigger>
                                  <SelectContent>{authorityOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                                </Select>
                                <Input placeholder="Nombre completo" value={presiderCustomName} data-testid="input-presider" onChange={(e) => { const v = e.target.value; setPresiderCustomName(v); field.onChange(buildPersonValue(v, authorityCallingByValue(presiderAuthorityType))); }} />
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="director" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dirige</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Select value={directorSelection} onValueChange={(v) => {
                              if (v === directorAssignedSelection) { setDirectorSelection(v); setDirectorCustom(""); setDirectorCustomCalling(""); field.onChange(""); return; }
                              setDirectorSelection(v); setDirectorCustom(""); setDirectorCustomCalling("");
                              field.onChange(buildPersonValue(v, getBishopricCalling(v)));
                            }}>
                              <SelectTrigger><SelectValue placeholder="Selecciona al obispado o líder" /></SelectTrigger>
                              <SelectContent>
                                {bishopricNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                                <SelectItem value={directorAssignedSelection}>Líder asignado</SelectItem>
                              </SelectContent>
                            </Select>
                            {directorSelection === directorAssignedSelection && (
                              <>
                                <Input placeholder="Nombre completo" value={directorCustom} data-testid="input-director" onChange={(e) => { const v = e.target.value; setDirectorCustom(v); field.onChange(buildPersonValue(v, directorCustomCalling)); }} />
                                <Input placeholder="Llamamiento (opcional)" value={directorCustomCalling} onChange={(e) => { const v = e.target.value; setDirectorCustomCalling(v); if (directorCustom) field.onChange(buildPersonValue(directorCustom, v)); }} />
                              </>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="visitingAuthority" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Autoridades visitantes <span className="font-normal text-muted-foreground">(opcional)</span></FormLabel>
                        <FormControl><Input placeholder="Nombre|Cargo — separa con comas" {...field} data-testid="input-visiting-authority" /></FormControl>
                        <p className="text-xs text-muted-foreground">Solo fuera del obispado. Ej: Juan Pérez|Presidente de Estaca</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                )}

                {/* ── TAB: HIMNOS ── */}
                {activeTab === "himnos" && (
                  <div className="space-y-4">
                    <SectionHead icon={<Music className="w-4 h-4" />} title="Himnos" desc="Todos los himnos del programa en orden" />

                    <div className="space-y-2">
                      <HymnRow num={1} label="Apertura" color="#10b981">
                        <FormField control={form.control} name="openingHymn" render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <HymnAutocomplete value={field.value || ""} options={hymnOptions} placeholder="Número o nombre del himno" onChange={field.onChange} onBlur={field.onBlur} onNormalize={(v) => applyHymnNormalization("openingHymn", v)} testId="input-opening-hymn" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </HymnRow>

                      <HymnConnector />

                      <HymnRow num={2} label="Sacramental" color="#6366f1">
                        <FormField control={form.control} name="sacramentHymn" render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <HymnAutocomplete value={field.value || ""} options={hymnOptions} placeholder="Número o nombre del himno" onChange={field.onChange} onBlur={field.onBlur} onNormalize={(v) => applyHymnNormalization("sacramentHymn", v)} testId="input-sacrament-hymn" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </HymnRow>

                      <HymnConnector />

                      {/* Intermediate hymn — amber accent */}
                      <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                        <div className="shrink-0 mt-1.5">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Interm.</div>
                          <div className="text-[9px] text-amber-500 dark:text-amber-500 mt-0.5">Opcional</div>
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <FormField control={form.control} name="intermediateHymn" render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <HymnAutocomplete value={field.value || ""} options={hymnOptions} placeholder="Nº o nombre" onChange={field.onChange} onBlur={field.onBlur} onNormalize={(v) => applyHymnNormalization("intermediateHymn", v)} testId="input-intermediate-hymn" />
                              </FormControl>
                            </FormItem>
                          )} />
                          <Select value={intermediateHymnType} onValueChange={(v: any) => setIntermediateHymnType(v)}>
                            <SelectTrigger data-testid="select-intermediate-hymn-type"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="congregation">Congregación</SelectItem>
                              <SelectItem value="choir">Coro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <HymnConnector />

                      <HymnRow num={3} label="Final" color="#f97316">
                        <FormField control={form.control} name="closingHymn" render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <HymnAutocomplete value={field.value || ""} options={hymnOptions} placeholder="Número o nombre del himno" onChange={field.onChange} onBlur={field.onBlur} onNormalize={(v) => applyHymnNormalization("closingHymn", v)} testId="input-closing-hymn" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </HymnRow>
                    </div>
                  </div>
                )}

                {/* ── TAB: ORACIONES ── */}
                {activeTab === "oraciones" && (
                  <div className="space-y-4">
                    <SectionHead icon={<Handshake className="w-4 h-4" />} title="Oraciones" desc="Asignaciones de oración de apertura y cierre" />

                    <FormField control={form.control} name="openingPrayer" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Oración de apertura</FormLabel>
                        <FormControl>
                          <MemberAutocomplete value={field.value || ""} options={uniqueMemberOptions} placeholder="Nombre completo" onChange={field.onChange} onBlur={field.onBlur} testId="input-opening-prayer" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Al inicio de la reunión, antes del primer himno sacramental</p>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="ml-3 h-6 w-px bg-border" />

                    <FormField control={form.control} name="closingPrayer" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Oración de cierre</FormLabel>
                        <FormControl>
                          <MemberAutocomplete value={field.value || ""} options={uniqueMemberOptions} placeholder="Nombre completo" onChange={field.onChange} onBlur={field.onBlur} testId="input-closing-prayer" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Al final de la reunión, tras el himno final</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                )}

                {/* ── TAB: MENSAJES ── */}
                {activeTab === "mensajes" && (
                  <div className="space-y-4">
                    <SectionHead icon={<BookOpen className="w-4 h-4" />} title="Mensajes del Evangelio" desc="Oradores y tipo de reunión" />

                    {/* Testimony toggle */}
                    <FormField control={form.control} name="isTestimonyMeeting" render={({ field }) => (
                      <div className={cn("flex items-center justify-between p-3.5 rounded-xl border transition-colors", field.value ? "border-primary/30 bg-primary/5" : "border-border")}>
                        <div>
                          <div className="text-sm font-medium">Reunión de Ayuno y Testimonio</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Se omiten los discursos asignados</div>
                        </div>
                        <Checkbox checked={field.value} data-testid="checkbox-testimony" onCheckedChange={(checked) => { field.onChange(checked); setIsTestimonyMeeting(checked as boolean); }} />
                      </div>
                    )} />

                    {!isTestimonyMeeting && (
                      <div className="space-y-3">
                        {discourses.map((discourse, i) => (
                          <div key={i} className="space-y-2">
                            {i === 1 && (
                              <div className="flex items-center gap-2 py-1">
                                <div className="flex-1 h-px bg-amber-200 dark:bg-amber-800" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Himno intermedio ↑</span>
                                <div className="flex-1 h-px bg-amber-200 dark:bg-amber-800" />
                              </div>
                            )}
                            <div className="flex items-start gap-2">
                              <div className="w-5 h-5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 mt-2">{i + 1}</div>
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <MemberAutocomplete value={discourse.speaker} options={uniqueMemberOptions} placeholder="Orador" onChange={(v) => updateDiscourse(i, "speaker", v)} testId={`input-speaker-${i}`} />
                                <Input placeholder="Tema" value={discourse.topic} onChange={(e) => updateDiscourse(i, "topic", e.target.value)} data-testid={`input-topic-${i}`} />
                              </div>
                              {discourses.length > 1 && (
                                <button type="button" onClick={() => removeDiscourse(i)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all mt-1 shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={addDiscourse} data-testid="button-add-discourse"
                          className="w-full py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          Añadir mensaje
                        </button>

                        {/* Additional assignments */}
                        <div className="pt-2 border-t border-border">
                          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Asignaciones adicionales</div>
                          {assignments.map((a, i) => (
                            <div key={i} className="flex gap-2 mb-2">
                              <MemberAutocomplete value={a.name} options={uniqueMemberOptions} placeholder="Miembro" onChange={(v) => updateAssignment(i, "name", v)} testId={`input-assignment-name-${i}`} />
                              <Input value={a.assignment} placeholder="Asignación" onChange={(e) => updateAssignment(i, "assignment", e.target.value)} data-testid={`input-assignment-text-${i}`} />
                              {assignments.length > 1 && (
                                <button type="button" onClick={() => removeAssignment(i)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={addAssignment} data-testid="button-add-assignment"
                            className="w-full py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1.5">
                            <Plus className="w-3.5 h-3.5" />Añadir asignación
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB: ANUNCIOS Y ASUNTOS ── */}
                {activeTab === "asuntos" && (
                  <div className="space-y-4">
                    <SectionHead icon={<Megaphone className="w-4 h-4" />} title="Anuncios y asuntos" desc="Del barrio y de la estaca" />

                    {/* Barrio announcements */}
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Anuncios del barrio</div>
                    <FormField control={form.control} name="announcements" render={({ field }) => (
                      <FormItem>
                        <FormControl><Textarea placeholder="Anuncios generales del barrio..." {...field} data-testid="input-announcements" className="min-h-[80px]" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Optional barrio blocks */}
                    <OptBlock color="#f59e0b" label="Confirmaciones" checked={hasConfirmations} onToggle={(v) => { setHasConfirmations(v); if (v && !hasNewMembers) setHasNewMembers(true); }}>
                      <div className="space-y-2">
                        {confirmations.map((c, i) => (
                          <div key={i} className="flex gap-2">
                            <Input placeholder="Nombre" value={c} data-testid={`input-confirmation-${i}`} onChange={(e) => { const u = [...confirmations]; u[i] = e.target.value; setConfirmations(u); }} />
                            {confirmations.length > 1 && <button type="button" onClick={() => setConfirmations(confirmations.filter((_, idx) => idx !== i))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        ))}
                        <button type="button" onClick={() => setConfirmations([...confirmations, ""])} className="w-full py-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1"><Plus className="w-3 h-3" />Añadir</button>
                      </div>
                    </OptBlock>

                    <OptBlock color="#14b8a6" label="Nuevos miembros y conversos" checked={hasNewMembers} onToggle={setHasNewMembers}>
                      <div className="space-y-2">
                        {newMembers.map((m, i) => (
                          <div key={i} className="flex gap-2">
                            <Input placeholder="Nombre" value={m} data-testid={`input-new-member-${i}`} onChange={(e) => { const u = [...newMembers]; u[i] = e.target.value; setNewMembers(u); }} />
                            {newMembers.length > 1 && <button type="button" onClick={() => setNewMembers(newMembers.filter((_, idx) => idx !== i))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        ))}
                        <button type="button" onClick={() => setNewMembers([...newMembers, ""])} className="w-full py-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1"><Plus className="w-3 h-3" />Añadir</button>
                      </div>
                    </OptBlock>

                    <OptBlock color="#a78bfa" label="Relevos y sostenimientos" checked={hasReleasesAndSustainments} onToggle={setHasReleasesAndSustainments}>
                      {/* Releases */}
                      <div className="mb-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Se releva a</div>
                        {releases.map((release, i) => (
                          <div key={i} className="space-y-1.5 mb-2 pb-2 border-b border-border last:border-0">
                            <div className="flex gap-2">
                              <Select value={release.organizationId || ""} onValueChange={(orgId) => { const u = [...releases]; u[i] = { ...u[i], organizationId: orgId, oldCalling: "", name: "" }; setReleases(u); }}>
                                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Organización" /></SelectTrigger>
                                <SelectContent>{getOrganizationsForSustainments().map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                              </Select>
                              {release.organizationId && <button type="button" onClick={() => addReleaseToOrg(release.organizationId!)} data-testid={`button-add-release-org-${release.organizationId}`} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"><Plus className="w-3.5 h-3.5" /></button>}
                            </div>
                            <div className="flex gap-2">
                              <Select value={release.oldCalling || ""} onValueChange={(c) => updateReleaseCalling(i, c)}>
                                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Llamamiento" /></SelectTrigger>
                                <SelectContent>{getCallingsForOrgRelease(release.organizationId, release.oldCalling).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                              </Select>
                              <MemberAutocomplete value={release.name} options={uniqueMemberOptions} placeholder="Nombre" onChange={(v) => updateReleaseName(i, v)} testId={`input-release-name-${i}`} className="text-xs" />
                              {releases.length > 1 && <button type="button" onClick={() => removeRelease(i)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={addRelease} data-testid="button-add-release" className="w-full py-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1"><Plus className="w-3 h-3" />Añadir relevo</button>
                      </div>
                      {/* Sustainments */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Se llama a</div>
                        {sustainments.map((s, i) => (
                          <div key={i} className="space-y-1.5 mb-2 pb-2 border-b border-border last:border-0">
                            <div className="flex gap-2">
                              <Select value={s.organizationId || ""} onValueChange={(orgId) => { const u = [...sustainments]; u[i] = { ...u[i], organizationId: orgId, calling: "" }; setSustainments(u); }}>
                                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Organización" /></SelectTrigger>
                                <SelectContent>{getOrganizationsForSustainments().map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                              </Select>
                              {s.organizationId && <button type="button" onClick={() => addSustainmentToOrg(s.organizationId!)} data-testid={`button-add-sustainment-org-${s.organizationId}`} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"><Plus className="w-3.5 h-3.5" /></button>}
                            </div>
                            <div className="flex gap-2">
                              <Select value={s.calling || ""} onValueChange={(c) => updateSustainment(i, "calling", c)}>
                                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Llamamiento" /></SelectTrigger>
                                <SelectContent>{getVacantCallingsForOrgWithCurrent(s.organizationId, s.calling).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                              </Select>
                              <MemberAutocomplete value={s.name} options={uniqueMemberOptions} placeholder="Nombre" onChange={(v) => updateSustainment(i, "name", v)} testId={`input-sustainment-name-${i}`} className="text-xs" />
                              {sustainments.length > 1 && <button type="button" onClick={() => removeSustainment(i)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={addSustainment} data-testid="button-add-sustainment" className="w-full py-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1"><Plus className="w-3 h-3" />Añadir sostenimiento</button>
                      </div>
                    </OptBlock>

                    {/* Small 2-col toggles */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between p-3 rounded-xl border border-border">
                        <div className="text-xs font-medium">Ordenaciones Aarónicas</div>
                        <Checkbox checked={hasOrderings} onCheckedChange={(v) => setHasOrderings(v as boolean)} data-testid="checkbox-orderings" />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl border border-border">
                        <div className="text-xs font-medium">Bendiciones de niños</div>
                        <Checkbox checked={hasChildBlessings} onCheckedChange={(v) => setHasChildBlessings(v as boolean)} data-testid="checkbox-child-blessings" />
                      </div>
                    </div>
                    {hasOrderings && (
                      <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/20">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ordenaciones Aarónicas</div>
                        {aaronicOrderings.map((o, i) => (
                          <div key={i} className="flex gap-2">
                            <Input placeholder="Nombre" value={o} data-testid={`input-ordering-${i}`} onChange={(e) => { const u = [...aaronicOrderings]; u[i] = e.target.value; setAaronicOrderings(u); }} />
                            {aaronicOrderings.length > 1 && <button type="button" onClick={() => setAaronicOrderings(aaronicOrderings.filter((_, idx) => idx !== i))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        ))}
                        <button type="button" onClick={() => setAaronicOrderings([...aaronicOrderings, ""])} className="w-full py-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1"><Plus className="w-3 h-3" />Añadir</button>
                      </div>
                    )}
                    {hasChildBlessings && (
                      <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/20">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bendiciones de niños</div>
                        {childBlessings.map((b, i) => (
                          <div key={i} className="flex gap-2">
                            <Input placeholder="Nombre del niño" value={b} data-testid={`input-blessing-${i}`} onChange={(e) => { const u = [...childBlessings]; u[i] = e.target.value; setChildBlessings(u); }} />
                            {childBlessings.length > 1 && <button type="button" onClick={() => setChildBlessings(childBlessings.filter((_, idx) => idx !== i))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive transition-all shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        ))}
                        <button type="button" onClick={() => setChildBlessings([...childBlessings, ""])} className="w-full py-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-1"><Plus className="w-3 h-3" />Añadir</button>
                      </div>
                    )}

                    {/* Estaca */}
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2 border-t border-border">Asuntos de la Estaca</div>
                    <OptBlock color="#60a5fa" label="Anuncios de la Estaca" sub="Si hay comunicados de la presidencia de estaca" checked={hasStakeBusiness} onToggle={setHasStakeBusiness}>
                      <FormField control={form.control} name="stakeBusiness" render={({ field }) => (
                        <FormItem>
                          <FormControl><Textarea placeholder="Describe los asuntos o anuncios de la Estaca..." {...field} data-testid="input-stake-business" className="min-h-[72px]" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </OptBlock>
                  </div>
                )}

                {/* ── TAB: PREVIEW ── */}
                {activeTab === "preview" && (
                  <div className="space-y-4">
                    <SectionHead icon={<Eye className="w-4 h-4" />} title="Vista previa" desc="Resumen del programa antes de guardar" />
                    <div className="rounded-xl border border-border overflow-hidden text-sm">
                      <div className="px-4 py-3 border-b border-border bg-muted/30 text-center">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reunión Sacramental</div>
                        <div className="font-bold mt-1">{form.watch("date") ? new Date(form.watch("date")!).toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Sin fecha"}</div>
                      </div>
                      <div className="divide-y divide-border">
                        {[
                          { label: "Preside", val: parsePersonValue(form.watch("presider")).name },
                          { label: "Dirige", val: parsePersonValue(form.watch("director")).name },
                          { label: "Dir. música", val: form.watch("musicDirector") },
                          { label: "Pianista", val: form.watch("pianist") },
                          { label: "Him. apertura", val: form.watch("openingHymn") },
                          { label: "Oración inicial", val: form.watch("openingPrayer") },
                          { label: "Him. sacramental", val: form.watch("sacramentHymn") },
                          ...discourses.filter((d) => d.speaker).map((d, i) => ({ label: `Orador ${i + 1}`, val: d.speaker + (d.topic ? ` — ${d.topic}` : "") })),
                          { label: "Him. intermedio", val: form.watch("intermediateHymn") },
                          { label: "Him. final", val: form.watch("closingHymn") },
                          { label: "Oración final", val: form.watch("closingPrayer") },
                        ].map(({ label, val }, i) => (
                          <div key={i} className="flex items-baseline gap-3 px-4 py-2.5">
                            <span className="text-xs font-semibold text-muted-foreground min-w-[90px] shrink-0">{label}</span>
                            <span className={cn("text-sm", val ? "text-foreground" : "text-muted-foreground/40 italic")}>{val || "Sin definir"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Completeness */}
                    {(() => {
                      const fields = [form.watch("date"), form.watch("presider"), form.watch("director"), form.watch("musicDirector"), form.watch("pianist"), form.watch("openingHymn"), form.watch("openingPrayer"), form.watch("sacramentHymn"), form.watch("closingHymn"), form.watch("closingPrayer")];
                      const filled = fields.filter(Boolean).length;
                      const pct = Math.round((filled / fields.length) * 100);
                      return (
                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">Campos completados</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{filled} / {fields.length}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-border overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Footer — wizard navigation */}
              {(() => {
                const idx = tabs.findIndex((t) => t.id === activeTab);
                const isFirst = idx === 0;
                const isPreview = activeTab === "preview";
                return (
                  <div className="mt-auto flex items-center gap-2 border-t border-border/30 bg-background px-4 py-3 md:px-5 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] shrink-0">
                    <button
                      type="button"
                      onClick={() => { if (idx > 0) setActiveTab(tabs[idx - 1].id); }}
                      style={{ visibility: isFirst ? "hidden" : "visible" }}
                      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
                    >
                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      Anterior
                    </button>

                    <div className="flex-1 flex justify-center gap-1">
                      {tabs.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setActiveTab(tabs[i].id)}
                          className={cn(
                            "rounded-full transition-all",
                            i === idx ? "w-4 h-1 bg-primary" : "w-1 h-1 bg-muted-foreground/30 hover:bg-muted-foreground"
                          )}
                        />
                      ))}
                    </div>

                    {isPreview ? (
                      <Button type="submit" size="sm" data-testid="button-save-meeting" className="shrink-0">
                        Guardar reunión
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveTab(tabs[idx + 1].id)}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shrink-0"
                      >
                        Siguiente
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })()}
            </form>
          </Form>
          </div>
      )}

    </div>

    {/* ── Details modal ── */}
    {isDetailsOpen && detailsMeeting && createPortal(
      <div
        className="fixed inset-0 z-[200] flex flex-col justify-end md:justify-center md:items-center md:p-6"
        style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        onClick={() => setIsDetailsOpen(false)}
      >
        {/* Sheet / Dialog */}
        <div
          className="bg-background w-full max-w-full md:max-w-lg flex min-h-0 flex-col rounded-t-3xl md:rounded-2xl overflow-hidden"
          style={{ maxHeight: "calc(100dvh - 80px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 shrink-0">
            <div>
              <h3 className="font-bold">Detalles del programa</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {detailsMeeting.date
                  ? new Date(detailsMeeting.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                  : "Sin fecha"}
              </p>
            </div>
            <button
              onClick={() => setIsDetailsOpen(false)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="min-h-0 overflow-y-auto flex-1 px-5 pb-6 space-y-5 text-sm">

            {/* Key-value grid */}
            <div className="space-y-0">
              {[
                { label: "Tipo", val: isTestimonyValue(detailsMeeting.isTestimonyMeeting) ? "Testimonio" : "Regular" },
                { label: "Preside", val: parsePersonValue(detailsMeeting.presider).name || "Sin definir" },
                { label: "Dirige", val: parsePersonValue(detailsMeeting.director).name || "Sin definir" },
                { label: "Dir. música", val: detailsMeeting.musicDirector || "Sin definir" },
                { label: "Pianista", val: detailsMeeting.pianist || "Sin definir" },
                { label: "Autoridad visitante", val: detailsMeeting.visitingAuthority || "—" },
                { label: "Him. apertura", val: detailsMeeting.openingHymn || "—" },
                { label: "Oración inicial", val: detailsMeeting.openingPrayer || "—" },
                { label: "Him. sacramental", val: detailsMeeting.sacramentHymn || "—" },
                { label: "Him. intermedio", val: detailsMeeting.intermediateHymn ? `${detailsMeeting.intermediateHymn}${detailsMeeting.intermediateHymnType ? ` (${detailsMeeting.intermediateHymnType === "choir" ? "Coro" : "Congregación"})` : ""}` : "—" },
                { label: "Him. final", val: detailsMeeting.closingHymn || "—" },
                { label: "Oración final", val: detailsMeeting.closingPrayer || "—" },
                { label: "Anuncios", val: detailsMeeting.announcements?.trim() || "—" },
                { label: "Asuntos estaca", val: detailsMeeting.stakeBusiness?.trim() || "—" },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-baseline gap-2 py-2 border-b border-border/20 last:border-0">
                  <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide min-w-[110px] shrink-0">{label}</span>
                  <span className="text-sm leading-snug">{val}</span>
                </div>
              ))}
            </div>

            {detailsMeeting.discourses?.filter((d: any) => d.speaker).length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">Discursos</p>
                <div className="space-y-1.5">
                  {detailsMeeting.discourses.filter((d: any) => d.speaker).map((d: any, i: number) => (
                    <div key={i} className="flex items-baseline gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground/40 w-4 shrink-0">{i + 1}.</span>
                      <span className="font-medium">{d.speaker}</span>
                      {d.topic && <span className="text-muted-foreground text-xs">— {d.topic}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailsMeeting.assignments?.filter((a: any) => a.name).length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">Asignaciones</p>
                <div className="space-y-1.5">
                  {detailsMeeting.assignments.filter((a: any) => a.name).map((a: any, i: number) => (
                    <div key={i} className="flex items-baseline gap-2">
                      <span className="font-medium">{a.name}</span>
                      {a.assignment && <span className="text-muted-foreground text-xs">— {a.assignment}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(detailsMeeting.releases?.length > 0 || detailsMeeting.sustainments?.length > 0) && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">Relevos y sostenimientos</p>
                {detailsMeeting.releases?.length > 0 && <><p className="text-[10px] uppercase font-bold text-muted-foreground/40 mb-1">Relevos</p>{detailsMeeting.releases.map((r: any, i: number) => <div key={i} className="text-muted-foreground pl-2 text-xs">{r.name}{r.oldCalling ? ` — ${r.oldCalling}` : ""}</div>)}</>}
                {detailsMeeting.sustainments?.length > 0 && <><p className="text-[10px] uppercase font-bold text-muted-foreground/40 mt-2 mb-1">Sostenimientos</p>{detailsMeeting.sustainments.map((s: any, i: number) => <div key={i} className="text-muted-foreground pl-2 text-xs">{s.name}{s.calling ? ` — ${s.calling}` : ""}</div>)}</>}
              </div>
            )}

            {[
              { label: "Confirmaciones", val: detailsMeeting.confirmations },
              { label: "Nuevos miembros", val: detailsMeeting.newMembers },
              { label: "Ordenaciones Aarónicas", val: detailsMeeting.aaronicOrderings },
              { label: "Bendiciones de niños", val: detailsMeeting.childBlessings },
            ].filter(({ val }) => val?.length > 0).map(({ label, val }) => (
              <div key={label}>
                <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-muted-foreground">{val.join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body
    )}

    {programMeeting && (
      <SacramentalProgramView
        meeting={programMeeting}
        organizations={organizations as any[]}
        recognitionMembers={getRecognitionMembers(programMeeting)}
        onPDF={handleGeneratePDF}
        onClose={() => setProgramMeeting(null)}
      />
    )}
    </>
  );
}

export default function SacramentalMeetingPage() {
  return (
    <SacramentalErrorBoundary>
      <SacramentalMeetingPageInner />
    </SacramentalErrorBoundary>
  );
}
