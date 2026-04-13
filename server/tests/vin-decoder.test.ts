/**
 * VIN Decoder Tests
 *
 * Tests the three-tier fallback chain:
 *   MarketCheck (paid) → NHTSA (free government) → ApiNinjas (free)
 *
 * All HTTP calls are intercepted so no real API keys or network are required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../storage', () => ({
  storage: {
    getDealershipApiKeys: jest.fn(async () => null), // No API keys by default
  },
}));

jest.mock('../error-utils', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

const REAL_TOYOTA_RAV4_VIN = '2T3BFREV0AW123456';
const REAL_TESLA_VIN = '5YJ3E1EA1JF000001';
const INVALID_VIN = 'INVALID';

type MockHandler = (url: string) => Response;

function mockFetch(handlers: Record<string, MockHandler>): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return handler(url);
      }
    }
    // Fallback: simulate network error for any unmocked URL
    throw new Error(`Unmocked fetch call to: ${url}`);
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// NHTSA DecodeVinValues response — flat object format (NHTSA API v2)
// See: https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json
function nhtsaPayload(_vin: string) {
  return {
    Count: 1,
    Message: 'Results returned successfully',
    SearchCriteria: null,
    Results: [
      {
        ABS: '',
        ActiveSafetySysNote: '',
        AdaptiveCruiseControl: '',
        AdaptiveHeadlights: '',
        AdditionalErrorText: '',
        BodyClass: 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)',
        BusFloorConfigType: '',
        BusType: '',
        CIB: '',
        CashForClunkers: '',
        ChargerLevel: '',
        ChargerPowerKW: '',
        CoolingType: '',
        CurbWeightLB: '',
        CustomMotorcycleType: '',
        DaytimeRunningLight: '',
        DestinationMarket: '',
        DisplacementCC: '2494',
        DisplacementCI: '152.2',
        DisplacementL: '2.5',
        Doors: '4',
        DriveType: 'AWD/4WD',
        DriverAssist: '',
        DynamicBrakeSupport: '',
        EDR: '',
        ESC: '',
        EV_DriveUnit: '',
        ElectrificationLevel: '',
        EngineConfiguration: 'In-Line',
        EngineCycles: '',
        EngineCylinders: '4',
        EngineHP: '176',
        EngineHP_to: '',
        EngineKW: '',
        EngineManufacturer: '',
        EngineModel: '',
        EntertainmentSystem: '',
        ErrorCode: '0',
        ErrorText: '0 - VIN decoded clean. Check Digit (9th position) is correct',
        ForwardCollisionWarning: '',
        FuelInjectionType: '',
        FuelTypePrimary: 'Gasoline',
        FuelTypeSecondary: '',
        GCWR: '',
        GCWR_to: '',
        GVWR: '',
        GVWR_to: '',
        KeylessIgnition: '',
        LaneCenteringAssistance: '',
        LaneDepartureWarning: '',
        LaneKeepSystem: '',
        LowerBeamHeadlampLightSource: '',
        Make: 'TOYOTA',
        MakeID: '448',
        Manufacturer: 'TOYOTA MOTOR CORPORATION',
        ManufacturerId: '1001',
        Model: 'RAV4',
        ModelID: '1861',
        ModelYear: '2010',
        MotorcycleChassisType: '',
        MotorcycleSuspensionType: '',
        NCSABodyType: '',
        NCSAMake: '',
        NCSAMapExcApprovedBy: '',
        NCSAMapExcApprovedOn: '',
        NCSAMappingException: '',
        NCSAModel: '',
        NCSANote: '',
        NonLandUse: '',
        Note: '',
        OtherBusInfo: '',
        OtherEngineInfo: '',
        OtherMotorcycleInfo: '',
        OtherRestraintSystemInfo: '',
        OtherTrailerInfo: '',
        ParkAssist: '',
        PedestrianAutomaticEmergencyBraking: '',
        PlantCity: 'TAHARA',
        PlantCompanyName: '',
        PlantCountry: 'JAPAN',
        PlantState: '',
        PossibleValues: '',
        Pretensioner: '',
        RearAutomaticEmergencyBraking: '',
        RearCrossTrafficAlert: '',
        RearVisibilitySystem: '',
        SAEAutomationLevel: '',
        SAEAutomationLevel_to: '',
        SeatBeltsAll: '',
        SeatRows: '',
        Seats: '',
        SemiautomaticHeadlampBeamSwitching: '',
        Series: '',
        Series2: '',
        SteeringLocation: '',
        SuggestedVIN: '',
        TPMS: '',
        TopSpeedMPH: '',
        TrackWidth: '',
        TractionControl: '',
        TrailerBodyType: '',
        TrailerLength: '',
        TrailerType: '',
        TransmissionSpeeds: '',
        TransmissionStyle: 'Automatic',
        Trim: 'Base',
        Trim2: '',
        Turbo: '',
        VIN: '2T3BFREV0AW123456',
        ValveTrainDesign: '',
        VehicleDescriptor: '2T3BFREV*AW',
        VehicleType: 'MULTIPURPOSE PASSENGER VEHICLE (MPV)',
        WheelBaseLong: '',
        WheelBaseShort: '',
        WheelBaseType: '',
        WheelSizeFront: '',
        WheelSizeRear: '',
        Wheels: '',
        Windows: '',
      },
    ],
  };
}

// ─── Import after mocks ───────────────────────────────────────────────────────

import { decodeVIN } from '../vin-decoder';
import { storage } from '../storage';

const mockStorage = storage as jest.Mocked<typeof storage>;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VIN decoder — NHTSA fallback (no API keys)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getDealershipApiKeys.mockResolvedValue(null as any);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('decodes a Toyota RAV4 VIN via NHTSA', async () => {
    fetchSpy = mockFetch({
      'vpic.nhtsa.dot.gov': () => jsonResponse(nhtsaPayload(REAL_TOYOTA_RAV4_VIN)),
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN);

    expect(result).toBeDefined();
    expect(result.vin).toBe(REAL_TOYOTA_RAV4_VIN);
    expect(result.make?.toUpperCase()).toContain('TOYOTA');
    expect(result.model?.toUpperCase()).toContain('RAV4');
    expect(result.year).toBe('2010');
    expect(result.fuelType?.toLowerCase()).toContain('gasoline');
    expect(result.source).toBe('nhtsa');
  });

  it('normalizes VIN to uppercase before decoding', async () => {
    fetchSpy = mockFetch({
      'vpic.nhtsa.dot.gov': (url) => {
        // Verify the VIN in the URL is uppercase
        expect(url.toUpperCase()).toContain(REAL_TOYOTA_RAV4_VIN.toUpperCase());
        return jsonResponse(nhtsaPayload(REAL_TOYOTA_RAV4_VIN));
      },
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN.toLowerCase());
    expect(result.vin).toBe(REAL_TOYOTA_RAV4_VIN);
  });

  it('returns an error result for a short/invalid VIN', async () => {
    // NHTSA should still respond but with an error code
    fetchSpy = mockFetch({
      'vpic.nhtsa.dot.gov': () =>
        jsonResponse({
          Count: 1,
          Results: [
            { Variable: 'Error Code', Value: '11', ValueId: '11' },
            { Variable: 'Error Text', Value: 'VIN has invalid characters', ValueId: '' },
          ],
        }),
    });

    const result = await decodeVIN(INVALID_VIN);
    // Should not throw — should return a result with errorCode set
    expect(result).toBeDefined();
    expect(result.vin).toBe(INVALID_VIN);
  });

  it('returns an error result when NHTSA throws a network error', async () => {
    // We simulate an AbortError (timeout) which triggers retry logic.
    // We mock ALL calls to fail immediately so we don't wait for real backoff.
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const err = new Error('Network timeout');
      err.name = 'AbortError';
      throw err;
    });

    // NHTSA will retry up to 3 times — each immediate — and then return an error result.
    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN);
    expect(result).toBeDefined();
    expect(result.vin).toBe(REAL_TOYOTA_RAV4_VIN);
    expect(result.errorCode).toBeTruthy();
  }, 30000); // generous timeout for 3 retries
});

describe('VIN decoder — MarketCheck preferred when API key present', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getDealershipApiKeys.mockResolvedValue({
      marketcheckKey: 'mc-test-key-123',
    } as any);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('calls MarketCheck when key is configured', async () => {
    let marketCheckCalled = false;

    fetchSpy = mockFetch({
      'api.marketcheck.com': (url) => {
        marketCheckCalled = true;
        expect(url).toContain(REAL_TOYOTA_RAV4_VIN);
        expect(url).toContain('mc-test-key-123');
        return jsonResponse({
          vin: REAL_TOYOTA_RAV4_VIN,
          year: 2010,
          make: 'Toyota',
          model: 'RAV4',
          trim: 'Sport',
          fuel_type: 'Gasoline',
          drivetrain: 'AWD',
          cylinders: 4,
        });
      },
      'vpic.nhtsa.dot.gov': () => {
        // NHTSA should NOT be called if MarketCheck succeeds
        throw new Error('NHTSA should not be called when MarketCheck succeeds');
      },
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN, 1);
    expect(marketCheckCalled).toBe(true);
    expect(result.source).toBe('marketcheck');
    expect(result.make?.toUpperCase()).toContain('TOYOTA');
  });

  it('falls back to NHTSA when MarketCheck returns 404', async () => {
    let nhtsaCalled = false;

    fetchSpy = mockFetch({
      'api.marketcheck.com': () => new Response('Not Found', { status: 404 }),
      'vpic.nhtsa.dot.gov': () => {
        nhtsaCalled = true;
        return jsonResponse(nhtsaPayload(REAL_TOYOTA_RAV4_VIN));
      },
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN, 1);
    expect(nhtsaCalled).toBe(true);
    expect(result.source).toBe('nhtsa');
  });

  it('falls back to NHTSA when MarketCheck times out', async () => {
    let nhtsaCalled = false;

    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('marketcheck.com')) {
        // Simulate abort/timeout
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      if (url.includes('vpic.nhtsa.dot.gov')) {
        nhtsaCalled = true;
        return jsonResponse(nhtsaPayload(REAL_TOYOTA_RAV4_VIN));
      }
      throw new Error(`Unmocked: ${url}`);
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN, 1);
    expect(nhtsaCalled).toBe(true);
    expect(result.source).toBe('nhtsa');
  });
});

describe('VIN decoder — NHTSA field mapping', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getDealershipApiKeys.mockResolvedValue(null as any);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('extracts all expected fields from NHTSA response', async () => {
    fetchSpy = mockFetch({
      'vpic.nhtsa.dot.gov': () => jsonResponse(nhtsaPayload(REAL_TOYOTA_RAV4_VIN)),
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN);

    expect(result.fuelType).toBeTruthy();
    expect(result.driveType).toBeTruthy();
    expect(result.engineCylinders).toBeTruthy();
    expect(result.transmission).toBeTruthy();
  });

  it('populates carfaxUrl from VIN', async () => {
    fetchSpy = mockFetch({
      'vpic.nhtsa.dot.gov': () => jsonResponse(nhtsaPayload(REAL_TOYOTA_RAV4_VIN)),
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN);
    expect(result.carfaxUrl).toContain(REAL_TOYOTA_RAV4_VIN);
    expect(result.carfaxUrl).toContain('carfax.com');
  });

  it('includes responseTimeMs', async () => {
    fetchSpy = mockFetch({
      'vpic.nhtsa.dot.gov': () => jsonResponse(nhtsaPayload(REAL_TOYOTA_RAV4_VIN)),
    });

    const result = await decodeVIN(REAL_TOYOTA_RAV4_VIN);
    expect(typeof result.responseTimeMs).toBe('number');
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});
