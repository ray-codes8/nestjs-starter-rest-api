import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { JlptLevel } from '../../vocabulary/constants/word.constant';

export class ProgressSummaryQueryInput {
  @ApiProperty({ enum: JlptLevel })
  @IsEnum(JlptLevel)
  level: JlptLevel;
}
