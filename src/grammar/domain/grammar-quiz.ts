import { Rng, shuffle } from '../../quiz/domain/quiz-builder';
import { GrammarExercise } from '../entities/grammar-exercise.entity';
import { GrammarPoint } from '../entities/grammar-point.entity';

export interface GrammarQuestion {
  exerciseId: number;
  lesson: number;
  pointTitle: string;
  sentence: string;
  translation: { en: string; ru: string };
  readings: Record<string, string>;
  options: string[];
}

export function buildGrammarQuestion(
  exercise: GrammarExercise & { point: GrammarPoint },
  rng: Rng = Math.random,
): GrammarQuestion {
  return {
    exerciseId: exercise.id,
    lesson: exercise.point.lesson,
    pointTitle: exercise.point.title,
    sentence: exercise.sentence,
    translation: { en: exercise.translationEn, ru: exercise.translationRu },
    readings: exercise.readings,
    options: shuffle([exercise.answer, ...exercise.distractors], rng),
  };
}

export function isCorrectGrammarAnswer(exercise: GrammarExercise, answer: string): boolean {
  return answer.trim() === exercise.answer;
}
