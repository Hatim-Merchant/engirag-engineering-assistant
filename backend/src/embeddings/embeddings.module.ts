import { Module } from '@nestjs/common';
import { EMBEDDING_PROVIDER } from './embedding.provider';
import { TransformersEmbeddingProvider } from './transformers-embedding.provider';

@Module({
  providers: [
    TransformersEmbeddingProvider,
    {
      provide: EMBEDDING_PROVIDER,
      useExisting: TransformersEmbeddingProvider,
    },
  ],
  exports: [EMBEDDING_PROVIDER, TransformersEmbeddingProvider],
})
export class EmbeddingsModule {}
