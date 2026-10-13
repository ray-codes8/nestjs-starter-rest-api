export enum QuizType {
  Vocabulary = 'vocabulary',
  Verb = 'verb',
  Grammar = 'grammar',
}

// Quiz types that are answered against a vocabulary word.
export const WORD_QUIZ_TYPES = [QuizType.Vocabulary, QuizType.Verb];
