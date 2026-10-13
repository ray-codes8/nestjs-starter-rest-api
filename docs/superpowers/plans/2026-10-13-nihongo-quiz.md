# Nihongo Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demo-ready JLPT N5/N4 quiz app: a vocabulary quiz and a verb-conjugation quiz with Leitner spaced repetition, served by new NestJS modules and a polished React SPA.

**Architecture:** Three new NestJS modules in this repo (`vocabulary`, `progress`, `quiz`) follow the `src/article` layout. The domain logic (Leitner, streak, conjugation, question building, answer checking) is written as pure functions with unit tests. Thin services and repositories wrap it. A separate Vite + React app in `../nihongo-web` talks to the API with JWT auth and auto-refresh.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 16 (Colima + docker compose), Jest, wanakana. Frontend: React + Vite + TypeScript, Tailwind v4, shadcn/ui, React Router, TanStack Query, axios, sonner, next-themes, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-nihongo-quiz-design.md`

## Global Constraints

- Levels: only `N5` and `N4`.
- Quiz `count`: 1–20, default 10. Every question has up to 4 options (exactly 4 whenever the level has enough distinct answers).
- Leitner: 5 boxes. Intervals box 1 → 1 day, 2 → 2, 3 → 4, 4 → 8, 5 → 16. Correct → min(box+1, 5). Wrong → 1. "Learned" = box ≥ 4. A first answer starts from box 1 before the rule is applied.
- Verb forms: `masu | te | nai | ta`.
- All new endpoints use `JwtAuthGuard` and return the `{ data, meta }` envelope (`BaseApiResponse`). They are documented in Swagger and served under the global prefix `/api/v1`. e2e tests run without the prefix.
- Correct answers are never sent to the client before the user answers.
- Vocabulary data: open JLPT lists (Jonathan Waller / tanos.co.uk, CC-BY, via `jamsinclair/open-anki-jlpt-decks`). Attribution ships with the data. No Minna no Nihongo textbook text, dialogues or exercises.
- Backend work happens on branch `feature/nihongo-quiz` of this repo. The frontend lives in the sibling folder `/Users/aray_muratova/Desktop/projects/nihongo-web` with its own git repo.
- Containers run on Colima, not Docker Desktop.
- Node ≥ 20 (`.tool-versions` says 20.19.6; 24 also works).
- UI copy is in English, and Japanese is used for the learning content and decorative labels.

### Decisions on points the spec left open

- The seed reads the committed CSV files at seed time instead of a pre-generated JSON file. Part of speech and verb group come from heuristics in `word-seed.ts`. Verbs whose group cannot be classified safely (honorifics like いらっしゃる) get `verbGroup = null` and are excluded from the verb quiz.
- `meaningEn` keeps only the first sense of each entry (text before the first `;`), so options stay short.
- `streakDays` and `accuracy7d` are counted across both levels. `total`, `learned` and `dueToday` are counted per level. Days are UTC calendar days.
- The dictionary page (stretch) shows the part-of-speech badge but no Leitner box badge.

## Review Focus

1. **Words that share a meaning** (在る/有る → "to be", 青/青い → "blue"): a vocabulary question must never show two options with the same text, and no distractor may equal the correct meaning. Pinned in Task 6.
2. **Kana-only words** (`kanji = null`, e.g. ある, ここ): the question shows kana, conjugation works on kana, and a kana answer is accepted. Pinned in Tasks 5 and 6.
3. **Level with few or no words, or `count` above the number of words**: return fewer questions with no duplicate `wordId`s, or an empty list for an empty level. The frontend shows an empty state, not a crash. Pinned in Task 7 (e2e) and Task 11 (manual).
4. **Malformed answers**: a verb answer without `form`, a `form` sent for a non-verb, or an unknown `wordId` must return 400/404, never 500. Pinned in Tasks 6 and 7.
5. **Access token expiring mid-quiz** (default 1 h): the client refreshes once, retries, and parallel 401s share a single refresh. If the refresh fails, the user is sent to login. Pinned in Task 9 (manual check with a 20-second token).

---

## File Structure

**Backend (`nestjs-starter-rest-api`)**

```
src/vocabulary/
  constants/word.constant.ts          JlptLevel, PartOfSpeech, VerbGroup
  entities/word.entity.ts             Word entity (table "words")
  seed/data/n5.csv, n4.csv, README.md source data + CC-BY attribution
  seed/word-seed.ts                   CSV parsing + classification (pure)
  seed/word-seed.spec.ts
  repositories/word.repository.ts     getById, upsertSeeds, findForQuiz
  services/vocabulary.service.ts      list words
  controllers/vocabulary.controller.ts GET /vocabulary
  dtos/vocabulary-query.dto.ts, word-output.dto.ts
  vocabulary.module.ts
src/seed-words.ts                     `npm run seed:words`
src/progress/
  constants/quiz-type.constant.ts     QuizType
  domain/leitner.ts (+ .spec.ts)      applyAnswer
  domain/streak.ts (+ .spec.ts)       computeStreak, toDayString
  entities/user-word-progress.entity.ts, answer-log.entity.ts
  repositories/user-word-progress.repository.ts, answer-log.repository.ts
  services/progress.service.ts        recordAnswer, getSummary
  controllers/progress.controller.ts  GET /progress/summary
  dtos/progress-summary-query.dto.ts, progress-summary-output.dto.ts
  progress.module.ts
src/quiz/
  domain/conjugation.ts (+ .spec.ts)  VerbForm, conjugate, displayForm, conjugationDistractors
  domain/quiz-builder.ts (+ .spec.ts) shuffle, buildVocabularyQuestion, buildVerbQuestion, toVerb
  domain/answer-checker.ts (+ .spec.ts) checkAnswer
  services/quiz.service.ts
  controllers/quiz.controller.ts      GET /quiz/vocabulary, GET /quiz/verbs, POST /quiz/answer
  dtos/quiz-query.dto.ts, quiz-answer-input.dto.ts, quiz-output.dto.ts
  quiz.module.ts
migrations/1791849600000-CreateWords.ts
migrations/1791849600001-CreateProgress.ts
test/nihongo/nihongo-test-utils.ts, vocabulary.e2e-spec.ts, progress.e2e-spec.ts, quiz.e2e-spec.ts
```

**Frontend (`nihongo-web`)**

```
src/main.tsx, src/App.tsx, src/index.css
src/lib/api/client.ts        axios instance, auth header, 401 → refresh → retry
src/lib/api/token-storage.ts localStorage with in-memory fallback
src/lib/api/types.ts         API types
src/lib/api/endpoints.ts     typed API functions
src/lib/api/errors.ts        getErrorMessage
src/lib/level.ts             useLevel, parseLevel
src/features/auth/auth-context.ts, AuthProvider.tsx, RequireAuth.tsx, AuthLayout.tsx, LoginPage.tsx, RegisterPage.tsx
src/components/AppLayout.tsx, Logo.tsx, ThemeToggle.tsx, EmptyState.tsx
src/features/dashboard/DashboardPage.tsx, StatCard.tsx, ModeCard.tsx
src/features/quiz/labels.ts, QuizPage.tsx, QuizSession.tsx, QuestionCard.tsx, OptionButton.tsx, QuizResult.tsx
src/features/dictionary/DictionaryPage.tsx
```

---

### Task 0: Local environment (Colima + Postgres + API boots)

**Files:**
- Create: `.env` (gitignored), `local/jwtRS256.key`, `local/jwtRS256.key.pub` (gitignored)

**Interfaces:**
- Produces: Postgres on `localhost:5432` (user `root`, password `example`, db `example_db`), which is what `test/test-utils.ts` expects. Also a working `npm run start:dev`.

- [ ] **Step 1: Install Homebrew, Colima and the docker CLI** (skip any part that is already installed; if the company has its own Colima setup guide, follow that instead. The goal is that `docker compose version` works)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"   # also add this line to ~/.zprofile as the installer prints
brew install colima docker docker-compose
mkdir -p ~/.docker/cli-plugins
ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
colima start --cpu 2 --memory 4
docker compose version
```

Expected: `Docker Compose version v2.x`.

- [ ] **Step 2: Create `.env` and JWT keys**

```bash
cd /Users/aray_muratova/Desktop/projects/nestjs-starter-rest-api
cp .env.template .env
sed -i '' 's/^DB_HOST=.*/DB_HOST=localhost/; s/^TEST_DB_HOST=.*/TEST_DB_HOST=localhost/' .env
mkdir -p local
ssh-keygen -t rsa -b 2048 -m PEM -f local/jwtRS256.key -N ""
openssl rsa -in local/jwtRS256.key -pubout -outform PEM -out local/jwtRS256.key.pub
sed -i '' "s|^JWT_PRIVATE_KEY_BASE64=.*|JWT_PRIVATE_KEY_BASE64=$(base64 -i local/jwtRS256.key | tr -d '\n')|" .env
sed -i '' "s|^JWT_PUBLIC_KEY_BASE64=.*|JWT_PUBLIC_KEY_BASE64=$(base64 -i local/jwtRS256.key.pub | tr -d '\n')|" .env
git status --short   # must NOT list .env or local/
```

- [ ] **Step 3: Start Postgres only (the API runs on the host for fast reloads)**

```bash
docker compose up -d pgsqldb
docker compose ps
```

Expected: `pgsqldb` is `running`, port `0.0.0.0:5432->5432`.

- [ ] **Step 4: Install, migrate, run existing tests**

```bash
npm install
npm run migration:run
npm test
npm run test:e2e
```

Expected: migrations `CreateUsers`, `CreateArticles` run; all existing unit and e2e tests pass.

- [ ] **Step 5: Boot the API**

Run: `npm run start:dev`, then open `http://localhost:3000/swagger`.
Expected: Swagger lists `auth`, `users`, `articles`. Stop the server. Nothing is committed in this task.

---

### Task 1: Word entity, migration, seed data and seed command

**Files:**
- Create: `src/vocabulary/constants/word.constant.ts`
- Create: `src/vocabulary/entities/word.entity.ts`
- Create: `src/vocabulary/seed/data/n5.csv`, `src/vocabulary/seed/data/n4.csv`, `src/vocabulary/seed/data/README.md`
- Create: `src/vocabulary/seed/word-seed.ts`
- Test: `src/vocabulary/seed/word-seed.spec.ts`
- Create: `migrations/1791849600000-CreateWords.ts`
- Modify: `package.json` (add `wanakana`, script `seed:words`)

**Interfaces:**
- Produces:
  - `enum JlptLevel { N5 = 'N5', N4 = 'N4' }`
  - `enum PartOfSpeech { Noun = 'noun', Verb = 'verb', IAdjective = 'i-adj', NaAdjective = 'na-adj', Adverb = 'adverb', Other = 'other' }`
  - `type VerbGroup = 1 | 2 | 3`
  - `class Word { id; kanji: string | null; kana; romaji; meaningEn; meaningRu: string | null; partOfSpeech: PartOfSpeech; verbGroup: VerbGroup | null; level: JlptLevel; lesson: number | null }`
  - `interface WordSeed { kanji; kana; romaji; meaningEn; partOfSpeech; verbGroup; level }`
  - `parseCsv(text: string): string[][]`
  - `classifyVerbGroup(expression: string, kana: string): VerbGroup | null`
  - `toWordSeed(row: { expression: string; reading: string; meaning: string }, level: JlptLevel): WordSeed | null`
  - `loadWordSeeds(csvText: string, level: JlptLevel): WordSeed[]`
  - `wordSeedFilePath(level: JlptLevel): string`

- [ ] **Step 1: Add the data files and dependency**

```bash
cd /Users/aray_muratova/Desktop/projects/nestjs-starter-rest-api
mkdir -p src/vocabulary/seed/data
curl -fsSL -o src/vocabulary/seed/data/n5.csv https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n5.csv
curl -fsSL -o src/vocabulary/seed/data/n4.csv https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n4.csv
head -2 src/vocabulary/seed/data/n5.csv
npm install wanakana
```

Expected header: `expression,reading,meaning,tags,guid`.

Create `src/vocabulary/seed/data/README.md`:

```markdown
# Vocabulary seed data

`n5.csv` and `n4.csv` come from [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks),
which are based on the JLPT vocabulary lists by Jonathan Waller (http://www.tanos.co.uk/jlpt/),
licensed under Creative Commons BY (https://creativecommons.org/licenses/by/4.0/).
```

- [ ] **Step 2: Create the constants and entity**

`src/vocabulary/constants/word.constant.ts`:

```ts
export enum JlptLevel {
  N5 = 'N5',
  N4 = 'N4',
}

export enum PartOfSpeech {
  Noun = 'noun',
  Verb = 'verb',
  IAdjective = 'i-adj',
  NaAdjective = 'na-adj',
  Adverb = 'adverb',
  Other = 'other',
}

export type VerbGroup = 1 | 2 | 3;
```

`src/vocabulary/entities/word.entity.ts`:

```ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import {
  JlptLevel,
  PartOfSpeech,
  VerbGroup,
} from '../constants/word.constant';

@Entity('words')
export class Word {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kanji: string | null;

  @Column({ length: 100 })
  kana: string;

  @Column({ length: 150 })
  romaji: string;

  @Column({ length: 255 })
  meaningEn: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  meaningRu: string | null;

  @Column({ type: 'varchar', length: 20 })
  partOfSpeech: PartOfSpeech;

  @Column({ type: 'smallint', nullable: true })
  verbGroup: VerbGroup | null;

  @Index('IDX_words_level')
  @Column({ type: 'varchar', length: 2 })
  level: JlptLevel;

  @Column({ type: 'smallint', nullable: true })
  lesson: number | null;
}
```

- [ ] **Step 3: Write the failing seed tests**

`src/vocabulary/seed/word-seed.spec.ts`:

