import { BadRequestException } from '@nestjs/common';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { conjugate, VerbForm } from './conjugation';
import { toVerb } from './quiz-builder';

export function checkAnswer(
  word: Word,
  input: { quizType: QuizType; answer: string; form?: VerbForm },
): { isCorrect: boolean; correctAnswer: string } {
  if (input.quizType === QuizType.Vocabulary) {
    return {
      isCorrect: input.answer === word.meaningEn,
      correctAnswer: word.meaningEn,
    };
  }

  if (!input.form) {
    throw new BadRequestException('form is required for verb answers');
  }
  if (word.verbGroup === null) {
    throw new BadRequestException(`Word ${word.id} is not a quizzable verb`);
  }

  const correct = conjugate(toVerb(word), input.form);
  return {
    isCorrect: input.answer === correct.kanji || input.answer === correct.kana,
    correctAnswer: correct.kanji ?? correct.kana,
  };
}
