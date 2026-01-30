import { db } from "./db";
import { users, organizations, members, birthdays } from "@shared/schema";
import bcrypt from "bcrypt";
import fs from "fs/promises";
import path from "path";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    const existingUsers = await db.select().from(users);
    const existingOrganizations = await db.select().from(organizations);
    const existingMembers = await db.select().from(members);

    const orgByType = new Map(existingOrganizations.map((org) => [org.type, org]));
    const ensureOrganization = async (type: typeof organizations.$inferSelect["type"], name: string) => {
      const existing = orgByType.get(type);
      if (existing) return existing;
      const [created] = await db.insert(organizations).values({ type, name }).returning();
      orgByType.set(type, created);
      return created;
    };

    console.log("Ensuring organizations...");
    await ensureOrganization("obispado", "Obispado");
    await ensureOrganization("barrio", "Barrio");
    await ensureOrganization("cuorum_elderes", "Cuórum de Élderes");
    await ensureOrganization("sociedad_socorro", "Sociedad de Socorro");
    await ensureOrganization("hombres_jovenes", "Hombres Jóvenes");
    await ensureOrganization("mujeres_jovenes", "Mujeres Jóvenes");
    await ensureOrganization("primaria", "Primaria");
    await ensureOrganization("escuela_dominical", "Escuela Dominical");
    await ensureOrganization("jas", "JAS");

    if (existingUsers.length === 0) {
      console.log("Creating admin user...");
      const hashedPassword = await bcrypt.hash("admin123", 10);

      const adminUser = await db
        .insert(users)
        .values({
          username: "admin",
          password: hashedPassword,
          name: "Obispo Administrador",
          email: "admin@liahone.com",
          role: "obispo",
        })
        .returning();

      console.log(`✅ Created admin user: ${adminUser[0].username}`);
    } else {
      console.log("✅ Users already exist, skipping admin creation.");
    }

    if (existingMembers.length > 0) {
      console.log("✅ Members already seeded, skipping member import.");
    } else {
      const csvPath =
        process.env.MEMBERS_CSV_PATH ||
        path.resolve(process.cwd(), "uploads", "members.csv");

      try {
        const csvContent = await fs.readFile(csvPath, "utf-8");
        const rows = parseCsv(csvContent);
        const normalized = rows
          .map((row) => normalizeMemberRow(row, orgByType))
          .filter(Boolean) as MemberSeed[];

        const membersToInsert = normalized.map((member) => ({
          nameSurename: member.nameSurename,
          sex: member.sex,
          birthday: member.birthday,
          phone: member.phone || null,
          email: member.email || null,
          organizationId: member.organizationId,
        }));

        if (membersToInsert.length > 0) {
          await db.insert(members).values(membersToInsert);
          console.log(`✅ Imported ${membersToInsert.length} members`);
        }

        const birthdaysToInsert = normalized
          .filter((member) => member.birthday)
          .map((member) => ({
            name: member.nameSurename,
            birthDate: member.birthday,
            email: member.email || null,
            phone: member.phone || null,
            organizationId: member.organizationId,
          }));

        if (birthdaysToInsert.length > 0) {
          await db.insert(birthdays).values(birthdaysToInsert);
          console.log(`✅ Imported ${birthdaysToInsert.length} birthdays`);
        }
      } catch (error) {
        console.warn(`⚠️ No CSV found at ${csvPath}. Members were not seeded.`);
      }
    }

    console.log(`\n🎉 Seeding completed successfully!`);
    if (existingUsers.length === 0) {
      console.log(`\n📝 Login credentials:`);
      console.log(`   Username: admin`);
      console.log(`   Password: admin123\n`);
    }
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

type MemberSeed = {
  nameSurename: string;
  sex: string;
  birthday: Date;
  phone?: string;
  email?: string;
  organizationId?: string | null;
};

const parseCsv = (content: string) => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase()
  );
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() ?? "";
    });
    return record;
  });
};

const splitCsvLine = (line: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
};

const normalizeHeader = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9_]/gi, "_")
    .toLowerCase();

const resolveOrganizationType = (sex: string, birthday: Date) => {
  const normalizedSex = sex.trim().toLowerCase();
  const birthYear = birthday.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  const ageThisYear = currentYear - birthYear;

  if (ageThisYear <= 11) return "primaria";
  if (ageThisYear >= 12 && ageThisYear <= 18) {
    return normalizedSex.startsWith("f") ? "mujeres_jovenes" : "hombres_jovenes";
  }
  return normalizedSex.startsWith("f") ? "sociedad_socorro" : "cuorum_elderes";
};

const normalizeMemberRow = (
  row: Record<string, string>,
  orgByType: Map<string, { id: string }>
) => {
  const normalizedRow: Record<string, string> = {};
  Object.entries(row).forEach(([key, value]) => {
    normalizedRow[normalizeHeader(key)] = value.trim();
  });

  const nameSurename =
    normalizedRow.name_surename ||
    normalizedRow.apellidos_nombres ||
    normalizedRow.nombre ||
    normalizedRow.name ||
    "";

  const sex = normalizedRow.sex || normalizedRow.sexo || "";
  const birthdayRaw = normalizedRow.birthday || normalizedRow.fecha_nacimiento || "";
  const phone = normalizedRow.phone || normalizedRow.telefono || "";
  const email = normalizedRow.email || "";

  if (!nameSurename || !sex || !birthdayRaw) return null;

  const birthday = new Date(birthdayRaw);
  if (Number.isNaN(birthday.getTime())) return null;

  const organizationType = resolveOrganizationType(sex, birthday);
  const org = orgByType.get(organizationType);

  return {
    nameSurename,
    sex,
    birthday,
    phone,
    email,
    organizationId: org?.id ?? null,
  };
};

seed()
  .then(() => {
    console.log("✅ Seed script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seed script failed:", error);
    process.exit(1);
  });
