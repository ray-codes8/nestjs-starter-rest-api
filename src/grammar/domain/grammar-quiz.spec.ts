import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { GrammarExercise } from '../entities/grammar-exercise.entity';
import { GrammarPoint } from '../entities/grammar-point.entity';
import { buildGrammarQuestion, isCorrectGrammarAnswer } from './grammar-quiz';

const point = {
  id: 6,
  code: 'l36-you-ni',
  lesson: 36,
  lessonTo: null,
  level: JlptLevel.N4,
  title: '〜ように',
  ruleEn: 'rule',
  ruleRu: 'правило',
} as GrammarPoint;

const exercise = {
  id: 42,
  pointId: 6,
  point,
  sentence: '遅刻しない＿＿、早く家を出ます。',
  answer: 'ように',
  distractors: ['ようと', 'ことに', 'ながら'],
  readings: { 遅刻: 'ちこく', 早: 'はや', 家: 'いえ', 出: 'で' },
  translationEn: 'I leave home early so as not to be late.',
  translationRu: 'Я выхожу из дома пораньше, чтобы не опоздать.',
} as GrammarExercise & { point: GrammarPoint };

describe('buildGrammarQuestion', () => {
  it('exposes the sentence, translations and 4 shuffled options without the answer key', () => {
    const question = buildGrammarQuestion(exercise);
    expect(question).toEqual({
      exerciseId: 42,
      lesson: 36,
      pointTitle: '〜ように',
      sentence: '遅刻しない＿＿、早く家を出ます。',
      translation: { en: exercise.translationEn, ru: exercise.translationRu },
      readings: { 遅刻: 'ちこく', 早: 'はや', 家: 'いえ', 出: 'で' },
      options: expect.any(Array),
    });
    expect([...question.options].sort()).toEqual(['ことに', 'ながら', 'ように', 'ようと'].sort());
  });

  it('shuffles with the given rng', () => {
    const first = buildGrammarQuestion(exercise, () => 0).options;
    const last = buildGrammarQuestion(exercise, () => 0.99).options;
    expect(first).not.toEqual(last);
  });
});

describe('isCorrectGrammarAnswer', () => {
  it('matches exactly after trimming', () => {
    expect(isCorrectGrammarAnswer(exercise, 'ように')).toBe(true);
    expect(isCorrectGrammarAnswer(exercise, ' ように ')).toBe(true);
    expect(isCorrectGrammarAnswer(exercise, 'ようと')).toBe(false);
  });
});
