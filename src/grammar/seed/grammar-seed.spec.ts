import * as fs from 'fs';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import {
  GrammarPointSeed,
  grammarSeedFilePath,
  loadGrammarSeed,
  validateGrammarSeed,
} from './grammar-seed';

const exercise = (sentence: string, answer = 'は', distractors = ['を', 'に', 'で']) => ({
  sentence,
  answer,
  distractors,
  translationEn: 'en',
  translationRu: 'ru',
});

const point = (overrides: Partial<GrammarPointSeed> = {}): GrammarPointSeed => ({
  code: 'p1',
  lesson: 1,
  lessonTo: null,
  level: JlptLevel.N5,
  title: 'は',
  ruleEn: 'rule',
  ruleRu: 'правило',
  exercises: ['あ', 'い', 'う', 'え', 'お'].map((k) => exercise(`${k}＿＿です。`)),
  ...overrides,
});

describe('validateGrammarSeed', () => {
  it('accepts a valid point', () => {
    expect(validateGrammarSeed([point()])).toEqual([]);
  });

  it('reports structural problems', () => {
    const bad = point({
      exercises: [
        exercise('ブランクなし。'),
        exercise('＿＿と＿＿。'),
        exercise('あ＿＿。', 'は', ['は', 'に', 'で']),
        exercise('い＿＿。', 'は', ['を', 'に']),
        { ...exercise('う＿＿。'), translationRu: ' ' },
      ],
    });
    const errors = validateGrammarSeed([bad, point()]);
    expect(errors).toEqual(
      expect.arrayContaining([
        'p1#1: must contain exactly one ＿＿',
        'p1#2: must contain exactly one ＿＿',
        'p1#3: answer and distractors must be 4 unique non-empty options',
        'p1#4: needs exactly 3 distractors',
        'p1#5: missing translation',
        'p1: duplicate code',
      ]),
    );
  });

  it('requires enough exercises and a sane lesson range', () => {
    const errors = validateGrammarSeed([
      point({ exercises: [exercise('あ＿＿。')], lesson: 5, lessonTo: 3 }),
    ]);
    expect(errors).toEqual(
      expect.arrayContaining(['p1: needs at least 5 exercises', 'p1: lessonTo must be >= lesson']),
    );
  });
});

describe('the real grammar.json', () => {
  const points = loadGrammarSeed(fs.readFileSync(grammarSeedFilePath(), 'utf8'));

  it('is valid', () => {
    expect(validateGrammarSeed(points)).toEqual([]);
  });

  it('covers the planned topics', () => {
    expect(points.map((p) => p.code)).toEqual([
      'n5-particles',
      'l14-te-forms',
      'l19-ta-koto',
      'l34-toori-ato',
      'l35-ba-nara',
      'l36-you-ni',
      'l37-passive',
    ]);
    expect(points.reduce((sum, p) => sum + p.exercises.length, 0)).toBeGreaterThanOrEqual(50);
  });

  // Distractors that are grammatical on their own (found in review) must stay out.
  it.each([
    ['l37-passive', 0, 'ほめさせました'],
    ['l34-toori-ato', 0, 'まえ'],
    ['l34-toori-ato', 4, 'まえ'],
    ['l35-ba-nara', 6, 'が'],
    ['n5-particles', 6, 'が'],
    ['n5-particles', 8, 'を'],
  ])('%s #%i does not offer the grammatical distractor %s', (code, index, distractor) => {
    const exercise = points.find((p) => p.code === code)!.exercises[index];
    expect(exercise.distractors).not.toContain(distractor);
  });

  it('rules cover the forms the exercises use', () => {
    const rule = (code: string) => points.find((p) => p.code === code)!;
    expect(rule('n5-particles').title).toContain('へ');
    expect(rule('n5-particles').ruleEn).toContain('へ');
    expect(rule('l34-toori-ato').ruleEn).toMatch(/dictionary/);
    expect(rule('l35-ba-nara').ruleEn).toMatch(/verb \+ なら|plain-form verb/);
    expect(rule('l37-passive').ruleEn).toContain('歌う→歌われます');
    expect(rule('l37-passive').ruleRu).toContain('歌う→歌われます');
  });
});
