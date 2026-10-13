import * as fs from 'fs';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { loadWordSeeds, wordSeedFilePath } from '../../vocabulary/seed/word-seed';
import {
  conjugate,
  conjugationDistractors,
  displayForm,
  Verb,
  VerbForm,
} from './conjugation';

const v = (kanji: string | null, kana: string, verbGroup: 1 | 2 | 3): Verb => ({
  kanji,
  kana,
  verbGroup,
});

describe('conjugate', () => {
  it.each([
    // group 1
    [v('書く', 'かく', 1), ['書きます', '書いて', '書かない', '書いた']],
    [v('泳ぐ', 'およぐ', 1), ['泳ぎます', '泳いで', '泳がない', '泳いだ']],
    [v('話す', 'はなす', 1), ['話します', '話して', '話さない', '話した']],
    [v('待つ', 'まつ', 1), ['待ちます', '待って', '待たない', '待った']],
    [v('死ぬ', 'しぬ', 1), ['死にます', '死んで', '死なない', '死んだ']],
    [v('遊ぶ', 'あそぶ', 1), ['遊びます', '遊んで', '遊ばない', '遊んだ']],
    [v('読む', 'よむ', 1), ['読みます', '読んで', '読まない', '読んだ']],
    [v('帰る', 'かえる', 1), ['帰ります', '帰って', '帰らない', '帰った']],
    [v('買う', 'かう', 1), ['買います', '買って', '買わない', '買った']],
    // exceptions
    [v('行く', 'いく', 1), ['行きます', '行って', '行かない', '行った']],
    [v('有る', 'ある', 1), ['有ります', '有って', 'ない', '有った']],
    // group 2
    [v('食べる', 'たべる', 2), ['食べます', '食べて', '食べない', '食べた']],
    [v('見る', 'みる', 2), ['見ます', '見て', '見ない', '見た']],
    // group 3
    [v(null, 'する', 3), ['します', 'して', 'しない', 'した']],
    [v('勉強する', 'べんきょうする', 3), ['勉強します', '勉強して', '勉強しない', '勉強した']],
    [v('来る', 'くる', 3), ['来ます', '来て', '来ない', '来た']],
  ])('%o', (verb, [masu, te, nai, ta]) => {
    expect(displayForm(verb, VerbForm.Masu)).toBe(masu);
    expect(displayForm(verb, VerbForm.Te)).toBe(te);
    expect(displayForm(verb, VerbForm.Nai)).toBe(nai);
    expect(displayForm(verb, VerbForm.Ta)).toBe(ta);
  });

  it('conjugates the kana form too', () => {
    expect(conjugate(v('来る', 'くる', 3), VerbForm.Nai)).toEqual({ kanji: '来ない', kana: 'こない' });
    expect(conjugate(v('書く', 'かく', 1), VerbForm.Te)).toEqual({ kanji: '書いて', kana: 'かいて' });
  });

  it('returns kanji = null for kana-only verbs', () => {
    expect(conjugate(v(null, 'ある', 1), VerbForm.Masu)).toEqual({ kanji: null, kana: 'あります' });
  });
});

describe('conjugationDistractors', () => {
  const verbs = [
    v('書く', 'かく', 1),
    v('行く', 'いく', 1),
    v('食べる', 'たべる', 2),
    v(null, 'する', 3),
    v('勉強する', 'べんきょうする', 3),
    v('来る', 'くる', 3),
    v(null, 'ある', 1),
  ];

  it.each(verbs.flatMap((verb) => Object.values(VerbForm).map((form) => [verb, form] as const)))(
    '%o %s has 3+ unique wrong options',
    (verb, form) => {
      const correct = conjugate(verb, form);
      const distractors = conjugationDistractors(verb, form);
      expect(distractors.length).toBeGreaterThanOrEqual(3);
      expect(new Set(distractors).size).toBe(distractors.length);
      expect(distractors).not.toContain(correct.kana);
      if (correct.kanji) {
        expect(distractors).not.toContain(correct.kanji);
      }
    },
  );

  it('offers the regular-rule mistake for 行く', () => {
    expect(conjugationDistractors(v('行く', 'いく', 1), VerbForm.Te)).toContain('行いて');
  });
});

describe('every seeded verb', () => {
  it.each([JlptLevel.N5, JlptLevel.N4])('%s verbs conjugate and get distractors', (level) => {
    const verbs = loadWordSeeds(fs.readFileSync(wordSeedFilePath(level), 'utf8'), level)
      .filter((seed) => seed.verbGroup !== null)
      .map((seed) => v(seed.kanji, seed.kana, seed.verbGroup!));

    for (const verb of verbs) {
      for (const form of Object.values(VerbForm)) {
        expect(() => conjugate(verb, form)).not.toThrow();
        expect(conjugationDistractors(verb, form).length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
