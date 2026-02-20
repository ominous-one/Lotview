/**
 * Super Admin Seed Script
 * 
 * Creates the initial super admin account for system-wide management.
 * This account has no dealership affiliation (dealershipId=null) and can:
 * - Manage all dealerships
 * - Configure global API keys
 * - Create new dealerships
 * - View system-wide audit logs
 * 
 * Usage: tsx server/seed-super-admin.ts
 */

import { storage } from "./storage";
import { hashPassword } from "./auth";

const SUPER_ADMIN_EMAIL = "superadmin@olympicauto.com";
const SUPER_ADMIN_PASSWORD = "SuperAdmin2024!"; // Change this in production
const SUPER_ADMIN_NAME = "System Administrator";

async function seedSuperAdmin() {
  try {
    console.log("🔧 Super Admin Seed Script");
    console.log("==========================\n");
    
    // Check if super admin already exists
    console.log("Checking for existing super admin...");
    const existingAdmin = await storage.getUserByEmail(SUPER_ADMIN_EMAIL);
    
    if (existingAdmin) {
      console.log(`✅ Super admin already exists: ${SUPER_ADMIN_EMAIL}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Dealership ID: ${existingAdmin.dealershipId}`);
      console.log("\nTo reset password, delete the user and run this script again.\n");
      process.exit(0);
    }
    
    console.log("Creating super admin account...");
    
    // Hash password
    const passwordHash = await hashPassword(SUPER_ADMIN_PASSWORD);
    
    // Create super admin user
    const superAdmin = await storage.createUser({
      email: SUPER_ADMIN_EMAIL,
      name: SUPER_ADMIN_NAME,
      passwordHash,
      role: "super_admin",
      dealershipId: null, // Super admin has no dealership affiliation
      isActive: true
    });
    
    console.log("\n✅ Super admin account created successfully!");
    console.log("\nCredentials:");
    console.log("============");
    console.log(`Email:    ${SUPER_ADMIN_EMAIL}`);
    console.log(`Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log(`Role:     ${superAdmin.role}`);
    console.log(`ID:       ${superAdmin.id}`);
    console.log("\n⚠️  IMPORTANT: Change the password after first login!");
    console.log("\nThe super admin can now:");
    console.log("  • Manage all dealerships");
    console.log("  • Configure global API keys");
    console.log("  • Create new dealerships with master admins");
    console.log("  • View system-wide audit logs");
    console.log("\n");
    
  } catch (error) {
    console.error("\n❌ Error seeding super admin:", error);
    process.exit(1);
  }
}

// Run the seed script
seedSuperAdmin();
