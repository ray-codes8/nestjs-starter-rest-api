# Kanji Book Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the first 100 kanji of the learner's book (OCR with Claude Vision + pictograph crops) into local files and the DB. Then offer three quiz types (picture → kanji, kanji → meaning, compound → reading), each followed by a book-style kanji card.

**Architecture:**
- **Pure import pieces:** `src/kanji/import/kanji-ocr.ts` (OCR request, parsing, validation) and `src/kanji/import/crop.ts` (box → pixels, crop + trim with `sharp`).
- **CLI** `src/kanji-import.ts`: `--render`, `--estimate`, `--submit`, `--collect` and `--review`, writing to the gitignored `local/kanji/`.
- **NestJS `kanji` module:** tables, seed, quiz builders, answer endpoint, and a static picture route. Progress reuses `applyAnswer` through `ProgressService.recordKanjiAnswer`.
- **React:** a `/kanji` page, a `KanjiSession` and a `KanjiCard`.

**Tech Stack:** NestJS, TypeORM, Postgres, `@anthropic-ai/sdk` (Batches, vision, JSON-schema output), zod, `sharp`, poppler `pdftoppm`, Jest. React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-kanji-book-quiz-design.md`

## Global Constraints

- **Branches:** `feature/kanji` in both repos.
- **Book content never committed.** Everything generated goes to `local/kanji/` (gitignored): pages, pictures, `kanji.json`, `review.html`, `ocr.batch.json` and `overrides.json`. `git status` must stay clean of it.
- **Config:** `KANJI_BOOK_PDF` (required for `--render`) and `KANJI_DIR` (default `local/kanji`, used by the importer, the seed and the picture route), read from `.env`.
- **Pages:** 26–95 by default (`--pages A-B`). Expected kanji numbers: 1–100.
- **OCR:**
  - model `claude-opus-5-5`, effort `low`, `max_tokens: 16000`;
  - one Message Batch request per page, `custom_id` = `page-NNN`;
  - page images are sent downscaled so the height is at most 1568 px.
- **Paid steps:** `--submit` only after the user approves `--estimate`, and it refuses to run while `ocr.batch.json` is uncollected.
- **Quiz:**
  - types `picture | meaning | reading`, mapped to `QuizType` `kanji-picture | kanji-meaning | kanji-reading`;
  - 4 unique options; the answer is never sent before answering;
  - `count` is 1–20 (default 10); `from`/`to` are 1–400.
- **Progress** is tracked per (user, kanji, quizType), using Leitner `applyAnswer`. `answer_log` gets `kanjiId`.
- **Picture route** `GET /api/v1/kanji-pictures/:file` has no auth, and the file name must match `^\d{3}\.png$`. Anything else returns 404.
- **i18n:** every new UI string goes into both `en.ts` and `ru.ts`.

## Review Focus

1. **OCR misreads that pass the schema**: a reading in the wrong script, a compound reading with spaces, or a kanji field holding two characters. The validator must catch all three. Pinned in Task 1.
2. **Path traversal or arbitrary file reads via the picture route** (`..%2F.env`, `../.env`, absolute paths) → 404. Pinned in Task 6 (e2e).
3. **A range with fewer than 4 kanji, or a kanji with no compounds** (reading quiz): return fewer options or skip the kanji, never crash and never show duplicate options. Pinned in Task 5.
4. **A compound that does not belong to the posted kanji** → 400. Pinned in Task 6.
5. **The UI with no imported kanji** (a fresh clone) shows an empty state with the import hint, not an error. Pinned in Task 7 (manual) and Task 6 (e2e: ranges with total 0).

---

### Task 1: OCR request, parsing, validation (pure)

**Files:**
- Create: `src/kanji/import/kanji-ocr.ts`
- Test: `src/kanji/import/kanji-ocr.spec.ts`

**Interfaces:**
- Produces:
  - `KANJI_OCR_MODEL`, `KanjiPageSchema` (zod), `KANJI_OCR_PROMPT`
  - `type KanjiCardOcr = z.infer<typeof KanjiCardSchema>`, which is `{ number, kanji, kun: string[], on: string[], meaningEn, meaningRu, strokes, originEn, originRu, compounds: { word; reading; meaningEn; meaningRu }[], picture: { x0; y0; x1; y1 } }`
  - `buildOcrRequest(page: number, pngBase64: string): { custom_id: string; params: Anthropic.MessageCreateParamsNonStreaming }`
  - `normalizeCard(card: KanjiCardOcr): KanjiCardOcr` (strips `・`, `-`, spaces and so on)
  - `parseOcrPage(text: string): { cards: KanjiCardOcr[] } | null`
  - `validateKanjiCards(cards: (KanjiCardOcr & { page: number })[], from: number, to: number): string[]`

- [ ] **Step 1: Write the failing test** `src/kanji/import/kanji-ocr.spec.ts`:

```ts
import { buildOcrRequest, KanjiCardOcr, normalizeCard, parseOcrPage, validateKanjiCards } from './kanji-ocr';

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

