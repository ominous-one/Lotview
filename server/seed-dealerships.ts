import { db } from "./db";
import { 
  dealerships, 
  users, 
  creditScoreTiers, 
  modelYearTerms,
  chatPrompts 
} from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

async function seedDealerships() {
  console.log("🏢 Seeding dealerships and configuration...\n");
  
  try {
    // Check if all dealerships exist
    const existing = await db.select().from(dealerships);
    const existingSlugs = existing.map(d => d.slug);
    
    if (existing.length > 0) {
      console.log(`⚠️  Found ${existing.length} existing dealership(s). Checking configuration...`);
    }

    // ===== CREATE DEALERSHIPS =====
    console.log("\nCreating dealerships...");
    const dealershipData = [
      {
        name: "Olympic Hyundai Vancouver",
        slug: "olympic-hyundai",
        subdomain: "olympic",
        isActive: true,
      },
      {
        name: "Boundary Hyundai Vancouver",
        slug: "boundary-hyundai",
        subdomain: "boundary",
        isActive: true,
      },
      {
        name: "Kia Vancouver",
        slug: "kia-vancouver",
        subdomain: "kia",
        isActive: true,
      },
    ];

    // Only insert dealerships that don't exist
    const toCreate = dealershipData.filter(d => !existingSlugs.includes(d.slug));
    const createdDealerships = toCreate.length > 0 
      ? await db.insert(dealerships).values(toCreate).returning()
      : [];
    
    if (createdDealerships.length > 0) {
      console.log(`✓ Created ${createdDealerships.length} new dealership(s)`);
    }
    
    // Get all dealerships (existing + new) and map by slug for correct assignment
    const allDealerships = await db.select().from(dealerships).orderBy(dealerships.id);
    const dealershipMap = new Map(allDealerships.map(d => [d.slug, d]));
    
    const olympicHyundai = dealershipMap.get('olympic-hyundai');
    const boundaryHyundai = dealershipMap.get('boundary-hyundai');
    const kiaVancouver = dealershipMap.get('kia-vancouver');
    
    if (!olympicHyundai || !boundaryHyundai || !kiaVancouver) {
      throw new Error("Missing one or more required dealerships after creation");
    }

    // ===== CREATE MASTER ADMIN USERS =====
    console.log("\nCreating master admin users...");
    const hashedPassword = await hashPassword("master123");
    
    // Check which users already exist
    const existingUsers = await db.select().from(users).where(eq(users.role, "master"));
    const existingUserDealershipIds = existingUsers.map(u => u.dealershipId);
    
    const masterUsersData = [
      {
        dealershipId: olympicHyundai.id,
        email: "admin@olympichyundai.ca",
        passwordHash: hashedPassword,
        name: "Olympic Admin",
        role: "master" as const,
        isActive: true,
        createdBy: null,
      },
      {
        dealershipId: boundaryHyundai.id,
        email: "admin@boundaryhyundai.ca",
        passwordHash: hashedPassword,
        name: "Boundary Admin",
        role: "master" as const,
        isActive: true,
        createdBy: null,
      },
      {
        dealershipId: kiaVancouver.id,
        email: "admin@kiavancouver.ca",
        passwordHash: hashedPassword,
        name: "Kia Admin",
        role: "master" as const,
        isActive: true,
        createdBy: null,
      },
    ];

    const usersToCreate = masterUsersData.filter(u => !existingUserDealershipIds.includes(u.dealershipId));
    if (usersToCreate.length > 0) {
      await db.insert(users).values(usersToCreate);
      console.log(`✓ Created ${usersToCreate.length} master admin user(s)`);
    } else {
      console.log("✓ All master admin users already exist");
    }

    // ===== CREATE CREDIT SCORE TIERS (for all dealerships) =====
    console.log("\nCreating credit score tiers...");
    
    // Check which dealerships need credit tiers
    const existingCreditTiers = await db.select().from(creditScoreTiers);
    const dealershipsWithCreditTiers = new Set(existingCreditTiers.map(ct => ct.dealershipId));
    const dealershipsNeedingTiers = allDealerships.filter(d => !dealershipsWithCreditTiers.has(d.id));
    
    const creditTiers = dealershipsNeedingTiers.flatMap(dealership => [
      {
        dealershipId: dealership.id,
        tierName: "Excellent",
        minScore: 750,
        maxScore: 850,
        interestRate: 399, // 3.99%
        isActive: true,
      },
      {
        dealershipId: dealership.id,
        tierName: "Very Good",
        minScore: 700,
        maxScore: 749,
        interestRate: 499, // 4.99%
        isActive: true,
      },
      {
        dealershipId: dealership.id,
        tierName: "Good",
        minScore: 650,
        maxScore: 699,
        interestRate: 699, // 6.99%
        isActive: true,
      },
      {
        dealershipId: dealership.id,
        tierName: "Fair",
        minScore: 600,
        maxScore: 649,
        interestRate: 999, // 9.99%
        isActive: true,
      },
      {
        dealershipId: dealership.id,
        tierName: "Poor",
        minScore: 300,
        maxScore: 599,
        interestRate: 1499, // 14.99%
        isActive: true,
      },
    ]);

    if (creditTiers.length > 0) {
      await db.insert(creditScoreTiers).values(creditTiers);
      console.log(`✓ Created ${creditTiers.length} credit score tiers (${dealershipsNeedingTiers.length} dealership(s))`);
    } else {
      console.log("✓ All dealerships already have credit score tiers");
    }

    // ===== CREATE MODEL YEAR TERMS (for all dealerships) =====
    console.log("\nCreating financing term rules...");
    
    // Check which dealerships need model year terms
    const existingYearTerms = await db.select().from(modelYearTerms);
    const dealershipsWithYearTerms = new Set(existingYearTerms.map(yt => yt.dealershipId));
    const dealershipsNeedingYearTerms = allDealerships.filter(d => !dealershipsWithYearTerms.has(d.id));
    
    const currentYear = new Date().getFullYear();
    const yearTerms = dealershipsNeedingYearTerms.flatMap(dealership => [
      {
        dealershipId: dealership.id,
        minModelYear: currentYear,
        maxModelYear: currentYear + 1,
        availableTerms: ["24", "36", "48", "60", "72", "84"],
        isActive: true,
      },
      {
        dealershipId: dealership.id,
        minModelYear: currentYear - 3,
        maxModelYear: currentYear - 1,
        availableTerms: ["24", "36", "48", "60", "72"],
        isActive: true,
      },
      {
        dealershipId: dealership.id,
        minModelYear: currentYear - 7,
        maxModelYear: currentYear - 4,
        availableTerms: ["24", "36", "48", "60"],
        isActive: true,
      },
      {
        dealershipId: dealership.id,
        minModelYear: 2010,
        maxModelYear: currentYear - 8,
        availableTerms: ["24", "36", "48"],
        isActive: true,
      },
    ]);

    if (yearTerms.length > 0) {
      await db.insert(modelYearTerms).values(yearTerms);
      console.log(`✓ Created ${yearTerms.length} financing term rules (${dealershipsNeedingYearTerms.length} dealership(s))`);
    } else {
      console.log("✓ All dealerships already have financing term rules");
    }

    // ===== CREATE DEFAULT CHAT PROMPTS (for all dealerships) =====
    console.log("\nCreating default chat prompts...");
    
    // Check which dealerships need chat prompts
    const existingChatPrompts = await db.select().from(chatPrompts);
    const dealershipsWithPrompts = new Set(existingChatPrompts.map(cp => cp.dealershipId));
    const dealershipsNeedingPrompts = allDealerships.filter(d => !dealershipsWithPrompts.has(d.id));
    
    const chatPromptData = dealershipsNeedingPrompts.flatMap(dealership => [
      {
        name: `${dealership.name} - Test Drive`,
        dealershipId: dealership.id,
        scenario: "test-drive",
        systemPrompt: `You are a helpful assistant for ${dealership.name}. Help customers schedule test drives. Be friendly, professional, and gather: preferred date/time, contact information, and which vehicle they're interested in. If they have questions about the vehicle, answer them enthusiastically.`,
        greeting: `Hi! I'd love to help you schedule a test drive at ${dealership.name}. Which vehicle are you interested in?`,
        isActive: true,
      },
      {
        name: `${dealership.name} - Get Approved`,
        dealershipId: dealership.id,
        scenario: "get-approved",
        systemPrompt: `You are a financing specialist for ${dealership.name}. Help customers understand their financing options and pre-approval process. Gather: employment status, credit score range, down payment amount, and monthly budget. Explain the benefits of getting pre-approved and how it speeds up the buying process.`,
        greeting: `Welcome to ${dealership.name}! Let's explore your financing options. Getting pre-approved is quick and won't affect your credit score. What vehicle are you interested in financing?`,
        isActive: true,
      },
      {
        name: `${dealership.name} - Value Trade`,
        dealershipId: dealership.id,
        scenario: "value-trade",
        systemPrompt: `You are a trade-in specialist for ${dealership.name}. Help customers get a trade-in valuation for their current vehicle. Gather: year, make, model, trim, odometer reading, condition, and any issues. Explain that we offer competitive trade-in values and can provide an instant estimate.`,
        greeting: `Hi! I can help you get a trade-in value for your current vehicle. What are you driving right now?`,
        isActive: true,
      },
      {
        name: `${dealership.name} - Reserve`,
        dealershipId: dealership.id,
        scenario: "reserve",
        systemPrompt: `You are a reservation specialist for ${dealership.name}. Help customers reserve vehicles with a refundable deposit. Gather: which vehicle they want to reserve, contact information, and preferred payment method. Explain that reservations are fully refundable and hold the vehicle for 48 hours.`,
        greeting: `Great choice! I can help you reserve this vehicle. Reservations are fully refundable and hold the vehicle for 48 hours. Let me get a few details from you.`,
        isActive: true,
      },
      {
        name: `${dealership.name} - General`,
        dealershipId: dealership.id,
        scenario: "general",
        systemPrompt: `You are a knowledgeable sales assistant for ${dealership.name}. Answer questions about vehicles, inventory, features, pricing, and dealership services. Be helpful, enthusiastic, and guide customers toward booking a test drive or speaking with a sales specialist for specific pricing questions.`,
        greeting: `Welcome to ${dealership.name}! How can I help you today? Are you looking for something specific or would you like to browse our inventory?`,
        isActive: true,
      },
    ]);

    if (chatPromptData.length > 0) {
      await db.insert(chatPrompts).values(chatPromptData);
      console.log(`✓ Created ${chatPromptData.length} chat prompts (${dealershipsNeedingPrompts.length} dealership(s))`);
    } else {
      console.log("✓ All dealerships already have chat prompts");
    }

    // ===== SUMMARY =====
    console.log("\n" + "=".repeat(60));
    console.log("✅ SEED COMPLETE - Your dealerships are ready!");
    console.log("=".repeat(60));
    console.log("\n📋 Login Credentials for your 3 dealerships:\n");
    
    const targetDealerships = allDealerships.filter(d => 
      ['olympic-hyundai', 'boundary-hyundai', 'kia-vancouver'].includes(d.slug)
    );
    
    targetDealerships.forEach((dealership) => {
      const emailMap: Record<string, string> = {
        'olympic-hyundai': 'admin@olympichyundai.ca',
        'boundary-hyundai': 'admin@boundaryhyundai.ca',
        'kia-vancouver': 'admin@kiavancouver.ca',
      };
      const email = emailMap[dealership.slug];
      console.log(`${dealership.name}:`);
      console.log(`  Email: ${email}`);
      console.log(`  Password: master123`);
      console.log(`  Dealership ID: ${dealership.id}`);
      console.log("");
    });

    console.log("⚠️  IMPORTANT: Change these passwords immediately after first login!\n");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding dealerships:", error);
    process.exit(1);
  }
}

seedDealerships();
