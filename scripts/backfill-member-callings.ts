import "../loadenv";
import { db } from "../server/db";
import { eq, and } from "drizzle-orm";
import { members, memberCallings, organizations, users } from "../shared/schema";

type CallingSeed = {
  memberId: string;
  callingName: string;
  organizationId: string | null;
};

const ROLE_LABELS: Record<string, { neutral: string; male?: string; female?: string }> = {
  obispo: { neutral: "Obispo" },
  consejero_obispo: { neutral: "Consejero del obispo" },
  secretario_ejecutivo: { neutral: "Secretario ejecutivo" },
  secretario: { neutral: "Secretario del barrio" },
  secretario_financiero: { neutral: "Secretario financiero" },
  presidente_organizacion: { neutral: "Presidente/Presidenta", male: "Presidente", female: "Presidenta" },
  consejero_organizacion: { neutral: "Consejero/Consejera", male: "Consejero", female: "Consejera" },
  secretario_organizacion: { neutral: "Secretario/Secretaria", male: "Secretario", female: "Secretaria" },
};

const OBISPADO_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario",
  "secretario_ejecutivo",
  "secretario_financiero",
]);

const normalizeSex = (sex?: string | null) => {
  const value = sex?.trim().toUpperCase();
  if (value === "M") return "M";
  if (value === "F") return "F";
  return undefined;
};

const getCallingLabel = (role: string, sex?: string | null) => {
  const labels = ROLE_LABELS[role];
  if (!labels) return null;
  const normalized = normalizeSex(sex);
  if (normalized === "M" && labels.male) return labels.male;
  if (normalized === "F" && labels.female) return labels.female;
  return labels.neutral;
};

async function getObispadoOrganizationId() {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.type, "obispado"));
  return org?.id ?? null;
}

async function callingExists(memberId: string, callingName: string, organizationId: string | null) {
  const [existing] = await db
    .select({ id: memberCallings.id })
    .from(memberCallings)
    .where(
      and(
        eq(memberCallings.memberId, memberId),
        eq(memberCallings.callingName, callingName),
        organizationId ? eq(memberCallings.organizationId, organizationId) : eq(memberCallings.organizationId, null)
      )
    );
  return Boolean(existing?.id);
}

async function main() {
  const obispadoOrgId = await getObispadoOrganizationId();

  const rows = await db
    .select({
      role: users.role,
      organizationId: users.organizationId,
      memberId: users.memberId,
      memberSex: members.sex,
    })
    .from(users)
    .leftJoin(members, eq(users.memberId, members.id));

  const inserts: CallingSeed[] = [];

  for (const row of rows) {
    if (!row.memberId) continue;
    const callingName = getCallingLabel(row.role, row.memberSex);
    if (!callingName) continue;

    const organizationId = OBISPADO_ROLES.has(row.role)
      ? obispadoOrgId
      : row.organizationId ?? null;

    const exists = await callingExists(row.memberId, callingName, organizationId);
    if (exists) continue;

    inserts.push({
      callingName,
      organizationId,
      memberId: row.memberId,
    });
  }

  if (inserts.length === 0) {
    console.log("No hay llamamientos por crear.");
    return;
  }

  await db.insert(memberCallings).values(
    inserts.map((entry) => ({
      memberId: entry.memberId,
      organizationId: entry.organizationId,
      callingName: entry.callingName,
    }))
  );

  console.log(`Se crearon ${inserts.length} llamamientos.`);
}

main().catch((error) => {
  console.error("Error en backfill de llamamientos:", error);
  process.exit(1);
});
