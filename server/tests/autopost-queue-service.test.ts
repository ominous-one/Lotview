import { db } from '../db';
import { autopostPlatformStatuses, autopostQueueItems, vehicles } from '@shared/schema';
import { and, eq, asc, sql } from 'drizzle-orm';
import { seedTestDealership, seedTestUser } from './test-helpers';
import {
  claimNextAutopostItem,
  evaluateAndEnqueueAutopostQueue,
  listAutopostQueue,
  reorderAutopostQueue,
  setPhotoGateOverride,
  computeDefaultQueueSortKey,
} from '../autopost-queue-service';

function buildVehicle(params: { dealershipId: number; vin: string; stock: string; createdAt: Date; images: string[]; odometer: number; year: number }) {
  return {
    dealershipId: params.dealershipId,
    vin: params.vin,
    stockNumber: params.stock,
    make: 'Test',
    model: 'Unit',
    trim: 'Base',
    year: params.year,
    type: 'SUV',
    price: 25000,
    odometer: params.odometer,
    images: params.images,
    badges: [],
    location: 'Vancouver',
    dealership: 'Test Dealer',
    description: 'desc',
    dealerVdpUrl: `https://example.com/vdp/${params.vin}`,
    createdAt: params.createdAt,
    // Keep inserts compatible with partially-migrated dev DBs by omitting newer columns.
    // Autopost queue logic derives gating from images + override.
  } as any;
}

async function insertVehicleReturningId(vehicle: any): Promise<{ id: number }> {
  const inserted = await db.insert(vehicles).values(vehicle).returning({ id: vehicles.id });
  return inserted[0];
}

