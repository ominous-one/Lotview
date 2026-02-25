import { generateBatchDescriptions } from "./server/ai-description-generator";

async function main() {
  console.log("Batch generating descriptions for all vehicles (dealership 1)...\n");
  const result = await generateBatchDescriptions(1);
  console.log("\n=== BATCH RESULTS ===");
  console.log(`Total: ${result.total}`);
  console.log(`Success: ${result.success}`);
  console.log(`Failed: ${result.failed}`);
  if (result.errors.length > 0) {
    console.log("Errors:");
    result.errors.forEach(e => console.log(`  - ${e}`));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
