import { chunkMarkdownDocument, estimateTokenCount } from './chunker';

describe('chunkMarkdownDocument', () => {
  it('never merges distinct Markdown sections into the same chunk', () => {
    const rawMarkdown = `---
title: "VSS Overview"
---

## Purpose

VSS standardizes vehicle signal names and definitions across automotive systems.

## Scope

VSS covers vehicle attributes, sensors, and actuators.`;

    const chunks = chunkMarkdownDocument(
      {
        documentTitle: 'VSS Overview',
        sourceUrl: 'https://covesa.github.io/vehicle_signal_specification/introduction/overview/',
        rawMarkdown,
      },
      { chunkSizeTokens: 500, chunkOverlapTokens: 75 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      documentTitle: 'VSS Overview',
      sectionHeading: 'Purpose',
      sectionAnchor: 'purpose',
      chunkIndex: 0,
    });
    expect(chunks[1]).toMatchObject({
      documentTitle: 'VSS Overview',
      sectionHeading: 'Scope',
      sectionAnchor: 'scope',
      chunkIndex: 1,
    });
    expect(chunks[0]?.chunkText).not.toContain('attributes, sensors');
  });

  it('splits oversized sections into bounded chunks with overlap and preserves metadata', () => {
    const paragraphOne =
      'Controllers handle incoming requests and return responses to the client. Routing associates HTTP paths with handler methods cleanly.';
    const paragraphTwo =
      'Decorators attach routing metadata to controller classes and methods. Path prefixes keep related endpoints organized together.';
    const paragraphThree =
      'Dependency injection supplies services into controller constructors automatically. This decouples HTTP transport from business logic.';

    const rawMarkdown = `### Controllers

#### Routing

${paragraphOne}

${paragraphTwo}

${paragraphThree}`;

    const chunks = chunkMarkdownDocument(
      {
        documentTitle: 'NestJS Controllers',
        sourceUrl: 'https://docs.nestjs.com/controllers',
        rawMarkdown,
        metadata: { sourceId: 'nestjs_docs', license: 'MIT' },
      },
      { chunkSizeTokens: 32, chunkOverlapTokens: 16 },
    );

    expect(chunks.length).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      expect(chunk).toBeDefined();
      expect(chunk?.chunkIndex).toBe(i);
      expect(chunk?.sectionHeading).toBe('Controllers > Routing');
      expect(chunk?.sectionAnchor).toBe('routing');
      expect(chunk?.metadata.headingHierarchy).toEqual(['Controllers', 'Routing']);
      expect(chunk?.metadata.leafHeading).toBe('Routing');
      expect(chunk?.metadata.sourceId).toBe('nestjs_docs');
      expect(chunk?.tokenCount).toBe(estimateTokenCount(chunk?.chunkText ?? ''));
    }

    // Verify overlap carries trailing content from chunk 0 into chunk 1.
    const firstChunkSentences = chunks[0]?.chunkText.split(/(?<=\.)\s+/) ?? [];
    const lastSentenceOfFirst = firstChunkSentences[firstChunkSentences.length - 1];
    expect(lastSentenceOfFirst).toBeDefined();
    expect(chunks[1]?.chunkText).toContain(lastSentenceOfFirst ?? '');
  });

  it('rejects invalid chunkSizeTokens or chunkOverlapTokens', () => {
    expect(() =>
      chunkMarkdownDocument(
        { documentTitle: 'Doc', sourceUrl: 'https://example.com', rawMarkdown: '## Hi\n\nBody' },
        { chunkSizeTokens: 100, chunkOverlapTokens: 100 },
      ),
    ).toThrow(/chunkOverlapTokens/);
  });
});
