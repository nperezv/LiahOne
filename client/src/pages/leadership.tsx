import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
  phone?: string | null;
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
  const phoneDigits = user.phone?.replace(/[^\d]/g, "") ?? "";
  const phoneHref = phoneDigits ? `tel:${phoneDigits}` : undefined;
  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}` : undefined;

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
        <div className="flex flex-col items-center gap-2 py-2">
          <Avatar className="h-24 w-24">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <p className="text-sm font-light">{user.name}</p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
          <div className="flex gap-2 pt-2">
            <a
              href={phoneHref}
              className={cn(
                "rounded-md border border-border px-3 py-1 text-sm font-medium",
                phoneHref
                  ? "text-foreground hover:bg-muted"
                  : "pointer-events-none text-muted-foreground"
              )}
            >
              Llamar
            </a>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "rounded-md border border-border px-3 py-1 text-sm font-medium",
                whatsappHref
                  ? "text-foreground hover:bg-muted"
                  : "pointer-events-none text-muted-foreground"
              )}
            >
              WhatsApp
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CounselorSlot({ counselor }: { counselor?: UserSummary | null }) {
  if (!counselor) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-xs font-semibold text-muted-foreground">
          ?
        </div>
        <span className="text-xs text-muted-foreground">Consejero</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <LeaderAvatar user={counselor} sizeClassName="h-14 w-14" />
      <span className="text-xs text-muted-foreground">
        {roleLabels[counselor.role] ?? counselor.role}
      </span>
    </div>
  );
}

function LeadershipCluster({
  title,
  president,
  counselors,
  secretaries,
}: {
  title: string;
  president?: UserSummary | null;
  counselors: UserSummary[];
  secretaries: UserSummary[];
}) {
  const [firstCounselor, secondCounselor] = counselors;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-center">{title}</h2>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end justify-center gap-6">
          <CounselorSlot counselor={firstCounselor} />
          <div className="flex flex-col items-center gap-2">
            {president ? (
              <>
                <LeaderAvatar user={president} sizeClassName="h-20 w-20" />
                <span className="text-xs text-muted-foreground">
                  {roleLabels[president.role] ?? president.role}
                </span>
              </>
            ) : (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-xs font-semibold text-muted-foreground">
                  ?
                </div>
                <span className="text-sm text-muted-foreground">Sin asignar</span>
              </>
            )}
          </div>
          <CounselorSlot counselor={secondCounselor} />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Secretarios
          </span>
          {secretaries.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {secretaries.map((secretary) => (
                <LeaderAvatar key={secretary.id} user={secretary} sizeClassName="h-8 w-8" />
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sin asignar</span>
          )}
        </div>
      </CardContent>
    </Card>
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

  const getOrganizationPresident = (orgId?: string) =>
    typedUsers.find((user) => user.id === orgId) ??
    typedUsers.find(
      (user) => user.role === "presidente_organizacion" && user.organizationId === orgId
    );

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Líderes del barrio:</h1>
        <p className="text-sm text-muted-foreground">
          Organigrama del Obispado y líderes del consejo de barrio.
        </p>
      </div>

      <LeadershipCluster
        title="Obispado"
        president={obispo}
        counselors={consejeros}
        secretaries={secretarios}
      />

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-center">Consejo de barrio</h2>
        </CardHeader>
        <CardContent className="grid gap-6">
          {organizationItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              No hay organizaciones registradas.
            </p>
          )}
          {organizationItems.map((org) => {
            const president =
              getOrganizationPresident(org.presidentId) ??
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
              <LeadershipCluster
                key={org.id}
                title={organizationLabels[org.type] ?? org.name}
                president={president}
                counselors={counselors}
                secretaries={secretaries}
              />
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
