import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_PROVIDER, LlmProvider, LlmProviderError } from '../llm/llm.provider';
import { RetrievedChunk, RetrievalService } from '../retrieval/retrieval.service';
import { AskQuestionDto, AskQuestionResponseDto, CitationSourceDto } from './ask-question.dto';
import { validateAndSanitizeCitations } from './citation-validator';
import { INSUFFICIENT_CONTEXT_MESSAGE, buildGroundedPrompts } from './prompt-builder';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProvider,
  ) {}

  async answerQuestion(dto: AskQuestionDto): Promise<AskQuestionResponseDto> {
    const retrievedChunks = await this.retrievalService.retrieve(dto.question);

    if (retrievedChunks.length === 0) {
      return {
        answer: INSUFFICIENT_CONTEXT_MESSAGE,
        sources: [],
      };
    }

    const sources = this.mapChunksToSources(retrievedChunks);
    const { systemPrompt, userPrompt } = buildGroundedPrompts(dto.question, retrievedChunks);

    let rawAnswer: string;
    try {
      const llmResponse = await this.llmProvider.generate({
        systemPrompt,
        userPrompt,
      });
      rawAnswer = llmResponse.content;
    } catch (error: unknown) {
      throw this.mapLlmErrorToHttpException(error);
    }

    const validation = validateAndSanitizeCitations(rawAnswer, retrievedChunks.length);

    if (validation.invalidCitationNumbers.length > 0) {
      this.logger.warn(
        `Stripped out-of-range citation reference(s) [${validation.invalidCitationNumbers.join(', ')}] from LLM output`,
      );
    }

    if (validation.hasInsufficientContextSignal) {
      return {
        answer: validation.sanitizedAnswer || INSUFFICIENT_CONTEXT_MESSAGE,
        sources,
      };
    }

    // Do not treat prompt instructions as a guarantee: if the model failed to produce
    // any valid in-range citation, reject the ungrounded prose safely.
    if (validation.validCitationNumbers.length === 0 || !validation.sanitizedAnswer) {
      this.logger.warn(
        'LLM response contained no valid citations; falling back to insufficient-context response',
      );
      return {
        answer: INSUFFICIENT_CONTEXT_MESSAGE,
        sources,
      };
    }

    return {
      answer: validation.sanitizedAnswer,
      sources,
    };
  }

  private mapChunksToSources(chunks: readonly RetrievedChunk[]): CitationSourceDto[] {
    return chunks.map((chunk, index) => ({
      number: index + 1,
      title: chunk.documentTitle,
      url: chunk.sourceUrl,
      section: chunk.sectionHeading,
      excerpt: chunk.chunkText,
      score: chunk.score,
    }));
  }

  private mapLlmErrorToHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    if (error instanceof LlmProviderError) {
      if (error.isRateLimit || error.statusCode === 429) {
        return new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      if (error.statusCode === 503) {
        return new HttpException(error.message, HttpStatus.SERVICE_UNAVAILABLE);
      }
      return new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }

    const message = error instanceof Error ? error.message : 'Unexpected LLM failure';
    return new HttpException(message, HttpStatus.BAD_GATEWAY);
  }
}
