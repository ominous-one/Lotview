import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from './db';
import {
  autopostPlatformStatuses,
  autopostQueueEvents,
  autopostQueueItems,
  vehicles,
  type AutopostEventType,
  type AutopostPlatform,
  type AutopostPlatformStatus,
} from '@shared/schema';
import { uniquePhotoCount } from './vehicle-photo-utils';

const PHOTO_GATE_MIN_UNIQUE = 10;
const MAX_ATTEMPTS_PER_PLATFORM = 3;

export type QueueListPlatformFilter = AutopostPlatform | 'all';

export function classifyInventoryIsUsed(v: { year?: number | null; odometer?: number | null }): boolean {
  // Repo lacks an explicit used/new flag.
  // Heuristic: very low mileage and current-year counts as "new".
  const nowYear = new Date().getFullYear();
  const odo = v.odometer ?? null;
  const year = v.year ?? null;
  const isNew = !!year && year >= nowYear && !!odo && odo <= 200;
  return !isNew;
}

export function computeDefaultQueueSortKey(v: {
  createdAt: Date;
  marketplacePostedAt?: Date | null;
  year?: number | null;
  odometer?: number | null;
}): [number, number, number] {
  // Smaller is higher priority.
  // 1) backlog first (never posted)
  const backlogBucket = v.marketplacePostedAt ? 1 : 0;
  // 2) used first
  const usedBucket = classifyInventoryIsUsed(v) ? 0 : 1;
  // 3) older first
  const ageKey = v.createdAt.getTime();
  return [backlogBucket, usedBucket, ageKey];
}

function platformBlockedReason(params: {
  vehicleImages: string[] | null;
  photoGateOverride: boolean;
  vehicleAutopostEligible: boolean;
  vehicleAutopostBlockReason: string | null;
}): { blocked: boolean; reason: string | null } {
  const uCount = uniquePhotoCount(params.vehicleImages || []);

  // Photo gate override only overrides the photo gate, not other block reasons.
  if (uCount < PHOTO_GATE_MIN_UNIQUE && !params.photoGateOverride) {
    return { blocked: true, reason: '<10 photos' };
  }

  if (!params.vehicleAutopostEligible) {
    // Allow photo override to bypass NEEDS_PHOTOS.
    if (params.vehicleAutopostBlockReason && params.vehicleAutopostBlockReason !== 'NEEDS_PHOTOS') {
      return { blocked: true, reason: params.vehicleAutopostBlockReason };
    }
  }

  return { blocked: false, reason: null };
}

