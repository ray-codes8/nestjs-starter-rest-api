import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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
import { ExplanationInput } from '../dtos/explanation-input.dto';
import { ExplanationOutput } from '../dtos/explanation-output.dto';
import { ExplanationService } from '../services/explanation.service';

@ApiTags('explanations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('explanations')
export class ExplanationController {
  constructor(private readonly explanationService: ExplanationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Explain a wrong quiz answer with Claude (cached)' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse(ExplanationOutput) })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: BaseApiErrorResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: BaseApiErrorResponse })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, type: BaseApiErrorResponse })
  async explain(
    @ReqContext() ctx: RequestContext,
    @Body() input: ExplanationInput,
  ): Promise<BaseApiResponse<ExplanationOutput>> {
    const explanation = await this.explanationService.explain(ctx, input);
    return { data: explanation, meta: {} };
  }
}
