import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embeddings/embedding.provider';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  sourceId: string;
  externalId: string;
  documentTitle: string;
  sourceUrl: string;
  baseSourceUrl: string;
  sectionHeading: string;
  sectionAnchor: string | null;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
  score: number;
}

export interface RetrievalOptions {
  topK?: number;
  minScore?: number;
}

interface RetrievalQueryRow {
  chunk_id: string;
  document_id: string;
  source_id: string;
  external_id: string;
  document_title: string;
  source_url: string;
  section_heading: string;
  section_anchor: string | null;
  chunk_index: number;
  chunk_text: string;
  token_count: number;
  similarity_score: number | string;
}

function formatPgVector(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly config: AppConfigService,
    private readonly databaseService: DatabaseService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  /**
   * Embeds the question locally and queries PostgreSQL pgvector using cosine similarity
   * (`1 - (embedding <=> query)`), enforcing both similarity threshold and top-k limits.
   */
  async retrieve(question: string, options: RetrievalOptions = {}): Promise<RetrievedChunk[]> {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      throw new Error('Cannot retrieve chunks for an empty question');
    }

    const topK = options.topK ?? this.config.retrievalTopK;
    const minScore = options.minScore ?? this.config.retrievalMinScore;

    if (!Number.isInteger(topK) || topK <= 0) {
      throw new Error('topK must be a positive integer');
    }
    if (minScore < 0 || minScore > 1) {
      throw new Error('minScore must be between 0 and 1');
    }

    const queryEmbedding = await this.embeddingProvider.embedQuery(trimmedQuestion);
    const vectorLiteral = formatPgVector(queryEmbedding);

    const result = await this.databaseService.query<RetrievalQueryRow>(
      `
      SELECT
        dc.id AS chunk_id,
        dc.document_id,
        d.source_id,
        d.external_id,
        dc.document_title,
        dc.source_url,
        dc.section_heading,
        dc.section_anchor,
        dc.chunk_index,
        dc.chunk_text,
        dc.token_count,
        1 - (dc.embedding <=> $1::vector) AS similarity_score
      FROM document_chunks dc
      INNER JOIN documents d ON d.id = dc.document_id
      WHERE 1 - (dc.embedding <=> $1::vector) >= $2
      ORDER BY dc.embedding <=> $1::vector ASC
      LIMIT $3
      `,
      [vectorLiteral, minScore, topK],
    );

    return result.rows.map((row) => {
      const numericScore = Number(row.similarity_score);
      const roundedScore = Math.round(numericScore * 10_000) / 10_000;
      const fullUrl = row.section_anchor
        ? `${row.source_url}#${row.section_anchor}`
        : row.source_url;

      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        sourceId: row.source_id,
        externalId: row.external_id,
        documentTitle: row.document_title,
        sourceUrl: fullUrl,
        baseSourceUrl: row.source_url,
        sectionHeading: row.section_heading,
        sectionAnchor: row.section_anchor,
        chunkIndex: row.chunk_index,
        chunkText: row.chunk_text,
        tokenCount: row.token_count,
        score: roundedScore,
      };
    });
  }
}
