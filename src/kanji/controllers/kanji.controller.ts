import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BaseApiErrorResponse, BaseApiResponse, SwaggerBaseApiResponse } from '../../shared/dtos/base-api-response.dto';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { KanjiAnswerInput } from '../dtos/kanji-answer-input.dto';
import { KanjiAnswerOutput, KanjiQuestionOutput, KanjiRangesOutput } from '../dtos/kanji-output.dto';
import { KanjiQuizQueryInput } from '../dtos/kanji-quiz-query.dto';
import { KanjiService } from '../services/kanji.service';

@ApiTags('kanji')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class KanjiController {
  constructor(private readonly kanjiService: KanjiService) {}

  @Get('kanji/ranges')
  @ApiOperation({ summary: 'Imported kanji count and number range' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse(KanjiRangesOutput) })
  async getRanges(@ReqContext() ctx: RequestContext): Promise<BaseApiResponse<KanjiRangesOutput>> {
    return { data: await this.kanjiService.getRanges(ctx), meta: {} };
  }

  @Get('quiz/kanji')
  @ApiOperation({ summary: 'Kanji quiz: picture → kanji, kanji → meaning, word → reading' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([KanjiQuestionOutput]) })
  async getQuiz(
    @ReqContext() ctx: RequestContext,
    @Query() query: KanjiQuizQueryInput,
  ): Promise<BaseApiResponse<KanjiQuestionOutput[]>> {
    const questions = await this.kanjiService.getQuiz(ctx, query.type, query.from, query.to, query.count);
    return { data: questions, meta: { count: questions.length } };
  }

  @Post('kanji/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check a kanji answer, update progress and return the kanji card' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse(KanjiAnswerOutput) })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: BaseApiErrorResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: BaseApiErrorResponse })
  async answer(
    @ReqContext() ctx: RequestContext,
    @Body() input: KanjiAnswerInput,
  ): Promise<BaseApiResponse<KanjiAnswerOutput>> {
    return { data: await this.kanjiService.answer(ctx, input), meta: {} };
  }
}
