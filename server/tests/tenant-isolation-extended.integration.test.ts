/**
 * Tenant isolation — STORAGE-LAYER integration proof, EXTENDED (real Postgres).
 *
 * Extends tenant-isolation.integration.test.ts (vehicles + CRM contacts) to three
 * more entities: chat conversations, messenger messages, and appointments. Proves
 * Dealer A can never read, list, or update Dealer B's rows at the storage layer.
 *
 * Mirrors the sibling file exactly: same DATABASE_URL gate, uniq() tags, two
 * dealerships in beforeAll, FK-cascade cleanup in afterAll. Does NOT import or
 * close `pool` (shared across files).
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run
 * test:integration`). Skipped in the default unit run.
 */
import { storage } from "../storage";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

describeIf("Tenant isolation EXTENDED (storage layer, real Postgres)", () => {
  let dealerA: any;
  let dealerB: any;

  beforeAll(async () => {
    const tag = uniq();
    dealerA = await storage.createDealership({ name: `Dealer A ${tag}`, slug: `dealer-a-${tag}` } as any);
    dealerB = await storage.createDealership({ name: `Dealer B ${tag}`, slug: `dealer-b-${tag}` } as any);
  });

  afterAll(async () => {
    // FK cascade on dealership delete cleans up all child rows for both tenants.
    if (dealerA?.id) await storage.deleteDealership(dealerA.id);
    if (dealerB?.id) await storage.deleteDealership(dealerB.id);
  });

  test("two distinct dealerships were created", () => {
    expect(dealerA.id).toBeGreaterThan(0);
    expect(dealerB.id).toBeGreaterThan(0);
    expect(dealerA.id).not.toBe(dealerB.id);
  });

  describe("chat conversations", () => {
    let convA: any;
    let convB: any;

    beforeAll(async () => {
      const tag = uniq();
      convA = await storage.saveChatConversation({
        dealershipId: dealerA.id,
        category: "general",
        messages: "[]",
        sessionId: `sess-a-${tag}`,
      } as any);
      convB = await storage.saveChatConversation({
        dealershipId: dealerB.id,
        category: "general",
        messages: "[]",
        sessionId: `sess-b-${tag}`,
      } as any);
    });

    test("getAllConversations returns ONLY the requesting dealership's conversations", async () => {
      const a = await storage.getAllConversations(dealerA.id);
      const aIds = a.conversations.map((c: any) => c.id);
      expect(aIds).toContain(convA.id);
      expect(aIds).not.toContain(convB.id);

      const b = await storage.getAllConversations(dealerB.id);
      const bIds = b.conversations.map((c: any) => c.id);
      expect(bIds).toContain(convB.id);
      expect(bIds).not.toContain(convA.id);
    });

    test("getConversationById cannot read another dealership's conversation", async () => {
      expect(await storage.getConversationById(convB.id, dealerA.id)).toBeUndefined();
      expect(await storage.getConversationById(convA.id, dealerA.id)).toBeTruthy();
    });

    test("updateConversationHandoff cannot modify another dealership's conversation", async () => {
      const res = await storage.updateConversationHandoff(convB.id, dealerA.id, { handoffName: "Hacked" });
      expect(res).toBeUndefined();
      const stillB = await storage.getConversationById(convB.id, dealerB.id);
      expect(stillB?.handoffName ?? null).toBeNull();
    });

    // NOTE: no tenant-scoped delete method exists for chat conversations; rows are
    // cleaned up via the dealership FK cascade. Get/list/update prove isolation.
  });

  describe("messenger messages", () => {
    // messenger_messages requires a parent messenger_conversation, which requires a
    // facebook_account, which requires a user. Build the full per-tenant chain.
    let convA: any;
    let convB: any;
    let msgA: any;
    let msgB: any;

    beforeAll(async () => {
      const tag = uniq();

      const userA = await storage.createUser({
        dealershipId: dealerA.id,
        email: `ua-${tag}@example.com`,
        passwordHash: "x",
        name: "User A",
        role: "salesperson",
      } as any);
      const userB = await storage.createUser({
        dealershipId: dealerB.id,
        email: `ub-${tag}@example.com`,
        passwordHash: "x",
        name: "User B",
        role: "salesperson",
      } as any);

      const fbA = await storage.createFacebookAccount({
        dealershipId: dealerA.id,
        userId: userA.id,
        accountName: "FB A",
        accessToken: "token-a",
      } as any);
      const fbB = await storage.createFacebookAccount({
        dealershipId: dealerB.id,
        userId: userB.id,
        accountName: "FB B",
        accessToken: "token-b",
      } as any);

      convA = await storage.createMessengerConversation({
        dealershipId: dealerA.id,
        facebookAccountId: fbA.id,
        pageId: `page-a-${tag}`,
        pageName: "Page A",
        conversationId: `conv-a-${tag}`,
        participantName: "Cust A",
        participantId: `part-a-${tag}`,
      } as any);
      convB = await storage.createMessengerConversation({
        dealershipId: dealerB.id,
        facebookAccountId: fbB.id,
        pageId: `page-b-${tag}`,
        pageName: "Page B",
        conversationId: `conv-b-${tag}`,
        participantName: "Cust B",
        participantId: `part-b-${tag}`,
      } as any);

      msgA = await storage.createMessengerMessage({
        dealershipId: dealerA.id,
        conversationId: convA.id,
        facebookMessageId: `fbm-a-${tag}`,
        senderId: `part-a-${tag}`,
        senderName: "Cust A",
        isFromCustomer: true,
        content: "Hello from A",
        sentAt: new Date(),
        ghlMessageId: `ghl-a-${tag}`,
      } as any);
      msgB = await storage.createMessengerMessage({
        dealershipId: dealerB.id,
        conversationId: convB.id,
        facebookMessageId: `fbm-b-${tag}`,
        senderId: `part-b-${tag}`,
        senderName: "Cust B",
        isFromCustomer: true,
        content: "Hello from B",
        sentAt: new Date(),
        ghlMessageId: `ghl-b-${tag}`,
      } as any);
    });

    test("getMessengerMessages returns ONLY the requesting dealership's messages", async () => {
      const a = await storage.getMessengerMessages(dealerA.id, convA.id);
      const aIds = a.map((m: any) => m.id);
      expect(aIds).toContain(msgA.id);
      expect(aIds).not.toContain(msgB.id);

      // Even when asked for Dealer B's conversation id under Dealer A's tenant, the
      // dealershipId filter prevents leakage.
      const crossAttempt = await storage.getMessengerMessages(dealerA.id, convB.id);
      expect(crossAttempt.map((m: any) => m.id)).not.toContain(msgB.id);
    });

    test("getMessengerMessageByGhlId is tenant-scoped", async () => {
      expect(await storage.getMessengerMessageByGhlId(dealerA.id, msgB.ghlMessageId)).toBeUndefined();
      expect(await storage.getMessengerMessageByGhlId(dealerB.id, msgB.ghlMessageId)).toBeTruthy();
    });

    test("updateMessengerMessage cannot modify another dealership's message", async () => {
      const res = await storage.updateMessengerMessage(msgB.id, dealerA.id, { content: "Hacked" } as any);
      expect(res).toBeUndefined();
      const stillB = await storage.getMessengerMessageByGhlId(dealerB.id, msgB.ghlMessageId);
      expect(stillB?.content).toBe("Hello from B");
    });

    // NOTE: no tenant-scoped delete method exists for messenger messages; rows are
    // cleaned up via the dealership FK cascade. Get/list/update prove isolation.
  });

  // ====== APPOINTMENTS — SKIPPED ======
  // The `appointments` table (shared/schema.ts) has NO tenant-scoped methods on the
  // storage layer: storage.ts never references the table. All appointment CRUD is
  // performed directly against `db` inside server/routes.ts and
  // server/services/calendar-sync.ts, so there is no clean storage method
  // (e.g. getAppointmentById(id, dealershipId)) to assert isolation against here.
  // Per task instructions, we skip rather than fabricate a method or reach around
  // the storage abstraction. The other appointment-adjacent tables exposed via
  // storage (appointment_reminders, pbs_appointment_cache, ghl_appointment_sync)
  // are out of scope for this proof.
  describe.skip("appointments (no tenant-scoped storage method — see comment)", () => {
    test("skipped", () => {});
  });
});