export async function evaluateAndEnqueueAutopostQueue(params: {
  dealershipId: number;
  actorUserId?: number | null;
}): Promise<{ enqueued: number; updated: number; skipped: number }> {
  const actorUserId = params.actorUserId ?? null;

  // Candidate inventory: active, not deleted.
  const inventory = await db
    .select({
      id: vehicles.id,
      createdAt: vehicles.createdAt,
      marketplacePostedAt: vehicles.marketplacePostedAt,
      year: vehicles.year,
      odometer: vehicles.odometer,
      images: vehicles.images,
      autopostEligible: vehicles.autopostEligible,
      autopostBlockReason: vehicles.autopostBlockReason,
      deletedAt: vehicles.deletedAt,
      lifecycleStatus: vehicles.lifecycleStatus,
    })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.dealershipId, params.dealershipId),
        isNull(vehicles.deletedAt),
        eq(vehicles.lifecycleStatus, 'ACTIVE')
      )
    );

  // Sort by spec default ordering.
  const sorted = inventory
    .slice()
    .sort((a, b) => {
      const ka = computeDefaultQueueSortKey(a as any);
      const kb = computeDefaultQueueSortKey(b as any);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
      return ka[2] - kb[2];
    });

  // Existing active queue map.
  const existing = await db
    .select({ id: autopostQueueItems.id, vehicleId: autopostQueueItems.vehicleId })
    .from(autopostQueueItems)
    .where(and(eq(autopostQueueItems.dealershipId, params.dealershipId), eq(autopostQueueItems.isActive, true)));

  const existingByVehicle = new Map<number, string>();
  for (const row of existing) existingByVehicle.set(row.vehicleId, row.id);

  let enqueued = 0;
  let updated = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    // Determine next rank start (append after current if any).
    const maxRankRow = await tx
      .select({ max: sql<number>`COALESCE(MAX(${autopostQueueItems.priorityRank}), 0)` })
      .from(autopostQueueItems)
      .where(and(eq(autopostQueueItems.dealershipId, params.dealershipId), eq(autopostQueueItems.isActive, true)));
    let nextRank = Number(maxRankRow[0]?.max || 0) + 1;

    for (const v of sorted) {
      const queueId = existingByVehicle.get(v.id);
      if (!queueId) {
        // Create queue item.
        const inserted = await tx
          .insert(autopostQueueItems)
          .values({
            dealershipId: params.dealershipId,
            vehicleId: v.id,
            isActive: true,
            priorityRank: nextRank++,
            blockedReason: null,
          })
          .returning({ id: autopostQueueItems.id });

        const qid = inserted[0].id;

        // Create per-platform statuses.
        await tx.insert(autopostPlatformStatuses).values([
          {
            dealershipId: params.dealershipId,
            queueItemId: qid,
            platform: 'facebook_marketplace',
            status: 'queued',
          },
          {
            dealershipId: params.dealershipId,
            queueItemId: qid,
            platform: 'craigslist',
            status: 'queued',
          },
        ]);

        await tx.insert(autopostQueueEvents).values({
          dealershipId: params.dealershipId,
          queueItemId: qid,
          platform: null,
          actorUserId,
          eventType: 'ENQUEUED',
          message: 'Vehicle added to autopost queue',
          metadata: { vehicleId: v.id },
        });

        enqueued++;
      } else {
        // Ensure platform statuses exist (idempotent).
        const statuses = await tx
          .select({ id: autopostPlatformStatuses.id, platform: autopostPlatformStatuses.platform })
          .from(autopostPlatformStatuses)
          .where(eq(autopostPlatformStatuses.queueItemId, queueId));
        const have = new Set(statuses.map((s) => s.platform));
        const missing: any[] = [];
        for (const p of ['facebook_marketplace', 'craigslist'] as AutopostPlatform[]) {
          if (!have.has(p)) {
            missing.push({ dealershipId: params.dealershipId, queueItemId: queueId, platform: p, status: 'queued' });
          }
        }
        if (missing.length) {
          await tx.insert(autopostPlatformStatuses).values(missing);
          updated++;
        } else {
          skipped++;
        }
      }
    }
  });

  // After ensuring items exist, reconcile block/queued statuses based on photo gate and upstream signals.
  await reconcileAutopostPlatformBlocks({ dealershipId: params.dealershipId, actorUserId });

  return { enqueued, updated, skipped };
}

