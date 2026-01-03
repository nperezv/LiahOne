import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useOrganizations, useUsers } from "@/hooks/use-api";
import { cn } from "@/lib/utils";

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

function LeaderAvatar({
  user,
  sizeClassName = "h-9 w-9",
}: {
  user: UserSummary;
  sizeClassName?: string;
}) {
  const roleLabel = roleLabels[user.role] ?? user.role;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar
            className={cn(
              sizeClassName,
              "transition-transform duration-200 ease-out hover:scale-105"
            )}
          >
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{user.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 py-2">
          <Avatar className="h-24 w-24">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <p className="text-sm text-muted-foreground">{roleLabel}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeaderItem({ user, fallbackLabel }: { user?: UserSummary | null; fallbackLabel?: string }) {
  if (!user) {
    return <p className="text-sm text-muted-foreground">{fallbackLabel ?? "Sin asignar"}</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <LeaderAvatar user={user} />
      <div>
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{roleLabels[user.role] ?? user.role}</p>
      </div>
    </div>
  );
}

function OrganizationSummary({
  label,
  president,
}: {
  label: string;
  president?: UserSummary | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {label
          .split(" ")
          .map((word) => word[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {president ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LeaderAvatar user={president} sizeClassName="h-6 w-6" />
            <span>{president.name}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin presidencia</p>
        )}
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
  const [primerConsejero, segundoConsejero] = consejeros;

  const organizationItems = organizations
    .filter((org) => organizationOrder.includes(org.type))
    .sort(
      (a, b) => organizationOrder.indexOf(a.type) - organizationOrder.indexOf(b.type)
    );

  const getOrganizationPresident = (orgId?: string) =>
    typedUsers.find((user) => user.id === orgId) ??
    typedUsers.find(
      (user) => user.role === "presidente_organizacion" && user.organizationId === orgId
    );

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estructura del consejo de barrio</h1>
        <p className="text-sm text-muted-foreground">
          Organigramas mínimos con despliegue al hacer clic, estilo Teams.
        </p>
      </div>

      <Collapsible>
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Obispado</h2>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ver organigrama
                </button>
              </CollapsibleTrigger>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <LeaderGroup title="Obispo" users={obispo ? [obispo] : []} />
              <LeaderGroup title="Consejeros" users={consejeros} />
              <LeaderGroup title="Secretarios" users={secretarios} />
            </div>
          </CardHeader>
          <CardContent>
            <CollapsibleContent className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <pre className="whitespace-pre font-mono text-sm text-muted-foreground">
{`                              OBISPADO
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
                                OBISPO
      │                           │                           │
PRIMER CONSEJERO            SEGUNDO CONSEJERO             SECRETARIOS
                                                          (del barrio)

                                OBISPO
                                  │`}
              </pre>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      <Collapsible>
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Organizaciones del consejo de barrio</h2>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ver organigrama
                </button>
              </CollapsibleTrigger>
            </div>
            {organizationItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay organizaciones registradas.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {organizationItems.map((org) => (
                  <OrganizationSummary
                    key={org.id}
                    label={organizationLabels[org.type] ?? org.name}
                    president={getOrganizationPresident(org.presidentId)}
                  />
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <CollapsibleContent className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <pre className="whitespace-pre font-mono text-sm text-muted-foreground">
{`┌─────────────────────────────┼──────────────────────────────────┐
      │                             │                                │
(TRATO DIRECTO)               PRIMER CONSEJERO                 SEGUNDO CONSEJERO
      │                             │                                │
      │                ┌────────────┼──────────────┐       ┌──────────┼──────────┐
      │                │            │              │       │          │          │
CUÓRUM DE ÉLDERES   MUJERES JÓVENES  ESCUELA     OBRA DEL  OBRA MISIONAL  PRIMARIA  HAZ
 (Presidencia)                     DOMINICAL    TEMPLO
      │
SOCIEDAD DE SOCORRO
 (Presidencia)

      │
      ├─ ADULTOS SOLTEROS (AS)
      │   (dependen de QE y SR · consejero asignado: PRIMER CONSEJERO)
      │
      └─ JÓVENES ADULTOS SOLTEROS (JAS)
          (dependen de QE y SR · consejero asignado: SEGUNDO CONSEJERO)`}
              </pre>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      <Collapsible>
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                Apéndice – Presidencia del Sacerdocio Aarónico
              </h2>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ver organigrama
                </button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CardContent>
            <CollapsibleContent className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <pre className="whitespace-pre font-mono text-sm text-muted-foreground">
{`                           OBISPADO
      (Obispo + Primer Consejero + Segundo Consejero)
                                  │
                 PRESIDENCIA DEL SACERDOCIO AARÓNICO
                                  │
                           HOMBRES JÓVENES`}
              </pre>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </div>
  );
}
