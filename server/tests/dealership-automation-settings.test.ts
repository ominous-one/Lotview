jest.mock('../db', () => {
  const chain = {
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    returning: jest.fn(),
    values: jest.fn(),
    set: jest.fn(),
  };

  const db = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
  };

  // Make the chainable methods return itself
  for (const k of Object.keys(chain)) {
    // @ts-expect-error - test mock
    chain[k].mockReturnValue(chain);
  }

  return { db, __chain: chain };
});

import { DatabaseStorage } from '../storage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db, __chain } = require('../db');

describe('dealership automation settings persistence', () => {
  test('upsert creates then updates row', async () => {
    const s = new DatabaseStorage();
    jest.spyOn(s, 'getDealershipById').mockResolvedValue({ id: 1 } as any);

    // First call: no row exists
    __chain.limit.mockResolvedValueOnce([]);

    const createdRow = {
      id: 1,
      dealershipId: 1,
      competitiveReportDefaultRadiusKm: 100,
      competitiveReportCadenceHours: 48,
      competitiveReportAllowNational: true,
      businessHours: {},
      thresholds: {},
      zenrowsFallbackEnabled: false,
      zenrowsMaxCallsPerMinute: 6,
      zenrowsMaxCallsPerHour: 120,
      updatedAt: new Date(),
    };

    __chain.returning.mockResolvedValueOnce([createdRow]);

    const created = await s.upsertDealershipAutomationSettings(1, { competitiveReportCadenceHours: 72 } as any);
    expect(db.insert).toHaveBeenCalled();
    expect(created.dealershipId).toBe(1);

    // Second call: row exists, update path
    __chain.limit.mockResolvedValueOnce([createdRow]);
    const updatedRow = { ...createdRow, competitiveReportCadenceHours: 72 };
    __chain.returning.mockResolvedValueOnce([updatedRow]);

    const updated = await s.upsertDealershipAutomationSettings(1, { competitiveReportCadenceHours: 72 } as any);
    expect(db.update).toHaveBeenCalled();
    expect(updated.competitiveReportCadenceHours).toBe(72);
  });
});
