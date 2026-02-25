import { generateDescription } from "./server/ai-description-generator";

async function main() {
  // Test on vehicle ID 20 (2025 Kona N Line) - local DB
  console.log("Generating description for vehicle 20 (2025 Kona N Line)...\n");
  const result = await generateDescription(20, 1);
  console.log("=== GENERATED DESCRIPTION ===\n");
  console.log(result);
  console.log("\n=== END ===");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
