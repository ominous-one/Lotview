import { evaluateAndEnqueueAutopost } from "../autopost-queue-api";
import { normalizeCarfaxBadgeList } from "../carfax-badge-utils";
import { deriveDealershipOperatorLabel } from "../dealership-reference";
import { facebookCatalogService } from "../facebook-catalog-service";
import { runPhotoEnrichmentSweep } from "../inventory-enrichment-service";
import { createInventoryOpsNotification } from "../notifications/notification-service";
import {
  buildVehicleTruthfulnessContext,
  computeVehicleDataQualitySignals,
  describeVehicleVerificationBlockReason,
  resolveVehicleVerificationState,
} from "../vehicle-data-quality";
import { uniquePhotoCount } from "../vehicle-photo-utils";

describe("production build export contracts", () => {
  it("exports conservative vehicle quality helpers", () => {
    const staleVehicle = {
      vin: "1HGCM82633A004352",
      images: ["https://example.com/a.jpg", "https://example.com/a.jpg"],
      lifecycleStatus: "ACTIVE",
      lastScrapedAt: "2020-01-01T00:00:00.000Z",
    };

    const signals = computeVehicleDataQualitySignals(staleVehicle);
    const state = resolveVehicleVerificationState(staleVehicle);

    expect(signals.hasExactIdentity).toBe(true);
    expect(signals.isFreshForAvailability).toBe(false);
    expect(uniquePhotoCount(staleVehicle.images)).toBe(1);
    expect(state.verified).toBe(false);
    expect(describeVehicleVerificationBlockReason(state)).toBe("Inventory freshness is not verified");
    expect(buildVehicleTruthfulnessContext(staleVehicle).join("\n")).toContain("inventory_stale");
  });

  it("normalizes display helpers", () => {
    expect(deriveDealershipOperatorLabel({ name: "Olympic Auto" })).toBe("Olympic Auto");
    expect(normalizeCarfaxBadgeList(["No Accidents", "No Accidents", "1 Owner"])).toEqual([
      "No Reported Accidents",
      "One Owner",
    ]);
  });

  it("keeps unconfigured production integrations fail-closed", async () => {
    await expect(createInventoryOpsNotification({}, { body: "failed" })).resolves.toMatchObject({
      created: false,
      reason: "notification_persistence_not_configured",
    });
    await expect(evaluateAndEnqueueAutopost()).resolves.toMatchObject({ disabled: true, enqueued: 0 });
    await expect(runPhotoEnrichmentSweep()).resolves.toMatchObject({ disabled: true, processed: 0 });
    await expect(facebookCatalogService.syncVehiclesToCatalog()).resolves.toMatchObject({
      success: false,
      errors: ["facebook_catalog_not_configured"],
    });
  });
});
