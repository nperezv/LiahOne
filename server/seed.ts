import { db } from "./db";
import { users, organizations } from "@shared/schema";
import bcrypt from "bcrypt";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Check if users already exist
    const existingUsers = await db.select().from(users);
    if (existingUsers.length > 0) {
      console.log("✅ Database already seeded, skipping...");
      return;
    }

    // Create organizations
    console.log("Creating organizations...");
    const orgs = await db
      .insert(organizations)
      .values([
        {
          name: "Hombres Jóvenes",
          type: "hombres_jovenes",
        },
        {
          name: "Mujeres Jóvenes",
          type: "mujeres_jovenes",
        },
        {
          name: "Sociedad de Socorro",
          type: "sociedad_socorro",
        },
        {
          name: "Primaria",
          type: "primaria",
        },
        {
          name: "Escuela Dominical",
          type: "escuela_dominical",
        },
      ])
      .returning();

    console.log(`✅ Created ${orgs.length} organizations`);

    // Create admin user (Obispo)
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
    console.log(`\n🎉 Seeding completed successfully!`);
    console.log(`\n📝 Login credentials:`);
    console.log(`   Username: admin`);
    console.log(`   Password: admin123\n`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

seed()
  .then(() => {
    console.log("✅ Seed script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seed script failed:", error);
    process.exit(1);
  });
