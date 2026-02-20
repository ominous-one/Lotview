import { storage } from "./storage";
import { MarketAggregationService } from "./market-aggregation-service";
import type { 
  Vehicle, 
  CompetitorPriceAlert, 
  InsertCompetitorPriceAlert,
  MarketListing,
  CompetitorDealer
} from "@shared/schema";

interface CompetitorMatch {
  vehicle: Vehicle;
  listing: MarketListing;
  priceDifference: number;
  percentDifference: number;
}

interface CompetitorMonitoringResult {
  vehiclesScanned: number;
  listingsFound: number;
  alertsCreated: number;
  errors: string[];
}

export class CompetitorMonitoringService {
  private dealershipId: number;
  private marketService: MarketAggregationService;

  constructor(dealershipId: number) {
    this.dealershipId = dealershipId;
    this.marketService = new MarketAggregationService();
  }

  async runCompetitorScan(): Promise<CompetitorMonitoringResult> {
    console.log(`[CompetitorMonitoring] Starting scan for dealership ${this.dealershipId}`);

    const result: CompetitorMonitoringResult = {
      vehiclesScanned: 0,
      listingsFound: 0,
      alertsCreated: 0,
      errors: []
    };

    try {
      const { vehicles } = await storage.getVehicles(this.dealershipId, 500, 0);
      result.vehiclesScanned = vehicles.length;

      if (vehicles.length === 0) {
        console.log(`[CompetitorMonitoring] No vehicles in inventory for dealership ${this.dealershipId}`);
        return result;
      }

      console.log(`[CompetitorMonitoring] Scanning ${vehicles.length} vehicles`);

      const vehiclesByMakeModel = this.groupVehiclesByMakeModel(vehicles);

      for (const [key, vehicleGroup] of vehiclesByMakeModel.entries()) {
        const [make, model] = key.split('|');
        const yearMin = Math.min(...vehicleGroup.map(v => v.year)) - 1;
        const yearMax = Math.max(...vehicleGroup.map(v => v.year)) + 1;

        try {
          const { listings } = await storage.getMarketListings(this.dealershipId, {
            make,
            model,
            yearMin,
            yearMax
          }, 200);

          result.listingsFound += listings.length;

          if (listings.length === 0) continue;

          const matches = this.findCompetitorMatches(vehicleGroup, listings);

          for (const match of matches) {
            const existingAlert = await this.findExistingAlert(match);
            if (!existingAlert) {
              await this.createAlert(match);
              result.alertsCreated++;
            }
          }

        } catch (error) {
          const errorMsg = `Error scanning ${make} ${model}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[CompetitorMonitoring] ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }

      console.log(`[CompetitorMonitoring] Scan complete: ${result.alertsCreated} alerts created from ${result.listingsFound} listings`);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CompetitorMonitoring] Scan failed:`, error);
      result.errors.push(errorMsg);
      return result;
    }
  }

  private groupVehiclesByMakeModel(vehicles: Vehicle[]): Map<string, Vehicle[]> {
    const groups = new Map<string, Vehicle[]>();
    
    for (const vehicle of vehicles) {
      const key = `${vehicle.make.toLowerCase()}|${vehicle.model.toLowerCase()}`;
      const existing = groups.get(key) || [];
      existing.push(vehicle);
      groups.set(key, existing);
    }
    
    return groups;
  }

  private findCompetitorMatches(vehicles: Vehicle[], listings: MarketListing[]): CompetitorMatch[] {
    const matches: CompetitorMatch[] = [];
    const ourSellerNames = new Set(['olympic', 'boundary', 'hyundai vancouver', 'kia vancouver']);

    for (const listing of listings) {
      const sellerLower = (listing.sellerName || '').toLowerCase();
      const isOurListing = Array.from(ourSellerNames).some(name => sellerLower.includes(name));
      if (isOurListing) continue;

      for (const vehicle of vehicles) {
        if (!this.isComparableVehicle(vehicle, listing)) continue;

        const priceDifference = vehicle.price - listing.price;
        const percentDifference = (priceDifference / vehicle.price) * 100;

        if (priceDifference > 0 && percentDifference >= 3) {
          matches.push({
            vehicle,
            listing,
            priceDifference,
            percentDifference
          });
        }
      }
    }

    return matches;
  }

  private isComparableVehicle(vehicle: Vehicle, listing: MarketListing): boolean {
    if (vehicle.make.toLowerCase() !== listing.make.toLowerCase()) return false;
    if (vehicle.model.toLowerCase() !== listing.model.toLowerCase()) return false;
    if (Math.abs(vehicle.year - listing.year) > 1) return false;

    if (listing.mileage && vehicle.odometer) {
      const mileageDiff = Math.abs(vehicle.odometer - listing.mileage);
      const mileagePercent = mileageDiff / Math.max(vehicle.odometer, 1);
      if (mileagePercent > 0.3) return false;
    }

    return true;
  }

  private determineSeverity(percentDifference: number, priceDifference: number): string {
    if (percentDifference >= 15 || priceDifference >= 5000) return 'critical';
    if (percentDifference >= 10 || priceDifference >= 3000) return 'high';
    if (percentDifference >= 5 || priceDifference >= 1500) return 'medium';
    return 'low';
  }

  private async findExistingAlert(match: CompetitorMatch): Promise<CompetitorPriceAlert | undefined> {
    const alerts = await storage.getCompetitorPriceAlerts(this.dealershipId, {
      vehicleId: match.vehicle.id,
      status: 'new'
    }, 50);

    return alerts.find(alert => 
      alert.competitorVehicleUrl === match.listing.listingUrl &&
      alert.status === 'new'
    );
  }

  private async createAlert(match: CompetitorMatch): Promise<CompetitorPriceAlert> {
    const severity = this.determineSeverity(match.percentDifference, match.priceDifference);

    const alertData: InsertCompetitorPriceAlert = {
      dealershipId: this.dealershipId,
      vehicleId: match.vehicle.id,
      competitorName: match.listing.sellerName || 'Unknown Dealer',
      competitorVehicleUrl: match.listing.listingUrl,
      competitorYear: match.listing.year,
      competitorMake: match.listing.make,
      competitorModel: match.listing.model,
      competitorTrim: match.listing.trim || null,
      competitorPrice: match.listing.price,
      competitorOdometer: match.listing.mileage || null,
      ourPrice: match.vehicle.price,
      priceDifference: match.priceDifference,
      percentDifference: Math.round(match.percentDifference * 10) / 10,
      alertType: 'undercut',
      severity,
      status: 'new',
      detectedAt: new Date()
    };

    const alert = await storage.createCompetitorPriceAlert(alertData);
    
    console.log(`[CompetitorMonitoring] Created ${severity} alert: ${match.listing.sellerName} has ${match.listing.year} ${match.listing.make} ${match.listing.model} for $${match.listing.price} (we have $${match.vehicle.price}, diff: $${match.priceDifference})`);
    
    return alert;
  }

  async refreshMarketData(makeModels: Array<{ make: string; model: string }>): Promise<void> {
    console.log(`[CompetitorMonitoring] Refreshing market data for ${makeModels.length} make/model combinations`);

    for (const { make, model } of makeModels) {
      try {
        await this.marketService.aggregateMarketData({
          make,
          model,
          dealershipId: this.dealershipId,
          maxResults: 100
        });
      } catch (error) {
        console.error(`[CompetitorMonitoring] Failed to refresh ${make} ${model}:`, error);
      }
    }
  }

  async getAlertSummary(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    recentAlerts: CompetitorPriceAlert[];
  }> {
    const allAlerts = await storage.getCompetitorPriceAlerts(this.dealershipId, {}, 100);
    
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const alert of allAlerts) {
      byStatus[alert.status] = (byStatus[alert.status] || 0) + 1;
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
    }

    const recentAlerts = allAlerts.slice(0, 10);

    return {
      total: allAlerts.length,
      byStatus,
      bySeverity,
      recentAlerts
    };
  }
}

export function createCompetitorMonitoringService(dealershipId: number): CompetitorMonitoringService {
  return new CompetitorMonitoringService(dealershipId);
}
