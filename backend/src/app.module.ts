import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, EmbeddingsModule, IngestionModule, HealthModule],
})
export class AppModule {}