export async function reconcileAutopostPlatformBlocks(params: {
  dealershipId: number;
  actorUserId?: number | null;
}): Promise<{ updated: number }> {
  const actorUserId = params.actorUserId ?? null;

  const rows = await db
    .select({
      queueItemId: autopostQueueItems.id,
      vehicleId: autopostQueueItems.vehicleId,
      photoGateOverride: autopostQueueItems.photoGateOverride,
      images: vehicles.images,
      autopostEligible: vehicles.autopostEligible,
      autopostBlockReason: vehicles.autopostBlockReason,
      fbId: autopostPlatformStatuses.id,
      fbStatus: autopostPlatformStatuses.status,
      fbPlatform: autopostPlatformStatuses.platform,
    })
    .from(autopostQueueItems)
    .innerJoin(vehicles, eq(vehicles.id, autopostQueueItems.vehicleId))
    .innerJoin(
      autopostPlatformStatuses,
      and(eq(autopostPlatformStatuses.queueItemId, autopostQueueItems.id), eq(autopostPlatformStatuses.platform, 'facebook_marketplace'))
    )
    .where(and(eq(autopostQueueItems.dealershipId, params.dealershipId), eq(autopostQueueItems.isActive, true)));

  // We'll also need craigslist rows; fetch separately.
  const clRows = await db
    .select({
      queueItemId: autopostQueueItems.id,
      photoGateOverride: autopostQueueItems.photoGateOverride,
      images: vehicles.images,
      autopostEligible: vehicles.autopostEligible,
      autopostBlockReason: vehicles.autopostBlockReason,
      statusId: autopostPlatformStatuses.id,
      status: autopostPlatformStatuses.status,
    })
    .from(autopostQueueItems)
    .innerJoin(vehicles, eq(vehicles.id, autopostQueueItems.vehicleId))
    .innerJoin(
      autopostPlatformStatuses,
      and(eq(autopostPlatformStatuses.queueItemId, autopostQueueItems.id), eq(autopostPlatformStatuses.platform, 'craigslist'))
    )
    .where(and(eq(autopostQueueItems.dealershipId, params.dealershipId), eq(autopostQueueItems.isActive, true)));

  const byQueue = new Map<string, { images: string[]; autopostEligible: boolean; autopostBlockReason: string | null; photoGateOverride: boolean }>();
  for (const r of rows) {
    byQueue.set(r.queueItemId, {
      images: (r.images || []) as any,
      autopostEligible: !!r.autopostEligible,
      autopostBlockReason: (r.autopostBlockReason as any) || null,
      photoGateOverride: !!r.photoGateOverride,
    });
  }

  let updated = 0;

  async function reconcileOne(statusId: string, queueItemId: string, platform: AutopostPlatform, current: AutopostPlatformStatus) {
    const base = byQueue.get(queueItemId);
    if (!base) return;

    // Do not override terminal statuses.
    if (['posted', 'skipped'].includes(current)) return;
    if (current === 'claimed' || current === 'posting') return;

    const gate = platformBlockedReason({
      vehicleImages: base.images,
      photoGateOverride: base.photoGateOverride,
      vehicleAutopostEligible: base.autopostEligible,
      vehicleAutopostBlockReason: base.autopostBlockReason,
    });

    const nextStatus: AutopostPlatformStatus = gate.blocked ? 'blocked' : 'queued';

    if (nextStatus !== current) {
      await db
        .update(autopostPlatformStatuses)
        .set({
          status: nextStatus,
          lastError: gate.blocked ? gate.reason : null,
          updatedAt: new Date(),
        })
        .where(eq(autopostPlatformStatuses.id, statusId));

      const evType: AutopostEventType = gate.blocked ? 'PHOTO_GATE_BLOCKED' : 'ELIGIBILITY_CHANGED';
      await db.insert(autopostQueueEvents).values({
        dealershipId: params.dealershipId,
        queueItemId,
        platform,
        actorUserId,
        eventType: evType,
        message: gate.blocked ? `Blocked: ${gate.reason}` : 'Unblocked/eligible',
        metadata: { from: current, to: nextStatus },
      });

      updated++;
    }
  }

  for (const r of rows) {
    await reconcileOne(r.fbId, r.queueItemId, 'facebook_marketplace', r.fbStatus as any);
  }
  for (const r of clRows) {
    await reconcileOne(r.statusId, r.queueItemId, 'craigslist', r.status as any);
  }

  return { updated };
}

