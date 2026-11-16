import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AskQuestionDto, AskQuestionResponseDto } from './ask-question.dto';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

describe('RagController', () => {
  let controller: RagController;
  let answerQuestionMock: jest.Mock<Promise<AskQuestionResponseDto>, [AskQuestionDto]>;

  beforeEach(async () => {
    answerQuestionMock = jest.fn<Promise<AskQuestionResponseDto>, [AskQuestionDto]>();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RagController],
      providers: [
        {
          provide: RagService,
          useValue: {
            answerQuestion: answerQuestionMock,
          },
        },
      ],
    }).compile();

    controller = moduleRef.get<RagController>(RagController);
  });

  it('validates input and returns structured answer with sources', async () => {
    const expectedResponse: AskQuestionResponseDto = {
      answer: 'Controllers handle incoming HTTP requests [1].',
      sources: [
        {
          number: 1,
          title: 'Controllers',
          url: 'https://docs.nestjs.com/controllers',
          section: 'Controllers',
          excerpt: 'Controllers are responsible for handling incoming requests.',
          score: 0.85,
        },
      ],
    };

    answerQuestionMock.mockResolvedValueOnce(expectedResponse);

    const response = await controller.ask({ question: '  What do NestJS controllers do?  ' });

    expect(answerQuestionMock).toHaveBeenCalledWith({
      question: 'What do NestJS controllers do?',
    });
    expect(response).toEqual(expectedResponse);
  });

  it('rejects missing or too-short questions with BadRequestException', async () => {
    await expect(controller.ask({})).rejects.toThrow(BadRequestException);
    await expect(controller.ask({ question: 'hi' })).rejects.toThrow(BadRequestException);
    expect(answerQuestionMock).not.toHaveBeenCalled();
  });
});
