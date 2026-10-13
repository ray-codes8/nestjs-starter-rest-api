import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { PaginationParamsDto } from '../../shared/dtos/pagination-params.dto';
import { JlptLevel } from '../constants/word.constant';

export class VocabularyQueryInput extends PaginationParamsDto {
  @ApiProperty({ enum: JlptLevel })
  @IsEnum(JlptLevel)
  level: JlptLevel;
}
