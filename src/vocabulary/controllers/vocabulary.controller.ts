import {
  Controller,
  Get,
  HttpStatus,
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
  BaseApiResponse,
  SwaggerBaseApiResponse,
} from '../../shared/dtos/base-api-response.dto';
import { AppLogger } from '../../shared/logger/logger.service';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { VocabularyQueryInput } from '../dtos/vocabulary-query.dto';
import { WordOutput } from '../dtos/word-output.dto';
import { VocabularyService } from '../services/vocabulary.service';

@ApiTags('vocabulary')
@Controller('vocabulary')
export class VocabularyController {
  constructor(
    private readonly vocabularyService: VocabularyService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(VocabularyController.name);
  }

  @Get()
  @ApiOperation({ summary: 'List words of a JLPT level' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SwaggerBaseApiResponse([WordOutput]),
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getWords(
    @ReqContext() ctx: RequestContext,
    @Query() query: VocabularyQueryInput,
  ): Promise<BaseApiResponse<WordOutput[]>> {
    const { words, count } = await this.vocabularyService.getWords(
      ctx,
      query.level,
      query.limit,
      query.offset,
    );
    return { data: words, meta: { count } };
  }
}
