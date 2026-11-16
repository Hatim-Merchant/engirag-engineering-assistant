import { AppConfigService } from '../config/app-config.service';
import { GroqLlmProvider } from './groq-llm.provider';
import { LlmProviderError } from './llm.provider';

const createCompletionMock = jest.fn();
const openAiConstructorMock = jest.fn();

jest.mock('openai', () => {
  class MockAPIError extends Error {
    readonly status: number | undefined;

    constructor(status: number | undefined, message: string) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  const MockOpenAI = jest.fn().mockImplementation((options: unknown) => {
    openAiConstructorMock(options);
    return {
      chat: {
        completions: {
          create: createCompletionMock,
        },
      },
    };
  });

  return {
    __esModule: true,
    default: MockOpenAI,
    APIError: MockAPIError,
  };
});

describe('GroqLlmProvider', () => {
  let sleepMock: jest.Mock<Promise<void>, [number]>;
  let mockConfig: AppConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    sleepMock = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
    mockConfig = {
      groqApiKey: 'gsk_test_secret_key_do_not_leak',
      groqBaseUrl: 'https://api.groq.com/openai/v1',
      groqModel: 'llama-3.1-8b-instant',
    } as unknown as AppConfigService;
  });

  it('returns generated text using OpenAI SDK with custom baseURL', async () => {
    createCompletionMock.mockResolvedValueOnce({
      model: 'llama-3.1-8b-instant',
      choices: [{ message: { content: 'VSS standardizes vehicle signals [1].' } }],
    });

    const provider = new GroqLlmProvider(mockConfig, {
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      sleepFn: sleepMock,
    });

    const response = await provider.generate({
      systemPrompt: 'Answer strictly from context.',
      userPrompt: 'What is VSS?',
    });

    expect(response).toEqual({
      content: 'VSS standardizes vehicle signals [1].',
      model: 'llama-3.1-8b-instant',
      provider: 'groq',
    });
    expect(openAiConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'gsk_test_secret_key_do_not_leak',
        baseURL: 'https://api.groq.com/openai/v1',
        maxRetries: 0,
      }),
    );
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('retries 429 rate-limit errors with bounded exponential backoff and succeeds', async () => {
    createCompletionMock
      .mockRejectedValueOnce({ status: 429, message: 'Rate limit reached' })
      .mockRejectedValueOnce({ status: 429, message: 'Rate limit reached' })
      .mockResolvedValueOnce({
        model: 'llama-3.1-8b-instant',
        choices: [{ message: { content: 'Controllers handle HTTP requests [1].' } }],
      });

    const provider = new GroqLlmProvider(mockConfig, {
      maxRetries: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      sleepFn: sleepMock,
    });

    const response = await provider.generate({
      systemPrompt: 'Sys',
      userPrompt: 'User',
    });

    expect(response.content).toBe('Controllers handle HTTP requests [1].');
    expect(createCompletionMock).toHaveBeenCalledTimes(3);
    expect(sleepMock.mock.calls).toEqual([[500], [1000]]);
  });

  it('stops retrying after bounded attempts when 429 persists', async () => {
    createCompletionMock.mockRejectedValue({ status: 429, message: 'Too many requests' });

    const provider = new GroqLlmProvider(mockConfig, {
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 800,
      sleepFn: sleepMock,
    });

    await expect(
      provider.generate({ systemPrompt: 'Sys', userPrompt: 'User' }),
    ).rejects.toMatchObject({
      name: 'LlmProviderError',
      statusCode: 429,
      isRateLimit: true,
    });

    expect(createCompletionMock).toHaveBeenCalledTimes(3);
    expect(sleepMock.mock.calls).toEqual([[500], [800]]);
  });

  it('fails immediately without retrying on 401 authentication errors and hides the API key', async () => {
    createCompletionMock.mockRejectedValueOnce({ status: 401, message: 'Invalid API key' });

    const provider = new GroqLlmProvider(mockConfig, {
      maxRetries: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      sleepFn: sleepMock,
    });

    let caught: unknown;
    try {
      await provider.generate({ systemPrompt: 'Sys', userPrompt: 'User' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(LlmProviderError);
    expect((caught as LlmProviderError).statusCode).toBe(401);
    expect((caught as LlmProviderError).message).not.toContain('gsk_test_secret_key_do_not_leak');
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('throws a clear 503 LlmProviderError when GROQ_API_KEY is missing', async () => {
    const unconfiguredConfig = {
      groqApiKey: '',
      groqBaseUrl: 'https://api.groq.com/openai/v1',
      groqModel: 'llama-3.1-8b-instant',
    } as unknown as AppConfigService;

    const provider = new GroqLlmProvider(unconfiguredConfig);

    await expect(
      provider.generate({ systemPrompt: 'Sys', userPrompt: 'User' }),
    ).rejects.toMatchObject({
      name: 'LlmProviderError',
      statusCode: 503,
    });
    expect(openAiConstructorMock).not.toHaveBeenCalled();
  });
});
