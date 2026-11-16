import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AskQuestionResponseDto, validateAskQuestionDto } from './ask-question.dto';
import { RagService } from './rag.service';

@Controller()
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async ask(@Body() body: unknown): Promise<AskQuestionResponseDto> {
    const dto = validateAskQuestionDto(body);
    return this.ragService.answerQuestion(dto);
  }
}
