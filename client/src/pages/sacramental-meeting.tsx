import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FileText, Edit, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, normalizeMemberName } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type HymnOption = {
  value: string;
  number: number;
  title: string;
};

type MemberOption = {
  value: string;
};

type HymnAutocompleteProps = {
  value: string;
  options: HymnOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onNormalize: (value: string) => void;
  testId?: string;
  className?: string;
};

const filterHymnOptions = (options: HymnOption[], query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return options;
  const lowerQuery = trimmed.toLowerCase();
  return options.filter((option) => {
    const numberMatch = String(option.number).startsWith(trimmed);
    const textMatch = option.value.toLowerCase().includes(lowerQuery);
    return numberMatch || textMatch;
  });
};

const HymnAutocomplete = ({
  value,
  options,
  placeholder,
  onChange,
  onBlur,
  onNormalize,
  testId,
  className,
}: HymnAutocompleteProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const filteredOptions = useMemo(() => filterHymnOptions(options, value), [options, value]);

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          onBlur();
          onNormalize(value);
          setTimeout(() => setIsOpen(false), 150);
        }}
        data-testid={testId}
        className={className}
        autoComplete="off"
      />
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover text-popover-foreground shadow-md">
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No se encontraron himnos.</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.number}
                  type="button"
                  className={cn(
                    "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    option.value === value && "bg-accent text-accent-foreground"
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    onNormalize(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.value}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const filterMemberOptions = (options: MemberOption[], query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return options;
  const lowerQuery = trimmed.toLowerCase();
  return options.filter((option) => option.value.toLowerCase().includes(lowerQuery));
};

const MemberAutocomplete = ({
  value,
  options,
  placeholder,
  onChange,
  onBlur,
  testId,
  className,
}: {
  value: string;
  options: MemberOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  testId?: string;
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const filteredOptions = useMemo(() => filterMemberOptions(options, value), [options, value]);

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          onBlur?.();
          setTimeout(() => setIsOpen(false), 150);
        }}
        data-testid={testId}
        className={className}
        autoComplete="off"
      />
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover text-popover-foreground shadow-md">
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No se encontraron miembros.</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    option.value === value && "bg-accent text-accent-foreground"
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.value}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
});

type MeetingFormValues = z.infer<typeof meetingSchema>;

const formatDateForInput = (value?: string | Date | null) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

