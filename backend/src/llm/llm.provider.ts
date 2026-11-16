export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type LlmProviderName = 'groq' | 'gemini';

export interface LlmGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmGenerationResponse {
  content: string;
  model: string;
  provider: LlmProviderName;
}

export interface LlmProvider {
  readonly providerName: LlmProviderName;
  generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse>;
}

/**
 * Typed error representing failures from upstream LLM inference providers.
 * Callers must ensure secret API keys are never included in error messages.
 */
export class LlmProviderError extends Error {
  readonly provider: LlmProviderName;
  readonly statusCode?: number;
  readonly isRateLimit: boolean;

  constructor(options: {
    message: string;
    provider: LlmProviderName;
    statusCode?: number;
    isRateLimit?: boolean;
  }) {
    super(options.message);
    this.name = 'LlmProviderError';
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRateLimit = Boolean(options.isRateLimit ?? options.statusCode === 429);
  }
}
