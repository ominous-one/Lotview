import { db } from "./db";
import { vehicles } from "@shared/schema";

const MOCK_VEHICLES = [
  {
    dealershipId: 1,
    year: 2024,
    make: "Hyundai",
    model: "Tucson",
    trim: "Preferred AWD",
    type: "SUV",
    price: 34999,
    odometer: 12500,
    images: ["https://images.unsplash.com/photo-1609521263047-f8f205293f24?q=80&w=800"],
    badges: ["One Owner", "No Accidents"],
    location: "Vancouver",
    dealership: "Olympic Hyundai Vancouver",
    description: "Experience the perfect blend of style and performance with this 2024 Hyundai Tucson. Featuring advanced safety features and a spacious interior, it's ready for your next adventure."
  },
  {
    dealershipId: 1,
    year: 2023,
    make: "Genesis",
    model: "GV70",
    trim: "3.5T Sport",
    type: "SUV",
    price: 58500,
    odometer: 24100,
    images: ["https://images.unsplash.com/photo-1619767886558-efdc259cde1a?q=80&w=800"],
    badges: ["Manager Special", "Clean Title"],
    location: "Burnaby",
    dealership: "Boundary Hyundai Vancouver",
    description: "Luxury meets performance in the Genesis GV70. This 3.5T Sport model offers thrilling dynamics and a premium cabin that stands out from the crowd."
  },
  {
    dealershipId: 1,
    year: 2024,
    make: "Hyundai",
    model: "Kona",
    trim: "Ultimate",
    type: "SUV",
    price: 32900,
    odometer: 8200,
    images: ["https://images.unsplash.com/photo-1511919884226-fd3cad34687c?q=80&w=800"],
    badges: ["One Owner"],
    location: "Vancouver",
    dealership: "Olympic Hyundai Vancouver",
    description: "Compact yet capable. The Kona Ultimate comes loaded with premium features and delivers exceptional fuel economy for city driving."
  },
  {
    dealershipId: 1,
    year: 2021,
    make: "Hyundai",
    model: "Elantra",
    trim: "N Line",
    type: "Sedan",
    price: 26900,
    odometer: 45000,
    images: ["https://images.unsplash.com/photo-1605559424843-9e4c2287d38d?q=80&w=800"],
    badges: ["Fuel Efficient", "No Accidents"],
    location: "Vancouver",
    dealership: "Olympic Hyundai Vancouver",
    description: "Sporty and efficient. The Elantra N Line delivers a spirited drive without breaking the bank at the pump. Perfect for city commuting."
  },
  {
    dealershipId: 1,
    year: 2025,
    make: "Hyundai",
    model: "Santa Fe",
    trim: "Calligraphy",
    type: "SUV",
    price: 52000,
    odometer: 100,
    images: ["https://images.unsplash.com/photo-1592853625601-bb9d23da126e?q=80&w=800"],
    badges: ["New Arrival", "No Accidents"],
    location: "Burnaby",
    dealership: "Boundary Hyundai Vancouver",
    description: "Brand new 2025 Santa Fe Calligraphy. The ultimate family SUV with bold styling, premium materials, and the latest technology."
  },
  {
    dealershipId: 1,
    year: 2023,
    make: "Kia",
    model: "Sportage",
    trim: "SX Prestige",
    type: "SUV",
    price: 38500,
    odometer: 22000,
    images: ["https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=800"],
    badges: ["Clean Title", "One Owner"],
    location: "Vancouver",
    dealership: "Kia Vancouver",
    description: "Bold design meets advanced technology. The Sportage SX Prestige offers a premium driving experience with cutting-edge safety features."
  },
  {
    dealershipId: 1,
    year: 2024,
    make: "Kia",
    model: "Telluride",
    trim: "SX",
    type: "SUV",
    price: 58900,
    odometer: 12000,
    images: ["https://images.unsplash.com/photo-1570733577055-3c8e2f8a4b2c?q=80&w=800"],
    badges: ["No Accidents", "Clean Title"],
    location: "Vancouver",
    dealership: "Kia Vancouver",
    description: "The award-winning Telluride. Spacious three-row luxury SUV with premium materials and advanced technology throughout."
  },
  {
    dealershipId: 1,
    year: 2022,
    make: "Hyundai",
    model: "Palisade",
    trim: "Ultimate Calligraphy",
    type: "SUV",
    price: 54900,
    odometer: 28500,
    images: ["https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?q=80&w=800"],
    badges: ["One Owner", "No Accidents"],
    location: "Burnaby",
    dealership: "Boundary Hyundai Vancouver",
    description: "Ultimate luxury and space. The Palisade Calligraphy offers premium comfort for the whole family with cutting-edge features."
  }
];

async function seed() {
  console.log("Seeding database with inventory...");

  await db.insert(vehicles).values(MOCK_VEHICLES);

  console.log(`✓ Seeded ${MOCK_VEHICLES.length} vehicles`);
  process.exit(0);
}

seed().catch((error) => {
  console.error("Error seeding database:", error);
  process.exit(1);
});
