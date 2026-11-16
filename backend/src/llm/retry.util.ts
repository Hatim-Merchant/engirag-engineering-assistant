export const LLM_RETRY_OPTIONS = Symbol('LLM_RETRY_OPTIONS');

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleepFn?: (delayMs: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 4000;

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

export function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  if (typeof record.status === 'number') {
    return record.status;
  }
  if (typeof record.statusCode === 'number') {
    return record.statusCode;
  }

  const response = record.response;
  if (typeof response === 'object' && response !== null) {
    const responseStatus = (response as Record<string, unknown>).status;
    if (typeof responseStatus === 'number') {
      return responseStatus;
    }
  }

  return undefined;
}

export function isRetryableProviderError(error: unknown): boolean {
  const statusCode = extractStatusCode(error);
  return statusCode !== undefined && RETRYABLE_STATUS_CODES.has(statusCode);
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Executes an async provider call with bounded exponential backoff on HTTP 429
 * rate-limit responses and transient 502/503/504 gateway errors.
 */
export async function withBoundedRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleepFn = options.sleepFn ?? defaultSleep;

  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (!isRetryableProviderError(error) || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      attempt += 1;
      options.onRetry?.(attempt, delayMs, error);
      await sleepFn(delayMs);
    }
  }
}
