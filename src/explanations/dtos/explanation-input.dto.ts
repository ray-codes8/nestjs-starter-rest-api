import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import {
  QuizType,
  WORD_QUIZ_TYPES,
} from '../../progress/constants/quiz-type.constant';
import { VerbForm } from '../../quiz/domain/conjugation';
import { ExplanationLanguage } from '../constants/explanation-language.constant';

export class ExplanationInput {
  @ApiProperty({ enum: WORD_QUIZ_TYPES })
  @IsIn(WORD_QUIZ_TYPES)
  quizType: QuizType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  wordId: number;

  @ApiProperty({ description: 'The wrong answer the learner chose' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  chosenAnswer: string;

  @ApiPropertyOptional({ enum: VerbForm, description: 'Required for verb answers' })
  @IsOptional()
  @IsEnum(VerbForm)
  form?: VerbForm;

  @ApiProperty({ enum: ExplanationLanguage })
  @IsEnum(ExplanationLanguage)
  language: ExplanationLanguage;
}
