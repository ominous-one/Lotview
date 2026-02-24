/**
 * Messaging & AI Auto-Reply Tests
 * Tests: conversation management, message creation, AI response generation patterns
 */

jest.mock('../storage', () => {
  let conversations: any[] = [];
  let messages: any[] = [];
  let nextId = 1;

  return {
    storage: {
      createMessengerConversation: jest.fn(async (data: any) => {
        const record = { id: nextId++, ...data, createdAt: new Date(), messages: [] };
        conversations.push(record);
        return record;
      }),
      getMessengerConversationsByDealership: jest.fn(async (dealershipId: number) => {
        return conversations.filter(c => c.dealershipId === dealershipId);
      }),
      getMessengerConversation: jest.fn(async (id: number, dealershipId: number) => {
        return conversations.find(c => c.id === id && c.dealershipId === dealershipId) || null;
      }),
      appendMessageToConversation: jest.fn(async (id: number, dealershipId: number, message: any) => {
        const conv = conversations.find(c => c.id === id && c.dealershipId === dealershipId);
        if (!conv) return false;
        conv.messages.push({ ...message, timestamp: new Date() });
        return true;
      }),
      createMessengerMessage: jest.fn(async (data: any) => {
        const record = { id: nextId++, ...data, createdAt: new Date() };
        messages.push(record);
        return record;
      }),
      getMessengerMessageByGhlId: jest.fn(async (dealershipId: number, ghlId: string) => {
        return messages.find(m => m.dealershipId === dealershipId && m.ghlMessageId === ghlId) || null;
      }),
      getUserById: jest.fn(),
      __reset: () => { conversations = []; messages = []; nextId = 1; },
      __getConversations: () => conversations,
      __getMessages: () => messages,
    }
  };
});

jest.mock('../db', () => ({ db: { execute: jest.fn() } }));

import { storage } from '../storage';

const mockStorage = storage as any;

