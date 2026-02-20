import { triggerManualSync } from "./server/scheduler";

async function main() {
  console.log("Starting manual inventory sync...");
  const result = await triggerManualSync();
  console.log("Sync result:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error("Sync failed:", err);
  process.exit(1);
});