describe('parseOcrPage', () => {
  it('parses valid JSON and rejects anything else', () => {
    expect(parseOcrPage(JSON.stringify({ cards: [card(1)].map(({ page, ...c }) => c) }))?.cards).toHaveLength(1);
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
```

- [ ] **Step 2: Run it to verify it fails.** Run `npm test -- kanji-ocr`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/kanji/import/kanji-ocr.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

export const KANJI_OCR_MODEL = 'claude-opus-5-5';

const BoxSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });

const KanjiCardSchema = z.object({
  number: z.number(),
  kanji: z.string(),
  kun: z.array(z.string()),
  on: z.array(z.string()),
  meaningEn: z.string(),
  meaningRu: z.string(),
  strokes: z.number(),
  originEn: z.string(),
  originRu: z.string(),
  compounds: z.array(
    z.object({ word: z.string(), reading: z.string(), meaningEn: z.string(), meaningRu: z.string() }),
  ),
  picture: BoxSchema,
});

export const KanjiPageSchema = z.object({ cards: z.array(KanjiCardSchema) });
export type KanjiCardOcr = z.infer<typeof KanjiCardSchema>;

export const KANJI_OCR_PROMPT = `This is a scanned page of the kanji textbook 「にほんごチャレンジ かんじ N4-5」.
A page holds 0 to 3 kanji cards stacked vertically; exercise pages hold none (return an empty list).
For each card, top to bottom, return:
- number: the card number printed in the top-left corner.
- kanji: the single large kanji.
- kun: kun readings in hiragana, on: on readings in katakana, from the readings cell in the middle row (e.g. うし・ギュウ → kun ["うし"], on ["ギュウ"]). Omit separators.
- meaningEn: the English meaning next to the top readings (e.g. "cow"); meaningRu: a short Russian translation.
- strokes: the stroke count printed in parentheses.
- originEn: the English sentence of the picture explanation (e.g. "picture of a cow's head and horns→cow"); originRu: its Russian translation.
- compounds: every row of the bottom table: word as printed, reading in kana without spaces, meaningEn from the English column, meaningRu a short Russian translation.
- picture: the bounding box of the drawing cell in the middle row (between the readings column and the explanation text), as fractions of the page width and height (0..1), tight to the cell borders.
Copy what is printed; do not invent. Leave a string empty if it is unreadable.`;

const STRIP = /[・･\-‐－\s]/g;
const HIRAGANA = /^[ぁ-ゖー]+$/;
const KATAKANA = /^[ァ-ヺー]+$/;
const KANA = /^[ぁ-ゖァ-ヺー・]+$/;
const KANJI_CHAR = /^[㐀-鿿々]$/;

export function buildOcrRequest(page: number, pngBase64: string) {
  const { type, schema } = zodOutputFormat(KanjiPageSchema);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: KANJI_OCR_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type, schema } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
          { type: 'text', text: KANJI_OCR_PROMPT },
        ],
      },
    ],
  };
  return { custom_id: `page-${String(page).padStart(3, '0')}`, params };
}

export function normalizeCard(card: KanjiCardOcr): KanjiCardOcr {
  const clean = (list: string[]) => [...new Set(list.map((r) => r.replace(STRIP, '')).filter(Boolean))];
  return {
    ...card,
    kanji: card.kanji.trim(),
    kun: clean(card.kun),
    on: clean(card.on),
    compounds: card.compounds.map((c) => ({ ...c, word: c.word.trim(), reading: c.reading.replace(STRIP, '') })),
  };
}

export function parseOcrPage(text: string): { cards: KanjiCardOcr[] } | null {
  try {
    const parsed = KanjiPageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const validBox = (b: KanjiCardOcr['picture']) =>
  [b.x0, b.y0, b.x1, b.y1].every((v) => v >= 0 && v <= 1) && b.x1 - b.x0 > 0.05 && b.y1 - b.y0 > 0.03;

export function validateKanjiCards(cards: (KanjiCardOcr & { page: number })[], from: number, to: number): string[] {
  const problems: string[] = [];
  const byNumber = new Map<number, number[]>();
  for (const card of cards) {
    byNumber.set(card.number, [...(byNumber.get(card.number) ?? []), card.page]);
  }
  for (const [number, pages] of byNumber) {
    if (pages.length > 1) problems.push(`#${number}: duplicate (pages ${pages.join(', ')})`);
  }
  for (let n = from; n <= to; n++) {
    if (!byNumber.has(n)) problems.push(`#${n}: missing`);
  }
  for (const card of cards) {
    const id = `#${card.number}`;
    if (!KANJI_CHAR.test(card.kanji)) problems.push(`${id}: kanji must be one character, got "${card.kanji}"`);
    if (card.kun.length + card.on.length === 0) problems.push(`${id}: has no readings`);
    card.kun.filter((r) => !HIRAGANA.test(r)).forEach((r) => problems.push(`${id}: kun reading "${r}" must be hiragana`));
    card.on.filter((r) => !KATAKANA.test(r)).forEach((r) => problems.push(`${id}: on reading "${r}" must be katakana`));
    if (!card.meaningEn.trim()) problems.push(`${id}: missing meaning`);
    for (const c of card.compounds) {
      if (!c.word || !KANA.test(c.reading)) problems.push(`${id}: compound ${c.word} has a bad reading "${c.reading}"`);
      if (!c.meaningEn.trim() || !c.meaningRu.trim()) problems.push(`${id}: compound ${c.word} is missing a meaning`);
    }
    if (!validBox(card.picture)) problems.push(`${id}: picture box is invalid`);
  }
  return problems;
}
```

- [ ] **Step 4: Run it to verify it passes.** Run `npm test -- kanji-ocr`. Expected: PASS. (The `#6` bad-reading case: the fixture is validated *without* `normalizeCard`, so the space is still present, which is what the test intends.)
- [ ] **Step 5: Commit:** `git add src/kanji/import && git commit -m "feat(kanji): OCR request, parsing and validation for the kanji book"`

---

### Task 2: Pictograph crop (geometry + sharp)

**Files:**
- Modify: `package.json` (add the `sharp` dependency)
- Create: `src/kanji/import/crop.ts`
- Test: `src/kanji/import/crop.spec.ts`

**Interfaces:**
- Produces:
  - `boxToRegion(box, width, height, inset = 0.02): { left; top; width; height } | null`
  - `cropPicture(pagePath: string, box, outPath: string): Promise<{ width: number; height: number }>`

- [ ] **Step 1:** `npm install sharp@0.34`
- [ ] **Step 2: Write the failing test** `src/kanji/import/crop.spec.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import sharp from 'sharp';

import { boxToRegion, cropPicture } from './crop';

describe('boxToRegion', () => {
  it('converts fractions to an inset pixel region', () => {
    expect(boxToRegion({ x0: 0.25, y0: 0.5, x1: 0.75, y1: 1 }, 400, 200)).toEqual({ left: 102, top: 102, width: 196, height: 96 });
  });

  it('rejects boxes outside the page or too small', () => {
    expect(boxToRegion({ x0: -0.1, y0: 0, x1: 0.5, y1: 0.5 }, 100, 100)).toBeNull();
    expect(boxToRegion({ x0: 0.5, y0: 0, x1: 0.4, y1: 0.5 }, 100, 100)).toBeNull();
  });
});

describe('cropPicture', () => {
  it('drops the cell border and trims white margins around the drawing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-'));
    const page = path.join(dir, 'page.png');
    // 400x200 white page: a 3px black cell border, and a 40x40 black square in the middle.
    const svg = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="200" fill="white"/>
      <rect x="1.5" y="1.5" width="397" height="197" fill="none" stroke="black" stroke-width="3"/>
      <rect x="180" y="80" width="40" height="40" fill="black"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(page);

    const out = path.join(dir, 'out.png');
    const size = await cropPicture(page, { x0: 0, y0: 0, x1: 1, y1: 1 }, out);

    expect(size.width).toBeLessThanOrEqual(48);
    expect(size.height).toBeLessThanOrEqual(48);
    expect(size.width).toBeGreaterThanOrEqual(40);
  });
});
```

- [ ] **Step 3: Run it to verify it fails.** Run `npm test -- crop`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `src/kanji/import/crop.ts`:

```ts
import sharp from 'sharp';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Pixel region for a fractional box, inset to drop the cell's border lines.
export function boxToRegion(box: Box, width: number, height: number, inset = 0.02) {
  const valid = [box.x0, box.y0, box.x1, box.y1].every((v) => v >= 0 && v <= 1) && box.x1 > box.x0 && box.y1 > box.y0;
  if (!valid) return null;
  const dx = (box.x1 - box.x0) * inset;
  const dy = (box.y1 - box.y0) * inset;
  const left = Math.ceil((box.x0 + dx) * width);
  const top = Math.ceil((box.y0 + dy) * height);
  const right = Math.floor((box.x1 - dx) * width);
  const bottom = Math.floor((box.y1 - dy) * height);
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, width: right - left, height: bottom - top };
}

export async function cropPicture(pagePath: string, box: Box, outPath: string) {
  const meta = await sharp(pagePath).metadata();
  const region = boxToRegion(box, meta.width!, meta.height!);
  if (!region) {
    throw new Error(`invalid picture box ${JSON.stringify(box)}`);
  }
  // Trim white margins; a small pad keeps the drawing off the edge.
  const trimmed = await sharp(pagePath).extract(region).trim({ background: '#ffffff', threshold: 60 }).toBuffer();
  const info = await sharp(trimmed)
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: '#ffffff' })
    .png()
    .toFile(outPath);
  return { width: info.width, height: info.height };
}
```

- [ ] **Step 5: Run it to verify it passes.** Run `npm test -- crop`. Expected: PASS. If the border survives at a 2% inset on the synthetic image, increase the inset or threshold, record the value in the ledger, and keep the test.
- [ ] **Step 6: Commit:** `git add package.json package-lock.json src/kanji/import/crop.ts src/kanji/import/crop.spec.ts && git commit -m "feat(kanji): crop pictographs by box with inset and trim"`

---

### Task 3: CLI `kanji:import`

**Files:**
- Create: `src/kanji-import.ts`
- Modify: `package.json` (`"kanji:import": "ts-node -r tsconfig-paths/register src/kanji-import.ts"`), `.env.template` (document `KANJI_BOOK_PDF`, `KANJI_DIR`)

**Interfaces:**
- Consumes: Tasks 1–2, `estimateBatchCostUsd` (`src/vocabulary/translation/ru-translation.ts`).
- Produces these files in `KANJI_DIR`:
  - `pages/page-NNN.png` (200 dpi, gray);
  - `ocr.batch.json` (`{ batchId, pages, collected }`);
  - `kanji.json` (`{ cards: KanjiData[] }`, sorted by number), where `KanjiData` = `KanjiCardOcr` without `picture`, plus `picture: 'NNN.png'` and `page`;
  - `pictures/NNN.png`;
  - `review.html`;
  - optional `overrides.json` (`{ "<number>": { x0, y0, x1, y1 } }`).

- [ ] **Step 1: Implement** `src/kanji-import.ts`:

```ts
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import sharp from 'sharp';

import { Box, cropPicture } from './kanji/import/crop';
import { buildOcrRequest, KanjiCardOcr, normalizeCard, parseOcrPage, validateKanjiCards } from './kanji/import/kanji-ocr';
import { estimateBatchCostUsd } from './vocabulary/translation/ru-translation';

dotenv.config();

const DIR = path.resolve(process.env.KANJI_DIR || 'local/kanji');
const PAGES_DIR = path.join(DIR, 'pages');
const PICTURES_DIR = path.join(DIR, 'pictures');
const BATCH_FILE = path.join(DIR, 'ocr.batch.json');
const OCR_MAX_HEIGHT = 1568;
const OUTPUT_TOKENS_PER_PAGE = 1500;

function pageRange(): number[] {
  const arg = process.argv.find((a) => a.startsWith('--pages='));
  const [from, to] = (arg ? arg.split('=')[1] : '26-95').split('-').map(Number);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
const pagePath = (page: number) => path.join(PAGES_DIR, `page-${String(page).padStart(3, '0')}.png`);

function render() {
  const pdf = process.env.KANJI_BOOK_PDF;
  if (!pdf || !fs.existsSync(pdf)) throw new Error('Set KANJI_BOOK_PDF in .env to the book PDF');
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  const pages = pageRange();
  execFileSync('pdftoppm', ['-f', String(pages[0]), '-l', String(pages[pages.length - 1]), '-r', '200', '-gray', '-png', pdf, path.join(PAGES_DIR, 'page')]);
  console.log(`rendered ${pages.length} pages to ${PAGES_DIR}`);
}

async function ocrRequests() {
  return Promise.all(
    pageRange().map(async (page) => {
      const png = await sharp(pagePath(page)).resize({ height: OCR_MAX_HEIGHT, withoutEnlargement: true }).png().toBuffer();
      return buildOcrRequest(page, png.toString('base64'));
    }),
  );
}

async function estimate(client: Anthropic) {
  let input = 0;
  for (const request of await ocrRequests()) {
    const { input_tokens } = await client.messages.countTokens({ model: request.params.model, messages: request.params.messages });
    input += input_tokens;
  }
  const pages = pageRange().length;
  const output = pages * OUTPUT_TOKENS_PER_PAGE;
  console.log(`pages: ${pages}, input tokens: ${input}, estimated output: ~${output}`);
  console.log(`estimated cost (batch, 50%): ~$${estimateBatchCostUsd(input, output).toFixed(2)}`);
}

async function submit(client: Anthropic) {
  if (fs.existsSync(BATCH_FILE) && !JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8')).collected) {
    throw new Error('The previous OCR batch is not collected yet. Run --collect first.');
  }
  const batch = await client.messages.batches.create({ requests: await ocrRequests() });
  fs.writeFileSync(BATCH_FILE, JSON.stringify({ batchId: batch.id, pages: pageRange(), collected: false }, null, 2));
  console.log(`submitted OCR batch ${batch.id} for ${pageRange().length} pages`);
}

async function collect(client: Anthropic) {
  const file = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8')) as { batchId: string; collected: boolean };
  const batch = await client.messages.batches.retrieve(file.batchId);
  if (batch.processing_status !== 'ended') {
    console.log(`batch ${batch.id}: ${batch.processing_status}`, batch.request_counts);
    return;
  }

  const problems: string[] = [];
  const cards: (KanjiCardOcr & { page: number })[] = [];
  for await (const entry of await client.messages.batches.results(file.batchId)) {
    const page = Number(entry.custom_id.replace('page-', ''));
    if (entry.result.type !== 'succeeded' || entry.result.message.stop_reason !== 'end_turn') {
      problems.push(`${entry.custom_id}: ${entry.result.type}`);
      continue;
    }
    const text = entry.result.message.content.find((b) => b.type === 'text');
    const parsed = text && text.type === 'text' ? parseOcrPage(text.text) : null;
    if (!parsed) {
      problems.push(`${entry.custom_id}: unparsable result`);
      continue;
    }
    parsed.cards.forEach((card) => cards.push({ ...normalizeCard(card), page }));
  }

  const inRange = cards.filter((c) => c.number >= 1 && c.number <= 100);
  problems.push(...validateKanjiCards(inRange, 1, 100));

  const overridesFile = path.join(DIR, 'overrides.json');
  const overrides: Record<string, Box> = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {};
  fs.mkdirSync(PICTURES_DIR, { recursive: true });
  const data = [];
  for (const card of inRange.sort((a, b) => a.number - b.number)) {
    const picture = `${String(card.number).padStart(3, '0')}.png`;
    try {
      await cropPicture(pagePath(card.page), overrides[card.number] ?? card.picture, path.join(PICTURES_DIR, picture));
    } catch (error) {
      problems.push(`#${card.number}: ${(error as Error).message}`);
    }
    const { picture: _box, ...rest } = card;
    data.push({ ...rest, picture });
  }
  fs.writeFileSync(path.join(DIR, 'kanji.json'), JSON.stringify({ cards: data }, null, 2));
  fs.writeFileSync(BATCH_FILE, JSON.stringify({ ...file, collected: true }, null, 2));
  console.log(`saved ${data.length} kanji, ${problems.length} problems`);
  problems.forEach((p) => console.log(`  ${p}`));
}

