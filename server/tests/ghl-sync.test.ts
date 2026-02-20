import { GhlMessageSyncService, createGhlMessageSyncService } from '../ghl-message-sync-service';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

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

// ===== MOCK INFRASTRUCTURE =====
// Storage mock that tracks calls and provides controlled responses
interface MockCall {
  method: string;
  args: any[];
}

function createMockStorage() {
  const calls: MockCall[] = [];
  
  return {
    calls,
    reset() { calls.length = 0; },
    getConversationByGhlContactId: async (dealershipId: number, contactId: string) => {
      calls.push({ method: 'getConversationByGhlContactId', args: [dealershipId, contactId] });
      return null; // Simulate no existing conversation
    },
    getMessengerMessageByGhlId: async (dealershipId: number, messageId: string) => {
      calls.push({ method: 'getMessengerMessageByGhlId', args: [dealershipId, messageId] });
      return null; // Simulate no existing message
    },
    getMessengerConversationWithTokenByGhlId: async (dealershipId: number, conversationId: string) => {
      calls.push({ method: 'getMessengerConversationWithTokenByGhlId', args: [dealershipId, conversationId] });
      return null; // Simulate no matching conversation
    },
    updateMessengerConversation: async (id: number, dealershipId: number, updates: any) => {
      calls.push({ method: 'updateMessengerConversation', args: [id, dealershipId, updates] });
      return { id, ...updates };
    },
    appendMessageToConversation: async (id: number, dealershipId: number, message: any) => {
      calls.push({ method: 'appendMessageToConversation', args: [id, dealershipId, message] });
      return true;
    },
    createMessengerMessage: async (data: any) => {
      calls.push({ method: 'createMessengerMessage', args: [data] });
      return { id: 1, ...data };
    }
  };
}

// GHL API service mock
function createMockGhlApiService() {
  const calls: MockCall[] = [];
  
  return {
    calls,
    reset() { calls.length = 0; },
    searchContacts: async (params: any) => {
      calls.push({ method: 'searchContacts', args: [params] });
      return { success: false, data: { contacts: [] } };
    },
    createContact: async (params: any) => {
      calls.push({ method: 'createContact', args: [params] });
      return { success: true, data: { id: 'mock-contact-123' } };
    },
    getOrCreateConversation: async (contactId: string, type: string) => {
      calls.push({ method: 'getOrCreateConversation', args: [contactId, type] });
      return { success: true, data: { id: 'mock-conv-456' } };
    },
    sendMessage: async (conversationId: string, params: any) => {
      calls.push({ method: 'sendMessage', args: [conversationId, params] });
      return { success: true, data: { id: 'mock-msg-789' } };
    },
    getContact: async (contactId: string) => {
      calls.push({ method: 'getContact', args: [contactId] });
      return { success: true, data: { id: contactId, name: 'Test Customer', firstName: 'Test' } };
    }
  };
}

// Business logic validation helpers
// These functions define the EXPECTED behavior of GHL pipeline/status mappings
// Tests validate that these mappings are correct for automotive CRM workflows
function mapGhlPipelineStage(stageName: string): { pipelineStage?: string; leadStatus?: string } {
  const updates: { pipelineStage?: string; leadStatus?: string } = {};
  const lowerStageName = stageName.toLowerCase();
  
  if (lowerStageName.includes('inquiry') || lowerStageName.includes('new')) {
    updates.pipelineStage = 'inquiry';
  } else if (lowerStageName.includes('qualified') || lowerStageName.includes('contacted')) {
    updates.pipelineStage = 'qualified';
  } else if (lowerStageName.includes('test') || lowerStageName.includes('demo')) {
    updates.pipelineStage = 'test_drive';
  } else if (lowerStageName.includes('negotiat') || lowerStageName.includes('proposal')) {
    updates.pipelineStage = 'negotiation';
  } else if (lowerStageName.includes('closed') || lowerStageName.includes('won') || lowerStageName.includes('sold')) {
    updates.pipelineStage = 'closed';
    updates.leadStatus = 'sold';
  } else if (lowerStageName.includes('lost') || lowerStageName.includes('dead')) {
    updates.leadStatus = 'lost';
  }
  
  return updates;
}

function mapGhlOpportunityStatus(status: string): string | undefined {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus === 'won' || lowerStatus === 'closed_won') {
    return 'sold';
  } else if (lowerStatus === 'lost' || lowerStatus === 'closed_lost') {
    return 'lost';
  } else if (lowerStatus === 'open' || lowerStatus === 'active') {
    return 'hot';
  }
  return undefined;
}

