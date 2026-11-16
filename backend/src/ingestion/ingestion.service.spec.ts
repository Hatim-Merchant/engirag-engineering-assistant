import { createHash } from 'node:crypto';
import { PoolClient, QueryResult } from 'pg';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { EmbeddingProvider } from '../embeddings/embedding.provider';
import { DocumentFetcher } from './document-fetcher';
import { DOCUMENTATION_SOURCES } from './documentation-sources';
import { IngestionService } from './ingestion.service';

describe('IngestionService', () => {
  const sampleEntry = DOCUMENTATION_SOURCES[0]!;
  const sampleMarkdown = `---
title: "Overview"
---

## What is VSS?

Vehicle Signal Specification defines a standard vehicle signal taxonomy.`;

  let fetchMarkdownMock: jest.Mock<Promise<string>, [string]>;
  let dbQueryMock: jest.Mock<
    Promise<QueryResult<{ id: string; content_hash: string }>>,
    [string, (readonly unknown[])?]
  >;
  let clientQueryMock: jest.Mock<
    Promise<QueryResult<{ id: string }>>,
    [string, (readonly unknown[])?]
  >;
  let embedDocumentsMock: jest.Mock<Promise<number[][]>, [readonly string[]]>;
  let ingestionService: IngestionService;

  beforeEach(() => {
    fetchMarkdownMock = jest.fn<Promise<string>, [string]>();
    dbQueryMock = jest.fn<
      Promise<QueryResult<{ id: string; content_hash: string }>>,
      [string, (readonly unknown[])?]
    >();
    clientQueryMock = jest.fn<
      Promise<QueryResult<{ id: string }>>,
      [string, (readonly unknown[])?]
    >();
    embedDocumentsMock = jest
      .fn<Promise<number[][]>, [readonly string[]]>()
      .mockImplementation((texts) =>
        Promise.resolve(texts.map(() => new Array<number>(384).fill(0.05))),
      );

    const mockConfig = {
      chunkSizeTokens: 500,
      chunkOverlapTokens: 75,
    } as unknown as AppConfigService;

    const mockDatabase = {
      query: dbQueryMock,
      withTransaction: async <T>(cb: (client: PoolClient) => Promise<T>): Promise<T> => {
        const fakeClient = { query: clientQueryMock } as unknown as PoolClient;
        return cb(fakeClient);
      },
    } as unknown as DatabaseService;

    const mockFetcher = {
      fetchMarkdown: fetchMarkdownMock,
    } as unknown as DocumentFetcher;

    const mockEmbeddingProvider: EmbeddingProvider = {
      modelName: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      embedQuery: () => Promise.resolve(new Array<number>(384).fill(0.05)),
      embedDocuments: embedDocumentsMock,
    };

    ingestionService = new IngestionService(
      mockConfig,
      mockDatabase,
      mockFetcher,
      mockEmbeddingProvider,
    );
  });

  it('ingests a new document, deletes stale chunks, and inserts new chunks transactionally', async () => {
    fetchMarkdownMock.mockResolvedValueOnce(sampleMarkdown);
    dbQueryMock.mockResolvedValueOnce({
      rows: [],
      command: 'SELECT',
      rowCount: 0,
      oid: 0,
      fields: [],
    });
    clientQueryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'doc-uuid-1' }],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      })
      .mockResolvedValue({
        rows: [],
        command: 'OK',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

    const report = await ingestionService.ingest({ limit: 1 });

    expect(report.documentsFetched).toBe(1);
    expect(report.documentsProcessed).toBe(1);
    expect(report.documentsSkipped).toBe(0);
    expect(report.chunksCreated).toBe(1);
    expect(report.embeddingsGenerated).toBe(1);
    expect(report.recordsInsertedOrUpdated).toBe(2);
    expect(report.errorsEncountered).toHaveLength(0);

    // Verify transactional upsert -> delete old chunks -> insert new chunks sequence.
    expect(clientQueryMock.mock.calls[0]?.[0]).toContain('INSERT INTO documents');
    expect(clientQueryMock.mock.calls[1]?.[0]).toContain(
      'DELETE FROM document_chunks WHERE document_id = $1',
    );
    expect(clientQueryMock.mock.calls[1]?.[1]).toEqual(['doc-uuid-1']);
    expect(clientQueryMock.mock.calls[2]?.[0]).toContain('INSERT INTO document_chunks');
  });

  it('skips unchanged documents when content hash matches', async () => {
    fetchMarkdownMock.mockResolvedValueOnce(sampleMarkdown);
    const expectedHash = createHash('sha256')
      .update(sampleMarkdown)
      .update('\n')
      .update('500:75:Xenova/all-MiniLM-L6-v2')
      .digest('hex');

    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'doc-uuid-1', content_hash: expectedHash }],
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const report = await ingestionService.ingest({ limit: 1 });

    expect(report.documentsFetched).toBe(1);
    expect(report.documentsProcessed).toBe(0);
    expect(report.documentsSkipped).toBe(1);
    expect(embedDocumentsMock).not.toHaveBeenCalled();
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('records fetch errors clearly instead of silently ignoring them', async () => {
    fetchMarkdownMock.mockRejectedValueOnce(new Error('HTTP 404 Not Found'));

    const report = await ingestionService.ingest({ limit: 1 });

    expect(report.documentsFetched).toBe(0);
    expect(report.documentsProcessed).toBe(0);
    expect(report.errorsEncountered).toEqual([
      {
        sourceId: sampleEntry.sourceId,
        externalId: sampleEntry.externalId,
        stage: 'fetch',
        message: 'HTTP 404 Not Found',
      },
    ]);
  });
});
