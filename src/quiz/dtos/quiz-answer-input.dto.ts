import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { VerbForm } from '../domain/conjugation';

export class QuizAnswerInput {
  @ApiProperty({ enum: QuizType })
  @IsEnum(QuizType)
  quizType: QuizType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  wordId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  answer: string;

  @ApiPropertyOptional({ enum: VerbForm, description: 'Required for verb answers' })
  @IsOptional()
  @IsEnum(VerbForm)
  form?: VerbForm;
}
