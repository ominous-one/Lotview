/**
 * Lead-ops cluster — STORAGE-LAYER tenant-isolation + CRUD-lifecycle proof
 * (real Postgres). Certifies the DATA layer of GHL sync and AI lead-response —
 * GHL accounts, follow-up sequences, and re-engagement campaigns. Live execution
 * (real GHL/AI calls) needs credentials; this proves the tenant-scoped data
 * management those features depend on.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import { storage } from "../storage";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const byId = (rows: any[], id: number) => rows.find((r) => r.id === id);

describeIf("Lead-ops cluster (storage layer, real Postgres)", () => {
  let dealerA: any;
  let dealerB: any;

  beforeAll(async () => {
    const tag = uniq();
    dealerA = await storage.createDealership({ name: `Lead A ${tag}`, slug: `lead-a-${tag}` } as any);
    dealerB = await storage.createDealership({ name: `Lead B ${tag}`, slug: `lead-b-${tag}` } as any);
  });

  afterAll(async () => {
    if (dealerA?.id) await storage.deleteDealership(dealerA.id);
    if (dealerB?.id) await storage.deleteDealership(dealerB.id);
  });

  test("two distinct dealerships were created", () => {
    expect(dealerA.id).not.toBe(dealerB.id);
  });

  describe("GHL accounts (CRM sync data)", () => {
    const ghl = (dealershipId: number, loc: string) => ({
      dealershipId,
      locationId: loc,
      accessToken: "test-access",
      refreshToken: "test-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
    } as any);
    let acctA: any;
    let acctB: any;

    beforeAll(async () => {
      const t = uniq();
      acctA = await storage.createGhlAccount(ghl(dealerA.id, `locA-${t}`));
      acctB = await storage.createGhlAccount(ghl(dealerB.id, `locB-${t}`));
    });

    test("getGhlAccountById cannot read another dealership's account", async () => {
      expect(await storage.getGhlAccountById(acctB.id, dealerA.id)).toBeUndefined();
      expect(await storage.getGhlAccountById(acctA.id, dealerA.id)).toBeTruthy();
    });

    test("updateGhlAccount cannot modify another dealership's account", async () => {
      const res = await storage.updateGhlAccount(acctB.id, dealerA.id, { locationId: "hacked" } as any);
      expect(res).toBeUndefined();
      expect((await storage.getGhlAccountById(acctB.id, dealerB.id))?.locationId).toBe(acctB.locationId);
    });

    test("deleteGhlAccount cannot delete another dealership's account", async () => {
      expect(await storage.deleteGhlAccount(acctB.id, dealerA.id)).toBe(false);
      expect(await storage.getGhlAccountById(acctB.id, dealerB.id)).toBeTruthy();
    });
  });

  describe("follow-up sequences (AI lead-response data)", () => {
    const seq = (dealershipId: number) => ({ dealershipId, name: "Cold Revival", triggerType: "manual", steps: "[]" } as any);
    let seqA: any;
    let seqB: any;

    beforeAll(async () => {
      seqA = await storage.createFollowUpSequence(seq(dealerA.id));
      seqB = await storage.createFollowUpSequence(seq(dealerB.id));
    });

    test("getFollowUpSequences returns ONLY the requesting dealership's sequences", async () => {
      const ids = (await storage.getFollowUpSequences(dealerA.id)).map((s: any) => s.id);
      expect(ids).toContain(seqA.id);
      expect(ids).not.toContain(seqB.id);
    });

    test("getFollowUpSequenceById / update / delete are tenant-scoped", async () => {
      expect(await storage.getFollowUpSequenceById(seqB.id, dealerA.id)).toBeUndefined();
      expect(await storage.updateFollowUpSequence(seqB.id, dealerA.id, { name: "hacked" } as any)).toBeUndefined();
      expect(await storage.deleteFollowUpSequence(seqB.id, dealerA.id)).toBe(false);
      expect(await storage.getFollowUpSequenceById(seqB.id, dealerB.id)).toBeTruthy();
    });

    test("create -> read -> update -> delete lifecycle within one tenant", async () => {
      const s = await storage.createFollowUpSequence(seq(dealerA.id));
      expect(await storage.getFollowUpSequenceById(s.id, dealerA.id)).toBeTruthy();
      const upd = await storage.updateFollowUpSequence(s.id, dealerA.id, { name: "Renamed" } as any);
      expect(upd?.name).toBe("Renamed");
      expect(await storage.deleteFollowUpSequence(s.id, dealerA.id)).toBe(true);
      expect(await storage.getFollowUpSequenceById(s.id, dealerA.id)).toBeUndefined();
    });
  });

  describe("re-engagement campaigns (outreach data)", () => {
    const camp = (dealershipId: number) => ({ dealershipId, name: "Win-Back" } as any);
    let campA: any;
    let campB: any;

    beforeAll(async () => {
      campA = await storage.createReengagementCampaign(camp(dealerA.id));
      campB = await storage.createReengagementCampaign(camp(dealerB.id));
    });

    test("getReengagementCampaigns returns ONLY the requesting dealership's campaigns", async () => {
      const ids = (await storage.getReengagementCampaigns(dealerA.id)).map((c: any) => c.id);
      expect(ids).toContain(campA.id);
      expect(ids).not.toContain(campB.id);
    });

    test("getById / update / delete are tenant-scoped", async () => {
      expect(await storage.getReengagementCampaignById(campB.id, dealerA.id)).toBeUndefined();
      expect(await storage.updateReengagementCampaign(campB.id, dealerA.id, { name: "hacked" } as any)).toBeUndefined();
      expect(await storage.deleteReengagementCampaign(campB.id, dealerA.id)).toBe(false);
      expect(await storage.getReengagementCampaignById(campB.id, dealerB.id)).toBeTruthy();
    });
  });
});
