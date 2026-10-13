import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class GrammarQuizQueryInput {
  @ApiPropertyOptional({ description: 'Lesson number 1–50 or "all" (default)', example: '36' })
  @IsOptional()
  @Matches(/^(all|[1-9]|[1-4][0-9]|50)$/)
  lesson = 'all';

  @ApiPropertyOptional({ description: '1–20, defaults to 10', type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  count = 10;
}
