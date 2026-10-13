import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { JlptLevel } from '../../vocabulary/constants/word.constant';

export class QuizQueryInput {
  @ApiProperty({ enum: JlptLevel })
  @IsEnum(JlptLevel)
  level: JlptLevel;

  @ApiPropertyOptional({ description: '1–20, defaults to 10', type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  count = 10;
}
