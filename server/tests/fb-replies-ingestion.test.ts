import { runTest, assert, printTestResults, seedTestDealership, seedTestUser, loginAs, authenticatedFetch, BASE_URL } from "./test-helpers";

async function main() {
  const results = [] as any[];

  const dealership = await seedTestDealership("WS4 FB Replies", "ws4-fb-replies");
  const user = await seedTestUser(dealership.id, "ws4_fb_replies@test.com", "manager", "WS4 Manager");
  const auth = await loginAs(user.email, user.password);
  if (!auth) throw new Error("Failed to login test user");

  const fbThreadId = `t_${Date.now()}`;

  results.push(await runTest("Extension: upsert thread (idempotent)", async () => {
    const payload = {
      fbThreadId,
      participantName: "Alex Buyer",
      leadNameConfidence: 0.9,
      listingUrl: "https://facebook.com/marketplace/item/123",
      listingTitle: "2019 Honda Civic",
      unreadCount: 1,
      lastMessageAt: new Date().toISOString(),
    };

    const r1 = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/thread`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(r1.status === 200, `expected 200, got ${r1.status} body=${r1.body}`);

    const r2 = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/thread`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(r2.status === 200, `expected 200, got ${r2.status} body=${r2.body}`);
  }));

  results.push(await runTest("Extension: append message is idempotent", async () => {
    const payload = {
      fbThreadId,
      fbMessageId: `m_${Date.now()}`,
      direction: "INBOUND",
      senderRole: "BUYER",
      sentAt: new Date().toISOString(),
      text: "Is this still available?",
    };

    const r1 = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/message`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(r1.status === 200, `expected 200, got ${r1.status} body=${r1.body}`);
    const data1 = JSON.parse(r1.body);
    assert(data1.wasInserted === true, `expected wasInserted true, got ${r1.body}`);

    const r2 = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/message`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(r2.status === 200, `expected 200, got ${r2.status} body=${r2.body}`);
    const data2 = JSON.parse(r2.body);
    assert(data2.wasInserted === false, `expected wasInserted false, got ${r2.body}`);
  }));

  results.push(await runTest("Extension: append audit event is idempotent", async () => {
    const payload = {
      fbThreadId,
      eventKey: `e_${Date.now()}`,
      kind: "AUTO_SENT",
      details: { reasonCodes: ["auto_send"], dryRun: false },
    };

    const r1 = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/audit`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(r1.status === 200, `expected 200, got ${r1.status} body=${r1.body}`);
    const d1 = JSON.parse(r1.body);
    assert(d1.wasInserted === true, `expected wasInserted true, got ${r1.body}`);

    const r2 = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/audit`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(r2.status === 200, `expected 200, got ${r2.status} body=${r2.body}`);
    const d2 = JSON.parse(r2.body);
    assert(d2.wasInserted === false, `expected wasInserted false, got ${r2.body}`);
  }));

  results.push(await runTest("Web: list threads and messages", async () => {
    const threads = await authenticatedFetch(`${BASE_URL}/api/fb-inbox/threads?limit=10`, auth, { method: "GET" });
    assert(threads.status === 200, `expected 200, got ${threads.status} body=${threads.body}`);
    const tData = JSON.parse(threads.body);
    assert(Array.isArray(tData.threads), `expected threads array, got ${threads.body}`);
    assert(tData.threads.length >= 1, `expected at least 1 thread, got ${threads.body}`);

    const threadId = tData.threads[0].id;
    const msgs = await authenticatedFetch(`${BASE_URL}/api/fb-inbox/threads/${threadId}/messages`, auth, { method: "GET" });
    assert(msgs.status === 200, `expected 200, got ${msgs.status} body=${msgs.body}`);
    const mData = JSON.parse(msgs.body);
    assert(Array.isArray(mData), `expected messages array, got ${msgs.body}`);
    assert(mData.length >= 1, `expected at least 1 message, got ${msgs.body}`);
  }));

  const summary = printTestResults(results);
  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
