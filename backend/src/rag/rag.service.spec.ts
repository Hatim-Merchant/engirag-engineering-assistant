import { HttpException, HttpStatus } from '@nestjs/common';
import {
  LlmGenerationRequest,
  LlmGenerationResponse,
  LlmProvider,
  LlmProviderError,
} from '../llm/llm.provider';
import { RetrievedChunk, RetrievalService } from '../retrieval/retrieval.service';
import { INSUFFICIENT_CONTEXT_MESSAGE } from './prompt-builder';
import { RagService } from './rag.service';

describe('RagService', () => {
  const sampleChunks: RetrievedChunk[] = [
    {
      chunkId: 'c1',
      documentId: 'd1',
      sourceId: 'covesa_vss',
      externalId: 'docs-gen/content/introduction/overview.md',
      documentTitle: 'Overview',
      sourceUrl:
        'https://covesa.github.io/vehicle_signal_specification/introduction/overview/#what-is-vss',
      baseSourceUrl: 'https://covesa.github.io/vehicle_signal_specification/introduction/overview/',
      sectionHeading: 'What is VSS?',
      sectionAnchor: 'what-is-vss',
      chunkIndex: 0,
      chunkText:
        'The Vehicle Signal Specification introduces a domain taxonomy for vehicle signals.',
      tokenCount: 15,
      score: 0.87,
    },
    {
      chunkId: 'c2',
      documentId: 'd2',
      sourceId: 'covesa_vss',
      externalId: 'docs-gen/content/rule_set/data_entry/data_types.md',
      documentTitle: 'Data Types',
      sourceUrl:
        'https://covesa.github.io/vehicle_signal_specification/rule_set/data_entry/data_types/#supported-types',
      baseSourceUrl:
        'https://covesa.github.io/vehicle_signal_specification/rule_set/data_entry/data_types/',
      sectionHeading: 'Supported Types',
      sectionAnchor: 'supported-types',
      chunkIndex: 1,
      chunkText: 'VSS defines a common signal catalog with explicit scalar and array types.',
      tokenCount: 16,
      score: 0.79,
    },
  ];

  let retrieveMock: jest.Mock<Promise<RetrievedChunk[]>, [string]>;
  let generateMock: jest.Mock<Promise<LlmGenerationResponse>, [LlmGenerationRequest]>;
  let ragService: RagService;

  beforeEach(() => {
    retrieveMock = jest.fn<Promise<RetrievedChunk[]>, [string]>();
    generateMock = jest.fn<Promise<LlmGenerationResponse>, [LlmGenerationRequest]>();

    const mockRetrievalService = {
      retrieve: retrieveMock,
    } as unknown as RetrievalService;

    const mockLlmProvider: LlmProvider = {
      providerName: 'groq',
      generate: generateMock,
    };

    ragService = new RagService(mockRetrievalService, mockLlmProvider);
  });

  it('builds grounded prompts and returns answer with valid numbered citations and sources', async () => {
    retrieveMock.mockResolvedValueOnce(sampleChunks);
    generateMock.mockResolvedValueOnce({
      content:
        'VSS introduces a domain taxonomy for vehicle signals [1] and defines explicit scalar and array types [2].',
      model: 'llama-3.1-8b-instant',
      provider: 'groq',
    });

    const result = await ragService.answerQuestion({
      question: 'What is the purpose of the Vehicle Signal Specification?',
    });

    expect(generateMock).toHaveBeenCalledTimes(1);
    const promptRequest = generateMock.mock.calls[0]?.[0];
    expect(promptRequest?.systemPrompt).toContain('Answer EXCLUSIVELY');
    expect(promptRequest?.userPrompt).toContain('[1] Title: Overview | Section: What is VSS?');
    expect(promptRequest?.userPrompt).toContain('[2] Title: Data Types | Section: Supported Types');

    expect(result.answer).toBe(
      'VSS introduces a domain taxonomy for vehicle signals [1] and defines explicit scalar and array types [2].',
    );
    expect(result.sources).toEqual([
      {
        number: 1,
        title: 'Overview',
        url: 'https://covesa.github.io/vehicle_signal_specification/introduction/overview/#what-is-vss',
        section: 'What is VSS?',
        excerpt:
          'The Vehicle Signal Specification introduces a domain taxonomy for vehicle signals.',
        score: 0.87,
      },
      {
        number: 2,
        title: 'Data Types',
        url: 'https://covesa.github.io/vehicle_signal_specification/rule_set/data_entry/data_types/#supported-types',
        section: 'Supported Types',
        excerpt: 'VSS defines a common signal catalog with explicit scalar and array types.',
        score: 0.79,
      },
    ]);
  });

  it('strips invalid out-of-range citation numbers while retaining valid ones', async () => {
    retrieveMock.mockResolvedValueOnce(sampleChunks);
    generateMock.mockResolvedValueOnce({
      content: 'VSS defines a vehicle signal taxonomy [1] and supports overlays [9].',
      model: 'llama-3.1-8b-instant',
      provider: 'groq',
    });

    const result = await ragService.answerQuestion({ question: 'What is VSS?' });

    expect(result.answer).toBe('VSS defines a vehicle signal taxonomy [1] and supports overlays.');
    expect(result.sources).toHaveLength(2);
  });

  it('strips Markdown asterisks and inline formatting around text and citations', async () => {
    retrieveMock.mockResolvedValueOnce(sampleChunks);
    generateMock.mockResolvedValueOnce({
      content:
        '1. **Declare a provider** – Use `@Injectable()` to mark the class. *[1]*\n2. *Register types* – Standard types are listed in the catalog. **[[2]](https://example.com)**',
      model: 'openai/gpt-oss-20b',
      provider: 'groq',
    });

    const result = await ragService.answerQuestion({ question: 'What is VSS?' });

    expect(result.answer).toBe(
      '1. Declare a provider – Use @Injectable() to mark the class. [1]\n2. Register types – Standard types are listed in the catalog. [2]',
    );
    expect(result.sources).toHaveLength(2);
  });

  it('falls back safely when the LLM output contains no valid citations', async () => {
    retrieveMock.mockResolvedValueOnce(sampleChunks);
    generateMock.mockResolvedValueOnce({
      content: 'Vehicle Signal Specification was invented for autonomous flight [99].',
      model: 'llama-3.1-8b-instant',
      provider: 'groq',
    });

    const result = await ragService.answerQuestion({ question: 'What is VSS?' });

    expect(result.answer).toBe(INSUFFICIENT_CONTEXT_MESSAGE);
    expect(result.sources).toHaveLength(2);
  });

  it('returns insufficient-context immediately when retrieval finds zero matching chunks', async () => {
    retrieveMock.mockResolvedValueOnce([]);

    const result = await ragService.answerQuestion({
      question: 'How do I bake sourdough bread?',
    });

    expect(generateMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      answer: INSUFFICIENT_CONTEXT_MESSAGE,
      sources: [],
    });
  });

  it('preserves explicit insufficient-context responses from the LLM', async () => {
    retrieveMock.mockResolvedValueOnce(sampleChunks);
    generateMock.mockResolvedValueOnce({
      content:
        'I do not have enough information in the indexed engineering documentation to answer this question.',
      model: 'llama-3.1-8b-instant',
      provider: 'groq',
    });

    const result = await ragService.answerQuestion({
      question: 'Does VSS define Kubernetes pod scheduling?',
    });

    expect(result.answer).toBe(INSUFFICIENT_CONTEXT_MESSAGE);
    expect(result.sources).toHaveLength(2);
  });

  it('maps LlmProviderError 429 rate-limit failures to HTTP 429', async () => {
    retrieveMock.mockResolvedValueOnce(sampleChunks);
    generateMock.mockRejectedValueOnce(
      new LlmProviderError({
        provider: 'groq',
        statusCode: 429,
        isRateLimit: true,
        message: 'Groq rate limit exceeded.',
      }),
    );

    let caught: unknown;
    try {
      await ragService.answerQuestion({ question: 'What is VSS?' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});