```ts
import * as fs from 'fs';

import { JlptLevel, PartOfSpeech } from '../constants/word.constant';
import {
  classifyVerbGroup,
  loadWordSeeds,
  parseCsv,
  toWordSeed,
  wordSeedFilePath,
} from './word-seed';

describe('parseCsv', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n会う,"to meet, to see"\nx,"say ""hi"""\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['会う', 'to meet, to see'],
      ['x', 'say "hi"'],
    ]);
  });

  it('ignores CRLF line endings and a missing trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('classifyVerbGroup', () => {
  it.each([
    ['書く', 'かく', 1],
    ['帰る', 'かえる', 1],
    ['要る', 'いる', 1],
    ['食べる', 'たべる', 2],
    ['見る', 'みる', 2],
    ['起きる', 'おきる', 2],
    ['出来る', 'できる', 2],
    ['勉強する', 'べんきょうする', 3],
    ['する', 'する', 3],
    ['来る', 'くる', 3],
    ['持って来る', 'もってくる', 3],
    ['作る', 'つくる', 1],
  ])('%s (%s) is group %s', (expression, kana, group) => {
    expect(classifyVerbGroup(expression, kana)).toBe(group);
  });

  it.each([
    ['いらっしゃる', 'いらっしゃる'],
    ['下さる', 'くださる'],
    ['青', 'あお'],
  ])('%s is not classified', (expression, kana) => {
    expect(classifyVerbGroup(expression, kana)).toBeNull();
  });
});

describe('toWordSeed', () => {
  it('builds a verb with kanji, first sense and romaji', () => {
    const seed = toWordSeed(
      { expression: '遊ぶ', reading: 'あそぶ', meaning: 'to play; to hang out' },
      JlptLevel.N5,
    );
    expect(seed).toEqual({
      kanji: '遊ぶ',
      kana: 'あそぶ',
      romaji: 'asobu',
      meaningEn: 'to play',
      partOfSpeech: PartOfSpeech.Verb,
      verbGroup: 1,
      level: JlptLevel.N5,
    });
  });

  it('stores kana-only words with kanji = null', () => {
    const seed = toWordSeed(
      { expression: 'ああ', reading: 'ああ', meaning: 'Ah!, Oh!' },
      JlptLevel.N5,
    );
    expect(seed?.kanji).toBeNull();
    expect(seed?.partOfSpeech).toBe(PartOfSpeech.Other);
  });

  it('takes the first of several readings', () => {
    const seed = toWordSeed(
      { expression: '行く', reading: 'いく; ゆく', meaning: 'to go' },
      JlptLevel.N5,
    );
    expect(seed?.kana).toBe('いく');
  });

  it('classifies i- and na-adjectives', () => {
    expect(
      toWordSeed({ expression: '青い', reading: 'あおい', meaning: 'blue' }, JlptLevel.N5)
        ?.partOfSpeech,
    ).toBe(PartOfSpeech.IAdjective);
    expect(
      toWordSeed({ expression: '綺麗', reading: 'きれい', meaning: 'pretty' }, JlptLevel.N5)
        ?.partOfSpeech,
    ).toBe(PartOfSpeech.NaAdjective);
  });

  it('skips fragments starting with ～ and kanji entries without a reading', () => {
    expect(
      toWordSeed({ expression: '～ございます', reading: '～ございます', meaning: 'to be' }, JlptLevel.N4),
    ).toBeNull();
    expect(
      toWordSeed({ expression: '漢字', reading: '', meaning: 'kanji' }, JlptLevel.N4),
    ).toBeNull();
  });
});

describe('loadWordSeeds on the real data files', () => {
  it.each([JlptLevel.N5, JlptLevel.N4])('%s has words and verbs', (level) => {
    const seeds = loadWordSeeds(fs.readFileSync(wordSeedFilePath(level), 'utf8'), level);
    expect(seeds.length).toBeGreaterThan(600);
    expect(seeds.filter((s) => s.verbGroup !== null).length).toBeGreaterThan(90);
    const keys = seeds.map((s) => `${s.kana}|${s.kanji}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- word-seed`
Expected: FAIL with `Cannot find module './word-seed'`.

- [ ] **Step 5: Implement `word-seed.ts`**

`src/vocabulary/seed/word-seed.ts`:

```ts
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
  if (meaningEn.startsWith('to ') && U_ROW_ENDINGS.includes(kana.slice(-1))) {
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
  const expression = firstOf(row.expression);
  const reading = firstOf(row.reading);
  const meaningEn = firstOf(row.meaning);

  if (!expression || !meaningEn || /^[～〜~]/.test(expression)) {
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- word-seed`
Expected: PASS. If a classification case fails because of the real data (for example a verb group count), fix the heuristic tables rather than loosening the assertion.

- [ ] **Step 7: Create the migration**

`migrations/1791849600000-CreateWords.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWords1791849600000 implements MigrationInterface {
  name = 'CreateWords1791849600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "words" (
        "id" SERIAL NOT NULL,
        "kanji" character varying(100),
        "kana" character varying(100) NOT NULL,
        "romaji" character varying(150) NOT NULL,
        "meaningEn" character varying(255) NOT NULL,
        "meaningRu" character varying(255),
        "partOfSpeech" character varying(20) NOT NULL,
        "verbGroup" smallint,
        "level" character varying(2) NOT NULL,
        "lesson" smallint,
        CONSTRAINT "PK_words" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_words_level" ON "words" ("level")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_words_level"`);
    await queryRunner.query(`DROP TABLE "words"`);
  }
}
```

Run: `npm run migration:run`
Expected: `Migration CreateWords1791849600000 has been executed successfully.`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/vocabulary migrations/1791849600000-CreateWords.ts
git commit -m "feat(vocabulary): add word entity, migration and JLPT seed parser"
```

---

### Task 2: Vocabulary module (repository, GET /vocabulary, seed command)

**Files:**
- Create: `src/vocabulary/repositories/word.repository.ts`
- Create: `src/vocabulary/services/vocabulary.service.ts`
- Create: `src/vocabulary/controllers/vocabulary.controller.ts`
- Create: `src/vocabulary/dtos/vocabulary-query.dto.ts`, `src/vocabulary/dtos/word-output.dto.ts`
- Create: `src/vocabulary/vocabulary.module.ts`
- Create: `src/seed-words.ts`
- Modify: `src/app.module.ts`, `package.json` (script)
- Test: `test/nihongo/nihongo-test-utils.ts`, `test/nihongo/vocabulary.e2e-spec.ts`

**Interfaces:**
- Consumes: `Word`, `JlptLevel`, `PartOfSpeech`, `WordSeed`, `loadWordSeeds`, `wordSeedFilePath` (Task 1).
- Produces:
  - `WordRepository.getById(id: number): Promise<Word>` (throws `NotFoundException`)
  - `WordRepository.upsertSeeds(seeds: WordSeed[]): Promise<{ inserted: number; updated: number }>`
  - `VocabularyModule` exports `WordRepository`
  - `WordOutput` DTO
  - Test utils: `createNihongoTestApp(): Promise<INestApplication>`, `registerAndLogin(app, username): Promise<string>` (access token), `seedTestWords(app): Promise<Word[]>`

- [ ] **Step 1: Write the failing e2e test and test utils**

`test/nihongo/nihongo-test-utils.ts`:

```ts
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { VALIDATION_PIPE_OPTIONS } from '../../src/shared/constants';
import {
  JlptLevel,
  PartOfSpeech,
} from '../../src/vocabulary/constants/word.constant';
import { Word } from '../../src/vocabulary/entities/word.entity';
import { WordRepository } from '../../src/vocabulary/repositories/word.repository';
import { createDBEntities, resetDBBeforeTest } from '../test-utils';

export const createNihongoTestApp = async (): Promise<INestApplication> => {
  await resetDBBeforeTest();
  await createDBEntities();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  await app.init();
  return app;
};

export const registerAndLogin = async (
  app: INestApplication,
  username: string,
): Promise<string> => {
  const password = 'password123';
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: username, username, password, email: `${username}@example.com` })
    .expect(HttpStatus.CREATED);

  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password })
    .expect(HttpStatus.OK);

  return response.body.data.accessToken;
};

export const seedTestWords = async (app: INestApplication): Promise<Word[]> => {
  const base = { meaningRu: null, lesson: null, level: JlptLevel.N5 };
  return app.get(WordRepository).save([
    { ...base, kanji: '本', kana: 'ほん', romaji: 'hon', meaningEn: 'book', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '水', kana: 'みず', romaji: 'mizu', meaningEn: 'water', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '山', kana: 'やま', romaji: 'yama', meaningEn: 'mountain', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '犬', kana: 'いぬ', romaji: 'inu', meaningEn: 'dog', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '書く', kana: 'かく', romaji: 'kaku', meaningEn: 'to write', partOfSpeech: PartOfSpeech.Verb, verbGroup: 1 },
    { ...base, kanji: '食べる', kana: 'たべる', romaji: 'taberu', meaningEn: 'to eat', partOfSpeech: PartOfSpeech.Verb, verbGroup: 2 },
  ]);
};
```

`test/nihongo/vocabulary.e2e-spec.ts`:

```ts
import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { closeDBAfterTest } from '../test-utils';
import {
  createNihongoTestApp,
  registerAndLogin,
  seedTestWords,
} from './nihongo-test-utils';

describe('VocabularyController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createNihongoTestApp();
    await seedTestWords(app);
    token = await registerAndLogin(app, 'vocab-user');
  });

  it('lists words of a level with a count', async () => {
    const response = await request(app.getHttpServer())
      .get('/vocabulary?level=N5&limit=2&offset=0')
      .set('Authorization', 'Bearer ' + token)
      .expect(HttpStatus.OK);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.count).toBe(6);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({ kana: expect.any(String), meaningEn: expect.any(String), level: 'N5' }),
    );
  });

  it('returns an empty list for a level without words', async () => {
    const response = await request(app.getHttpServer())
      .get('/vocabulary?level=N4')
      .set('Authorization', 'Bearer ' + token)
      .expect(HttpStatus.OK);
    expect(response.body.data).toEqual([]);
  });

  it('rejects an unknown level', () =>
    request(app.getHttpServer())
      .get('/vocabulary?level=N9')
      .set('Authorization', 'Bearer ' + token)
      .expect(HttpStatus.BAD_REQUEST));

  it('requires a token', () =>
    request(app.getHttpServer()).get('/vocabulary?level=N5').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- vocabulary`
Expected: FAIL with `Cannot find module '../../src/vocabulary/repositories/word.repository'`.

- [ ] **Step 3: Implement the repository, DTOs, service, controller and module**

`src/vocabulary/repositories/word.repository.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';

import { Word } from '../entities/word.entity';
import { WordSeed } from '../seed/word-seed';

@Injectable()
export class WordRepository extends Repository<Word> {
  constructor(private dataSource: DataSource) {
    super(Word, dataSource.createEntityManager());
  }

  async getById(id: number): Promise<Word> {
    const word = await this.findOne({ where: { id } });
    if (!word) {
      throw new NotFoundException();
    }

    return word;
  }

  async upsertSeeds(
    seeds: WordSeed[],
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    for (const seed of seeds) {
      const existing = await this.findOne({
        where: {
          kana: seed.kana,
          kanji: seed.kanji ?? IsNull(),
          level: seed.level,
        },
      });
      await this.save({ ...existing, ...seed });
      if (existing) {
        updated++;
      } else {
        inserted++;
      }
    }
    return { inserted, updated };
  }
}
```

`src/vocabulary/dtos/vocabulary-query.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { PaginationParamsDto } from '../../shared/dtos/pagination-params.dto';
import { JlptLevel } from '../constants/word.constant';

export class VocabularyQueryInput extends PaginationParamsDto {
  @ApiProperty({ enum: JlptLevel })
  @IsEnum(JlptLevel)
  level: JlptLevel;
}
```

`src/vocabulary/dtos/word-output.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { JlptLevel, PartOfSpeech } from '../constants/word.constant';

export class WordOutput {
  @Expose()
  @ApiProperty()
  id: number;

  @Expose()
  @ApiPropertyOptional({ type: String, nullable: true })
  kanji: string | null;

  @Expose()
  @ApiProperty()
  kana: string;

  @Expose()
  @ApiProperty()
  romaji: string;

  @Expose()
  @ApiProperty()
  meaningEn: string;

  @Expose()
  @ApiProperty({ enum: PartOfSpeech })
  partOfSpeech: PartOfSpeech;

  @Expose()
  @ApiPropertyOptional({ type: Number, nullable: true })
  verbGroup: number | null;

  @Expose()
  @ApiProperty({ enum: JlptLevel })
  level: JlptLevel;
}
```

`src/vocabulary/services/vocabulary.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { plainToClass } from 'class-transformer';

import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { JlptLevel } from '../constants/word.constant';
import { WordOutput } from '../dtos/word-output.dto';
import { WordRepository } from '../repositories/word.repository';

@Injectable()
export class VocabularyService {
  constructor(
    private repository: WordRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(VocabularyService.name);
  }

  async getWords(
    ctx: RequestContext,
    level: JlptLevel,
    limit: number,
    offset: number,
  ): Promise<{ words: WordOutput[]; count: number }> {
    this.logger.log(ctx, `${this.getWords.name} was called`);

    const [words, count] = await this.repository.findAndCount({
      where: { level },
      order: { id: 'ASC' },
      take: limit,
      skip: offset,
    });

    return {
      words: plainToClass(WordOutput, words, { excludeExtraneousValues: true }),
      count,
    };
  }
}
```

`src/vocabulary/controllers/vocabulary.controller.ts`:

```ts
import {
  Controller,
  Get,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  BaseApiResponse,
  SwaggerBaseApiResponse,
} from '../../shared/dtos/base-api-response.dto';
import { AppLogger } from '../../shared/logger/logger.service';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { VocabularyQueryInput } from '../dtos/vocabulary-query.dto';
import { WordOutput } from '../dtos/word-output.dto';
import { VocabularyService } from '../services/vocabulary.service';

@ApiTags('vocabulary')
@Controller('vocabulary')
export class VocabularyController {
  constructor(
    private readonly vocabularyService: VocabularyService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(VocabularyController.name);
  }

  @Get()
  @ApiOperation({ summary: 'List words of a JLPT level' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SwaggerBaseApiResponse([WordOutput]),
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getWords(
    @ReqContext() ctx: RequestContext,
    @Query() query: VocabularyQueryInput,
  ): Promise<BaseApiResponse<WordOutput[]>> {
    const { words, count } = await this.vocabularyService.getWords(
      ctx,
      query.level,
      query.limit,
      query.offset,
    );
    return { data: words, meta: { count } };
  }
}
```

`src/vocabulary/vocabulary.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { SharedModule } from '../shared/shared.module';
import { VocabularyController } from './controllers/vocabulary.controller';
import { Word } from './entities/word.entity';
import { WordRepository } from './repositories/word.repository';
import { VocabularyService } from './services/vocabulary.service';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([Word])],
  providers: [VocabularyService, WordRepository, JwtAuthStrategy],
  controllers: [VocabularyController],
  exports: [WordRepository],
})
export class VocabularyModule {}
```

In `src/app.module.ts`, add `VocabularyModule` to `imports` (keep the alphabetical import sort the linter expects):

```ts
import { VocabularyModule } from './vocabulary/vocabulary.module';
// ...
  imports: [SharedModule, UserModule, AuthModule, ArticleModule, VocabularyModule],
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- vocabulary`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the seed command and seed the dev DB**

`src/seed-words.ts`:

```ts
import * as fs from 'fs';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { JlptLevel } from './vocabulary/constants/word.constant';
import { WordRepository } from './vocabulary/repositories/word.repository';
import { loadWordSeeds, wordSeedFilePath } from './vocabulary/seed/word-seed';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repository = app.get(WordRepository);

  for (const level of [JlptLevel.N5, JlptLevel.N4]) {
    const seeds = loadWordSeeds(
      fs.readFileSync(wordSeedFilePath(level), 'utf8'),
      level,
    );
    const { inserted, updated } = await repository.upsertSeeds(seeds);
    console.log(`${level}: ${inserted} inserted, ${updated} updated`);
  }

  await app.close();
}
bootstrap();
```

In `package.json` `scripts`, after `cli:prod`:

```json
"seed:words": "ts-node -r tsconfig-paths/register src/seed-words.ts",
```

Run: `npm run seed:words` twice.
Expected: the first run prints `N5: ~710 inserted, 0 updated` and `N4: ~660 inserted, 0 updated`. The second run prints `0 inserted` with the same numbers as `updated`, so re-running is safe.

- [ ] **Step 6: Commit**

```bash
git add src/vocabulary src/seed-words.ts src/app.module.ts package.json test/nihongo
git commit -m "feat(vocabulary): add vocabulary module, list endpoint and seed command"
```

---

### Task 3: Leitner and streak domain functions

**Files:**
- Create: `src/progress/domain/leitner.ts`, `src/progress/domain/streak.ts`
- Test: `src/progress/domain/leitner.spec.ts`, `src/progress/domain/streak.spec.ts`

**Interfaces:**
- Produces:
  - `MAX_BOX = 5`, `LEARNED_MIN_BOX = 4`, `BOX_INTERVAL_DAYS: Record<number, number>`
  - `applyAnswer(currentBox: number | null, isCorrect: boolean, now: Date): { box: number; nextReviewAt: Date }`
  - `toDayString(date: Date): string` (UTC `YYYY-MM-DD`)
  - `computeStreak(activeDays: string[], today: string): number`

- [ ] **Step 1: Write the failing tests**

`src/progress/domain/leitner.spec.ts`:

```ts
import { applyAnswer, BOX_INTERVAL_DAYS } from './leitner';

