import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from './db';
import { vehicles } from '@shared/schema';
import { shouldUpdatePhotos } from './inventory-enrichment-utils';
import { uniquePhotoCount, computePhotoStatus } from './vehicle-photo-utils';
import { BrowserlessUnifiedService } from './browserless-unified';
import { createInventoryOpsNotification } from './notifications/notification-service';
import { getDashboardUrl } from './email-service';

const DEFAULT_MIN_PHOTOS_TARGET = 10;
const DEFAULT_MAX_FAILS = 10;

function extractImageUrlsFromHtml(html: string): string[] {
  // Best-effort: pull out common image URLs. Conservative (avoid logos/etc).
  const urls = new Set<string>();
  const patterns = [
    /https?:\/\/[^\s"')>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"')>]*)?/gi,
  ];

  for (const p of patterns) {
    const matches = html.match(p) || [];
    for (const m of matches) {
      const cleaned = m.replace(/&amp;/g, '&');
      const lower = cleaned.toLowerCase();
      if (
        lower.includes('logo') ||
        lower.includes('icon') ||
        lower.includes('sprite') ||
        lower.includes('carfax') ||
        lower.endsWith('.svg')
      ) continue;
      urls.add(cleaned);
    }
  }

  return Array.from(urls).slice(0, 50);
}

function extractPriceFromHtml(html: string): number | null {
  const m = html.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function hostForUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}

export async function runPhotoEnrichmentSweep(params: {
  dealershipId: number;
  limit?: number;
  minPhotosTarget?: number;
  maxFails?: number;
  minHoursBetweenAttempts?: number;
  maxVehiclesPerRun?: number;
  maxFailuresPerHost?: number;
}): Promise<{ processed: number; updated: number; skipped: number; failed: number; terminal: number }> {
  const limit = params.limit ?? 25;
  const minPhotosTarget = params.minPhotosTarget ?? DEFAULT_MIN_PHOTOS_TARGET;
  const maxFails = params.maxFails ?? DEFAULT_MAX_FAILS;
  const minHoursBetweenAttempts = params.minHoursBetweenAttempts ?? 2;
  const maxVehiclesPerRun = params.maxVehiclesPerRun ?? limit;
  const maxFailuresPerHost = params.maxFailuresPerHost ?? 5;

  const cutoff = new Date(Date.now() - minHoursBetweenAttempts * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: vehicles.id,
      dealerVdpUrl: vehicles.dealerVdpUrl,
      images: vehicles.images,
      photoFingerprint: vehicles.photoFingerprint,
      photoEnrichFailCount: vehicles.photoEnrichFailCount,
      photoEnrichLastAttemptAt: vehicles.photoEnrichLastAttemptAt,
      lastPriceRefreshAt: vehicles.lastPriceRefreshAt,
      photoStatus: vehicles.photoStatus,
      lifecycleStatus: vehicles.lifecycleStatus,
    })
    .from(vehicles)
    .where(and(
      eq(vehicles.dealershipId, params.dealershipId),
      isNull(vehicles.deletedAt),
      // Needs photos
      sql`COALESCE(array_length(${vehicles.images}, 1), 0) < ${minPhotosTarget}`,
      // Stop conditions
      sql`COALESCE(${vehicles.photoEnrichFailCount}, 0) < ${maxFails}`,
      // Throttle attempts
      or(isNull(vehicles.photoEnrichLastAttemptAt), lt(vehicles.photoEnrichLastAttemptAt, cutoff)),
      // Must have a VDP
      sql`${vehicles.dealerVdpUrl} IS NOT NULL`
    ))
    .limit(limit);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let terminal = 0;

  const browserless = new BrowserlessUnifiedService();
  const hostFailCounts = new Map<string, number>();

  for (const v of candidates.slice(0, maxVehiclesPerRun)) {
    processed++;

    const vdpUrl = (v.dealerVdpUrl || '').trim();
    if (!vdpUrl) {
      skipped++;
      continue;
    }

    const host = hostForUrl(vdpUrl);
    const hostFails = hostFailCounts.get(host) || 0;
    if (hostFails >= maxFailuresPerHost) {
      // Circuit breaker: stop hammering a host that's failing.
      skipped++;
      continue;
    }

    const attemptAt = new Date();

    try {
      // 1) Fetch HTML with robust bypass (ZenRows → local/other fallbacks inside service)
      // We start with ZenRows because most VDPs are Cloudflare-protected.
      let html: string | null = null;

      const zen = await browserless.zenRowsScrape(vdpUrl, { jsRender: true, premiumProxy: true, waitMs: 6000, proxyCountry: 'ca', scrollToBottom: true });
      if (zen.success && zen.html) {
        html = zen.html;
      } else {
        // Fallback to simple fetch
        const resp = await fetch(vdpUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) {
          hostFailCounts.set(host, hostFails + 1);
          await db.update(vehicles)
            .set({
              photoEnrichFailCount: (v.photoEnrichFailCount || 0) + 1,
              photoEnrichLastAttemptAt: attemptAt,
              photoEnrichLastError: `HTTP ${resp.status}`,
              photoStatus: v.photoStatus || 'unknown',
            })
            .where(eq(vehicles.id, v.id));
          failed++;
          continue;
        }
        html = await resp.text();
      }

      const candidateUrls = extractImageUrlsFromHtml(html || '');
      const candidateUniqueCount = uniquePhotoCount(candidateUrls);

      const decision = shouldUpdatePhotos({
        existingUrls: v.images || [],
        existingFingerprint: v.photoFingerprint,
        candidateUrls,
        minPhotosTarget,
      });

      // Price refresh cadence (24h)
      const priceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const shouldRefreshPrice = !v.lastPriceRefreshAt || v.lastPriceRefreshAt < priceCutoff;
      const extractedPrice = shouldRefreshPrice ? extractPriceFromHtml(html || '') : null;

      // Stop condition: if we cannot find ANY photos repeatedly, mark terminal after maxFails.
      const nextFailCount = (v.photoEnrichFailCount || 0) + 1;
      const wouldBeTerminal = nextFailCount >= maxFails;

      // Update decision tree:
      // - If we have >= minPhotosTarget unique photos and decision says update → update photos, reset fail count.
      // - If we have < minPhotosTarget, keep retrying; record reason + fingerprint and increment fail count.
      // - If fingerprint unchanged and still under target, increment fail count but avoid re-writing images.

      if (candidateUniqueCount >= minPhotosTarget && decision.shouldUpdate) {
        await db.update(vehicles)
          .set({
            images: candidateUrls.slice(0, 50),
            photoFingerprint: decision.fingerprint,
            photoEnrichFailCount: 0,
            photoEnrichLastAttemptAt: attemptAt,
            photoEnrichLastError: null,
            photoStatus: computePhotoStatus(candidateUrls, minPhotosTarget),
            lifecycleStatus: 'ACTIVE',
            ...(extractedPrice && extractedPrice > 0 ? { price: extractedPrice, lastPriceRefreshAt: attemptAt } : {}),
          })
          .where(eq(vehicles.id, v.id));
        updated++;
        continue;
      }

      if (candidateUniqueCount >= minPhotosTarget && !decision.shouldUpdate) {
        // Already good enough but no need to update (fingerprint unchanged or not better).
        await db.update(vehicles)
          .set({
            photoEnrichLastAttemptAt: attemptAt,
            photoEnrichLastError: decision.reason,
            photoFingerprint: decision.fingerprint,
            photoStatus: computePhotoStatus(v.images || candidateUrls, minPhotosTarget),
            photoEnrichFailCount: 0,
            ...(extractedPrice && extractedPrice > 0 ? { price: extractedPrice, lastPriceRefreshAt: attemptAt } : {}),
          })
          .where(eq(vehicles.id, v.id));
        skipped++;
        continue;
      }

      // Under target: keep trying later.
      if (wouldBeTerminal) {
        const terminalError = `terminal_under_target_${candidateUniqueCount}_${decision.reason}`;

        await db.update(vehicles)
          .set({
            photoEnrichFailCount: nextFailCount,
            photoEnrichLastAttemptAt: attemptAt,
            photoEnrichLastError: terminalError,
            photoFingerprint: decision.fingerprint,
            photoStatus: 'terminal',
            lifecycleStatus: 'ENRICHMENT_TERMINAL_NO_MORE_AVAILABLE',
          })
          .where(eq(vehicles.id, v.id));

        // Notify managers/GM once when enrichment becomes terminal.
        try {
          const eventKey = `INVENTORY_ENRICHMENT_STUCK:${v.id}:${terminalError}`;
          await createInventoryOpsNotification(db, {
            dealershipId: params.dealershipId,
            eventType: 'INVENTORY_ENRICHMENT_STUCK',
            eventKey,
            vehicleId: v.id,
            title: `Inventory enrichment stuck: vehicle ${v.id}`,
            body: `Photo enrichment hit terminal state after ${nextFailCount} attempts.\nReason: ${terminalError}\n\nThis vehicle will remain blocked for autopost photo gating unless a manager overrides.`,
            deepLink: `${getDashboardUrl()}/manager/autopost/queue`,
            requireEmail: false,
          });
        } catch (notifyError) {
          console.error('[Enrichment] Failed to create stuck enrichment notification:', notifyError);
        }

        terminal++;
        continue;
      }

      await db.update(vehicles)
        .set({
          photoEnrichFailCount: nextFailCount,
          photoEnrichLastAttemptAt: attemptAt,
          photoEnrichLastError: `under_target_${candidateUniqueCount}_${decision.reason}`,
          photoFingerprint: decision.fingerprint,
          photoStatus: computePhotoStatus(candidateUrls, minPhotosTarget),
          ...(extractedPrice && extractedPrice > 0 ? { price: extractedPrice, lastPriceRefreshAt: attemptAt } : {}),
        })
        .where(eq(vehicles.id, v.id));

      skipped++;
    } catch (e: any) {
      hostFailCounts.set(host, hostFails + 1);
      await db.update(vehicles)
        .set({
          photoEnrichFailCount: sql`${vehicles.photoEnrichFailCount} + 1`,
          photoEnrichLastAttemptAt: new Date(),
          photoEnrichLastError: e?.message ? String(e.message) : String(e),
        })
        .where(eq(vehicles.id, v.id));

      failed++;
    }
  }

  return { processed, updated, skipped, failed, terminal };
}