function review() {
  const { cards } = JSON.parse(fs.readFileSync(path.join(DIR, 'kanji.json'), 'utf8')) as { cards: Array<KanjiCardOcr & { picture: string }> };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rows = cards
    .map(
      (c) => `<div class="card"><img src="pictures/${c.picture}"><div><b>${c.number} ${esc(c.kanji)}</b> ${esc(c.kun.join('、'))} / ${esc(c.on.join('、'))}<br>${esc(c.meaningEn)} — ${esc(c.meaningRu)} (${c.strokes})<br><small>${esc(c.originEn)}</small><br><small>${c.compounds.map((x) => `${esc(x.word)} ${esc(x.reading)} ${esc(x.meaningEn)}`).join(' · ')}</small></div></div>`,
    )
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Kanji import review</title><style>body{font-family:sans-serif;margin:16px}.card{display:flex;gap:12px;border-bottom:1px solid #ddd;padding:8px}img{width:220px;height:auto;border:1px solid #eee}</style>${rows}`;
  fs.writeFileSync(path.join(DIR, 'review.html'), html);
  console.log(`open ${path.join(DIR, 'review.html')}`);
}

async function main() {
  const step = process.argv[2];
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (step === '--render') return render();
  if (step === '--estimate') return estimate(client);
  if (step === '--submit') return submit(client);
  if (step === '--collect') return collect(client);
  if (step === '--review') return review();
  console.log('usage: npm run kanji:import -- --render | --estimate | --submit | --collect | --review [--pages=26-95]');
}

main().catch((error: Error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exit(1);
});
```

Add to `.env.template`:

```
# Optional: kanji book import (npm run kanji:import); generated files stay in KANJI_DIR (gitignored)
KANJI_BOOK_PDF=
KANJI_DIR=local/kanji
```

Add `KANJI_BOOK_PDF=/Users/aray_muratova/Desktop/japanese/Kanji_N4-5_001-280.pdf` to the local `.env`. This is an append; never print the file.

- [ ] **Step 2: Free runs.**

```bash
npx tsc --noEmit -p tsconfig.json
npm run kanji:import -- --render
npm run kanji:import -- --estimate
git status --short
```

Expected: tsc is clean; 70 pages are rendered; the estimate prints about $1–2. `git status` shows only the source changes (no `local/`). **Stop and show the user the estimate. `--submit` waits for approval (Task 8).**

- [ ] **Step 3: Commit:** `git add src/kanji-import.ts package.json .env.template && git commit -m "feat(kanji): kanji:import CLI (render, estimate, submit, collect, review)"`

---

### Task 4: Data layer, progress, seed

**Files:**
- Modify: `src/progress/constants/quiz-type.constant.ts` (add `KanjiPicture = 'kanji-picture'`, `KanjiMeaning = 'kanji-meaning'`, `KanjiReading = 'kanji-reading'`)
- Create: `src/kanji/entities/kanji.entity.ts`, `src/kanji/entities/kanji-compound.entity.ts`
- Create: `src/progress/entities/user-kanji-progress.entity.ts`, `src/progress/repositories/user-kanji-progress.repository.ts`
- Modify: `src/progress/entities/answer-log.entity.ts` (nullable `kanjiId` + relation), `src/progress/services/progress.service.ts` (+ spec), `src/progress/progress.module.ts`
- Create: `migrations/1791849600005-CreateKanji.ts`
- Create: `src/kanji/repositories/kanji.repository.ts` (`upsertSeed`), `src/kanji/seed/kanji-seed.ts`, `src/kanji/kanji.module.ts`, `src/seed-kanji.ts`
- Modify: `src/app.module.ts`, `package.json` (`seed:kanji`), `src/shared/configs/configuration.ts` (`kanji.dir`), `module-options.ts` (`KANJI_DIR`, `KANJI_BOOK_PDF` optional)

**Interfaces:**
- Produces:
  - entities:
    - `Kanji { id; number; character; kunReadings: string[]; onReadings: string[]; meaningEn; meaningRu; strokes; originEn; originRu; picture; compounds: KanjiCompound[] }`
    - `KanjiCompound { id; kanjiId; kanji; word; reading; meaningEn; meaningRu }`
  - `ProgressService.recordKanjiAnswer(userId: number, kanjiId: number, quizType: QuizType, isCorrect: boolean, now: Date): Promise<{ box; nextReviewAt }>`
  - `loadKanjiFile(dir: string): KanjiData[] | null`
  - `KanjiRepository.upsertSeed(cards: KanjiData[]): Promise<number>`

- [ ] **Step 1: Failing test.** Add to `src/progress/services/progress.service.spec.ts` a `describe('ProgressService.recordKanjiAnswer')` built like the exercise one:
  - `setup` builds the service with a `kanjiProgress` mock as the new constructor argument, right after `exerciseProgress`;
  - assert the `save` of `{ userId: 7, kanjiId: 5, quizType: QuizType.KanjiPicture, box: 2, correctCount: 1, wrongCount: 0 }`;
  - assert the answer log `{ userId: 7, wordId: null, exerciseId: null, kanjiId: 5, quizType: QuizType.KanjiPicture, isCorrect: true, createdAt: now }`;
  - change the existing `setup` to pass `{} as UserKanjiProgressRepository` in that position.

  Run `npm test -- progress.service`. Expected: FAIL.

- [ ] **Step 2: Entities, migration, progress method.**

`src/kanji/entities/kanji.entity.ts`:

```ts
import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { KanjiCompound } from './kanji-compound.entity';

@Entity('kanji')
@Unique('UQ_kanji_number', ['number'])
export class Kanji {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'smallint' })
  number: number;

  @Column({ length: 4 })
  character: string;

  @Column({ type: 'jsonb' })
  kunReadings: string[];

  @Column({ type: 'jsonb' })
  onReadings: string[];

  @Column({ length: 255 })
  meaningEn: string;

  @Column({ length: 255 })
  meaningRu: string;

  @Column({ type: 'smallint' })
  strokes: number;

  @Column({ type: 'text' })
  originEn: string;

  @Column({ type: 'text' })
  originRu: string;

  @Column({ length: 20 })
  picture: string;

  @OneToMany(() => KanjiCompound, (compound) => compound.kanji)
  compounds: KanjiCompound[];
}
```

`src/kanji/entities/kanji-compound.entity.ts`:

```ts
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { Kanji } from './kanji.entity';

