import fs from 'fs';
import path from 'path';

// NOTE: This is a unit-style test that mocks Drizzle/db but exercises the test-mode mail-sink path.

describe('WS4E email outbox worker (test mode)', () => {
  const sinkDir = path.resolve(process.cwd(), 'artifacts', 'mail-sink');

  beforeEach(() => {
    process.env.NOTIFICATIONS_TEST_MODE = 'true';
    fs.rmSync(sinkDir, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.NOTIFICATIONS_TEST_MODE;
  });

  test('suppresses send and writes a mail-sink message', async () => {
    jest.resetModules();

    const row = {
      id: 'outbox-1',
      dealershipId: 1,
      notificationId: 'notif-1',
      sendKey: 'k1',
      toEmail: 'manager@example.com',
      toUserId: 123,
      subject: 'Subject',
      html: '<b>Hi</b>',
      text: 'Hi',
      status: 'PENDING',
      attemptCount: 0,
      maxAttempts: 8,
      nextAttemptAt: new Date(0),
      updatedAt: new Date(0),
      createdAt: new Date(0),
      sentAt: null,
      lastError: null,
      providerMessageId: null,
    };

    const updates: any[] = [];

    jest.doMock('../db', () => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: async () => [row],
              }),
            }),
          }),
        }),
        update: () => ({
          set: (values: any) => ({
            where: async () => {
              updates.push(values);
              return [];
            },
          }),
        }),
      };

      return {
        db: {
          transaction: async (fn: any) => fn(tx),
        },
      };
    });

    jest.doMock('@shared/schema', () => {
      // Minimal column stubs used by eq/lte/sql builders.
      const emailOutbox = {
        id: 'id',
        status: 'status',
        nextAttemptAt: 'next_attempt_at',
        attemptCount: 'attempt_count',
        maxAttempts: 'max_attempts',
      };
      return { emailOutbox };
    });

    // sendEmail should never be called in test mode.
    jest.doMock('../email-service', () => ({
      sendEmail: async () => {
        throw new Error('sendEmail should not be called in NOTIFICATIONS_TEST_MODE');
      },
    }));

    const { processEmailOutboxBatch } = await import('../notifications/email-outbox-worker');

    const result = await processEmailOutboxBatch(10);

    expect(result.processed).toBe(1);
    expect(result.suppressed).toBe(1);

    const files = fs.existsSync(sinkDir) ? fs.readdirSync(sinkDir) : [];
    expect(files.length).toBe(1);

    const message = JSON.parse(fs.readFileSync(path.join(sinkDir, files[0]), 'utf8'));
    expect(message.to).toBe(row.toEmail);
    expect(message.subject).toContain('[TEST MODE]');
    expect(message.meta.outboxId).toBe(row.id);

    // Ensure we wrote an update that sets SUPPRESSED_TEST_MODE.
    expect(updates.some((u) => u.status === 'SUPPRESSED_TEST_MODE')).toBe(true);
  });
});