export default function SacramentalMeetingPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
  const [discourses, setDiscourses] = useState<Array<{ speaker: string; topic: string }>>([
    { speaker: "", topic: "" },
  ]);
  const [releases, setReleases] = useState<Array<{ name: string; oldCalling: string; organizationId?: string }>>([
    { name: "", oldCalling: "" },
  ]);
  const [sustainments, setSustainments] = useState<Array<{ name: string; calling: string; organizationId?: string }>>([
    { name: "", calling: "" },
  ]);
  const [newMembers, setNewMembers] = useState<string[]>([""]);
  const [aaronicOrderings, setAaronicOrderings] = useState<string[]>([""]);
  const [childBlessings, setChildBlessings] = useState<string[]>([""]);
  const [confirmations, setConfirmations] = useState<string[]>([""]);
  const [intermediateHymnType, setIntermediateHymnType] = useState<"congregation" | "choir" | "">("");
  const [directorSelection, setDirectorSelection] = useState("");
  const [directorCustom, setDirectorCustom] = useState("");
  const [directorCustomCalling, setDirectorCustomCalling] = useState("");
  const [presiderSelection, setPresiderSelection] = useState("");
  const [presiderCustomName, setPresiderCustomName] = useState("");
  const [presiderAuthorityType, setPresiderAuthorityType] = useState("");
  const presiderAuthoritySelection = "autoridad_presidente";
  const directorAssignedSelection = "lider_asignado";
  const { data: members = [] } = useMembers();
  const memberOptions = useMemo(
    () =>
      members
        .map((member) => normalizeMemberName(member.nameSurename))
        .filter((name): name is string => Boolean(name)),
    [members]
  );
  const uniqueMemberOptions = useMemo(
    () => Array.from(new Set(memberOptions)).map((value) => ({ value })),
    [memberOptions]
  );
  const { data: memberCallings = [] } = useAllMemberCallings();
  const normalizeText = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  const isMusicDirectorCalling = (value: string) => {
    const normalized = normalizeText(value);
    return (
      normalized.includes("director de musica") ||
      normalized.includes("directora de musica") ||
      normalized.includes("director de coro") ||
      normalized.includes("directora de coro")
    );
  };
  const isPianistCalling = (value: string) => normalizeText(value).startsWith("pianista");
  const memberCallingsWithMembers = useMemo(
    () => memberCallings.filter((calling) => calling.memberName),
    [memberCallings]
  );
  const memberCallingsWithoutMembers = useMemo(
    () => memberCallings.filter((calling) => !calling.memberName),
    [memberCallings]
  );
  const activeMemberCallings = useMemo(
    () => memberCallingsWithMembers.filter((calling) => calling.isActive),
    [memberCallingsWithMembers]
  );
  const activeVacantCallings = useMemo(
    () => memberCallingsWithoutMembers.filter((calling) => calling.isActive),
    [memberCallingsWithoutMembers]
  );
  const musicDirectorCandidates = useMemo(() => {
    const names = activeMemberCallings
      .filter((calling) => isMusicDirectorCalling(calling.callingName))
      .map((calling) => calling.memberName || "")
      .filter(Boolean)
      .map((name) => normalizeMemberName(name) || name);
    return Array.from(new Set(names));
  }, [activeMemberCallings]);
  const pianistCandidates = useMemo(() => {
    const names = activeMemberCallings
      .filter((calling) => isPianistCalling(calling.callingName))
      .map((calling) => calling.memberName || "")
      .filter(Boolean)
      .map((name) => normalizeMemberName(name) || name);
    return Array.from(new Set(names));
  }, [activeMemberCallings]);

  // Calling mapping by organization type
  const callingsByOrgType: Record<string, string[]> = {
    "obispado": [
      "Obispo",
      "Primer consejero",
      "Segundo consejero",
      "Secretario",
      "Secretario Ejecutivo",
      "Secretario Financiero",
    ],
    "cuorum_elderes": [
      "Presidente",
      "Primer consejero",
      "Segundo consejero",
      "Secretario",
      "Maestro",
      "Líder de ministración",
    ],
    "sociedad_socorro": [
      "Presidenta",
      "Primera consejera",
      "Segunda consejera",
      "Secretaria",
      "Maestra",
      "Coordinadora de ministración",
    ],
    "mujeres_jovenes": [
      "Presidenta",
      "Primera consejera",
      "Segunda consejera",
      "Secretaria",
      "Asesora de clases",
      "Especialistas de Mujeres Jóvenes",
    ],
    "hombres_jovenes": [
      "Presidente del Sacerdocio Aarónico",
      "Primer consejero del Sacerdocio Aarónico",
      "Segundo consejero del Sacerdocio Aarónico",
      "Asesor de Hombres Jóvenes",
      "Especialista de Hombres Jóvenes",
      "Presidente de quórum de diáconos",
      "Primer consejero de quórum de diáconos",
      "Segundo consejero de quórum de diáconos",
      "Secretario de quórum de diáconos",
      "Presidente de quórum de maestros",
      "Primer consejero de quórum de maestros",
      "Segundo consejero de quórum de maestros",
      "Secretario de quórum de maestros",
      "Presidente de quórum de presbíteros",
      "Primer ayudante de quórum de presbíteros",
      "Segundo ayudante de quórum de presbíteros",
    ],
    "primaria": [
      "Presidenta",
      "Primera consejera",
      "Segunda consejera",
      "Secretaria",
      "Líder de música",
      "Pianista",
      "Maestro",
      "Maestra",
      "Líder de guardería",
    ],
    "escuela_dominical": [
      "Presidente",
      "Primer consejero",
      "Segundo consejero",
      "Secretario",
      "Maestro",
      "Maestra",
    ],
    "jas": ["Líder"],
    "barrio": [
      "Director de música del barrio",
      "Directora de música del barrio",
      "Pianista",
      "Director de coro",
      "Directora de coro",
      "Pianista de coro",
      "Lider de la Obra del Templo e Historia Familiar",
      "Consultor de Historia Familiar",
      "Coordinador de Historia Familiar",
      "Líder misional del barrio",
      "Misionero de Barrio",
      "Misionera de Barrio",
      "Maestro de preparación misional",
      "Maestra de preparación misional",
      "Especialista de tecnología",
      "Líder de autosuficiencia",
      "Representante de Comunicaciones",
      "Coordinador de actividades",
      "Coordinadora de actividades",
      "Coordinador de servicio",
      "Director de deportes",
      "Representante de JustServe",
      "Bibliotecario",
      "Coordinador de limpieza",
    ],
  };

  // Filter organizations for releases and sustainments (exclude cuorum)
  const getOrganizationsForReleases = () => {
    return (organizations as any[]).filter((org: any) => org.type !== "cuorum_elderes" &&
      org.type !== "obispado");
  };

  const getOrganizationsForSustainments = () => {
    return (organizations as any[]).filter((org: any) => org.type !== "cuorum_elderes");
  };

  const getOrganizationType = (orgId?: string) => {
    if (!orgId) return "";
    return (organizations as any[]).find((org: any) => org.id === orgId)?.type || "";
  };

  const getCallingsForOrg = (orgId?: string): string[] => {
    if (!orgId) return [];
    return Array.from(
      new Set(
        activeMemberCallings
          .filter((calling) => calling.organizationId === orgId)
          .map((calling) => calling.callingName)
          .filter(Boolean)
      )
    );
  };
  const getVacantCallingsForOrg = (orgId?: string): string[] => {
    if (!orgId) return [];
    const orgType = getOrganizationType(orgId);
    const orgCallings = callingsByOrgType[orgType] || [];
    if (!orgCallings.length) {
      return [];
    }
    const assignedCallings = getCallingsForOrg(orgId).map((calling) => normalizeText(calling));
    return Array.from(
      new Set(
        orgCallings.filter((calling) => !assignedCallings.includes(normalizeText(calling)))
      )
    );
  };
  const getCallingsForOrgWithCurrent = (orgId?: string, currentCalling?: string) => {
    const callings = getCallingsForOrg(orgId);
    if (currentCalling && !callings.includes(currentCalling)) {
      return [...callings, currentCalling];
    }
    return callings;
  };
  const getVacantCallingsForOrgWithCurrent = (orgId?: string, currentCalling?: string) => {
    const callings = getVacantCallingsForOrg(orgId);
    if (currentCalling && !callings.includes(currentCalling)) {
      return [...callings, currentCalling];
    }
    return callings;
  };
  const getMemberNameForCalling = useCallback((orgId?: string, callingName?: string) => {
    if (!orgId || !callingName) return "";
    const normalizedCalling = normalizeText(callingName);
    const match = memberCallingsWithMembers.find(
      (calling) =>
        calling.organizationId === orgId &&
        normalizeText(calling.callingName) === normalizedCalling
    );
    if (match?.memberName) return match.memberName;
    const fallbackMatches = memberCallingsWithMembers.filter(
      (calling) => normalizeText(calling.callingName) === normalizedCalling
    );
    if (fallbackMatches.length === 1) {
      return fallbackMatches[0]?.memberName || "";
    }
    return "";
  }, [memberCallingsWithMembers]);
  const getMemberCallingsByName = useCallback((memberName?: string) => {
    if (!memberName) return [];
    const normalizedName = normalizeText(memberName);
    return memberCallingsWithMembers.filter(
      (calling) => normalizeText(calling.memberName || "") === normalizedName
    );
  }, [memberCallingsWithMembers]);
  const getCallingsForMemberAndOrg = useCallback((memberName?: string, orgId?: string) => {
    if (!memberName || !orgId) return [];
    const normalizedName = normalizeText(memberName);
    return memberCallingsWithMembers.filter(
      (calling) =>
        normalizeText(calling.memberName || "") === normalizedName &&
        calling.organizationId === orgId
    );
  }, [memberCallingsWithMembers]);
  const getMatchingOrganizationId = (matches: typeof memberCallingsWithMembers) => {
    const uniqueOrgIds = Array.from(
      new Set(matches.map((calling) => calling.organizationId).filter(Boolean))
    );
    if (uniqueOrgIds.length === 1) {
      return uniqueOrgIds[0] || "";
    }
    return "";
  };
  const getMatchingCallingName = (matches: typeof memberCallingsWithMembers) => {
    const uniqueCallings = Array.from(
      new Set(matches.map((calling) => calling.callingName).filter(Boolean))
    );
    if (uniqueCallings.length === 1) {
      return uniqueCallings[0] || "";
    }
    return "";
  };
  const { user } = useAuth();
  const { data: meetings = [] as any[], isLoading = false } = useSacramentalMeetings();
  const { data: organizations = [] as any[] } = useOrganizations();
  const { data: users = [] as any[] } = useUsers();
  const { data: hymns = [] as any[] } = useHymns();
  const createMutation = useCreateSacramentalMeeting();
  const updateMutation = useUpdateSacramentalMeeting();
  const deleteMutation = useDeleteSacramentalMeeting();

  const bishopricMembers = useMemo(
    () => users.filter((member: any) => ["obispo", "consejero_obispo"].includes(member.role)),
    [users]
  );
  const getMemberLabel = (member?: any) =>
    member?.fullName || member?.name || member?.email || "";
  const parsePersonValue = (value?: string) => {
    const trimmed = value?.trim() || "";
    if (!trimmed) return { name: "", calling: "" };
    if (trimmed.includes("|")) {
      const [name, calling] = trimmed.split("|").map((part) => part.trim());
      return { name: name || "", calling: calling || "" };
    }
    if (trimmed.includes(",")) {
      const [name, ...callingParts] = trimmed.split(",").map((part) => part.trim());
      return { name: name || "", calling: callingParts.join(", ").trim() };
    }
    const [name, calling] = trimmed.split("|").map((part) => part.trim());
    return { name: name || "", calling: calling || "" };
  };
  const buildPersonValue = (name: string, calling?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return "";
    const trimmedCalling = calling?.trim();
    return trimmedCalling ? `${trimmedName} | ${trimmedCalling}` : trimmedName;
  };
  const bishopricNames = useMemo(
    () => bishopricMembers.map((member: any) => getMemberLabel(member)).filter(Boolean),
    [bishopricMembers]
  );
  const bishopricByName = useMemo(() => {
    const map = new Map<string, any>();
    bishopricMembers.forEach((member: any) => {
      const label = getMemberLabel(member);
      if (label) map.set(label, member);
    });
    return map;
  }, [bishopricMembers]);
  const bishopricNamesKey = bishopricNames.join("|");
  const bishopName = bishopricMembers.find((member: any) => member.role === "obispo");
  const bishopLabel = getMemberLabel(bishopName);
  const obispadoOrgId = useMemo(
    () => (organizations as any[]).find((org: any) => org.type === "obispado")?.id,
    [organizations]
  );
  const obispadoCallingNames = useMemo(
    () => callingsByOrgType.obispado.map((calling) => normalizeText(calling)),
    [normalizeText]
  );
  const normalizeMemberLabel = (value?: string) => normalizeMemberName(value || "") || value || "";
  const formatBishopricCalling = (calling?: string, role?: string) => {
    const trimmed = calling?.trim();
    if (trimmed) {
      const lower = trimmed.toLowerCase();
      if (lower.includes("consejero") && !lower.includes("obispado")) {
        return `${trimmed} del Obispado`;
      }
      return trimmed;
    }
    return role === "obispo" ? "Obispo" : "Consejero del Obispado";
  };
  const getBishopricCalling = (name: string) => {
    const member = bishopricByName.get(name);
    if (!member) return "";
    const normalizedName = normalizeMemberLabel(name);
    const callingMatch = memberCallingsWithMembers.find(
      (calling) =>
        normalizeMemberLabel(calling.memberName || "") === normalizedName &&
        (!obispadoOrgId || calling.organizationId === obispadoOrgId) &&
        obispadoCallingNames.includes(normalizeText(calling.callingName || ""))
    );
    return formatBishopricCalling(callingMatch?.callingName, member.role);
  };
  const isTestimonyValue = (value: any) =>
    typeof value === "string" ? value === "true" : Boolean(value);
  const authorityOptions = useMemo(
    () => [
      { value: "presidente_estaca", label: "Presidente de estaca", calling: "Presidente de Estaca" },
      { value: "primer_consejero_estaca", label: "1er consejero de la presidencia de estaca", calling: "1er Consejero de la Presidencia de Estaca" },
      { value: "segundo_consejero_estaca", label: "2do consejero de la presidencia de estaca", calling: "2do Consejero de la Presidencia de Estaca" },
      { value: "setenta_area", label: "Setenta de área", calling: "Setenta de Área" },
      { value: "setenta_autoridad_general", label: "Setenta autoridad general", calling: "Setenta Autoridad General" },
      { value: "apostol", label: "Apóstol", calling: "Apóstol" },
    ],
    []
  );
  const hymnOptions = useMemo<HymnOption[]>(
    () =>
      hymns.map((hymn: any) => ({
        value: `${hymn.number} - ${hymn.title}`,
        number: hymn.number,
        title: hymn.title,
      })),
    [hymns]
  );
  const hymnsByNumber = useMemo(() => {
    const map = new Map<number, { number: number; title: string }>();
    hymnOptions.forEach((option) => {
      map.set(option.number, { number: option.number, title: option.title });
    });
    return map;
  }, [hymnOptions]);
  const normalizeHymnInput = (value?: string) => {
    const trimmed = value?.trim() || "";
    if (!trimmed) return "";
    const match = trimmed.match(/^(\d{1,4})/);
    if (!match) return trimmed;
    const number = Number.parseInt(match[1], 10);
    if (Number.isNaN(number)) return trimmed;
    const hymn = hymnsByNumber.get(number);
    if (!hymn) return trimmed;
    return `${hymn.number} - ${hymn.title}`;
  };
  const applyHymnNormalization = (fieldName: keyof MeetingFormValues, value: string) => {
    const normalized = normalizeHymnInput(value);
    if (normalized && normalized !== value) {
      form.setValue(fieldName, normalized, { shouldDirty: true });
    }
  };
  const applyMemberNormalization = (fieldName: keyof MeetingFormValues) => {
    const currentValue = form.getValues(fieldName) || "";
    const normalized = normalizeMemberName(currentValue);
    if (normalized && normalized !== currentValue) {
      form.setValue(fieldName, normalized, { shouldDirty: true });
    }
  };
  const authorityCallingByValue = (value: string) =>
    authorityOptions.find((option) => option.value === value)?.calling || "";

  // Log meetings when they load to debug discourses
  console.log("Loaded meetings from API:", meetings);

  const canEdit = user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario_ejecutivo";

  // Reset form when dialog opens
  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingId(null);
    } else if (!editingId) {
      // Reset all states for new meeting
      form.reset();
      setDiscourses([{ speaker: "", topic: "" }]);
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
    }
  };

  const handleOpenDetails = (meeting: any) => {
    setDetailsMeeting(meeting);
    setIsDetailsOpen(true);
  };

  const handleEdit = (meeting: any) => {
    setEditingId(meeting.id);
    form.reset({
      ...meeting,
      date: formatDateForInput(meeting.date),
    });
    setIsTestimonyMeeting(meeting.isTestimonyMeeting);
    setDiscourses(meeting.discourses || [{ speaker: "", topic: "" }]);
    setReleases(meeting.releases && meeting.releases.length > 0 ? meeting.releases : [{ name: "", oldCalling: "" }]);
    setSustainments(meeting.sustainments && meeting.sustainments.length > 0 ? meeting.sustainments : [{ name: "", calling: "" }]);
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
    const parsedDirector = parsePersonValue(meeting.director);
    const directorName = parsedDirector.name;
    const isBishopricDirector = bishopricNames.includes(directorName);
    setDirectorSelection(isBishopricDirector ? directorName : directorName ? directorAssignedSelection : "");
    setDirectorCustom(isBishopricDirector ? "" : directorName);
    setDirectorCustomCalling(isBishopricDirector ? "" : parsedDirector.calling);
    const parsedPresider = parsePersonValue(meeting.presider);
    const presiderName = parsedPresider.name;
    const isBishopricPresider = bishopricNames.includes(presiderName);
    setPresiderSelection(isBishopricPresider ? presiderName : presiderName ? presiderAuthoritySelection : "");
    setPresiderCustomName(isBishopricPresider ? "" : presiderName);
    const authorityValue = authorityOptions.find((option) => option.calling === parsedPresider.calling)?.value || "";
    setPresiderAuthorityType(isBishopricPresider ? "" : authorityValue);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar esta reunión sacramental?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleGeneratePDF = async (meeting: any) => {
    const recognitionMembers = bishopricMembers
      .map((member: any) => {
        const name = getMemberLabel(member);
        return {
          name,
          role: member.role,
          calling: name ? getBishopricCalling(name) : "",
        };
      })
      .filter((member: any) => member.name);
    const doc = await generateSacramentalMeetingPDF(meeting, organizations as any[], recognitionMembers);
    const date = new Date(meeting.date).toISOString().split('T')[0];
    doc.save(`programa-sacramental-${date}.pdf`);
  };

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      date: "",
      presider: "",
      director: "",
      musicDirector: "",
      pianist: "",
      visitingAuthority: "",
      announcements: "",
      openingHymn: "",
      openingPrayer: "",
      intermediateHymn: "",
      intermediateHymnType: undefined,
      sacramentHymn: "",
      closingHymn: "",
      closingPrayer: "",
      stakeBusiness: "",
      isTestimonyMeeting: false,
    },
  });

  const directorValue = useWatch({ control: form.control, name: "director" });
  const presiderValue = useWatch({ control: form.control, name: "presider" });
  const visitingAuthorityValue = useWatch({ control: form.control, name: "visitingAuthority" });

  useEffect(() => {
    if (!isDialogOpen || editingId) return;
    const currentPresider = form.getValues("presider")?.trim();
    if (!currentPresider && bishopLabel) {
      const calling = getBishopricCalling(bishopLabel);
      form.setValue("presider", buildPersonValue(bishopLabel, calling));
      setPresiderSelection(bishopLabel);
    }
  }, [bishopLabel, editingId, form, isDialogOpen]);

  useEffect(() => {
    if (!directorValue) return;
    const parsedDirector = parsePersonValue(directorValue);
    const trimmedDirector = parsedDirector.name.trim();
    if (!trimmedDirector || !bishopricNames.includes(trimmedDirector)) return;
    const currentNames = (visitingAuthorityValue || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const manualNames = currentNames.filter((name) => !bishopricNames.includes(name));
    const nextValue = manualNames.join(", ");
    if (nextValue !== visitingAuthorityValue) {
      form.setValue("visitingAuthority", nextValue, { shouldDirty: true });
    }
  }, [bishopricNamesKey, directorValue, form, visitingAuthorityValue]);

  useEffect(() => {
    if (!isDialogOpen) return;
    const parsedDirector = parsePersonValue(form.getValues("director"));
    const currentDirector = parsedDirector.name.trim();
    if (!currentDirector) {
      if (directorSelection !== directorAssignedSelection) {
        if (directorSelection) setDirectorSelection("");
        if (directorCustom) setDirectorCustom("");
        if (directorCustomCalling) setDirectorCustomCalling("");
      }
      return;
    }
    if (bishopricNames.includes(currentDirector)) {
      if (directorSelection !== currentDirector) setDirectorSelection(currentDirector);
      if (directorCustom) setDirectorCustom("");
      if (directorCustomCalling) setDirectorCustomCalling("");
      return;
    }
    if (directorSelection !== directorAssignedSelection) setDirectorSelection(directorAssignedSelection);
    if (!directorCustom) setDirectorCustom(currentDirector);
    if (!directorCustomCalling && parsedDirector.calling) setDirectorCustomCalling(parsedDirector.calling);
  }, [bishopricNamesKey, directorCustom, directorCustomCalling, directorSelection, form, isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) return;
    const parsedPresider = parsePersonValue(presiderValue);
    const presiderName = parsedPresider.name.trim();
    if (!presiderName) {
      if (presiderSelection !== presiderAuthoritySelection) {
        if (presiderSelection) setPresiderSelection("");
        if (presiderCustomName) setPresiderCustomName("");
        if (presiderAuthorityType) setPresiderAuthorityType("");
      }
      return;
    }
    if (bishopricNames.includes(presiderName)) {
      if (presiderSelection !== presiderName) setPresiderSelection(presiderName);
      if (presiderCustomName) setPresiderCustomName("");
      if (presiderAuthorityType) setPresiderAuthorityType("");
      return;
    }
    if (presiderSelection !== presiderAuthoritySelection) setPresiderSelection(presiderAuthoritySelection);
    if (!presiderCustomName) setPresiderCustomName(presiderName);
    if (!presiderAuthorityType && parsedPresider.calling) {
      const matchedAuthority = authorityOptions.find((option) => option.calling === parsedPresider.calling)?.value || "";
      if (matchedAuthority) setPresiderAuthorityType(matchedAuthority);
    }
  }, [authorityOptions, bishopricNamesKey, presiderAuthorityType, presiderCustomName, presiderSelection, presiderValue, isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) return;
    setReleases((prev) => {
      let changed = false;
      const next = prev.map((release) => {
        if (release.name || !release.organizationId || !release.oldCalling) return release;
        const name = getMemberNameForCalling(release.organizationId, release.oldCalling);
        if (!name) return release;
        changed = true;
        return { ...release, name };
      });
      return changed ? next : prev;
    });
  }, [memberCallingsWithMembers, getMemberNameForCalling, isDialogOpen]);

  const onSubmit = (data: MeetingFormValues) => {
    if (!data.date) {
      form.setError("date", { message: "La fecha es requerida" });
      return;
    }

    const payload = {
      ...data,
      date: data.date,
      presider: data.presider || "",
      director: data.director || "",
      musicDirector: data.musicDirector || "",
      pianist: data.pianist || "",
      visitingAuthority: data.visitingAuthority || "",
      announcements: data.announcements || "",
      openingHymn: data.openingHymn || "",
      openingPrayer: data.openingPrayer || "",
      intermediateHymn: data.intermediateHymn || "",
      intermediateHymnType: intermediateHymnType || "",
      sacramentHymn: data.sacramentHymn || "",
      closingHymn: data.closingHymn || "",
      closingPrayer: data.closingPrayer || "",
      isTestimonyMeeting: isTestimonyMeeting,
      discourses: isTestimonyMeeting ? [] : discourses,
      releases: hasReleasesAndSustainments ? releases.filter(r => r.name && r.oldCalling).map(r => ({
        name: r.name,
        oldCalling: r.oldCalling,
        ...(r.organizationId && { organizationId: r.organizationId })
      })) : [],
      sustainments: hasReleasesAndSustainments ? sustainments.filter(s => s.name && s.calling).map(s => ({
        name: s.name,
        calling: s.calling,
        ...(s.organizationId && { organizationId: s.organizationId })
      })) : [],
      newMembers: hasNewMembers ? newMembers.filter(m => m.trim()) : [],
      aaronicOrderings: hasOrderings ? aaronicOrderings.filter(o => o.trim()) : [],
      childBlessings: hasChildBlessings ? childBlessings.filter(b => b.trim()) : [],
      confirmations: hasConfirmations ? confirmations.filter(c => c.trim()) : [],
      stakeBusiness: hasStakeBusiness ? (data.stakeBusiness || "") : "",
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setIsDialogOpen(false);
            setEditingId(null);
            form.reset();
          },
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
          setDiscourses([{ speaker: "", topic: "" }]);
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
        },
      });
    }
  };

  const addDiscourse = () => {
    setDiscourses([...discourses, { speaker: "", topic: "" }]);
  };

  const removeDiscourse = (index: number) => {
    setDiscourses(discourses.filter((_, i) => i !== index));
  };

  const updateDiscourse = (index: number, field: "speaker" | "topic", value: string) => {
    const updated = [...discourses];
    updated[index][field] = value;
    setDiscourses(updated);
  };

  const addSustainment = () => {
    setSustainments([...sustainments, { name: "", calling: "" }]);
  };

  const addSustainmentToOrg = (organizationId: string) => {
    setSustainments([...sustainments, { name: "", calling: "", organizationId }]);
  };

  const removeSustainment = (index: number) => {
    setSustainments(sustainments.filter((_, i) => i !== index));
  };

  const updateSustainment = (index: number, field: "name" | "calling", value: string) => {
    const updated = [...sustainments];
    updated[index][field] = value;
    setSustainments(updated);
  };

  const addRelease = () => {
    setReleases([...releases, { name: "", oldCalling: "" }]);
  };

  const addReleaseToOrg = (organizationId: string) => {
    setReleases([...releases, { name: "", oldCalling: "", organizationId }]);
  };

  const removeRelease = (index: number) => {
    setReleases(releases.filter((_, i) => i !== index));
  };

  const updateReleaseCalling = (index: number, callingName: string) => {
    const updated = [...releases];
    const organizationId = updated[index].organizationId;
    updated[index].oldCalling = callingName;
    const resolvedName = getMemberNameForCalling(organizationId, callingName);
    updated[index].name = normalizeMemberName(resolvedName || "") || resolvedName;
    setReleases(updated);
  };
  const updateReleaseName = (index: number, value: string) => {
    const updated = [...releases];
    const normalizedName = normalizeMemberName(value) || value;
    updated[index].name = normalizedName;
    const matches = getMemberCallingsByName(normalizedName);
    if (matches.length === 1) {
      updated[index].organizationId = matches[0]?.organizationId;
      updated[index].oldCalling = matches[0]?.callingName || "";
      setReleases(updated);
      return;
    }
    if (matches.length > 1) {
      const currentOrgId = updated[index].organizationId;
      if (currentOrgId) {
        const orgMatches = getCallingsForMemberAndOrg(value, currentOrgId);
        if (orgMatches.length === 1) {
          updated[index].oldCalling = orgMatches[0]?.callingName || "";
          setReleases(updated);
          return;
        }
      }
      const inferredOrgId = getMatchingOrganizationId(matches);
      if (inferredOrgId) {
        updated[index].organizationId = inferredOrgId;
        const inferredCallings = getCallingsForMemberAndOrg(value, inferredOrgId);
        const inferredCallingName = getMatchingCallingName(inferredCallings);
        if (inferredCallingName) {
          updated[index].oldCalling = inferredCallingName;
        }
      }
    }
    setReleases(updated);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Reunión Sacramental</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona la programación de las reuniones sacramentales
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Button
            variant="outline"
            onClick={() => exportSacramentalMeetings(meetings)}
            data-testid="button-export-sacramental"
          >
            <Download className="h-4 w-4 lg:mr-2" />
            <span className="sr-only lg:not-sr-only">Exportar</span>
          </Button>
          {canEdit && (
            <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-meeting">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Reunión
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Reunión Sacramental" : "Programar Reunión Sacramental"}</DialogTitle>
                <DialogDescription>
                  Sigue el orden del programa (12 secciones)
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={(e) => { e.preventDefault(); onSubmit(form.getValues()); }} className="space-y-6">
                  {/* ========== SECTION 1: DATE ========== */}
                  <div className="border rounded-md p-4 bg-slate-50 dark:bg-slate-950">
                    <h3 className="text-sm font-semibold mb-3">1. Información General</h3>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha de la Reunión</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="musicDirector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dirige la música</FormLabel>
                            <FormControl>
                              <MemberAutocomplete
                                value={field.value || ""}
                                options={musicDirectorCandidates.map((value) => ({ value }))}
                                placeholder="Nombre completo"
                                onChange={field.onChange}
                                onBlur={() => {
                                  field.onBlur();
                                  applyMemberNormalization("musicDirector");
                                }}
                                testId="input-music-director"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Sortea entre Director(a) de música y/o Director(a) de coro.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="pianist"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Acompaña al piano</FormLabel>
                            <FormControl>
                              <MemberAutocomplete
                                value={field.value || ""}
                                options={pianistCandidates.map((value) => ({ value }))}
                                placeholder="Nombre completo"
                                onChange={field.onChange}
                                onBlur={() => {
                                  field.onBlur();
                                  applyMemberNormalization("pianist");
                                }}
                                testId="input-pianist"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Sortea entre quienes tienen llamamiento de Pianista.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* ========== SECTION 2: GREETING ========== */}
                  {/* Auto-generated from date */}

                  {/* ========== SECTION 3: AUTHORITIES ========== */}
                  <div className="border rounded-md p-4 bg-blue-50 dark:bg-blue-950/30">
                    <h3 className="text-sm font-semibold mb-3">3. Reconocimiento de Autoridades</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="presider"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preside</FormLabel>
                            <FormControl>
                              <div className="space-y-2">
                                <Select
                                  value={presiderSelection}
                                  onValueChange={(value) => {
                                    if (value === presiderAuthoritySelection) {
                                      setPresiderSelection(value);
                                      setPresiderCustomName("");
                                      setPresiderAuthorityType("");
                                      field.onChange("");
                                      return;
                                    }
                                    setPresiderSelection(value);
                                    setPresiderCustomName("");
                                    setPresiderAuthorityType("");
                                    const calling = getBishopricCalling(value);
                                    field.onChange(buildPersonValue(value, calling));
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona al obispado o autoridad" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {bishopricNames.map((name) => (
                                      <SelectItem key={name} value={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value={presiderAuthoritySelection}>Autoridad presidente</SelectItem>
                                  </SelectContent>
                                </Select>
                                {presiderSelection === presiderAuthoritySelection && (
                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                    <Select
                                      value={presiderAuthorityType}
                                      onValueChange={(value) => {
                                        setPresiderAuthorityType(value);
                                        const calling = authorityCallingByValue(value);
                                        if (presiderCustomName) {
                                          field.onChange(buildPersonValue(presiderCustomName, calling));
                                        }
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Autoridad presidente" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {authorityOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      placeholder="Nombre completo"
                                      value={presiderCustomName}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        setPresiderCustomName(value);
                                        const calling = authorityCallingByValue(presiderAuthorityType);
                                        field.onChange(buildPersonValue(value, calling));
                                      }}
                                      data-testid="input-presider"
                                    />
                                  </div>
                                )}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="director"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dirige</FormLabel>
                            <FormControl>
                              <div className="space-y-2">
                                <Select
                                  value={directorSelection}
                                  onValueChange={(value) => {
                                    if (value === directorAssignedSelection) {
                                      setDirectorSelection(value);
                                      setDirectorCustom("");
                                      setDirectorCustomCalling("");
                                      field.onChange("");
                                      return;
                                    }
                                    setDirectorSelection(value);
                                    setDirectorCustom("");
                                    setDirectorCustomCalling("");
                                    const calling = getBishopricCalling(value);
                                    field.onChange(buildPersonValue(value, calling));
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona al obispado o líder" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {bishopricNames.map((name) => (
                                      <SelectItem key={name} value={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value={directorAssignedSelection}>Líder asignado</SelectItem>
                                  </SelectContent>
                                </Select>
                                {directorSelection === directorAssignedSelection && (
                                  <>
                                    <Input
                                      placeholder="Nombre completo"
                                      value={directorCustom}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        setDirectorCustom(value);
                                        const calling = directorCustomCalling || "";
                                        field.onChange(buildPersonValue(value, calling));
                                      }}
                                      data-testid="input-director"
                                    />
                                    <Input
                                      placeholder="Llamamiento de quien dirige (opcional)"
                                      value={directorCustomCalling}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        setDirectorCustomCalling(value);
                                        if (directorCustom) {
                                          field.onChange(buildPersonValue(directorCustom, value));
                                        }
                                      }}
                                    />
                                  </>
                                )}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="visitingAuthority"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Autoridades Visitantes (manual)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nombre|Cargo (separa varios con comas)"
                                {...field}
                                data-testid="input-visiting-authority"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Solo para autoridades adicionales fuera del obispado. Ejemplo: Juan Pérez|Presidente de Estaca.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* ========== SECTION 4: ANNOUNCEMENTS ========== */}
                  <div className="border rounded-md p-4 bg-amber-50 dark:bg-amber-950/30">
                    <h3 className="text-sm font-semibold mb-3">4. Anuncios</h3>
                    <FormField
                      control={form.control}
                      name="announcements"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Anuncios del Barrio o la Estaca</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Ingresa los anuncios..." {...field} data-testid="input-announcements" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ========== SECTION 5: OPENING HYMN ========== */}
                  <div className="border rounded-md p-4 bg-green-50 dark:bg-green-950/30">
                    <h3 className="text-sm font-semibold mb-3">5. Primer Himno</h3>
                    <FormField
                      control={form.control}
                      name="openingHymn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número o Nombre del Himno</FormLabel>
                          <FormControl>
                            <HymnAutocomplete
                              value={field.value || ""}
                              options={hymnOptions}
                              placeholder="Ej: 1012 - En cualquier ocasión"
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              onNormalize={(value) => applyHymnNormalization("openingHymn", value)}
                              testId="input-opening-hymn"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ========== SECTION 6: OPENING PRAYER ========== */}
                  <div className="border rounded-md p-4 bg-red-50 dark:bg-red-950/30">
                    <h3 className="text-sm font-semibold mb-3">6. Primera Oración</h3>
                    <FormField
                      control={form.control}
                      name="openingPrayer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ofrecida por</FormLabel>
                          <FormControl>
                            <MemberAutocomplete
                              value={field.value || ""}
                              options={uniqueMemberOptions}
                              placeholder="Nombre de la persona"
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              testId="input-opening-prayer"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ========== SECTION 7: WARD BUSINESS ========== */}
                  <div className="border rounded-md p-4 bg-purple-50 dark:bg-purple-950/30">
                    <h3 className="text-sm font-semibold mb-3">7. Asuntos de Barrio</h3>

                    {/* Confirmations - MOVED FIRST */}
                    <div className="mb-4 border rounded p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Confirmaciones</h4>
                        <Checkbox
                          checked={hasConfirmations}
                          onCheckedChange={(checked) => {
                            setHasConfirmations(checked as boolean);
                            // Auto-check New Members when Confirmations is checked
                            if (checked && !hasNewMembers) {
                              setHasNewMembers(true);
                            }
                          }}
                          data-testid="checkbox-confirmations"
                        />
                      </div>
                      {hasConfirmations && (
                        <div className="space-y-2 bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded">
                          {confirmations.map((confirmation, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="Nombre"
                                value={confirmation}
                                onChange={(e) => {
                                  const updated = [...confirmations];
                                  updated[index] = e.target.value;
                                  setConfirmations(updated);
                                }}
                                data-testid={`input-confirmation-${index}`}
                                className="flex-1 text-sm"
                              />
                              {confirmations.length > 1 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setConfirmations(confirmations.filter((_, i) => i !== index))}
                                  className="h-9"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmations([...confirmations, ""])}
                            className="w-full text-xs"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar Confirmación
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* New Members - comes after confirmations */}
                    <div className="mb-4 border rounded p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Nuevos Miembros y Conversos</h4>
                        <Checkbox
                          checked={hasNewMembers}
                          onCheckedChange={(checked) => setHasNewMembers(checked as boolean)}
                          data-testid="checkbox-new-members"
                        />
                      </div>
                      {hasNewMembers && (
                        <div className="space-y-2 bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
                          {newMembers.map((member, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="Nombre"
                                value={member}
                                onChange={(e) => {
                                  const updated = [...newMembers];
                                  updated[index] = e.target.value;
                                  setNewMembers(updated);
                                }}
                                data-testid={`input-new-member-${index}`}
                                className="flex-1 text-sm"
                              />
                              {newMembers.length > 1 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setNewMembers(newMembers.filter((_, i) => i !== index))}
                                  className="h-9"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setNewMembers([...newMembers, ""])}
                            className="w-full text-xs"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar Miembro
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Aaronic Orderings */}
                    <div className="mb-4 border rounded p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Ordenaciones al Sacerdocio Aarónico</h4>
                        <Checkbox
                          checked={hasOrderings}
                          onCheckedChange={(checked) => setHasOrderings(checked as boolean)}
                          data-testid="checkbox-orderings"
                        />
                      </div>
                      {hasOrderings && (
                        <div className="space-y-2 bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
                          {aaronicOrderings.map((order, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="Nombre"
                                value={order}
                                onChange={(e) => {
                                  const updated = [...aaronicOrderings];
                                  updated[index] = e.target.value;
                                  setAaronicOrderings(updated);
                                }}
                                data-testid={`input-ordering-${index}`}
                                className="flex-1 text-sm"
                              />
                              {aaronicOrderings.length > 1 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setAaronicOrderings(aaronicOrderings.filter((_, i) => i !== index))}
                                  className="h-9"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setAaronicOrderings([...aaronicOrderings, ""])}
                            className="w-full text-xs"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar Ordenación
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Child Blessings */}
                    <div className="mb-4 border rounded p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Bendiciones de Niños</h4>
                        <Checkbox
                          checked={hasChildBlessings}
                          onCheckedChange={(checked) => setHasChildBlessings(checked as boolean)}
                          data-testid="checkbox-child-blessings"
                        />
                      </div>
                      {hasChildBlessings && (
                        <div className="space-y-2 bg-pink-50 dark:bg-pink-950/30 p-2 rounded">
                          {childBlessings.map((blessing, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="Nombre del niño"
                                value={blessing}
                                onChange={(e) => {
                                  const updated = [...childBlessings];
                                  updated[index] = e.target.value;
                                  setChildBlessings(updated);
                                }}
                                data-testid={`input-blessing-${index}`}
                                className="flex-1 text-sm"
                              />
                              {childBlessings.length > 1 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setChildBlessings(childBlessings.filter((_, i) => i !== index))}
                                  className="h-9"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setChildBlessings([...childBlessings, ""])}
                            className="w-full text-xs"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar Bendición
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Releases and Sustainments - MOVED TO END */}
                    <div className="mb-4 border rounded p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Relevos y Sostenimientos</h4>
                        <Checkbox
                          checked={hasReleasesAndSustainments}
                          onCheckedChange={(checked) => setHasReleasesAndSustainments(checked as boolean)}
                          data-testid="checkbox-releases-and-sustainments"
                        />
                      </div>

                      {hasReleasesAndSustainments && (
                        <div className="space-y-4">
                          {/* Releases */}
                          <div className="border rounded p-2 bg-blue-50 dark:bg-blue-950/30">
                            <h5 className="text-xs font-medium mb-2">Relevos (Se releva a)</h5>
                            {releases.map((release, index) => (
                              <div key={index} className="space-y-2 mb-2 pb-2 border-b">
                                <div className="flex gap-2 items-center">
                                  <Select value={release.organizationId || ""} onValueChange={(orgId) => {
                                    const updated = [...releases];
                                    updated[index].organizationId = orgId;
                                    updated[index].oldCalling = "";
                                    updated[index].name = "";
                                    setReleases(updated);
                                  }}>
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                      <SelectValue placeholder="Seleccionar organización" />
                                    </SelectTrigger>
                                    <SelectContent>
                                  {getOrganizationsForSustainments().map((org) => (
                                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                  ))}
                                    </SelectContent>
                                  </Select>
                                  {release.organizationId && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => addReleaseToOrg(release.organizationId!)}
                                      className="h-8 w-8"
                                      data-testid={`button-add-release-org-${release.organizationId}`}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Select value={release.oldCalling || ""} onValueChange={(calling) => {
                                    updateReleaseCalling(index, calling);
                                  }}>
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                      <SelectValue placeholder="Seleccionar llamamiento" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getCallingsForOrgWithCurrent(release.organizationId, release.oldCalling).map((calling) => (
                                        <SelectItem key={calling} value={calling}>{calling}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <MemberAutocomplete
                                    value={release.name}
                                    options={uniqueMemberOptions}
                                    placeholder="Nombre"
                                    onChange={(value) => updateReleaseName(index, value)}
                                    testId={`input-release-name-${index}`}
                                    className="flex-1 text-sm"
                                  />
                                  {releases.length > 1 && (
                                    <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => removeRelease(index)}
                                    className="h-9"
                                  >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addRelease}
                              className="w-full text-xs"
                              data-testid="button-add-release"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Agregar Relevo
                            </Button>
                          </div>

                          {/* Sustainments */}
                          <div className="border rounded p-2 bg-green-50 dark:bg-green-950/30">
                            <h5 className="text-xs font-medium mb-2">Sostenimientos (Se llama a)</h5>
                            {sustainments.map((sustainment, index) => (
                              <div key={index} className="space-y-2 mb-2 pb-2 border-b">
                                <div className="flex gap-2 items-center">
                                  <Select value={sustainment.organizationId || ""} onValueChange={(orgId) => {
                                    const updated = [...sustainments];
                                    updated[index].organizationId = orgId;
                                    updated[index].calling = "";
                                    setSustainments(updated);
                                  }}>
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                      <SelectValue placeholder="Seleccionar organización" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getOrganizationsForSustainments().map((org) => (
                                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {sustainment.organizationId && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => addSustainmentToOrg(sustainment.organizationId!)}
                                      className="h-8 w-8"
                                      data-testid={`button-add-sustainment-org-${sustainment.organizationId}`}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Select value={sustainment.calling || ""} onValueChange={(calling) => {
                                    updateSustainment(index, "calling", calling);
                                  }}>
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                      <SelectValue placeholder="Seleccionar llamamiento" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getVacantCallingsForOrgWithCurrent(sustainment.organizationId, sustainment.calling).map((calling) => (
                                        <SelectItem key={calling} value={calling}>{calling}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <MemberAutocomplete
                                    value={sustainment.name}
                                    options={uniqueMemberOptions}
                                    placeholder="Nombre"
                                    onChange={(value) => updateSustainment(index, "name", value)}
                                    testId={`input-sustainment-name-${index}`}
                                    className="flex-1 text-sm"
                                  />
                                  {sustainments.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => removeSustainment(index)}
                                      className="h-9"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addSustainment}
                              className="w-full text-xs"
                              data-testid="button-add-sustainment"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Agregar Sostenimiento
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Stake Business */}
                    <div className="mb-4 border rounded p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Asuntos de Estaca</h4>
                        <Checkbox
                          checked={hasStakeBusiness}
                          onCheckedChange={(checked) => setHasStakeBusiness(checked as boolean)}
                          data-testid="checkbox-stake-business"
                        />
                      </div>
                      {hasStakeBusiness && (
                        <FormField
                          control={form.control}
                          name="stakeBusiness"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea placeholder="Describe los asuntos de la Estaca..." {...field} className="text-sm" data-testid="input-stake-business" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>

                  {/* ========== SECTION 8: SACRAMENT HYMN ========== */}
                  <div className="border rounded-md p-4 bg-indigo-50 dark:bg-indigo-950/30">
                    <h3 className="text-sm font-semibold mb-3">8. Himno Sacramental y Santa Cena</h3>
                    <FormField
                      control={form.control}
                      name="sacramentHymn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Himno Sacramental</FormLabel>
                          <FormControl>
                            <HymnAutocomplete
                              value={field.value || ""}
                              options={hymnOptions}
                              placeholder="Ej: 108 - Mansos, reverentes hoy"
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              onNormalize={(value) => applyHymnNormalization("sacramentHymn", value)}
                              testId="input-sacrament-hymn"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ========== SECTION 9: DISCOURSES ========== */}
                  <div className="border rounded-md p-4 bg-cyan-50 dark:bg-cyan-950/30">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">9. Mensajes del Evangelio y Música</h3>
                    </div>

                    <FormField
                      control={form.control}
                      name="isTestimonyMeeting"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 mb-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                setIsTestimonyMeeting(checked as boolean);
                              }}
                              data-testid="checkbox-testimony"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">Reunión de Ayuno y Testimonio</FormLabel>
                            <p className="text-xs text-muted-foreground">Se omite la sección de discursos</p>
                          </div>
                        </FormItem>
                      )}
                    />

                    {!isTestimonyMeeting && (
                      <div className="space-y-4 bg-white dark:bg-slate-900 p-3 rounded">
                        {/* FIRST DISCOURSE */}
                        {discourses.length > 0 && (
                          <div className="space-y-2 pb-4 border-b">
                            <div className="text-xs font-medium text-muted-foreground">Primer Mensaje</div>
                            <div className="flex gap-2">
                              <MemberAutocomplete
                                value={discourses[0].speaker}
                                options={uniqueMemberOptions}
                                placeholder="Nombre del orador"
                                onChange={(value) => updateDiscourse(0, "speaker", value)}
                                testId={`input-speaker-0`}
                                className="flex-1 text-sm"
                              />
                              <Input
                                placeholder="Tema"
                                value={discourses[0].topic}
                                onChange={(e) => updateDiscourse(0, "topic", e.target.value)}
                                data-testid={`input-topic-0`}
                                className="flex-1 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {/* INTERMEDIATE HYMN */}
                        <div className="space-y-2 pb-4 border-b bg-amber-50 dark:bg-amber-950/20 p-3 rounded">
                          <div className="text-xs font-medium text-amber-700 dark:text-amber-300">Himno Intermedio (después del primer mensaje)</div>
                          <div className="grid grid-cols-2 gap-2">
                            <FormField
                              control={form.control}
                              name="intermediateHymn"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <HymnAutocomplete
                                      value={field.value || ""}
                                      options={hymnOptions}
                                      placeholder="Ej: 196"
                                      onChange={field.onChange}
                                      onBlur={field.onBlur}
                                      onNormalize={(value) => applyHymnNormalization("intermediateHymn", value)}
                                      testId="input-intermediate-hymn"
                                      className="text-sm"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormItem>
                              <Select value={intermediateHymnType} onValueChange={(value: any) => setIntermediateHymnType(value)}>
                                <SelectTrigger data-testid="select-intermediate-hymn-type" className="h-9">
                                  <SelectValue placeholder="Selecciona..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="congregation">Congregación</SelectItem>
                                  <SelectItem value="choir">Coro</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          </div>
                        </div>

                        {/* ADDITIONAL DISCOURSES */}
                        {discourses.length > 1 && (
                          <div className="space-y-3 pt-2">
                            <div className="text-xs font-medium text-muted-foreground">Mensajes Adicionales (después del himno)</div>
                            {discourses.map((discourse, index) => {
                              if (index === 0) return null; // Skip first one
                              return (
                                <div key={index} className="space-y-2 border-l-2 border-cyan-300 pl-3">
                                  <div className="text-xs font-medium text-muted-foreground">Mensaje {index + 1}</div>
                                  <div className="flex gap-2">
                                    <MemberAutocomplete
                                      value={discourse.speaker}
                                      options={uniqueMemberOptions}
                                      placeholder="Nombre del orador"
                                      onChange={(value) => updateDiscourse(index, "speaker", value)}
                                      testId={`input-speaker-${index}`}
                                      className="flex-1 text-sm"
                                    />
                                    <Input
                                      placeholder="Tema"
                                      value={discourse.topic}
                                      onChange={(e) => updateDiscourse(index, "topic", e.target.value)}
                                      data-testid={`input-topic-${index}`}
                                      className="flex-1 text-sm"
                                    />
                                    {discourses.length > 1 && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => removeDiscourse(index)}
                                        className="h-9"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addDiscourse}
                              className="w-full text-xs"
                              data-testid="button-add-discourse"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Agregar Otro Mensaje
                            </Button>
                          </div>
                        )}

                        {discourses.length === 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addDiscourse}
                            className="w-full text-xs"
                            data-testid="button-add-discourse"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar Otro Mensaje (opcional)
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ========== SECTION 10: CLOSING HYMN ========== */}
                  <div className="border rounded-md p-4 bg-orange-50 dark:bg-orange-950/30">
                    <h3 className="text-sm font-semibold mb-3">10. Último Himno</h3>
                    <FormField
                      control={form.control}
                      name="closingHymn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número o Nombre del Himno</FormLabel>
                          <FormControl>
                            <HymnAutocomplete
                              value={field.value || ""}
                              options={hymnOptions}
                              placeholder="Ej: 1005"
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              onNormalize={(value) => applyHymnNormalization("closingHymn", value)}
                              testId="input-closing-hymn"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ========== SECTION 11: CLOSING PRAYER ========== */}
                  <div className="border rounded-md p-4 bg-rose-50 dark:bg-rose-950/30">
                    <h3 className="text-sm font-semibold mb-3">11. Última Oración</h3>
                    <FormField
                      control={form.control}
                      name="closingPrayer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ofrecida por</FormLabel>
                          <FormControl>
                            <MemberAutocomplete
                              value={field.value || ""}
                              options={uniqueMemberOptions}
                              placeholder="Nombre de la persona"
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              testId="input-closing-prayer"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ========== SECTION 12: FINAL MUSIC ========== */}
                  {/* Auto-generated in PDF */}

                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1" data-testid="button-save-meeting">
                      Guardar Reunión
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Meetings Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Preside</TableHead>
              <TableHead>Dirige</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meetings.map((meeting: any) => (
              <TableRow
                key={meeting.id}
                className="cursor-pointer"
                onClick={() => handleOpenDetails(meeting)}
              >
                <TableCell>
                  {new Date(meeting.date).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </TableCell>
                <TableCell>{parsePersonValue(meeting.presider).name || "-"}</TableCell>
                <TableCell>{parsePersonValue(meeting.director).name || "-"}</TableCell>
                <TableCell>
                  {(() => {
                    // Handle both boolean and string values from database
                    const isTestimony = isTestimonyValue(meeting.isTestimonyMeeting);
                    return (
                      <Badge variant={isTestimony ? "secondary" : "outline"}>
                        {isTestimony ? "Testimonio" : "Regular"}
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleGeneratePDF(meeting);
                    }}
                    data-testid={`button-generate-pdf-${meeting.id}`}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEdit(meeting);
                        }}
                        data-testid={`button-edit-${meeting.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(meeting.id);
                        }}
                        data-testid={`button-delete-${meeting.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) {
            setDetailsMeeting(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del programa sacramental</DialogTitle>
            <DialogDescription>Información en modo lectura.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 text-sm">
            <div className="grid gap-2">
              <div>
                <span className="font-medium">Fecha:</span>{" "}
                {detailsMeeting?.date
                  ? new Date(detailsMeeting.date).toLocaleDateString("es-ES", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "Sin fecha"}
              </div>
              <div>
                <span className="font-medium">Tipo:</span>{" "}
                {detailsMeeting
                  ? isTestimonyValue(detailsMeeting.isTestimonyMeeting)
                    ? "Testimonio"
                    : "Regular"
                  : "Regular"}
              </div>
              <div>
                <span className="font-medium">Preside:</span>{" "}
                {parsePersonValue(detailsMeeting?.presider).name || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Dirige:</span>{" "}
                {parsePersonValue(detailsMeeting?.director).name || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Dirige la música:</span>{" "}
                {detailsMeeting?.musicDirector || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Acompaña al piano:</span>{" "}
                {detailsMeeting?.pianist || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Autoridad visitante:</span>{" "}
                {detailsMeeting?.visitingAuthority || "Sin definir"}
              </div>
            </div>

            <div className="grid gap-2">
              <div>
                <span className="font-medium">Anuncios:</span>{" "}
                {detailsMeeting?.announcements?.trim() || "Sin anuncios"}
              </div>
              <div>
                <span className="font-medium">Himno de apertura:</span>{" "}
                {detailsMeeting?.openingHymn || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Oración inicial:</span>{" "}
                {detailsMeeting?.openingPrayer || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Himno intermedio:</span>{" "}
                {detailsMeeting?.intermediateHymn || "Sin definir"}
                {detailsMeeting?.intermediateHymnType
                  ? ` (${detailsMeeting.intermediateHymnType === "choir" ? "Coro" : "Congregación"})`
                  : ""}
              </div>
              <div>
                <span className="font-medium">Himno sacramental:</span>{" "}
                {detailsMeeting?.sacramentHymn || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Himno final:</span>{" "}
                {detailsMeeting?.closingHymn || "Sin definir"}
              </div>
              <div>
                <span className="font-medium">Oración final:</span>{" "}
                {detailsMeeting?.closingPrayer || "Sin definir"}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="font-medium">Discursos:</span>
              {detailsMeeting?.discourses?.length ? (
                <ul className="list-disc pl-5 space-y-1">
                  {detailsMeeting.discourses.map((discourse: any, index: number) => (
                    <li key={`discourse-${index}`}>
                      {discourse.speaker || "Sin nombre"}{discourse.topic ? ` — ${discourse.topic}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>Sin discursos</span>
              )}
            </div>

            <div className="grid gap-2">
              <span className="font-medium">Relevos y sostenimientos:</span>
              {(detailsMeeting?.releases?.length || detailsMeeting?.sustainments?.length) ? (
                <div className="grid gap-2">
                  {detailsMeeting?.releases?.length ? (
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Relevos</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {detailsMeeting.releases.map((release: any, index: number) => (
                          <li key={`release-${index}`}>
                            {release.name || "Sin nombre"}{release.oldCalling ? ` — ${release.oldCalling}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {detailsMeeting?.sustainments?.length ? (
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Sostenimientos</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {detailsMeeting.sustainments.map((sustainment: any, index: number) => (
                          <li key={`sustainment-${index}`}>
                            {sustainment.name || "Sin nombre"}{sustainment.calling ? ` — ${sustainment.calling}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <span>Sin relevos ni sostenimientos</span>
              )}
            </div>

            <div className="grid gap-2">
              <div>
                <span className="font-medium">Confirmaciones:</span>{" "}
                {detailsMeeting?.confirmations?.length
                  ? detailsMeeting.confirmations.join(", ")
                  : "Sin confirmaciones"}
              </div>
              <div>
                <span className="font-medium">Nuevos miembros:</span>{" "}
                {detailsMeeting?.newMembers?.length
                  ? detailsMeeting.newMembers.join(", ")
                  : "Sin nuevos miembros"}
              </div>
              <div>
                <span className="font-medium">Ordenaciones Aarónicas:</span>{" "}
                {detailsMeeting?.aaronicOrderings?.length
                  ? detailsMeeting.aaronicOrderings.join(", ")
                  : "Sin ordenaciones"}
              </div>
              <div>
                <span className="font-medium">Bendiciones de niños:</span>{" "}
                {detailsMeeting?.childBlessings?.length
                  ? detailsMeeting.childBlessings.join(", ")
                  : "Sin bendiciones"}
              </div>
              <div>
                <span className="font-medium">Asuntos de estaca:</span>{" "}
                {detailsMeeting?.stakeBusiness?.trim() || "Sin asuntos"}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