@Entity('kanji_compounds')
@Unique('UQ_kanji_compounds_kanji_word', ['kanjiId', 'word'])
export class KanjiCompound {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  kanjiId: number;

  @ManyToOne(() => Kanji, (kanji) => kanji.compounds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kanjiId' })
  kanji: Kanji;

  @Column({ length: 50 })
  word: string;

  @Column({ length: 100 })
  reading: string;

  @Column({ length: 255 })
  meaningEn: string;

  @Column({ length: 255 })
  meaningRu: string;
}
```

`UserKanjiProgress` mirrors `UserExerciseProgress`:
- `kanjiId` FK → `kanji` (cascade) instead of `exerciseId`;
- an extra column `@Column({ type: 'varchar', length: 20 }) quizType: QuizType`;
- unique `UQ_user_kanji_progress` (`userId`, `kanjiId`, `quizType`).

Its repository follows `UserExerciseProgressRepository`.

`AnswerLog` gains `@Column({ type: 'integer', nullable: true }) kanjiId: number | null;` plus a `ManyToOne(() => Kanji, { onDelete: 'CASCADE' })` relation on `kanjiId`.

`migrations/1791849600005-CreateKanji.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKanji1791849600005 implements MigrationInterface {
  name = 'CreateKanji1791849600005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "kanji" (
      "id" SERIAL NOT NULL, "number" smallint NOT NULL, "character" character varying(4) NOT NULL,
      "kunReadings" jsonb NOT NULL, "onReadings" jsonb NOT NULL,
      "meaningEn" character varying(255) NOT NULL, "meaningRu" character varying(255) NOT NULL,
      "strokes" smallint NOT NULL, "originEn" text NOT NULL, "originRu" text NOT NULL,
      "picture" character varying(20) NOT NULL,
      CONSTRAINT "UQ_kanji_number" UNIQUE ("number"), CONSTRAINT "PK_kanji" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "kanji_compounds" (
      "id" SERIAL NOT NULL, "kanjiId" integer NOT NULL, "word" character varying(50) NOT NULL,
      "reading" character varying(100) NOT NULL, "meaningEn" character varying(255) NOT NULL,
      "meaningRu" character varying(255) NOT NULL,
      CONSTRAINT "UQ_kanji_compounds_kanji_word" UNIQUE ("kanjiId", "word"),
      CONSTRAINT "PK_kanji_compounds" PRIMARY KEY ("id"),
      CONSTRAINT "FK_kanji_compounds_kanji" FOREIGN KEY ("kanjiId") REFERENCES "kanji"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "user_kanji_progress" (
      "id" SERIAL NOT NULL, "userId" integer NOT NULL, "kanjiId" integer NOT NULL,
      "quizType" character varying(20) NOT NULL, "box" smallint NOT NULL DEFAULT 1,
      "nextReviewAt" TIMESTAMP NOT NULL, "correctCount" integer NOT NULL DEFAULT 0,
      "wrongCount" integer NOT NULL DEFAULT 0,
      CONSTRAINT "UQ_user_kanji_progress" UNIQUE ("userId", "kanjiId", "quizType"),
      CONSTRAINT "PK_user_kanji_progress" PRIMARY KEY ("id"),
      CONSTRAINT "FK_user_kanji_progress_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_user_kanji_progress_kanji" FOREIGN KEY ("kanjiId") REFERENCES "kanji"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`ALTER TABLE "answer_log" ADD "kanjiId" integer`);
    await queryRunner.query(`ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_kanji" FOREIGN KEY ("kanjiId") REFERENCES "kanji"("id") ON DELETE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "answer_log" WHERE "kanjiId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP CONSTRAINT "FK_answer_log_kanji"`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP COLUMN "kanjiId"`);
    await queryRunner.query(`DROP TABLE "user_kanji_progress"`);
    await queryRunner.query(`DROP TABLE "kanji_compounds"`);
    await queryRunner.query(`DROP TABLE "kanji"`);
  }
}
```

`ProgressService`:
- the constructor gains `private kanjiProgressRepository: UserKanjiProgressRepository` after `exerciseProgressRepository`;
- `recordKanjiAnswer` mirrors `recordExerciseAnswer`, with `where: { userId, kanjiId, quizType }` and `quizType` in the saved progress;
- the log is `{ userId, wordId: null, exerciseId: null, kanjiId, quizType, isCorrect, createdAt: now }`;
- also add `exerciseId: null, kanjiId: null` to the word `recordAnswer` log, and `kanjiId: null` to the exercise log;
- update the existing exercise test's expected log object to include `kanjiId: null`;
- register the entity and repository in `ProgressModule`.

- [ ] **Step 3: Seed.**
  - `src/kanji/seed/kanji-seed.ts`:
    - `export interface KanjiData` = the fields of `KanjiCardOcr` without `picture`, plus `picture: string` and `page: number`;
    - `loadKanjiFile(dir)` reads `path.join(dir, 'kanji.json')`, returning `null` if it is absent.
  - `KanjiRepository.upsertSeed(cards)`: for each card, upsert `Kanji` by `number` (map `kun`→`kunReadings` and `on`→`onReadings`), then upsert each compound by (`kanjiId`, `word`). Return the count.
  - `src/kanji/kanji.module.ts` (repositories only for now, imports `ProgressModule`), registered in `AppModule`.
  - `src/seed-kanji.ts`: build the app context, read `KANJI_DIR` (default `local/kanji`), then upsert, or print `No kanji.json in <dir>. Run npm run kanji:import first.`
  - Script: `"seed:kanji": "ts-node -r tsconfig-paths/register src/seed-kanji.ts"`.
  - Config: `kanji: { dir: process.env.KANJI_DIR || 'local/kanji' }`, plus Joi `KANJI_DIR: Joi.string().optional()` and `KANJI_BOOK_PDF: Joi.string().allow('').optional()`.

- [ ] **Step 4: Verify.** Run `npm test -- progress.service` (PASS), `npm run migration:run`, `npm run seed:kanji` (prints the "No kanji.json" hint), then `npm test` and `npm run test:e2e` (all green).
- [ ] **Step 5: Commit:** `git add src migrations package.json && git commit -m "feat(kanji): kanji tables, kanji progress and seed command"`

---

### Task 5: Quiz builders and answer checking (pure)

**Files:**
- Create: `src/kanji/domain/kanji-quiz.ts`
- Test: `src/kanji/domain/kanji-quiz.spec.ts`

**Interfaces:**
- Produces:
  - `type KanjiQuizKind = 'picture' | 'meaning' | 'reading'`, `KIND_TO_QUIZ_TYPE: Record<KanjiQuizKind, QuizType>`
  - `pictureUrl(kanji)` → `kanji-pictures/NNN.png`
  - `buildPictureQuestion(kanji, pool, rng?)` → `{ kanjiId, pictureUrl, options }`
  - `buildMeaningQuestion(kanji, pool, rng?)` → `{ kanjiId, character, options, optionsRu }`
  - `buildReadingQuestion(kanji, compound, compoundPool, rng?)` → `{ kanjiId, compoundId, word, options }`
  - `checkKanjiAnswer(kind, kanji, compound | null, answer)` → `{ isCorrect, correctAnswer }`
  - `toKanjiCard(kanji)` → `{ number, character, kunReadings, onReadings, meaningEn, meaningRu, strokes, originEn, originRu, pictureUrl, compounds: { word, reading, meaningEn, meaningRu }[] }`

- [ ] **Step 1: Write the failing test** `src/kanji/domain/kanji-quiz.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails.** Run `npm test -- kanji-quiz`. Expected: FAIL.

- [ ] **Step 3: Implement** `src/kanji/domain/kanji-quiz.ts`:

```ts
import { QuizType } from '../../progress/constants/quiz-type.constant';
import { OPTIONS_PER_QUESTION, Rng, shuffle } from '../../quiz/domain/quiz-builder';
import { Kanji } from '../entities/kanji.entity';
import { KanjiCompound } from '../entities/kanji-compound.entity';

export type KanjiQuizKind = 'picture' | 'meaning' | 'reading';

export const KIND_TO_QUIZ_TYPE: Record<KanjiQuizKind, QuizType> = {
  picture: QuizType.KanjiPicture,
  meaning: QuizType.KanjiMeaning,
  reading: QuizType.KanjiReading,
};

export const pictureUrl = (kanji: Kanji) => `kanji-pictures/${kanji.picture}`;

// Picks the answer plus distinct distractors (by every key), in random order.
function pickOptions<T>(answer: T, candidates: T[], keys: ((item: T) => string)[], rng: Rng): T[] {
  const chosen = [answer];
  for (const candidate of shuffle(candidates, rng)) {
    if (chosen.length === OPTIONS_PER_QUESTION) break;
    if (chosen.some((c) => keys.some((key) => key(c) === key(candidate)))) continue;
    chosen.push(candidate);
  }
  return shuffle(chosen, rng);
}

export function buildPictureQuestion(kanji: Kanji, pool: Kanji[], rng: Rng = Math.random) {
  const options = pickOptions(kanji, pool.filter((k) => k.id !== kanji.id), [(k) => k.character], rng);
  return { kanjiId: kanji.id, pictureUrl: pictureUrl(kanji), options: options.map((k) => k.character) };
}

export function buildMeaningQuestion(kanji: Kanji, pool: Kanji[], rng: Rng = Math.random) {
  const options = pickOptions(kanji, pool.filter((k) => k.id !== kanji.id), [(k) => k.meaningEn, (k) => k.meaningRu], rng);
  return {
    kanjiId: kanji.id,
    character: kanji.character,
    options: options.map((k) => k.meaningEn),
    optionsRu: options.map((k) => k.meaningRu),
  };
}

export function buildReadingQuestion(kanji: Kanji, compound: KanjiCompound, pool: KanjiCompound[], rng: Rng = Math.random) {
  // Prefer readings of similar length so the answer does not stand out.
  const others = shuffle(pool.filter((c) => c.id !== compound.id), rng).sort(
    (a, b) => Math.abs(a.reading.length - compound.reading.length) - Math.abs(b.reading.length - compound.reading.length),
  );
  const chosen = [compound];
  for (const candidate of others) {
    if (chosen.length === OPTIONS_PER_QUESTION) break;
    if (chosen.some((c) => c.reading === candidate.reading)) continue;
    chosen.push(candidate);
  }
  return {
    kanjiId: kanji.id,
    compoundId: compound.id,
    word: compound.word,
    options: shuffle(chosen, rng).map((c) => c.reading),
  };
}

export function checkKanjiAnswer(kind: KanjiQuizKind, kanji: Kanji, compound: KanjiCompound | null, answer: string) {
  const correctAnswer =
    kind === 'picture' ? kanji.character : kind === 'meaning' ? kanji.meaningEn : (compound?.reading ?? '');
  return { isCorrect: answer.trim() === correctAnswer, correctAnswer };
}

export function toKanjiCard(kanji: Kanji) {
  return {
    number: kanji.number,
    character: kanji.character,
    kunReadings: kanji.kunReadings,
    onReadings: kanji.onReadings,
    meaningEn: kanji.meaningEn,
    meaningRu: kanji.meaningRu,
    strokes: kanji.strokes,
    originEn: kanji.originEn,
    originRu: kanji.originRu,
    pictureUrl: pictureUrl(kanji),
    compounds: (kanji.compounds ?? []).map(({ word, reading, meaningEn, meaningRu }) => ({ word, reading, meaningEn, meaningRu })),
  };
}
```

- [ ] **Step 4:** Run `npm test -- kanji-quiz` → PASS. Commit: `git add src/kanji/domain && git commit -m "feat(kanji): build picture, meaning and reading questions"`

---

### Task 6: Endpoints, picture route, e2e

**Files:**
- Create: `src/kanji/repositories/kanji-compound.repository.ts`; extend `KanjiRepository` with `findForQuiz` and `getByIdWithCompounds`
- Create: `src/kanji/dtos/kanji-quiz-query.dto.ts`, `kanji-answer-input.dto.ts`, `kanji-output.dto.ts`
- Create: `src/kanji/services/kanji.service.ts`, `src/kanji/controllers/kanji.controller.ts`, `src/kanji/controllers/kanji-picture.controller.ts`
- Modify: `src/kanji/kanji.module.ts`
- Test: `test/nihongo/kanji.e2e-spec.ts`

**Interfaces (HTTP):**
- `GET /kanji/ranges` → `{ total, from, to }`. When there are no kanji, it returns `{ total: 0, from: 0, to: 0 }`.
- `GET /quiz/kanji?type&from&to&count` → questions as in Task 5. `reading` picks one random compound per selected kanji and skips kanji without compounds.
- `POST /kanji/answer` with `{ type, kanjiId, compoundId?, answer }` → `{ isCorrect, correctAnswer, newBox, nextReviewAt, card }`. It returns 404 for an unknown kanji, 400 if `type=reading` has no `compoundId` or the compound belongs to another kanji, and 404 for an unknown compound.
- `GET /kanji-pictures/:file` (no guard) serves `^\d{3}\.png$` from `<KANJI_DIR>/pictures`, and returns 404 otherwise or if the file is missing.

- [ ] **Step 1: Write the failing e2e** `test/nihongo/kanji.e2e-spec.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { KanjiRepository } from '../../src/kanji/repositories/kanji.repository';
import { closeDBAfterTest } from '../test-utils';
import { createNihongoTestApp, registerAndLogin } from './nihongo-test-utils';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const card = (number: number, kanji: string, meaningEn: string, meaningRu: string, compounds: [string, string][]) => ({
  number, kanji, kun: ['よみ'], on: ['ヨミ'], meaningEn, meaningRu, strokes: 4, originEn: 'picture', originRu: 'рисунок',
  compounds: compounds.map(([word, reading]) => ({ word, reading, meaningEn: 'm', meaningRu: 'м' })),
  picture: `${String(number).padStart(3, '0')}.png`, page: 26,
});

describe('Kanji (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanji-'));
    fs.mkdirSync(path.join(dir, 'pictures'));
    fs.writeFileSync(path.join(dir, 'pictures', '061.png'), PNG);
    process.env.KANJI_DIR = dir;
    app = await createNihongoTestApp();
    token = await registerAndLogin(app, 'kanji-user');
  });

