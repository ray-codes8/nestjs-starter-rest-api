# Russian Word Meanings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Russian meanings for all JLPT N5/N4 words, translated once with Claude (Batch API) into a committed JSON file. They are used by the vocabulary quiz (`optionsRu`), the dictionary and the AI explanations when the UI is in Russian.

**Architecture:** `src/vocabulary/translation/ru-translation.ts` holds the pure pieces: requests, result parsing and the cost estimate. `src/translate-meanings.ts` is a CLI with three steps: `--estimate` (free), `--submit` (paid, needs user approval) and `--collect`. The word seed reads `ru-meanings.json` into `meaningRu`. The quiz builder emits `optionsRu` parallel to the canonical English `options`, so answer checking and explanations keep their contracts.

**Tech Stack:** NestJS, TypeORM, `@anthropic-ai/sdk` (Message Batches, `countTokens`, JSON-schema output), zod, Jest. React + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-russian-meanings-design.md`

## Global Constraints

- Branch `feature/grammar` in both repos.
- Model `claude-opus-5-5`, `output_config.effort: 'low'`, `max_tokens: 16000`, Batch API (50% price), chunks of 100 words, `custom_id` = `chunk-<n>`.
- Word key: `<level>|<kana>|<kanji or ''>`.
- A valid translation is non-empty after trim and contains at least one Cyrillic letter.
- `--submit` spends money and runs only after the user approves the `--estimate` numbers. `--submit` refuses to run while `ru-meanings.batch.json` holds an uncollected batch.
- `options` stay English and canonical. `optionsRu[i]` is `meaningRu ?? meaningEn` of the word behind `options[i]`.
- Distractors must be unique against each other and the answer in both English and Russian display text.
- The API key is read from `.env` via dotenv and is never printed.

## Review Focus

1. **Two different English meanings with the same Russian translation** (small/little → «маленький»): RU mode must not show two identical options. Pinned in Task 4 (unit test).
2. **Partial batch failure** (an errored chunk, or a chunk missing some ids): `--collect` must keep the good ones, list the rest, and a second `--submit` must only send the missing words. Pinned in Task 2 (parser test) and Task 3 (submit filters by the existing file).
3. **Switching EN/RU mid-round**: labels change instantly, the answer still submits English, and the correct/wrong highlight stays right. Pinned in Task 5 (manual check).
4. **The model returns extra or unknown ids, or wraps the JSON**: unknown ids are ignored and malformed text is reported, never a crash. Pinned in Task 2.
5. **Words without a translation** (a new word, a failed item): fall back to English everywhere without showing an empty label. Pinned in Task 4 (unit test, `meaningRu: null`).

---

### Task 1: Seed support for `meaningRu`

**Files:**
- Modify: `src/vocabulary/seed/word-seed.ts`, `src/vocabulary/seed/word-seed.spec.ts`, `src/seed-words.ts`

**Interfaces:**
- Produces:
  - `WordSeed.meaningRu: string | null`
  - `type RuMeanings = Record<string, string>`
  - `wordKey(w: { level: JlptLevel; kana: string; kanji: string | null }): string`
  - `ruMeaningsFilePath(): string`
  - `loadRuMeanings(): RuMeanings` (returns `{}` when the file does not exist)
  - `loadWordSeeds(csvText, level, ruMeanings: RuMeanings = {})`

- [ ] **Step 1: Failing tests.** In `word-seed.spec.ts`:
  - add `meaningRu: null` to the `toEqual` object in "builds a verb with kanji, first sense and romaji";
  - add the following:

```ts
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
```

(import `wordKey`). Run `npm test -- word-seed`. Expected: FAIL (`wordKey` is not exported, and `meaningRu` is missing).

- [ ] **Step 2: Implement** in `word-seed.ts`:
  - `meaningRu: string | null;` in `WordSeed` after `meaningEn`;
  - `meaningRu: null,` in the object returned by `toWordSeed`;
  - then add:

```ts
export type RuMeanings = Record<string, string>;

