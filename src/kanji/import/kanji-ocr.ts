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
    // The book sometimes prints alternatives (にほん/にっぽん); the quiz uses the first.
    compounds: card.compounds.map((c) => ({ ...c, word: c.word.replace(/\s/g, ''), reading: c.reading.split('/')[0].replace(STRIP, '') })),
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

// Cards from re-read pages replace the earlier ones from those pages; result sorted by number.
export function mergeCards<T extends { number: number; page: number }>(
  existing: T[],
  incoming: T[],
  rereadPages: number[],
): T[] {
  const reread = new Set(rereadPages);
  return [...existing.filter((c) => !reread.has(c.page)), ...incoming].sort((a, b) => a.number - b.number);
}

interface BatchEntry {
  custom_id: string;
  result: {
    type: string;
    message?: { stop_reason: string | null; content: { type: string; text?: string }[] };
  };
}

// One batch entry → its page's cards, or null with the reason when the page must not replace old cards.
export function readPageResult(entry: BatchEntry): { page: number; cards: KanjiCardOcr[] | null; problem?: string } {
  const page = Number(entry.custom_id.replace('page-', ''));
  const fail = (reason: string) => ({ page, cards: null, problem: `${entry.custom_id}: ${reason}` });
  if (entry.result.type !== 'succeeded' || !entry.result.message) {
    return fail(entry.result.type);
  }
  const { stop_reason, content } = entry.result.message;
  if (stop_reason !== 'end_turn') {
    return fail(`stopped by ${stop_reason}`);
  }
  const text = content.find((block) => block.type === 'text')?.text;
  const parsed = text ? parseOcrPage(text) : null;
  return parsed ? { page, cards: parsed.cards } : fail('unparsable result');
}