export async function listAutopostQueue(params: {
  dealershipId: number;
  platform?: QueueListPlatformFilter;
}): Promise<any[]> {
  const platform = params.platform || 'all';

  const items = await db
    .select({
      queueItemId: autopostQueueItems.id,
      vehicleId: autopostQueueItems.vehicleId,
      priorityRank: autopostQueueItems.priorityRank,
      isActive: autopostQueueItems.isActive,
      queuedAt: autopostQueueItems.queuedAt,
      blockedReason: autopostQueueItems.blockedReason,
      photoGateOverride: autopostQueueItems.photoGateOverride,
      photoGateOverrideAt: autopostQueueItems.photoGateOverrideAt,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      trim: vehicles.trim,
      price: vehicles.price,
      odometer: vehicles.odometer,
      images: vehicles.images,
      autopostEligible: vehicles.autopostEligible,
      autopostBlockReason: vehicles.autopostBlockReason,
      autopostReadyAt: vehicles.autopostReadyAt,
      marketplacePostedAt: vehicles.marketplacePostedAt,
      fbStatus: sql<string>`(SELECT status FROM autopost_platform_statuses s WHERE s.queue_item_id = ${autopostQueueItems.id} AND s.platform='facebook_marketplace' LIMIT 1)` as any,
      fbAttemptCount: sql<number>`(SELECT attempt_count FROM autopost_platform_statuses s WHERE s.queue_item_id = ${autopostQueueItems.id} AND s.platform='facebook_marketplace' LIMIT 1)` as any,
      fbLastError: sql<string>`(SELECT last_error FROM autopost_platform_statuses s WHERE s.queue_item_id = ${autopostQueueItems.id} AND s.platform='facebook_marketplace' LIMIT 1)` as any,
      clStatus: sql<string>`(SELECT status FROM autopost_platform_statuses s WHERE s.queue_item_id = ${autopostQueueItems.id} AND s.platform='craigslist' LIMIT 1)` as any,
      clAttemptCount: sql<number>`(SELECT attempt_count FROM autopost_platform_statuses s WHERE s.queue_item_id = ${autopostQueueItems.id} AND s.platform='craigslist' LIMIT 1)` as any,
      clLastError: sql<string>`(SELECT last_error FROM autopost_platform_statuses s WHERE s.queue_item_id = ${autopostQueueItems.id} AND s.platform='craigslist' LIMIT 1)` as any,
    })
    .from(autopostQueueItems)
    .innerJoin(vehicles, eq(vehicles.id, autopostQueueItems.vehicleId))
    .where(and(eq(autopostQueueItems.dealershipId, params.dealershipId), eq(autopostQueueItems.isActive, true)))
    .orderBy(asc(autopostQueueItems.priorityRank));

  const filtered = items.filter((i) => {
    if (platform === 'all') return true;
    return platform === 'facebook_marketplace' ? i.fbStatus !== 'not_queued' : i.clStatus !== 'not_queued';
  });

  return filtered.map((i) => ({
    ...i,
    photoCount: (i.images || []).length,
    uniquePhotoCount: uniquePhotoCount(i.images || []),
  }));
}

export async function reorderAutopostQueue(params: {
  dealershipId: number;
  orderedQueueItemIds: string[];
  actorUserId?: number | null;
}): Promise<void> {
  const actorUserId = params.actorUserId ?? null;

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: autopostQueueItems.id, priorityRank: autopostQueueItems.priorityRank })
      .from(autopostQueueItems)
      .where(and(eq(autopostQueueItems.dealershipId, params.dealershipId), eq(autopostQueueItems.isActive, true)));

    const existingIds = new Set(existing.map((r) => r.id));
    for (const id of params.orderedQueueItemIds) {
      if (!existingIds.has(id)) throw new Error(`Queue item ${id} does not belong to dealership or is not active`);
    }

    // Renumber deterministically.
    for (let idx = 0; idx < params.orderedQueueItemIds.length; idx++) {
      const id = params.orderedQueueItemIds[idx];
      await tx
        .update(autopostQueueItems)
        .set({ priorityRank: idx + 1, updatedAt: new Date() })
        .where(eq(autopostQueueItems.id, id));
    }

    // Append any not included (defensive)
    const missing = existing
      .filter((r) => !params.orderedQueueItemIds.includes(r.id))
      .sort((a, b) => a.priorityRank - b.priorityRank);
    let next = params.orderedQueueItemIds.length + 1;
    for (const r of missing) {
      await tx
        .update(autopostQueueItems)
        .set({ priorityRank: next++, updatedAt: new Date() })
        .where(eq(autopostQueueItems.id, r.id));
    }

    // Audit event (single event with metadata)
    await tx.insert(autopostQueueEvents).values(
      params.orderedQueueItemIds.map((qid, i) => ({
        dealershipId: params.dealershipId,
        queueItemId: qid,
        platform: null,
        actorUserId,
        eventType: 'PRIORITY_REORDERED' as AutopostEventType,
        message: 'Priority reordered via manager UI',
        metadata: { newRank: i + 1 },
      }))
    );
  });
}