export function wordKey(word: { level: JlptLevel; kana: string; kanji: string | null }): string {
  return `${word.level}|${word.kana}|${word.kanji ?? ''}`;
}

export function ruMeaningsFilePath(): string {
  return path.join(__dirname, 'data', 'ru-meanings.json');
}

export function loadRuMeanings(): RuMeanings {
  return fs.existsSync(ruMeaningsFilePath())
    ? (JSON.parse(fs.readFileSync(ruMeaningsFilePath(), 'utf8')) as RuMeanings)
    : {};
}
```

`loadWordSeeds(csvText, level, ruMeanings: RuMeanings = {})`: after `toWordSeed`, set `seed.meaningRu = ruMeanings[wordKey(seed)] ?? null`. Add `import * as fs from 'fs';`.

In `src/seed-words.ts`:
- load the map once with `const ruMeanings = loadRuMeanings();`;
- pass it as the third argument to `loadWordSeeds`;
- log `` `${level}: ${inserted} inserted, ${updated} updated, ${seeds.filter((s) => s.meaningRu).length} with Russian` ``.

- [ ] **Step 3:** Run `npm test -- word-seed`. Expected: PASS.
- [ ] **Step 4:** `git add src/vocabulary/seed src/seed-words.ts && git commit -m "feat(vocabulary): load Russian meanings into the word seed"`

---

### Task 2: Translation requests, result parsing, cost estimate (pure)

**Files:**
- Create: `src/vocabulary/translation/ru-translation.ts`
- Test: `src/vocabulary/translation/ru-translation.spec.ts`

**Interfaces:**
- Consumes: `WordSeed`, `wordKey`, `RuMeanings` (Task 1).
- Produces:
  - `TRANSLATION_MODEL`, `CHUNK_SIZE = 100`, `TRANSLATION_SYSTEM_PROMPT`, `TranslationItemsSchema`
  - `interface TranslationRequest { custom_id: string; params: Anthropic.MessageCreateParamsNonStreaming }`
  - `buildTranslationRequests(seeds: WordSeed[]): TranslationRequest[]`
  - `interface ChunkResult { customId: string; status: 'succeeded' | 'errored' | 'canceled' | 'expired'; text?: string }`
  - `parseTranslationResults(results: ChunkResult[], expectedIds: string[]): { meanings: RuMeanings; problems: string[] }`
  - `estimateBatchCostUsd(inputTokens: number, outputTokens: number): number`
  - `isValidRussian(text: string): boolean`

- [ ] **Step 1: Failing test** `src/vocabulary/translation/ru-translation.spec.ts`:

```ts
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
```

Run `npm test -- ru-translation`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement** `src/vocabulary/translation/ru-translation.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { RuMeanings, WordSeed, wordKey } from '../seed/word-seed';

export const TRANSLATION_MODEL = 'claude-opus-5-5';
export const CHUNK_SIZE = 100;

// claude-opus-5-5 list price per million tokens; the Batch API charges half.
const INPUT_USD_PER_MTOK = 4;
const OUTPUT_USD_PER_MTOK = 20;
const BATCH_DISCOUNT = 0.5;

export const TranslationItemsSchema = z.object({
  items: z.array(z.object({ id: z.string(), ru: z.string() })),
});

export const TRANSLATION_SYSTEM_PROMPT = `You translate a Japanese learner's dictionary into Russian.
You receive a JSON array of items: id, kanji (may be null), kana and an English gloss.
For every item return { id, ru }, where ru is a short Russian dictionary gloss (1-4 words) with the same sense as the English gloss.
- Verbs: Russian infinitive (書く "to write" → «писать»).
- Keep notes in parentheses, translated («(вежл.)» for "(polite)").
- Keep Japanese words in Japanese if the gloss quotes them.
- Return every id exactly once and nothing else.`;