const now = new Date('2026-10-13T10:00:00Z');
const daysLater = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

describe('applyAnswer', () => {
  it('first correct answer moves a new word to box 2', () => {
    expect(applyAnswer(null, true, now)).toEqual({ box: 2, nextReviewAt: daysLater(2) });
  });

  it('first wrong answer keeps a new word in box 1', () => {
    expect(applyAnswer(null, false, now)).toEqual({ box: 1, nextReviewAt: daysLater(1) });
  });

  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 5],
  ])('correct answer moves box %i to box %i', (from, to) => {
    const result = applyAnswer(from, true, now);
    expect(result.box).toBe(to);
    expect(result.nextReviewAt).toEqual(daysLater(BOX_INTERVAL_DAYS[to]));
  });

  it('wrong answer from box 5 goes back to box 1', () => {
    expect(applyAnswer(5, false, now)).toEqual({ box: 1, nextReviewAt: daysLater(1) });
  });

  it('uses the spec intervals', () => {
    expect(BOX_INTERVAL_DAYS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
  });
});
```

`src/progress/domain/streak.spec.ts`:

```ts
import { computeStreak, toDayString } from './streak';

describe('toDayString', () => {
  it('formats in UTC', () => {
    expect(toDayString(new Date('2026-10-13T23:30:00Z'))).toBe('2026-10-13');
  });
});

