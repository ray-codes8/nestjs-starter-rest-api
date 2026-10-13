# Russian Word Meanings — Design

Date: 2026-10-13
Status: approved in brainstorming, pending written-spec review
Builds on: `2026-10-13-nihongo-quiz-design.md`, `2026-10-13-ai-explanations-design.md`

## Goal

When the UI is in Russian, the vocabulary quiz options, the dictionary and the AI explanations use
Russian meanings. The ~1300 JLPT N5/N4 meanings are translated once by Claude through the Message
Batches API. The result is committed as a data file and loaded by the word seed.

Branch: continue on `feature/grammar` in both repos (not merged yet).

## Translation (one-off script)

- `npm run translate:meanings -- <step>`, implemented in `src/translate-meanings.ts`. Each step that
  spends money runs only after the user approves it.
  - `--estimate`: builds the batch requests and calls `messages.countTokens` (free) for each. It
    prints the input tokens, an output estimate and a dollar estimate at batch prices (50% of
    `claude-opus-5-5` $4/$20 per MTok). It writes nothing and spends nothing.
  - `--submit`: creates the batch and writes its id to `src/vocabulary/seed/data/ru-meanings.batch.json`.
    It refuses to run if that file already holds an unfinished batch.
  - `--collect`: retrieves the batch. If the batch has not ended, it prints the status and exits. If
    it has ended, it parses every succeeded result and writes `src/vocabulary/seed/data/ru-meanings.json`.
    It then prints the words that are missing or invalid (errored/expired chunk, missing id, empty or
    non-Cyrillic value) so they can be resubmitted.
- Requests:
  - words come from both seed files and are deduplicated by `level|kana|kanji`;
  - they are split into chunks of 100, `custom_id` = `chunk-<n>`;
  - model `claude-opus-5-5`, `output_config.effort: 'low'` (short dictionary glosses),
    `max_tokens: 16000`;
  - structured output via `output_config.format` (JSON schema from Zod): `{ items: [{ id, ru }] }`.
- Prompt: a Japanese→Russian dictionary translator. For each item (id, kanji, kana, English
  gloss), give a short Russian dictionary gloss of 1–4 words with the same sense as the English
  gloss. Verbs go in the infinitive. Notes in parentheses are translated. Japanese words stay in
  Japanese.
- Output file `ru-meanings.json`: `{ "<level>|<kana>|<kanji or empty>": "<russian>" }`, sorted keys,
  committed, hand-editable.

## Seed and data

- `loadWordSeeds(csv, level, ruMeanings?)` sets `meaningRu` from the map, or `null` when it is missing.
- `npm run seed:words` loads `ru-meanings.json` when the file exists. The seed upserts, so existing
  rows get `meaningRu` filled in.
- Test: every seeded word has a non-empty Cyrillic `meaningRu` once the file is present.

## API

- Vocabulary questions gain `optionsRu: string[]`, parallel to `options`. Each entry is the word's
  `meaningRu` when present, otherwise the English option. `options` stay English and canonical:
  answers and explanations are unchanged.
- Distractors must differ from the correct answer and from each other in both English and in the
  Russian display text.
- `WordOutput` (`GET /vocabulary`) gains `meaningRu: string | null`.
- Explanations: when `language` is `ru`, the prompt also includes the Russian meaning
  (`ExplanationPromptInput.meaningRu`), so Claude can refer to it.

## Frontend

- Vocabulary quiz: the option labels, the correct-answer highlight and the mistakes list show
  `optionsRu[i]` in RU mode. The answer submits `options[i]`. Switching EN/RU mid-round relabels the
  options instantly.
- Dictionary: the Meaning column shows `meaningRu ?? meaningEn` in RU mode. Search matches both.

## Testing

- Unit:
  - question building adds `optionsRu` with options unique in both languages;
  - the batch result parser handles valid, missing, empty and non-Cyrillic items;
  - the request builder produces chunking and ids;
  - the seed applies `meaningRu`;
  - `ru-meanings.json` covers all words (after collection).
- e2e: the vocabulary quiz includes `optionsRu`, and `GET /vocabulary` returns `meaningRu`.

## Out of scope

Russian meanings for words added later (rerun the script), editing translations in the UI, and
other languages.
