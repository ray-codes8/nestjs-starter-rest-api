import * as path from 'path';
import { toRomaji } from 'wanakana';

import {
  JlptLevel,
  PartOfSpeech,
  VerbGroup,
} from '../constants/word.constant';

export interface WordSeed {
  kanji: string | null;
  kana: string;
  romaji: string;
  meaningEn: string;
  partOfSpeech: PartOfSpeech;
  verbGroup: VerbGroup | null;
  level: JlptLevel;
}

const U_ROW_ENDINGS = 'うくぐすつぬぶむる';
const I_E_ROW = 'いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ';
const KANJI = /[㐀-鿿]/;

// る-verbs that look like group 2 but conjugate as group 1.
const GODAN_RU_EXCEPTIONS = new Set([
  '要る', '入る', '帰る', '切る', '知る', '走る', '減る', '喋る', '滑る', '照る',
  '蹴る', '散る', '混じる', '限る', '握る', '参る', '焦る', '茂る', '練る', '遮る',
  '湿る', '捻る', '陥る', '覆る', '嘲る',
]);

// Honorific verbs with irregular ます forms; excluded from the verb quiz.
const UNSUPPORTED_VERBS = new Set([
  'いらっしゃる', 'おっしゃる', 'くださる', '下さる', 'なさる', 'ござる',
]);

// Verbs whose first sense in the data does not start with "to ".
const VERBS_WITHOUT_TO = new Set(['捨てる', '始まる']);

// Typos in the source data.
const EXPRESSION_FIXES: Record<string, string> = { 落る: '落ちる' };

const NA_ADJECTIVES = new Set([
  '綺麗', 'きれい', '嫌い', '好き', '大好き', '静か', '元気', '有名', '親切', '便利',
  '暇', '上手', '下手', '大切', '大丈夫', '簡単', '丈夫', '賑やか', '色々', 'いろいろ',
  '結構', '大変', '安全', '危険', '特別', '必要', '十分', '残念', '自由', '真面目',
  '丁寧', '複雑', '無理', '熱心', '立派', '変', '楽', '確か', '盛ん', '不便', '嫌',
]);

const NOT_I_ADJECTIVES = new Set([
  'はい', 'いいえ', 'くらい', 'ぐらい', 'お手洗い', '手伝い', '間違い', '違い', 'せい',
]);

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function classifyVerbGroup(
  expression: string,
  kana: string,
): VerbGroup | null {
  if (UNSUPPORTED_VERBS.has(expression) || UNSUPPORTED_VERBS.has(kana)) {
    return null;
  }
  if (kana.endsWith('する')) {
    return 3;
  }
  if (expression === '来る' || kana === 'くる' || kana.endsWith('てくる')) {
    return 3;
  }
  const last = kana.slice(-1);
  if (!U_ROW_ENDINGS.includes(last)) {
    return null;
  }
  const beforeLast = kana.slice(-2, -1);
  if (
    last === 'る' &&
    beforeLast !== '' &&
    I_E_ROW.includes(beforeLast) &&
    !GODAN_RU_EXCEPTIONS.has(expression)
  ) {
    return 2;
  }
  return 1;
}

function firstOf(value: string): string {
  return value.split(/[;；]/)[0].trim();
}

function classifyPartOfSpeech(
  expression: string,
  kana: string,
  meaningEn: string,
): PartOfSpeech {
  const plainMeaning = meaningEn.replace(/^\([^)]*\)\s*/, '');
  const looksLikeVerb =
    plainMeaning.startsWith('to ') || VERBS_WITHOUT_TO.has(expression);
  if (looksLikeVerb && U_ROW_ENDINGS.includes(kana.slice(-1))) {
    return PartOfSpeech.Verb;
  }
  if (NA_ADJECTIVES.has(expression)) {
    return PartOfSpeech.NaAdjective;
  }
  if (
    expression.endsWith('い') &&
    kana.length >= 2 &&
    !NOT_I_ADJECTIVES.has(expression)
  ) {
    return PartOfSpeech.IAdjective;
  }
  return KANJI.test(expression) ? PartOfSpeech.Noun : PartOfSpeech.Other;
}

export function toWordSeed(
  row: { expression: string; reading: string; meaning: string },
  level: JlptLevel,
): WordSeed | null {
  let expression = firstOf(row.expression);
  let reading = firstOf(row.reading);
  const meaningEn = firstOf(row.meaning);

  // A few rows have the kanji in the reading column.
  if (KANJI.test(reading) && !KANJI.test(expression)) {
    [expression, reading] = [reading, expression];
  }
  expression = EXPRESSION_FIXES[expression] ?? expression;

  if (
    !expression ||
    !meaningEn ||
    meaningEn.startsWith('--') ||
    /^[～〜~]/.test(expression)
  ) {
    return null;
  }
  if (!reading && KANJI.test(expression)) {
    return null;
  }

  const kana = reading || expression;
  const partOfSpeech = classifyPartOfSpeech(expression, kana, meaningEn);

  return {
    kanji: expression === kana ? null : expression,
    kana,
    romaji: toRomaji(kana),
    meaningEn,
    partOfSpeech,
    verbGroup:
      partOfSpeech === PartOfSpeech.Verb
        ? classifyVerbGroup(expression, kana)
        : null,
    level,
  };
}

export function loadWordSeeds(csvText: string, level: JlptLevel): WordSeed[] {
  const [header, ...rows] = parseCsv(csvText);
  const expressionIdx = header.indexOf('expression');
  const readingIdx = header.indexOf('reading');
  const meaningIdx = header.indexOf('meaning');

  const seen = new Set<string>();
  const seeds: WordSeed[] = [];
  for (const row of rows) {
    const seed = toWordSeed(
      {
        expression: row[expressionIdx] ?? '',
        reading: row[readingIdx] ?? '',
        meaning: row[meaningIdx] ?? '',
      },
      level,
    );
    const key = seed && `${seed.kana}|${seed.kanji}`;
    if (seed && key && !seen.has(key)) {
      seen.add(key);
      seeds.push(seed);
    }
  }
  return seeds;
}

export function wordSeedFilePath(level: JlptLevel): string {
  return path.join(__dirname, 'data', `${level.toLowerCase()}.csv`);
}
