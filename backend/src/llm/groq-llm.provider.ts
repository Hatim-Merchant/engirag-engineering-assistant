import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import OpenAI, { APIError } from 'openai';
import { AppConfigService } from '../config/app-config.service';
import {
  LlmGenerationRequest,
  LlmGenerationResponse,
  LlmProvider,
  LlmProviderError,
} from './llm.provider';
import { LLM_RETRY_OPTIONS, RetryOptions, extractStatusCode, withBoundedRetry } from './retry.util';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_TOKENS = 600;

@Injectable()
export class GroqLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GroqLlmProvider.name);
  readonly providerName = 'groq' as const;

  constructor(
    private readonly config: AppConfigService,
    @Optional() @Inject(LLM_RETRY_OPTIONS) private readonly retryOptions?: RetryOptions,
  ) {}

  async generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse> {
    const apiKey = this.config.groqApiKey.trim();
    if (!apiKey) {
      throw new LlmProviderError({
        provider: this.providerName,
        statusCode: 503,
        message: 'Groq LLM provider is not configured (GROQ_API_KEY is missing).',
      });
    }

    const client = new OpenAI({
      apiKey,
      baseURL: this.config.groqBaseUrl,
      timeout: DEFAULT_TIMEOUT_MS,
      maxRetries: 0,
    });

    const model = this.config.groqModel;

    try {
      const completion = await withBoundedRetry(
        () =>
          client.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            temperature: request.temperature ?? DEFAULT_TEMPERATURE,
            max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          }),
        {
          ...this.retryOptions,
          onRetry: (attempt, delayMs, error) => {
            const status = extractStatusCode(error);
            this.logger.warn(
              `Groq request failed with HTTP ${status ?? 'unknown'}; retrying attempt ${attempt} in ${delayMs}ms`,
            );
            this.retryOptions?.onRetry?.(attempt, delayMs, error);
          },
        },
      );

      const content = completion.choices[0]?.message?.content?.trim() ?? '';
      if (!content) {
        throw new LlmProviderError({
          provider: this.providerName,
          statusCode: 502,
          message: 'Groq returned an empty completion response.',
        });
      }

      return {
        content,
        model: completion.model || model,
        provider: this.providerName,
      };
    } catch (error: unknown) {
      if (error instanceof LlmProviderError) {
        throw error;
      }
      throw this.mapProviderError(error);
    }
  }

  private mapProviderError(error: unknown): LlmProviderError {
    const statusCode = extractStatusCode(error);

    if (statusCode === 429) {
      return new LlmProviderError({
        provider: this.providerName,
        statusCode: 429,
        isRateLimit: true,
        message: 'Groq rate limit exceeded after bounded retries. Please wait and try again.',
      });
    }

    if (statusCode === 401) {
      return new LlmProviderError({
        provider: this.providerName,
        statusCode,
        message: 'Groq authentication failed. Verify server GROQ_API_KEY configuration.',
      });
    }

    if (statusCode === 403) {
      const detail = error instanceof Error ? error.message : 'Model or project access denied';
      return new LlmProviderError({
        provider: this.providerName,
        statusCode,
        message: `Groq permission error (HTTP 403): ${detail}`,
      });
    }

    if (error instanceof APIError) {
      return new LlmProviderError({
        provider: this.providerName,
        statusCode,
        message: `Groq API error (HTTP ${statusCode ?? 'unknown'}): ${error.message}`,
      });
    }

    const message = error instanceof Error ? error.message : 'Unknown Groq provider error';
    return new LlmProviderError({
      provider: this.providerName,
      statusCode,
      message: `Groq request failed: ${message}`,
    });
  }
}
