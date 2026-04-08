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
    getVehicleById: async () => overrides?.vehicle ?? null,
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

  test("denies history answer when no Carfax grounding exists", async () => {
    const storage = makeMockStorage({
      vehicle: {
        id: 22,
        year: 2019,
        make: 'Honda',
        model: 'Civic',
        trim: 'LX',
        carfaxUrl: null,
        carfaxBadges: [],
      },
    });

    const out = await decideSendFbMarketplaceReply(storage, {
      dealershipId: 1,
      fbThreadId: "t_1",
      participantName: "Alex Buyer",
      leadNameConfidence: 0.92,
      vehicleId: 22,
      listingTitle: "2019 Honda Civic",
      vehicleDisplayName: "2019 Honda Civic",
      vehicleMappingConfidence: 0.95,
      recentMessages: [{ direction: 'INBOUND', senderRole: 'BUYER', text: 'Can you send me the Carfax?', sentAt: null }],
      candidateReply: "Hey Alex — absolutely, I can send over the Carfax for the 2019 Honda Civic.",
      intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
    });

    expect(out.allow).toBe(false);
    expect(out.reasonCodes).toContain('candidate:history_claim_not_grounded');
  });

  test("denies reply that names the wrong vehicle", async () => {
    const storage = makeMockStorage({
      vehicle: {
        id: 23,
        year: 2019,
        make: 'Honda',
        model: 'Civic',
        trim: 'LX',
        vin: '1HGCM82633A004352',
        stockNumber: 'CIV-23',
        normalizedStockNumber: 'CIV23',
        dealerVdpUrl: 'https://dealer.example/civic',
        lastScrapedAt: new Date(),
        deletedAt: null,
        lifecycleStatus: 'ACTIVE',
        photoStatus: 'complete',
        carfaxUrl: 'https://carfax.example/report',
        carfaxBadges: ['One Owner'],
      },
    });

    const out = await decideSendFbMarketplaceReply(storage, {
      dealershipId: 1,
      fbThreadId: "t_1",
      participantName: "Alex Buyer",
      leadNameConfidence: 0.92,
      vehicleId: 23,
      listingTitle: "2019 Honda Civic",
      vehicleDisplayName: "2019 Honda Civic",
      vehicleMappingConfidence: 0.95,
      candidateReply: "Hey Alex — yes, the 2020 Toyota Corolla is still available.",
      intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
    });

    expect(out.allow).toBe(false);
    expect(out.reasonCodes).toContain('candidate:vehicle_identity_not_grounded');
  });

  test("denies availability auto-send for stale sold inventory", async () => {
    const storage = makeMockStorage({
      vehicle: {
        id: 24,
        year: 2019,
        make: 'Honda',
        model: 'Civic',
        trim: 'LX',
        vin: 'PENDING',
        stockNumber: null,
        normalizedStockNumber: null,
        dealerVdpUrl: null,
        lastScrapedAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        deletedAt: new Date(),
        lifecycleStatus: 'REMOVED_BY_SYNC',
        photoStatus: 'no_vdp',
        carfaxUrl: null,
        carfaxBadges: [],
      },
    });

    const out = await decideSendFbMarketplaceReply(storage, {
      dealershipId: 1,
      fbThreadId: "t_1",
      participantName: "Alex Buyer",
      leadNameConfidence: 0.92,
      vehicleId: 24,
      listingTitle: "2019 Honda Civic",
      vehicleDisplayName: "2019 Honda Civic",
      vehicleMappingConfidence: 0.95,
      candidateReply: "Hey Alex — yes, the 2019 Honda Civic is still available.",
      intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
    });

    expect(out.allow).toBe(false);
    expect(out.reasonCodes).toEqual(expect.arrayContaining([
      'inventory_not_active',
      'inventory_stale',
      'vehicle_identity_unverified',
    ]));
  });

  test("denies auto-send when dealership scrape certification is missing or failed", async () => {
    const storage = makeMockStorage({
      vehicle: {
        id: 25,
        year: 2021,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'XLE',
        vin: '2T3R1RFV0NW123456',
        stockNumber: 'RV-25',
        normalizedStockNumber: 'RV25',
        dealerVdpUrl: 'https://dealer.example/rav4',
        lastScrapedAt: new Date(),
        deletedAt: null,
        lifecycleStatus: 'ACTIVE',
        photoStatus: 'complete',
        carfaxUrl: 'https://carfax.example/report',
        carfaxBadges: ['One Owner'],
      },
    });

    const out = await decideSendFbMarketplaceReply(storage, {
      dealershipId: 1,
      fbThreadId: "t_1",
      dealershipScrapeGate: {
        passed: false,
        score: 82,
        blockers: ['certification_artifact_missing', 'truth_boundary_not_source_reconciled'],
        truthBoundary: 'stored_inventory_diagnostic',
      },
      participantName: "Alex Buyer",
      leadNameConfidence: 0.92,
      vehicleId: 25,
      listingTitle: "2021 Toyota RAV4",
      vehicleDisplayName: "2021 Toyota RAV4",
      vehicleMappingConfidence: 0.95,
      candidateReply: "Hey Alex — yes, the 2021 Toyota RAV4 is still available.",
      intent: { intent: "AVAILABILITY_CHECK", confidence: 0.95 },
    });

    expect(out.allow).toBe(false);
    expect(out.reasonCodes).toEqual(expect.arrayContaining([
      'dealership_scrape_gate_failed',
      'dealership_scrape_gate_score:82',
      'dealership_scrape_gate_truth_boundary:stored_inventory_diagnostic',
      'dealership_scrape_gate_blocker:certification_artifact_missing',
      'dealership_scrape_gate_blocker:truth_boundary_not_source_reconciled',
    ]));
  });
});
