import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VerbForm } from '../domain/conjugation';

export class WordQuestionOutput {
  @ApiProperty()
  wordId: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  kanji: string | null;

  @ApiProperty()
  kana: string;

  @ApiProperty({ type: [String] })
  options: string[];
}

export class VocabularyQuestionOutput extends WordQuestionOutput {
  @ApiProperty({
    type: [String],
    description: 'Russian label for each option, same order (English fallback)',
  })
  optionsRu: string[];
}

export class VerbQuestionOutput extends WordQuestionOutput {
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