export interface TranslationRequest {
  custom_id: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
}

export interface ChunkResult {
  customId: string;
  status: 'succeeded' | 'errored' | 'canceled' | 'expired';
  text?: string;
}

const CYRILLIC = /[а-яё]/i;

export function isValidRussian(text: string): boolean {
  return text.trim() !== '' && CYRILLIC.test(text);
}

export function buildTranslationRequests(seeds: WordSeed[]): TranslationRequest[] {
  const unique = new Map<string, WordSeed>();
  for (const seed of seeds) {
    unique.set(wordKey(seed), seed);
  }
  const items = [...unique.entries()].map(([id, seed]) => ({
    id,
    kanji: seed.kanji,
    kana: seed.kana,
    en: seed.meaningEn,
  }));

  const { type, schema } = zodOutputFormat(TranslationItemsSchema);
  const requests: TranslationRequest[] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    requests.push({
      custom_id: `chunk-${i / CHUNK_SIZE}`,
      params: {
        model: TRANSLATION_MODEL,
        max_tokens: 16000,
        system: TRANSLATION_SYSTEM_PROMPT,
        output_config: { effort: 'low', format: { type, schema } },
        messages: [{ role: 'user', content: JSON.stringify(items.slice(i, i + CHUNK_SIZE)) }],
      },
    });
  }
  return requests;
}

export function parseTranslationResults(
  results: ChunkResult[],
  expectedIds: string[],
): { meanings: RuMeanings; problems: string[] } {
  const expected = new Set(expectedIds);
  const meanings: RuMeanings = {};
  const problems: string[] = [];

  for (const result of results) {
    if (result.status !== 'succeeded') {
      problems.push(`${result.customId}: ${result.status}`);
      continue;
    }
    let parsed;
    try {
      parsed = TranslationItemsSchema.safeParse(JSON.parse(result.text ?? ''));
    } catch {
      parsed = { success: false as const };
    }
    if (!parsed.success) {
      problems.push(`${result.customId}: unparsable result`);
      continue;
    }
    for (const item of parsed.data.items) {
      if (!expected.has(item.id)) continue;
      if (isValidRussian(item.ru)) {
        meanings[item.id] = item.ru.trim();
      } else {
        problems.push(`${item.id}: invalid "${item.ru}"`);
      }
    }
  }

  for (const id of expectedIds) {
    if (!(id in meanings)) problems.push(`${id}: missing`);
  }
  return { meanings, problems };
}

export function estimateBatchCostUsd(inputTokens: number, outputTokens: number): number {
  return ((inputTokens * INPUT_USD_PER_MTOK + outputTokens * OUTPUT_USD_PER_MTOK) / 1_000_000) * BATCH_DISCOUNT;
}
```

- [ ] **Step 3:** Run `npm test -- ru-translation`. Expected: PASS (5 tests). If `tsc` rejects the `output_config.format` shape, follow the SDK type it names and do not cast it away.
- [ ] **Step 4:** `git add src/vocabulary/translation && git commit -m "feat(vocabulary): build and parse Russian translation batches"`

---

### Task 3: CLI `translate:meanings`

**Files:**
- Create: `src/translate-meanings.ts`
- Modify: `package.json` (`"translate:meanings": "ts-node -r tsconfig-paths/register src/translate-meanings.ts"`), `.gitignore` is unaffected (the batch file is committed while a batch is in flight; it holds no secrets)

**Interfaces:**
- Consumes: Tasks 1–2.

- [ ] **Step 1: Implement** `src/translate-meanings.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

import { JlptLevel } from './vocabulary/constants/word.constant';
import {
  loadRuMeanings,
  loadWordSeeds,
  ruMeaningsFilePath,
  WordSeed,
  wordKey,
  wordSeedFilePath,
} from './vocabulary/seed/word-seed';
import {
  buildTranslationRequests,
  ChunkResult,
  estimateBatchCostUsd,
  parseTranslationResults,
} from './vocabulary/translation/ru-translation';

