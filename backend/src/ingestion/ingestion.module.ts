import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { DocumentFetcher } from './document-fetcher';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [EmbeddingsModule],
  providers: [DocumentFetcher, IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
