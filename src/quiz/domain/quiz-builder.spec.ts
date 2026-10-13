import { JlptLevel, PartOfSpeech } from '../../vocabulary/constants/word.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { VerbForm } from './conjugation';
import { buildVerbQuestion, buildVocabularyQuestion, shuffle } from './quiz-builder';

let nextId = 1;
const word = (fields: Partial<Word>): Word => ({
  id: nextId++,
  kanji: null,
  kana: 'かな',
  romaji: 'kana',
  meaningEn: 'meaning',
  meaningRu: null,
  partOfSpeech: PartOfSpeech.Noun,
  verbGroup: null,
  level: JlptLevel.N5,
  lesson: null,
  ...fields,
});

describe('shuffle', () => {
  it('returns a permutation and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('buildVocabularyQuestion', () => {
  const book = word({ kanji: '本', kana: 'ほん', meaningEn: 'book' });
  const nouns = ['water', 'mountain', 'dog', 'cat'].map((meaningEn) => word({ meaningEn }));

  it('has 4 unique options including the correct meaning, without leaking ids', () => {
    const q = buildVocabularyQuestion(book, [book, ...nouns]);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain('book');
    expect(q).toEqual({ wordId: book.id, kanji: '本', kana: 'ほん', options: expect.any(Array) });
  });

  it('prefers distractors with the same part of speech', () => {
    const verbs = ['to eat', 'to drink', 'to go'].map((meaningEn) =>
      word({ meaningEn, partOfSpeech: PartOfSpeech.Verb }),
    );
    const q = buildVocabularyQuestion(book, [book, ...verbs, ...nouns]);
    expect(q.options.filter((o) => o.startsWith('to '))).toHaveLength(0);
  });

  it('never shows a second option with the correct meaning (在る/有る, 青/青い)', () => {
    const blue = word({ kanji: '青', kana: 'あお', meaningEn: 'blue' });
    const blueAdj = word({ kanji: '青い', kana: 'あおい', meaningEn: 'blue', partOfSpeech: PartOfSpeech.IAdjective });
    const sameNoun = word({ kanji: '青色', meaningEn: 'blue' });
    const q = buildVocabularyQuestion(blue, [blue, blueAdj, sameNoun, ...nouns]);
    expect(q.options.filter((o) => o === 'blue')).toHaveLength(1);
    expect(new Set(q.options).size).toBe(q.options.length);
  });

  it('falls back to other parts of speech and then returns fewer options', () => {
    const verb = word({ meaningEn: 'to fly', partOfSpeech: PartOfSpeech.Verb });
    expect(buildVocabularyQuestion(book, [book, verb]).options.sort()).toEqual(['book', 'to fly']);
    expect(buildVocabularyQuestion(book, [book]).options).toEqual(['book']);
  });

  it('keeps kana-only words as kanji = null', () => {
    const koko = word({ kana: 'ここ', meaningEn: 'here' });
    expect(buildVocabularyQuestion(koko, [koko, ...nouns]).kanji).toBeNull();
  });
});

describe('buildVerbQuestion', () => {
  const kaku = word({ kanji: '書く', kana: 'かく', partOfSpeech: PartOfSpeech.Verb, verbGroup: 1 });

  it('has the correct form among 4 unique options', () => {
    const q = buildVerbQuestion(kaku, VerbForm.Te, [kaku]);
    expect(q.form).toBe(VerbForm.Te);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain('書いて');
  });
});