dotenv.config();

const BATCH_FILE = path.join(path.dirname(ruMeaningsFilePath()), 'ru-meanings.batch.json');
// Rough output per word, plus some thinking per chunk (low effort).
const OUTPUT_TOKENS_PER_WORD = 25;
const OUTPUT_TOKENS_PER_CHUNK = 1000;

interface BatchFile {
  batchId: string;
  expectedIds: string[];
  collected: boolean;
}

function untranslatedSeeds(): WordSeed[] {
  const existing = loadRuMeanings();
  return [JlptLevel.N5, JlptLevel.N4]
    .flatMap((level) => loadWordSeeds(fs.readFileSync(wordSeedFilePath(level), 'utf8'), level))
    .filter((seed) => !existing[wordKey(seed)]);
}

function readBatchFile(): BatchFile | null {
  return fs.existsSync(BATCH_FILE) ? (JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8')) as BatchFile) : null;
}

async function estimate(client: Anthropic) {
  const seeds = untranslatedSeeds();
  const requests = buildTranslationRequests(seeds);
  let inputTokens = 0;
  for (const request of requests) {
    const { input_tokens } = await client.messages.countTokens({
      model: request.params.model,
      system: request.params.system,
      messages: request.params.messages,
    });
    inputTokens += input_tokens;
  }
  const outputTokens = seeds.length * OUTPUT_TOKENS_PER_WORD + requests.length * OUTPUT_TOKENS_PER_CHUNK;
  console.log(`words to translate: ${seeds.length} in ${requests.length} requests`);
  console.log(`input tokens: ${inputTokens}, estimated output tokens: ~${outputTokens}`);
  console.log(`estimated cost (batch, 50%): ~$${estimateBatchCostUsd(inputTokens, outputTokens).toFixed(2)}`);
}

async function submit(client: Anthropic) {
  const current = readBatchFile();
  if (current && !current.collected) {
    throw new Error(`Batch ${current.batchId} is not collected yet. Run --collect first.`);
  }
  const seeds = untranslatedSeeds();
  if (seeds.length === 0) {
    console.log('Nothing to translate.');
    return;
  }
  const requests = buildTranslationRequests(seeds);
  const batch = await client.messages.batches.create({ requests });
  const file: BatchFile = { batchId: batch.id, expectedIds: [...new Set(seeds.map(wordKey))], collected: false };
  fs.writeFileSync(BATCH_FILE, JSON.stringify(file, null, 2) + '\n');
  console.log(`submitted batch ${batch.id}: ${requests.length} requests, ${file.expectedIds.length} words`);
}

async function collect(client: Anthropic) {
  const file = readBatchFile();
  if (!file || file.collected) {
    console.log('No batch to collect.');
    return;
  }
  const batch = await client.messages.batches.retrieve(file.batchId);
  if (batch.processing_status !== 'ended') {
    console.log(`batch ${batch.id}: ${batch.processing_status}`, batch.request_counts);
    return;
  }

  const results: ChunkResult[] = [];
  for await (const entry of await client.messages.batches.results(file.batchId)) {
    if (entry.result.type === 'succeeded') {
      const textBlock = entry.result.message.content.find((block) => block.type === 'text');
      results.push({
        customId: entry.custom_id,
        status: entry.result.message.stop_reason === 'end_turn' ? 'succeeded' : 'errored',
        text: textBlock && textBlock.type === 'text' ? textBlock.text : undefined,
      });
    } else {
      results.push({ customId: entry.custom_id, status: entry.result.type });
    }
  }

  const { meanings, problems } = parseTranslationResults(results, file.expectedIds);
  const merged = { ...loadRuMeanings(), ...meanings };
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(ruMeaningsFilePath(), JSON.stringify(sorted, null, 2) + '\n');
  fs.writeFileSync(BATCH_FILE, JSON.stringify({ ...file, collected: true }, null, 2) + '\n');

  console.log(`saved ${Object.keys(meanings).length} new translations (${Object.keys(sorted).length} total)`);
  if (problems.length > 0) {
    console.log(`${problems.length} problems (run --submit again to retry the missing words):`);
    problems.slice(0, 50).forEach((p) => console.log(`  ${p}`));
  }
}

async function main() {
  const step = process.argv[2];
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (step === '--estimate') return estimate(client);
  if (step === '--submit') return submit(client);
  if (step === '--collect') return collect(client);
  console.log('usage: npm run translate:meanings -- --estimate | --submit | --collect');
}

main().catch((error: Error) => {
  // Error class and message only: never echo request options or keys.
  console.error(`${error.name}: ${error.message}`);
  process.exit(1);
});
```

Add the `package.json` script.

- [ ] **Step 2: Typecheck and a free run**

```bash
npx tsc --noEmit -p tsconfig.json
npm run translate:meanings -- --estimate
```

Expected: tsc is clean, and the estimate prints about 1300 words in 13–14 requests with a cost estimate. Nothing is spent (countTokens is free). **Stop and show the user the estimate. `--submit` waits for approval (Task 6).**

- [ ] **Step 3:** `git add src/translate-meanings.ts package.json && git commit -m "feat(vocabulary): translate:meanings CLI (estimate, submit, collect)"`

---

### Task 4: Quiz `optionsRu`, `meaningRu` in the API, explanations

**Files:**
- Modify: `src/quiz/domain/quiz-builder.ts` (+ spec), `src/quiz/dtos/quiz-output.dto.ts`
- Modify: `src/vocabulary/dtos/word-output.dto.ts`
- Modify: `src/explanations/domain/explanation-generator.ts`, `explanation-prompt.ts` (+ spec), `src/explanations/services/explanation.service.ts` (+ spec)
- Modify: `test/nihongo/quiz.e2e-spec.ts`, `test/nihongo/vocabulary.e2e-spec.ts`

- [ ] **Step 1: Failing tests**

In `quiz-builder.spec.ts`, add to `describe('buildVocabularyQuestion')`:

```ts
  it('adds Russian labels parallel to the English options, falling back to English', () => {
    const ruBook = word({ kanji: '本', kana: 'ほん', meaningEn: 'book', meaningRu: 'книга' });
    const ruWater = word({ meaningEn: 'water', meaningRu: 'вода' });
    const noRu = word({ meaningEn: 'dog' });
    const q = buildVocabularyQuestion(ruBook, [ruBook, ruWater, noRu]);
    const byEn = Object.fromEntries(q.options.map((en, i) => [en, q.optionsRu[i]]));
    expect(byEn).toEqual({ book: 'книга', water: 'вода', dog: 'dog' });
  });

  it('never shows two options with the same Russian text', () => {
    const big = word({ meaningEn: 'big', meaningRu: 'большой' });
    const large = word({ meaningEn: 'large', meaningRu: 'большой' });
    const others = ['вода', 'гора', 'собака'].map((ru, i) => word({ meaningEn: `x${i}`, meaningRu: ru }));
    for (let i = 0; i < 20; i++) {
      const q = buildVocabularyQuestion(big, [big, large, ...others]);
      expect(new Set(q.optionsRu).size).toBe(q.optionsRu.length);
      expect(q.options).not.toContain('large');
    }
  });
```

In `explanation-prompt.spec.ts`, add:

```ts
  it('adds the Russian meaning when explaining in Russian', () => {
    const prompt = buildExplanationPrompt({
      kanji: '本', kana: 'ほん', meaningEn: 'book', meaningRu: 'книга',
      quizType: QuizType.Vocabulary, form: null, correctAnswer: 'book', chosenAnswer: 'water',
      language: ExplanationLanguage.Ru,
    });
    expect(prompt).toContain('meaning "book" (Russian: "книга")');
  });
```

Add `meaningRu: null` to the other `buildExplanationPrompt` inputs in that spec and in `claude-explanation-generator.spec.ts`'s `input`. In `explanation.service.spec.ts`, add `meaningRu: null` to the expected `generate` argument.

In e2e:
- `quiz.e2e-spec.ts` key list becomes `['kana', 'kanji', 'options', 'optionsRu', 'wordId']`;
- `vocabulary.e2e-spec.ts` adds `meaningRu: null` to the `objectContaining`.

Run `npm test -- quiz-builder explanation`. Expected: FAIL.

- [ ] **Step 2: Implement**

`quiz-builder.ts`:
- split the question types:

```ts
interface WordQuestion {
  wordId: number;
  kanji: string | null;
  kana: string;
  options: string[];
}

export interface VocabularyQuestion extends WordQuestion {
  // Russian label for each option (same order); English when a word has no translation.
  optionsRu: string[];
}

export interface VerbQuestion extends WordQuestion {
  form: VerbForm;
}
```

- replace `buildVocabularyQuestion` with:

```ts
export function buildVocabularyQuestion(word: Word, pool: Word[], rng: Rng = Math.random): VocabularyQuestion {
  const label = (w: Word) => ({ en: w.meaningEn, ru: w.meaningRu ?? w.meaningEn });
  const others = pool.filter((w) => w.id !== word.id);
  const candidates = [
    ...shuffle(others.filter((w) => w.partOfSpeech === word.partOfSpeech), rng),
    ...shuffle(others.filter((w) => w.partOfSpeech !== word.partOfSpeech), rng),
  ].map(label);

  // Options must be distinct in both languages (big/large are both «большой»).
  const chosen = [label(word)];
  for (const candidate of candidates) {
    if (chosen.length === OPTIONS_PER_QUESTION) break;
    if (chosen.some((o) => o.en === candidate.en || o.ru === candidate.ru)) continue;
    chosen.push(candidate);
  }

  const options = shuffle(chosen, rng);
  return {
    wordId: word.id,
    kanji: word.kanji,
    kana: word.kana,
    options: options.map((o) => o.en),
    optionsRu: options.map((o) => o.ru),
  };
}
```

(`pickDistractors` stays for verbs.)

`quiz-output.dto.ts`: introduce `WordQuestionOutput` (wordId, kanji, kana, options). `VocabularyQuestionOutput extends WordQuestionOutput` adds:

```ts
  @ApiProperty({ type: [String], description: 'Russian label for each option, same order (English fallback)' })
  optionsRu: string[];
```

`VerbQuestionOutput extends WordQuestionOutput`.

`word-output.dto.ts`: add

```ts
  @Expose()
  @ApiPropertyOptional({ type: String, nullable: true })
  meaningRu: string | null;
```

Explanations:
- add `meaningRu: string | null;` to `ExplanationPromptInput`;
- the service passes `meaningRu: word.meaningRu`;
- in `buildExplanationPrompt`, the word line becomes:

```ts
    `Word: ${word}, meaning "${input.meaningEn}"` +
      (input.language === ExplanationLanguage.Ru && input.meaningRu ? ` (Russian: "${input.meaningRu}")` : ''),
```

- [ ] **Step 3:** Run `npm test`, `npm run test:e2e` and `npm run lint`. Expected: all green, and lint shows only the 2 starter errors.
- [ ] **Step 4:** `git add src test && git commit -m "feat(quiz): Russian option labels, meaningRu in vocabulary and explanations"`

---

### Task 5: Frontend (`nihongo-web`)

**Files:**
- Modify: `src/lib/api/types.ts`, `src/features/quiz/labels.ts` (+ `labels.spec.ts`), `src/features/quiz/QuizSession.tsx`, `src/features/dictionary/DictionaryPage.tsx`

- [ ] **Step 1: Failing test** `src/features/quiz/labels.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { optionLabel } from './labels';

const question = { wordId: 1, kanji: '本', kana: 'ほん', options: ['book', 'water'], optionsRu: ['книга', 'вода'] };

describe('optionLabel', () => {
  it('shows the Russian label in RU and English otherwise', () => {
    expect(optionLabel(question, 'water', 'ru')).toBe('вода');
    expect(optionLabel(question, 'water', 'en')).toBe('water');
  });

  it('falls back to the English text when there is no Russian label', () => {
    expect(optionLabel({ ...question, optionsRu: undefined }, 'book', 'ru')).toBe('book');
    expect(optionLabel(question, 'unknown', 'ru')).toBe('unknown');
  });
});
```

Run `npx vitest run`. Expected: FAIL (`optionLabel` is not exported).

- [ ] **Step 2: Implement**
  - In `types.ts`:
    - `Question` gains `optionsRu?: string[];`
    - `Word` gains `meaningRu: string | null;`
  - In `labels.ts`, import `Question` and `Language` (`@/lib/i18n/translate`) and add:

```ts
// Display text for an English (canonical) option in the current UI language.
export function optionLabel(question: Question, option: string, language: Language): string {
  if (language !== 'ru' || !question.optionsRu) return option;
  return question.optionsRu[question.options.indexOf(option)] ?? option;
}
```

  - In `QuizSession.tsx`:
    - read `language` from `useI18n()`;
    - render `label={quizType === 'vocabulary' ? optionLabel(question, option, language) : option}`;
    - in the mistake entry, store `chosen: optionLabel(question, variables.answer, language)` and `correctAnswer: optionLabel(question, res.correctAnswer, language)`;
    - keep sending `option` (English) to the API.
  - In `DictionaryPage.tsx`, read `language`:
    - the meaning cell shows `language === 'ru' ? (w.meaningRu ?? w.meaningEn) : w.meaningEn`;
    - the search fields include `w.meaningRu ?? ''`.

- [ ] **Step 3:** Run `npx vitest run`, `npm run build` and `npm run lint`. Expected: green.
- [ ] **Step 4:** `git add -A && git commit -m "feat: Russian option labels in the vocabulary quiz and dictionary"`

---

### Task 6: Run the translation (user-approved), seed, verify

- [ ] **Step 1:** Show the user the `--estimate` output and wait for "yes".
- [ ] **Step 2:** `npm run translate:meanings -- --submit`, then poll with `npm run translate:meanings -- --collect` every ~10 minutes until it reports saved translations. Each check costs nothing.
- [ ] **Step 3:** If problems are listed, run `--submit` and `--collect` again, which covers only the missing words. Repeat until there are 0 problems or only a handful are left. Ask the user before a second paid submit.
- [ ] **Step 4: Coverage test.** Add to `word-seed.spec.ts`:

```ts
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
```

Run it; expected: PASS.
- [ ] **Step 5:** `npm run seed:words`. Expected: `with Russian` equals the word count for both levels.
- [ ] **Step 6:** Spot-check 20 random translations with the user, then fix any by hand in `ru-meanings.json`.
- [ ] **Step 7:** Browser check in RU:
  - vocabulary quiz options are in Russian;
  - **(Review Focus #3)** switch EN↔RU mid-question and answer: the highlight is correct and the answer is recorded;
  - the mistakes list is in Russian;
  - the dictionary shows Russian and search finds «книга»;
  - "Why?" in RU mentions the Russian meaning.
- [ ] **Step 8:** `git add src/vocabulary/seed/data/ru-meanings.json src/vocabulary/seed/data/ru-meanings.batch.json src/vocabulary/seed/word-seed.spec.ts && git commit -m "feat(vocabulary): Russian meanings for all JLPT N5/N4 words"`
- [ ] **Step 9:** Final whole-branch review with a fresh reviewer. Include a translation quality sample of about 60 random entries, read by a reviewer who knows Japanese and Russian.
