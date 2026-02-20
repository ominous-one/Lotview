import { db } from "./db";
import { users } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

async function seedUsers() {
  console.log("Seeding users...");
  
  // Check if master user exists
  const existingMaster = await db.select().from(users).where(eq(users.role, "master")).limit(1);
  
  if (existingMaster.length > 0) {
    console.log("Master user already exists. Skipping seed.");
    return;
  }
  
  // Create master user
  const masterPassword = await hashPassword("master123");
  
  await db.insert(users).values({
    email: "master@olympicauto.com",
    passwordHash: masterPassword,
    name: "Master Admin",
    role: "master",
    isActive: true,
    createdBy: null,
  });
  
  console.log("✓ Master user created:");
  console.log("  Email: master@olympicauto.com");
  console.log("  Password: master123");
  console.log("  IMPORTANT: Change this password immediately!");
  
  process.exit(0);
}

seedUsers().catch((error) => {
  console.error("Error seeding users:", error);
  process.exit(1);
});
