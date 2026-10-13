import { Kanji } from '../entities/kanji.entity';
import { KanjiCompound } from '../entities/kanji-compound.entity';
import {
  buildMeaningQuestion,
  buildPictureQuestion,
  buildReadingQuestion,
  checkKanjiAnswer,
  toKanjiCard,
} from './kanji-quiz';

const kanji = (id: number, character: string, meaningEn: string, meaningRu: string): Kanji =>
  ({
    id, number: id, character, kunReadings: ['よみ'], onReadings: ['ヨミ'], meaningEn, meaningRu,
    strokes: 4, originEn: 'o', originRu: 'о', picture: `${String(id).padStart(3, '0')}.png`, compounds: [],
  }) as Kanji;
const compound = (id: number, kanjiId: number, word: string, reading: string): KanjiCompound =>
  ({ id, kanjiId, word, reading, meaningEn: 'm', meaningRu: 'м' }) as KanjiCompound;

const cow = kanji(61, '牛', 'cow', 'корова');
const pool = [cow, kanji(62, '馬', 'horse', 'лошадь'), kanji(63, '魚', 'fish', 'рыба'), kanji(64, '貝', 'shell', 'ракушка'), kanji(65, '鳥', 'bird', 'птица')];

describe('kanji questions', () => {
  it('picture: 4 unique kanji including the answer and the picture url', () => {
    const q = buildPictureQuestion(cow, pool);
    expect(q.pictureUrl).toBe('kanji-pictures/061.png');
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain('牛');
    expect(q).not.toHaveProperty('character');
  });

  it('meaning: English options with Russian labels in the same order', () => {
    const q = buildMeaningQuestion(cow, pool);
    expect(q.character).toBe('牛');
    expect(q.options).toContain('cow');
    expect(q.optionsRu[q.options.indexOf('cow')]).toBe('корова');
  });

  it('reading: the compound reading plus readings of other compounds, unique', () => {
    const beef = compound(1, 61, '牛肉', 'ぎゅうにく');
    const others = [compound(2, 62, '馬車', 'ばしゃ'), compound(3, 63, '金魚', 'きんぎょ'), compound(4, 63, '人魚', 'にんぎょ'), compound(5, 64, '貝', 'かい')];
    const q = buildReadingQuestion(cow, beef, [beef, ...others]);
    expect(q).toEqual(expect.objectContaining({ kanjiId: 61, compoundId: 1, word: '牛肉' }));
    expect(q.options).toContain('ぎゅうにく');
    expect(new Set(q.options).size).toBe(q.options.length);
    expect(q.options).toHaveLength(4);
  });

  it('copes with tiny pools without duplicates', () => {
    expect(buildPictureQuestion(cow, [cow, pool[1]]).options.sort()).toEqual(['牛', '馬'].sort());
  });
});

describe('checkKanjiAnswer', () => {
  const beef = compound(1, 61, '牛肉', 'ぎゅうにく');
  it('checks each kind', () => {
    expect(checkKanjiAnswer('picture', cow, null, '牛')).toEqual({ isCorrect: true, correctAnswer: '牛' });
    expect(checkKanjiAnswer('meaning', cow, null, 'horse')).toEqual({ isCorrect: false, correctAnswer: 'cow' });
    expect(checkKanjiAnswer('reading', cow, beef, 'ぎゅうにく').isCorrect).toBe(true);
  });
});

describe('toKanjiCard', () => {
  it('exposes the card with the picture url and compounds', () => {
    const card = toKanjiCard({ ...cow, compounds: [compound(1, 61, '牛肉', 'ぎゅうにく')] } as Kanji);
    expect(card).toEqual(expect.objectContaining({ character: '牛', pictureUrl: 'kanji-pictures/061.png' }));
    expect(card.compounds).toEqual([{ word: '牛肉', reading: 'ぎゅうにく', meaningEn: 'm', meaningRu: 'м' }]);
  });
});
