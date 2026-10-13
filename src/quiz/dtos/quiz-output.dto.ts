import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VerbForm } from '../domain/conjugation';

export class VocabularyQuestionOutput {
  @ApiProperty()
  wordId: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  kanji: string | null;

  @ApiProperty()
  kana: string;

  @ApiProperty({ type: [String] })
  options: string[];
}

export class VerbQuestionOutput extends VocabularyQuestionOutput {
  @ApiProperty({ enum: VerbForm })
  form: VerbForm;
}

export class QuizAnswerOutput {
  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty()
  correctAnswer: string;

  @ApiProperty({ description: 'Leitner box after this answer (1–5)' })
  newBox: number;

  @ApiProperty()
  nextReviewAt: Date;
}
