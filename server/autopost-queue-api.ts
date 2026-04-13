import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { autopostQueueItems, vehicles } from '@shared/schema';
import { uniquePhotoCount } from './vehicle-photo-utils';
import {
  describeVehicleVerificationBlockReason,
  resolveVehicleVerificationState,
} from './vehicle-data-quality';

export {
  claimNextAutopostItem,
  dequeueAutopostQueueItem,
  evaluateAndEnqueueAutopostQueue,
  listAutopostQueue,
  recordAutopostResult,
  reorderAutopostQueue,
  setPhotoGateOverride,
  type QueueListPlatformFilter,
} from './autopost-queue-service';

export async function evaluateAndEnqueueAutopost(params: {
  dealershipId: number;
  actorUserId?: number | null;
  minPhotosTarget?: number;
}): Promise<{ enqueued: number; updatedEligibility: number }> {
  const minPhotosTarget = params.minPhotosTarget ?? 10;
  const now = new Date();

  const inventory = await db
    .select({
      id: vehicles.id,
      images: vehicles.images,
      deletedAt: vehicles.deletedAt,
      lifecycleStatus: vehicles.lifecycleStatus,
      vin: vehicles.vin,
      stockNumber: vehicles.stockNumber,
      normalizedStockNumber: vehicles.normalizedStockNumber,
      dealerVdpUrl: vehicles.dealerVdpUrl,
      carfaxUrl: vehicles.carfaxUrl,
      carfaxBadges: vehicles.carfaxBadges,
      lastScrapedAt: vehicles.lastScrapedAt,
      photoStatus: vehicles.photoStatus,
      verificationStatus: vehicles.verificationStatus,
      autopostEligible: vehicles.autopostEligible,
      autopostReadyAt: vehicles.autopostReadyAt,
    })
    .from(vehicles)
    .where(eq(vehicles.dealershipId, params.dealershipId));

  let updatedEligibility = 0;

  for (const vehicle of inventory) {
    const uniqueCount = uniquePhotoCount(vehicle.images);
    const verificationState = resolveVehicleVerificationState(vehicle);
    const verificationBlockReason = describeVehicleVerificationBlockReason(verificationState);
    const eligible =
      !vehicle.deletedAt &&
      vehicle.lifecycleStatus === 'ACTIVE' &&
      !verificationBlockReason &&
      uniqueCount >= minPhotosTarget;
    const blockReason = eligible
      ? null
      : vehicle.deletedAt
        ? 'DELETED'
        : vehicle.lifecycleStatus !== 'ACTIVE'
          ? `STATUS_${vehicle.lifecycleStatus}`
          : verificationBlockReason
            ? verificationBlockReason
            : `NEEDS_PHOTOS_${uniqueCount}`;

    const shouldSetReadyAt = eligible && !vehicle.autopostReadyAt;

    if (eligible !== !!vehicle.autopostEligible || shouldSetReadyAt) {
      await db
        .update(vehicles)
        .set({
          autopostEligible: eligible,
          autopostBlockReason: blockReason,
          autopostReadyAt: shouldSetReadyAt ? now : vehicle.autopostReadyAt,
        })
        .where(eq(vehicles.id, vehicle.id));
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

  const queuedVehicleIds = new Set(existingQueue.map((row) => row.vehicleId));
  const toEnqueue = eligibleVehicles.filter((vehicle) => !queuedVehicleIds.has(vehicle.id));

  return { enqueued: toEnqueue.length, updatedEligibility };
}
