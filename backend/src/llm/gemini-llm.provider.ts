import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

@Injectable()
export class GeminiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);
  readonly providerName = 'gemini' as const;

  constructor(
    private readonly config: AppConfigService,
    @Optional() @Inject(LLM_RETRY_OPTIONS) private readonly retryOptions?: RetryOptions,
  ) {}

  async generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse> {
    const apiKey = this.config.geminiApiKey.trim();
    if (!apiKey) {
      throw new LlmProviderError({
        provider: this.providerName,
        statusCode: 503,
        message: 'Gemini LLM provider is not configured (GEMINI_API_KEY is missing).',
      });
    }

    const model = this.config.geminiModel;
    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

    try {
      const payload = await withBoundedRetry(() => this.executeRequest(endpoint, apiKey, request), {
        ...this.retryOptions,
        onRetry: (attempt, delayMs, error) => {
          const status = extractStatusCode(error);
          this.logger.warn(
            `Gemini request failed with HTTP ${status ?? 'unknown'}; retrying attempt ${attempt} in ${delayMs}ms`,
          );
          this.retryOptions?.onRetry?.(attempt, delayMs, error);
        },
      });

      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      const content = parts
        .map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!content) {
        throw new LlmProviderError({
          provider: this.providerName,
          statusCode: 502,
          message: 'Gemini returned an empty completion response.',
        });
      }

      return {
        content,
        model,
        provider: this.providerName,
      };
    } catch (error: unknown) {
      if (error instanceof LlmProviderError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown Gemini provider error';
      throw new LlmProviderError({
        provider: this.providerName,
        statusCode: extractStatusCode(error),
        message: `Gemini request failed: ${message}`,
      });
    }
  }

  private async executeRequest(
    endpoint: string,
    apiKey: string,
    request: LlmGenerationRequest,
  ): Promise<GeminiApiResponse> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      // Pass API key in header rather than URL query parameters so it never leaks in URLs/logs.
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: request.userPrompt }],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? DEFAULT_TEMPERATURE,
            maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          },
        }),
      });

      const data = (await response.json().catch(() => ({}))) as GeminiApiResponse;

      if (!response.ok) {
        const remoteMessage = data.error?.message ?? response.statusText;
        if (response.status === 429) {
          throw new LlmProviderError({
            provider: this.providerName,
            statusCode: 429,
            isRateLimit: true,
            message: 'Gemini rate limit exceeded after bounded retries. Please wait and try again.',
          });
        }
        if (response.status === 401) {
          throw new LlmProviderError({
            provider: this.providerName,
            statusCode: response.status,
            message: 'Gemini authentication failed. Verify server GEMINI_API_KEY configuration.',
          });
        }
        if (response.status === 403) {
          throw new LlmProviderError({
            provider: this.providerName,
            statusCode: response.status,
            message: `Gemini permission error (HTTP 403): ${remoteMessage}`,
          });
        }
        throw new LlmProviderError({
          provider: this.providerName,
          statusCode: response.status,
          message: `Gemini API error (HTTP ${response.status}): ${remoteMessage}`,
        });
      }

      return data;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LlmProviderError({
          provider: this.providerName,
          statusCode: 504,
          message: `Gemini request timed out after ${DEFAULT_TIMEOUT_MS}ms.`,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
