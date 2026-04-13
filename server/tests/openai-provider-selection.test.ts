const getDealershipApiKeys = jest.fn();
const createCompletion = jest.fn();
const findActivePromptTemplate = jest.fn();
const openAIConstructor = jest.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: (...args: any[]) => createCompletion(...args),
    },
  },
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: openAIConstructor,
}));

jest.mock('../storage', () => ({
  storage: {
    getDealershipApiKeys: (...args: any[]) => getDealershipApiKeys(...args),
  },
}));

jest.mock('../db', () => ({
  db: {
    query: {
      aiPromptTemplates: {
        findFirst: (...args: any[]) => findActivePromptTemplate(...args),
      },
    },
  },
}));

import { generateVehicleDescription } from '../openai';

describe('openai provider selection', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalIntegrationsKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const originalIntegrationsBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    getDealershipApiKeys.mockResolvedValue(undefined);
    findActivePromptTemplate.mockResolvedValue(undefined);
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Detailed EV description with enough content to avoid fallback behavior in the generator.',
          },
        },
      ],
    });
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = originalIntegrationsKey;
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = originalIntegrationsBaseUrl;
  });

  it('falls back to OPENAI_API_KEY when replit ai integrations are not configured', async () => {
    process.env.OPENAI_API_KEY = 'env-openai-key';
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

    const description = await generateVehicleDescription({
      year: 2024,
      make: 'Hyundai',
      model: 'IONIQ 5',
      trim: 'Preferred AWD',
      type: 'SUV',
      price: 53998,
      odometer: 1200,
      badges: ['One Owner'],
      dealership: 'Olympic Hyundai Vancouver',
      location: 'Vancouver',
      rawDescription: 'Dealer supplied description',
    }, 7);

    expect(description).toContain('Detailed EV description');
    expect(openAIConstructor).toHaveBeenCalledWith({ apiKey: 'env-openai-key' });
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini',
    }));
  });
});