describe('computeStreak', () => {
  const today = '2026-10-13';

  it('is 0 without activity', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-10-13', '2026-10-12', '2026-10-11'], today)).toBe(3);
  });

  it('keeps the streak alive when the last activity was yesterday', () => {
    expect(computeStreak(['2026-10-12', '2026-10-11'], today)).toBe(2);
  });

  it('is 0 when the last activity was two days ago', () => {
    expect(computeStreak(['2026-10-11', '2026-10-10'], today)).toBe(0);
  });

  it('stops at a gap and ignores order and duplicates', () => {
    expect(
      computeStreak(['2026-10-10', '2026-10-13', '2026-10-12', '2026-10-13'], today),
    ).toBe(2);
  });

  it('crosses month boundaries', () => {
    expect(computeStreak(['2026-10-01', '2026-09-30'], '2026-10-01')).toBe(2);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- progress/domain`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/progress/domain/leitner.ts`:

```ts
export const MAX_BOX = 5;
export const LEARNED_MIN_BOX = 4;
export const BOX_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function applyAnswer(
  currentBox: number | null,
  isCorrect: boolean,
  now: Date,
): { box: number; nextReviewAt: Date } {
  const startBox = currentBox ?? 1;
  const box = isCorrect ? Math.min(startBox + 1, MAX_BOX) : 1;
  return {
    box,
    nextReviewAt: new Date(now.getTime() + BOX_INTERVAL_DAYS[box] * DAY_MS),
  };
}
```

`src/progress/domain/streak.ts`:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

export function toDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function previousDay(day: string): string {
  return toDayString(new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS));
}

export function computeStreak(activeDays: string[], today: string): number {
  const days = new Set(activeDays);
  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  return streak;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm test -- progress/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progress/domain
git commit -m "feat(progress): add Leitner scheduling and streak calculation"
```

---

### Task 4: Progress persistence and GET /progress/summary

**Files:**
- Create: `src/progress/constants/quiz-type.constant.ts`
- Create: `src/progress/entities/user-word-progress.entity.ts`, `src/progress/entities/answer-log.entity.ts`
- Create: `src/progress/repositories/user-word-progress.repository.ts`, `src/progress/repositories/answer-log.repository.ts`
- Create: `src/progress/services/progress.service.ts`
- Create: `src/progress/controllers/progress.controller.ts`
- Create: `src/progress/dtos/progress-summary-query.dto.ts`, `src/progress/dtos/progress-summary-output.dto.ts`
- Create: `src/progress/progress.module.ts`
- Create: `migrations/1791849600001-CreateProgress.ts`
- Modify: `src/app.module.ts`
- Test: `test/nihongo/progress.e2e-spec.ts`

**Interfaces:**
- Consumes: `applyAnswer`, `LEARNED_MIN_BOX`, `computeStreak`, `toDayString` (Task 3); `Word`, `WordRepository`, `VocabularyModule`, `JlptLevel` (Tasks 1–2).
- Produces:
  - `enum QuizType { Vocabulary = 'vocabulary', Verb = 'verb' }`
  - Entities `UserWordProgress` (`userId`, `wordId`, `box`, `nextReviewAt`, `correctCount`, `wrongCount`, relations `user`, `word`) and `AnswerLog` (`userId`, `wordId`, `quizType`, `isCorrect`, `createdAt`)
  - `ProgressService.recordAnswer(userId: number, wordId: number, quizType: QuizType, isCorrect: boolean, now: Date): Promise<{ box: number; nextReviewAt: Date }>`
  - `ProgressService.getSummary(ctx: RequestContext, level: JlptLevel, now?: Date): Promise<ProgressSummaryOutput>`
  - `ProgressSummaryOutput { total; learned; dueToday; streakDays; accuracy7d: number | null }`
  - `ProgressModule` exports `ProgressService`

- [ ] **Step 1: Write the failing e2e test**

`test/nihongo/progress.e2e-spec.ts`:

```ts
import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { QuizType } from '../../src/progress/constants/quiz-type.constant';
import { ProgressService } from '../../src/progress/services/progress.service';
import { WordRepository } from '../../src/vocabulary/repositories/word.repository';
import { closeDBAfterTest } from '../test-utils';
import {
  createNihongoTestApp,
  registerAndLogin,
  seedTestWords,
} from './nihongo-test-utils';

describe('ProgressController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createNihongoTestApp();
    await seedTestWords(app);
    token = await registerAndLogin(app, 'progress-user');
  });

  const getSummary = (level: string) =>
    request(app.getHttpServer())
      .get(`/progress/summary?level=${level}`)
      .set('Authorization', 'Bearer ' + token);

  it('returns an empty summary for a new user', async () => {
    const response = await getSummary('N5').expect(HttpStatus.OK);
    expect(response.body.data).toEqual({
      total: 6,
      learned: 0,
      dueToday: 0,
      streakDays: 0,
      accuracy7d: null,
    });
  });

  it('reflects recorded answers', async () => {
    const userId = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString(),
    ).sub as number;
    const progress = app.get(ProgressService);
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const [, , , , verb] = await app.get(WordRepository).find({ order: { id: 'ASC' } });

    // Answered 3 days ago → box 2, review due 1 day ago.
    await progress.recordAnswer(userId, verb.id, QuizType.Verb, true, past);
    await progress.recordAnswer(userId, verb.id + 1, QuizType.Verb, false, new Date());

    const response = await getSummary('N5').expect(HttpStatus.OK);
    expect(response.body.data).toEqual({
      total: 6,
      learned: 0,
      dueToday: 1,
      streakDays: 1,
      accuracy7d: 0.5,
    });
  });

  it('rejects an unknown level', () => getSummary('N1').expect(HttpStatus.BAD_REQUEST));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
```

> The access token carries the user id in the `sub` claim (`AuthService.getAuthToken`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- progress`
Expected: FAIL, module `quiz-type.constant` not found.

- [ ] **Step 3: Implement constants and entities**

`src/progress/constants/quiz-type.constant.ts`:

```ts
export enum QuizType {
  Vocabulary = 'vocabulary',
  Verb = 'verb',
}
```

`src/progress/entities/user-word-progress.entity.ts`:

```ts
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { User } from '../../user/entities/user.entity';
import { Word } from '../../vocabulary/entities/word.entity';

@Entity('user_word_progress')
@Unique('UQ_user_word_progress_user_word', ['userId', 'wordId'])
export class UserWordProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  wordId: number;

  @ManyToOne(() => Word, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wordId' })
  word: Word;

  @Column({ type: 'smallint', default: 1 })
  box: number;

  @Column({ type: 'timestamp' })
  nextReviewAt: Date;

  @Column({ default: 0 })
  correctCount: number;

  @Column({ default: 0 })
  wrongCount: number;
}
```

`src/progress/entities/answer-log.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../user/entities/user.entity';
import { Word } from '../../vocabulary/entities/word.entity';
import { QuizType } from '../constants/quiz-type.constant';

@Entity('answer_log')
export class AnswerLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  wordId: number;

  @ManyToOne(() => Word, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wordId' })
  word: Word;

  @Column({ type: 'varchar', length: 20 })
  quizType: QuizType;

  @Column()
  isCorrect: boolean;

  @Index('IDX_answer_log_createdAt')
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
```

- [ ] **Step 4: Implement repositories**

`src/progress/repositories/user-word-progress.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { LEARNED_MIN_BOX } from '../domain/leitner';
import { UserWordProgress } from '../entities/user-word-progress.entity';

@Injectable()
export class UserWordProgressRepository extends Repository<UserWordProgress> {
  constructor(private dataSource: DataSource) {
    super(UserWordProgress, dataSource.createEntityManager());
  }

  countLearned(userId: number, level: JlptLevel): Promise<number> {
    return this.createQueryBuilder('p')
      .innerJoin('p.word', 'w')
      .where('p.userId = :userId', { userId })
      .andWhere('w.level = :level', { level })
      .andWhere('p.box >= :minBox', { minBox: LEARNED_MIN_BOX })
      .getCount();
  }

  countDue(userId: number, level: JlptLevel, now: Date): Promise<number> {
    return this.createQueryBuilder('p')
      .innerJoin('p.word', 'w')
      .where('p.userId = :userId', { userId })
      .andWhere('w.level = :level', { level })
      .andWhere('p.nextReviewAt <= :now', { now })
      .getCount();
  }
}
```

`src/progress/repositories/answer-log.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { AnswerLog } from '../entities/answer-log.entity';

@Injectable()
export class AnswerLogRepository extends Repository<AnswerLog> {
  constructor(private dataSource: DataSource) {
    super(AnswerLog, dataSource.createEntityManager());
  }

  async getActiveDays(userId: number): Promise<string[]> {
    const rows = await this.createQueryBuilder('a')
      .select(`DISTINCT TO_CHAR(a."createdAt", 'YYYY-MM-DD')`, 'day')
      .where('a.userId = :userId', { userId })
      .orderBy('day', 'DESC')
      .limit(400)
      .getRawMany<{ day: string }>();
    return rows.map((row) => row.day);
  }

  async getAccuracySince(userId: number, since: Date): Promise<number | null> {
    const row = await this.createQueryBuilder('a')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE a."isCorrect")', 'correct')
      .where('a.userId = :userId', { userId })
      .andWhere('a.createdAt >= :since', { since })
      .getRawOne<{ total: string; correct: string }>();

    const total = Number(row?.total ?? 0);
    return total === 0 ? null : Number(row?.correct ?? 0) / total;
  }
}
```

- [ ] **Step 5: Implement DTOs, service, controller, module**

`src/progress/dtos/progress-summary-query.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { JlptLevel } from '../../vocabulary/constants/word.constant';

export class ProgressSummaryQueryInput {
  @ApiProperty({ enum: JlptLevel })
  @IsEnum(JlptLevel)
  level: JlptLevel;
}
```

`src/progress/dtos/progress-summary-output.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class ProgressSummaryOutput {
  @ApiProperty({ description: 'Words in the level' })
  total: number;

  @ApiProperty({ description: 'Words in Leitner box 4 or 5' })
  learned: number;

  @ApiProperty({ description: 'Words whose review time has passed' })
  dueToday: number;

  @ApiProperty({ description: 'Consecutive UTC days with answers, ending today or yesterday' })
  streakDays: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Correct share (0..1) over the last 7 days' })
  accuracy7d: number | null;
}
```

`src/progress/services/progress.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import { QuizType } from '../constants/quiz-type.constant';
import { applyAnswer } from '../domain/leitner';
import { computeStreak, toDayString } from '../domain/streak';
import { ProgressSummaryOutput } from '../dtos/progress-summary-output.dto';
import { AnswerLogRepository } from '../repositories/answer-log.repository';
import { UserWordProgressRepository } from '../repositories/user-word-progress.repository';

const ACCURACY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ProgressService {
  constructor(
    private progressRepository: UserWordProgressRepository,
    private answerLogRepository: AnswerLogRepository,
    private wordRepository: WordRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ProgressService.name);
  }

  async recordAnswer(
    userId: number,
    wordId: number,
    quizType: QuizType,
    isCorrect: boolean,
    now: Date,
  ): Promise<{ box: number; nextReviewAt: Date }> {
    const existing = await this.progressRepository.findOne({
      where: { userId, wordId },
    });
    const next = applyAnswer(existing?.box ?? null, isCorrect, now);

    await this.progressRepository.save({
      ...existing,
      userId,
      wordId,
      box: next.box,
      nextReviewAt: next.nextReviewAt,
      correctCount: (existing?.correctCount ?? 0) + (isCorrect ? 1 : 0),
      wrongCount: (existing?.wrongCount ?? 0) + (isCorrect ? 0 : 1),
    });
    await this.answerLogRepository.save({
      userId,
      wordId,
      quizType,
      isCorrect,
      createdAt: now,
    });

    return next;
  }

  async getSummary(
    ctx: RequestContext,
    level: JlptLevel,
    now: Date = new Date(),
  ): Promise<ProgressSummaryOutput> {
    this.logger.log(ctx, `${this.getSummary.name} was called`);
    const userId = ctx.user!.id;

    const [total, learned, dueToday, activeDays, accuracy7d] =
      await Promise.all([
        this.wordRepository.count({ where: { level } }),
        this.progressRepository.countLearned(userId, level),
        this.progressRepository.countDue(userId, level, now),
        this.answerLogRepository.getActiveDays(userId),
        this.answerLogRepository.getAccuracySince(
          userId,
          new Date(now.getTime() - ACCURACY_WINDOW_MS),
        ),
      ]);

    return {
      total,
      learned,
      dueToday,
      streakDays: computeStreak(activeDays, toDayString(now)),
      accuracy7d,
    };
  }
}
```

> `createdAt: now` lets tests record past answers. `CreateDateColumn` still fills it when the field is omitted.

`src/progress/controllers/progress.controller.ts`:

```ts
import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  BaseApiResponse,
  SwaggerBaseApiResponse,
} from '../../shared/dtos/base-api-response.dto';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { ProgressSummaryOutput } from '../dtos/progress-summary-output.dto';
import { ProgressSummaryQueryInput } from '../dtos/progress-summary-query.dto';
import { ProgressService } from '../services/progress.service';

@ApiTags('progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Learning progress of the current user for a level' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SwaggerBaseApiResponse(ProgressSummaryOutput),
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getSummary(
    @ReqContext() ctx: RequestContext,
    @Query() query: ProgressSummaryQueryInput,
  ): Promise<BaseApiResponse<ProgressSummaryOutput>> {
    const summary = await this.progressService.getSummary(ctx, query.level);
    return { data: summary, meta: {} };
  }
}
```

`src/progress/progress.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { SharedModule } from '../shared/shared.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { ProgressController } from './controllers/progress.controller';
import { AnswerLog } from './entities/answer-log.entity';
import { UserWordProgress } from './entities/user-word-progress.entity';
import { AnswerLogRepository } from './repositories/answer-log.repository';
import { UserWordProgressRepository } from './repositories/user-word-progress.repository';
import { ProgressService } from './services/progress.service';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([UserWordProgress, AnswerLog]),
    VocabularyModule,
  ],
  providers: [
    ProgressService,
    UserWordProgressRepository,
    AnswerLogRepository,
    JwtAuthStrategy,
  ],
  controllers: [ProgressController],
  exports: [ProgressService],
})
export class ProgressModule {}
```

Add `ProgressModule` to `imports` in `src/app.module.ts`.

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- progress`
Expected: PASS (3 tests).

- [ ] **Step 7: Create and run the migration**

`migrations/1791849600001-CreateProgress.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProgress1791849600001 implements MigrationInterface {
  name = 'CreateProgress1791849600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_word_progress" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "wordId" integer NOT NULL,
        "box" smallint NOT NULL DEFAULT 1,
        "nextReviewAt" TIMESTAMP NOT NULL,
        "correctCount" integer NOT NULL DEFAULT 0,
        "wrongCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_user_word_progress_user_word" UNIQUE ("userId", "wordId"),
        CONSTRAINT "PK_user_word_progress" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_word_progress" ADD CONSTRAINT "FK_user_word_progress_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_word_progress" ADD CONSTRAINT "FK_user_word_progress_word" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE TABLE "answer_log" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "wordId" integer NOT NULL,
        "quizType" character varying(20) NOT NULL,
        "isCorrect" boolean NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_answer_log" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_answer_log_createdAt" ON "answer_log" ("createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_word" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "answer_log"`);
    await queryRunner.query(`DROP TABLE "user_word_progress"`);
  }
}
```

Run: `npm run migration:run`
Expected: `CreateProgress1791849600001 has been executed successfully.`

- [ ] **Step 8: Commit**

```bash
git add src/progress src/app.module.ts migrations/1791849600001-CreateProgress.ts test/nihongo/progress.e2e-spec.ts
git commit -m "feat(progress): persist answers with Leitner boxes and add summary endpoint"
```

---

### Task 5: Verb conjugation engine and distractors

**Files:**
- Create: `src/quiz/domain/conjugation.ts`
- Test: `src/quiz/domain/conjugation.spec.ts`

**Interfaces:**
- Consumes: `VerbGroup`, `JlptLevel` (Task 1); `loadWordSeeds`, `wordSeedFilePath` (Task 1, for the whole-dataset test).
- Produces:
  - `enum VerbForm { Masu = 'masu', Te = 'te', Nai = 'nai', Ta = 'ta' }`
  - `interface Verb { kanji: string | null; kana: string; verbGroup: VerbGroup }`
  - `conjugate(verb: Verb, form: VerbForm): { kanji: string | null; kana: string }`
  - `displayForm(verb: Verb, form: VerbForm): string` (kanji form if present, else kana)
  - `conjugationDistractors(verb: Verb, form: VerbForm): string[]` (unique wrong forms in display script, never containing a correct answer)

- [ ] **Step 1: Write the failing tests**

`src/quiz/domain/conjugation.spec.ts`:

```ts
import * as fs from 'fs';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { loadWordSeeds, wordSeedFilePath } from '../../vocabulary/seed/word-seed';
import {
  conjugate,
  conjugationDistractors,
  displayForm,
  Verb,
  VerbForm,
} from './conjugation';

const v = (kanji: string | null, kana: string, verbGroup: 1 | 2 | 3): Verb => ({
  kanji,
  kana,
  verbGroup,
});

describe('conjugate', () => {
  it.each([
    // group 1
    [v('書く', 'かく', 1), ['書きます', '書いて', '書かない', '書いた']],
    [v('泳ぐ', 'およぐ', 1), ['泳ぎます', '泳いで', '泳がない', '泳いだ']],
    [v('話す', 'はなす', 1), ['話します', '話して', '話さない', '話した']],
    [v('待つ', 'まつ', 1), ['待ちます', '待って', '待たない', '待った']],
    [v('死ぬ', 'しぬ', 1), ['死にます', '死んで', '死なない', '死んだ']],
    [v('遊ぶ', 'あそぶ', 1), ['遊びます', '遊んで', '遊ばない', '遊んだ']],
    [v('読む', 'よむ', 1), ['読みます', '読んで', '読まない', '読んだ']],
    [v('帰る', 'かえる', 1), ['帰ります', '帰って', '帰らない', '帰った']],
    [v('買う', 'かう', 1), ['買います', '買って', '買わない', '買った']],
    // exceptions
    [v('行く', 'いく', 1), ['行きます', '行って', '行かない', '行った']],
    [v('有る', 'ある', 1), ['有ります', '有って', 'ない', '有った']],
    // group 2
    [v('食べる', 'たべる', 2), ['食べます', '食べて', '食べない', '食べた']],
    [v('見る', 'みる', 2), ['見ます', '見て', '見ない', '見た']],
    // group 3
    [v(null, 'する', 3), ['します', 'して', 'しない', 'した']],
    [v('勉強する', 'べんきょうする', 3), ['勉強します', '勉強して', '勉強しない', '勉強した']],
    [v('来る', 'くる', 3), ['来ます', '来て', '来ない', '来た']],
  ])('%o', (verb, [masu, te, nai, ta]) => {
    expect(displayForm(verb, VerbForm.Masu)).toBe(masu);
    expect(displayForm(verb, VerbForm.Te)).toBe(te);
    expect(displayForm(verb, VerbForm.Nai)).toBe(nai);
    expect(displayForm(verb, VerbForm.Ta)).toBe(ta);
  });

  it('conjugates the kana form too', () => {
    expect(conjugate(v('来る', 'くる', 3), VerbForm.Nai)).toEqual({ kanji: '来ない', kana: 'こない' });
    expect(conjugate(v('書く', 'かく', 1), VerbForm.Te)).toEqual({ kanji: '書いて', kana: 'かいて' });
  });

  it('returns kanji = null for kana-only verbs', () => {
    expect(conjugate(v(null, 'ある', 1), VerbForm.Masu)).toEqual({ kanji: null, kana: 'あります' });
  });
});

describe('conjugationDistractors', () => {
  const verbs = [
    v('書く', 'かく', 1),
    v('行く', 'いく', 1),
    v('食べる', 'たべる', 2),
    v(null, 'する', 3),
    v('勉強する', 'べんきょうする', 3),
    v('来る', 'くる', 3),
    v(null, 'ある', 1),
  ];

  it.each(verbs.flatMap((verb) => Object.values(VerbForm).map((form) => [verb, form] as const)))(
    '%o %s has 3+ unique wrong options',
    (verb, form) => {
      const correct = conjugate(verb, form);
      const distractors = conjugationDistractors(verb, form);
      expect(distractors.length).toBeGreaterThanOrEqual(3);
      expect(new Set(distractors).size).toBe(distractors.length);
      expect(distractors).not.toContain(correct.kana);
      if (correct.kanji) {
        expect(distractors).not.toContain(correct.kanji);
      }
    },
  );

  it('offers the regular-rule mistake for 行く', () => {
    expect(conjugationDistractors(v('行く', 'いく', 1), VerbForm.Te)).toContain('行いて');
  });
});

describe('every seeded verb', () => {
  it.each([JlptLevel.N5, JlptLevel.N4])('%s verbs conjugate and get distractors', (level) => {
    const verbs = loadWordSeeds(fs.readFileSync(wordSeedFilePath(level), 'utf8'), level)
      .filter((seed) => seed.verbGroup !== null)
      .map((seed) => v(seed.kanji, seed.kana, seed.verbGroup!));

    for (const verb of verbs) {
      for (const form of Object.values(VerbForm)) {
        expect(() => conjugate(verb, form)).not.toThrow();
        expect(conjugationDistractors(verb, form).length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- conjugation`
Expected: FAIL, module `./conjugation` not found.

- [ ] **Step 3: Implement**

`src/quiz/domain/conjugation.ts`:

```ts
import { VerbGroup } from '../../vocabulary/constants/word.constant';

export enum VerbForm {
  Masu = 'masu',
  Te = 'te',
  Nai = 'nai',
  Ta = 'ta',
}

export interface Verb {
  kanji: string | null;
  kana: string;
  verbGroup: VerbGroup;
}

const I_ROW: Record<string, string> = {
  う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り',
};
const A_ROW: Record<string, string> = {
  う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら',
};
const TE_ENDING: Record<string, string> = {
  う: 'って', つ: 'って', る: 'って', く: 'いて', ぐ: 'いで', す: 'して', ぬ: 'んで', ぶ: 'んで', む: 'んで',
};
const RU_VERB_SUFFIX: Record<VerbForm, string> = {
  [VerbForm.Masu]: 'ます', [VerbForm.Te]: 'て', [VerbForm.Nai]: 'ない', [VerbForm.Ta]: 'た',
};
const SURU: Record<VerbForm, string> = {
  [VerbForm.Masu]: 'します', [VerbForm.Te]: 'して', [VerbForm.Nai]: 'しない', [VerbForm.Ta]: 'した',
};
const KURU_KANA: Record<VerbForm, string> = {
  [VerbForm.Masu]: 'きます', [VerbForm.Te]: 'きて', [VerbForm.Nai]: 'こない', [VerbForm.Ta]: 'きた',
};

function teToTa(te: string): string {
  return te.replace(/て$/, 'た').replace(/で$/, 'だ');
}

function isIku(verb: Verb): boolean {
  return (
    verb.kana === 'いく' ||
    verb.kana.endsWith('ていく') ||
    (verb.kanji?.endsWith('行く') ?? false)
  );
}

function conjugateGodan(surface: string, verb: Verb, form: VerbForm): string {
  const last = surface.slice(-1);
  const stem = surface.slice(0, -1);
  if (!(last in I_ROW)) {
    throw new Error(`Cannot conjugate "${surface}" as a group 1 verb`);
  }
  switch (form) {
    case VerbForm.Masu:
      return stem + I_ROW[last] + 'ます';
    case VerbForm.Nai:
      return verb.kana === 'ある' ? 'ない' : stem + A_ROW[last] + 'ない';
    case VerbForm.Te:
      return stem + (isIku(verb) ? 'って' : TE_ENDING[last]);
    case VerbForm.Ta:
      return teToTa(conjugateGodan(surface, verb, VerbForm.Te));
  }
}

function conjugateIrregular(surface: string, form: VerbForm): string {
  if (surface.endsWith('する')) {
    return surface.slice(0, -2) + SURU[form];
  }
  if (surface.endsWith('来る')) {
    return surface.slice(0, -1) + RU_VERB_SUFFIX[form];
  }
  if (surface.endsWith('くる')) {
    return surface.slice(0, -2) + KURU_KANA[form];
  }
  throw new Error(`Cannot conjugate "${surface}" as a group 3 verb`);
}

function conjugateSurface(
  surface: string,
  verb: Verb,
  form: VerbForm,
  group: VerbGroup,
): string {
  if (group === 3) {
    return conjugateIrregular(surface, form);
  }
  if (group === 2) {
    if (!surface.endsWith('る')) {
      throw new Error(`Cannot conjugate "${surface}" as a group 2 verb`);
    }
    return surface.slice(0, -1) + RU_VERB_SUFFIX[form];
  }
  return conjugateGodan(surface, verb, form);
}

export function conjugate(
  verb: Verb,
  form: VerbForm,
): { kanji: string | null; kana: string } {
  return {
    kanji:
      verb.kanji === null
        ? null
        : conjugateSurface(verb.kanji, verb, form, verb.verbGroup),
    kana: conjugateSurface(verb.kana, verb, form, verb.verbGroup),
  };
}

export function displayForm(verb: Verb, form: VerbForm): string {
  const result = conjugate(verb, form);
  return result.kanji ?? result.kana;
}

// Plausible learner mistakes: wrong group rules, dictionary form + suffix,
// wrong stem row, and wrong て/た sound changes.
export function conjugationDistractors(verb: Verb, form: VerbForm): string[] {
  const surface = verb.kanji ?? verb.kana;
  const correct = conjugate(verb, form);
  const excluded = new Set([correct.kana, correct.kanji, surface]);

  const candidates: string[] = [surface + RU_VERB_SUFFIX[form]];
  for (const group of [1, 2] as VerbGroup[]) {
    try {
      candidates.push(conjugateSurface(surface, verb, form, group));
    } catch {
      // This group's rule does not apply to the verb ending.
    }
  }

  const last = surface.slice(-1);
  const stem = surface.slice(0, -1);
  if (last in I_ROW) {
    const iStem = stem + I_ROW[last];
    const aStem = stem + A_ROW[last];
    const extras: Record<VerbForm, string[]> = {
      [VerbForm.Masu]: [aStem + 'ます', stem + 'ます'],
      [VerbForm.Nai]: [aStem + 'ない', iStem + 'ない', stem + 'ない'],
      [VerbForm.Te]: [iStem + 'て', stem + 'って', stem + 'いて', stem + 'んで'],
      [VerbForm.Ta]: [iStem + 'た', stem + 'った', stem + 'いた', stem + 'んだ'],
    };
    candidates.push(...extras[form]);
  }

  return [...new Set(candidates)].filter((c) => !excluded.has(c));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- conjugation`
Expected: PASS. If the whole-dataset test reports a verb that cannot be conjugated, fix the classification in `word-seed.ts` (for example add it to `UNSUPPORTED_VERBS`) and re-run both `word-seed` and `conjugation`.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/domain/conjugation.ts src/quiz/domain/conjugation.spec.ts src/vocabulary/seed/word-seed.ts
git commit -m "feat(quiz): add verb conjugation engine with plausible distractors"
```

---

### Task 6: Question building and answer checking

**Files:**
- Create: `src/quiz/domain/quiz-builder.ts`, `src/quiz/domain/answer-checker.ts`
- Test: `src/quiz/domain/quiz-builder.spec.ts`, `src/quiz/domain/answer-checker.spec.ts`

**Interfaces:**
- Consumes: `Word`, `PartOfSpeech` (Task 1); `QuizType` (Task 4); `VerbForm`, `Verb`, `conjugate`, `displayForm`, `conjugationDistractors` (Task 5).
- Produces:
  - `type Rng = () => number`
  - `OPTIONS_PER_QUESTION = 4`
  - `shuffle<T>(items: readonly T[], rng?: Rng): T[]`
  - `interface VocabularyQuestion { wordId: number; kanji: string | null; kana: string; options: string[] }`
  - `interface VerbQuestion extends VocabularyQuestion { form: VerbForm }`
  - `toVerb(word: Word): Verb` (throws if `verbGroup` is null)
  - `buildVocabularyQuestion(word: Word, pool: Word[], rng?: Rng): VocabularyQuestion`
  - `buildVerbQuestion(word: Word, form: VerbForm, pool: Word[], rng?: Rng): VerbQuestion`
  - `checkAnswer(word: Word, input: { quizType: QuizType; answer: string; form?: VerbForm }): { isCorrect: boolean; correctAnswer: string }` (throws `BadRequestException`)

- [ ] **Step 1: Write the failing tests**

`src/quiz/domain/quiz-builder.spec.ts`:

```ts
import { JlptLevel, PartOfSpeech } from '../../vocabulary/constants/word.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { VerbForm } from './conjugation';
import { buildVerbQuestion, buildVocabularyQuestion, shuffle } from './quiz-builder';

let nextId = 1;
const word = (fields: Partial<Word>): Word => ({
  id: nextId++,
  kanji: null,
  kana: 'かな',
  romaji: 'kana',
  meaningEn: 'meaning',
  meaningRu: null,
  partOfSpeech: PartOfSpeech.Noun,
  verbGroup: null,
  level: JlptLevel.N5,
  lesson: null,
  ...fields,
});

describe('shuffle', () => {
  it('returns a permutation and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('buildVocabularyQuestion', () => {
  const book = word({ kanji: '本', kana: 'ほん', meaningEn: 'book' });
  const nouns = ['water', 'mountain', 'dog', 'cat'].map((meaningEn) => word({ meaningEn }));

  it('has 4 unique options including the correct meaning, without leaking ids', () => {
    const q = buildVocabularyQuestion(book, [book, ...nouns]);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain('book');
    expect(q).toEqual({ wordId: book.id, kanji: '本', kana: 'ほん', options: expect.any(Array) });
  });

  it('prefers distractors with the same part of speech', () => {
    const verbs = ['to eat', 'to drink', 'to go'].map((meaningEn) =>
      word({ meaningEn, partOfSpeech: PartOfSpeech.Verb }),
    );
    const q = buildVocabularyQuestion(book, [book, ...verbs, ...nouns]);
    expect(q.options.filter((o) => o.startsWith('to '))).toHaveLength(0);
  });

  it('never shows a second option with the correct meaning (在る/有る, 青/青い)', () => {
    const blue = word({ kanji: '青', kana: 'あお', meaningEn: 'blue' });
    const blueAdj = word({ kanji: '青い', kana: 'あおい', meaningEn: 'blue', partOfSpeech: PartOfSpeech.IAdjective });
    const sameNoun = word({ kanji: '青色', meaningEn: 'blue' });
    const q = buildVocabularyQuestion(blue, [blue, blueAdj, sameNoun, ...nouns]);
    expect(q.options.filter((o) => o === 'blue')).toHaveLength(1);
    expect(new Set(q.options).size).toBe(q.options.length);
  });

  it('falls back to other parts of speech and then returns fewer options', () => {
    const verb = word({ meaningEn: 'to fly', partOfSpeech: PartOfSpeech.Verb });
    expect(buildVocabularyQuestion(book, [book, verb]).options.sort()).toEqual(['book', 'to fly']);
    expect(buildVocabularyQuestion(book, [book]).options).toEqual(['book']);
  });

  it('keeps kana-only words as kanji = null', () => {
    const koko = word({ kana: 'ここ', meaningEn: 'here' });
    expect(buildVocabularyQuestion(koko, [koko, ...nouns]).kanji).toBeNull();
  });
});

describe('buildVerbQuestion', () => {
  const kaku = word({ kanji: '書く', kana: 'かく', partOfSpeech: PartOfSpeech.Verb, verbGroup: 1 });

  it('has the correct form among 4 unique options', () => {
    const q = buildVerbQuestion(kaku, VerbForm.Te, [kaku]);
    expect(q.form).toBe(VerbForm.Te);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain('書いて');
  });
});
```

`src/quiz/domain/answer-checker.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { JlptLevel, PartOfSpeech } from '../../vocabulary/constants/word.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { checkAnswer } from './answer-checker';
import { VerbForm } from './conjugation';

const base = { romaji: '', meaningRu: null, level: JlptLevel.N5, lesson: null };
const book: Word = { ...base, id: 1, kanji: '本', kana: 'ほん', meaningEn: 'book', partOfSpeech: PartOfSpeech.Noun, verbGroup: null };
const taberu: Word = { ...base, id: 2, kanji: '食べる', kana: 'たべる', meaningEn: 'to eat', partOfSpeech: PartOfSpeech.Verb, verbGroup: 2 };
const aru: Word = { ...base, id: 3, kanji: null, kana: 'ある', meaningEn: 'to be', partOfSpeech: PartOfSpeech.Verb, verbGroup: 1 };

describe('checkAnswer', () => {
  it('checks vocabulary meanings', () => {
    expect(checkAnswer(book, { quizType: QuizType.Vocabulary, answer: 'book' })).toEqual({ isCorrect: true, correctAnswer: 'book' });
    expect(checkAnswer(book, { quizType: QuizType.Vocabulary, answer: 'water' })).toEqual({ isCorrect: false, correctAnswer: 'book' });
  });

  it('accepts kanji and kana verb answers and reports the display form', () => {
    expect(checkAnswer(taberu, { quizType: QuizType.Verb, answer: '食べて', form: VerbForm.Te })).toEqual({ isCorrect: true, correctAnswer: '食べて' });
    expect(checkAnswer(taberu, { quizType: QuizType.Verb, answer: 'たべて', form: VerbForm.Te }).isCorrect).toBe(true);
    expect(checkAnswer(taberu, { quizType: QuizType.Verb, answer: '食べって', form: VerbForm.Te }).isCorrect).toBe(false);
  });

  it('handles kana-only verbs', () => {
    expect(checkAnswer(aru, { quizType: QuizType.Verb, answer: 'ない', form: VerbForm.Nai })).toEqual({ isCorrect: true, correctAnswer: 'ない' });
  });

  it('rejects a verb answer without form', () => {
    expect(() => checkAnswer(taberu, { quizType: QuizType.Verb, answer: '食べて' })).toThrow(BadRequestException);
  });

  it('rejects a verb answer for a word that is not a quizzable verb', () => {
    expect(() => checkAnswer(book, { quizType: QuizType.Verb, answer: 'x', form: VerbForm.Te })).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- quiz/domain`
Expected: the new specs FAIL, modules not found. `conjugation.spec` still passes.

- [ ] **Step 3: Implement**

`src/quiz/domain/quiz-builder.ts`:

```ts
import { Word } from '../../vocabulary/entities/word.entity';
import {
  conjugationDistractors,
  displayForm,
  Verb,
  VerbForm,
} from './conjugation';

export type Rng = () => number;

export const OPTIONS_PER_QUESTION = 4;
const DISTRACTOR_COUNT = OPTIONS_PER_QUESTION - 1;

export interface VocabularyQuestion {
  wordId: number;
  kanji: string | null;
  kana: string;
  options: string[];
}

export interface VerbQuestion extends VocabularyQuestion {
  form: VerbForm;
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function toVerb(word: Word): Verb {
  if (word.verbGroup === null) {
    throw new Error(`Word ${word.id} is not a quizzable verb`);
  }
  return { kanji: word.kanji, kana: word.kana, verbGroup: word.verbGroup };
}

function pickDistractors(
  correct: string,
  preferred: string[],
  fallback: string[],
): string[] {
  const unique = [...new Set([...preferred, ...fallback])];
  return unique.filter((option) => option !== correct).slice(0, DISTRACTOR_COUNT);
}

export function buildVocabularyQuestion(
  word: Word,
  pool: Word[],
  rng: Rng = Math.random,
): VocabularyQuestion {
  const others = pool.filter((w) => w.id !== word.id);
  const meanings = (sameKind: boolean) =>
    shuffle(
      others
        .filter((w) => (w.partOfSpeech === word.partOfSpeech) === sameKind)
        .map((w) => w.meaningEn),
      rng,
    );

  const distractors = pickDistractors(word.meaningEn, meanings(true), meanings(false));

  return {
    wordId: word.id,
    kanji: word.kanji,
    kana: word.kana,
    options: shuffle([word.meaningEn, ...distractors], rng),
  };
}

export function buildVerbQuestion(
  word: Word,
  form: VerbForm,
  pool: Word[],
  rng: Rng = Math.random,
): VerbQuestion {
  const verb = toVerb(word);
  const correct = displayForm(verb, form);
  const otherVerbs = pool
    .filter((w) => w.id !== word.id && w.verbGroup !== null)
    .map((w) => displayForm(toVerb(w), form));

  const distractors = pickDistractors(
    correct,
    shuffle(conjugationDistractors(verb, form), rng),
    shuffle(otherVerbs, rng),
  );

  return {
    wordId: word.id,
    kanji: word.kanji,
    kana: word.kana,
    form,
    options: shuffle([correct, ...distractors], rng),
  };
}
```

`src/quiz/domain/answer-checker.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { conjugate, VerbForm } from './conjugation';
import { toVerb } from './quiz-builder';

export function checkAnswer(
  word: Word,
  input: { quizType: QuizType; answer: string; form?: VerbForm },
): { isCorrect: boolean; correctAnswer: string } {
  if (input.quizType === QuizType.Vocabulary) {
    return {
      isCorrect: input.answer === word.meaningEn,
      correctAnswer: word.meaningEn,
    };
  }

  if (!input.form) {
    throw new BadRequestException('form is required for verb answers');
  }
  if (word.verbGroup === null) {
    throw new BadRequestException(`Word ${word.id} is not a quizzable verb`);
  }

  const correct = conjugate(toVerb(word), input.form);
  return {
    isCorrect: input.answer === correct.kanji || input.answer === correct.kana,
    correctAnswer: correct.kanji ?? correct.kana,
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm test -- quiz/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/domain
git commit -m "feat(quiz): build multiple-choice questions and check answers"
```

---

### Task 7: Quiz module (selection query, endpoints, full-flow e2e)

**Files:**
- Modify: `src/vocabulary/repositories/word.repository.ts` (add `findForQuiz`)
- Create: `src/quiz/dtos/quiz-query.dto.ts`, `src/quiz/dtos/quiz-answer-input.dto.ts`, `src/quiz/dtos/quiz-output.dto.ts`
- Create: `src/quiz/services/quiz.service.ts`, `src/quiz/controllers/quiz.controller.ts`, `src/quiz/quiz.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/nihongo/quiz.e2e-spec.ts`

**Interfaces:**
- Consumes: everything above. `ProgressService.recordAnswer` (Task 4), `buildVocabularyQuestion`, `buildVerbQuestion`, `checkAnswer`, `shuffle` (Task 6).
- Produces:
  - `WordRepository.findForQuiz(userId: number, level: JlptLevel, count: number, verbsOnly: boolean): Promise<Word[]>`. Order: due words (oldest due first), then never-answered words, then the rest, with random order inside each group.
  - HTTP endpoints from the spec. `POST /quiz/answer` responds with 200.

- [ ] **Step 1: Write the failing e2e test**

`test/nihongo/quiz.e2e-spec.ts`:

```ts
import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { Word } from '../../src/vocabulary/entities/word.entity';
import { closeDBAfterTest } from '../test-utils';
import {
  createNihongoTestApp,
  registerAndLogin,
  seedTestWords,
} from './nihongo-test-utils';

describe('QuizController (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let words: Word[];

  beforeAll(async () => {
    app = await createNihongoTestApp();
    words = await seedTestWords(app);
    token = await registerAndLogin(app, 'quiz-user');
  });

  const auth = (req: request.Test) => req.set('Authorization', 'Bearer ' + token);
  const server = () => app.getHttpServer();

  it('returns at most the available words, without duplicates or answers', async () => {
    const response = await auth(request(server()).get('/quiz/vocabulary?level=N5&count=20')).expect(HttpStatus.OK);
    const questions = response.body.data;
    expect(questions).toHaveLength(6);
    expect(new Set(questions.map((q: { wordId: number }) => q.wordId)).size).toBe(6);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(Object.keys(q).sort()).toEqual(['kana', 'kanji', 'options', 'wordId']);
    }
  });

  it('defaults count to 10 and validates it', async () => {
    await auth(request(server()).get('/quiz/vocabulary?level=N5')).expect(HttpStatus.OK);
    await auth(request(server()).get('/quiz/vocabulary?level=N5&count=21')).expect(HttpStatus.BAD_REQUEST);
    await auth(request(server()).get('/quiz/vocabulary?level=N5&count=0')).expect(HttpStatus.BAD_REQUEST);
  });

  it('returns an empty list for a level without words', async () => {
    const response = await auth(request(server()).get('/quiz/vocabulary?level=N4')).expect(HttpStatus.OK);
    expect(response.body.data).toEqual([]);
  });

  it('returns only verbs with a target form for the verb quiz', async () => {
    const response = await auth(request(server()).get('/quiz/verbs?level=N5')).expect(HttpStatus.OK);
    expect(response.body.data).toHaveLength(2);
    for (const q of response.body.data) {
      expect(['masu', 'te', 'nai', 'ta']).toContain(q.form);
      expect(q.options).toHaveLength(4);
    }
  });

  it('records a correct then a wrong answer and updates the summary', async () => {
    const book = words.find((w) => w.kana === 'ほん')!;

    const correct = await auth(request(server()).post('/quiz/answer'))
      .send({ quizType: 'vocabulary', wordId: book.id, answer: 'book' })
      .expect(HttpStatus.OK);
    expect(correct.body.data).toEqual(
      expect.objectContaining({ isCorrect: true, correctAnswer: 'book', newBox: 2, nextReviewAt: expect.any(String) }),
    );

    const wrong = await auth(request(server()).post('/quiz/answer'))
      .send({ quizType: 'vocabulary', wordId: book.id, answer: 'water' })
      .expect(HttpStatus.OK);
    expect(wrong.body.data).toEqual(expect.objectContaining({ isCorrect: false, correctAnswer: 'book', newBox: 1 }));

    const summary = await auth(request(server()).get('/progress/summary?level=N5')).expect(HttpStatus.OK);
    expect(summary.body.data).toEqual({ total: 6, learned: 0, dueToday: 0, streakDays: 1, accuracy7d: 0.5 });
  });

  it('accepts a verb answer in kana', async () => {
    const taberu = words.find((w) => w.kana === 'たべる')!;
    const response = await auth(request(server()).post('/quiz/answer'))
      .send({ quizType: 'verb', wordId: taberu.id, answer: 'たべて', form: 'te' })
      .expect(HttpStatus.OK);
    expect(response.body.data).toEqual(expect.objectContaining({ isCorrect: true, correctAnswer: '食べて' }));
  });

  it('rejects malformed answers with 4xx', async () => {
    const taberu = words.find((w) => w.kana === 'たべる')!;
    const book = words.find((w) => w.kana === 'ほん')!;
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'verb', wordId: taberu.id, answer: '食べて' }).expect(HttpStatus.BAD_REQUEST);
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'verb', wordId: book.id, answer: 'x', form: 'te' }).expect(HttpStatus.BAD_REQUEST);
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'vocabulary', wordId: 99999, answer: 'x' }).expect(HttpStatus.NOT_FOUND);
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'kanji', wordId: book.id, answer: 'x' }).expect(HttpStatus.BAD_REQUEST);
  });

  it('requires a token', () => request(server()).get('/quiz/vocabulary?level=N5').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- quiz`
Expected: FAIL with 404 on `/quiz/vocabulary`.

- [ ] **Step 3: Add `findForQuiz` to `WordRepository`**

Add the imports `JlptLevel` and `UserWordProgress`, then add the method:

```ts
import { UserWordProgress } from '../../progress/entities/user-word-progress.entity';
import { JlptLevel } from '../constants/word.constant';
// ...
  findForQuiz(
    userId: number,
    level: JlptLevel,
    count: number,
    verbsOnly: boolean,
  ): Promise<Word[]> {
    const query = this.createQueryBuilder('w')
      .leftJoin(
        UserWordProgress,
        'p',
        'p.wordId = w.id AND p.userId = :userId',
        { userId },
      )
      .where('w.level = :level', { level });
    if (verbsOnly) {
      query.andWhere('w.verbGroup IS NOT NULL');
    }
    return query
      .addSelect(
        `CASE WHEN p."nextReviewAt" <= NOW() THEN 0 WHEN p."id" IS NULL THEN 1 ELSE 2 END`,
        'priority',
      )
      .orderBy('priority', 'ASC')
      .addOrderBy('p.nextReviewAt', 'ASC', 'NULLS LAST')
      .addOrderBy('RANDOM()')
      .limit(count)
      .getMany();
  }
```

- [ ] **Step 4: Add the DTOs**

`src/quiz/dtos/quiz-query.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { JlptLevel } from '../../vocabulary/constants/word.constant';

export class QuizQueryInput {
  @ApiProperty({ enum: JlptLevel })
  @IsEnum(JlptLevel)
  level: JlptLevel;

  @ApiPropertyOptional({ description: '1–20, defaults to 10', type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  count = 10;
}
```

`src/quiz/dtos/quiz-answer-input.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { VerbForm } from '../domain/conjugation';

export class QuizAnswerInput {
  @ApiProperty({ enum: QuizType })
  @IsEnum(QuizType)
  quizType: QuizType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  wordId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  answer: string;

  @ApiPropertyOptional({ enum: VerbForm, description: 'Required for verb answers' })
  @IsOptional()
  @IsEnum(VerbForm)
  form?: VerbForm;
}
```

`src/quiz/dtos/quiz-output.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VerbForm } from '../domain/conjugation';

export class VocabularyQuestionOutput {
  @ApiProperty()
  wordId: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  kanji: string | null;

  @ApiProperty()
  kana: string;

  @ApiProperty({ type: [String] })
  options: string[];
}

export class VerbQuestionOutput extends VocabularyQuestionOutput {
  @ApiProperty({ enum: VerbForm })
  form: VerbForm;
}

export class QuizAnswerOutput {
  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty()
  correctAnswer: string;

  @ApiProperty({ description: 'Leitner box after this answer (1–5)' })
  newBox: number;

  @ApiProperty()
  nextReviewAt: Date;
}
```

- [ ] **Step 5: Add the service, controller and module**

`src/quiz/services/quiz.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';

import { ProgressService } from '../../progress/services/progress.service';
import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import { checkAnswer } from '../domain/answer-checker';
import { VerbForm } from '../domain/conjugation';
import {
  buildVerbQuestion,
  buildVocabularyQuestion,
  shuffle,
} from '../domain/quiz-builder';
import { QuizAnswerInput } from '../dtos/quiz-answer-input.dto';
import {
  QuizAnswerOutput,
  VerbQuestionOutput,
  VocabularyQuestionOutput,
} from '../dtos/quiz-output.dto';

@Injectable()
export class QuizService {
  constructor(
    private wordRepository: WordRepository,
    private progressService: ProgressService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(QuizService.name);
  }

  async getVocabularyQuiz(
    ctx: RequestContext,
    level: JlptLevel,
    count: number,
  ): Promise<VocabularyQuestionOutput[]> {
    this.logger.log(ctx, `${this.getVocabularyQuiz.name} was called`);

    const selected = await this.wordRepository.findForQuiz(ctx.user!.id, level, count, false);
    if (selected.length === 0) {
      return [];
    }
    const pool = await this.wordRepository.find({ where: { level } });
    return selected.map((word) => buildVocabularyQuestion(word, pool));
  }

  async getVerbQuiz(
    ctx: RequestContext,
    level: JlptLevel,
    count: number,
  ): Promise<VerbQuestionOutput[]> {
    this.logger.log(ctx, `${this.getVerbQuiz.name} was called`);

    const selected = await this.wordRepository.findForQuiz(ctx.user!.id, level, count, true);
    if (selected.length === 0) {
      return [];
    }
    const pool = await this.wordRepository.find({
      where: { level, verbGroup: Not(IsNull()) },
    });
    const forms = Object.values(VerbForm);
    return selected.map((word) =>
      buildVerbQuestion(word, shuffle(forms)[0], pool),
    );
  }

  async answer(
    ctx: RequestContext,
    input: QuizAnswerInput,
  ): Promise<QuizAnswerOutput> {
    this.logger.log(ctx, `${this.answer.name} was called`);

    const word = await this.wordRepository.getById(input.wordId);
    const { isCorrect, correctAnswer } = checkAnswer(word, input);
    const { box, nextReviewAt } = await this.progressService.recordAnswer(
      ctx.user!.id,
      word.id,
      input.quizType,
      isCorrect,
      new Date(),
    );

    return { isCorrect, correctAnswer, newBox: box, nextReviewAt };
  }
}
```

`src/quiz/controllers/quiz.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  BaseApiErrorResponse,
  BaseApiResponse,
  SwaggerBaseApiResponse,
} from '../../shared/dtos/base-api-response.dto';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { QuizAnswerInput } from '../dtos/quiz-answer-input.dto';
import {
  QuizAnswerOutput,
  VerbQuestionOutput,
  VocabularyQuestionOutput,
} from '../dtos/quiz-output.dto';
import { QuizQueryInput } from '../dtos/quiz-query.dto';
import { QuizService } from '../services/quiz.service';

@ApiTags('quiz')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('vocabulary')
  @ApiOperation({ summary: 'Vocabulary quiz: due words first, then new ones' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([VocabularyQuestionOutput]) })
  async getVocabularyQuiz(
    @ReqContext() ctx: RequestContext,
    @Query() query: QuizQueryInput,
  ): Promise<BaseApiResponse<VocabularyQuestionOutput[]>> {
    const questions = await this.quizService.getVocabularyQuiz(ctx, query.level, query.count);
    return { data: questions, meta: { count: questions.length } };
  }

  @Get('verbs')
  @ApiOperation({ summary: 'Verb conjugation quiz (ます / て / ない / た forms)' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([VerbQuestionOutput]) })
  async getVerbQuiz(
    @ReqContext() ctx: RequestContext,
    @Query() query: QuizQueryInput,
  ): Promise<BaseApiResponse<VerbQuestionOutput[]>> {
    const questions = await this.quizService.getVerbQuiz(ctx, query.level, query.count);
    return { data: questions, meta: { count: questions.length } };
  }

  @Post('answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check an answer and update spaced-repetition progress' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse(QuizAnswerOutput) })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: BaseApiErrorResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: BaseApiErrorResponse })
  async answer(
    @ReqContext() ctx: RequestContext,
    @Body() input: QuizAnswerInput,
  ): Promise<BaseApiResponse<QuizAnswerOutput>> {
    const result = await this.quizService.answer(ctx, input);
    return { data: result, meta: {} };
  }
}
```

`src/quiz/quiz.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { ProgressModule } from '../progress/progress.module';
import { SharedModule } from '../shared/shared.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { QuizController } from './controllers/quiz.controller';
import { QuizService } from './services/quiz.service';

