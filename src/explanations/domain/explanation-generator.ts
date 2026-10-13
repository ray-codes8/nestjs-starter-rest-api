import { QuizType } from '../../progress/constants/quiz-type.constant';
import { VerbForm } from '../../quiz/domain/conjugation';
import { ExplanationLanguage } from '../constants/explanation-language.constant';
import { ExplanationPayload } from './explanation-schema';

export interface ExplanationPromptInput {
  kanji: string | null;
  kana: string;
  meaningEn: string;
  meaningRu: string | null;
  quizType: QuizType;
  form: VerbForm | null;
  correctAnswer: string;
  chosenAnswer: string;
  language: ExplanationLanguage;
}

export interface ExplanationGenerator {
  readonly model: string;
  generate(input: ExplanationPromptInput): Promise<ExplanationPayload>;
}

export const EXPLANATION_GENERATOR = Symbol('EXPLANATION_GENERATOR');

export class ExplanationUnavailableError extends Error {
  name = 'ExplanationUnavailableError';
}
