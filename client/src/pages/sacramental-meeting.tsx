import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FileText, Edit, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useSacramentalMeetings, useCreateSacramentalMeeting, useUpdateSacramentalMeeting, useDeleteSacramentalMeeting, useOrganizations, useUsers } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { generateSacramentalMeetingPDF } from "@/lib/pdf-utils";
import { exportSacramentalMeetings } from "@/lib/export";

const meetingSchema = z.object({
  date: z.string().optional(),
  presider: z.string().optional(),
  director: z.string().optional(),
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

export default function SacramentalMeetingPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  // Calling mapping by organization type
  const callingsByOrgType: Record<string, string[]> = {
    "hombres_jovenes": ["Asesor de Hombres Jóvenes", "Ayudante del Asesor de Hombres Jóvenes"],
    "mujeres_jovenes": ["Presidenta", "1era. Consejera", "2da. Consejera", "Secretaria"],
    "sociedad_socorro": ["Presidenta", "1era. Consejera", "2da. Consejera", "Secretaria"],
    "primaria": ["Presidenta", "1era. Consejera", "2da. Consejera", "Secretaria"],
    "escuela_dominical": ["Presidenta", "1era. Consejera", "2da. Consejera", "Secretaria"],
    "jas": ["Líder de JAS del barrio"],
  };
  
  // Filter organizations for releases and sustainments (exclude cuorum)
  const getOrganizationsForReleases = () => {
    return (organizations as any[]).filter((org: any) => org.type !== "cuorum_elderes");
  };
  
  // Check if a calling should use custom text input
  const isCustomCallingOrg = (orgId?: string): boolean => {
    const org = (organizations as any[]).find((o: any) => o.id === orgId);
    return org?.type === "barrio";
  };

  const getCallingsForOrg = (orgId?: string): string[] => {
    if (!orgId) return [];
    const org = (organizations as any[]).find((o: any) => o.id === orgId);
    return org ? (callingsByOrgType[org.type] || []) : [];
  };

  const { user } = useAuth();
  const { data: meetings = [] as any[], isLoading = false } = useSacramentalMeetings();
  const { data: organizations = [] as any[] } = useOrganizations();
  const { data: users = [] as any[] } = useUsers();
  const createMutation = useCreateSacramentalMeeting();
  const updateMutation = useUpdateSacramentalMeeting();
  const deleteMutation = useDeleteSacramentalMeeting();
  
  // Log meetings when they load to debug discourses
  console.log("Loaded meetings from API:", meetings);

  const canEdit = user?.role === "obispo" || user?.role === "consejero_obispo";

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
    }
  };

  const handleEdit = (meeting: any) => {
    setEditingId(meeting.id);
    form.reset(meeting);
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
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar esta reunión sacramental?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleGeneratePDF = async (meeting: any) => {
    const doc = await generateSacramentalMeetingPDF(meeting, organizations as any[]);
    const date = new Date(meeting.date).toISOString().split('T')[0];
    doc.save(`programa-sacramental-${date}.pdf`);
  };

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      date: "",
      presider: "",
      director: "",
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

  const updateRelease = (index: number, field: "name" | "oldCalling", value: string) => {
    const updated = [...releases];
    updated[index][field] = value;
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Reunión Sacramental</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona la programación de las reuniones sacramentales
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportSacramentalMeetings(meetings)}
            data-testid="button-export-sacramental"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
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
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de la Reunión</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                              <Input placeholder="Nombre completo" {...field} data-testid="input-presider" />
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
                              <Input placeholder="Nombre completo" {...field} data-testid="input-director" />
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
                            <FormLabel>Autoridades Visitantes</FormLabel>
                            <FormControl>
                              <Input placeholder="Nombres" {...field} data-testid="input-visiting-authority" />
                            </FormControl>
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
                            <Input placeholder="Ej: 1012 - En cualquier ocasión" {...field} data-testid="input-opening-hymn" />
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
                            <Input placeholder="Nombre de la persona" {...field} data-testid="input-opening-prayer" />
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
                                    setReleases(updated);
                                  }}>
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                      <SelectValue placeholder="Seleccionar organización" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getOrganizationsForReleases().map((org) => (
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
                                  <Input
                                    placeholder="Nombre"
                                    value={release.name}
                                    onChange={(e) => updateRelease(index, "name", e.target.value)}
                                    data-testid={`input-release-name-${index}`}
                                    className="flex-1 text-sm"
                                  />
                                  {isCustomCallingOrg(release.organizationId) ? (
                                    <Input
                                      placeholder="Llamamiento personalizado"
                                      value={release.oldCalling}
                                      onChange={(e) => updateRelease(index, "oldCalling", e.target.value)}
                                      data-testid={`input-release-calling-${index}`}
                                      className="flex-1 text-sm"
                                    />
                                  ) : (
                                    <Select value={release.oldCalling || ""} onValueChange={(calling) => {
                                      updateRelease(index, "oldCalling", calling);
                                    }}>
                                      <SelectTrigger className="h-8 text-sm flex-1">
                                        <SelectValue placeholder="Seleccionar llamamiento" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getCallingsForOrg(release.organizationId).map((calling) => (
                                          <SelectItem key={calling} value={calling}>{calling}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
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
                                    setSustainments(updated);
                                  }}>
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                      <SelectValue placeholder="Seleccionar organización" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getOrganizationsForReleases().map((org) => (
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
                                  <Input
                                    placeholder="Nombre"
                                    value={sustainment.name}
                                    onChange={(e) => updateSustainment(index, "name", e.target.value)}
                                    data-testid={`input-sustainment-name-${index}`}
                                    className="flex-1 text-sm"
                                  />
                                  {isCustomCallingOrg(sustainment.organizationId) ? (
                                    <Input
                                      placeholder="Llamamiento personalizado"
                                      value={sustainment.calling}
                                      onChange={(e) => updateSustainment(index, "calling", e.target.value)}
                                      data-testid={`input-sustainment-calling-${index}`}
                                      className="flex-1 text-sm"
                                    />
                                  ) : (
                                    <Select value={sustainment.calling || ""} onValueChange={(calling) => {
                                      updateSustainment(index, "calling", calling);
                                    }}>
                                      <SelectTrigger className="h-8 text-sm flex-1">
                                        <SelectValue placeholder="Seleccionar llamamiento" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getCallingsForOrg(sustainment.organizationId).map((calling) => (
                                          <SelectItem key={calling} value={calling}>{calling}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
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
                            <Input placeholder="Ej: 108 - Mansos, reverentes hoy" {...field} data-testid="input-sacrament-hymn" />
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
                              <Input
                                placeholder="Nombre del orador"
                                value={discourses[0].speaker}
                                onChange={(e) => updateDiscourse(0, "speaker", e.target.value)}
                                data-testid={`input-speaker-0`}
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
                                    <Input placeholder="Ej: 196" {...field} data-testid="input-intermediate-hymn" className="text-sm" />
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
                                    <Input
                                      placeholder="Nombre del orador"
                                      value={discourse.speaker}
                                      onChange={(e) => updateDiscourse(index, "speaker", e.target.value)}
                                      data-testid={`input-speaker-${index}`}
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
                            <Input placeholder="Ej: 1005" {...field} data-testid="input-closing-hymn" />
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
                            <Input placeholder="Nombre de la persona" {...field} data-testid="input-closing-prayer" />
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
                      Crear Reunión
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
            {meetings.map((meeting) => (
              <TableRow key={meeting.id}>
                <TableCell>
                  {new Date(meeting.date).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </TableCell>
                <TableCell>{meeting.presider || "-"}</TableCell>
                <TableCell>{meeting.director || "-"}</TableCell>
                <TableCell>
                  {(() => {
                    // Handle both boolean and string values from database
                    const isTestimony = typeof meeting.isTestimonyMeeting === 'string' 
                      ? meeting.isTestimonyMeeting === 'true'
                      : meeting.isTestimonyMeeting;
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
                    onClick={() => handleGeneratePDF(meeting)}
                    data-testid={`button-generate-pdf-${meeting.id}`}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(meeting)}
                        data-testid={`button-edit-${meeting.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(meeting.id)}
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
    </div>
  );
}
