import * as fs from 'fs';

import { JlptLevel, PartOfSpeech } from '../constants/word.constant';
import {
  classifyVerbGroup,
  loadRuMeanings,
  loadWordSeeds,
  parseCsv,
  toWordSeed,
  wordKey,
  wordSeedFilePath,
} from './word-seed';

describe('parseCsv', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n会う,"to meet, to see"\nx,"say ""hi"""\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['会う', 'to meet, to see'],
      ['x', 'say "hi"'],
    ]);
  });

  it('ignores CRLF line endings and a missing trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('classifyVerbGroup', () => {
  it.each([
    ['書く', 'かく', 1],
    ['帰る', 'かえる', 1],
    ['要る', 'いる', 1],
    ['食べる', 'たべる', 2],
    ['見る', 'みる', 2],
    ['起きる', 'おきる', 2],
    ['出来る', 'できる', 2],
    ['勉強する', 'べんきょうする', 3],
    ['する', 'する', 3],
    ['来る', 'くる', 3],
    ['持って来る', 'もってくる', 3],
    ['作る', 'つくる', 1],
  ])('%s (%s) is group %s', (expression, kana, group) => {
    expect(classifyVerbGroup(expression, kana)).toBe(group);
  });

  it.each([
    ['いらっしゃる', 'いらっしゃる'],
    ['下さる', 'くださる'],
    ['青', 'あお'],
  ])('%s is not classified', (expression, kana) => {
    expect(classifyVerbGroup(expression, kana)).toBeNull();
  });
});

describe('toWordSeed', () => {
  it('builds a verb with kanji, first sense and romaji', () => {
    const seed = toWordSeed(
      { expression: '遊ぶ', reading: 'あそぶ', meaning: 'to play; to hang out' },
      JlptLevel.N5,
    );
    expect(seed).toEqual({
      kanji: '遊ぶ',
      kana: 'あそぶ',
      romaji: 'asobu',
      meaningEn: 'to play',
      meaningRu: null,
      partOfSpeech: PartOfSpeech.Verb,
      verbGroup: 1,
      level: JlptLevel.N5,
    });
  });

  it('stores kana-only words with kanji = null', () => {
    const seed = toWordSeed(
      { expression: 'ああ', reading: 'ああ', meaning: 'Ah!, Oh!' },
      JlptLevel.N5,
    );
    expect(seed?.kanji).toBeNull();
    expect(seed?.partOfSpeech).toBe(PartOfSpeech.Other);
  });

  it('takes the first of several readings', () => {
    const seed = toWordSeed(
      { expression: '行く', reading: 'いく; ゆく', meaning: 'to go' },
      JlptLevel.N5,
    );
    expect(seed?.kana).toBe('いく');
  });

  it('classifies i- and na-adjectives', () => {
    expect(
      toWordSeed({ expression: '青い', reading: 'あおい', meaning: 'blue' }, JlptLevel.N5)
        ?.partOfSpeech,
    ).toBe(PartOfSpeech.IAdjective);
    expect(
      toWordSeed({ expression: '綺麗', reading: 'きれい', meaning: 'pretty' }, JlptLevel.N5)
        ?.partOfSpeech,
    ).toBe(PartOfSpeech.NaAdjective);
  });

  it('skips fragments starting with ～ and kanji entries without a reading', () => {
    expect(
      toWordSeed({ expression: '～ございます', reading: '～ございます', meaning: 'to be' }, JlptLevel.N4),
    ).toBeNull();
    expect(
      toWordSeed({ expression: '漢字', reading: '', meaning: 'kanji' }, JlptLevel.N4),
    ).toBeNull();
  });
});

