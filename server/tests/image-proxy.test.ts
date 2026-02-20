import http from 'http';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

async function fetchWithTimeout(url: string, timeout = 5000): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
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

async function runImageProxyTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('Missing URL parameter returns 400', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/public/image-proxy`);
    assert(status === 400, `Expected 400, got ${status}`);
    assert(body.includes('Missing url parameter'), `Expected error message, got: ${body}`);
  }));

  results.push(await runTest('Invalid URL format returns 400', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/public/image-proxy?url=not-a-valid-url`);
    assert(status === 400, `Expected 400, got ${status}`);
    assert(body.includes('Invalid URL'), `Expected 'Invalid URL' error, got: ${body}`);
  }));

  results.push(await runTest('HTTP URLs are blocked (HTTPS only)', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=http://autotrader.ca/image.jpg`
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(body.includes('Only HTTPS URLs allowed'), `Expected HTTPS error, got: ${body}`);
  }));

  results.push(await runTest('Disallowed domain is blocked - localhost', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://localhost/image.jpg`
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(body.includes('Domain not allowed'), `Expected domain error, got: ${body}`);
  }));

  results.push(await runTest('Disallowed domain is blocked - 127.0.0.1', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://127.0.0.1/image.jpg`
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(body.includes('Domain not allowed'), `Expected domain error, got: ${body}`);
  }));

  results.push(await runTest('Disallowed domain is blocked - internal IPs', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://192.168.1.1/image.jpg`
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(body.includes('Domain not allowed'), `Expected domain error, got: ${body}`);
  }));

  results.push(await runTest('Disallowed domain is blocked - arbitrary external domain', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://evil.com/image.jpg`
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(body.includes('Domain not allowed'), `Expected domain error, got: ${body}`);
  }));

  results.push(await runTest('Domain bypass attempt via @ symbol blocked', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://evil.com@autotrader.ca/image.jpg`
    );
    assert(status === 403 || status === 500, `Expected 403 or 500 (URL with credentials rejected), got ${status}: ${body}`);
  }));

  results.push(await runTest('Subdomain spoofing attempt blocked', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://autotrader.ca.evil.com/image.jpg`
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(body.includes('Domain not allowed'), `Expected domain error, got: ${body}`);
  }));

  results.push(await runTest('Valid autotrader.ca subdomain is allowed', async () => {
    const { status } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://1s-photomanager-prd.autotradercdn.ca/test.jpg`
    );
    assert(status !== 403, `Expected non-403 status (image may not exist, but domain should be allowed), got ${status}`);
  }));

  results.push(await runTest('Valid cargurus domain is allowed', async () => {
    const { status } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=https://www.cargurus.ca/images/test.jpg`
    );
    assert(status !== 403, `Expected non-403 status (domain allowed), got ${status}`);
  }));

  results.push(await runTest('File URL scheme is blocked', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=file:///etc/passwd`
    );
    assert(status === 400 || status === 403, `Expected 400 or 403, got ${status}: ${body}`);
  }));

  results.push(await runTest('Data URL scheme is blocked', async () => {
    const { status, body } = await fetchWithTimeout(
      `${BASE_URL}/api/public/image-proxy?url=data:text/html,<script>alert(1)</script>`
    );
    assert(status === 400 || status === 403, `Expected 400 or 403, got ${status}: ${body}`);
  }));

  return results;
}

async function main() {
  console.log('🔒 Running Image Proxy SSRF Protection Tests\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  const results = await runImageProxyTests();

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