  const get = (p: string) => request(app.getHttpServer()).get(p).set('Authorization', 'Bearer ' + token);
  const post = (p: string, body: object) => request(app.getHttpServer()).post(p).set('Authorization', 'Bearer ' + token).send(body);

  it('reports an empty range before import', async () => {
    const response = await get('/kanji/ranges').expect(HttpStatus.OK);
    expect(response.body.data).toEqual({ total: 0, from: 0, to: 0 });
  });

  describe('with kanji', () => {
    beforeAll(async () => {
      await app.get(KanjiRepository).upsertSeed([
        card(61, '牛', 'cow', 'корова', [['牛肉', 'ぎゅうにく'], ['水牛', 'すいぎゅう']]),
        card(62, '馬', 'horse', 'лошадь', [['馬車', 'ばしゃ']]),
        card(63, '魚', 'fish', 'рыба', [['金魚', 'きんぎょ'], ['人魚', 'にんぎょ']]),
        card(64, '貝', 'shell', 'ракушка', [['貝', 'かい']]),
        card(65, '雨', 'rain', 'дождь', []),
      ]);
    });

    it('reports the range', async () => {
      expect((await get('/kanji/ranges').expect(HttpStatus.OK)).body.data).toEqual({ total: 5, from: 61, to: 65 });
    });

    it('serves the three quiz types without leaking answers', async () => {
      const picture = (await get('/quiz/kanji?type=picture&from=61&to=65').expect(HttpStatus.OK)).body.data;
      expect(picture).toHaveLength(5);
      expect(Object.keys(picture[0]).sort()).toEqual(['kanjiId', 'options', 'pictureUrl']);
      expect(new Set(picture[0].options).size).toBe(4);

      const meaning = (await get('/quiz/kanji?type=meaning&from=61&to=62').expect(HttpStatus.OK)).body.data;
      expect(meaning).toHaveLength(2);
      expect(Object.keys(meaning[0]).sort()).toEqual(['character', 'kanjiId', 'options', 'optionsRu']);

      const reading = (await get('/quiz/kanji?type=reading&from=61&to=65').expect(HttpStatus.OK)).body.data;
      expect(reading).toHaveLength(4); // 雨 has no compounds
      expect(Object.keys(reading[0]).sort()).toEqual(['compoundId', 'kanjiId', 'options', 'word']);
    });

    it('validates the query', async () => {
      await get('/quiz/kanji?type=kanji&from=1&to=10').expect(HttpStatus.BAD_REQUEST);
      await get('/quiz/kanji?type=picture&from=1&to=10&count=21').expect(HttpStatus.BAD_REQUEST);
    });

    it('checks answers and returns the card', async () => {
      const [q] = (await get('/quiz/kanji?type=picture&from=61&to=61').expect(HttpStatus.OK)).body.data;
      const correct = await post('/kanji/answer', { type: 'picture', kanjiId: q.kanjiId, answer: '牛' }).expect(HttpStatus.OK);
      expect(correct.body.data).toEqual(expect.objectContaining({ isCorrect: true, correctAnswer: '牛', newBox: 2 }));
      expect(correct.body.data.card).toEqual(expect.objectContaining({ character: '牛', pictureUrl: 'kanji-pictures/061.png' }));
      expect(correct.body.data.card.compounds).toHaveLength(2);

      const [r] = (await get('/quiz/kanji?type=reading&from=62&to=62').expect(HttpStatus.OK)).body.data;
      await post('/kanji/answer', { type: 'reading', kanjiId: r.kanjiId, compoundId: r.compoundId, answer: 'ばしゃ' }).expect(HttpStatus.OK);
      await post('/kanji/answer', { type: 'reading', kanjiId: q.kanjiId, compoundId: r.compoundId, answer: 'ばしゃ' }).expect(HttpStatus.BAD_REQUEST);
      await post('/kanji/answer', { type: 'reading', kanjiId: q.kanjiId, answer: 'x' }).expect(HttpStatus.BAD_REQUEST);
      await post('/kanji/answer', { type: 'picture', kanjiId: 999999, answer: 'x' }).expect(HttpStatus.NOT_FOUND);
    });

    it('serves pictures without auth and refuses other paths', async () => {
      await request(app.getHttpServer()).get('/kanji-pictures/061.png').expect(HttpStatus.OK).expect('Content-Type', /png/);
      await request(app.getHttpServer()).get('/kanji-pictures/062.png').expect(HttpStatus.NOT_FOUND);
      await request(app.getHttpServer()).get('/kanji-pictures/..%2F.env').expect(HttpStatus.NOT_FOUND);
      await request(app.getHttpServer()).get('/kanji-pictures/abc.png').expect(HttpStatus.NOT_FOUND);
    });
  });