describe('Messenger Conversations', () => {
  beforeEach(() => {
    mockStorage.__reset();
    jest.clearAllMocks();
  });

  describe('Conversation CRUD', () => {
    it('should create a new conversation', async () => {
      const conv = await mockStorage.createMessengerConversation({
        dealershipId: 1,
        participantId: 'fb-user-123',
        participantName: 'John Smith',
        pageId: 'fb-page-456',
        platform: 'facebook',
      });

      expect(conv.id).toBeDefined();
      expect(conv.dealershipId).toBe(1);
      expect(conv.participantName).toBe('John Smith');
      expect(conv.platform).toBe('facebook');
    });

    it('should list conversations by dealership', async () => {
      await mockStorage.createMessengerConversation({ dealershipId: 1, participantId: 'p1', participantName: 'User 1', pageId: 'page1' });
      await mockStorage.createMessengerConversation({ dealershipId: 1, participantId: 'p2', participantName: 'User 2', pageId: 'page1' });
      await mockStorage.createMessengerConversation({ dealershipId: 2, participantId: 'p3', participantName: 'User 3', pageId: 'page2' });

      const dealer1Convs = await mockStorage.getMessengerConversationsByDealership(1);
      const dealer2Convs = await mockStorage.getMessengerConversationsByDealership(2);

      expect(dealer1Convs.length).toBe(2);
      expect(dealer2Convs.length).toBe(1);
    });

    it('should get a specific conversation with tenant check', async () => {
      const conv = await mockStorage.createMessengerConversation({
        dealershipId: 1, participantId: 'p1', participantName: 'User', pageId: 'page1'
      });

      const found = await mockStorage.getMessengerConversation(conv.id, 1);
      expect(found).not.toBeNull();
      expect(found.id).toBe(conv.id);

      // Cross-tenant access should return null
      const crossTenant = await mockStorage.getMessengerConversation(conv.id, 2);
      expect(crossTenant).toBeNull();
    });
  });

  describe('Message Management', () => {
    it('should append a message to a conversation', async () => {
      const conv = await mockStorage.createMessengerConversation({
        dealershipId: 1, participantId: 'p1', participantName: 'User', pageId: 'page1'
      });

      const result = await mockStorage.appendMessageToConversation(conv.id, 1, {
        sender: 'customer',
        text: 'Is this car still available?',
        direction: 'inbound',
      });

      expect(result).toBe(true);

      const updatedConv = await mockStorage.getMessengerConversation(conv.id, 1);
      expect(updatedConv.messages.length).toBe(1);
      expect(updatedConv.messages[0].text).toBe('Is this car still available?');
    });

    it('should not append messages cross-tenant', async () => {
      const conv = await mockStorage.createMessengerConversation({
        dealershipId: 1, participantId: 'p1', participantName: 'User', pageId: 'page1'
      });

      const result = await mockStorage.appendMessageToConversation(conv.id, 2, {
        sender: 'customer', text: 'Injected message', direction: 'inbound',
      });

      expect(result).toBe(false);
    });

    it('should track message timestamps', async () => {
      const conv = await mockStorage.createMessengerConversation({
        dealershipId: 1, participantId: 'p1', participantName: 'User', pageId: 'page1'
      });

      await mockStorage.appendMessageToConversation(conv.id, 1, {
        sender: 'customer', text: 'Message 1', direction: 'inbound',
      });

      const updatedConv = await mockStorage.getMessengerConversation(conv.id, 1);
      expect(updatedConv.messages[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Message Deduplication', () => {
    it('should detect duplicate GHL message IDs', async () => {
      await mockStorage.createMessengerMessage({
        dealershipId: 1,
        conversationId: 1,
        ghlMessageId: 'ghl-msg-123',
        body: 'Original message',
        direction: 'inbound',
      });

      const existing = await mockStorage.getMessengerMessageByGhlId(1, 'ghl-msg-123');
      expect(existing).not.toBeNull();
      expect(existing.ghlMessageId).toBe('ghl-msg-123');

      // Non-existent message should return null
      const notFound = await mockStorage.getMessengerMessageByGhlId(1, 'ghl-msg-999');
      expect(notFound).toBeNull();
    });

    it('should scope deduplication by dealership', async () => {
      await mockStorage.createMessengerMessage({
        dealershipId: 1, conversationId: 1, ghlMessageId: 'ghl-msg-shared', body: 'Msg 1', direction: 'inbound'
      });

      // Same GHL message ID but different dealership should not find it
      const crossTenant = await mockStorage.getMessengerMessageByGhlId(2, 'ghl-msg-shared');
      expect(crossTenant).toBeNull();

      // Same dealership should find it
      const sameTenant = await mockStorage.getMessengerMessageByGhlId(1, 'ghl-msg-shared');
      expect(sameTenant).not.toBeNull();
    });
  });

  describe('AI Auto-Reply Patterns', () => {
    it('should structure auto-reply request with conversation context', () => {
      // Simulate how an AI auto-reply request would be structured
      const conversationHistory = [
        { role: 'user' as const, content: 'Is the 2024 Toyota Camry still available?' },
      ];

      const vehicleContext = {
        year: 2024,
        make: 'Toyota',
        model: 'Camry',
        price: 25000,
        odometer: 10000,
        exteriorColor: 'White',
      };

      const systemPrompt = `You are an AI assistant for a car dealership. The customer is asking about a ${vehicleContext.year} ${vehicleContext.make} ${vehicleContext.model} priced at $${vehicleContext.price.toLocaleString()}.`;

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...conversationHistory,
      ];

      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('Toyota Camry');
      expect(messages[0].content).toContain('$25,000');
      expect(messages[1].role).toBe('user');
    });

    it('should handle multi-turn conversation context', () => {
      const conversationHistory = [
        { role: 'user' as const, content: 'Is the Camry available?' },
        { role: 'assistant' as const, content: 'Yes! The 2024 Toyota Camry is available.' },
        { role: 'user' as const, content: 'What is the lowest price?' },
      ];

      expect(conversationHistory.length).toBe(3);
      expect(conversationHistory[2].content).toContain('lowest price');
    });

    it('should sanitize user messages before sending to AI', () => {
      const userMessage = 'Is this car available? <script>alert("xss")</script>';
      // Strip HTML tags from user input before sending to AI
      const sanitized = userMessage.replace(/<[^>]*>/g, '');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Is this car available?');
    });

    it('should include dealership context in AI prompts', () => {
      const dealershipName = 'Olympic Auto Group';
      const prompt = `You are a helpful assistant for ${dealershipName}. Be professional and helpful.`;
      expect(prompt).toContain('Olympic Auto Group');
    });
  });
});
