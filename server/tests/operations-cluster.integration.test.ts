/**
 * Operations cluster — STORAGE-LAYER tenant-isolation + CRUD-lifecycle proof
 * (real Postgres). Covers filter groups and scrape sources, which both expose
 * tenant-scoped list/update/delete keyed on dealershipId (no get-by-id, so reads
 * are verified via the dealership-scoped list).
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import { storage } from "../storage";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const byId = (rows: any[], id: number) => rows.find((r) => r.id === id);

describeIf("Operations cluster (storage layer, real Postgres)", () => {
  let dealerA: any;
  let dealerB: any;

  beforeAll(async () => {
    const tag = uniq();
    dealerA = await storage.createDealership({ name: `Ops A ${tag}`, slug: `ops-a-${tag}` } as any);
    dealerB = await storage.createDealership({ name: `Ops B ${tag}`, slug: `ops-b-${tag}` } as any);
  });

  afterAll(async () => {
    if (dealerA?.id) await storage.deleteDealership(dealerA.id);
    if (dealerB?.id) await storage.deleteDealership(dealerB.id);
  });

  test("two distinct dealerships were created", () => {
    expect(dealerA.id).not.toBe(dealerB.id);
  });

  describe("filter groups", () => {
    let groupA: any;
    let groupB: any;

    beforeAll(async () => {
      const t = uniq();
      groupA = await storage.createFilterGroup({ dealershipId: dealerA.id, groupName: "Used A", groupSlug: `used-a-${t}` } as any);
      groupB = await storage.createFilterGroup({ dealershipId: dealerB.id, groupName: "Used B", groupSlug: `used-b-${t}` } as any);
    });

    test("getFilterGroups returns ONLY the requesting dealership's groups", async () => {
      const a = await storage.getFilterGroups(dealerA.id);
      const ids = a.map((g: any) => g.id);
      expect(ids).toContain(groupA.id);
      expect(ids).not.toContain(groupB.id);
    });

    test("updateFilterGroup cannot modify another dealership's group", async () => {
      const res = await storage.updateFilterGroup(groupB.id, dealerA.id, { groupName: "Hacked" } as any);
      expect(res).toBeUndefined();
      const stillB = byId(await storage.getFilterGroups(dealerB.id), groupB.id);
      expect(stillB?.groupName).toBe("Used B");
    });

    test("deleteFilterGroup cannot delete another dealership's group", async () => {
      const ok = await storage.deleteFilterGroup(groupB.id, dealerA.id);
      expect(ok).toBe(false);
      expect(byId(await storage.getFilterGroups(dealerB.id), groupB.id)).toBeTruthy();
    });

    test("create -> list -> update -> delete lifecycle within one tenant", async () => {
      const t = uniq();
      const g = await storage.createFilterGroup({ dealershipId: dealerA.id, groupName: "Lifecycle", groupSlug: `lc-${t}` } as any);
      expect(byId(await storage.getFilterGroups(dealerA.id), g.id)).toBeTruthy();
      const updated = await storage.updateFilterGroup(g.id, dealerA.id, { groupName: "Lifecycle 2" } as any);
      expect(updated?.groupName).toBe("Lifecycle 2");
      expect(await storage.deleteFilterGroup(g.id, dealerA.id)).toBe(true);
      expect(byId(await storage.getFilterGroups(dealerA.id), g.id)).toBeUndefined();
    });
  });

  describe("scrape sources", () => {
    let sourceA: any;
    let sourceB: any;

    beforeAll(async () => {
      sourceA = await storage.createScrapeSource({ dealershipId: dealerA.id, sourceName: "Site A", sourceUrl: "https://a.example.com" } as any);
      sourceB = await storage.createScrapeSource({ dealershipId: dealerB.id, sourceName: "Site B", sourceUrl: "https://b.example.com" } as any);
    });

    test("getScrapeSources returns ONLY the requesting dealership's sources", async () => {
      const a = await storage.getScrapeSources(dealerA.id);
      const ids = a.map((s: any) => s.id);
      expect(ids).toContain(sourceA.id);
      expect(ids).not.toContain(sourceB.id);
    });

    test("updateScrapeSource cannot modify another dealership's source", async () => {
      const res = await storage.updateScrapeSource(sourceB.id, dealerA.id, { sourceName: "Hacked" } as any);
      expect(res).toBeUndefined();
      const stillB = byId(await storage.getScrapeSources(dealerB.id), sourceB.id);
      expect(stillB?.sourceName).toBe("Site B");
    });

    test("deleteScrapeSource cannot delete another dealership's source", async () => {
      const ok = await storage.deleteScrapeSource(sourceB.id, dealerA.id);
      expect(ok).toBe(false);
      expect(byId(await storage.getScrapeSources(dealerB.id), sourceB.id)).toBeTruthy();
    });

    test("create -> list -> update -> delete lifecycle within one tenant", async () => {
      const s = await storage.createScrapeSource({ dealershipId: dealerA.id, sourceName: "LC Source", sourceUrl: "https://lc.example.com" } as any);
      expect(byId(await storage.getScrapeSources(dealerA.id), s.id)).toBeTruthy();
      const updated = await storage.updateScrapeSource(s.id, dealerA.id, { sourceName: "LC Source 2" } as any);
      expect(updated?.sourceName).toBe("LC Source 2");
      expect(await storage.deleteScrapeSource(s.id, dealerA.id)).toBe(true);
      expect(byId(await storage.getScrapeSources(dealerA.id), s.id)).toBeUndefined();
    });
  });
});
