describe('runtime readiness', () => {
  const originalEnv = { ...process.env };
  let existsSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    existsSyncSpy = jest.spyOn(require('node:fs'), 'existsSync');
  });

  afterEach(() => {
    existsSyncSpy?.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('marks web runtime unhealthy when required env or static bundle is missing', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    existsSyncSpy.mockReturnValue(false);

    const { collectRuntimeReadiness } = await import('../runtime-readiness');
    const report = collectRuntimeReadiness('web');

    expect(report.overallStatus).toBe('not_ready');
    expect(report.checks.env.status).toBe('unhealthy');
    expect(report.checks.database_config.status).toBe('unhealthy');
    expect(report.checks.static_bundle.status).toBe('unhealthy');
  });

  it('treats worker scheduler disablement as warning instead of hard failure', async () => {
    process.env.DATABASE_URL = 'postgres://example';
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.LOTVIEW_ENABLE_SCHEDULERS = 'false';
    process.env.LOTVIEW_SCHEDULER_PROCESS = 'worker';

    const { collectRuntimeReadiness } = await import('../runtime-readiness');
    const report = collectRuntimeReadiness('worker');

    expect(report.overallStatus).toBe('healthy');
    expect(report.checks.scheduler_configuration.status).toBe('warning');
  });

  it('accepts DATABASE_URL-backed worker runtime even when migrations are absent from bundle', async () => {
    process.env.DATABASE_URL = 'postgres://example';
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.LOTVIEW_ENABLE_SCHEDULERS = 'true';
    process.env.LOTVIEW_SCHEDULER_PROCESS = 'worker';
    existsSyncSpy.mockReturnValue(false);

    const { collectRuntimeReadiness } = await import('../runtime-readiness');
    const report = collectRuntimeReadiness('worker');

    expect(report.overallStatus).toBe('healthy');
    expect(report.checks.database_config.status).toBe('healthy');
    expect(report.checks.migrations.status).toBe('warning');
    expect(report.checks.scheduler_configuration.status).toBe('healthy');
  });

  it('flags worker scheduler process drift as warning for scaled multi-tenant ops', async () => {
    process.env.DATABASE_URL = 'postgres://example';
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.LOTVIEW_ENABLE_SCHEDULERS = 'true';
    process.env.LOTVIEW_SCHEDULER_PROCESS = 'web';
    existsSyncSpy.mockReturnValue(true);

    const { collectRuntimeReadiness } = await import('../runtime-readiness');
    const report = collectRuntimeReadiness('worker');

    expect(report.overallStatus).toBe('healthy');
    expect(report.checks.scheduler_configuration.status).toBe('warning');
    expect(report.checks.scheduler_configuration.detail).toContain('expected LOTVIEW_SCHEDULER_PROCESS=worker');
  });
});
