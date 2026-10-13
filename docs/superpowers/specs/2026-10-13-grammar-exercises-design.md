# Grammar Exercises — Design

Date: 2026-10-13
Status: approved in brainstorming, pending written-spec review
Builds on: `2026-10-13-nihongo-quiz-design.md`, `2026-10-13-ai-explanations-design.md`

## Goal

Fill-in-the-blank grammar quizzes grouped by Minna no Nihongo lesson. The learner is on lesson 36,
so lessons 34–37 come first. A few N5 topics are included as showcase material for the demo.
Mistakes show the topic's rule right away. Spaced repetition and the stats work as for vocabulary.

Branches: `feature/grammar` in both repos (backend from `feature/nihongo-quiz`, frontend from `main`).

## Content

- Original sentences written for this project, never copied from the textbook. Each topic has a
  lesson number noted as approximate ("≈ lesson N") for the learner to verify against her book.
- One exercise format: a Japanese sentence containing exactly one `＿＿` blank, one correct answer,
  and three plausible distractors (particles or forms confused at that level). Each exercise has an
  English and a Russian translation of the full sentence.
- Topics (about 8 exercises each, about 64 in total):

| ≈ Lesson | Code | Title | Level |
|---|---|---|---|
| 1–10 | `n5-particles` | Particles は・が・を・に・で・へ・と | N5 |
| 14–15 | `l14-te-forms` | 〜てください・〜ています・〜てもいいです | N5 |
| 19 | `l19-ta-koto` | 〜たことがあります | N5 |
| 34 | `l34-toori-ato` | 〜とおりに・〜たあとで | N4 |
| 35 | `l35-ba-nara` | 〜ば・〜なら | N4 |
| 36 | `l36-you-ni` | 〜ように・〜ようになります・〜ようにします | N4 |
| 37 | `l37-passive` | Passive 〜られます | N4 |

- Each topic has a short rule (EN and RU, 1–3 sentences with an example).
- Content lives in `src/grammar/seed/grammar.json` and is loaded by `npm run seed:grammar`. The seed
  upserts topics by `code` and exercises by (topic, sentence), so it can be re-run safely.

## Backend

### Data

- `grammar_points`: id, code (unique), lesson smallint, lessonTo smallint nullable (for ranges such as
  1–10), level varchar(2), title, ruleEn text, ruleRu text.
- `grammar_exercises`: id, pointId FK (cascade), sentence, answer, distractors (jsonb array of 3
  strings), translationEn, translationRu. Unique (pointId, sentence).
- `user_exercise_progress`: id, userId FK, exerciseId FK, box, nextReviewAt, correctCount,
  wrongCount. Unique (userId, exerciseId). Uses the existing `applyAnswer` (Leitner).
- `answer_log`: `wordId` becomes nullable, a nullable `exerciseId` FK is added, and `QuizType` gains
  `grammar`. Streak and 7-day accuracy therefore include grammar answers. Word-level stats
  (learned, due) stay vocabulary-only.

### API (all under `JwtAuthGuard`, `{ data, meta }` envelope, Swagger tag `grammar`)

- `GET /grammar/lessons` returns
  `[{ lesson, lessonTo, level, points: [{ id, code, title, exerciseCount }] }]`, sorted by lesson.
- `GET /quiz/grammar?lesson=36&count=10` (or `?lesson=all`):
  - `count` is 1–20 (default 10); `lesson` is an integer or `all`;
  - a lesson matches when it falls within [lesson, lessonTo];
  - order: exercises due for review first, then never-answered ones, then the rest, with random
    order inside each group, and no duplicates;
  - each question is `{ exerciseId, lesson, pointTitle, sentence, translation: { en, ru }, options: string[4] }`.
    The options are the answer plus the three distractors, shuffled. The answer is not marked.
- `POST /grammar/answer` takes `{ exerciseId, answer }` (answer 1–100 chars) and returns
  `{ isCorrect, correctAnswer, newBox, nextReviewAt, rule: { en, ru } }`. It records progress and
  writes an `answer_log` row (`quizType: grammar`). An unknown exercise returns 404.
- An unknown or empty lesson returns an empty list, never an error.

### Testing

- Unit:
  - question building: 4 unique options that contain the answer;
  - answer checking: exact match after trimming;
  - seed validation, run on the real `grammar.json`: exactly one `＿＿` per sentence, 3 unique
    distractors none of which equals the answer, non-empty EN/RU translations and rules, unique
    codes, and every point has at least 5 exercises.
- e2e:
  - lessons listing;
  - a quiz for a lesson, for `all`, and for an empty lesson;
  - correct and wrong answers update the box and the summary streak/accuracy;
  - 404 for an unknown exercise; 400 for bad input; 401 without a token.

## Frontend

- The dashboard gets a third mode card "Grammar / 文法" that links to `/grammar`.
- `/grammar` page: lessons as cards. Lessons 34–37 are marked "studying now" and listed first, then
  the rest. An "All lessons mixed" button is included.
- `/quiz/grammar?lesson=N`:
  - reuses the quiz layout;
  - the header badge shows "Lesson 36 · 〜ように";
  - the sentence is shown large in the JP font with the blank highlighted, with the translation in
    the UI language below it;
  - keys 1–4 answer;
  - a correct answer auto-advances;
  - a wrong answer shows a "Rule" card (UI language) and "Next" (Enter). There is no AI call.
- The result screen lists mistakes as the full sentence with the blank filled by the correct answer.
- All new strings are added to both `en.ts` and `ru.ts`.

## Out of scope

AI-generated exercises (roadmap), typed answers (as opposed to multiple choice), audio, and an
admin UI for content.
