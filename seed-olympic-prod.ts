import { db } from "./server/db";
import { dealerships, users, vehicles } from "@shared/schema";
import { hashPassword } from "./server/auth";
import { eq } from "drizzle-orm";

async function seedOlympic() {
  console.log("🏢 Seeding Olympic Hyundai Vancouver on production...\n");

  // Check if already exists
  const existing = await db.select().from(dealerships).where(eq(dealerships.slug, "olympic-hyundai"));
  if (existing.length > 0) {
    console.log("✅ Olympic Hyundai already exists (id:", existing[0].id, ")");
  } else {
    const [d] = await db.insert(dealerships).values({
      name: "Olympic Hyundai Vancouver",
      slug: "olympic-hyundai",
      subdomain: "olympic",
      address: "725 Marine Dr",
      city: "Vancouver",
      province: "BC",
      postalCode: "V5X 2T6",
      phone: "604-321-1131",
      isActive: true,
    }).returning();
    console.log("✅ Created dealership:", d.name, "(id:", d.id, ")");
  }

  const dealership = (await db.select().from(dealerships).where(eq(dealerships.slug, "olympic-hyundai")))[0];

  // Create admin user
  const existingUser = await db.select().from(users).where(eq(users.email, "admin@olympichyundai.ca"));
  if (existingUser.length > 0) {
    console.log("✅ Admin user already exists");
  } else {
    const hash = await hashPassword("OlympicAdmin2026!");
    await db.insert(users).values({
      email: "admin@olympichyundai.ca",
      name: "Olympic Admin",
      passwordHash: hash,
      role: "master",
      dealershipId: dealership.id,
      isActive: true,
    });
    console.log("✅ Created admin: admin@olympichyundai.ca / OlympicAdmin2026!");
  }

  // Seed demo vehicles
  const existingVehicles = await db.select().from(vehicles).where(eq(vehicles.dealershipId, dealership.id));
  if (existingVehicles.length > 0) {
    console.log(`✅ ${existingVehicles.length} vehicles already exist`);
  } else {
    await db.insert(vehicles).values([
      { dealershipId: dealership.id, year: 2024, make: "Hyundai", model: "Tucson", trim: "Preferred AWD", type: "SUV", price: 34999, odometer: 12500, images: ["https://images.unsplash.com/photo-1609521263047-f8f205293f24?q=80&w=800"], badges: ["One Owner", "No Accidents"], location: "Vancouver", dealership: "Olympic Hyundai Vancouver", description: "2024 Hyundai Tucson Preferred AWD. Advanced safety features, spacious interior." },
      { dealershipId: dealership.id, year: 2024, make: "Hyundai", model: "Kona", trim: "Ultimate", type: "SUV", price: 32900, odometer: 8200, images: ["https://images.unsplash.com/photo-1511919884226-fd3cad34687c?q=80&w=800"], badges: ["One Owner"], location: "Vancouver", dealership: "Olympic Hyundai Vancouver", description: "2024 Hyundai Kona Ultimate. Loaded with premium features." },
      { dealershipId: dealership.id, year: 2025, make: "Hyundai", model: "Santa Fe", trim: "Calligraphy", type: "SUV", price: 52000, odometer: 100, images: ["https://images.unsplash.com/photo-1592853625601-bb9d23da126e?q=80&w=800"], badges: ["New Arrival"], location: "Vancouver", dealership: "Olympic Hyundai Vancouver", description: "Brand new 2025 Santa Fe Calligraphy. Ultimate family SUV." },
      { dealershipId: dealership.id, year: 2023, make: "Hyundai", model: "Ioniq 5", trim: "Long Range AWD", type: "SUV", price: 47500, odometer: 18000, images: ["https://images.unsplash.com/photo-1619767886558-efdc259cde1a?q=80&w=800"], badges: ["Electric", "No Accidents"], location: "Vancouver", dealership: "Olympic Hyundai Vancouver", description: "2023 Ioniq 5 Long Range AWD. Ultra-fast charging, 480km range." },
      { dealershipId: dealership.id, year: 2021, make: "Hyundai", model: "Elantra", trim: "N Line", type: "Sedan", price: 26900, odometer: 45000, images: ["https://images.unsplash.com/photo-1605559424843-9e4c2287d38d?q=80&w=800"], badges: ["Fuel Efficient"], location: "Vancouver", dealership: "Olympic Hyundai Vancouver", description: "2021 Elantra N Line. Sporty and efficient." },
    ]);
    console.log("✅ Seeded 5 demo vehicles");
  }

  // Create super admin
  const existingSA = await db.select().from(users).where(eq(users.email, "ominous@lotview.ai"));
  if (existingSA.length > 0) {
    console.log("✅ Super admin already exists");
  } else {
    const hash = await hashPassword("LotView2026!");
    await db.insert(users).values({
      email: "ominous@lotview.ai",
      name: "System Administrator",
      passwordHash: hash,
      role: "super_admin",
      dealershipId: null,
      isActive: true,
    });
    console.log("✅ Created super admin: ominous@lotview.ai / LotView2026!");
  }

  console.log("\n🎉 Done! Olympic Hyundai Vancouver is live.");
  console.log("Access at: https://olympic.lotview.ai");
  process.exit(0);
}

seedOlympic().catch(e => { console.error(e); process.exit(1); });
