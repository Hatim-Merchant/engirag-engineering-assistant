import { RetrievedChunk } from '../retrieval/retrieval.service';

export const INSUFFICIENT_CONTEXT_MESSAGE =
  'I do not have enough information in the indexed engineering documentation to answer this question.';

export interface GroundedPrompts {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Constructs system and user prompts that restrict the LLM exclusively to
 * retrieved documentation passages and require inline numbered citations.
 */
export function buildGroundedPrompts(
  question: string,
  chunks: readonly RetrievedChunk[],
): GroundedPrompts {
  const maxSourceNumber = chunks.length;

  const systemPrompt = [
    'You are EngiRAG, a technical engineering documentation assistant.',
    'Follow these strict grounding rules:',
    '1. Answer EXCLUSIVELY using the numbered documentation excerpts provided in the user prompt.',
    '2. Do NOT use outside knowledge, assumptions, or unstated implementation details.',
    '3. Do NOT invent document titles, section names, APIs, parameters, or URLs.',
    `4. Cite every factual claim inline using numbered square brackets from [1] to [${maxSourceNumber}] matching the exact source numbers provided.`,
    '5. Never cite a source number that was not provided.',
    `6. If the provided excerpts cover part of the question, answer the supported parts thoroughly with [1] to [${maxSourceNumber}] citations and briefly note any detail not covered. Reply with "${INSUFFICIENT_CONTEXT_MESSAGE}" ONLY when none of the provided excerpts are relevant to the question.`,
    '7. Keep answers concise, accurate, and directly supported by the supplied text.',
    '8. Write in clean plain text without Markdown formatting: do NOT use asterisks (* or **), bold or italic markers, Markdown links, or headings. Format citations strictly as plain [1] brackets without surrounding asterisks.',
  ].join('\n');

  const formattedSources = chunks
    .map((chunk, index) => {
      const sourceNumber = index + 1;
      return [
        `[${sourceNumber}] Title: ${chunk.documentTitle} | Section: ${chunk.sectionHeading} | URL: ${chunk.sourceUrl}`,
        'Content:',
        chunk.chunkText,
      ].join('\n');
    })
    .join('\n\n---\n\n');

  const userPrompt = [
    'Indexed Documentation Sources:',
    '',
    formattedSources,
    '',
    `Question: ${question}`,
  ].join('\n');

  return { systemPrompt, userPrompt };
}
