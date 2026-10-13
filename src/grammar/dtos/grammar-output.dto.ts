import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { JlptLevel } from '../../vocabulary/constants/word.constant';

export class LocalizedTextOutput {
  @ApiProperty()
  en: string;

  @ApiProperty()
  ru: string;
}

export class GrammarPointSummaryOutput {
  @ApiProperty()
  id: number;

  @ApiProperty()
  code: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  exerciseCount: number;
}

export class GrammarLessonOutput {
  @ApiProperty()
  lesson: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  lessonTo: number | null;

  @ApiProperty({ enum: JlptLevel })
  level: JlptLevel;

  @ApiProperty({ type: [GrammarPointSummaryOutput] })
  points: GrammarPointSummaryOutput[];
}

export class GrammarQuestionOutput {
  @ApiProperty()
  exerciseId: number;

  @ApiProperty()
  lesson: number;

  @ApiProperty()
  pointTitle: string;

  @ApiProperty({ description: 'Sentence with one ＿＿ blank' })
  sentence: string;

  @ApiProperty({ type: LocalizedTextOutput })
  translation: LocalizedTextOutput;

  @ApiProperty({ type: [String] })
  options: string[];
}

export class GrammarAnswerOutput {
  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty()
  correctAnswer: string;

  @ApiProperty()
  newBox: number;

  @ApiProperty()
  nextReviewAt: Date;

  @ApiProperty({ type: LocalizedTextOutput })
  rule: LocalizedTextOutput;
}
