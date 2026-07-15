import { db } from "./db";
import { users } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function run() {
  console.log("Creating admin user...");
  const exists = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (exists.length > 0) {
    console.log("Admin user already exists!");
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);
  await db.insert(users).values({
    username: "admin",
    password: hashedPassword,
    name: "Obispo Administrador",
    email: "admin@liahone.com",
    role: "obispo",
  });

  console.log("Admin user created successfully!");
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
