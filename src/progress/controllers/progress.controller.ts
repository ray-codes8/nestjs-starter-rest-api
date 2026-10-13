import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
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
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { ProgressSummaryOutput } from '../dtos/progress-summary-output.dto';
import { ProgressSummaryQueryInput } from '../dtos/progress-summary-query.dto';
import { ProgressService } from '../services/progress.service';

@ApiTags('progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Learning progress of the current user for a level' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SwaggerBaseApiResponse(ProgressSummaryOutput),
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getSummary(
    @ReqContext() ctx: RequestContext,
    @Query() query: ProgressSummaryQueryInput,
  ): Promise<BaseApiResponse<ProgressSummaryOutput>> {
    const summary = await this.progressService.getSummary(ctx, query.level);
    return { data: summary, meta: {} };
  }
}
