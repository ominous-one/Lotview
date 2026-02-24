import { storage } from '../storage';
import bcrypt from 'bcryptjs';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

export async function fetchWithTimeout(
  url: string, 
  options?: RequestInit, 
  timeout = 10000
): Promise<{ status: number; body: string; headers: Headers }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    clearTimeout(timeoutId);
    return { status: response.status, body, headers: response.headers };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function authenticatedFetch(
  url: string, 
  authToken: string, 
  options?: RequestInit
): Promise<{ status: number; body: string }> {
  const isJwt = authToken.startsWith('Bearer ');
  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>
  };
  
  if (isJwt) {
    headers['Authorization'] = authToken;
  } else {
    headers['Cookie'] = authToken;
  }
  
  const { status, body } = await fetchWithTimeout(url, {
    ...options,
    headers
  });
  return { status, body };
}

export async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
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

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function printTestResults(results: TestResult[]): { passed: number; failed: number } {
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

  return { passed, failed };
}

export interface TestUser {
  id: number;
  email: string;
  password: string;
  role: string;
  dealershipId: number;
  sessionCookie?: string;
}

export interface TestDealership {
  id: number;
  name: string;
  slug: string;
}

const TEST_PASSWORD = 'TestPassword123!';

export async function seedTestDealership(name: string, slug: string): Promise<TestDealership> {
  const existing = await storage.getDealershipBySlug(slug);
  if (existing) {
    return { id: existing.id, name: existing.name, slug: existing.slug };
  }
  
  const dealership = await storage.createDealership({
    name,
    slug,
    subdomain: slug,
    address: '123 Test St',
    city: 'Test City',
    province: 'ON',
    postalCode: 'A1B2C3',
    phone: '555-555-5555',
    isActive: true
  });
  
  return { id: dealership.id, name: dealership.name, slug: dealership.slug };
}

export async function seedTestUser(
  dealershipId: number, 
  email: string, 
  role: string = 'manager',
  name: string = 'Test User'
): Promise<TestUser> {
  const existing = await storage.getUserByEmail(email);
  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      password: TEST_PASSWORD,
      role: existing.role,
      dealershipId: existing.dealershipId ?? dealershipId
    };
  }
  
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const user = await storage.createUser({
    email,
    passwordHash,
    role,
    dealershipId,
    name,
    isActive: true
  });
  
  return {
    id: user.id,
    email: user.email,
    password: TEST_PASSWORD,
    role: user.role,
    dealershipId: user.dealershipId ?? dealershipId
  };
}

export async function loginAs(email: string, password: string): Promise<string | null> {
  const { status, body, headers } = await fetchWithTimeout(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include'
  });
  
  if (status !== 200) {
    console.error(`Login failed for ${email}: ${status} - ${body}`);
    return null;
  }
  
  try {
    const data = JSON.parse(body);
    if (data.token) {
      return `Bearer ${data.token}`;
    }
  } catch (e) {
    console.error(`Failed to parse login response: ${e}`);
  }
  
  const setCookie = headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/connect\.sid=[^;]+/);
    return match ? match[0] : null;
  }
  
  return null;
}

export async function logout(cookie: string): Promise<boolean> {
  try {
    const { status } = await authenticatedFetch(`${BASE_URL}/api/logout`, cookie, {
      method: 'POST'
    });
    return status === 200 || status === 204;
  } catch {
    return false;
  }
}

export async function seedTestData(): Promise<{
  dealership1: TestDealership;
  dealership2: TestDealership;
  user1: TestUser;
  user2: TestUser;
}> {
  const dealership1 = await seedTestDealership('Test Dealership Alpha', 'test-alpha');
  const dealership2 = await seedTestDealership('Test Dealership Beta', 'test-beta');
  
  const user1 = await seedTestUser(dealership1.id, 'test_alpha@test.com', 'manager', 'Alpha Manager');
  const user2 = await seedTestUser(dealership2.id, 'test_beta@test.com', 'manager', 'Beta Manager');
  
  return { dealership1, dealership2, user1, user2 };
}

export async function seedVehicleForDealership(dealershipId: number, stockNumber: string): Promise<any> {
  const existing = await storage.getVehicleByVin(`TESTVIN${stockNumber}`, dealershipId);
  if (existing) {
    return existing;
  }
  
  const vehicle = await storage.createVehicle({
    dealershipId,
    stockNumber,
    year: 2024,
    make: 'TestMake',
    model: 'TestModel',
    trim: 'Base',
    type: 'Used',
    price: 25000,
    odometer: 10000,
    vin: `TESTVIN${stockNumber}`,
    images: [],
    badges: [],
    location: 'Test Location',
    dealership: 'Test Dealership',
    description: 'Test vehicle for integration tests',
    exteriorColor: 'White',
    interiorColor: 'Black',
    transmission: 'Automatic',
    drivetrain: 'AWD',
    fuelType: 'Gasoline'
  });
  
  return vehicle;
}

export async function cleanupTestUser(email: string): Promise<void> {
  const user = await storage.getUserByEmail(email);
  if (user) {
    await storage.deleteUser(user.id);
  }
}

export async function cleanupTestVehicle(vin: string, dealershipId: number): Promise<void> {
  const vehicle = await storage.getVehicleByVin(vin, dealershipId);
  if (vehicle) {
    await storage.deleteVehicle(vehicle.id, dealershipId);
  }
}