  it('requires a token for the quiz', () => request(app.getHttpServer()).get('/kanji/ranges').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    delete process.env.KANJI_DIR;
    await app.close();
    await closeDBAfterTest();
  });
});
```

Run `npm run test:e2e -- kanji`. Expected: FAIL (404 on `/kanji/ranges`).

- [ ] **Step 2: Implement.**

`KanjiRepository.findForQuiz(userId, quizType, from, to, count)`: like `GrammarExerciseRepository.findForQuiz`, built on `createQueryBuilder('k')`:
- `.leftJoin(UserKanjiProgress, 'up', 'up.kanjiId = k.id AND up.userId = :userId AND up.quizType = :quizType', …)`;
- `.where('k.number BETWEEN :from AND :to')`;
- `.leftJoinAndSelect('k.compounds', 'c')` must NOT be combined with `LIMIT`, so the compounds are loaded separately in the service;
- the same priority CASE with the `:now` parameter, `RANDOM()`, and `.limit(count)`.

`KanjiRepository.getByIdWithCompounds(id)` loads the `compounds` relation and throws `NotFoundException` when there is none.

`KanjiCompoundRepository` is a plain repository.

DTOs:
- `KanjiQuizQueryInput`:
  - `type`: `@IsIn(['picture','meaning','reading'])`;
  - `from` / `to`: `@IsInt @Min(1) @Max(400)`, transformed with `parseInt`, defaults 1 and 400;
  - `count`: same as the grammar `count` (1–20, default 10).
- `KanjiAnswerInput`:
  - `type`: `@IsIn(…)`;
  - `kanjiId`: `@IsInt @Min(1) @Max(2147483647)`;
  - `compoundId?`: same range, optional;
  - `answer`: `@IsString @IsNotEmpty @MaxLength(100)`.
- `kanji-output.dto.ts`: Swagger classes for the ranges, the three question shapes, the card and the answer output, with fields as in Task 5.

`KanjiService`:
- `getRanges()`: `SELECT COUNT(*), MIN(number), MAX(number) FROM kanji`. It returns `{ total, from, to }`, with zeros when the table is empty.
- `getQuiz(ctx, type, from, to, count)`:
  1. load `selected = findForQuiz(...)`;
  2. load `pool = find({ where: { number: Between(from, to) } })`;
  3. for `picture` / `meaning`, map with the builders;
  4. for `reading`, load the compounds of the pool kanji (`KanjiCompoundRepository.find({ where: { kanjiId: In(poolIds) } })`). Skip selected kanji without compounds, pick one compound at random, and build the question with the whole compound pool.
- `answer(ctx, input)`:
  1. load the kanji with its compounds (404 if missing);
  2. for reading, require `compoundId` (400 if absent), find it in `kanji.compounds`, and if it is missing check whether it exists at all: `findOne` → 400 if it belongs to another kanji, 404 if unknown;
  3. `checkKanjiAnswer`;
  4. `progressService.recordKanjiAnswer(userId, kanji.id, KIND_TO_QUIZ_TYPE[type], isCorrect, new Date())`;
  5. return `{ isCorrect, correctAnswer, newBox, nextReviewAt, card: toKanjiCard(kanji) }`.

`KanjiController` (guarded, `@Controller()`):
- `@Get('kanji/ranges')`;
- `@Get('quiz/kanji')`;
- `@Post('kanji/answer') @HttpCode(200)`.

`KanjiPictureController` (no guard):

```ts
import * as fs from 'fs';
import * as path from 'path';

