import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KanjiRangesOutput {
  @ApiProperty()
  total: number;

  @ApiProperty()
  from: number;

  @ApiProperty()
  to: number;
}

export class KanjiQuestionOutput {
  @ApiProperty()
  kanjiId: number;

  @ApiPropertyOptional({ description: 'reading questions' })
  compoundId?: number;

  @ApiPropertyOptional({ description: 'picture questions: path under the API prefix' })
  pictureUrl?: string;

  @ApiPropertyOptional({ description: 'meaning questions' })
  character?: string;

  @ApiPropertyOptional({ description: 'reading questions' })
  word?: string;

  @ApiProperty({ type: [String] })
  options: string[];

  @ApiPropertyOptional({ type: [String], description: 'meaning questions: Russian labels, same order' })
  optionsRu?: string[];
}

export class KanjiCompoundOutput {
  @ApiProperty()
  word: string;

  @ApiProperty()
  reading: string;

  @ApiProperty()
  meaningEn: string;

  @ApiProperty()
  meaningRu: string;
}

export class KanjiCardOutput {
  @ApiProperty()
  number: number;

  @ApiProperty()
  character: string;

  @ApiProperty({ type: [String] })
  kunReadings: string[];

  @ApiProperty({ type: [String] })
  onReadings: string[];

  @ApiProperty()
  meaningEn: string;

  @ApiProperty()
  meaningRu: string;

  @ApiProperty()
  strokes: number;

  @ApiProperty()
  originEn: string;

  @ApiProperty()
  originRu: string;

  @ApiProperty()
  pictureUrl: string;

  @ApiProperty({ type: [KanjiCompoundOutput] })
  compounds: KanjiCompoundOutput[];
}

export class KanjiAnswerOutput {
  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty()
  correctAnswer: string;

  @ApiProperty()
  newBox: number;

  @ApiProperty()
  nextReviewAt: Date;

  @ApiProperty({ type: KanjiCardOutput })
  card: KanjiCardOutput;
}
