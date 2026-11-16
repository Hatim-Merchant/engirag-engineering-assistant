import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embeddings/embedding.provider';
import { DocumentChunk, chunkMarkdownDocument } from './chunker';
import { DocumentFetcher } from './document-fetcher';
import {
  DOCUMENTATION_SOURCES,
  DocumentationSourceEntry,
  DocumentationSourceId,
} from './documentation-sources';

const EMBEDDING_BATCH_SIZE = 16;

export interface IngestionOptions {
  source?: DocumentationSourceId | 'all';
  chunkSizeTokens?: number;
  chunkOverlapTokens?: number;
  limit?: number;
  force?: boolean;
  onProgress?: (message: string) => void;
}

export interface IngestionErrorItem {
  sourceId: DocumentationSourceId;
  externalId: string;
  stage: 'fetch' | 'chunk' | 'embed' | 'database';
  message: string;
}

export interface IngestionReport {
  documentsFetched: number;
  documentsProcessed: number;
  documentsSkipped: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  recordsInsertedOrUpdated: number;
  errorsEncountered: IngestionErrorItem[];
}

interface ExistingDocumentRow {
  id: string;
  content_hash: string;
}

interface UpsertDocumentRow {
  id: string;
}

function formatPgVector(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors
      .map((inner) => (inner instanceof Error ? inner.message : String(inner)))
      .filter(Boolean);
    return details.length > 0 ? details.join('; ') : error.name;
  }
  return error instanceof Error ? error.message || error.name : String(error);
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly databaseService: DatabaseService,
    private readonly documentFetcher: DocumentFetcher,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async ingest(options: IngestionOptions = {}): Promise<IngestionReport> {
    const chunkSizeTokens = options.chunkSizeTokens ?? this.config.chunkSizeTokens;
    const chunkOverlapTokens = options.chunkOverlapTokens ?? this.config.chunkOverlapTokens;

    if (chunkSizeTokens <= 0) {
      throw new Error('chunkSizeTokens must be greater than 0');
    }
    if (chunkOverlapTokens < 0 || chunkOverlapTokens >= chunkSizeTokens) {
      throw new Error('chunkOverlapTokens must be >= 0 and smaller than chunkSizeTokens');
    }

    const selectedEntries = this.selectSourceEntries(options.source ?? 'all', options.limit);
    const report: IngestionReport = {
      documentsFetched: 0,
      documentsProcessed: 0,
      documentsSkipped: 0,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      recordsInsertedOrUpdated: 0,
      errorsEncountered: [],
    };

    for (const entry of selectedEntries) {
      await this.processEntry(
        entry,
        chunkSizeTokens,
        chunkOverlapTokens,
        Boolean(options.force),
        report,
        options.onProgress,
      );
    }

    return report;
  }

  private selectSourceEntries(
    source: DocumentationSourceId | 'all',
    limit?: number,
  ): DocumentationSourceEntry[] {
    const filtered =
      source === 'all'
        ? [...DOCUMENTATION_SOURCES]
        : DOCUMENTATION_SOURCES.filter((entry) => entry.sourceId === source);

    if (limit !== undefined) {
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error('limit must be a positive integer');
      }
      return filtered.slice(0, limit);
    }

    return filtered;
  }

  private async processEntry(
    entry: DocumentationSourceEntry,
    chunkSizeTokens: number,
    chunkOverlapTokens: number,
    force: boolean,
    report: IngestionReport,
    onProgress?: (message: string) => void,
  ): Promise<void> {
    let rawMarkdown: string;
    try {
      rawMarkdown = await this.documentFetcher.fetchMarkdown(entry.rawUrl);
      report.documentsFetched += 1;
    } catch (error: unknown) {
      const message = formatErrorMessage(error);
      this.logger.error(`Fetch failed for ${entry.externalId}: ${message}`);
      report.errorsEncountered.push({
        sourceId: entry.sourceId,
        externalId: entry.externalId,
        stage: 'fetch',
        message,
      });
      return;
    }

    // Include chunking parameters and embedding model in the content hash so changing
    // chunk size or embedding model automatically triggers re-ingestion of stale chunks.
    const contentHash = createHash('sha256')
      .update(rawMarkdown)
      .update('\n')
      .update(`${chunkSizeTokens}:${chunkOverlapTokens}:${this.embeddingProvider.modelName}`)
      .digest('hex');

    if (!force) {
      try {
        const existing = await this.databaseService.query<ExistingDocumentRow>(
          'SELECT id, content_hash FROM documents WHERE source_id = $1 AND external_id = $2',
          [entry.sourceId, entry.externalId],
        );

        if (existing.rows[0]?.content_hash === contentHash) {
          report.documentsSkipped += 1;
          onProgress?.(`Skipped unchanged: ${entry.sourceId}/${entry.externalId}`);
          return;
        }
      } catch (error: unknown) {
        const message = formatErrorMessage(error);
        this.logger.error(`Database check failed for ${entry.externalId}: ${message}`);
        report.errorsEncountered.push({
          sourceId: entry.sourceId,
          externalId: entry.externalId,
          stage: 'database',
          message,
        });
        return;
      }
    }

    let chunks: DocumentChunk[];
    try {
      chunks = chunkMarkdownDocument(
        {
          documentTitle: entry.fallbackTitle,
          sourceUrl: entry.sourceUrl,
          rawMarkdown,
          metadata: {
            sourceId: entry.sourceId,
            externalId: entry.externalId,
            license: entry.license,
            rawUrl: entry.rawUrl,
          },
        },
        { chunkSizeTokens, chunkOverlapTokens },
      );

      if (chunks.length === 0) {
        throw new Error('Document produced zero chunks after Markdown parsing');
      }
    } catch (error: unknown) {
      const message = formatErrorMessage(error);
      this.logger.error(`Chunking failed for ${entry.externalId}: ${message}`);
      report.errorsEncountered.push({
        sourceId: entry.sourceId,
        externalId: entry.externalId,
        stage: 'chunk',
        message,
      });
      return;
    }

    let embeddings: number[][];
    try {
      embeddings = await this.generateEmbeddingsInBatches(chunks);
      if (embeddings.length !== chunks.length) {
        throw new Error(`Expected ${chunks.length} embeddings, got ${embeddings.length}`);
      }
    } catch (error: unknown) {
      const message = formatErrorMessage(error);
      this.logger.error(`Embedding failed for ${entry.externalId}: ${message}`);
      report.errorsEncountered.push({
        sourceId: entry.sourceId,
        externalId: entry.externalId,
        stage: 'embed',
        message,
      });
      return;
    }

    const documentTitle = chunks[0]?.documentTitle ?? entry.fallbackTitle;

    try {
      await this.persistDocumentAndChunks(entry, documentTitle, contentHash, chunks, embeddings);
      report.documentsProcessed += 1;
      report.chunksCreated += chunks.length;
      report.embeddingsGenerated += embeddings.length;
      report.recordsInsertedOrUpdated += 1 + chunks.length;
      onProgress?.(`Ingested ${entry.sourceId}/${entry.externalId} (${chunks.length} chunks)`);
    } catch (error: unknown) {
      const message = formatErrorMessage(error);
      this.logger.error(`Database persistence failed for ${entry.externalId}: ${message}`);
      report.errorsEncountered.push({
        sourceId: entry.sourceId,
        externalId: entry.externalId,
        stage: 'database',
        message,
      });
    }
  }

  private async generateEmbeddingsInBatches(chunks: readonly DocumentChunk[]): Promise<number[][]> {
    const allVectors: number[][] = [];

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batchTexts = chunks
        .slice(i, i + EMBEDDING_BATCH_SIZE)
        .map((chunk) => `${chunk.documentTitle} — ${chunk.sectionHeading}\n\n${chunk.chunkText}`);
      const batchVectors = await this.embeddingProvider.embedDocuments(batchTexts);
      allVectors.push(...batchVectors);
    }

    return allVectors;
  }

  private async persistDocumentAndChunks(
    entry: DocumentationSourceEntry,
    documentTitle: string,
    contentHash: string,
    chunks: readonly DocumentChunk[],
    embeddings: readonly number[][],
  ): Promise<void> {
    await this.databaseService.withTransaction(async (client) => {
      const docMetadata = JSON.stringify({
        license: entry.license,
        rawUrl: entry.rawUrl,
        embeddingModel: this.embeddingProvider.modelName,
      });

      const docResult = await client.query<UpsertDocumentRow>(
        `
        INSERT INTO documents (source_id, external_id, title, source_url, content_hash, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (source_id, external_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          source_url = EXCLUDED.source_url,
          content_hash = EXCLUDED.content_hash,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
        `,
        [
          entry.sourceId,
          entry.externalId,
          documentTitle,
          entry.sourceUrl,
          contentHash,
          docMetadata,
        ],
      );

      const documentId = docResult.rows[0]?.id;
      if (!documentId) {
        throw new Error(`Failed to resolve document ID for ${entry.externalId}`);
      }

      // Delete existing chunks before inserting replacements so updated documents never
      // leave orphaned trailing chunks behind when chunk count shrinks.
      await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        if (!chunk || !embedding) {
          throw new Error(`Missing chunk or embedding at index ${i}`);
        }

        await client.query(
          `
          INSERT INTO document_chunks (
            document_id,
            document_title,
            source_url,
            section_heading,
            section_anchor,
            chunk_index,
            chunk_text,
            token_count,
            embedding,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10::jsonb)
          `,
          [
            documentId,
            chunk.documentTitle,
            chunk.sourceUrl,
            chunk.sectionHeading,
            chunk.sectionAnchor,
            chunk.chunkIndex,
            chunk.chunkText,
            chunk.tokenCount,
            formatPgVector(embedding),
            JSON.stringify(chunk.metadata),
          ],
        );
      }
    });
  }
}
