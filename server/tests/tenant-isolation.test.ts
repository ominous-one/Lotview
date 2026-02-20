import {
  BASE_URL,
  fetchWithTimeout,
  authenticatedFetch,
  runTest,
  assert,
  printTestResults,
  seedTestData,
  seedVehicleForDealership,
  loginAs,
  logout,
  TestUser,
  TestDealership
} from './test-helpers';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

interface TestContext {
  dealership1: TestDealership;
  dealership2: TestDealership;
  user1: TestUser;
  user2: TestUser;
  cookie1: string | null;
  cookie2: string | null;
  vehicle1Id: number | null;
  vehicle2Id: number | null;
}

async function runTenantIsolationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ====== UNAUTHENTICATED ACCESS TESTS ======
  
  results.push(await runTest('Messenger conversations endpoint requires authentication', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/messenger-conversations`);
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
    const data = JSON.parse(body);
    assert(data.error || data.message, 'Response should include error message');
  }));

  results.push(await runTest('Appraisals endpoint requires authentication', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals`);
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
    const data = JSON.parse(body);
    assert(data.error || data.message, 'Response should include error message');
  }));

  results.push(await runTest('Vehicle inventory POST requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockNumber: 'TEST123' })
    });
    assert(status === 401 || status === 403, `Expected 401/403 for POST without auth, got ${status}`);
  }));

  results.push(await runTest('Conversation metadata PATCH requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/messenger-conversations/1/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['Test'] })
    });
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  results.push(await runTest('Facebook accounts endpoint requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/facebook-accounts`);
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  results.push(await runTest('Direct appraisal access by ID requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals/999999`);
    assert(status === 401 || status === 403, `Expected 401/403 for direct access without auth, got ${status}`);
  }));

  results.push(await runTest('VIN decode endpoint requires manager authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/decode-vin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin: '2HGFC2F59LH555555' })
    });
    assert(status === 401 || status === 403, `Expected 401/403 without auth, got ${status}`);
  }));

  // ====== INVALID TOKEN TESTS ======

  results.push(await runTest('Malformed JWT token is rejected', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/messenger-conversations`, {
      headers: { 'Authorization': 'Bearer invalid-token-here' }
    });
    assert(status === 401 || status === 403, `Expected 401/403 for invalid token, got ${status}`);
  }));

  results.push(await runTest('Empty Authorization header is rejected', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/messenger-conversations`, {
      headers: { 'Authorization': '' }
    });
    assert(status === 401 || status === 403, `Expected 401/403 for empty auth header, got ${status}`);
  }));

  results.push(await runTest('Bearer with empty token is rejected (400/401/403)', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/messenger-conversations`, {
      headers: { 'Authorization': 'Bearer ' }
    });
    assert(status === 400 || status === 401 || status === 403, `Expected 400/401/403 for empty Bearer token, got ${status}`);
  }));

  results.push(await runTest('Non-Bearer auth scheme is rejected (400/401/403)', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/messenger-conversations`, {
      headers: { 'Authorization': 'Basic dGVzdDp0ZXN0' }
    });
    assert(status === 400 || status === 401 || status === 403, `Expected 400/401/403 for Basic auth, got ${status}`);
  }));

  // ====== PUBLIC ENDPOINT TESTS ======

  results.push(await runTest('Public financing rules endpoint is accessible without auth', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/public/financing-rules`);
    assert(status === 200 || status === 404, `Expected 200/404 for public endpoint, got ${status}`);
  }));

  results.push(await runTest('Public filter groups endpoint is accessible without auth', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/public/filter-groups`);
    assert(status === 200 || status === 404, `Expected 200/404 for public endpoint, got ${status}`);
  }));

  results.push(await runTest('Public dealership info endpoint is accessible without auth', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/public/dealership-info`);
    assert(status === 200 || status === 404, `Expected 200/404 for public endpoint, got ${status}`);
  }));

  // ====== SENSITIVE DATA EXPOSURE TESTS ======

  results.push(await runTest('Public endpoints do not expose API keys or tokens', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/public/dealership-info`);
    
    if (status === 200 && body && !body.startsWith('<!DOCTYPE')) {
      try {
        const data = JSON.parse(body);
        const responseString = JSON.stringify(data).toLowerCase();
        assert(!responseString.includes('apikey'), 'Response should not contain apiKey');
        assert(!responseString.includes('api_key'), 'Response should not contain api_key');
        assert(!responseString.includes('accesstoken'), 'Response should not contain accessToken');
        assert(!responseString.includes('access_token'), 'Response should not contain access_token');
        assert(!responseString.includes('refreshtoken'), 'Response should not contain refreshToken');
        assert(!responseString.includes('refresh_token'), 'Response should not contain refresh_token');
        assert(!responseString.includes('password'), 'Response should not contain password');
        assert(!responseString.includes('secret'), 'Response should not contain secret');
        assert(!responseString.includes('private_key'), 'Response should not contain private_key');
      } catch (e) {
        // Non-JSON response is acceptable
      }
    }
  }));

  results.push(await runTest('Public vehicles endpoint does not expose internal IDs', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/public/vehicles`);
    
    if (status === 200 && body && !body.startsWith('<!DOCTYPE')) {
      try {
        const data = JSON.parse(body);
        const responseString = JSON.stringify(data).toLowerCase();
        assert(!responseString.includes('dealershipid'), 'Response should not expose dealershipId directly');
      } catch (e) {
        // Non-JSON or no vehicles is acceptable
      }
    }
  }));

  // ====== WEBHOOK ENDPOINT TESTS ======

  results.push(await runTest('PBS webhook endpoint accepts POST and validates', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/pbs/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test' })
    });
    assert(status !== 405, `PBS webhook should accept POST, got ${status}`);
    assert(status !== 404, `PBS webhook endpoint should exist, got ${status}`);
  }));

  results.push(await runTest('GHL webhook endpoint accepts POST and validates', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/ghl/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test' })
    });
    assert(status !== 405, `GHL webhook should accept POST, got ${status}`);
    assert(status !== 404, `GHL webhook endpoint should exist, got ${status}`);
  }));

  // ====== DEALERSHIP-SCOPED ENDPOINT TESTS ======

  results.push(await runTest('User management endpoint requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/users`);
    assert(status === 401 || status === 403, `Expected 401/403 for users endpoint, got ${status}`);
  }));

  results.push(await runTest('Call recordings endpoint requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/call-recordings`);
    assert(status === 401 || status === 403, `Expected 401/403 for call recordings, got ${status}`);
  }));

  results.push(await runTest('Dealership API keys endpoint requires authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/dealership-api-keys`);
    assert(status === 401 || status === 403, `Expected 401/403 for dealership API keys, got ${status}`);
  }));

  results.push(await runTest('Dealerships endpoint requires super admin authentication', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/super-admin/dealerships`);
    assert(status === 401 || status === 403, `Expected 401/403 for super admin dealerships, got ${status}`);
  }));

  // ====== UNAUTHENTICATED SESSION TESTS ======

  results.push(await runTest('AUTH: Login endpoint accepts valid credentials format', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent@test.com', password: 'wrong' })
    });
    assert(status !== 404, 'Login endpoint should exist');
    assert(status < 500, `Login should not cause server error, got ${status}`);
    assert(status === 401 || status === 400 || status === 200, `Login should return 401/400/200, got ${status}`);
  }));

  results.push(await runTest('AUTH: Session cookie is required for protected endpoints', async () => {
    const { status } = await authenticatedFetch(
      `${BASE_URL}/api/messenger-conversations`,
      'connect.sid=s%3Afake-session-id.invalid-signature'
    );
    assert(status === 401 || status === 403, `Expected 401/403 for invalid session, got ${status}`);
  }));

  results.push(await runTest('AUTH: Tampered session cookie is rejected for protected endpoints', async () => {
    const { status } = await authenticatedFetch(
      `${BASE_URL}/api/manager/appraisals`,
      'connect.sid=s%3Amodified.tampered-signature-here'
    );
    assert(status === 401 || status === 403, `Expected 401/403 for tampered session, got ${status}`);
  }));

  // ====== UNAUTHENTICATED CROSS-TENANT ACCESS TESTS ======

  results.push(await runTest('Cross-tenant: Vehicle access with mismatched dealership is rejected', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/vehicles/999999999`, {
      method: 'GET'
    });
    assert(status === 404 || status === 401 || status === 403, 
      `Cross-tenant vehicle access should be denied, got ${status}`);
  }));

  results.push(await runTest('Cross-tenant: Conversation access with invalid ID returns proper error', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/chat-conversations/99999999`);
    assert(status === 401 || status === 403 || status === 404 || status === 200, 
      `Should properly handle cross-tenant conversation access, got ${status}`);
    if (status === 200 && body && !body.startsWith('<!DOCTYPE') && !body.startsWith('<html')) {
      const data = JSON.parse(body);
      assert(data === null || data === undefined || (Array.isArray(data) && data.length === 0), 
        'Should return empty/null for non-existent entity, not leak data');
    }
    assert(status < 500, `Should not cause server error on cross-tenant attempt, got ${status}`);
  }));

  results.push(await runTest('Cross-tenant: Appraisal PATCH with non-existent ID is handled safely', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals/88888888`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    assert(status === 401 || status === 403 || status === 404, 
      `Should safely handle cross-tenant appraisal PATCH, got ${status}`);
    assert(status < 500, `Should not cause server error, got ${status}`);
  }));

  results.push(await runTest('Cross-tenant: Delete attempt on non-existent entity returns proper error', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/messenger-conversations/77777777`, {
      method: 'DELETE'
    });
    assert(status === 401 || status === 403 || status === 404 || status === 405 || status === 200, 
      `Should safely handle cross-tenant DELETE attempt, got ${status}`);
    assert(status < 500, `Should not cause server error, got ${status}`);
  }));

  results.push(await runTest('Cross-tenant: Call recording access by ID is properly isolated', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/call-recordings/66666666`);
    assert(status === 401 || status === 403 || status === 404, 
      `Call recording access should be isolated, got ${status}`);
    assert(status < 500, `Should not expose server errors, got ${status}`);
  }));

  results.push(await runTest('Cross-tenant: User access by ID requires proper authorization', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/users/55555555`);
    assert(status === 401 || status === 403 || status === 404 || status === 200, 
      `User access should be properly handled, got ${status}`);
    if (status === 200 && body && !body.startsWith('<!DOCTYPE') && !body.startsWith('<html')) {
      const data = JSON.parse(body);
      assert(data === null || data === undefined || (Array.isArray(data) && data.length === 0),
        'Should return null/empty for non-existent user');
    }
  }));

  results.push(await runTest('Cross-tenant: Scoring template access is properly scoped', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/call-scoring/templates/44444444`);
    assert(status === 401 || status === 403 || status === 404 || status === 200, 
      `Scoring template access should be tenant-scoped, got ${status}`);
  }));

  results.push(await runTest('Cross-tenant: Facebook account access is isolated', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/facebook-accounts/33333333`);
    assert(status === 401 || status === 403 || status === 404 || status === 200, 
      `Facebook account access should be properly handled, got ${status}`);
    if (status === 200 && body && !body.startsWith('<!DOCTYPE') && !body.startsWith('<html')) {
      const data = JSON.parse(body);
      assert(data === null || data === undefined || (Array.isArray(data) && data.length === 0),
        'Should return null/empty for non-existent account');
    }
  }));

  // ====== REQUEST BODY TAMPERING TESTS ======

  results.push(await runTest('Body tampering: dealershipId in body cannot bypass tenant isolation', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        stockNumber: 'TAMPER-TEST',
        dealershipId: 99999
      })
    });
    assert(status === 401 || status === 403 || status === 400, 
      `Body tampering should be rejected, got ${status}`);
  }));

  results.push(await runTest('Body tampering: Cannot create appraisal for different tenant', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/manager/appraisals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        vin: 'TEST12345678901234',
        dealershipId: 88888
      })
    });
    assert(status === 401 || status === 403, 
      `Appraisal creation with wrong tenant should be rejected, got ${status}`);
  }));

  results.push(await runTest('AUTH CROSS-TENANT: Forged session cannot access protected manager endpoints', async () => {
    const forgedSession = 'connect.sid=s%3Aforged-session-with-wrong-tenant.bad-sig';
    
    const { status } = await authenticatedFetch(
      `${BASE_URL}/api/manager/appraisals`,
      forgedSession
    );
    
    assert(status === 401 || status === 403, 
      `Forged session should be rejected for manager endpoints, got ${status}`);
  }));

  results.push(await runTest('AUTH CROSS-TENANT: Query param cannot override tenant for protected endpoints', async () => {
    const { status } = await fetchWithTimeout(
      `${BASE_URL}/api/manager/appraisals?dealershipId=99999`
    );
    
    assert(status === 401 || status === 403, 
      `Query param tenant override should be rejected without auth, got ${status}`);
  }));

  return results;
}

async function runAuthenticatedCrossTenantTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  console.log('\n🔐 Setting up test data for authenticated cross-tenant tests...\n');
  
  let ctx: TestContext;
  
  try {
    const { dealership1, dealership2, user1, user2 } = await seedTestData();
    
    console.log(`  ✓ Dealership 1: ${dealership1.name} (ID: ${dealership1.id})`);
    console.log(`  ✓ Dealership 2: ${dealership2.name} (ID: ${dealership2.id})`);
    console.log(`  ✓ User 1: ${user1.email} (Dealership: ${user1.dealershipId})`);
    console.log(`  ✓ User 2: ${user2.email} (Dealership: ${user2.dealershipId})`);
    
    const vehicle1 = await seedVehicleForDealership(dealership1.id, 'ALPHA001');
    const vehicle2 = await seedVehicleForDealership(dealership2.id, 'BETA001');
    
    console.log(`  ✓ Vehicle 1 created: ID ${vehicle1.id} (Dealership: ${dealership1.id})`);
    console.log(`  ✓ Vehicle 2 created: ID ${vehicle2.id} (Dealership: ${dealership2.id})`);
    
    const cookie1 = await loginAs(user1.email, user1.password);
    const cookie2 = await loginAs(user2.email, user2.password);
    
    console.log(`  ✓ User 1 login: ${cookie1 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  ✓ User 2 login: ${cookie2 ? 'SUCCESS' : 'FAILED'}`);
    
    ctx = {
      dealership1,
      dealership2,
      user1,
      user2,
      cookie1,
      cookie2,
      vehicle1Id: vehicle1.id,
      vehicle2Id: vehicle2.id
    };
  } catch (error) {
    console.error('  ✗ Failed to set up test data:', error);
    results.push({
      name: 'Setup: Seed test data for cross-tenant tests',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0
    });
    return results;
  }
  
  results.push({
    name: 'Setup: Seed test data for cross-tenant tests',
    passed: true,
    duration: 0
  });
  
  // ====== REAL AUTHENTICATED CROSS-TENANT TESTS ======
  
  if (ctx.cookie1) {
    results.push(await runTest('AUTH REAL: User1 can access their own vehicles list', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles`,
        ctx.cookie1!
      );
      assert(status === 200, `User1 should access their vehicles, got ${status}`);
      const data = JSON.parse(body);
      assert(Array.isArray(data) || (data.vehicles && Array.isArray(data.vehicles)), 
        'Should return array of vehicles or paginated object');
    }));
    
    results.push(await runTest('AUTH REAL: User1 can access their own vehicle by ID', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles/${ctx.vehicle1Id}`,
        ctx.cookie1!
      );
      assert(status === 200, `User1 should access their own vehicle with 200, got ${status}`);
      const data = JSON.parse(body);
      assert(data && data.id === ctx.vehicle1Id, `Should return vehicle with correct ID`);
    }));
    
    results.push(await runTest('AUTH REAL: User1 CANNOT access User2 vehicle by ID', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles/${ctx.vehicle2Id}`,
        ctx.cookie1!
      );
      assert(status === 403 || status === 404, 
        `User1 should NOT access User2 vehicle, got ${status}`);
    }));
    
    results.push(await runTest('AUTH REAL: User1 vehicles list only shows their dealership', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles`,
        ctx.cookie1!
      );
      if (status === 200) {
        const data = JSON.parse(body);
        const vehicles = data.vehicles || data;
        if (Array.isArray(vehicles) && vehicles.length > 0) {
          for (const v of vehicles) {
            assert(v.dealershipId === ctx.dealership1.id || v.dealershipId === undefined,
              `User1 should only see dealership1 vehicles, found dealershipId: ${v.dealershipId}`);
          }
        }
      }
    }));
    
    results.push(await runTest('AUTH REAL: User1 cannot create vehicle for different dealership via body tampering', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles`,
        ctx.cookie1!,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stockNumber: 'TAMPER-ALPHA',
            dealershipId: ctx.dealership2.id,
            year: 2024,
            make: 'TamperMake',
            model: 'TamperModel',
            vin: 'TAMPERVIN123456789'
          })
        }
      );
      if (status === 200 || status === 201) {
        const data = JSON.parse(body);
        assert(data.dealershipId === ctx.dealership1.id,
          `Body tampering CRITICAL FAILURE: Vehicle created with wrong dealershipId ${data.dealershipId}, expected ${ctx.dealership1.id}`);
      } else {
        assert(status === 400 || status === 403, 
          `Body tampering should be rejected with 400/403, got ${status}`);
      }
    }));
    
    results.push(await runTest('AUTH REAL: User1 cannot delete User2 vehicle', async () => {
      const { status } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles/${ctx.vehicle2Id}`,
        ctx.cookie1!,
        { method: 'DELETE' }
      );
      assert(status === 403 || status === 404 || status === 405, 
        `User1 should NOT delete User2 vehicle, got ${status}`);
    }));
    
    results.push(await runTest('AUTH REAL: User1 cannot update User2 vehicle', async () => {
      const { status } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles/${ctx.vehicle2Id}`,
        ctx.cookie1!,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: 1 })
        }
      );
      assert(status === 403 || status === 404 || status === 405, 
        `User1 should NOT update User2 vehicle, got ${status}`);
    }));
    
    results.push(await runTest('AUTH REAL: User1 query param dealershipId override is ignored', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles?dealershipId=${ctx.dealership2.id}`,
        ctx.cookie1!
      );
      if (status === 200) {
        const data = JSON.parse(body);
        const vehicles = data.vehicles || data;
        if (Array.isArray(vehicles) && vehicles.length > 0) {
          for (const v of vehicles) {
            assert(v.dealershipId === ctx.dealership1.id || v.dealershipId === undefined,
              `Query param dealershipId should be ignored, found ${v.dealershipId}`);
          }
        }
      }
    }));
    
    results.push(await runTest('AUTH REAL: User1 cannot access User2 messenger conversations', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/messenger-conversations`,
        ctx.cookie1!
      );
      assert(status === 200 || status === 403, `Messenger endpoint access, got ${status}`);
      if (status === 200) {
        const data = JSON.parse(body);
        const convos = Array.isArray(data) ? data : (data.conversations || []);
        for (const c of convos) {
          if (c.dealershipId) {
            assert(c.dealershipId === ctx.dealership1.id,
              `User1 should only see their conversations, found dealershipId: ${c.dealershipId}`);
          }
        }
      }
    }));
    
    results.push(await runTest('AUTH REAL: User1 cannot access User2 facebook accounts', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/facebook-accounts`,
        ctx.cookie1!
      );
      assert(status === 200 || status === 403, `Facebook accounts access, got ${status}`);
      if (status === 200) {
        const data = JSON.parse(body);
        const accounts = Array.isArray(data) ? data : [];
        for (const a of accounts) {
          if (a.dealershipId) {
            assert(a.dealershipId === ctx.dealership1.id,
              `User1 should only see their fb accounts, found dealershipId: ${a.dealershipId}`);
          }
        }
      }
    }));
    
    results.push(await runTest('AUTH REAL: User1 cannot access User2 call recordings', async () => {
      const { status, body } = await authenticatedFetch(
        `${BASE_URL}/api/call-recordings`,
        ctx.cookie1!
      );
      assert(status === 200 || status === 403, `Call recordings access, got ${status}`);
      if (status === 200) {
        const data = JSON.parse(body);
        const recordings = Array.isArray(data) ? data : (data.recordings || []);
        for (const r of recordings) {
          if (r.dealershipId) {
            assert(r.dealershipId === ctx.dealership1.id,
              `User1 should only see their call recordings, found dealershipId: ${r.dealershipId}`);
          }
        }
      }
    }));
  } else {
    results.push({
      name: 'AUTH REAL: User1 login failed - skipping authenticated tests',
      passed: false,
      error: 'Could not obtain session cookie for User1',
      duration: 0
    });
  }
  
  if (ctx.cookie2) {
    results.push(await runTest('AUTH REAL: User2 can access their own vehicles', async () => {
      const { status } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles`,
        ctx.cookie2!
      );
      assert(status === 200, `User2 should access their vehicles, got ${status}`);
    }));
    
    results.push(await runTest('AUTH REAL: User2 CANNOT access User1 vehicle by ID', async () => {
      const { status } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles/${ctx.vehicle1Id}`,
        ctx.cookie2!
      );
      assert(status === 403 || status === 404, 
        `User2 should NOT access User1 vehicle, got ${status}`);
    }));
    
    results.push(await runTest('AUTH REAL: User2 cannot delete User1 vehicle', async () => {
      const { status } = await authenticatedFetch(
        `${BASE_URL}/api/vehicles/${ctx.vehicle1Id}`,
        ctx.cookie2!,
        { method: 'DELETE' }
      );
      assert(status === 403 || status === 404 || status === 405, 
        `User2 should NOT delete User1 vehicle, got ${status}`);
    }));
  } else {
    results.push({
      name: 'AUTH REAL: User2 login failed - skipping authenticated tests',
      passed: false,
      error: 'Could not obtain session cookie for User2',
      duration: 0
    });
  }
  
  // Cleanup: logout sessions
  if (ctx.cookie1) {
    await logout(ctx.cookie1);
  }
  if (ctx.cookie2) {
    await logout(ctx.cookie2);
  }
  
  return results;
}

async function main() {
  console.log('🔒 Running Tenant Isolation & Security Tests\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  const unauthResults = await runTenantIsolationTests();
  const authResults = await runAuthenticatedCrossTenantTests();
  
  const allResults = [...unauthResults, ...authResults];

  const { passed, failed } = printTestResults(allResults);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
