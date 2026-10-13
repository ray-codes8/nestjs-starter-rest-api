export enum QuizType {
  Vocabulary = 'vocabulary',
  Verb = 'verb',
  Grammar = 'grammar',
  KanjiPicture = 'kanji-picture',
  KanjiMeaning = 'kanji-meaning',
  KanjiReading = 'kanji-reading',
}

// Quiz types that are answered against a vocabulary word.
export const WORD_QUIZ_TYPES = [QuizType.Vocabulary, QuizType.Verb];
