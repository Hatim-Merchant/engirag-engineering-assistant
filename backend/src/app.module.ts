import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { LlmModule } from './llm/llm.module';
import { RagModule } from './rag/rag.module';
import { RetrievalModule } from './retrieval/retrieval.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    EmbeddingsModule,
    IngestionModule,
    RetrievalModule,
    LlmModule,
    RagModule,
    HealthModule,
  ],
})
export class AppModule {}
