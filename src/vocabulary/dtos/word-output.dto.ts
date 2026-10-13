import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { JlptLevel, PartOfSpeech } from '../constants/word.constant';

export class WordOutput {
  @Expose()
  @ApiProperty()
  id: number;

  @Expose()
  @ApiPropertyOptional({ type: String, nullable: true })
  kanji: string | null;

  @Expose()
  @ApiProperty()
  kana: string;

  @Expose()
  @ApiProperty()
  romaji: string;

  @Expose()
  @ApiProperty()
  meaningEn: string;

  @Expose()
  @ApiProperty({ enum: PartOfSpeech })
  partOfSpeech: PartOfSpeech;

  @Expose()
  @ApiPropertyOptional({ type: Number, nullable: true })
  verbGroup: number | null;

  @Expose()
  @ApiProperty({ enum: JlptLevel })
  level: JlptLevel;
}
