export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/**
 * Contract for generating dense vector embeddings from text.
 * Both ingestion and retrieval must depend on this interface so query vectors
 * live in the exact same vector space as stored document chunks.
 */
export interface EmbeddingProvider {
  readonly modelName: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
}

/**
 * Normalizes whitespace consistently before tokenization so ingestion and
 * query retrieval produce identical embeddings for equivalent text.
 */
export function normalizeEmbeddingInput(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