import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';

const PICTURE_FILE = /^\d{3}\.png$/;

// Unauthenticated on purpose: <img> tags cannot send the bearer token. Only NNN.png files are served.
@ApiExcludeController()
@Controller('kanji-pictures')
export class KanjiPictureController {
  constructor(private readonly config: ConfigService) {}

  @Get(':file')
  getPicture(@Param('file') file: string, @Res() res: Response) {
    const dir = path.resolve(this.config.get<string>('kanji.dir') ?? 'local/kanji', 'pictures');
    const full = path.join(dir, file);
    if (!PICTURE_FILE.test(file) || !fs.existsSync(full)) {
      throw new NotFoundException();
    }
    res.sendFile(full);
  }
}
```

Register the service, repositories, both controllers and `JwtAuthStrategy` in `KanjiModule`.

- [ ] **Step 3: Verify.** Run `npm run test:e2e -- kanji` → PASS. Then `npm test`, `npm run test:e2e` and `npm run lint` → all green (only the 2 pre-existing starter lint errors remain).
- [ ] **Step 4: Commit:** `git add src test && git commit -m "feat(kanji): kanji quiz endpoints and picture route"`

---

### Task 7: Frontend (`nihongo-web`)

**Files:**
- Modify: `src/lib/api/types.ts`, `src/lib/api/endpoints.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/ru.ts`, `src/features/quiz/labels.ts` (`optionLabel` accepts `{ options: string[]; optionsRu?: string[] }`), `src/features/dashboard/DashboardPage.tsx`, `src/App.tsx`
- Create: `src/features/kanji/KanjiHomePage.tsx`, `KanjiQuizPage.tsx`, `KanjiSession.tsx`, `KanjiCard.tsx`, `src/features/kanji/kanji.ts` (+ `kanji.spec.ts`)

**Interfaces:**
- `kanji.ts`:
  - `KANJI_RANGES = [{ from: 1, to: 50 }, { from: 51, to: 100 }]`
  - `pictureSrc(url: string): string`, which returns `` `${API_URL}/${url}` ``
  - `kanjiQuizPath(type, from, to)`

- [ ] **Step 1: Failing test** `src/features/kanji/kanji.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { kanjiQuizPath, pictureSrc } from './kanji';

