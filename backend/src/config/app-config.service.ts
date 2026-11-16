import { Injectable } from '@nestjs/common';
import { AppEnv, validateEnv } from './env.schema';

@Injectable()
export class AppConfigService {
  private readonly env: AppEnv;

  constructor() {
    this.env = validateEnv(process.env);
  }

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get corsOrigin(): string {
    return this.env.CORS_ORIGIN;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get embeddingModel(): string {
    return this.env.EMBEDDING_MODEL;
  }

  get embeddingDimensions(): number {
    return this.env.EMBEDDING_DIMENSIONS;
  }

  get llmProvider(): AppEnv['LLM_PROVIDER'] {
    return this.env.LLM_PROVIDER;
  }

  get groqApiKey(): string {
    return this.env.GROQ_API_KEY;
  }

  get groqBaseUrl(): string {
    return this.env.GROQ_BASE_URL;
  }

  get groqModel(): string {
    return this.env.GROQ_MODEL;
  }

  get geminiApiKey(): string {
    return this.env.GEMINI_API_KEY;
  }

  get geminiModel(): string {
    return this.env.GEMINI_MODEL;
  }

  get chunkSizeTokens(): number {
    return this.env.CHUNK_SIZE_TOKENS;
  }

  get chunkOverlapTokens(): number {
    return this.env.CHUNK_OVERLAP_TOKENS;
  }

  get retrievalTopK(): number {
    return this.env.RETRIEVAL_TOP_K;
  }

  get retrievalMinScore(): number {
    return this.env.RETRIEVAL_MIN_SCORE;
  }
}
