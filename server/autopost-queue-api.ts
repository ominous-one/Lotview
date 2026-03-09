import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import {
  autopostPlatformStatuses,
  autopostQueueEvents,
  autopostQueueItems,
  vehicles,
  type AutopostPlatform,
} from '@shared/schema';
import { uniquePhotoCount } from './vehicle-photo-utils';

const PLATFORMS: AutopostPlatform[] = ['facebook_marketplace', 'craigslist'];

export type AutopostQueueListRow = {
  queueItem: any;
  vehicle: any;
  platformStatuses: any[];
};

export async function evaluateAndEnqueueAutopost(params: {
  dealershipId: number;
  actorUserId?: number | null;
  minPhotosTarget?: number;
}): Promise<{ enqueued: number; updatedEligibility: number }> {
  const minPhotosTarget = params.minPhotosTarget ?? 10;
  const now = new Date();

  const inv = await db
    .select({
      id: vehicles.id,
      images: vehicles.images,
      deletedAt: vehicles.deletedAt,
      lifecycleStatus: vehicles.lifecycleStatus,
      autopostEligible: vehicles.autopostEligible,
      autopostReadyAt: vehicles.autopostReadyAt,
    })
    .from(vehicles)
    .where(eq(vehicles.dealershipId, params.dealershipId));

  let updatedEligibility = 0;

  for (const v of inv) {
    const uniqueCount = uniquePhotoCount(v.images);
    const eligible = !v.deletedAt && v.lifecycleStatus === 'ACTIVE' && uniqueCount >= minPhotosTarget;
    const blockReason = eligible
      ? null
      : (v.deletedAt ? 'DELETED' : (v.lifecycleStatus !== 'ACTIVE' ? `STATUS_${v.lifecycleStatus}` : `NEEDS_PHOTOS_${uniqueCount}`));

    const shouldSetReadyAt = eligible && !v.autopostReadyAt;

    if (eligible !== !!v.autopostEligible || shouldSetReadyAt) {
      await db.update(vehicles)
        .set({
          autopostEligible: eligible,
          autopostBlockReason: blockReason,
          autopostReadyAt: shouldSetReadyAt ? now : v.autopostReadyAt,
        })
        .where(eq(vehicles.id, v.id));
      updatedEligibility++;
    }
  }

  const eligibleVehicles = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(
      eq(vehicles.dealershipId, params.dealershipId),
      eq(vehicles.autopostEligible, true),
      isNull(vehicles.deletedAt),
    ));

  const existingQueue = await db
    .select({ vehicleId: autopostQueueItems.vehicleId })
    .from(autopostQueueItems)
    .where(and(
      eq(autopostQueueItems.dealershipId, params.dealershipId),
      eq(autopostQueueItems.isActive, true),
    ));

  const queuedVehicleIds = new Set(existingQueue.map(r => r.vehicleId));
  const toEnqueue = eligibleVehicles.filter(v => !queuedVehicleIds.has(v.id));

  if (toEnqueue.length === 0) {
    return { enqueued: 0, updatedEligibility };
  }

  const maxRankRow = await db
    .select({ maxRank: sql<number>`COALESCE(MAX(${autopostQueueItems.priorityRank}), 0)` })
    .from(autopostQueueItems)
    .where(and(
      eq(autopostQueueItems.dealershipId, params.dealershipId),
      eq(autopostQueueItems.isActive, true),
    ));

  let nextRank = Number(maxRankRow[0]?.maxRank || 0) + 1;

  let enqueued = 0;

  for (const v of toEnqueue) {
    const [item] = await db
      .insert(autopostQueueItems)
      .values({
        dealershipId: params.dealershipId,
        vehicleId: v.id,
        isActive: true,
        priorityRank: nextRank++,
        queuedAt: now,
        updatedAt: now,
      })
      .returning();

    for (const platform of PLATFORMS) {
      await db.insert(autopostPlatformStatuses)
        .values({
          dealershipId: params.dealershipId,
          queueItemId: item.id,
          platform,
          status: 'queued',
          attemptCount: 0,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }

    await db.insert(autopostQueueEvents).values({
      dealershipId: params.dealershipId,
      queueItemId: item.id,
      actorUserId: params.actorUserId ?? null,
      eventType: 'ENQUEUED',
      message: 'system enqueue (autopostEligible=true)',
      createdAt: now,
    });

    enqueued++;
  }

  return { enqueued, updatedEligibility };
}

export async function listAutopostQueue(params: {
  dealershipId: number;
  platform?: AutopostPlatform | 'all';
}): Promise<AutopostQueueListRow[]> {
  const platform = params.platform ?? 'all';

  const items = await db
    .select()
    .from(autopostQueueItems)
    .where(and(
      eq(autopostQueueItems.dealershipId, params.dealershipId),
      eq(autopostQueueItems.isActive, true),
    ))
    .orderBy(asc(autopostQueueItems.priorityRank));

  if (items.length === 0) return [];

  const vehicleIds = items.map(i => i.vehicleId);
  const vRows = await db.select().from(vehicles)
    .where(and(eq(vehicles.dealershipId, params.dealershipId), inArray(vehicles.id, vehicleIds)));
  const vMap = new Map(vRows.map(v => [v.id, v]));

  const itemIds = items.map(i => i.id);
  const statuses = await db.select().from(autopostPlatformStatuses)
    .where(and(
      eq(autopostPlatformStatuses.dealershipId, params.dealershipId),
      inArray(autopostPlatformStatuses.queueItemId, itemIds),
      platform === 'all' ? sql`true` : eq(autopostPlatformStatuses.platform, platform as AutopostPlatform),
    ));

  const byItem = new Map<string, any[]>();
  for (const s of statuses) {
    const arr = byItem.get(s.queueItemId) || [];
    arr.push(s);
    byItem.set(s.queueItemId, arr);
  }

  return items.map(it => ({
    queueItem: it,
    vehicle: vMap.get(it.vehicleId) || null,
    platformStatuses: byItem.get(it.id) || [],
  }));
}

export async function reorderAutopostQueue(params: {
  dealershipId: number;
  orderedQueueItemIds: string[];
  actorUserId?: number | null;
}): Promise<void> {
  const now = new Date();

  const existing = await db.select({ id: autopostQueueItems.id })
    .from(autopostQueueItems)
    .where(and(
      eq(autopostQueueItems.dealershipId, params.dealershipId),
      eq(autopostQueueItems.isActive, true),
    ));

  const existingIds = new Set(existing.map(r => r.id));
  for (const id of params.orderedQueueItemIds) {
    if (!existingIds.has(id)) {
      throw new Error(`queue item not found or not active: ${id}`);
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < params.orderedQueueItemIds.length; i++) {
      const id = params.orderedQueueItemIds[i];
      await tx.update(autopostQueueItems)
        .set({ priorityRank: i + 1, updatedAt: now })
        .where(and(eq(autopostQueueItems.id, id), eq(autopostQueueItems.dealershipId, params.dealershipId)));

      await tx.insert(autopostQueueEvents).values({
        dealershipId: params.dealershipId,
        queueItemId: id,
        actorUserId: params.actorUserId ?? null,
        eventType: 'PRIORITY_REORDERED',
        message: 'manager reorder',
        metadata: { newRank: i + 1 },
        createdAt: now,
      });
    }
  });
}

