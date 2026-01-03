import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

function DiagramNode({
  title,
  user,
  fallbackLabel = "Sin asignar",
}: {
  title: string;
  user?: UserSummary | null;
  fallbackLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {user ? (
        <>
          <LeaderAvatar user={user} sizeClassName="h-12 w-12" />
          <p className="max-w-[160px] text-sm font-medium">{user.name}</p>
        </>
      ) : (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-xs font-semibold text-muted-foreground">
            ?
          </div>
          <p className="max-w-[160px] text-sm font-medium text-muted-foreground">
            {fallbackLabel}
          </p>
        </>
      )}
    </div>
  );
}

function OrganizationNode({
  label,
  president,
  helperText,
}: {
  label: string;
  president?: UserSummary | null;
  helperText?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {president ? (
        <>
          <LeaderAvatar user={president} sizeClassName="h-10 w-10" />
          <p className="text-sm font-medium">{president.name}</p>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Sin presidencia</div>
      )}
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

function LevelHeader({
  colorClassName,
  title,
}: {
  colorClassName: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
      <span className={cn("h-3 w-3 rounded-sm", colorClassName)} />
      <span>{title}</span>
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

  const findOrganization = (type: string) =>
    organizationItems.find((org) => org.type === type);

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
          Vista tipo Teams con niveles, despliegue y responsabilidades del liderazgo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <LevelHeader colorClassName="bg-blue-500" title="Nivel 1 - Obispado (como cuerpo)" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 space-y-4">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Obispado
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <LeaderGroup title="Obispo" users={obispo ? [obispo] : []} />
              <LeaderGroup title="Consejeros" users={consejeros} />
              <LeaderGroup title="Secretarios" users={secretarios} />
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              El Obispado actúa como una presidencia unida y es responsable de:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>La dirección espiritual del barrio.</li>
              <li>El Consejo de Barrio y sus organizaciones.</li>
              <li>La supervisión de todas las organizaciones.</li>
              <li>La presidencia del Sacerdocio Aarónico.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <LevelHeader colorClassName="bg-emerald-500" title="Nivel 2 - Despliegue del Obispado" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
            <div className="flex flex-col items-center gap-4">
              <DiagramNode title="Obispo" user={obispo} />
              <div className="h-5 w-px bg-border" />
              <div className="w-full max-w-4xl space-y-3">
                <div className="mx-auto h-px w-3/4 bg-border" />
                <div className="grid grid-cols-3 items-start">
                  <div className="flex justify-center">
                    <div className="h-4 w-px bg-border" />
                  </div>
                  <div className="flex justify-center">
                    <div className="h-4 w-px bg-border" />
                  </div>
                  <div className="flex justify-center">
                    <div className="h-4 w-px bg-border" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <DiagramNode title="Primer Consejero" user={primerConsejero} />
                  <DiagramNode title="Segundo Consejero" user={segundoConsejero} />
                  <div className="flex flex-col items-center gap-2 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Secretarios
                    </p>
                    {secretarios.length > 0 ? (
                      <div className="space-y-2">
                        {secretarios.map((secretario) => (
                          <div key={secretario.id} className="flex items-center gap-2">
                            <LeaderAvatar user={secretario} sizeClassName="h-8 w-8" />
                            <div className="text-left">
                              <p className="text-sm font-medium">{secretario.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {roleLabels[secretario.role] ?? secretario.role}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin asignar</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Funciones clave:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>El Obispo preside el Consejo de Barrio y dirige la obra espiritual.</li>
              <li>Los Consejeros apoyan al Obispo y dan seguimiento a responsabilidades.</li>
              <li>Los Secretarios coordinan registros, informes y apoyo administrativo.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <LevelHeader
            colorClassName="bg-amber-500"
            title="Nivel 3 - Organizaciones y responsabilidades"
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
            <div className="flex flex-col items-center gap-4">
              <DiagramNode title="Obispo" user={obispo} />
              <div className="h-5 w-px bg-border" />
              <div className="w-full max-w-4xl space-y-3">
                <div className="mx-auto h-px w-3/4 bg-border" />
                <div className="grid grid-cols-3 items-start">
                  <div className="flex justify-center">
                    <div className="h-4 w-px bg-border" />
                  </div>
                  <div className="flex justify-center">
                    <div className="h-4 w-px bg-border" />
                  </div>
                  <div className="flex justify-center">
                    <div className="h-4 w-px bg-border" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-4">
                    <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Trato directo
                    </p>
                    {["cuorum_elderes", "sociedad_socorro"].map((type) => {
                      const org = findOrganization(type);
                      return (
                        <OrganizationNode
                          key={type}
                          label={organizationLabels[type] ?? type}
                          president={getOrganizationPresident(org?.presidentId)}
                        />
                      );
                    })}
                  </div>
                  <div className="space-y-4">
                    <DiagramNode title="Primer Consejero" user={primerConsejero} />
                    {["mujeres_jovenes", "escuela_dominical", "obra_del_templo"].map((type) => {
                      const org = findOrganization(type);
                      return (
                        <OrganizationNode
                          key={type}
                          label={organizationLabels[type] ?? "Obra del Templo"}
                          president={getOrganizationPresident(org?.presidentId)}
                          helperText={type === "obra_del_templo" ? "Asignación sugerida" : undefined}
                        />
                      );
                    })}
                  </div>
                  <div className="space-y-4">
                    <DiagramNode title="Segundo Consejero" user={segundoConsejero} />
                    {["primaria", "hombres_jovenes", "obra_misional"].map((type) => {
                      const org = findOrganization(type);
                      return (
                        <OrganizationNode
                          key={type}
                          label={organizationLabels[type] ?? "Obra Misional"}
                          president={getOrganizationPresident(org?.presidentId)}
                          helperText={type === "obra_misional" ? "Asignación sugerida" : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Claves importantes del Nivel 3:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>AS y JAS dependen de Cuórum de Élderes y Sociedad de Socorro.</li>
              <li>Se indica el consejero asignado para el seguimiento.</li>
              <li>Las presidencias siguen siendo las que dirigen cada organización.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <LevelHeader
            colorClassName="bg-purple-500"
            title="Apéndice - Obispado como presidencia del Sacerdocio Aarónico"
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Obispado
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {obispo && <LeaderAvatar user={obispo} sizeClassName="h-10 w-10" />}
                  {consejeros.map((user) => (
                    <LeaderAvatar key={user.id} user={user} sizeClassName="h-10 w-10" />
                  ))}
                </div>
              </div>
              <div className="h-5 w-px bg-border" />
              <div className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Presidencia del Sacerdocio Aarónico
              </div>
              <div className="h-5 w-px bg-border" />
              <OrganizationNode
                label={organizationLabels.hombres_jovenes ?? "Hombres Jóvenes"}
                president={getOrganizationPresident(findOrganization("hombres_jovenes")?.presidentId)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
