import { QueryResult } from 'pg';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { EmbeddingProvider } from '../embeddings/embedding.provider';
import { RetrievalService } from './retrieval.service';

interface FakeRetrievalRow {
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

describe('RetrievalService', () => {
  let embedQueryMock: jest.Mock<Promise<number[]>, [string]>;
  let dbQueryMock: jest.Mock<
    Promise<QueryResult<FakeRetrievalRow>>,
    [string, (readonly unknown[])?]
  >;
  let retrievalService: RetrievalService;

  beforeEach(() => {
    embedQueryMock = jest.fn<Promise<number[]>, [string]>().mockResolvedValue([0.1, 0.2, 0.3]);
    dbQueryMock = jest.fn<
      Promise<QueryResult<FakeRetrievalRow>>,
      [string, (readonly unknown[])?]
    >();

    const mockConfig = {
      retrievalTopK: 5,
      retrievalMinScore: 0.35,
    } as unknown as AppConfigService;

    const mockDatabase = {
      query: dbQueryMock,
    } as unknown as DatabaseService;

    const mockEmbeddingProvider: EmbeddingProvider = {
      modelName: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 3,
      embedQuery: embedQueryMock,
      embedDocuments: (texts) => Promise.resolve(texts.map(() => [0.1, 0.2, 0.3])),
    };

    retrievalService = new RetrievalService(mockConfig, mockDatabase, mockEmbeddingProvider);
  });

  it('embeds the query, passes parameterized threshold/topK to pgvector SQL, and maps anchor URLs', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          source_id: 'covesa_vss',
          external_id: 'docs-gen/content/introduction/overview.md',
          document_title: 'Overview',
          source_url:
            'https://covesa.github.io/vehicle_signal_specification/introduction/overview/',
          section_heading: 'What is VSS?',
          section_anchor: 'what-is-vss',
          chunk_index: 0,
          chunk_text: 'VSS defines a standard domain taxonomy for vehicle signals.',
          token_count: 12,
          similarity_score: 0.84216,
        },
        {
          chunk_id: 'chunk-2',
          document_id: 'doc-2',
          source_id: 'nestjs_docs',
          external_id: 'content/controllers.md',
          document_title: 'Controllers',
          source_url: 'https://docs.nestjs.com/controllers',
          section_heading: 'Controllers',
          section_anchor: null,
          chunk_index: 0,
          chunk_text: 'Controllers handle incoming HTTP requests.',
          token_count: 8,
          similarity_score: '0.61042',
        },
      ],
      command: 'SELECT',
      rowCount: 2,
      oid: 0,
      fields: [],
    });

    const results = await retrievalService.retrieve('  What is VSS?  ', {
      topK: 3,
      minScore: 0.4,
    });

    expect(embedQueryMock).toHaveBeenCalledWith('What is VSS?');
    expect(dbQueryMock).toHaveBeenCalledTimes(1);

    const [sql, params] = dbQueryMock.mock.calls[0] ?? [];
    expect(sql).toContain('1 - (dc.embedding <=> $1::vector) >= $2');
    expect(sql).toContain('ORDER BY dc.embedding <=> $1::vector ASC');
    expect(sql).toContain('LIMIT $3');
    expect(params).toEqual(['[0.1,0.2,0.3]', 0.4, 3]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      chunkId: 'chunk-1',
      sourceUrl:
        'https://covesa.github.io/vehicle_signal_specification/introduction/overview/#what-is-vss',
      baseSourceUrl: 'https://covesa.github.io/vehicle_signal_specification/introduction/overview/',
      sectionHeading: 'What is VSS?',
      score: 0.8422,
    });
    expect(results[1]).toMatchObject({
      chunkId: 'chunk-2',
      sourceUrl: 'https://docs.nestjs.com/controllers',
      sectionAnchor: null,
      score: 0.6104,
    });
  });

  it('rejects empty questions and invalid retrieval parameters', async () => {
    await expect(retrievalService.retrieve('   ')).rejects.toThrow(/empty question/);
    await expect(retrievalService.retrieve('Valid question', { topK: 0 })).rejects.toThrow(/topK/);
    await expect(retrievalService.retrieve('Valid question', { minScore: 1.5 })).rejects.toThrow(
      /minScore/,
    );
  });
});