describe('data fixes', () => {
  it.each([
    ['居る', 'いる', '(humble) to be (animate)', 2],
    ['始まる', 'はじまる', '(something) begins', 1],
    ['捨てる', 'すてる', 'throw away', 2],
  ])('%s (%s, "%s") is a verb of group %s', (expression, reading, meaning, group) => {
    const seed = toWordSeed({ expression, reading, meaning }, JlptLevel.N5);
    expect(seed?.partOfSpeech).toBe(PartOfSpeech.Verb);
    expect(seed?.verbGroup).toBe(group);
  });

  it('repairs a misspelled expression', () => {
    const seed = toWordSeed({ expression: '落る', reading: 'おちる', meaning: 'to fall' }, JlptLevel.N4);
    expect(seed?.kanji).toBe('落ちる');
  });

  it('swaps kanji and kana when the reading column holds the kanji', () => {
    const seed = toWordSeed({ expression: 'いただく', reading: '頂く', meaning: 'to receive' }, JlptLevel.N4);
    expect(seed).toEqual(expect.objectContaining({ kanji: '頂く', kana: 'いただく', romaji: 'itadaku' }));
  });

  it('skips usage notes that are not real meanings', () => {
    expect(
      toWordSeed({ expression: '召し上がる', reading: 'めしあがる', meaning: '-- extra-modest expression for たべる and のむ --' }, JlptLevel.N4),
    ).toBeNull();
  });
});

describe('loadWordSeeds on the real data files', () => {
  it.each([JlptLevel.N5, JlptLevel.N4])('%s has words and verbs', (level) => {
    const seeds = loadWordSeeds(fs.readFileSync(wordSeedFilePath(level), 'utf8'), level);
    expect(seeds.length).toBeGreaterThan(600);
    expect(seeds.filter((s) => s.verbGroup !== null).length).toBeGreaterThan(90);
    const keys = seeds.map((s) => `${s.kana}|${s.kanji}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Russian meanings', () => {
  it('builds the word key from level, kana and kanji', () => {
    expect(wordKey({ level: JlptLevel.N5, kana: 'ほん', kanji: '本' })).toBe('N5|ほん|本');
    expect(wordKey({ level: JlptLevel.N5, kana: 'ここ', kanji: null })).toBe('N5|ここ|');
  });

  it('applies meaningRu from the map and leaves missing ones null', () => {
    const csv = 'expression,reading,meaning,tags,guid\n本,ほん,book,,1\nここ,ここ,here,,2\n';
    const seeds = loadWordSeeds(csv, JlptLevel.N5, { 'N5|ほん|本': 'книга' });
    expect(seeds.map((s) => s.meaningRu)).toEqual(['книга', null]);
  });
});

describe('ru-meanings.json', () => {
  it('has a Russian meaning for every seeded word', () => {
    const ru = loadRuMeanings();
    const missing = [JlptLevel.N5, JlptLevel.N4]
      .flatMap((level) => loadWordSeeds(fs.readFileSync(wordSeedFilePath(level), 'utf8'), level, ru))
      .filter((s) => !s.meaningRu || !/[а-яё]/i.test(s.meaningRu))
      .map(wordKey);
    expect(missing).toEqual([]);
  });
});

describe('ru-meanings.json review fixes', () => {
  const ru = loadRuMeanings();
  it.each([
    ['N4|ねぼう|寝坊', 'проспать, поздно встать'],
    ['N5|あちら|', 'там, туда (вежл.)'],
    ['N5|また|', 'снова, опять; также'],
    ['N4|しんぶんしゃ|新聞社', 'редакция газеты'],
    ['N5|ことば|言葉', 'слово, язык'],
    ['N5|とる|取る', 'брать, взять'],
    ['N5|お～|', 'почтительный префикс お～'],
    ['N4|あ|', 'ах'],
    ['N4|ごぞんじ|ご存じ', 'знать (почтит.)'],
    ['N4|くれる|', 'давать (мне), делать для (меня)'],
    ['N4|あんないする|案内', 'показывать дорогу, сопровождать'],
    ['N4|ぶちょう|部長', 'начальник департамента'],
  ])('%s is %s', (key, expected) => {
    expect(ru[key]).toBe(expected);
  });
});
