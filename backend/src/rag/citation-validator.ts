export interface CitationValidationResult {
  sanitizedAnswer: string;
  validCitationNumbers: number[];
  invalidCitationNumbers: number[];
  hasInsufficientContextSignal: boolean;
}

const INSUFFICIENT_CONTEXT_PATTERNS: readonly string[] = [
  'do not have enough information',
  "don't have enough information",
  'insufficient information',
  'not contain enough information',
  'do not contain sufficient information',
  'not mentioned in the provided',
  'not covered in the indexed',
  'cannot answer this question based on',
];

/**
 * Validates all inline `[n]` (or `[1, 2]`) citations produced by the LLM against
 * the retrieved source range `1..maxSourceNumber`, stripping out-of-range references.
 */
export function validateAndSanitizeCitations(
  rawAnswer: string,
  maxSourceNumber: number,
): CitationValidationResult {
  const validCitations = new Set<number>();
  const invalidCitations = new Set<number>();

  // Normalize accidental Markdown formatting (bold/italic asterisks, citation links, inline code).
  const normalizedRaw = rawAnswer
    .replace(/\[(\[\s*\d+(?:\s*,\s*\d+)*\s*\])\]\([^)]+\)/g, '$1')
    .replace(/\*{1,3}\s*(\[\s*\d+(?:\s*,\s*\d+)*\s*\])\s*\*{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');

  const sanitizedRaw = normalizedRaw.replace(
    /\[(\s*\d+(?:\s*,\s*\d+)*\s*)\]/g,
    (_fullMatch, innerGroup: string) => {
      const numbers = innerGroup
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((num) => Number.isInteger(num));

      const keptBrackets: string[] = [];
      for (const num of numbers) {
        if (num >= 1 && num <= maxSourceNumber) {
          validCitations.add(num);
          keptBrackets.push(`[${num}]`);
        } else {
          invalidCitations.add(num);
        }
      }

      return keptBrackets.join('');
    },
  );

  // Clean up redundant spaces left when unsupported citations are removed.
  const sanitizedAnswer = sanitizedRaw
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();

  const lowered = sanitizedAnswer.toLowerCase();
  const hasInsufficientContextSignal = INSUFFICIENT_CONTEXT_PATTERNS.some((phrase) =>
    lowered.includes(phrase),
  );

  return {
    sanitizedAnswer,
    validCitationNumbers: [...validCitations],
    invalidCitationNumbers: [...invalidCitations],
    hasInsufficientContextSignal,
  };
}
