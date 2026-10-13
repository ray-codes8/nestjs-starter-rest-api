import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { KanjiQuizKind } from '../domain/kanji-quiz';

export const KANJI_QUIZ_KINDS: KanjiQuizKind[] = ['picture', 'meaning', 'reading'];
const toInt = ({ value }: { value: string }) => parseInt(value, 10);

export class KanjiQuizQueryInput {
  @ApiProperty({ enum: KANJI_QUIZ_KINDS })
  @IsIn(KANJI_QUIZ_KINDS)
  type: KanjiQuizKind;

  @ApiPropertyOptional({ type: Number, description: 'First kanji number (default 1)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(400)
  @Transform(toInt, { toClassOnly: true })
  from = 1;

  @ApiPropertyOptional({ type: Number, description: 'Last kanji number (default 400)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(400)
  @Transform(toInt, { toClassOnly: true })
  to = 400;

  @ApiPropertyOptional({ type: Number, description: '1–20, defaults to 10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Transform(toInt, { toClassOnly: true })
  count = 10;
}
