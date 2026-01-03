import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizations, useUsers } from "@/hooks/use-api";

interface UserSummary {
  id: string;
  name: string;
  role: string;
  organizationId?: string | null;
  avatarUrl?: string | null;
}

const roleLabels: Record<string, string> = {
  obispo: "Obispo",
  consejero_obispo: "Consejero del Obispo",
  secretario: "Secretario",
  secretario_ejecutivo: "Secretario Ejecutivo",
  secretario_financiero: "Secretario Financiero",
  presidente_organizacion: "Presidente de Organización",
  secretario_organizacion: "Secretario de Organización",
  consejero_organizacion: "Consejero de Organización",
};

const organizationLabels: Record<string, string> = {
  hombres_jovenes: "Hombres Jóvenes",
  mujeres_jovenes: "Mujeres Jóvenes",
  sociedad_socorro: "Sociedad de Socorro",
  primaria: "Primaria",
  escuela_dominical: "Escuela Dominical",
  jas: "JAS",
  cuorum_elderes: "Cuórum de Élderes",
};

const organizationOrder = [
  "hombres_jovenes",
  "mujeres_jovenes",
  "sociedad_socorro",
  "primaria",
  "escuela_dominical",
  "jas",
  "cuorum_elderes",
];

const getInitials = (name?: string) => {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

function LeaderItem({ user, fallbackLabel }: { user?: UserSummary | null; fallbackLabel?: string }) {
  if (!user) {
    return <p className="text-sm text-muted-foreground">{fallbackLabel ?? "Sin asignar"}</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9">
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
        <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{roleLabels[user.role] ?? user.role}</p>
      </div>
    </div>
  );
}

function LeaderGroup({ title, users }: { title: string; users: UserSummary[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      <div className="space-y-2">
        {users.length > 0 ? (
          users.map((user) => <LeaderItem key={user.id} user={user} />)
        ) : (
          <LeaderItem fallbackLabel="Sin asignar" />
        )}
      </div>
    </div>
  );
}

export default function LeadershipPage() {
  const { data: users = [] } = useUsers();
  const { data: organizations = [] } = useOrganizations();

  const typedUsers = users as UserSummary[];

  const obispo = typedUsers.find((user) => user.role === "obispo");
  const consejeros = typedUsers.filter((user) => user.role === "consejero_obispo");
  const secretarios = typedUsers.filter((user) =>
    ["secretario", "secretario_ejecutivo", "secretario_financiero"].includes(user.role)
  );

  const organizationItems = organizations
    .filter((org) => organizationOrder.includes(org.type))
    .sort(
      (a, b) => organizationOrder.indexOf(a.type) - organizationOrder.indexOf(b.type)
    );

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estructura del consejo de barrio</h1>
        <p className="text-sm text-muted-foreground">
          Organigrama con los líderes actuales y sus responsabilidades.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Obispado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LeaderGroup title="Obispo" users={obispo ? [obispo] : []} />
          <LeaderGroup title="Consejeros" users={consejeros} />
          <LeaderGroup title="Secretarios" users={secretarios} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizaciones del consejo de barrio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {organizationItems.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay organizaciones registradas.</p>
          )}
          {organizationItems.map((org) => {
            const president =
              typedUsers.find((user) => user.id === org.presidentId) ??
              typedUsers.find(
                (user) => user.role === "presidente_organizacion" && user.organizationId === org.id
              );
            const counselors = typedUsers.filter(
              (user) => user.role === "consejero_organizacion" && user.organizationId === org.id
            );
            const secretaries = typedUsers.filter(
              (user) => user.role === "secretario_organizacion" && user.organizationId === org.id
            );

            return (
              <div key={org.id} className="rounded-lg border border-border/60 p-4 space-y-4">
                <h3 className="text-base font-semibold">
                  {organizationLabels[org.type] ?? org.name}
                </h3>
                <div className="space-y-4">
                  <LeaderGroup title="Presidencia" users={president ? [president] : []} />
                  <LeaderGroup title="Consejeros" users={counselors} />
                  <LeaderGroup title="Secretarios" users={secretaries} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