export async function setPhotoGateOverride(params: {
  dealershipId: number;
  queueItemId: string;
  enabled: boolean;
  actorUserId?: number | null;
  reason?: string;
}): Promise<void> {
  const now = new Date();

  await db.update(autopostQueueItems)
    .set({
      photoGateOverride: params.enabled,
      photoGateOverrideByUserId: params.enabled ? (params.actorUserId ?? null) : null,
      photoGateOverrideAt: params.enabled ? now : null,
      updatedAt: now,
    })
    .where(and(
      eq(autopostQueueItems.id, params.queueItemId),
      eq(autopostQueueItems.dealershipId, params.dealershipId),
    ));

  await db.insert(autopostQueueEvents).values({
    dealershipId: params.dealershipId,
    queueItemId: params.queueItemId,
    actorUserId: params.actorUserId ?? null,
    eventType: 'PHOTO_GATE_OVERRIDE_SET',
    message: params.reason || (params.enabled ? 'override enabled' : 'override cleared'),
    metadata: { enabled: params.enabled },
    createdAt: now,
  });
}

export async function claimNextAutopostItem(params: {
  dealershipId: number;
  platform: AutopostPlatform;
  minPhotosTarget?: number;
  maxAttempts?: number;
}): Promise<{ queueItemId: string; vehicle: any } | null> {
  const minPhotosTarget = params.minPhotosTarget ?? 10;
  const maxAttempts = params.maxAttempts ?? 5;
  const now = new Date();

  const rows = await db
    .select({
      qi: autopostQueueItems,
      ps: autopostPlatformStatuses,
      v: vehicles,
    })
    .from(autopostQueueItems)
    .innerJoin(autopostPlatformStatuses, and(
      eq(autopostPlatformStatuses.queueItemId, autopostQueueItems.id),
      eq(autopostPlatformStatuses.platform, params.platform),
    ))
    .innerJoin(vehicles, eq(vehicles.id, autopostQueueItems.vehicleId))
    .where(and(
      eq(autopostQueueItems.dealershipId, params.dealershipId),
      eq(autopostQueueItems.isActive, true),
      eq(autopostPlatformStatuses.dealershipId, params.dealershipId),
      eq(vehicles.dealershipId, params.dealershipId),
      isNull(vehicles.deletedAt),
      inArray(autopostPlatformStatuses.status, ['queued', 'failed']),
      sql`COALESCE(${autopostPlatformStatuses.attemptCount}, 0) < ${maxAttempts}`,
    ))
    .orderBy(asc(autopostQueueItems.priorityRank))
    .limit(25);

  for (const r of rows) {
    const v = r.v;
    const uniqueCount = uniquePhotoCount(v.images);
    const photoGateOk = uniqueCount >= minPhotosTarget || r.qi.photoGateOverride;

    if (!photoGateOk) {
      await db.update(autopostPlatformStatuses)
        .set({ status: 'blocked', lastError: `<${minPhotosTarget} photos`, updatedAt: now })
        .where(eq(autopostPlatformStatuses.id, r.ps.id));
      continue;
    }

    const claimed = await db.transaction(async (tx) => {
      const updated = await tx.update(autopostPlatformStatuses)
        .set({
          status: 'claimed',
          attemptCount: sql`${autopostPlatformStatuses.attemptCount} + 1`,
          lastAttemptAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(and(
          eq(autopostPlatformStatuses.id, r.ps.id),
          inArray(autopostPlatformStatuses.status, ['queued', 'failed']),
        ))
        .returning();

      if (updated.length === 0) return null;

      await tx.insert(autopostQueueEvents).values({
        dealershipId: params.dealershipId,
        queueItemId: r.qi.id,
        platform: params.platform,
        actorUserId: null,
        eventType: 'CLAIMED',
        message: 'claimed by worker',
        createdAt: now,
      });

      return { queueItemId: r.qi.id, vehicle: v };
    });

    if (claimed) return claimed;
  }

  return null;
}

export async function recordAutopostResult(params: {
  dealershipId: number;
  queueItemId: string;
  platform: AutopostPlatform;
  status: 'posted' | 'failed' | 'skipped';
  postedUrl?: string;
  externalId?: string;
  error?: string;
}): Promise<void> {
  const now = new Date();

  await db.update(autopostPlatformStatuses)
    .set({
      status: params.status,
      postedUrl: params.postedUrl || null,
      postedExternalId: params.externalId || null,
      lastError: params.error || null,
      updatedAt: now,
      lastAttemptAt: now,
    })
    .where(and(
      eq(autopostPlatformStatuses.dealershipId, params.dealershipId),
      eq(autopostPlatformStatuses.queueItemId, params.queueItemId),
      eq(autopostPlatformStatuses.platform, params.platform),
    ));

  await db.insert(autopostQueueEvents).values({
    dealershipId: params.dealershipId,
    queueItemId: params.queueItemId,
    platform: params.platform,
    actorUserId: null,
    eventType: params.status === 'posted' ? 'POSTED_SUCCESS' : (params.status === 'failed' ? 'POSTED_FAILED' : 'SKIPPED'),
    message: params.error || null,
    metadata: { postedUrl: params.postedUrl, externalId: params.externalId },
    createdAt: now,
  });

  const statuses = await db.select({ status: autopostPlatformStatuses.status })
    .from(autopostPlatformStatuses)
    .where(and(
      eq(autopostPlatformStatuses.dealershipId, params.dealershipId),
      eq(autopostPlatformStatuses.queueItemId, params.queueItemId),
    ));

  const terminal = new Set(['posted', 'skipped']);
  const allTerminal = statuses.length > 0 && statuses.every(s => terminal.has(s.status));

  if (allTerminal) {
    await db.update(autopostQueueItems)
      .set({ isActive: false, dequeuedAt: now, updatedAt: now })
      .where(and(
        eq(autopostQueueItems.dealershipId, params.dealershipId),
        eq(autopostQueueItems.id, params.queueItemId),
      ));

    await db.insert(autopostQueueEvents).values({
      dealershipId: params.dealershipId,
      queueItemId: params.queueItemId,
      actorUserId: null,
      eventType: 'DEQUEUED',
      message: 'all platforms terminal',
      createdAt: now,
    });
  }
}
