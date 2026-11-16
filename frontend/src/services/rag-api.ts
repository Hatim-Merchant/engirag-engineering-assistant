import type {
  AnswerSegment,
  AskQuestionRequest,
  AskQuestionResponse,
  CitationSource,
} from '../types/rag';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

export class RagApiError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'RagApiError';
    this.statusCode = statusCode;
  }
}

interface NestErrorBody {
  message?: string | string[];
  error?: string;
}

/**
 * Sends a question to POST /ask and returns the grounded answer alongside
 * numbered documentation citations.
 */
export async function askEngineeringQuestion(question: string): Promise<AskQuestionResponse> {
  const payload: AskQuestionRequest = { question: question.trim() };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new RagApiError('Unable to reach the EngiRAG backend. Verify the API server is running.');
  }

  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as NestErrorBody;
      if (Array.isArray(errorBody.message)) {
        message = errorBody.message.join('; ');
      } else if (typeof errorBody.message === 'string' && errorBody.message.trim()) {
        message = errorBody.message;
      }
    } catch {
      // Keep default HTTP status message when error response is non-JSON.
    }

    throw new RagApiError(message, response.status);
  }

  const data = (await response.json()) as Partial<AskQuestionResponse>;
  if (typeof data.answer !== 'string' || !Array.isArray(data.sources)) {
    throw new RagApiError('Received malformed response payload from EngiRAG backend.', 502);
  }

  return {
    answer: data.answer,
    sources: data.sources,
  };
}

/**
 * Splits an answer string containing inline `[1]`, `[2]` citations into safe,
 * typed segments so Vue templates can render clickable links without `v-html`.
 */
export function parseAnswerSegments(
  answer: string,
  sources: readonly CitationSource[],
): AnswerSegment[] {
  const cleanedAnswer = answer
    .replace(/\*{1,3}\s*(\[\s*\d+\s*\])\s*\*{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');

  const sourceByNumber = new Map<number, CitationSource>();
  for (const source of sources) {
    sourceByNumber.set(source.number, source);
  }

  const segments: AnswerSegment[] = [];
  const pattern = /\[(\d+)\]/g;
  let lastIndex = 0;

  for (const match of cleanedAnswer.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        text: cleanedAnswer.slice(lastIndex, matchIndex),
      });
    }

    const citationNumber = Number.parseInt(match[1] ?? '', 10);
    const matchedSource = Number.isInteger(citationNumber)
      ? sourceByNumber.get(citationNumber)
      : undefined;

    if (matchedSource) {
      segments.push({
        type: 'citation',
        number: citationNumber,
        source: matchedSource,
      });
    } else {
      segments.push({
        type: 'text',
        text: match[0],
      });
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < cleanedAnswer.length) {
    segments.push({
      type: 'text',
      text: cleanedAnswer.slice(lastIndex),
    });
  }

  return segments;
}
