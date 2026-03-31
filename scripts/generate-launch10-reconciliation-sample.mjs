import fs from 'node:fs';
import path from 'node:path';
import { reconcileVehicleTruth, evaluateDealershipScrapeGate } from '../server/scrape-truth-foundation.ts';

const outputPath = path.resolve('tmp/swarm-launch10/scrape-reconciliation-sample.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const sampledVehicles = [
  reconcileVehicleTruth({
    dealershipId: 101,
    source: {
      vin: '1HGCM82633A004352',
      stockNumber: 'LV-001',
      year: 2023,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      price: 31995,
      odometer: 15000,
      photoCount: 12,
      primaryPhoto: 'https://dealer.example/vehicle-1-primary.jpg',
      transmission: 'Automatic',
      drivetrain: 'AWD',
      fuelType: 'Gasoline',
      exteriorColor: 'Blue',
      interiorColor: 'Black',
      carfaxUrl: 'https://vhr.carfax.ca/report?id=vehicle-1',
      carfaxBadges: ['One Owner'],
    },
    observed: {
      vin: '1HGCM82633A004352',
      stockNumber: 'LV-001',
      year: 2023,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      price: 31995,
      odometer: 15000,
      photoCount: 12,
      primaryPhoto: 'https://dealer.example/vehicle-1-primary.jpg',
      transmission: 'Automatic',
      drivetrain: 'AWD',
      fuelType: 'Gasoline',
      exteriorColor: 'Blue',
      interiorColor: 'Black',
      carfaxUrl: 'https://vhr.carfax.ca/report?id=vehicle-1',
      carfaxBadges: ['One Owner'],
    },
  }),
  reconcileVehicleTruth({
    dealershipId: 101,
    source: {
      vin: '2HGFA16598H000111',
      stockNumber: 'LV-002',
      year: 2022,
      make: 'Honda',
      model: 'CR-V',
      trim: 'Sport',
      price: 28995,
      odometer: 28000,
      photoCount: 16,
      primaryPhoto: 'https://dealer.example/vehicle-2-primary.jpg',
      transmission: 'Automatic',
      drivetrain: 'AWD',
      fuelType: 'Gasoline',
      exteriorColor: 'White',
      interiorColor: 'Black',
      carfaxUrl: null,
      carfaxBadges: [],
    },
    observed: {
      vin: '2HGFA16598H000111',
      stockNumber: 'LV-002',
      year: 2022,
      make: 'Honda',
      model: 'CR-V',
      trim: 'Sport',
      price: 28495,
      odometer: 28002,
      photoCount: 14,
      primaryPhoto: 'https://dealer.example/vehicle-2-other.jpg',
      transmission: 'Automatic',
      drivetrain: 'AWD',
      fuelType: 'Gasoline',
      exteriorColor: 'White',
      interiorColor: 'Black',
      carfaxUrl: null,
      carfaxBadges: [],
    },
  }),
];

const gate = evaluateDealershipScrapeGate({
  dealershipId: 101,
  sampledVehicles,
  scrapeSuccessRate: 0.992,
  staleRemovalWithinSla: true,
  consecutiveDaysAbove95: 3,
  imageContaminationRate: 0,
  hasCarfaxUnknownsOnlyWhenAbsent: true,
});

const artifact = {
  generatedAt: new Date().toISOString(),
  artifactType: 'launch10-scrape-reconciliation-sample',
  truthBoundary: 'schema/sample artifact only — not live 10-dealership launch proof',
  dealershipId: 101,
  sampledVehicleCount: sampledVehicles.length,
  sampledVehicles,
  gate,
};

fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
console.log(outputPath);
