import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { KanjiQuizKind } from '../domain/kanji-quiz';
import { KANJI_QUIZ_KINDS } from './kanji-quiz-query.dto';

export class KanjiAnswerInput {
  @ApiProperty({ enum: KANJI_QUIZ_KINDS })
  @IsIn(KANJI_QUIZ_KINDS)
  type: KanjiQuizKind;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  kanjiId: number;

  @ApiPropertyOptional({ description: 'Required for reading answers' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  compoundId?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  answer: string;
}
