import { JlptLevel, PartOfSpeech } from '../constants/word.constant';
import { WordSeed } from '../seed/word-seed';
import {
  buildTranslationRequests,
  CHUNK_SIZE,
  estimateBatchCostUsd,
  isValidRussian,
  parseTranslationResults,
  TRANSLATION_MODEL,
} from './ru-translation';

const seed = (i: number, level = JlptLevel.N5): WordSeed => ({
  kanji: null,
  kana: `かな${i}`,
  romaji: `kana${i}`,
  meaningEn: `meaning ${i}`,
  meaningRu: null,
  partOfSpeech: PartOfSpeech.Noun,
  verbGroup: null,
  level,
});

describe('buildTranslationRequests', () => {
  it('dedupes by key and chunks with stable ids and JSON-schema output', () => {
    const seeds = [...Array.from({ length: 150 }, (_, i) => seed(i)), seed(0)];
    const requests = buildTranslationRequests(seeds);
    expect(requests.map((r) => r.custom_id)).toEqual(['chunk-0', 'chunk-1']);
    const first = JSON.parse(requests[0].params.messages[0].content as string);
    expect(first).toHaveLength(CHUNK_SIZE);
    expect(first[0]).toEqual({ id: 'N5|かな0|', kanji: null, kana: 'かな0', en: 'meaning 0' });
    expect(requests[0].params.model).toBe(TRANSLATION_MODEL);
    expect(requests[0].params.output_config).toEqual(
      expect.objectContaining({ effort: 'low', format: expect.objectContaining({ type: 'json_schema' }) }),
    );
  });
});

describe('isValidRussian', () => {
  it('needs a Cyrillic letter', () => {
    expect(isValidRussian('книга')).toBe(true);
    expect(isValidRussian('  ')).toBe(false);
    expect(isValidRussian('book')).toBe(false);
  });
});

describe('parseTranslationResults', () => {
  const ids = ['N5|ほん|本', 'N5|みず|水', 'N5|やま|山'];

  it('keeps valid items and reports missing, invalid, failed and malformed chunks', () => {
    const { meanings, problems } = parseTranslationResults(
      [
        {
          customId: 'chunk-0',
          status: 'succeeded',
          text: JSON.stringify({
            items: [
              { id: 'N5|ほん|本', ru: ' книга ' },
              { id: 'N5|みず|水', ru: 'water' },
              { id: 'N9|unknown|', ru: 'лишнее' },
            ],
          }),
        },
        { customId: 'chunk-1', status: 'errored' },
        { customId: 'chunk-2', status: 'succeeded', text: 'not json' },
      ],
      ids,
    );
    expect(meanings).toEqual({ 'N5|ほん|本': 'книга' });
    expect(problems).toEqual([
      'N5|みず|水: invalid "water"',
      'chunk-1: errored',
      'chunk-2: unparsable result',
      'N5|みず|水: missing',
      'N5|やま|山: missing',
    ]);
  });
});

describe('estimateBatchCostUsd', () => {
  it('uses half of the Opus 5.5 price', () => {
    expect(estimateBatchCostUsd(1_000_000, 1_000_000)).toBeCloseTo(12);
  });
});