describe('autopost-queue-service', () => {
  beforeAll(async () => {
    // Make tests resilient when local dev DB is missing newer v1.1 columns/tables.
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS normalized_stock_number text`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_status text NOT NULL DEFAULT 'unknown'`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS autopost_eligible boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS autopost_block_reason text`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS autopost_ready_at timestamp`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deleted_at timestamp`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deleted_by_user_id integer`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deleted_reason text`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'ACTIVE'`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS marketplace_posted_at timestamp`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_enrich_fail_count integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_enrich_last_attempt_at timestamp`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_enrich_last_error text`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_fingerprint text`);
    await db.execute(sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_price_refresh_at timestamp`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS autopost_queue_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        dealership_id integer NOT NULL,
        vehicle_id integer NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        priority_rank integer NOT NULL,
        queued_at timestamp NOT NULL DEFAULT now(),
        dequeued_at timestamp,
        blocked_reason text,
        photo_gate_override boolean NOT NULL DEFAULT false,
        photo_gate_override_by_user_id integer,
        photo_gate_override_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS autopost_queue_items_active_uq ON autopost_queue_items (dealership_id, vehicle_id) WHERE is_active = true`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS autopost_platform_statuses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        dealership_id integer NOT NULL,
        queue_item_id uuid NOT NULL,
        platform text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        attempt_count integer NOT NULL DEFAULT 0,
        last_attempt_at timestamp,
        last_error text,
        posted_url text,
        posted_external_id text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS autopost_platform_statuses_queue_platform_uq ON autopost_platform_statuses (queue_item_id, platform)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS autopost_queue_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        dealership_id integer NOT NULL,
        queue_item_id uuid NOT NULL,
        platform text,
        actor_user_id integer,
        event_type text NOT NULL,
        message text,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
  });
  test('default ordering: backlog first, used first, oldest first', () => {
    const now = new Date();
    const a = { createdAt: new Date(now.getTime() - 1000), marketplacePostedAt: null, year: now.getFullYear(), odometer: 1000 };
    const b = { createdAt: new Date(now.getTime() - 2000), marketplacePostedAt: new Date(), year: now.getFullYear(), odometer: 1000 };
    const c = { createdAt: new Date(now.getTime() - 3000), marketplacePostedAt: null, year: now.getFullYear(), odometer: 10 };

    // backlog bucket should beat non-backlog
    expect(computeDefaultQueueSortKey(a as any)[0]).toBe(0);
    expect(computeDefaultQueueSortKey(b as any)[0]).toBe(1);

    // used bucket should beat new bucket
    const usedBucket = computeDefaultQueueSortKey(a as any)[1];
    const newBucket = computeDefaultQueueSortKey(c as any)[1];
    expect(usedBucket).toBeLessThan(newBucket);
  });

  test('claim-next is idempotent/exclusive and respects photo gate override', async () => {
    const slug = `apq-${Date.now()}`;
    const dealer = await seedTestDealership('Autopost Queue Dealer', slug);
    const mgr = await seedTestUser(dealer.id, `${slug}@test.com`, 'master', 'Test Master');

    // Vehicle with <10 photos should be blocked initially.
    const v = await insertVehicleReturningId(
      buildVehicle({
        dealershipId: dealer.id,
        vin: `VIN-${Date.now()}`,
        stock: `STK-${Date.now()}`,
        createdAt: new Date(Date.now() - 86400000),
        images: ['https://img/1.jpg'],
        odometer: 12000,
        year: new Date().getFullYear(),
      })
    );

    await evaluateAndEnqueueAutopostQueue({ dealershipId: dealer.id, actorUserId: mgr.id });

    const claim1 = await claimNextAutopostItem({ dealershipId: dealer.id, platform: 'facebook_marketplace', actorUserId: mgr.id });
    expect(claim1).toBeNull();

    // Enable override, should allow claim.
    const q = await db.query.autopostQueueItems.findFirst({
      where: and(eq(autopostQueueItems.dealershipId, dealer.id), eq(autopostQueueItems.vehicleId, v.id), eq(autopostQueueItems.isActive, true)),
    });
    expect(q).toBeTruthy();

    await setPhotoGateOverride({ dealershipId: dealer.id, queueItemId: q!.id, enabled: true, actorUserId: mgr.id, reason: 'test' });

    const claim2 = await claimNextAutopostItem({ dealershipId: dealer.id, platform: 'facebook_marketplace', actorUserId: mgr.id });
    expect(claim2?.queueItemId).toBe(q!.id);

    // Second claim should return null (already claimed).
    const claim3 = await claimNextAutopostItem({ dealershipId: dealer.id, platform: 'facebook_marketplace', actorUserId: mgr.id });
    expect(claim3).toBeNull();

    const statusRow = await db.query.autopostPlatformStatuses.findFirst({
      where: and(eq(autopostPlatformStatuses.queueItemId, q!.id), eq(autopostPlatformStatuses.platform, 'facebook_marketplace')),
    });
    expect(statusRow?.status).toBe('claimed');
    expect((statusRow?.attemptCount || 0) >= 1).toBe(true);
  }, 30000);

  test('reorder persists priority ranks and list reflects order', async () => {
    const slug = `apq-reorder-${Date.now()}`;
    const dealer = await seedTestDealership('Autopost Queue Dealer 2', slug);
    const mgr = await seedTestUser(dealer.id, `${slug}@test.com`, 'master', 'Test Master');

    const now = Date.now();
    const v1 = await insertVehicleReturningId(buildVehicle({ dealershipId: dealer.id, vin: `VIN1-${now}`, stock: `S1-${now}`, createdAt: new Date(now - 3000), images: Array.from({ length: 12 }, (_, i) => `https://img/${i}.jpg`), odometer: 10000, year: new Date().getFullYear() }));
    const v2 = await insertVehicleReturningId(buildVehicle({ dealershipId: dealer.id, vin: `VIN2-${now}`, stock: `S2-${now}`, createdAt: new Date(now - 2000), images: Array.from({ length: 12 }, (_, i) => `https://img2/${i}.jpg`), odometer: 10000, year: new Date().getFullYear() }));
    const v3 = await insertVehicleReturningId(buildVehicle({ dealershipId: dealer.id, vin: `VIN3-${now}`, stock: `S3-${now}`, createdAt: new Date(now - 1000), images: Array.from({ length: 12 }, (_, i) => `https://img3/${i}.jpg`), odometer: 10000, year: new Date().getFullYear() }));

    await evaluateAndEnqueueAutopostQueue({ dealershipId: dealer.id, actorUserId: mgr.id });

    const before = await listAutopostQueue({ dealershipId: dealer.id, platform: 'all' });
    expect(before.length).toBeGreaterThanOrEqual(3);

    const ids = before.slice(0, 3).map((x: any) => x.queueItemId);
    const reordered = [ids[2], ids[0], ids[1]];

    await reorderAutopostQueue({ dealershipId: dealer.id, orderedQueueItemIds: reordered, actorUserId: mgr.id });

    const after = await listAutopostQueue({ dealershipId: dealer.id, platform: 'all' });
    const afterIds = after.slice(0, 3).map((x: any) => x.queueItemId);
    expect(afterIds).toEqual(reordered);

    const ranks = await db
      .select({ id: autopostQueueItems.id, rank: autopostQueueItems.priorityRank })
      .from(autopostQueueItems)
      .where(eq(autopostQueueItems.dealershipId, dealer.id))
      .orderBy(asc(autopostQueueItems.priorityRank));

    // contiguous ranks from 1..N for the active set
    const top = ranks.slice(0, 3).map((r) => r.rank);
    expect(top).toEqual([1, 2, 3]);

    // sanity: vehicles exist
    const vv = await db.query.vehicles.findMany({ where: eq(vehicles.dealershipId, dealer.id) });
    expect(vv.some((x) => x.id === v1.id && x.id !== v2.id && x.id !== v3.id)).toBe(true);
  }, 30000);
});
