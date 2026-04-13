const getCarfaxReportByVinMock = jest.fn();
const upsertCarfaxReportMock = jest.fn();
const scrapeCarfaxReportMock = jest.fn();
const resolveCarfaxReportUrlFromDealerVdpMock = jest.fn();

jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
    insert: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../storage', () => ({
  storage: {
    getAllDealerships: jest.fn(),
    getCarfaxReportByVin: (...args: any[]) => getCarfaxReportByVinMock(...args),
    upsertCarfaxReport: (...args: any[]) => upsertCarfaxReportMock(...args),
  },
}));

jest.mock('../cargurus-scraper', () => ({
  scrapeAllCarGurusDealers: jest.fn(),
}));

jest.mock('../openai', () => ({
  generateVehicleDescription: jest.fn(),
}));

jest.mock('../dealer-listing-scraper', () => ({
  scrapeAllDealerListings: jest.fn(),
  scrapeDealerListingsWithCallback: jest.fn(),
  scrapeDealerListingsCheckpointed: jest.fn(),
}));

jest.mock('../vehicle-matcher', () => ({
  matchCarGurusToDealer: jest.fn(),
}));

jest.mock('../objectStorage', () => ({
  ObjectStorageService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../carfax-scraper', () => ({
  scrapeCarfaxReport: (...args: any[]) => scrapeCarfaxReportMock(...args),
  resolveCarfaxReportUrlFromDealerVdp: (...args: any[]) => resolveCarfaxReportUrlFromDealerVdpMock(...args),
}));

import { scrapeAndStoreCarfaxReport } from '../scraper';

describe('scraper carfax report resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCarfaxReportByVinMock.mockResolvedValue(null);
    upsertCarfaxReportMock.mockResolvedValue(undefined);
  });

  it('resolves the dynamic VHR url from the dealer VDP before scraping when only a generic carfax url is present', async () => {
    resolveCarfaxReportUrlFromDealerVdpMock.mockResolvedValue({
      reportUrl: 'https://vhr.carfax.ca/?id=resolved',
      badges: ['One Owner'],
    });
    scrapeCarfaxReportMock.mockResolvedValue({
      reportUrl: 'https://vhr.carfax.ca/?id=resolved',
      vin: 'KM8KN4AE6NU054295',
      accidentCount: 0,
      ownerCount: 1,
      serviceRecordCount: 0,
      lastReportedOdometer: null,
      lastReportedDate: null,
      damageReported: false,
      lienReported: false,
      registrationHistory: [],
      serviceHistory: [],
      accidentHistory: [],
      ownershipHistory: [],
      odometerHistory: [],
      fullReportData: {},
      badges: ['One Owner', 'No Reported Accidents'],
    });

    await scrapeAndStoreCarfaxReport(
      52,
      20,
      'https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=KM8KN4AE6NU054295',
      'KM8KN4AE6NU054295',
      'https://www.olympichyundaivancouver.com/vehicles/2022/hyundai/ioniq-5/vancouver/bc/69188186/?sale_class=used',
    );

    expect(resolveCarfaxReportUrlFromDealerVdpMock).toHaveBeenCalledWith(
      'https://www.olympichyundaivancouver.com/vehicles/2022/hyundai/ioniq-5/vancouver/bc/69188186/?sale_class=used',
      'KM8KN4AE6NU054295',
    );
    expect(scrapeCarfaxReportMock).toHaveBeenCalledWith('https://vhr.carfax.ca/?id=resolved');
    expect(upsertCarfaxReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 52,
        dealershipId: 20,
        vin: 'KM8KN4AE6NU054295',
        reportUrl: 'https://vhr.carfax.ca/?id=resolved',
      }),
    );
  });

  it('does not resolve again when the carfax url is already a vhr report url', async () => {
    scrapeCarfaxReportMock.mockResolvedValue({
      reportUrl: 'https://vhr.carfax.ca/?id=ready',
      vin: 'VIN12345678901234',
      accidentCount: 0,
      ownerCount: 0,
      serviceRecordCount: 0,
      lastReportedOdometer: null,
      lastReportedDate: null,
      damageReported: false,
      lienReported: false,
      registrationHistory: [],
      serviceHistory: [],
      accidentHistory: [],
      ownershipHistory: [],
      odometerHistory: [],
      fullReportData: {},
      badges: [],
    });

    await scrapeAndStoreCarfaxReport(
      12,
      3,
      'https://vhr.carfax.ca/?id=ready',
      'VIN12345678901234',
      'https://dealer.example/vdp',
    );

    expect(resolveCarfaxReportUrlFromDealerVdpMock).not.toHaveBeenCalled();
    expect(scrapeCarfaxReportMock).toHaveBeenCalledWith('https://vhr.carfax.ca/?id=ready');
  });
});
