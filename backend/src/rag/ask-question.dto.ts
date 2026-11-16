import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const askQuestionSchema = z.object({
  question: z
    .string({ required_error: 'question is required' })
    .trim()
    .min(3, 'Question must be at least 3 characters long')
    .max(1000, 'Question must not exceed 1000 characters'),
});

export type AskQuestionDto = z.infer<typeof askQuestionSchema>;

export interface CitationSourceDto {
  number: number;
  title: string;
  url: string;
  section: string;
  excerpt: string;
  score: number;
}

export interface AskQuestionResponseDto {
  answer: string;
  sources: CitationSourceDto[];
}

export function validateAskQuestionDto(body: unknown): AskQuestionDto {
  const parsed = askQuestionSchema.safeParse(body);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new BadRequestException(details);
  }

  return parsed.data;
}
