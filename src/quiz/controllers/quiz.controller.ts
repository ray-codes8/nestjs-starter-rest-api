import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  BaseApiErrorResponse,
  BaseApiResponse,
  SwaggerBaseApiResponse,
} from '../../shared/dtos/base-api-response.dto';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { QuizAnswerInput } from '../dtos/quiz-answer-input.dto';
import {
  QuizAnswerOutput,
  VerbQuestionOutput,
  VocabularyQuestionOutput,
} from '../dtos/quiz-output.dto';
import { QuizQueryInput } from '../dtos/quiz-query.dto';
import { QuizService } from '../services/quiz.service';

@ApiTags('quiz')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('vocabulary')
  @ApiOperation({ summary: 'Vocabulary quiz: due words first, then new ones' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([VocabularyQuestionOutput]) })
  async getVocabularyQuiz(
    @ReqContext() ctx: RequestContext,
    @Query() query: QuizQueryInput,
  ): Promise<BaseApiResponse<VocabularyQuestionOutput[]>> {
    const questions = await this.quizService.getVocabularyQuiz(ctx, query.level, query.count);
    return { data: questions, meta: { count: questions.length } };
  }

  @Get('verbs')
  @ApiOperation({ summary: 'Verb conjugation quiz (ます / て / ない / た forms)' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([VerbQuestionOutput]) })
  async getVerbQuiz(
    @ReqContext() ctx: RequestContext,
    @Query() query: QuizQueryInput,
  ): Promise<BaseApiResponse<VerbQuestionOutput[]>> {
    const questions = await this.quizService.getVerbQuiz(ctx, query.level, query.count);
    return { data: questions, meta: { count: questions.length } };
  }

  @Post('answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check an answer and update spaced-repetition progress' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse(QuizAnswerOutput) })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: BaseApiErrorResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: BaseApiErrorResponse })
  async answer(
    @ReqContext() ctx: RequestContext,
    @Body() input: QuizAnswerInput,
  ): Promise<BaseApiResponse<QuizAnswerOutput>> {
    const result = await this.quizService.answer(ctx, input);
    return { data: result, meta: {} };
  }
}