export async function setPhotoGateOverride(params: {
  dealershipId: number;
  queueItemId: string;
  enabled: boolean;
  actorUserId: number;
  reason?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    const updated = await tx
      .update(autopostQueueItems)
      .set({
        photoGateOverride: params.enabled,
        photoGateOverrideByUserId: params.enabled ? params.actorUserId : null,
        photoGateOverrideAt: params.enabled ? now : null,
        updatedAt: now,
      })
      .where(and(eq(autopostQueueItems.id, params.queueItemId), eq(autopostQueueItems.dealershipId, params.dealershipId)))
      .returning({ id: autopostQueueItems.id });

    if (!updated.length) throw new Error('Queue item not found');

    await tx.insert(autopostQueueEvents).values({
      dealershipId: params.dealershipId,
      queueItemId: params.queueItemId,
      platform: null,
      actorUserId: params.actorUserId,
      eventType: 'PHOTO_GATE_OVERRIDE_SET',
      message: params.enabled ? `Override enabled${params.reason ? `: ${params.reason}` : ''}` : 'Override cleared',
      metadata: { enabled: params.enabled },
    });
  });

  await reconcileAutopostPlatformBlocks({ dealershipId: params.dealershipId, actorUserId: params.actorUserId });
}

export async function dequeueAutopostQueueItem(params: {
  dealershipId: number;
  queueItemId: string;
  actorUserId?: number | null;
  reason?: string | null;
}): Promise<void> {
  const actorUserId = params.actorUserId ?? null;
  await db.transaction(async (tx) => {
    const now = new Date();
    const updated = await tx
      .update(autopostQueueItems)
      .set({ isActive: false, dequeuedAt: now, updatedAt: now, blockedReason: params.reason || null })
      .where(and(eq(autopostQueueItems.id, params.queueItemId), eq(autopostQueueItems.dealershipId, params.dealershipId)))
      .returning({ id: autopostQueueItems.id });

    if (!updated.length) throw new Error('Queue item not found');

    await tx
      .update(autopostPlatformStatuses)
      .set({ status: 'skipped', lastError: params.reason || 'dequeued', updatedAt: now })
      .where(eq(autopostPlatformStatuses.queueItemId, params.queueItemId));

    await tx.insert(autopostQueueEvents).values({
      dealershipId: params.dealershipId,
      queueItemId: params.queueItemId,
      platform: null,
      actorUserId,
      eventType: 'DEQUEUED',
      message: params.reason || 'Dequeued',
    });
  });
}

