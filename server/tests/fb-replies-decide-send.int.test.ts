import { runTest, assert, printTestResults, seedTestDealership, seedTestUser, loginAs, authenticatedFetch, BASE_URL } from "./test-helpers";

async function main() {
  const results: any[] = [];

  const dealership = await seedTestDealership("WS4 FB DecideSend", "ws4-fb-decide-send");
  const user = await seedTestUser(dealership.id, "ws4_fb_decide_send@test.com", "manager", "WS4 Manager");
  const auth = await loginAs(user.email, user.password);
  if (!auth) throw new Error("Failed to login test user");

  // Make the test deterministic regardless of local time.
  // Use the same API surface the extension/UI uses so this stays robust even when
  // the test runner and server are separate processes.
  const settingsUpdate = await authenticatedFetch(`${BASE_URL}/api/fb-inbox/settings`, auth, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dryRun: true,
      businessHours: { default: { open: "00:00", close: "23:59" } },
      thresholds: {
        intentConfidenceMinForAutoSend: 0.5,
        leadNameConfidenceMinForAutoSend: 0.5,
        vehicleMappingConfidenceMinForAutoSend: 0.5,
        minMinutesBetweenAutoSendsPerThread: 0,
        maxAutoTurnsPerThread: 99,
        inboundFreshnessMaxMinutes: 9999,
      },
      rateLimits: {
        maxAutoSendsPerMinute: 9999,
        maxAutoSendsPerHour: 9999,
        maxAutoSendsPerDay: 9999,
        maxTotalSendsPerDay: 9999,
      },
    }),
  });
  assert(settingsUpdate.status === 200, `expected 200 updating settings, got ${settingsUpdate.status} body=${settingsUpdate.body}`);

  const fbThreadId = `t_${Date.now()}`;

  results.push(await runTest("decide-send endpoint: allow when fresh inbound + personalized", async () => {
    // Ingest thread + inbound so server has state.
    const upsertThread = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/thread`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fbThreadId,
        participantName: "Alex Buyer",
        leadNameConfidence: 0.9,
        listingUrl: "https://facebook.com/marketplace/item/123",
        listingTitle: "2019 Honda Civic",
        unreadCount: 1,
        lastMessageAt: new Date().toISOString(),
      }),
    });
    assert(upsertThread.status === 200, `expected 200 upserting thread, got ${upsertThread.status} body=${upsertThread.body}`);

    const threadData = JSON.parse(upsertThread.body);
    const threadId = threadData?.thread?.id;
    assert(typeof threadId === "number", `expected thread.id number from thread upsert, got ${upsertThread.body}`);

    const appendInbound = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/message`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fbThreadId,
        fbMessageId: `m_${Date.now()}`,
        direction: "INBOUND",
        senderRole: "BUYER",
        sentAt: new Date().toISOString(),
        text: "Is this still available?",
      }),
    });
    assert(appendInbound.status === 200, `expected 200 appending inbound message, got ${appendInbound.status} body=${appendInbound.body}`);

    const r = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/decide-send`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fbThreadId,
        participantName: "Alex Buyer",
        leadNameConfidence: 0.9,
        listingTitle: "2019 Honda Civic",
        vehicleDisplayName: "2019 Honda Civic",
        vehicleMappingConfidence: 0.95,
        candidateReply: "Hey Alex — yes, the 2019 Honda Civic is still available.",
        intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
        localSignals: { actionBlockDetected: false },
      }),
    });

    assert(r.status === 200, `expected 200, got ${r.status} body=${r.body}`);
    const data = JSON.parse(r.body);
    assert(data.allow === true, `expected allow true, got ${r.body}`);
    assert(data.decision === "ALLOW", `expected ALLOW, got ${r.body}`);
    assert(data.dryRun === true, `expected dryRun true, got ${r.body}`);

    // Verify the thread exists via the FB Inbox API without relying on pagination.
    const threadResp = await authenticatedFetch(`${BASE_URL}/api/fb-inbox/threads/${threadId}`, auth, { method: "GET" });
    assert(threadResp.status === 200, `expected 200 fetching thread, got ${threadResp.status} body=${threadResp.body}`);
    const fetchedThread = JSON.parse(threadResp.body);
    assert(fetchedThread.fbThreadId === fbThreadId, `expected fbThreadId match, got ${threadResp.body}`);

    const auditResp = await authenticatedFetch(
      `${BASE_URL}/api/fb-inbox/audit?threadId=${threadId}&kind=DECIDE_SEND&limit=10&offset=0`,
      auth,
      { method: "GET" }
    );
    assert(auditResp.status === 200, `expected 200 listing audit events, got ${auditResp.status} body=${auditResp.body}`);
    const auditData = JSON.parse(auditResp.body);
    assert(Array.isArray(auditData.events), `expected events array, got ${auditResp.body}`);
    assert(auditData.events.length >= 1, "expected at least one DECIDE_SEND audit event");

    const ev: any = auditData.events[0];
    assert(ev.kind === "DECIDE_SEND", `expected DECIDE_SEND kind, got ${ev.kind}`);
    assert(!!ev.details?.decision, "expected details.decision");
    assert(ev.details.decision.allow === true, "expected details.decision.allow true");
  }));

  results.push(await runTest("decide-send endpoint: deny after outbound without new inbound", async () => {
    // Simulate that we already auto-sent.
    await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/message`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fbThreadId,
        fbMessageId: `m_sys_${Date.now()}`,
        direction: "OUTBOUND",
        senderRole: "SYSTEM",
        sentAt: new Date().toISOString(),
        text: "Hey Alex — yes, the 2019 Honda Civic is still available.",
        ingestedFrom: "EXTENSION_AUTOSEND",
      }),
    });

    const r = await authenticatedFetch(`${BASE_URL}/api/extension/fb-replies/decide-send`, auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fbThreadId,
        participantName: "Alex Buyer",
        leadNameConfidence: 0.9,
        listingTitle: "2019 Honda Civic",
        vehicleDisplayName: "2019 Honda Civic",
        vehicleMappingConfidence: 0.95,
        candidateReply: "Hey Alex — just checking in about the 2019 Honda Civic.",
        intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
      }),
    });

    assert(r.status === 200, `expected 200, got ${r.status} body=${r.body}`);
    const data = JSON.parse(r.body);
    assert(data.allow === false, `expected allow false, got ${r.body}`);
    assert(Array.isArray(data.reasonCodes), `expected reasonCodes array, got ${r.body}`);
    assert(data.reasonCodes.includes("no_new_inbound_since_last_outbound"), `expected anti-loop deny, got ${r.body}`);
  }));

  const summary = printTestResults(results);
  if (summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
