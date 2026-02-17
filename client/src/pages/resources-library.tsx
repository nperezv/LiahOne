import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download, ExternalLink, Loader2, Trash2, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth-tokens";
import { downloadResourceFile, openResourceFileInBrowser } from "@/lib/resource-download";
import {
  useCreatePresidencyResource,
  useDeletePresidencyResource,
  useOrganizations,
  usePresidencyResources,
} from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

const libraryAdminRoles = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"];
const orgRoles = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"];
const categoryOptions = ["manuales", "plantillas", "capacitacion"] as const;
const resourceTypeOptions = ["documento", "video", "plantilla"] as const;

type ResourceCategory = (typeof categoryOptions)[number];

type ResourceType = (typeof resourceTypeOptions)[number];

const resourceSchema = z
  .object({
    placeholderName: z.string().min(3, "El nombre visible es requerido"),
    description: z.string().optional(),
    scope: z.enum(["general", "organization"]),
    organizationId: z.string().optional(),
    category: z.enum(categoryOptions),
    resourceType: z.enum(resourceTypeOptions),
    file: z.instanceof(File, { message: "Debes seleccionar un archivo" }),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "organization" && !value.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organizationId"],
        message: "Selecciona una organización",
      });
    }
  });

type ResourceFormValues = z.infer<typeof resourceSchema>;

const categoryLabel: Record<ResourceCategory, string> = {
  manuales: "Manuales",
  plantillas: "Plantillas",
  capacitacion: "Capacitación",
};

const resourceTypeLabel: Record<ResourceType, string> = {
  documento: "Documento",
  video: "Video",
  plantilla: "Plantilla",
};

const isPdfFile = (filename?: string) => filename?.toLowerCase().endsWith(".pdf") ?? false;


export default function ResourcesLibraryPage() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isLibraryAdmin = libraryAdminRoles.includes(user?.role ?? "");
  const isOrgUser = orgRoles.includes(user?.role ?? "");

  const searchParams = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const requestedCategory = searchParams.get("category");
  const requestedOrganizationId = searchParams.get("organizationId") ?? undefined;
  const categoryFilter = categoryOptions.includes(requestedCategory as ResourceCategory)
    ? (requestedCategory as ResourceCategory)
    : undefined;

  const organizationFilter = isOrgUser ? user?.organizationId : requestedOrganizationId;
  const resourceFilters = { organizationId: organizationFilter, category: categoryFilter };

  const { data: organizations = [] } = useOrganizations();
  const { data: resources = [], isLoading } = usePresidencyResources(resourceFilters);
  const createResource = useCreatePresidencyResource(resourceFilters);
  const deleteResource = useDeletePresidencyResource(resourceFilters);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      placeholderName: "",
      description: "",
      scope: "general",
      organizationId: "",
      category: categoryFilter ?? "manuales",
      resourceType: "documento",
    },
  });

  const onSubmit = async (values: ResourceFormValues) => {
    try {
      const fileFormData = new FormData();
      fileFormData.append("file", values.file);

      const uploadResponse = await fetch("/api/uploads", {
        method: "POST",
        body: fileFormData,
        credentials: "include",
        headers: getAuthHeaders(),
      });

      if (!uploadResponse.ok) throw new Error("No se pudo subir el archivo");

      const uploaded = await uploadResponse.json();

      await createResource.mutateAsync({
        placeholderName: values.placeholderName,
        description: values.description,
        fileName: uploaded.filename,
        fileUrl: uploaded.url,
        category: values.category,
        resourceType: values.resourceType,
        organizationId: values.scope === "organization" ? values.organizationId ?? null : null,
      });

      form.reset({
        placeholderName: "",
        description: "",
        scope: "general",
        organizationId: "",
        category: values.category,
        resourceType: values.resourceType,
      });
    } catch {
      toast({
        title: "Error",
        description: "No se pudo subir/publicar el recurso.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 p-8">
      <div className="w-full">
        <h1 className="mb-2 text-2xl font-bold">Biblioteca de recursos</h1>
        <p className="text-sm text-muted-foreground">Recursos institucionales por categoría y organización.</p>
      </div>

      {isLibraryAdmin && (
        <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle>Publicar recurso</CardTitle>
            <CardDescription>Solo se permiten categorías Manuales, Plantillas y Capacitación.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="placeholderName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre visible (holdername)</FormLabel>
                    <FormControl><Input {...field} placeholder="Guía semanal de presidencia" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl><Textarea {...field} placeholder="Breve descripción del recurso" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sección</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="manuales">Manuales</SelectItem>
                          <SelectItem value="plantillas">Plantillas</SelectItem>
                          <SelectItem value="capacitacion">Capacitación</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="resourceType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de recurso</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="documento">Documento</SelectItem>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="plantilla">Plantilla</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="scope" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alcance</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="general">General (todas las presidencias)</SelectItem>
                        <SelectItem value="organization">Específico por organización</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {form.watch("scope") === "organization" && (
                  <FormField control={form.control} name="organizationId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organización</FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecciona una organización" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {organizations.map((organization) => (
                            <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <FormField control={form.control} name="file" render={({ field: { onChange, value, ...field } }) => (
                  <FormItem>
                    <FormLabel>Archivo</FormLabel>
                    <FormControl>
                      <Input {...field} type="file" onChange={(event) => onChange(event.target.files?.[0])} />
                    </FormControl>
                    {value && <p className="text-xs text-muted-foreground">Archivo: {value.name}</p>}
                    <FormMessage />
                  </FormItem>
                )} />

                <Button type="submit" disabled={createResource.isPending}>
                  {createResource.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publicando...</> : <><Upload className="mr-2 h-4 w-4" /> Publicar recurso</>}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle>Recursos disponibles</CardTitle>
          <CardDescription>
            {categoryFilter ? `Mostrando: ${categoryLabel[categoryFilter]}.` : "Listado de todas las secciones."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando recursos...</p>
          ) : resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay recursos publicados para esta sección.</p>
          ) : (
            resources.map((resource) => {
              const organizationName = resource.organizationId
                ? organizations.find((org) => org.id === resource.organizationId)?.name ?? "Organización específica"
                : "General";

              return (
                <div key={resource.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-semibold">{resource.placeholderName || resource.title}</h3>
                    {resource.description && <p className="text-sm text-muted-foreground">{resource.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">Sección: {categoryLabel[resource.category]} · Tipo: {resourceTypeLabel[resource.resourceType]}</p>
                    <p className="text-xs text-muted-foreground">Alcance: {organizationName}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {resource.resourceType === "video" ? (
                      <Button asChild variant="outline">
                        <a href={resource.fileUrl} target="_blank" rel="noopener noreferrer">Ver video</a>
                      </Button>
                    ) : (
                      <>
                        {!(isMobile && isPdfFile(resource.fileName)) && (
                          <Button
                            variant="outline"
                            onClick={async () => {
                              try {
                                await openResourceFileInBrowser(resource.fileUrl, resource.placeholderName || resource.title, resource.fileName);
                              } catch {
                                toast({
                                  title: "Error",
                                  description: "No se pudo abrir el recurso.",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              await downloadResourceFile(resource.fileUrl, resource.placeholderName || resource.title, resource.fileName);
                            } catch {
                              toast({
                                title: "Error",
                                description: "No se pudo descargar el recurso.",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" /> {isMobile && isPdfFile(resource.fileName) ? "Descargar (recomendado)" : "Descargar"}
                        </Button>
                      </>
                    )}
                    {isLibraryAdmin && (
                      <Button variant="destructive" onClick={() => deleteResource.mutate(resource.id)} disabled={deleteResource.isPending}>
                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
