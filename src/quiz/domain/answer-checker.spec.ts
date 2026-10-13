import { BadRequestException } from '@nestjs/common';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { JlptLevel, PartOfSpeech } from '../../vocabulary/constants/word.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { checkAnswer } from './answer-checker';
import { VerbForm } from './conjugation';

const base = { romaji: '', meaningRu: null, level: JlptLevel.N5, lesson: null };
const book: Word = { ...base, id: 1, kanji: '本', kana: 'ほん', meaningEn: 'book', partOfSpeech: PartOfSpeech.Noun, verbGroup: null };
const taberu: Word = { ...base, id: 2, kanji: '食べる', kana: 'たべる', meaningEn: 'to eat', partOfSpeech: PartOfSpeech.Verb, verbGroup: 2 };
const aru: Word = { ...base, id: 3, kanji: null, kana: 'ある', meaningEn: 'to be', partOfSpeech: PartOfSpeech.Verb, verbGroup: 1 };

describe('checkAnswer', () => {
  it('checks vocabulary meanings', () => {
    expect(checkAnswer(book, { quizType: QuizType.Vocabulary, answer: 'book' })).toEqual({ isCorrect: true, correctAnswer: 'book' });
    expect(checkAnswer(book, { quizType: QuizType.Vocabulary, answer: 'water' })).toEqual({ isCorrect: false, correctAnswer: 'book' });
  });

  it('accepts kanji and kana verb answers and reports the display form', () => {
    expect(checkAnswer(taberu, { quizType: QuizType.Verb, answer: '食べて', form: VerbForm.Te })).toEqual({ isCorrect: true, correctAnswer: '食べて' });
    expect(checkAnswer(taberu, { quizType: QuizType.Verb, answer: 'たべて', form: VerbForm.Te }).isCorrect).toBe(true);
    expect(checkAnswer(taberu, { quizType: QuizType.Verb, answer: '食べって', form: VerbForm.Te }).isCorrect).toBe(false);
  });

  it('handles kana-only verbs', () => {
    expect(checkAnswer(aru, { quizType: QuizType.Verb, answer: 'ない', form: VerbForm.Nai })).toEqual({ isCorrect: true, correctAnswer: 'ない' });
  });

  it('rejects a verb answer without form', () => {
    expect(() => checkAnswer(taberu, { quizType: QuizType.Verb, answer: '食べて' })).toThrow(BadRequestException);
  });

  it('rejects a verb answer for a word that is not a quizzable verb', () => {
    expect(() => checkAnswer(book, { quizType: QuizType.Verb, answer: 'x', form: VerbForm.Te })).toThrow(BadRequestException);
  });
});
