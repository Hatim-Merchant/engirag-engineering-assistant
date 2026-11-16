import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { GeminiLlmProvider } from './gemini-llm.provider';
import { GroqLlmProvider } from './groq-llm.provider';
import { LLM_PROVIDER, LlmProvider } from './llm.provider';

@Module({
  providers: [
    GroqLlmProvider,
    GeminiLlmProvider,
    {
      provide: LLM_PROVIDER,
      inject: [AppConfigService, GroqLlmProvider, GeminiLlmProvider],
      useFactory: (
        config: AppConfigService,
        groqProvider: GroqLlmProvider,
        geminiProvider: GeminiLlmProvider,
      ): LlmProvider => (config.llmProvider === 'gemini' ? geminiProvider : groqProvider),
    },
  ],
  exports: [LLM_PROVIDER, GroqLlmProvider, GeminiLlmProvider],
})
export class LlmModule {}
