export interface AskQuestionRequest {
  question: string;
}

export interface CitationSource {
  number: number;
  title: string;
  url: string;
  section: string;
  excerpt: string;
  score: number;
}

export interface AskQuestionResponse {
  answer: string;
  sources: CitationSource[];
}

export type AnswerSegment =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'citation';
      number: number;
      source?: CitationSource;
    };