export async function claimNextAutopostItem(params: {
  dealershipId: number;
  platform: AutopostPlatform;
  actorUserId?: number | null;
}): Promise<null | {
  queueItemId: string;
  vehicle: any;
  platformStatus: any;
}> {
  const actorUserId = params.actorUserId ?? null;

  return await db.transaction(async (tx) => {
    // Use row-level lock on platform status row.
    const found = await tx.execute(sql`
      SELECT 
        qi.id as queue_item_id,
        qi.vehicle_id,
        qi.photo_gate_override,
        qi.priority_rank,
        ps.id as platform_status_id,
        ps.status as platform_status,
        ps.attempt_count,
        v.images,
        v.autopost_eligible,
        v.autopost_block_reason,
        v.year, v.make, v.model, v.trim, v.price, v.odometer, v.dealer_vdp_url
      FROM autopost_queue_items qi
      JOIN autopost_platform_statuses ps ON ps.queue_item_id = qi.id AND ps.platform = ${params.platform}
      JOIN vehicles v ON v.id = qi.vehicle_id
      WHERE qi.dealership_id = ${params.dealershipId}
        AND qi.is_active = true
        AND v.deleted_at IS NULL
        AND v.lifecycle_status = 'ACTIVE'
        AND ps.status IN ('queued','failed')
        AND ps.attempt_count < ${MAX_ATTEMPTS_PER_PLATFORM}
      ORDER BY qi.priority_rank ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);

    const row: any = (found as any).rows?.[0];
    if (!row) return null;

    const gate = platformBlockedReason({
      vehicleImages: row.images,
      photoGateOverride: !!row.photo_gate_override,
      vehicleAutopostEligible: !!row.autopost_eligible,
      vehicleAutopostBlockReason: row.autopost_block_reason,
    });

    if (gate.blocked) {
      // Mark blocked and bail.
      await tx.execute(sql`
        UPDATE autopost_platform_statuses
        SET status='blocked', last_error=${gate.reason}, updated_at=now()
        WHERE id=${row.platform_status_id}
      `);
      await tx.insert(autopostQueueEvents).values({
        dealershipId: params.dealershipId,
        queueItemId: row.queue_item_id,
        platform: params.platform,
        actorUserId,
        eventType: 'PHOTO_GATE_BLOCKED',
        message: `Blocked at claim: ${gate.reason}`,
      });
      return null;
    }

    // Claim.
    await tx.execute(sql`
      UPDATE autopost_platform_statuses
      SET status='claimed', attempt_count=attempt_count+1, last_attempt_at=now(), updated_at=now()
      WHERE id=${row.platform_status_id}
    `);

    await tx.insert(autopostQueueEvents).values({
      dealershipId: params.dealershipId,
      queueItemId: row.queue_item_id,
      platform: params.platform,
      actorUserId,
      eventType: 'CLAIMED',
      message: 'Claimed for posting',
      metadata: { attemptCount: Number(row.attempt_count || 0) + 1 },
    });

    return {
      queueItemId: row.queue_item_id,
      vehicle: {
        id: row.vehicle_id,
        year: row.year,
        make: row.make,
        model: row.model,
        trim: row.trim,
        price: row.price,
        odometer: row.odometer,
        images: row.images,
        dealerVdpUrl: row.dealer_vdp_url,
      },
      platformStatus: {
        platform: params.platform,
        status: 'claimed',
      },
    };
  });
}

export async function recordAutopostResult(params: {
  dealershipId: number;
  queueItemId: string;
  platform: AutopostPlatform;
  status: 'posted' | 'failed' | 'skipped';
  postedUrl?: string | null;
  externalId?: string | null;
  error?: string | null;
  actorUserId?: number | null;
}): Promise<void> {
  const actorUserId = params.actorUserId ?? null;

  await db.transaction(async (tx) => {
    const now = new Date();

    const nextStatus: AutopostPlatformStatus = params.status;
    await tx
      .update(autopostPlatformStatuses)
      .set({
        status: nextStatus,
        lastError: params.error || null,
        postedUrl: params.postedUrl || null,
        postedExternalId: params.externalId || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(autopostPlatformStatuses.queueItemId, params.queueItemId),
          eq(autopostPlatformStatuses.platform, params.platform)
        )
      );

    const eventType: AutopostEventType =
      params.status === 'posted' ? 'POSTED_SUCCESS' : params.status === 'failed' ? 'POSTED_FAILED' : 'SKIPPED';

    await tx.insert(autopostQueueEvents).values({
      dealershipId: params.dealershipId,
      queueItemId: params.queueItemId,
      platform: params.platform,
      actorUserId,
      eventType,
      message:
        params.status === 'posted'
          ? 'Posted successfully'
          : params.status === 'failed'
          ? `Posting failed${params.error ? `: ${params.error}` : ''}`
          : 'Skipped',
      metadata: {
        postedUrl: params.postedUrl || null,
        externalId: params.externalId || null,
      },
    });

    // If both platforms are terminal, dequeue.
    const statuses = await tx
      .select({ platform: autopostPlatformStatuses.platform, status: autopostPlatformStatuses.status })
      .from(autopostPlatformStatuses)
      .where(eq(autopostPlatformStatuses.queueItemId, params.queueItemId));

    const terminal = (s: any) => ['posted', 'skipped'].includes(String(s));
    const done = statuses.length >= 2 && statuses.every((s) => terminal(s.status));

    if (done) {
      await tx
        .update(autopostQueueItems)
        .set({ isActive: false, dequeuedAt: now, updatedAt: now })
        .where(eq(autopostQueueItems.id, params.queueItemId));

      await tx.insert(autopostQueueEvents).values({
        dealershipId: params.dealershipId,
        queueItemId: params.queueItemId,
        platform: null,
        actorUserId,
        eventType: 'DEQUEUED',
        message: 'Dequeued (all platforms complete)',
      });
    }
  });
}
