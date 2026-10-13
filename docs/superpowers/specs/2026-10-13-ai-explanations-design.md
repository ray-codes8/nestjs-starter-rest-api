# AI Mistake Explanations — Design

Date: 2026-10-13
Status: approved in brainstorming, pending written-spec review
Builds on: `2026-10-13-nihongo-quiz-design.md`

## Goal

After a wrong answer in a quiz, the learner can press "Why?" and get a short explanation from
Claude: why the chosen answer is wrong, the rule behind the correct one, and one example sentence.
The feature also shows the CTO a production-minded LLM integration: a typed output schema,
caching, graceful degradation, and keys kept server-side.

Hard constraint: demo on 2026-10-14. All work happens on `feature/ai-explanations` branches in both
repos, so the current demo build (`feature/nihongo-quiz` / `main`) stays untouched as a fallback.

## Decisions

- Explanations are generated on demand (button press), never automatically.
- Language is chosen in the UI: English (default) or Russian.
- Model: `claude-opus-5-5` by default, overridable via `ANTHROPIC_MODEL`. Effort is set explicitly
  to `medium`.
- Output is structured JSON validated by a Zod schema (`client.messages.parse` +
  `zodOutputFormat`).
- Explanations are cached in Postgres and shared across users.
- No server-side refusal fallback. A refusal is handled like any other failure (503).
- No streaming.

## Backend

New module `src/explanations`, following the layout of the existing modules.

### Endpoint

`POST /explanations` (`JwtAuthGuard`, `{ data, meta }` envelope, Swagger-documented)

Request body:
- `quizType`: `vocabulary | verb`
- `wordId`: int ≥ 1
- `chosenAnswer`: string, 1–255 chars
- `form`: `masu | te | nai | ta`. Required for `verb`, ignored for `vocabulary`.
- `language`: `en | ru`

Response `data`:
`{ explanation: string, rule: string, example: { japanese: string, reading: string, translation: string }, cached: boolean }`

Behavior:
1. Load the word. An unknown word returns 404.
2. Run the existing `checkAnswer(word, { quizType, answer: chosenAnswer, form })`. Malformed verb
   input returns 400, as it does today. If the chosen answer is correct, return 400
   (`Nothing to explain: the answer is correct`).
3. Look up the cache by (wordId, quizType, form or '', chosenAnswer, language). On a hit, return
   it with `cached: true`.
4. If `ANTHROPIC_API_KEY` is not configured, return 503 (`AI explanations are not configured`).
5. Otherwise call the generator, save the result with the model name, and return it with
   `cached: false`. If two identical requests race, the unique constraint lets the second insert
   fail. It then re-reads the saved row instead of failing.

The correct answer always comes from the server. The client cannot supply it.

### Data

Table `explanations`:
- id (PK), wordId (FK words, cascade), quizType varchar(20), form varchar(10) NOT NULL DEFAULT ''
  (empty for vocabulary), chosenAnswer varchar(255), language varchar(2), payload jsonb,
  model varchar(100), createdAt timestamp
- unique (wordId, quizType, form, chosenAnswer, language)

### Generator

- `interface ExplanationGenerator { generate(input: ExplanationPromptInput): Promise<ExplanationPayload> }`
  is registered under a DI token. The real implementation wraps `@anthropic-ai/sdk`. Tests use a
  fake.
- `ExplanationPromptInput`: word (kanji, kana, meaningEn), quizType, form, correctAnswer,
  chosenAnswer, language.
- The prompt builder is a pure function with unit tests. The system prompt sets the role (a
  patient Japanese teacher for JLPT N5/N4 learners) and the rules: answer in the requested
  language, keep the Japanese examples in Japanese, use at most 3 sentences for the explanation
  and 1 for the rule, and use vocabulary of N5/N4 level in the example. The user message carries
  the data, and the chosen answer is clearly delimited as the learner's input.
- Zod schema: `{ explanation, rule, example: { japanese, reading, translation } }`, all
  non-empty strings.
- Errors: SDK errors (network, auth, rate limit, 5xx), `stop_reason` `refusal` or `max_tokens`,
  and a null `parsed_output` all map to 503 (`AI explanation unavailable, please try again`). Logs
  record the error class and status, never the key.

### Config

- `ANTHROPIC_API_KEY`: optional in the Joi schema.
- `ANTHROPIC_MODEL`: optional, default `claude-opus-5-5`.
- `.env.template` documents both, with an empty key.

### Dependencies

`@anthropic-ai/sdk`, `zod`.

## Frontend (`nihongo-web`)

- Quiz flow change: a correct answer still auto-advances after about 900 ms. A wrong answer no
  longer auto-advances. It shows "Why?" and "Next →" buttons. Enter goes to the next question and
  W requests an explanation.
- An EN/RU toggle next to "Why?" is remembered in localStorage (a convenience only; it falls back
  to EN). Switching the language while a card is open refetches in the new language.
- Explanation card under the options:
  - while loading: a skeleton and "Asking Claude…";
  - content: the explanation, a "Rule" block, and an example (Japanese in a large JP font, then
    the reading and the translation);
  - a "Claude" badge, plus "cached" when served from cache.
- Errors: a 503 or network error shows the toast "AI explanation unavailable", and the quiz keeps
  working.
- API: `explainMistake(input)` in `endpoints.ts` and the matching types.

## Testing

- Unit tests:
  - prompt builder: the output contains the word, form, correct answer, chosen answer and language
    instruction;
  - service: a cache hit skips the generator; a cache miss calls the generator once and saves the
    result; a correct answer returns 400; a missing key returns 503; a generator failure returns
    503.
- e2e with the fake generator:
  - an explanation is returned and a second identical call returns `cached: true`;
  - EN and RU are cached separately;
  - no token returns 401; an unknown word returns 404; a correct answer returns 400; a verb answer
    without `form` returns 400.
- Manual: one real API call with the user's key (smoke test), then a browser run-through.

## Out of scope

Streaming, per-user rate limiting, explanations on the result screen, refusal fallbacks, and
editing or regenerating cached explanations.
