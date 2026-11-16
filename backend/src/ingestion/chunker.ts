import { parseMarkdownSections } from './markdown-parser';

export interface ChunkingOptions {
  chunkSizeTokens: number;
  chunkOverlapTokens: number;
}

export interface DocumentChunkInput {
  documentTitle: string;
  sourceUrl: string;
  rawMarkdown: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentChunk {
  documentTitle: string;
  sourceUrl: string;
  sectionHeading: string;
  sectionAnchor: string | null;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
  metadata: {
    headingHierarchy: string[];
    leafHeading: string;
    [key: string]: unknown;
  };
}

interface TextUnit {
  text: string;
  tokens: number;
  joiner: '\n\n' | ' ';
}

/**
 * Deterministic offline subword-style token estimator.
 * Splits CamelCase identifiers, words, numbers, and punctuation individually
 * to approximate WordPiece token counts without requiring network access.
 */
export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const tokens = trimmed.match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\b)|[0-9]+|[^\sA-Za-z0-9]/g);
  return tokens ? tokens.length : 0;
}

function splitIntoParagraphBlocks(content: string): string[] {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let activeFenceChar: '`' | '~' | null = null;
  let activeFenceLength = 0;

  const flushBlock = (): void => {
    const joined = currentBlock.join('\n').trim();
    currentBlock = [];
    if (joined) {
      blocks.push(joined);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

    if (!activeFenceChar && fenceMatch?.[1]) {
      activeFenceChar = fenceMatch[1][0] === '~' ? '~' : '`';
      activeFenceLength = fenceMatch[1].length;
      currentBlock.push(line);
      continue;
    }

    if (activeFenceChar) {
      currentBlock.push(line);
      if (
        fenceMatch?.[1] &&
        (fenceMatch[1][0] === '~' ? '~' : '`') === activeFenceChar &&
        fenceMatch[1].length >= activeFenceLength &&
        trimmed.replace(/[`~]/g, '').length === 0
      ) {
        activeFenceChar = null;
        activeFenceLength = 0;
      }
      continue;
    }

    if (trimmed === '') {
      flushBlock();
      continue;
    }

    currentBlock.push(line);
  }

  flushBlock();
  return blocks;
}

function splitIntoSentences(paragraph: string): string[] {
  const parts = paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z0-9`"'([*])/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [paragraph];
}

function splitOversizedTextByWords(
  text: string,
  maxTokens: number,
  overlapTokens: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return [text];
  }

  const slices: string[] = [];
  let startIndex = 0;

  while (startIndex < words.length) {
    let endIndex = startIndex;
    const currentWords: string[] = [];

    while (endIndex < words.length) {
      const candidateWord = words[endIndex];
      if (!candidateWord) {
        break;
      }
      const nextText = [...currentWords, candidateWord].join(' ');
      if (currentWords.length > 0 && estimateTokenCount(nextText) > maxTokens) {
        break;
      }
      currentWords.push(candidateWord);
      endIndex += 1;
    }

    slices.push(currentWords.join(' '));
    if (endIndex >= words.length) {
      break;
    }

    if (overlapTokens <= 0) {
      startIndex = endIndex;
      continue;
    }

    let backIndex = endIndex;
    let overlapCollected = 0;
    while (backIndex > startIndex + 1) {
      const prevWord = words[backIndex - 1];
      if (!prevWord) {
        break;
      }
      const wordTokens = estimateTokenCount(prevWord);
      if (overlapCollected + wordTokens > overlapTokens) {
        break;
      }
      overlapCollected += wordTokens;
      backIndex -= 1;
    }

    // Guarantee forward progress even if a single word exceeds overlapTokens.
    startIndex = backIndex < endIndex ? backIndex : endIndex;
  }

  return slices;
}

function expandSectionToUnits(
  content: string,
  maxTokens: number,
  overlapTokens: number,
): TextUnit[] {
  const paragraphs = splitIntoParagraphBlocks(content);
  const units: TextUnit[] = [];

  for (const paragraph of paragraphs) {
    const isFencedCode = /^(```|~~~)/.test(paragraph.trim());
    if (isFencedCode) {
      const codeTokens = estimateTokenCount(paragraph);
      if (codeTokens <= maxTokens) {
        units.push({ text: paragraph, tokens: codeTokens, joiner: '\n\n' });
      } else {
        for (const slice of splitOversizedTextByWords(paragraph, maxTokens, overlapTokens)) {
          units.push({
            text: slice,
            tokens: estimateTokenCount(slice),
            joiner: '\n\n',
          });
        }
      }
      continue;
    }

    // Expand prose paragraphs into sentence units so overlap can carry trailing sentences
    // across chunks even when whole paragraphs exceed chunkOverlapTokens.
    const sentences = splitIntoSentences(paragraph);
    for (let sIdx = 0; sIdx < sentences.length; sIdx += 1) {
      const sentence = sentences[sIdx];
      if (!sentence) {
        continue;
      }
      const joiner: '\n\n' | ' ' = sIdx === 0 ? '\n\n' : ' ';
      const sentenceTokens = estimateTokenCount(sentence);
      if (sentenceTokens <= maxTokens) {
        units.push({ text: sentence, tokens: sentenceTokens, joiner });
      } else {
        const slices = splitOversizedTextByWords(sentence, maxTokens, overlapTokens);
        for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx += 1) {
          const slice = slices[sliceIdx];
          if (!slice) {
            continue;
          }
          units.push({
            text: slice,
            tokens: estimateTokenCount(slice),
            joiner: sliceIdx === 0 ? joiner : ' ',
          });
        }
      }
    }
  }

  return units;
}

function joinUnits(units: readonly TextUnit[]): string {
  let result = '';

  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    if (!unit) {
      continue;
    }
    if (i === 0) {
      result = unit.text;
    } else {
      result += `${unit.joiner}${unit.text}`;
    }
  }

  return result;
}

function collectOverlapTail(
  units: readonly TextUnit[],
  maxOverlapTokens: number,
  nextUnitTokens: number,
  maxChunkTokens: number,
): TextUnit[] {
  if (maxOverlapTokens <= 0 || units.length === 0) {
    return [];
  }

  const collected: TextUnit[] = [];
  let overlapTokens = 0;

  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (!unit) {
      continue;
    }
    if (overlapTokens + unit.tokens > maxOverlapTokens) {
      break;
    }
    if (overlapTokens + unit.tokens + nextUnitTokens > maxChunkTokens) {
      break;
    }
    collected.unshift(unit);
    overlapTokens += unit.tokens;
  }

  return collected;
}

function splitSectionIntoChunks(
  content: string,
  options: ChunkingOptions,
): Array<{ text: string; tokenCount: number }> {
  const totalTokens = estimateTokenCount(content);
  if (totalTokens === 0) {
    return [];
  }

  if (totalTokens <= options.chunkSizeTokens) {
    return [{ text: content, tokenCount: totalTokens }];
  }

  const units = expandSectionToUnits(content, options.chunkSizeTokens, options.chunkOverlapTokens);

  const chunks: Array<{ text: string; tokenCount: number }> = [];
  let currentUnits: TextUnit[] = [];

  for (const unit of units) {
    if (currentUnits.length === 0) {
      currentUnits.push(unit);
      continue;
    }

    const candidateText = joinUnits([...currentUnits, unit]);
    const candidateTokens = estimateTokenCount(candidateText);

    if (candidateTokens <= options.chunkSizeTokens) {
      currentUnits.push(unit);
      continue;
    }

    const finalizedText = joinUnits(currentUnits);
    chunks.push({
      text: finalizedText,
      tokenCount: estimateTokenCount(finalizedText),
    });

    const overlapUnits = collectOverlapTail(
      currentUnits,
      options.chunkOverlapTokens,
      unit.tokens,
      options.chunkSizeTokens,
    );
    currentUnits = [...overlapUnits, unit];
  }

  if (currentUnits.length > 0) {
    const finalizedText = joinUnits(currentUnits);
    chunks.push({
      text: finalizedText,
      tokenCount: estimateTokenCount(finalizedText),
    });
  }

  return chunks;
}

/**
 * Two-stage heading-aware Markdown chunker:
 * Stage 1 separates sections along heading boundaries so unrelated topics never mix.
 * Stage 2 splits oversized sections by paragraph/sentence boundaries with bounded overlap.
 */
export function chunkMarkdownDocument(
  input: DocumentChunkInput,
  options: ChunkingOptions,
): DocumentChunk[] {
  if (options.chunkSizeTokens <= 0) {
    throw new Error('chunkSizeTokens must be greater than 0');
  }
  if (options.chunkOverlapTokens < 0 || options.chunkOverlapTokens >= options.chunkSizeTokens) {
    throw new Error('chunkOverlapTokens must be >= 0 and smaller than chunkSizeTokens');
  }

  const parsed = parseMarkdownSections(input.rawMarkdown, input.documentTitle);
  const resolvedTitle = parsed.title || input.documentTitle;
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const section of parsed.sections) {
    const sectionChunks = splitSectionIntoChunks(section.content, options);

    for (const part of sectionChunks) {
      chunks.push({
        documentTitle: resolvedTitle,
        sourceUrl: input.sourceUrl,
        sectionHeading: section.sectionHeading,
        sectionAnchor: section.sectionAnchor,
        chunkIndex,
        chunkText: part.text,
        tokenCount: part.tokenCount,
        metadata: {
          ...(input.metadata ?? {}),
          headingHierarchy: section.headingHierarchy,
          leafHeading: section.leafHeading,
        },
      });
      chunkIndex += 1;
    }
  }

  return chunks;
}
