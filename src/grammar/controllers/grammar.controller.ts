import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BaseApiErrorResponse, BaseApiResponse, SwaggerBaseApiResponse } from '../../shared/dtos/base-api-response.dto';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { GrammarAnswerInput } from '../dtos/grammar-answer-input.dto';
import { GrammarAnswerOutput, GrammarLessonOutput, GrammarQuestionOutput } from '../dtos/grammar-output.dto';
import { GrammarQuizQueryInput } from '../dtos/grammar-quiz-query.dto';
import { GrammarService } from '../services/grammar.service';

@ApiTags('grammar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class GrammarController {
  constructor(private readonly grammarService: GrammarService) {}

  @Get('grammar/lessons')
  @ApiOperation({ summary: 'Grammar lessons (≈ Minna no Nihongo) with their points' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([GrammarLessonOutput]) })
  async getLessons(@ReqContext() ctx: RequestContext): Promise<BaseApiResponse<GrammarLessonOutput[]>> {
    const lessons = await this.grammarService.getLessons(ctx);
    return { data: lessons, meta: { count: lessons.length } };
  }

  @Get('quiz/grammar')
  @ApiOperation({ summary: 'Fill-in-the-blank grammar quiz for a lesson or all lessons' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([GrammarQuestionOutput]) })
  async getQuiz(
    @ReqContext() ctx: RequestContext,
    @Query() query: GrammarQuizQueryInput,
  ): Promise<BaseApiResponse<GrammarQuestionOutput[]>> {
    const questions = await this.grammarService.getQuiz(ctx, query.lesson, query.count);
    return { data: questions, meta: { count: questions.length } };
  }

  @Post('grammar/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check a grammar answer, update progress and return the rule' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse(GrammarAnswerOutput) })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: BaseApiErrorResponse })
  async answer(
    @ReqContext() ctx: RequestContext,
    @Body() input: GrammarAnswerInput,
  ): Promise<BaseApiResponse<GrammarAnswerOutput>> {
    const result = await this.grammarService.answer(ctx, input);
    return { data: result, meta: {} };
  }
}