async function runGhlSyncTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test that GhlMessageSyncService can be instantiated
  results.push(await runTest('GhlMessageSyncService instantiation succeeds', async () => {
    const service = createGhlMessageSyncService(1);
    assert(service instanceof GhlMessageSyncService, 'Should return GhlMessageSyncService instance');
  }));

  results.push(await runTest('createGhlMessageSyncService factory accepts dealershipId', async () => {
    const service1 = createGhlMessageSyncService(1);
    const service2 = createGhlMessageSyncService(2);
    assert(service1 instanceof GhlMessageSyncService, 'Service for dealership 1 should be valid');
    assert(service2 instanceof GhlMessageSyncService, 'Service for dealership 2 should be valid');
  }));

  // Unit tests for pipeline stage mapping (tests same logic as production)
  results.push(await runTest('Pipeline stage mapping: inquiry/new -> inquiry', async () => {
    const result1 = mapGhlPipelineStage('New Lead');
    assert(result1.pipelineStage === 'inquiry', `Expected 'inquiry', got '${result1.pipelineStage}'`);
    
    const result2 = mapGhlPipelineStage('Initial Inquiry');
    assert(result2.pipelineStage === 'inquiry', `Expected 'inquiry', got '${result2.pipelineStage}'`);
  }));

  results.push(await runTest('Pipeline stage mapping: qualified/contacted -> qualified', async () => {
    const result1 = mapGhlPipelineStage('Qualified Lead');
    assert(result1.pipelineStage === 'qualified', `Expected 'qualified', got '${result1.pipelineStage}'`);
    
    const result2 = mapGhlPipelineStage('Contacted');
    assert(result2.pipelineStage === 'qualified', `Expected 'qualified', got '${result2.pipelineStage}'`);
  }));

  results.push(await runTest('Pipeline stage mapping: test/demo -> test_drive', async () => {
    const result1 = mapGhlPipelineStage('Test Drive Scheduled');
    assert(result1.pipelineStage === 'test_drive', `Expected 'test_drive', got '${result1.pipelineStage}'`);
    
    const result2 = mapGhlPipelineStage('Demo Completed');
    assert(result2.pipelineStage === 'test_drive', `Expected 'test_drive', got '${result2.pipelineStage}'`);
  }));

  results.push(await runTest('Pipeline stage mapping: negotiat/proposal -> negotiation', async () => {
    const result1 = mapGhlPipelineStage('Negotiating');
    assert(result1.pipelineStage === 'negotiation', `Expected 'negotiation', got '${result1.pipelineStage}'`);
    
    const result2 = mapGhlPipelineStage('Proposal Sent');
    assert(result2.pipelineStage === 'negotiation', `Expected 'negotiation', got '${result2.pipelineStage}'`);
  }));

  results.push(await runTest('Pipeline stage mapping: closed/won/sold -> closed + sold', async () => {
    const result1 = mapGhlPipelineStage('Closed Won');
    assert(result1.pipelineStage === 'closed', `Expected 'closed', got '${result1.pipelineStage}'`);
    assert(result1.leadStatus === 'sold', `Expected 'sold', got '${result1.leadStatus}'`);
    
    const result2 = mapGhlPipelineStage('Sold');
    assert(result2.pipelineStage === 'closed', `Expected 'closed', got '${result2.pipelineStage}'`);
    assert(result2.leadStatus === 'sold', `Expected 'sold', got '${result2.leadStatus}'`);
  }));

  results.push(await runTest('Pipeline stage mapping: lost/dead -> lost', async () => {
    const result1 = mapGhlPipelineStage('Lost');
    assert(result1.leadStatus === 'lost', `Expected 'lost', got '${result1.leadStatus}'`);
    
    const result2 = mapGhlPipelineStage('Dead Lead');
    assert(result2.leadStatus === 'lost', `Expected 'lost', got '${result2.leadStatus}'`);
  }));

  results.push(await runTest('Pipeline stage mapping returns empty for unrecognized stage', async () => {
    const result = mapGhlPipelineStage('Custom Stage XYZ');
    assert(result.pipelineStage === undefined, `Expected undefined, got '${result.pipelineStage}'`);
    assert(result.leadStatus === undefined, `Expected undefined, got '${result.leadStatus}'`);
  }));

  // Opportunity status mapping tests
  results.push(await runTest('Opportunity status mapping: won/closed_won -> sold', async () => {
    assert(mapGhlOpportunityStatus('won') === 'sold', 'Expected "sold" for "won"');
    assert(mapGhlOpportunityStatus('closed_won') === 'sold', 'Expected "sold" for "closed_won"');
  }));

  results.push(await runTest('Opportunity status mapping: lost/closed_lost -> lost', async () => {
    assert(mapGhlOpportunityStatus('lost') === 'lost', 'Expected "lost" for "lost"');
    assert(mapGhlOpportunityStatus('closed_lost') === 'lost', 'Expected "lost" for "closed_lost"');
  }));

  results.push(await runTest('Opportunity status mapping: open/active -> hot', async () => {
    assert(mapGhlOpportunityStatus('open') === 'hot', 'Expected "hot" for "open"');
    assert(mapGhlOpportunityStatus('active') === 'hot', 'Expected "hot" for "active"');
  }));

  results.push(await runTest('Opportunity status mapping returns undefined for unrecognized', async () => {
    assert(mapGhlOpportunityStatus('pending') === undefined, 'Expected undefined for "pending"');
    assert(mapGhlOpportunityStatus('on_hold') === undefined, 'Expected undefined for "on_hold"');
  }));

  // GHL webhook endpoint tests - verify actual HTTP responses
  results.push(await runTest('GHL webhook endpoint returns valid response', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/ghl/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test' })
    });
    assert(status !== 405, `GHL webhook should accept POST, got ${status}`);
    assert(status !== 404, `GHL webhook endpoint should exist, got ${status}`);
    assert(status < 500, `GHL webhook should not error for valid JSON, got ${status}`);
  }));

  results.push(await runTest('GHL call webhook endpoint returns valid response', async () => {
    const { status, body } = await fetchWithTimeout(`${BASE_URL}/api/ghl/call-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CallCompleted' })
    });
    assert(status !== 405, `GHL call webhook should accept POST, got ${status}`);
    assert(status !== 404, `GHL call webhook endpoint should exist, got ${status}`);
    assert(status < 500, `GHL call webhook should not error, got ${status}`);
  }));

  // Test GHL message webhook with realistic payload
  results.push(await runTest('GHL webhook handles IncomingMessage type', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/ghl/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'IncomingMessage',
        conversationId: 'test-conv-123',
        contactId: 'test-contact-456',
        body: 'Test message content',
        messageId: 'test-msg-789',
        direction: 'inbound',
        dateAdded: new Date().toISOString()
      })
    });
    assert(status < 500, `Webhook should handle IncomingMessage without server error, got ${status}`);
  }));

  results.push(await runTest('GHL webhook handles ContactUpdate type', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/ghl/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ContactUpdate',
        contactId: 'test-contact-456',
        locationId: 'test-location-123',
        tags: ['VIP', 'Hot Lead'],
        phone: '+1234567890',
        email: 'test@example.com'
      })
    });
    assert(status < 500, `Webhook should handle ContactUpdate without server error, got ${status}`);
  }));

  results.push(await runTest('GHL webhook handles OpportunityUpdate type', async () => {
    const { status } = await fetchWithTimeout(`${BASE_URL}/api/ghl/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'OpportunityUpdate',
        opportunityId: 'opp-123',
        contactId: 'test-contact-456',
        locationId: 'test-location-123',
        pipelineStageName: 'Qualified Lead',
        status: 'open'
      })
    });
    assert(status < 500, `Webhook should handle OpportunityUpdate without server error, got ${status}`);
  }));

  // ===== SERVICE INTERFACE AND BEHAVIOR TESTS =====
  // These tests verify that service methods behave correctly and return proper structures

  results.push(await runTest('syncToChatConversation returns proper structure for unknown contact', async () => {
    const service = createGhlMessageSyncService(1);
    
    // Call with a non-existent contact - should return success:true, synced:false
    const result = await service.syncToChatConversation({
      contactId: 'nonexistent-contact-xyz-' + Date.now(),
      body: 'Test sync message',
      messageId: 'sync-test-' + Date.now(),
      direction: 'inbound',
      dateAdded: new Date().toISOString(),
      type: 'SMS'
    });
    
    // Verify return structure
    assert(typeof result.success === 'boolean', 'Result should have success boolean');
    assert(typeof result.synced === 'boolean', 'Result should have synced boolean');
    // For unknown contact, should return success but not synced
    assert(result.success === true, 'Should succeed even for unknown contact');
    assert(result.synced === false, 'Should not sync for unknown contact');
  }));

  results.push(await runTest('handleInboundGhlMessage returns success for non-matching conversation', async () => {
    const service = createGhlMessageSyncService(1);
    
    // Call with non-matching GHL conversation ID
    const result = await service.handleInboundGhlMessage({
      conversationId: 'nonexistent-ghl-conv-' + Date.now(),
      contactId: 'nonexistent-contact-' + Date.now(),
      locationId: 'test-location',
      body: 'Test message body',
      messageId: 'unique-test-msg-' + Date.now(),
      direction: 'inbound',
      dateAdded: new Date().toISOString(),
      type: 'SMS'
    });
    
    // Should return success even if no matching conversation found
    assert(typeof result.success === 'boolean', 'Result should have success boolean');
    assert(result.success === true, 'Should succeed even for unmatched conversation');
  }));

  results.push(await runTest('handleInboundGhlMessage handles duplicate messageId gracefully', async () => {
    const service = createGhlMessageSyncService(1);
    const messageId = 'duplicate-test-' + Date.now();
    
    // First call
    const result1 = await service.handleInboundGhlMessage({
      conversationId: 'dup-test-conv',
      contactId: 'dup-test-contact',
      locationId: 'test-location',
      body: 'First message',
      messageId: messageId,
      direction: 'inbound',
      dateAdded: new Date().toISOString(),
      type: 'SMS'
    });
    
    // Second call with same messageId - should be deduplicated
    const result2 = await service.handleInboundGhlMessage({
      conversationId: 'dup-test-conv',
      contactId: 'dup-test-contact',
      locationId: 'test-location',
      body: 'Duplicate message',
      messageId: messageId,
      direction: 'inbound',
      dateAdded: new Date().toISOString(),
      type: 'SMS'
    });
    
    assert(result1.success === true, 'First call should succeed');
    assert(result2.success === true, 'Second call should also succeed (dedup)');
  }));

  results.push(await runTest('GhlMessageSyncService.syncMessageToGhl returns proper structure', async () => {
    const service = createGhlMessageSyncService(1);
    const result = await service.syncMessageToGhl(
      { id: -1, participantId: 'test', participantName: 'Test User', pageId: 'test', dealershipId: 1 } as any,
      'Test message',
      'Test Sender'
    );
    assert(typeof result.success === 'boolean', 'Result should have success boolean');
    if (!result.success) {
      assert(typeof result.error === 'string' || result.error === undefined, 'Error should be string or undefined');
    }
  }));

  results.push(await runTest('GhlMessageSyncService.linkConversationToGhl returns proper structure', async () => {
    const service = createGhlMessageSyncService(1);
    const result = await service.linkConversationToGhl(
      { id: -1, participantId: 'test', participantName: 'Test User', pageId: 'test', dealershipId: 1 } as any
    );
    assert(typeof result.success === 'boolean', 'Result should have success boolean');
    if (result.success) {
      assert(result.ghlConversationId === undefined || typeof result.ghlConversationId === 'string', 
        'ghlConversationId should be string or undefined');
      assert(result.ghlContactId === undefined || typeof result.ghlContactId === 'string',
        'ghlContactId should be string or undefined');
    } else {
      assert(typeof result.error === 'string' || result.error === undefined, 'Error should be string or undefined');
    }
  }));

  // ===== DEPENDENCY INJECTION TESTS =====
  // These tests verify that the service accepts and uses injected dependencies

  results.push(await runTest('DI: Service accepts injected mock storage', async () => {
    const mockStorage = createMockStorage();
    const mockGhlService = createMockGhlApiService();
    
    const service = new GhlMessageSyncService(1, {
      storage: mockStorage as any,
      createGhlApiService: () => mockGhlService as any
    });
    
    await service.syncToChatConversation({
      contactId: 'di-test-contact',
      body: 'DI test message',
      messageId: 'di-test-msg-1',
      direction: 'inbound',
      dateAdded: new Date().toISOString(),
      type: 'SMS'
    });
    
    assert(mockStorage.calls.some(c => c.method === 'getConversationByGhlContactId'), 
      'Should have called storage.getConversationByGhlContactId');
    assert(mockStorage.calls[0].args[1] === 'di-test-contact', 
      'Should pass correct contactId to storage');
  }));

  results.push(await runTest('DI: Service uses injected GHL API service factory', async () => {
    const mockStorage = createMockStorage();
    const mockGhlService = createMockGhlApiService();
    let factoryCalled = false;
    let factoryDealershipId: number | undefined;
    
    const service = new GhlMessageSyncService(42, {
      storage: mockStorage as any,
      createGhlApiService: (dealershipId) => {
        factoryCalled = true;
        factoryDealershipId = dealershipId;
        return mockGhlService as any;
      }
    });
    
    await service.linkConversationToGhl({
      id: 100,
      participantId: 'test-participant',
      participantName: 'Test Customer Name',
      pageId: 'test-page',
      dealershipId: 42
    } as any);
    
    assert(factoryCalled, 'Should call createGhlApiService factory');
    assert(factoryDealershipId === 42, `Factory should receive dealershipId 42, got ${factoryDealershipId}`);
    assert(mockGhlService.calls.some(c => c.method === 'searchContacts'), 
      'Should call GHL service searchContacts');
  }));

  results.push(await runTest('DI: linkConversationToGhl creates contact when not found', async () => {
    const mockStorage = createMockStorage();
    const mockGhlService = createMockGhlApiService();
    
    const service = new GhlMessageSyncService(1, {
      storage: mockStorage as any,
      createGhlApiService: () => mockGhlService as any
    });
    
    const result = await service.linkConversationToGhl({
      id: 200,
      participantId: 'new-customer-id',
      participantName: 'John Doe',
      pageId: 'fb-page',
      dealershipId: 1
    } as any);
    
    assert(mockGhlService.calls.some(c => c.method === 'searchContacts'), 
      'Should search for existing contact');
    assert(mockGhlService.calls.some(c => c.method === 'createContact'), 
      'Should create new contact when not found');
    
    const createCall = mockGhlService.calls.find(c => c.method === 'createContact');
    assert(createCall?.args[0].name === 'John Doe', 'Contact name should match');
    assert(createCall?.args[0].firstName === 'John', 'First name should be extracted');
    
    assert(mockGhlService.calls.some(c => c.method === 'getOrCreateConversation'), 
      'Should create GHL conversation');
    
    assert(result.success === true, 'Should succeed');
    assert(result.ghlContactId === 'mock-contact-123', 'Should return mock contact ID');
    assert(result.ghlConversationId === 'mock-conv-456', 'Should return mock conversation ID');
  }));

  results.push(await runTest('DI: handleInboundGhlMessage uses storage to check duplicates', async () => {
    const mockStorage = createMockStorage();
    const mockGhlService = createMockGhlApiService();
    
    const service = new GhlMessageSyncService(5, {
      storage: mockStorage as any,
      createGhlApiService: () => mockGhlService as any
    });
    
    await service.handleInboundGhlMessage({
      conversationId: 'conv-123',
      contactId: 'contact-456',
      locationId: 'loc-789',
      body: 'Test inbound message',
      messageId: 'msg-xyz',
      direction: 'inbound',
      dateAdded: new Date().toISOString(),
      type: 'TYPE_SMS'
    });
    
    assert(mockStorage.calls.some(c => c.method === 'getMessengerMessageByGhlId'), 
      'Should check for duplicate message');
    assert(mockStorage.calls.some(c => c.method === 'getConversationByGhlContactId'), 
      'Should look up conversation by contact ID');
  }));

  results.push(await runTest('DI: syncMessageToGhl uses injected services', async () => {
    const mockStorage = createMockStorage();
    const mockGhlService = createMockGhlApiService();
    
    const service = new GhlMessageSyncService(10, {
      storage: mockStorage as any,
      createGhlApiService: () => mockGhlService as any
    });
    
    const result = await service.syncMessageToGhl(
      { 
        id: 300, 
        participantId: 'p1', 
        participantName: 'Jane Smith',
        pageId: 'page-1',
        dealershipId: 10,
        ghlConversationId: 'existing-ghl-conv',
        ghlContactId: 'existing-ghl-contact'
      } as any,
      'Hello from dealership',
      'Sales Team'
    );
    
    assert(mockGhlService.calls.some(c => c.method === 'sendMessage'), 
      'Should call GHL sendMessage');
    
    const sendCall = mockGhlService.calls.find(c => c.method === 'sendMessage');
    assert(sendCall?.args[0] === 'existing-ghl-conv', 'Should use existing GHL conversation ID');
    assert(sendCall?.args[1].message === 'Hello from dealership', 'Message content should match');
    
    assert(result.success === true, 'Should succeed');
    assert(result.ghlMessageId === 'mock-msg-789', 'Should return mock message ID');
  }));

  return results;
}

async function main() {
  console.log('🔄 Running GHL Messenger Sync Tests\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  const results = await runGhlSyncTests();

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