describe('kanji helpers', () => {
  it('builds the picture URL against the API origin', () => {
    expect(pictureSrc('kanji-pictures/061.png')).toMatch(/\/api\/v1\/kanji-pictures\/061\.png$/);
  });

  it('builds quiz paths', () => {
    expect(kanjiQuizPath('picture', 1, 50)).toBe('/quiz/kanji?type=picture&from=1&to=50');
  });
});
```

Run `npx vitest run`. Expected: FAIL.

- [ ] **Step 2: Implement.**

`types.ts`:
- `KanjiQuizType = 'picture' | 'meaning' | 'reading'`;
- `KanjiQuestion { kanjiId: number; compoundId?: number; pictureUrl?: string; character?: string; word?: string; options: string[]; optionsRu?: string[] }`;
- `KanjiCardData { number; character; kunReadings: string[]; onReadings: string[]; meaningEn; meaningRu; strokes; originEn; originRu; pictureUrl; compounds: { word; reading; meaningEn; meaningRu }[] }`;
- `KanjiAnswerResult { isCorrect; correctAnswer; newBox; nextReviewAt: string; card: KanjiCardData }`;
- `KanjiRanges { total: number; from: number; to: number }`.

`endpoints.ts`:
- `getKanjiRanges()` → `GET /kanji/ranges`;
- `getKanjiQuiz(type, from, to, count = 10)` → `GET /quiz/kanji`;
- `submitKanjiAnswer({ type, kanjiId, compoundId?, answer })` → `POST /kanji/answer`.

`kanji.ts`:

```ts
import { API_URL } from '@/lib/api/client';
import { KanjiQuizType } from '@/lib/api/types';

export const KANJI_RANGES = [
  { from: 1, to: 50 },
  { from: 51, to: 100 },
];

export const pictureSrc = (url: string) => `${API_URL}/${url}`;

export const kanjiQuizPath = (type: KanjiQuizType, from: number, to: number) =>
  `/quiz/kanji?type=${type}&from=${from}&to=${to}`;
```

Strings, with the same keys in `en.ts` and `ru.ts`:

```ts
  'mode.kanji.title': 'Kanji' / 'Кандзи',
  'mode.kanji.description': 'Pictures, meanings and readings from your kanji book.' / 'Картинки, значения и чтения из вашей книги кандзи.',
  'kanji.subtitle': 'Choose a question type and a range.' / 'Выберите тип вопросов и диапазон.',
  'kanji.type.picture': 'Picture → kanji' / 'Картинка → кандзи',
  'kanji.type.meaning': 'Kanji → meaning' / 'Кандзи → значение',
  'kanji.type.reading': 'Word → reading' / 'Слово → чтение',
  'kanji.range': 'Kanji {from}–{to}' / 'Кандзи {from}–{to}',
  'kanji.all': 'All imported ({total})' / 'Все импортированные ({total})',
  'kanji.emptyTitle': 'No kanji imported yet' / 'Кандзи ещё не импортированы',
  'kanji.emptyHint': 'Run npm run kanji:import and npm run seed:kanji in the API project.' / 'Запустите npm run kanji:import и npm run seed:kanji в проекте API.',
  'kanji.prompt.picture': 'Which kanji does this picture show?' / 'Какой кандзи на картинке?',
  'kanji.prompt.meaning': 'What does this kanji mean?' / 'Что означает этот кандзи?',
  'kanji.prompt.reading': 'How is this word read?' / 'Как читается это слово?',
  'kanji.kun': 'kun' / 'кун',
  'kanji.on': 'on' / 'он',
  'kanji.strokes': 'Strokes: {count}' / 'Черт: {count}',
  'kanji.words': 'Words' / 'Слова',
  'kanji.loadError': 'Could not load kanji' / 'Не удалось загрузить кандзи',
```

(Write them as two separate dictionaries, of course; the slash only shows EN / RU here.)

`KanjiCard.tsx`:
- a card with a two-column header: the `<img src={pictureSrc(card.pictureUrl)}>` on the left (max-h-32, object-contain) and the big `card.character` (font-jp text-7xl) on the right;
- below: kun and on readings with labels (`t('kanji.kun')`, `t('kanji.on')`), the meaning in the UI language, the origin in the UI language, and the stroke count;
- a "Words" list with each compound as `<ruby>{word}<rt>{reading}</rt></ruby>` followed by the meaning in the UI language.

`KanjiSession.tsx`: structure like `GrammarSession`, using `submitKanjiAnswer`.
- Prompt by type:
  - picture: `<img>` (h-40, object-contain, rounded border, white bg);
  - meaning: the character in font-jp text-8xl;
  - reading: the word in font-jp text-6xl.
- Option labels:
  - meaning: `optionLabel(question, option, language)`;
  - otherwise the option text, with `japanese` set for picture and reading.
- After any answer:
  - keep the result;
  - show `<KanjiCard card={result.card} />` and "Next";
  - no auto-advance;
  - Enter → next, handled by the same keydown pattern as `GrammarSession`, with `preventDefault`.
- Mistakes go into `QuizResult`: prompt = the character or word (or a small `<img>` for picture), with chosen and correct as labels.
- Invalidate the `['summary']` query on finish.

`KanjiQuizPage.tsx`: parse `type` (default `picture`) and `from`/`to` (clamped to 1–400), query `['kanji-quiz', type, from, to, round]`, then show skeleton / error / empty states (as in the grammar page) or render `KanjiSession`.

`KanjiHomePage.tsx`:
- query `getKanjiRanges`;
- if `total === 0`, show `EmptyState` with `kanji.emptyTitle` and `kanji.emptyHint`;
- otherwise, for each type, a card with its title and three range links:
  - `KANJI_RANGES` entries that overlap the imported range;
  - plus "All imported", linking to `kanjiQuizPath(type, from, to)` from the ranges.

Dashboard: add a fourth `ModeCard` (`kanji="漢字"`, title `mode.kanji.title`, to `/kanji`), and change the mode grid to `md:grid-cols-2`.

`App.tsx`: add routes `kanji` → `KanjiHomePage` and `quiz/kanji` → `KanjiQuizPage`, before `quiz/:type`.

- [ ] **Step 3: Verify.** Run `npx vitest run`, `npm run build` and `npm run lint` → green. Before the import, `/kanji` must show the empty state (Review Focus #5).
- [ ] **Step 4: Commit:** `git add -A && git commit -m "feat: kanji quizzes with book pictures and kanji cards"`

---

### Task 8: Run the import (user-approved), review, seed, verify

- [ ] **Step 1:** Show the user the `--estimate` numbers and wait for "yes".
- [ ] **Step 2:** Run `npm run kanji:import -- --submit`, then poll `--collect` every ~2 minutes in the background until it reports saved kanji.
- [ ] **Step 3:** Run `npm run kanji:import -- --review`, then screenshot `local/kanji/review.html` in the browser, in batches of about 25 cards.
  - Fix bad boxes via `overrides.json` and re-run `--collect`; it re-crops from the stored batch results for free.
  - Fix OCR text errors by hand in `kanji.json`.
- [ ] **Step 4:** Validation must report 0 problems, or only problems accepted by the user. Run `npm run seed:kanji`, which prints 100.
- [ ] **Step 5:** Browser check:
  - all three types, in RU and EN;
  - the card after each answer;
  - the result screen;
  - 375 px width and dark mode.
  - `git status` in both repos must show no book content.
- [ ] **Step 6:** Final whole-branch review with a fresh reviewer, plus a sample of about 20 imported cards compared against the page images.

Note on re-collecting: once a batch is `collected`, `--collect` needs to be able to run again for crop and override fixes. Implement this by letting `--collect` proceed when `collected` is true but the batch id is present. Results stay available for 29 days. Adjust Task 3's guard accordingly: `--collect` never refuses a known batch id.
