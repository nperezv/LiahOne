import { db } from "./db";
import { users, organizations } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function run() {
  console.log("Adding organization leaders...");
  const orgs = await db.select().from(organizations);

  const getOrgId = (type: string) => orgs.find(o => o.type === type)?.id || null;

  const pwHash = await bcrypt.hash("leader123", 10);

  const leadersData = [
    { username: "elder", password: pwHash, name: "Presidente Elder", role: "presidente_organizacion", orgType: "cuorum_elderes" },
    { username: "socorro", password: pwHash, name: "Presidenta Socorro", role: "presidente_organizacion", orgType: "sociedad_socorro" },
    { username: "jovenes", password: pwHash, name: "Presidenta Mujeres Jovenes", role: "presidente_organizacion", orgType: "mujeres_jovenes" },
    { username: "primaria", password: pwHash, name: "Presidenta Primaria", role: "presidente_organizacion", orgType: "primaria" },
    { username: "secretario", password: pwHash, name: "Secretario de Barrio", role: "secretario", orgType: "obispado" },
    { username: "secre_ejec", password: pwHash, name: "Secretario Ejecutivo", role: "secretario_ejecutivo", orgType: "obispado" },
    { username: "secre_fin", password: pwHash, name: "Secretario Financiero", role: "secretario_financiero", orgType: "obispado" },
    { username: "consejero1", password: pwHash, name: "Primer Consejero", role: "consejero_obispo", orgType: "obispado" },
    { username: "consejero2", password: pwHash, name: "Segundo Consejero", role: "consejero_obispo", orgType: "obispado" },
  ];

  for (const leader of leadersData) {
    const orgId = getOrgId(leader.orgType);
    const exists = await db.select().from(users).where(eq(users.username, leader.username)).limit(1);
    if (exists.length > 0) continue;

    await db.insert(users).values({
      username: leader.username,
      password: leader.password,
      name: leader.name,
      email: `${leader.username}@liahone.com`,
      role: leader.role as any,
      organizationId: orgId,
    });
    console.log(`Created leader: ${leader.username}`);
  }

  console.log("Leaders seeded successfully!");
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
