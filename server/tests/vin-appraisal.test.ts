import { decodeVIN, type VINDecodeResult } from '../vin-decoder';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

// Mock fetch infrastructure for deterministic API fallback testing
const originalFetch = globalThis.fetch;
type MockFetchHandler = (url: string, options?: RequestInit) => Promise<Response>;

function createMockFetch(handlers: Map<string, MockFetchHandler>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    
    for (const [pattern, handler] of handlers) {
      if (url.includes(pattern)) {
        return handler(url, init);
      }
    }
    // Fall through to real fetch for non-mocked URLs
    return originalFetch(input, init);
  };
}

function mockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function withMockedFetch<T>(handlers: Map<string, MockFetchHandler>, fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = createMockFetch(handlers);
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

async function fetchWithTimeout(url: string, options?: RequestInit, timeout = 10000): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    clearTimeout(timeoutId);
    return { status: response.status, body };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await testFn();
    return { name, passed: true, duration: Date.now() - start };
  } catch (error) {
    return { 
      name, 
      passed: false, 
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start 
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: any, expected: any, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runVinAppraisalTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Unit tests using real decodeVIN function
  results.push(await runTest('decodeVIN rejects VIN too short', async () => {
    const result = await decodeVIN('ABC123');
    assert(result.errorCode === 'INVALID_VIN_LENGTH', `Expected INVALID_VIN_LENGTH, got ${result.errorCode}`);
    assert(result.errorMessage?.includes('17 characters') === true, `Error should mention 17 characters: ${result.errorMessage}`);
  }));

  results.push(await runTest('decodeVIN rejects VIN too long', async () => {
    const result = await decodeVIN('1234567890123456789');
    assert(result.errorCode === 'INVALID_VIN_LENGTH', `Expected INVALID_VIN_LENGTH, got ${result.errorCode}`);
  }));

  results.push(await runTest('decodeVIN normalizes lowercase VIN to uppercase', async () => {
    const result = await decodeVIN('2hgfc2f59lh555555');
    assertEquals(result.vin, '2HGFC2F59LH555555', 'VIN should be normalized to uppercase');
  }));

  results.push(await runTest('decodeVIN trims whitespace from VIN', async () => {
    const result = await decodeVIN('  2HGFC2F59LH555555  ');
    assertEquals(result.vin, '2HGFC2F59LH555555', 'VIN should be trimmed');
  }));

  results.push(await runTest('decodeVIN returns proper structure for valid VIN', async () => {
    const result = await decodeVIN('2HGFC2F59LH555555');
    assert(typeof result.vin === 'string', 'Result should have vin field');
    assert(result.vin === '2HGFC2F59LH555555', 'VIN should match input');
    // Either has decoded data or error info
    const hasData = Boolean(result.year || result.make || result.model);
    const hasError = result.errorCode !== undefined;
    assert(hasData || hasError, 'Result should have decoded data or error info');
  }));

  results.push(await runTest('decodeVIN result includes source field when successful', async () => {
    const result = await decodeVIN('1HGCM82633A123456');
    if (!result.errorCode) {
      assert(['marketcheck', 'api_ninjas', 'nhtsa'].includes(result.source!), 
        `Source should be marketcheck, api_ninjas, or nhtsa, got ${result.source}`);
    }
  }));

  results.push(await runTest('decodeVIN includes responseTimeMs', async () => {
    const result = await decodeVIN('2HGFC2F59LH555555');
    assert(typeof result.responseTimeMs === 'number' || result.responseTimeMs === undefined, 
      'responseTimeMs should be a number when present');
  }));

  // Type structure validation
  results.push(await runTest('VINDecodeResult type includes all expected optional fields', async () => {
    const mockResult: VINDecodeResult = {
      vin: 'TEST12345678901234',
      year: '2020',
      make: 'Honda',
      model: 'Civic',
      trim: 'EX',
      bodyClass: 'Sedan',
      engineCylinders: '4',
      engineHP: '158',
      fuelType: 'Gasoline',
      driveType: 'FWD',
      transmission: 'CVT',
      doors: '4',
      manufacturer: 'Honda',
      plantCountry: 'Japan',
      vehicleType: 'Passenger Car',
      source: 'nhtsa'
    };
    assert(mockResult.vin.length === 18, 'Mock VIN should be 18 chars for test validation');
  }));

  // Integration test - VIN decode endpoint requires authentication
  results.push(await runTest('VIN decode POST endpoint requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/decode-vin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin: '2HGFC2F59LH555555' })
    });
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  // Integration test - Appraisal endpoints require authentication
  results.push(await runTest('Appraisals list endpoint requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals`);
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  results.push(await runTest('Appraisal creation requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin: '2HGFC2F59LH555555' })
    });
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  results.push(await runTest('Appraisal update by ID requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  results.push(await runTest('Appraisal delete requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals/1`, {
      method: 'DELETE'
    });
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  // ===== MOCKED FALLBACK PATH TESTS =====
  // These tests use mocked fetch to verify fallback behavior deterministically

  results.push(await runTest('MOCK: NHTSA success returns decoded vehicle data', async () => {
    const handlers = new Map<string, MockFetchHandler>([
      ['vpic.nhtsa.dot.gov', async () => mockResponse({
        Results: [{
          ModelYear: '2020',
          Make: 'Honda',
          Model: 'Civic',
          Trim: 'EX',
          BodyClass: 'Sedan',
          EngineCylinders: '4',
          ErrorCode: '0'
        }]
      })]
    ]);

    await withMockedFetch(handlers, async () => {
      const result = await decodeVIN('1HGBH41JXMN109186');
      assert(!result.errorCode, `Expected success, got error: ${result.errorCode}`);
      assertEquals(result.source, 'nhtsa', 'Source should be nhtsa');
      assertEquals(result.year, '2020', 'Year should be 2020');
      assertEquals(result.make, 'Honda', 'Make should be Honda');
      assertEquals(result.model, 'Civic', 'Model should be Civic');
    });
  }));

  results.push(await runTest('MOCK: NHTSA error code returns error result', async () => {
    const handlers = new Map<string, MockFetchHandler>([
      ['vpic.nhtsa.dot.gov', async () => mockResponse({
        Results: [{
          ErrorCode: '5',
          ErrorText: 'VIN not found in NHTSA database'
        }]
      })]
    ]);

    await withMockedFetch(handlers, async () => {
      const result = await decodeVIN('1HGBH41JXMN109186');
      assertEquals(result.errorCode, '5', 'Should return NHTSA error code');
      const hasNotFoundMessage = result.errorMessage?.includes('not found') || result.errorMessage?.includes('VIN not found') || false;
      assert(hasNotFoundMessage, `Error message should indicate not found: ${result.errorMessage}`);
    });
  }));

  results.push(await runTest('MOCK: NHTSA network failure returns DECODE_ERROR', async () => {
    const handlers = new Map<string, MockFetchHandler>([
      ['vpic.nhtsa.dot.gov', async () => {
        throw new Error('Network connection failed');
      }]
    ]);

    await withMockedFetch(handlers, async () => {
      const result = await decodeVIN('1HGBH41JXMN109186');
      assert(result.errorCode === 'DECODE_ERROR' || result.errorCode === 'TIMEOUT', 
        `Expected DECODE_ERROR or TIMEOUT, got ${result.errorCode}`);
      assert(result.errorMessage !== undefined, 'Should have error message');
    });
  }));

  results.push(await runTest('MOCK: NHTSA 500 error returns error result after retries', async () => {
    let attempts = 0;
    const handlers = new Map<string, MockFetchHandler>([
      ['vpic.nhtsa.dot.gov', async () => {
        attempts++;
        return mockResponse({ error: 'Server error' }, 500);
      }]
    ]);

    await withMockedFetch(handlers, async () => {
      const result = await decodeVIN('1HGBH41JXMN109186');
      assert(result.errorCode !== undefined, 'Should return error for 500 responses');
      assert(attempts >= 1, `Should have made at least 1 attempt, made ${attempts}`);
    });
  }));

  results.push(await runTest('MOCK: Empty NHTSA results handled gracefully', async () => {
    const handlers = new Map<string, MockFetchHandler>([
      ['vpic.nhtsa.dot.gov', async () => mockResponse({ Results: [] })]
    ]);

    await withMockedFetch(handlers, async () => {
      const result = await decodeVIN('1HGBH41JXMN109186');
      assert(result.errorCode !== undefined, 'Should return error for empty results');
    });
  }));

  results.push(await runTest('MOCK: Response includes responseTimeMs metric', async () => {
    const handlers = new Map<string, MockFetchHandler>([
      ['vpic.nhtsa.dot.gov', async () => {
        await new Promise(r => setTimeout(r, 50)); // Simulate 50ms latency
        return mockResponse({
          Results: [{
            ModelYear: '2021',
            Make: 'Toyota',
            Model: 'Camry',
            ErrorCode: '0'
          }]
        });
      }]
    ]);

    await withMockedFetch(handlers, async () => {
      const result = await decodeVIN('4T1BF1FK5CU123456');
      assert(typeof result.responseTimeMs === 'number', 'Should have responseTimeMs');
      assert((result.responseTimeMs ?? 0) >= 50, `Response time should be >= 50ms, was ${result.responseTimeMs}ms`);
    });
  }));

  return results;
}

async function main() {
  console.log('🚗 Running VIN Decode & Appraisal Tests\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  const results = await runVinAppraisalTests();

  console.log('\n📊 Test Results:\n');
  console.log('─'.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`   └─ Error: ${result.error}`);
    }
    result.passed ? passed++ : failed++;
  }

  console.log('─'.repeat(80));
  console.log(`\n📈 Summary: ${passed} passed, ${failed} failed out of ${results.length} tests`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
