import {
  buildOcrRequest,
  KanjiCardOcr,
  mergeCards,
  normalizeCard,
  parseOcrPage,
  readPageResult,
  validateKanjiCards,
} from './kanji-ocr';

const card = (number: number, overrides: Partial<KanjiCardOcr> = {}): KanjiCardOcr & { page: number } => ({
  page: 66,
  number,
  kanji: '牛',
  kun: ['うし'],
  on: ['ギュウ'],
  meaningEn: 'cow',
  meaningRu: 'корова',
  strokes: 4,
  originEn: "picture of a cow's head and horns",
  originRu: 'рисунок головы коровы с рогами',
  compounds: [{ word: '牛肉', reading: 'ぎゅうにく', meaningEn: 'beef', meaningRu: 'говядина' }],
  picture: { x0: 0.23, y0: 0.18, x1: 0.53, y1: 0.28 },
  ...overrides,
});

describe('buildOcrRequest', () => {
  it('sends the page image with a JSON-schema output and a page id', () => {
    const request = buildOcrRequest(66, 'AAAA');
    expect(request.custom_id).toBe('page-066');
    expect(request.params.output_config).toEqual(
      expect.objectContaining({ effort: 'low', format: expect.objectContaining({ type: 'json_schema' }) }),
    );
    const content = request.params.messages[0].content as { type: string }[];
    expect(content[0]).toEqual(expect.objectContaining({ type: 'image' }));
  });
});

describe('normalizeCard', () => {
  it('strips separators and spaces from readings', () => {
    const normalized = normalizeCard(
      card(1, { kun: ['う・し', ' うし- '], on: ['ギュウ・'], compounds: [{ word: '水牛', reading: 'すい ぎゅう', meaningEn: 'buffalo', meaningRu: 'буйвол' }] }),
    );
    expect(normalized.kun).toEqual(['うし']);
    expect(normalized.on).toEqual(['ギュウ']);
    expect(normalized.compounds[0].reading).toBe('すいぎゅう');
  });
});

describe('normalizeCard alternatives', () => {
  it('removes spaces inside compound words', () => {
    const normalized = normalizeCard(
      card(1, { compounds: [{ word: '社 長', reading: 'しゃちょう', meaningEn: 'company president', meaningRu: 'директор' }] }),
    );
    expect(normalized.compounds[0].word).toBe('社長');
  });

  it('keeps the first of several readings written with a slash', () => {
    const normalized = normalizeCard(
      card(1, { compounds: [{ word: '日本', reading: 'にほん/にっぽん', meaningEn: 'Japan', meaningRu: 'Япония' }] }),
    );
    expect(normalized.compounds[0].reading).toBe('にほん');
  });
});

describe('parseOcrPage', () => {
  it('parses valid JSON and rejects anything else', () => {
    const withoutPage: Partial<ReturnType<typeof card>> = { ...card(1) };
    delete withoutPage.page;
    expect(parseOcrPage(JSON.stringify({ cards: [withoutPage] }))?.cards).toHaveLength(1);
    expect(parseOcrPage('not json')).toBeNull();
    expect(parseOcrPage(JSON.stringify({ cards: [{ number: 1 }] }))).toBeNull();
  });
});

describe('validateKanjiCards', () => {
  it('accepts a complete, clean range', () => {
    expect(validateKanjiCards([card(1), card(2, { kanji: '馬' })], 1, 2)).toEqual([]);
  });

  it('reports gaps, duplicates and bad fields', () => {
    const problems = validateKanjiCards(
      [
        card(1),
        card(1, { kanji: '馬' }),
        card(3, { kanji: '牛肉' }),
        card(4, { kun: ['ウシ'], on: [] }),
        card(5, { on: ['ぎゅう'], kun: [] }),
        card(6, { compounds: [{ word: '牛肉', reading: 'ぎゅう にく', meaningEn: 'beef', meaningRu: '' }] }),
        card(7, { picture: { x0: 0.6, y0: 0.2, x1: 0.5, y1: 0.3 } }),
        card(8, { kun: [], on: [] }),
      ],
      1,
      9,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        '#1: duplicate (pages 66, 66)',
        '#2: missing',
        '#3: kanji must be one character, got "牛肉"',
        '#4: kun reading "ウシ" must be hiragana',
        '#5: on reading "ぎゅう" must be katakana',
        '#6: compound 牛肉 has a bad reading "ぎゅう にく"',
        '#6: compound 牛肉 is missing a meaning',
        '#7: picture box is invalid',
        '#8: has no readings',
        '#9: missing',
      ]),
    );
  });
});

describe('mergeCards', () => {
  it('replaces cards from re-read pages and keeps the rest, sorted by number', () => {
    const existing = [card(1), { ...card(47), page: 54 }, card(50)];
    const reread = [{ ...card(47, { meaningEn: 'friend' }), page: 54 }, { ...card(48, { kanji: '本' }), page: 54 }];
    const merged = mergeCards(existing, reread, [54]);
    expect(merged.map((c) => c.number)).toEqual([1, 47, 48, 50]);
    expect(merged.find((c) => c.number === 47)?.meaningEn).toBe('friend');
  });
});

describe('readPageResult', () => {
  const ok = { cards: [] as KanjiCardOcr[] };
  const message = (stop_reason: string, text: string) => ({
    stop_reason,
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
  });

  it('returns the cards of a finished page', () => {
    expect(readPageResult({ custom_id: 'page-054', result: { type: 'succeeded', message: message('end_turn', JSON.stringify(ok)) } })).toEqual({ page: 54, cards: [] });
  });

  it('reports failed, truncated and unparsable pages without cards', () => {
    expect(readPageResult({ custom_id: 'page-054', result: { type: 'errored' } })).toEqual({ page: 54, cards: null, problem: 'page-054: errored' });
    expect(readPageResult({ custom_id: 'page-054', result: { type: 'succeeded', message: message('max_tokens', '{') } })).toEqual({ page: 54, cards: null, problem: 'page-054: stopped by max_tokens' });
    expect(readPageResult({ custom_id: 'page-054', result: { type: 'succeeded', message: message('end_turn', 'oops') } })).toEqual({ page: 54, cards: null, problem: 'page-054: unparsable result' });
  });
});