@Module({
  imports: [SharedModule, VocabularyModule, ProgressModule],
  providers: [QuizService, JwtAuthStrategy],
  controllers: [QuizController],
})
export class QuizModule {}
```

Add `QuizModule` to `imports` in `src/app.module.ts`.

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- quiz`
Expected: PASS. If `findForQuiz` fails with a TypeORM ordering error on `priority`, replace `.orderBy('priority', 'ASC')` with `.orderBy('CASE WHEN p."nextReviewAt" <= NOW() THEN 0 WHEN p."id" IS NULL THEN 1 ELSE 2 END', 'ASC')`, remove the `addSelect`, and re-run.

- [ ] **Step 7: Full backend check**

```bash
npm run lint
npm test
npm run test:e2e
npm run start:dev
```

Open `http://localhost:3000/swagger`. Authorize with a token from `POST /auth/login`, then call `GET /quiz/vocabulary?level=N5` and `GET /quiz/verbs?level=N4` against the seeded DB.
Expected: lint is clean, all tests pass, and Swagger shows the `vocabulary`, `progress` and `quiz` tags with real Japanese data.

- [ ] **Step 8: Commit**

```bash
git add src/quiz src/vocabulary/repositories/word.repository.ts src/app.module.ts test/nihongo/quiz.e2e-spec.ts
git commit -m "feat(quiz): add vocabulary and verb quiz endpoints with answer tracking"
```

