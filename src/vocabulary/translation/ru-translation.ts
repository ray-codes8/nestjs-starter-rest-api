import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { RuMeanings, wordKey,WordSeed } from '../seed/word-seed';

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
