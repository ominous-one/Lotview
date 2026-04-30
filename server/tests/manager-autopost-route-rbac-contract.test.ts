import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager autopost route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const autopostBlock = routesSource.match(
    /\/\/ ===== Autopost Priority Queue \(Inventory Sync v1\.1\) =====[\s\S]*?\/\/ Worker\/extension: claim next/
  )?.[0];

  it("requires explicit permissions for manager queue reads and writes", () => {
    expect(autopostBlock).toBeDefined();

    for (const route of [
      "app.get('/api/manager/autopost/queue', authMiddleware, requirePermission(\"messages.read\"), requireDealership, requireRole('master', 'sales_manager')",
      "app.post('/api/manager/autopost/queue/evaluate', authMiddleware, requirePermission(\"messages.write\"), requireDealership, requireRole('master', 'sales_manager')",
      "app.post('/api/manager/autopost/queue/reorder', authMiddleware, requirePermission(\"messages.write\"), requireDealership, requireRole('master', 'sales_manager')",
      "app.post('/api/manager/autopost/queue/:queueItemId/photo-override', authMiddleware, requirePermission(\"messages.write\"), requireDealership, requireRole('master', 'sales_manager')",
      "app.post('/api/manager/autopost/queue/:queueItemId/dequeue', authMiddleware, requirePermission(\"messages.write\"), requireDealership, requireRole('master', 'sales_manager')",
    ]) {
      expect(autopostBlock).toContain(route);
    }
  });

  it("keeps queue operations scoped to the resolved dealership", () => {
    expect(autopostBlock).toBeDefined();

    const dealershipGuards = autopostBlock?.match(/requireDealership/g) ?? [];
    expect(dealershipGuards.length).toBeGreaterThanOrEqual(5);
    expect(autopostBlock).toContain("const dealershipId = req.dealershipId!");
    expect(autopostBlock).toContain("listAutopostQueue({ dealershipId, platform })");
    expect(autopostBlock).toContain("resolveDealershipScrapeGateForPosting(dealershipId)");
    expect(autopostBlock).toContain("evaluateAndEnqueueAutopostQueue({");
    expect(autopostBlock).toContain("reorderAutopostQueue({ dealershipId, orderedQueueItemIds, actorUserId: req.user?.id ?? null })");
    expect(autopostBlock).toContain("setPhotoGateOverride({ dealershipId, queueItemId, enabled, actorUserId: req.user!.id, reason })");
    expect(autopostBlock).toContain("dequeueAutopostQueueItem({ dealershipId, queueItemId, actorUserId: req.user?.id ?? null, reason })");
  });
});