---

### Task 8: Frontend scaffold, theme and API layer

**Files (all under `/Users/aray_muratova/Desktop/projects/nihongo-web`):**
- Create via tooling: Vite React-TS template, shadcn `components/ui/*`, `lib/utils.ts`, `components.json`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`, `src/index.css`, `src/main.tsx`, `src/App.tsx`
- Create: `.env`, `src/lib/api/token-storage.ts`, `src/lib/api/client.ts`, `src/lib/api/types.ts`, `src/lib/api/endpoints.ts`, `src/lib/api/errors.ts`, `src/lib/level.ts`

**Interfaces:**
- Consumes: the backend API from Tasks 2, 4 and 7, plus the existing `/auth/login`, `/auth/register`, `/auth/refresh-token`, `/users/me`.
- Produces:
  - `api` (axios instance), `LOGOUT_EVENT = 'nihongo:logout'`
  - `tokenStorage.{getAccess, getRefresh, set(access, refresh), clear}`
  - Types: `Level`, `LEVELS`, `QuizType`, `VerbForm`, `Question`, `AnswerInput`, `AnswerResult`, `ProgressSummary`, `Word`, `User`, `RegisterInput`, `AuthTokens`
  - `login`, `register`, `getMe`, `getSummary`, `getQuiz`, `submitAnswer`, `getWords`
  - `getErrorMessage(error: unknown): string`
  - `useLevel(): [Level, (level: Level) => void]`, `parseLevel(value: string | null): Level`

- [ ] **Step 1: Scaffold and install**

```bash
cd /Users/aray_muratova/Desktop/projects
npm create vite@latest nihongo-web -- --template react-ts
cd nihongo-web
npm install
npm install tailwindcss @tailwindcss/vite axios @tanstack/react-query react-router-dom next-themes
npm install -D @types/node
git init
```

- [ ] **Step 2: Configure Tailwind and the `@` alias**

`vite.config.ts`:

```ts
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

In both `tsconfig.json` and `tsconfig.app.json` add to `compilerOptions` (create the `compilerOptions` object in `tsconfig.json` if it has only `files`/`references`):

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

Replace `src/index.css` with a single line: `@import "tailwindcss";`

- [ ] **Step 3: Initialize shadcn/ui and add components**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label tabs progress badge skeleton sonner table
```

Expected: `src/components/ui/*.tsx` and `src/lib/utils.ts` are created, and `src/index.css` now holds shadcn's theme variables.

- [ ] **Step 4: Fonts, palette and animations**

In `index.html`, set `<title>Nihongo Dojo</title>` and add inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet" />
```

Append to the end of `src/index.css` (after shadcn's blocks, so these values win):

```css
@theme {
  --font-sans: 'Inter', 'Noto Sans JP', ui-sans-serif, system-ui, sans-serif;
  --font-jp: 'Noto Sans JP', ui-sans-serif, sans-serif;
  --animate-pop: pop 0.3s ease-out;
  --animate-shake: shake 0.4s ease-in-out;

  @keyframes pop {
    0% { transform: scale(1); }
    50% { transform: scale(1.04); }
    100% { transform: scale(1); }
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    75% { transform: translateX(6px); }
  }
}

/* Washi paper + 朱色 (vermilion) accent */
:root {
  --background: oklch(0.975 0.012 85);
  --card: oklch(0.993 0.006 85);
  --popover: oklch(0.993 0.006 85);
  --muted: oklch(0.94 0.015 80);
  --secondary: oklch(0.94 0.015 80);
  --border: oklch(0.89 0.02 80);
  --input: oklch(0.89 0.02 80);
  --primary: oklch(0.6 0.19 33);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.6 0.19 33);
}

.dark {
  --background: oklch(0.17 0.01 60);
  --card: oklch(0.21 0.012 60);
  --popover: oklch(0.21 0.012 60);
  --muted: oklch(0.26 0.012 60);
  --secondary: oklch(0.26 0.012 60);
  --border: oklch(0.3 0.012 60);
  --input: oklch(0.3 0.012 60);
  --primary: oklch(0.68 0.17 35);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.68 0.17 35);
}

@media (prefers-reduced-motion: reduce) {
  .animate-pop, .animate-shake { animation: none; }
}
```

- [ ] **Step 5: API layer**

`.env`:

```
VITE_API_URL=http://localhost:3000/api/v1
```

`src/lib/api/token-storage.ts`:

```ts
const ACCESS_KEY = 'nihongo.accessToken';
const REFRESH_KEY = 'nihongo.refreshToken';

// Falls back to memory when localStorage is unavailable (private mode, blocked storage).
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Memory copy above keeps the session working for this tab.
  }
}

export const tokenStorage = {
  getAccess: () => read(ACCESS_KEY),
  getRefresh: () => read(REFRESH_KEY),
  set(accessToken: string, refreshToken: string) {
    write(ACCESS_KEY, accessToken);
    write(REFRESH_KEY, refreshToken);
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};
```

`src/lib/api/types.ts`:

```ts
export type Level = 'N5' | 'N4';
export const LEVELS: Level[] = ['N5', 'N4'];

export type QuizType = 'vocabulary' | 'verb';
export type VerbForm = 'masu' | 'te' | 'nai' | 'ta';

export interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
}

export interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface Question {
  wordId: number;
  kanji: string | null;
  kana: string;
  options: string[];
  form?: VerbForm;
}

export interface AnswerInput {
  quizType: QuizType;
  wordId: number;
  answer: string;
  form?: VerbForm;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  newBox: number;
  nextReviewAt: string;
}

export interface ProgressSummary {
  total: number;
  learned: number;
  dueToday: number;
  streakDays: number;
  accuracy7d: number | null;
}

