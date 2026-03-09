import { decideSendFbMarketplaceReply } from "../fb-replies/decide-send";

function makeMockStorage(overrides?: Partial<any>) {
  const settings = overrides?.settings ?? {
    autoSendEnabled: true,
    globalKillSwitch: false,
    dryRun: true,
    businessHours: { default: { open: "00:00", close: "23:59" } },
    thresholds: {},
    rateLimits: {},
    typingSim: {},
  };

  const dealership = overrides?.dealership ?? { id: 1, timezone: "America/Vancouver" };

  const thread = overrides?.thread ?? {
    id: 10,
    isPaused: false,
    autoSendEnabled: true,
    doNotContact: false,
    escalated: false,
    leadNameConfidence: 0.9,
    vehicleMappingConfidence: 0.95,
    lastInboundAt: new Date(),
    lastOutboundAt: null,
  };

  const counts = overrides?.counts ?? { autoTurns: 0, autoMin: 0, autoHour: 0, autoDay: 0, totalDay: 0 };

  const storage: any = {
    getFbReplySettings: async () => settings,
    getDealership: async () => dealership,
    getFbInboxThreadByFbThreadId: async () => thread,
    upsertFbInboxThread: async () => thread,
    countFbInboxMessages: async (_dealershipId: number, opts: any) => {
      // Very small router for unit tests
      if (opts.threadId && opts.direction === "OUTBOUND" && opts.senderRole === "SYSTEM") return counts.autoTurns;
      if (!opts.threadId && opts.direction === "OUTBOUND" && opts.senderRole === "SYSTEM") {
        // decide based on since window length (minute/hour/day). This is intentionally crude for unit tests.
        const ms = Date.now() - new Date(opts.since).getTime();
        if (ms <= 70_000) return counts.autoMin;
        if (ms <= 3_700_000) return counts.autoHour;
        return counts.autoDay;
      }
      if (!opts.threadId && opts.direction === "OUTBOUND" && !opts.senderRole) return counts.totalDay;
      return 0;
    },
  };

  return storage;
}

describe("decideSendFbMarketplaceReply (unit)", () => {
  test("allows when envelope satisfied", async () => {
    const storage = makeMockStorage();

    const out = await decideSendFbMarketplaceReply(storage, {
      dealershipId: 1,
      fbThreadId: "t_1",
      participantName: "Alex Buyer",
      leadNameConfidence: 0.92,
      listingTitle: "2019 Honda Civic",
      vehicleDisplayName: "2019 Honda Civic",
      vehicleMappingConfidence: 0.95,
      candidateReply: "Hey Alex — yes, the 2019 Honda Civic is still available.",
      intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
      localSignals: {},
    });

    expect(out.allow).toBe(true);
    expect(out.decision).toBe("ALLOW");
    expect(out.reasonCodes).toHaveLength(0);
  });

  test("denies on DNC", async () => {
    const storage = makeMockStorage({
      thread: {
        id: 10,
        doNotContact: true,
        isPaused: false,
        autoSendEnabled: true,
        escalated: false,
        leadNameConfidence: 1,
        vehicleMappingConfidence: 1,
      },
    });

    const out = await decideSendFbMarketplaceReply(storage, {
      dealershipId: 1,
      fbThreadId: "t_1",
      participantName: "Alex Buyer",
      listingTitle: "2019 Honda Civic",
      vehicleDisplayName: "2019 Honda Civic",
      candidateReply: "Hey Alex — understood.",
      intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
    });

    expect(out.allow).toBe(false);
    expect(out.reasonCodes).toContain("dnc");
    expect(out.dnc).toBe(true);
  });

  test("denies on rate limit", async () => {
    const storage = makeMockStorage({ counts: { autoTurns: 0, autoMin: 5, autoHour: 0, autoDay: 0, totalDay: 0 } });

    const out = await decideSendFbMarketplaceReply(storage, {
      dealershipId: 1,
      fbThreadId: "t_1",
      participantName: "Alex Buyer",
      leadNameConfidence: 0.92,
      listingTitle: "2019 Honda Civic",
      vehicleDisplayName: "2019 Honda Civic",
      vehicleMappingConfidence: 0.95,
      candidateReply: "Hey Alex — yes, the 2019 Honda Civic is still available.",
      intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
    });

    expect(out.allow).toBe(false);
    expect(out.reasonCodes.some((r) => r.startsWith("rate_limit:"))).toBe(true);
  });
});
