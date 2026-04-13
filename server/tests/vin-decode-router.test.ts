jest.mock('../storage', () => ({
  storage: {
    getVinDecodeCache: jest.fn(),
    upsertVinDecodeCache: jest.fn(),
    getDealershipApiKeys: jest.fn(),
  },
}));

import { decodeVinCheapHybrid } from '../vin-decode-router';
import { storage } from '../storage';

type FetchCall = { url: string; init?: RequestInit };

function mockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('vin decode router', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn() as any;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses fresh cache without external fetch', async () => {
    let fetchCalls = 0;
    (storage.getVinDecodeCache as jest.Mock).mockResolvedValue({
      id: 1,
      dealershipId: 7,
      vin: '1HGBH41JXMN109186',
      baselineSource: 'nhtsa',
      baselinePayload: { year: 2020, make: 'Honda', model: 'Civic', trim: 'EX' },
      enrichedSource: 'marketcheck',
      enrichedPayload: { trim: 'EX', installedOptions: ['Moonroof'] },
      trimConfidence: 'high',
      optionsConfidence: 'medium',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return mockResponse({});
    }) as any;

    const result = await decodeVinCheapHybrid('1hgbh41jXmn109186', {
      dealershipId: 7,
      allowPaidApis: true,
    });

    expect(result.vin).toBe('1HGBH41JXMN109186');
    expect(result.sources).toEqual(['nhtsa', 'marketcheck']);
    expect(result.trimConfidence).toBe('high');
    expect(result.optionsConfidence).toBe('medium');
    expect(fetchCalls).toBe(0);
  });

  it('ignores expired cache rows and refreshes baseline data', async () => {
    const fetchCalls: FetchCall[] = [];
    let upsertPayload: any;

    (storage.getVinDecodeCache as jest.Mock).mockResolvedValue({
      id: 2,
      dealershipId: 8,
      vin: '1HGBH41JXMN109186',
      baselineSource: 'nhtsa',
      baselinePayload: { year: 2018, make: 'Old', model: 'Cache', trim: 'Base' },
      enrichedSource: null,
      enrichedPayload: null,
      trimConfidence: 'low',
      optionsConfidence: 'unknown',
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (storage.upsertVinDecodeCache as jest.Mock).mockImplementation(async (_dealershipId, _vin, payload) => {
      upsertPayload = payload;
      return {
        id: 3,
        dealershipId: 8,
        vin: '1HGBH41JXMN109186',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload,
      };
    });
    (storage.getDealershipApiKeys as jest.Mock).mockResolvedValue({ marketcheckKey: null });
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetchCalls.push({ url, init });
      if (url.includes('vpic.nhtsa.dot.gov')) {
        return mockResponse({
          Results: [{
            ModelYear: '2022',
            Make: 'Toyota',
            Model: 'RAV4',
            Trim: 'XLE',
            DriveType: 'AWD',
            ErrorCode: '0',
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as any;

    const result = await decodeVinCheapHybrid('1HGBH41JXMN109186', {
      dealershipId: 8,
      allowPaidApis: false,
    });

    expect(fetchCalls).toHaveLength(1);
    expect(result.make).toBe('Toyota');
    expect(result.model).toBe('RAV4');
    expect(result.trim).toBe('XLE');
    expect(result.trimConfidence).toBe('high');
    expect(upsertPayload.baselineSource).toBe('nhtsa');
    expect(upsertPayload.trimConfidence).toBe('high');
  });

  it('upgrades trim confidence and options confidence when enrichment corroborates trim and adds options', async () => {
    (storage.getVinDecodeCache as jest.Mock).mockResolvedValue(undefined);
    (storage.getDealershipApiKeys as jest.Mock).mockResolvedValue({ marketcheckKey: 'mc_test' });
    (storage.upsertVinDecodeCache as jest.Mock).mockImplementation(async (_dealershipId, _vin, payload) => ({
      id: 4,
      dealershipId: 9,
      vin: '4T1BF1FK5CU123456',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload,
    }));

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('vpic.nhtsa.dot.gov')) {
        return mockResponse({
          Results: [{
            ModelYear: '2021',
            Make: 'Toyota',
            Model: 'RAV4',
            Trim: 'XLE',
            ErrorCode: '0',
          }],
        });
      }
      if (url.includes('api.marketcheck.com')) {
        return mockResponse({
          year: 2021,
          make: 'Toyota',
          model: 'RAV4',
          trim: 'XLE',
          drivetrain: 'AWD',
          options: Array.from({ length: 10 }, (_, i) => ({ name: `Option ${i + 1}` })),
          packages: [{ name: 'Weather Package' }, { name: 'Tech Package' }],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as any;

    const result = await decodeVinCheapHybrid('4T1BF1FK5CU123456', {
      dealershipId: 9,
      allowPaidApis: true,
    });

    expect(result.trimConfidence).toBe('high');
    expect(result.optionsConfidence).toBe('high');
    expect(result.installedOptions?.length).toBe(10);
    expect(result.packages?.length).toBe(2);
    expect(result.sources).toEqual(['nhtsa', 'marketcheck']);
  });

  it('treats package-only enrichment as medium confidence instead of unknown', async () => {
    (storage.getVinDecodeCache as jest.Mock).mockResolvedValue(undefined);
    (storage.getDealershipApiKeys as jest.Mock).mockResolvedValue({ marketcheckKey: 'mc_test' });
    (storage.upsertVinDecodeCache as jest.Mock).mockImplementation(async (_dealershipId, _vin, payload) => ({
      id: 5,
      dealershipId: 10,
      vin: '5NPE24AF4FH123456',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload,
    }));

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('vpic.nhtsa.dot.gov')) {
        return mockResponse({
          Results: [{
            ModelYear: '2020',
            Make: 'Hyundai',
            Model: 'Sonata',
            Trim: 'Preferred',
            ErrorCode: '0',
          }],
        });
      }
      if (url.includes('api.marketcheck.com')) {
        return mockResponse({
          year: 2020,
          make: 'Hyundai',
          model: 'Sonata',
          trim: 'Preferred',
          packages: [{ name: 'Tech Package' }, { name: 'Safety Package' }],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as any;

    const result = await decodeVinCheapHybrid('5NPE24AF4FH123456', {
      dealershipId: 10,
      allowPaidApis: true,
    });

    expect(result.packages?.length).toBe(2);
    expect(result.optionsConfidence).toBe('medium');
  });
});