export interface Word {
  id: number;
  kanji: string | null;
  kana: string;
  romaji: string;
  meaningEn: string;
  partOfSpeech: string;
  verbGroup: number | null;
  level: Level;
}
```

`src/lib/api/client.ts`:

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { tokenStorage } from './token-storage';
import { AuthTokens, Envelope } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
export const LOGOUT_EVENT = 'nihongo:logout';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// One refresh shared by all requests that hit 401 at the same time.
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) {
    throw new Error('No refresh token');
  }
  const { data } = await axios.post<Envelope<AuthTokens>>(`${API_URL}/auth/refresh-token`, { refreshToken });
  tokenStorage.set(data.data.accessToken, data.data.refreshToken);
  return data.data.accessToken;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/') ?? false;
    if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
      throw error;
    }
    original._retried = true;
    try {
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch {
      tokenStorage.clear();
      window.dispatchEvent(new Event(LOGOUT_EVENT));
      throw error;
    }
  },
);
```

`src/lib/api/endpoints.ts`:

```ts
import { api } from './client';
import {
  AnswerInput,
  AnswerResult,
  AuthTokens,
  Envelope,
  Level,
  ProgressSummary,
  Question,
  QuizType,
  RegisterInput,
  User,
  Word,
} from './types';

export async function login(input: { username: string; password: string }): Promise<AuthTokens> {
  const { data } = await api.post<Envelope<AuthTokens>>('/auth/login', input);
  return data.data;
}

export async function register(input: RegisterInput): Promise<void> {
  await api.post('/auth/register', input);
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<Envelope<User>>('/users/me');
  return data.data;
}

export async function getSummary(level: Level): Promise<ProgressSummary> {
  const { data } = await api.get<Envelope<ProgressSummary>>('/progress/summary', { params: { level } });
  return data.data;
}

export async function getQuiz(type: QuizType, level: Level, count = 10): Promise<Question[]> {
  const path = type === 'vocabulary' ? '/quiz/vocabulary' : '/quiz/verbs';
  const { data } = await api.get<Envelope<Question[]>>(path, { params: { level, count } });
  return data.data;
}

export async function submitAnswer(input: AnswerInput): Promise<AnswerResult> {
  const { data } = await api.post<Envelope<AnswerResult>>('/quiz/answer', input);
  return data.data;
}

export async function getWords(level: Level): Promise<Word[]> {
  const { data } = await api.get<Envelope<Word[]>>('/vocabulary', { params: { level, limit: 1000, offset: 0 } });
  return data.data;
}
```

`src/lib/api/errors.ts`:

```ts
import { isAxiosError } from 'axios';

export function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot reach the server. Is the API running?';
    }
    const message = (error.response.data as { error?: { message?: unknown } })?.error?.message;
    if (typeof message === 'string' && message) {
      return message;
    }
  }
  return 'Something went wrong. Please try again.';
}
```

`src/lib/level.ts`:

```ts
import { useCallback, useState } from 'react';

import { Level } from './api/types';

const LEVEL_KEY = 'nihongo.level';

export function parseLevel(value: string | null): Level {
  return value === 'N4' ? 'N4' : 'N5';
}

function readLevel(): Level {
  try {
    return parseLevel(localStorage.getItem(LEVEL_KEY));
  } catch {
    return 'N5';
  }
}

export function useLevel(): [Level, (level: Level) => void] {
  const [level, setLevelState] = useState<Level>(readLevel);
  const setLevel = useCallback((next: Level) => {
    setLevelState(next);
    try {
      localStorage.setItem(LEVEL_KEY, next);
    } catch {
      // Remembering the level is a convenience only.
    }
  }, []);
  return [level, setLevel];
}
```

- [ ] **Step 6: Providers and a temporary App**

`src/main.tsx`:

```tsx
import './index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Toaster } from '@/components/ui/sonner';

import App from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

`src/App.tsx` (temporary, replaced in Task 9):

```tsx
export default function App() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <p className="font-jp text-6xl font-bold text-primary">日本語</p>
    </div>
  );
}
```

Delete `src/App.css` and the `src/assets/react.svg` import, if left over.

- [ ] **Step 7: Verify**

Run: `npm run build && npm run lint`
Expected: both succeed.
Run: `npm run dev`, then open `http://localhost:5173`.
Expected: a vermilion 日本語 rendered in Noto Sans JP on a warm paper background.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React app with Tailwind, shadcn theme and API client"
```

---

### Task 9: Authentication (login, register, protected layout, token refresh)

**Files:**
- Create: `src/features/auth/auth-context.ts`, `src/features/auth/AuthProvider.tsx`, `src/features/auth/RequireAuth.tsx`, `src/features/auth/AuthLayout.tsx`, `src/features/auth/LoginPage.tsx`, `src/features/auth/RegisterPage.tsx`
- Create: `src/components/Logo.tsx`, `src/components/AppLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `login`, `register`, `getMe`, `tokenStorage`, `LOGOUT_EVENT`, `getErrorMessage` (Task 8).
- Produces: `useAuth(): { isAuthenticated: boolean; user: User | undefined; login(username, password): Promise<void>; register(input): Promise<void>; logout(): void }`, plus the router with `/login`, `/register`, `/` (dashboard), `/quiz/:type`, `/dictionary`.

- [ ] **Step 1: Auth context and provider**

`src/features/auth/auth-context.ts`:

```ts
import { createContext, useContext } from 'react';

import { RegisterInput, User } from '@/lib/api/types';

export interface AuthContextValue {
  isAuthenticated: boolean;
  user: User | undefined;
  login(username: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
```

`src/features/auth/AuthProvider.tsx`:

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { LOGOUT_EVENT } from '@/lib/api/client';
import { getMe, login as apiLogin, register as apiRegister } from '@/lib/api/endpoints';
import { tokenStorage } from '@/lib/api/token-storage';
import { RegisterInput } from '@/lib/api/types';

import { AuthContext, AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState(() => tokenStorage.getAccess() !== null);
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe, enabled: isAuthenticated });

  const logout = useCallback(() => {
    tokenStorage.clear();
    queryClient.clear();
    setIsAuthenticated(false);
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener(LOGOUT_EVENT, logout);
    return () => window.removeEventListener(LOGOUT_EVENT, logout);
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await apiLogin({ username, password });
    tokenStorage.set(tokens.accessToken, tokens.refreshToken);
    setIsAuthenticated(true);
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      await apiRegister(input);
      await login(input.username, input.password);
    },
    [login],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated, user, login, register, logout }),
    [isAuthenticated, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

`src/features/auth/RequireAuth.tsx`:

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './auth-context';

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}
```

- [ ] **Step 2: Logo, auth layout and pages**

`src/components/Logo.tsx`:

```tsx
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-8 items-center justify-center rounded-full bg-primary font-jp text-sm text-primary-foreground">
        日
      </span>
      Nihongo Dojo
    </span>
  );
}
```

`src/features/auth/AuthLayout.tsx`:

```tsx
import { ReactNode } from 'react';

import { Logo } from '@/components/Logo';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div aria-hidden className="absolute -right-32 -bottom-32 size-[30rem] rounded-full border-[3rem] border-primary-foreground/10" />
        <div aria-hidden className="absolute -right-6 -bottom-6 size-64 rounded-full bg-primary-foreground/10" />
        <Logo className="relative [&>span]:bg-primary-foreground [&>span]:text-primary" />
        <p className="relative font-jp text-8xl font-bold leading-none [writing-mode:vertical-rl]">日本語</p>
        <p className="relative max-w-sm text-lg/relaxed text-primary-foreground/90">
          Learn JLPT N5 and N4 vocabulary and verb forms, one quiz at a time. Mistakes come back sooner.
        </p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Logo className="lg:hidden" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
```

`src/features/auth/LoginPage.tsx`:

```tsx
import { isAxiosError } from 'axios';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/api/errors';

