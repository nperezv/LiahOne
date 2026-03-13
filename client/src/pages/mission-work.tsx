import { useMemo } from "react";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const MISSION_ROLES = ["mission_leader", "ward_missionary", "full_time_missionary", "obispo", "consejero_obispo", "presidente_organizacion", "consejero_organizacion", "secretario_organizacion"];

export default function MissionWorkPage() {
  const { toast } = useToast();
  const me = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const contacts = useQuery<any[]>({ queryKey: ["/api/mission/contacts"] });
  const services = useQuery<any[]>({ queryKey: ["/api/baptisms/services"] });
  const pendingPosts = useQuery<any[]>({ queryKey: ["/api/baptisms/moderation/posts?status=pending"], enabled: me.data?.role === "mission_leader" });

  const readinessQueries = useQueries({
    queries: (services.data || []).map((svc) => ({
      queryKey: [`/api/baptisms/services/${svc.id}/minimum-ready`],
      enabled: Boolean(svc?.id),
    })),
  });

  const linkQueries = useQueries({
    queries: (services.data || []).map((svc) => ({
      queryKey: [`/api/baptisms/services/${svc.id}/public-link-state`],
      enabled: Boolean(svc?.id),
    })),
  });

  const publishLink = useMutation({
    mutationFn: async (serviceId: string) => apiRequest("POST", `/api/baptisms/services/${serviceId}/publish-link`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/moderation/posts?status=pending"] });
      toast({ title: "Enlace 24h publicado" });
    },
  });

  const moderate = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => apiRequest("PATCH", `/api/baptisms/moderation/posts/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/moderation/posts?status=pending"] });
      toast({ title: "Post moderado" });
    },
  });

  const byType = useMemo(() => {
    const rows = contacts.data || [];
    return {
      friend: rows.filter((x) => x.personType === "friend"),
      recent: rows.filter((x) => x.personType === "recent_convert"),
      less: rows.filter((x) => x.personType === "less_active"),
    };
  }, [contacts.data]);

  if (!MISSION_ROLES.includes(me.data?.role)) {
    return <div className="p-6 text-sm text-muted-foreground">No tienes permisos para Obra Misional.</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Obra Misional</h1>
      <Tabs defaultValue="friends">
        <TabsList>
          <TabsTrigger value="friends">Amigos</TabsTrigger>
          <TabsTrigger value="recent">Conversos recientes</TabsTrigger>
          <TabsTrigger value="less">Menos activos</TabsTrigger>
          <TabsTrigger value="baptisms">Bautismos</TabsTrigger>
          {me.data?.role === "mission_leader" ? <TabsTrigger value="moderation">Moderación</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="friends"><SimpleList title="Amigos" rows={byType.friend} /></TabsContent>
        <TabsContent value="recent"><SimpleList title="Conversos recientes" rows={byType.recent} /></TabsContent>
        <TabsContent value="less"><SimpleList title="Menos activos" rows={byType.less} /></TabsContent>

        <TabsContent value="baptisms">
          <Card>
            <CardHeader><CardTitle>Servicios bautismales ({(services.data || []).length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(services.data || []).map((service, idx) => {
                const readiness = readinessQueries[idx]?.data as any;
                const linkState = linkQueries[idx]?.data as any;
                return (
                  <div key={service.id} className="rounded border p-3 text-sm">
                    <p className="font-medium">{service.locationName}</p>
                    <p className="text-muted-foreground">{new Date(service.serviceAt).toLocaleString("es-ES")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {readiness?.ready ? <Badge className="bg-green-600">Mínimo listo</Badge> : <Badge variant="secondary">Pendiente mínimo listo</Badge>}
                      {linkState?.active ? <Badge>Link público activo</Badge> : <Badge variant="outline">Sin link activo</Badge>}
                    </div>
                    {readiness && !readiness.ready ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Faltantes: {readiness.missingProgramTypes?.join(", ") || "-"} / {readiness.missingCriticalAssignments?.join(", ") || "-"}
                      </p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      {me.data?.role === "mission_leader" ? (
                        <Button size="sm" onClick={() => publishLink.mutate(service.id)} disabled={publishLink.isPending}>
                          Publicar enlace 24h
                        </Button>
                      ) : null}
                      {linkState?.activePublicUrl ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={linkState.activePublicUrl} target="_blank" rel="noreferrer">Vista previa pública</a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {(services.data || []).length === 0 ? <p className="text-sm text-muted-foreground">Sin servicios.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moderation">
          <Card>
            <CardHeader><CardTitle>Felicitaciones pendientes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(pendingPosts.data || []).length === 0 ? <p className="text-sm text-muted-foreground">Sin pendientes.</p> : null}
              {(pendingPosts.data || []).map((post) => (
                <div key={post.id} className="rounded border p-3 text-sm">
                  <p className="font-medium">{post.displayName || "Anónimo"}</p>
                  <p className="mb-2 text-muted-foreground">{post.message}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => moderate.mutate({ id: post.id, status: "approved" })}>Aprobar</Button>
                    <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: post.id, status: "rejected" })}>Rechazar</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SimpleList({ title, rows, field = "fullName" }: { title: string; rows: any[]; field?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({rows.length})</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row) => <div key={row.id} className="rounded border p-2 text-sm">{row[field] || row.fullName || row.id}</div>)}
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sin elementos.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