import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (error) {
      toast.error(
        isAxiosError(error) && error.response?.status === 401
          ? 'Wrong username or password'
          : getErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="おかえり — welcome back" subtitle="Log in to continue your streak.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
```

`src/features/auth/RegisterPage.tsx`:

```tsx
import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/api/errors';
import { RegisterInput } from '@/lib/api/types';

import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

const FIELDS: { name: keyof RegisterInput; label: string; type: string; autoComplete: string; minLength?: number }[] = [
  { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password (6+ characters)', type: 'password', autoComplete: 'new-password', minLength: 6 },
];

export function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const [form, setForm] = useState<RegisterInput>({ name: '', username: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await register(form);
      toast.success('ようこそ! Your account is ready.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="はじめまして — nice to meet you" subtitle="Create an account to track your progress.">
      <form onSubmit={onSubmit} className="space-y-4">
        {FIELDS.map((field) => (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              minLength={field.minLength}
              required
              value={form[field.name]}
              onChange={(e) => setForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
            />
          </div>
        ))}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
```

- [ ] **Step 3: App layout and router**

`src/components/AppLayout.tsx`:

```tsx
import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';

import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/dictionary', label: 'Dictionary', end: false },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <NavLink to="/">
            <Logo />
          </NavLink>
          <nav className="flex gap-1 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn('rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground', isActive && 'bg-muted text-foreground')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.name}</span>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

`src/App.tsx`:

```tsx
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { AppLayout } from '@/components/AppLayout';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { RequireAuth } from '@/features/auth/RequireAuth';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [{ index: true, element: <p className="text-muted-foreground">Dashboard coming next…</p> }],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Verify build and the auth flow manually**

Run: `npm run build && npm run lint`. Expected: success.

With the API running (`npm run start:dev` in the backend) and `npm run dev`:
1. Open `/`. You are redirected to `/login`, and the split layout shows the vermilion panel on desktop width (≥1024px) and only the form on mobile width.
2. Register a new user. You land on `/` with your name in the header.
3. Log out, then log in with a wrong password. A toast says "Wrong username or password".
4. Stop the API and try to log in. A toast says "Cannot reach the server…".
5. **Refresh check (Review Focus #5):** set `JWT_ACCESS_TOKEN_EXP_IN_SEC=20` in the backend `.env`, restart the API, log in, wait 25 s and reload `/`. In DevTools → Network, the first `/users/me` returns 401, followed by exactly one `/auth/refresh-token` (200) and a successful retry. Then clear `nihongo.refreshToken` in localStorage, wait 25 s and reload. You are sent to `/login`. **Restore `JWT_ACCESS_TOKEN_EXP_IN_SEC=3600` afterwards.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add login, registration, protected layout and token refresh"
```

---

### Task 10: Dashboard

**Files:**
- Create: `src/components/EmptyState.tsx`, `src/features/dashboard/StatCard.tsx`, `src/features/dashboard/ModeCard.tsx`, `src/features/dashboard/DashboardPage.tsx`
- Modify: `src/App.tsx` (index route)

**Interfaces:**
- Consumes: `getSummary`, `useLevel`, `LEVELS`, `useAuth`.
- Produces: links to `/quiz/vocabulary?level=<L>` and `/quiz/verbs?level=<L>`, which Task 11 consumes. Query key `['summary', level]`, which Task 11 invalidates.

- [ ] **Step 1: Components**

`src/components/EmptyState.tsx`:

```tsx
import { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <p className="font-jp text-4xl text-muted-foreground">空</p>
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
```

`src/features/dashboard/StatCard.tsx`:

```tsx
import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

export function StatCard({ icon: Icon, label, value, footer }: { icon: LucideIcon; label: string; value: ReactNode; footer?: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {label}
          <Icon className="size-4 text-primary" />
        </div>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        {footer}
      </CardContent>
    </Card>
  );
}
```

`src/features/dashboard/ModeCard.tsx`:

```tsx
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function ModeCard({ kanji, title, description, to }: { kanji: string; title: string; description: string; to: string }) {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-lg">
      <span aria-hidden className="absolute -top-4 -right-2 font-jp text-8xl font-bold text-primary/10 transition-transform group-hover:scale-110">
        {kanji}
      </span>
      <CardContent className="relative space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild>
          <Link to={to}>
            Start <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

`src/features/dashboard/DashboardPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, Clock, Flame, Target } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-context';
import { getSummary } from '@/lib/api/endpoints';
import { getErrorMessage } from '@/lib/api/errors';
import { Level, LEVELS } from '@/lib/api/types';
import { useLevel } from '@/lib/level';

import { ModeCard } from './ModeCard';
import { StatCard } from './StatCard';

export function DashboardPage() {
  const { user } = useAuth();
  const [level, setLevel] = useLevel();
  const summary = useQuery({ queryKey: ['summary', level], queryFn: () => getSummary(level) });
  const data = summary.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-jp text-sm text-primary">おかえりなさい</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back{user ? `, ${user.name}` : ''}</h1>
        </div>
        <Tabs value={level} onValueChange={(value) => setLevel(value as Level)}>
          <TabsList>
            {LEVELS.map((l) => (
              <TabsTrigger key={l} value={l} className="px-4">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {summary.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {summary.isError && (
        <EmptyState title="Could not load your progress">
          <p>{getErrorMessage(summary.error)}</p>
          <Button variant="outline" className="mt-3" onClick={() => summary.refetch()}>
            Try again
          </Button>
        </EmptyState>
      )}

      {data && data.total === 0 && (
        <EmptyState title={`No ${level} words yet`}>
          Run <code className="rounded bg-muted px-1">npm run seed:words</code> in the API project.
        </EmptyState>
      )}

      {data && data.total > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={BookOpenCheck}
              label="Learned"
              value={
                <>
                  {data.learned}
                  <span className="text-base font-normal text-muted-foreground"> / {data.total}</span>
                </>
              }
              footer={<Progress value={(data.learned / data.total) * 100} />}
            />
            <StatCard icon={Clock} label="Due for review" value={data.dueToday} />
            <StatCard icon={Flame} label="Day streak" value={data.streakDays} />
            <StatCard
              icon={Target}
              label="Accuracy (7 days)"
              value={data.accuracy7d === null ? '—' : `${Math.round(data.accuracy7d * 100)}%`}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ModeCard
              kanji="単語"
              title="Vocabulary"
              description="Pick the right meaning. Words you miss come back sooner."
              to={`/quiz/vocabulary?level=${level}`}
            />
            <ModeCard
              kanji="動詞"
              title="Verb forms"
              description="Conjugate verbs into ます, て, ない and た forms."
              to={`/quiz/verbs?level=${level}`}
            />
          </div>
        </>
      )}
    </div>
  );
}
```

In `src/App.tsx`, replace the placeholder index element with `<DashboardPage />` (import it from `@/features/dashboard/DashboardPage`).

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`. Expected: success.
Manual: the dashboard shows skeletons and then 4 stat cards (total about 710 for N5, about 660 for N4). Switching N5/N4 refetches, and the level survives a reload. Stopping the API shows the error state with "Try again". At mobile width (375px) the cards stack with no horizontal scroll.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add dashboard with level switch and progress stats"
```

---

### Task 11: Quiz flow (vocabulary + verbs) and result screen ← minimum viable demo

**Files:**
- Create: `src/features/quiz/labels.ts`, `src/features/quiz/QuestionCard.tsx`, `src/features/quiz/OptionButton.tsx`, `src/features/quiz/QuizResult.tsx`, `src/features/quiz/QuizSession.tsx`, `src/features/quiz/QuizPage.tsx`
- Modify: `src/App.tsx` (route `quiz/:type`)

**Interfaces:**
- Consumes: `getQuiz`, `submitAnswer`, `parseLevel`, `getErrorMessage`, types (Task 8); query key `['summary', level]` (Task 10).
- Produces: route `/quiz/:type` where `type ∈ {vocabulary, verbs}`, with `?level=N5|N4`.

- [ ] **Step 1: Labels and presentational components**

`src/features/quiz/labels.ts`:

```ts
import { QuizType, VerbForm } from '@/lib/api/types';

export const ROUTE_TO_QUIZ_TYPE: Record<string, QuizType> = {
  vocabulary: 'vocabulary',
  verbs: 'verb',
};

export const QUIZ_TITLES: Record<QuizType, string> = {
  vocabulary: 'Vocabulary',
  verb: 'Verb forms',
};

export const FORM_LABELS: Record<VerbForm, { jp: string; en: string }> = {
  masu: { jp: 'ます形', en: 'polite' },
  te: { jp: 'て形', en: 'te-form' },
  nai: { jp: 'ない形', en: 'negative' },
  ta: { jp: 'た形', en: 'past' },
};

export function resultMessage(ratio: number): { jp: string; en: string } {
  if (ratio >= 0.9) return { jp: '素晴らしい！', en: 'Excellent!' };
  if (ratio >= 0.6) return { jp: 'いいね！', en: 'Nice work!' };
  return { jp: '頑張って！', en: 'Keep going — mistakes come back sooner.' };
}
```

`src/features/quiz/QuestionCard.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';
import { Question, QuizType } from '@/lib/api/types';

import { FORM_LABELS } from './labels';

export function QuestionCard({ question, quizType }: { question: Question; quizType: QuizType }) {
  const form = question.form ? FORM_LABELS[question.form] : null;
  return (
    <div key={question.wordId} className="flex animate-in flex-col items-center gap-3 py-10 fade-in slide-in-from-bottom-2">
      <p className="text-sm text-muted-foreground">
        {quizType === 'vocabulary' ? 'What does this word mean?' : 'Choose the correct form'}
      </p>
      <p className="h-7 font-jp text-lg text-muted-foreground">{question.kanji ? question.kana : ''}</p>
      <p className="font-jp text-6xl font-bold tracking-wide sm:text-7xl">{question.kanji ?? question.kana}</p>
      {form && (
        <Badge className="mt-2 px-3 py-1 text-sm">
          <span className="font-jp">{form.jp}</span>&nbsp;· {form.en}
        </Badge>
      )}
    </div>
  );
}
```

`src/features/quiz/OptionButton.tsx`:

```tsx
import { cn } from '@/lib/utils';

export type OptionState = 'idle' | 'pending' | 'correct' | 'wrong' | 'dimmed';

const STATE_CLASSES: Record<OptionState, string> = {
  idle: 'hover:border-primary hover:bg-primary/5',
  pending: 'border-primary bg-primary/10',
  correct: 'animate-pop border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  wrong: 'animate-shake border-red-500 bg-red-500/15 text-red-800 dark:text-red-300',
  dimmed: 'opacity-50',
};

export function OptionButton({
  index,
  label,
  state,
  japanese,
  disabled,
  onClick,
}: {
  index: number;
  label: string;
  state: OptionState;
  japanese: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-16 items-center gap-3 rounded-xl border-2 bg-card p-4 text-left font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        japanese ? 'font-jp text-xl' : 'text-base',
        STATE_CLASSES[state],
      )}
    >
      <kbd className="hidden rounded-md border bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground sm:inline">{index + 1}</kbd>
      {label}
    </button>
  );
}
```

`src/features/quiz/QuizResult.tsx`:

```tsx
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Question } from '@/lib/api/types';

import { resultMessage } from './labels';

export interface Mistake {
  question: Question;
  chosen: string;
  correctAnswer: string;
}

export function QuizResult({ correct, total, mistakes, onRestart }: { correct: number; total: number; mistakes: Mistake[]; onRestart: () => void }) {
  const message = resultMessage(total === 0 ? 0 : correct / total);
  return (
    <div className="mx-auto max-w-xl animate-in space-y-6 fade-in zoom-in-95">
      <Card>
        <CardContent className="space-y-2 py-6 text-center">
          <p className="font-jp text-3xl font-bold text-primary">{message.jp}</p>
          <p className="text-muted-foreground">{message.en}</p>
          <p className="pt-2 text-5xl font-semibold tabular-nums">
            {correct}
            <span className="text-2xl text-muted-foreground"> / {total}</span>
          </p>
        </CardContent>
      </Card>

      {mistakes.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Review your mistakes</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {mistakes.map((m) => (
              <li key={m.question.wordId} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                <span className="font-jp text-xl">
                  {m.question.kanji ?? m.question.kana}
                  {m.question.kanji && <span className="ml-2 text-sm text-muted-foreground">{m.question.kana}</span>}
                </span>
                <span className="text-sm">
                  <span className="text-red-600 line-through dark:text-red-400">{m.chosen}</span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">{m.correctAnswer}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <Button className="flex-1" onClick={onRestart}>
          Play again
        </Button>
        <Button variant="outline" className="flex-1" asChild>
          <Link to="/">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Session logic and page**

`src/features/quiz/QuizSession.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { submitAnswer } from '@/lib/api/endpoints';
import { getErrorMessage } from '@/lib/api/errors';
import { AnswerResult, Level, Question, QuizType } from '@/lib/api/types';

import { QUIZ_TITLES } from './labels';
import { OptionButton, OptionState } from './OptionButton';
import { QuestionCard } from './QuestionCard';
import { Mistake, QuizResult } from './QuizResult';

const ADVANCE_DELAY_MS = { correct: 900, wrong: 1800 };

export function QuizSession({ quizType, level, questions, onRestart }: { quizType: QuizType; level: Level; questions: Question[]; onRestart: () => void }) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);

  const question = questions[index] as Question | undefined;
  const finished = index >= questions.length;

  const answer = useMutation({
    mutationFn: submitAnswer,
    onSuccess: (res, variables) => {
      setResult(res);
      if (res.isCorrect) {
        setCorrectCount((c) => c + 1);
      } else if (question) {
        setMistakes((list) => [...list, { question, chosen: variables.answer, correctAnswer: res.correctAnswer }]);
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setSelected(null);
    },
  });

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(
      () => {
        setResult(null);
        setSelected(null);
        setIndex((i) => i + 1);
      },
      result.isCorrect ? ADVANCE_DELAY_MS.correct : ADVANCE_DELAY_MS.wrong,
    );
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (finished) {
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    }
  }, [finished, queryClient]);

  const choose = useCallback(
    (option: string) => {
      if (!question || selected !== null) return;
      setSelected(option);
      answer.mutate({ quizType, wordId: question.wordId, answer: option, form: question.form });
    },
    [answer, question, quizType, selected],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (question && Number.isInteger(n) && n >= 1 && n <= question.options.length) {
        choose(question.options[n - 1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choose, question]);

  if (finished || !question) {
    return <QuizResult correct={correctCount} total={questions.length} mistakes={mistakes} onRestart={onRestart} />;
  }

  const stateOf = (option: string): OptionState => {
    if (!result) return selected === option ? 'pending' : 'idle';
    if (option === result.correctAnswer) return 'correct';
    if (option === selected) return 'wrong';
    return 'dimmed';
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Badge variant="outline">{level}</Badge>
        <span className="text-sm font-medium">{QUIZ_TITLES[quizType]}</span>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {index + 1} / {questions.length}
        </span>
      </div>
      <Progress value={(index / questions.length) * 100} />
      <QuestionCard question={question} quizType={quizType} />
      <div className="grid gap-3 sm:grid-cols-2">
        {question.options.map((option, i) => (
          <OptionButton
            key={option}
            index={i}
            label={option}
            state={stateOf(option)}
            japanese={quizType === 'verb'}
            disabled={selected !== null}
            onClick={() => choose(option)}
          />
        ))}
      </div>
      <p className="hidden text-center text-xs text-muted-foreground sm:block">Tip: press 1–4 to answer</p>
    </div>
  );
}
```

`src/features/quiz/QuizPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getQuiz } from '@/lib/api/endpoints';
import { getErrorMessage } from '@/lib/api/errors';
import { parseLevel } from '@/lib/level';

import { ROUTE_TO_QUIZ_TYPE } from './labels';
import { QuizSession } from './QuizSession';

export function QuizPage() {
  const { type = '' } = useParams();
  const [searchParams] = useSearchParams();
  const level = parseLevel(searchParams.get('level'));
  const quizType = ROUTE_TO_QUIZ_TYPE[type];
  const [round, setRound] = useState(0);

  const quiz = useQuery({
    queryKey: ['quiz', quizType, level, round],
    queryFn: () => getQuiz(quizType, level),
    enabled: quizType !== undefined,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (!quizType) {
    return <Navigate to="/" replace />;
  }

  if (quiz.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="mx-auto h-40 w-64" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (quiz.isError) {
    return (
      <EmptyState title="Could not load the quiz">
        <p>{getErrorMessage(quiz.error)}</p>
        <Button variant="outline" className="mt-3" onClick={() => quiz.refetch()}>
          Try again
        </Button>
      </EmptyState>
    );
  }

  if (quiz.data.length === 0) {
    return (
      <EmptyState title={`No ${level} words to practise yet`}>
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          Back to dashboard
        </Link>
      </EmptyState>
    );
  }

  return (
    <QuizSession
      key={round}
      quizType={quizType}
      level={level}
      questions={quiz.data}
      onRestart={() => setRound((r) => r + 1)}
    />
  );
}
```

In `src/App.tsx`, add `{ path: 'quiz/:type', element: <QuizPage /> }` to the `AppLayout` children.

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`. Expected: success.

Manual, with the API running:
1. Dashboard → Vocabulary → Start. You see 10 questions, a big word with furigana, and 4 options.
2. A correct answer turns green with a pop and advances after about 1 s. A wrong answer shakes red, highlights the right option in green, and advances after about 2 s. Keys 1–4 work. Double-clicking does not send two answers (check the Network tab).
3. The result screen shows the score and mistakes. "Play again" loads a new set. Back on the dashboard the stats have changed (accuracy, streak = 1).
4. Dashboard → Verb forms. Options are in Japanese with a form badge such as 「て形 · te-form」.
5. Open `/quiz/kanji`. You are redirected to the dashboard.
6. Phone width (375px): options stack in one column, and the word is still fully visible.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add vocabulary and verb quiz with feedback and result screen"
```

---

### Task 12: Polish (dark mode toggle, dictionary page)

**Files:**
- Create: `src/components/ThemeToggle.tsx`, `src/features/dictionary/DictionaryPage.tsx`
- Modify: `src/components/AppLayout.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `next-themes` provider (Task 8), `getWords`, `useLevel`, `LEVELS` (Task 8), `EmptyState` (Task 10).

- [ ] **Step 1: Theme toggle**

`src/components/ThemeToggle.tsx`:

```tsx
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setTheme(isDark ? 'light' : 'dark')}>
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
```

In `AppLayout.tsx`, render `<ThemeToggle />` right before the log-out button.

- [ ] **Step 2: Dictionary page**

`src/features/dictionary/DictionaryPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getWords } from '@/lib/api/endpoints';
import { getErrorMessage } from '@/lib/api/errors';
import { Level, LEVELS } from '@/lib/api/types';
import { useLevel } from '@/lib/level';

export function DictionaryPage() {
  const [level, setLevel] = useLevel();
  const [search, setSearch] = useState('');
  const words = useQuery({ queryKey: ['words', level], queryFn: () => getWords(level), staleTime: Infinity });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!words.data || !needle) return words.data ?? [];
    return words.data.filter((w) =>
      [w.kanji ?? '', w.kana, w.romaji, w.meaningEn].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [words.data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-jp text-sm text-primary">辞書</p>
          <h1 className="text-3xl font-semibold tracking-tight">Dictionary</h1>
        </div>
        <Tabs value={level} onValueChange={(value) => setLevel(value as Level)}>
          <TabsList>
            {LEVELS.map((l) => (
              <TabsTrigger key={l} value={l} className="px-4">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Input placeholder="Search kanji, kana, romaji or meaning…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {words.isPending && <Skeleton className="h-96 rounded-xl" />}
      {words.isError && <EmptyState title="Could not load words">{getErrorMessage(words.error)}</EmptyState>}
      {words.data && filtered.length === 0 && <EmptyState title="No matching words" />}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Word</TableHead>
                <TableHead className="hidden sm:table-cell">Romaji</TableHead>
                <TableHead>Meaning</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-jp text-lg">
                    {w.kanji ?? w.kana}
                    {w.kanji && <span className="ml-2 text-sm text-muted-foreground">{w.kana}</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{w.romaji}</TableCell>
                  <TableCell className="whitespace-normal">{w.meaningEn}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary">{w.partOfSpeech}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Vocabulary: JLPT lists by Jonathan Waller (tanos.co.uk), CC BY.
      </p>
    </div>
  );
}
```

In `src/App.tsx`, add `{ path: 'dictionary', element: <DictionaryPage /> }` to the `AppLayout` children.

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`. Expected: success.
Manual: the theme toggle switches the whole app (dashboard, quiz, result) to dark mode, and green/red feedback stays readable. Searching "eat" or "たべ" in the dictionary filters rows. At phone width the table has no horizontal page scroll (the table scrolls inside its card).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add dark mode toggle and searchable dictionary"
```

---

### Task 13: Demo readiness

**Files:**
- Create: `nihongo-web/README.md`
- Modify: backend `README.md` (short "Nihongo quiz" section)

- [ ] **Step 1: Write the run instructions**

`nihongo-web/README.md`:

````markdown
# Nihongo Dojo

JLPT N5/N4 vocabulary and verb-conjugation quizzes with Leitner spaced repetition.
Frontend for the NestJS API in `../nestjs-starter-rest-api` (branch `feature/nihongo-quiz`).

## Run

```bash
# API
cd ../nestjs-starter-rest-api
colima start
docker compose up -d pgsqldb
npm run migration:run
npm run seed:words      # once
npm run start:dev       # http://localhost:3000/swagger

# Web
cd ../nihongo-web
npm install
npm run dev             # http://localhost:5173
```

## Roadmap

- Grammar exercises per Minna no Nihongo lesson (particles, fill-in forms)
- Import personal word lists by Minna lesson (the `lesson` column already exists)
- SM-2 scheduling with "easy / hard" grading
- AI-generated example sentences and exercises
- Admin UI for content

Vocabulary data: JLPT lists by Jonathan Waller (tanos.co.uk), CC BY.
````

In the backend `README.md`, add a short section listing the three modules, `npm run seed:words`, and the link to the spec and plan.

- [ ] **Step 2: Full run-through from a cold start**

```bash
colima stop && colima start
cd /Users/aray_muratova/Desktop/projects/nestjs-starter-rest-api
docker compose up -d pgsqldb && npm run start:dev
# in another terminal
cd /Users/aray_muratova/Desktop/projects/nihongo-web && npm run dev
```

Walk through the demo script: Swagger (vocabulary / progress / quiz) → register a fresh demo user → dashboard → 10 vocabulary questions (miss one on purpose) → result → dashboard stats updated → verb quiz → dictionary search → dark mode.
Expected: no console errors in the browser, no 500s in the API log.

- [ ] **Step 3: Commit both repos**

```bash
cd /Users/aray_muratova/Desktop/projects/nihongo-web && git add -A && git commit -m "docs: add run instructions and roadmap"
cd /Users/aray_muratova/Desktop/projects/nestjs-starter-rest-api && git add README.md && git commit -m "docs: describe nihongo quiz modules"
```
