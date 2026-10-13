# Grammar Exercises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill-in-the-blank grammar quizzes grouped by Minna no Nihongo lesson (34–37 plus N5 showcase topics). They come with spaced repetition, an immediate rule on mistakes, and EN/RU UI.

**Architecture:** A new NestJS module `src/grammar` holds the content tables, seed, quiz selection and the answer endpoint. Exercise progress lives in the progress module (`UserExerciseProgress`, `ProgressService.recordExerciseAnswer`) next to word progress, and `answer_log` gains a nullable `exerciseId` so streak and accuracy include grammar. The frontend adds a lessons page and a `GrammarSession`, reusing `OptionButton`, `QuizResult` and the i18n dictionaries.

**Tech Stack:** NestJS 11, TypeORM 0.3, Postgres, Jest. React + TanStack Query + shadcn (Base UI), own i18n, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-grammar-exercises-design.md`

## Global Constraints

- Branches: `feature/grammar` in both repos. Merge targets later: backend `feature/nihongo-quiz`, frontend `main`.
- Blank marker: exactly one `＿＿` (two U+FF3F) per sentence.
- Each exercise has 1 answer and 3 distractors, all 4 unique and non-empty, plus EN and RU translations. Each point has at least 5 exercises.
- Lesson numbers are approximate ("≈"). A point covers lessons [lesson, lessonTo ?? lesson].
- Quiz `count`: 1–20, default 10. `lesson`: an integer 1–50 or `all` (default `all`).
- Answer check: exact match after trim. Answer length is 1–100.
- The answer is never sent before answering. The rule is returned only by `POST /grammar/answer`.
- `QuizType` gains `grammar`. The word endpoints (`POST /quiz/answer`, `POST /explanations`) must keep rejecting it (400).
- Streak and 7-day accuracy include grammar answers. Learned/due/total stay vocabulary-only.
- Every new UI string goes into both `en.ts` and `ru.ts`.

## Review Focus

1. **Ambiguous exercises**: a distractor that is also grammatical would mark a correct learner answer as wrong. Content was written to avoid this (forms that cannot fit, or particles that cannot fit). The reviewer should read every exercise with that in mind. Pinned in Task 1 (the seed validator catches structural issues; the meaning check is the reviewer's).
2. **A range lesson**: `?lesson=3` must return the 1–10 particle exercises. Pinned in Task 4 (e2e).
3. **`quizType: 'grammar'` sent to the word endpoints** must return 400, not 500 and not a silently wrong check. Pinned in Task 2 (DTO change) and Task 4 (e2e).
4. **The `answer_log` migration on an existing DB with data**: `wordId` becomes nullable without losing rows, and down-migration does not fail on grammar rows. Pinned in Task 2 (migration run on the dev DB, which has real rows).
5. **Enter on a focused button in the grammar mistake panel** must advance exactly one question (same rule as the vocabulary panel). Pinned in Task 6 (manual check).

---

### Task 1: Content and seed validation

**Files:**
- Create: `src/grammar/seed/grammar.json`
- Create: `src/grammar/seed/grammar-seed.ts`
- Test: `src/grammar/seed/grammar-seed.spec.ts`

**Interfaces:**
- Produces:
  - `BLANK = '＿＿'`, `MIN_EXERCISES_PER_POINT = 5`
  - `interface GrammarExerciseSeed { sentence; answer; distractors: string[]; translationEn; translationRu }`
  - `interface GrammarPointSeed { code; lesson: number; lessonTo: number | null; level: JlptLevel; title; ruleEn; ruleRu; exercises: GrammarExerciseSeed[] }`
  - `loadGrammarSeed(text: string): GrammarPointSeed[]`, `grammarSeedFilePath(): string`, `validateGrammarSeed(points): string[]` (an empty array means valid)

- [ ] **Step 1: Write the failing test**

`src/grammar/seed/grammar-seed.spec.ts`:

```ts
import * as fs from 'fs';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import {
  GrammarPointSeed,
  grammarSeedFilePath,
  loadGrammarSeed,
  validateGrammarSeed,
} from './grammar-seed';

const exercise = (sentence: string, answer = 'は', distractors = ['を', 'に', 'で']) => ({
  sentence,
  answer,
  distractors,
  translationEn: 'en',
  translationRu: 'ru',
});

const point = (overrides: Partial<GrammarPointSeed> = {}): GrammarPointSeed => ({
  code: 'p1',
  lesson: 1,
  lessonTo: null,
  level: JlptLevel.N5,
  title: 'は',
  ruleEn: 'rule',
  ruleRu: 'правило',
  exercises: ['あ', 'い', 'う', 'え', 'お'].map((k) => exercise(`${k}＿＿です。`)),
  ...overrides,
});

describe('validateGrammarSeed', () => {
  it('accepts a valid point', () => {
    expect(validateGrammarSeed([point()])).toEqual([]);
  });

  it('reports structural problems', () => {
    const bad = point({
      exercises: [
        exercise('ブランクなし。'),
        exercise('＿＿と＿＿。'),
        exercise('あ＿＿。', 'は', ['は', 'に', 'で']),
        exercise('い＿＿。', 'は', ['を', 'に']),
        { ...exercise('う＿＿。'), translationRu: ' ' },
      ],
    });
    const errors = validateGrammarSeed([bad, point()]);
    expect(errors).toEqual(
      expect.arrayContaining([
        'p1#1: must contain exactly one ＿＿',
        'p1#2: must contain exactly one ＿＿',
        'p1#3: answer and distractors must be 4 unique non-empty options',
        'p1#4: needs exactly 3 distractors',
        'p1#5: missing translation',
        'p1: duplicate code',
      ]),
    );
  });

  it('requires enough exercises and a sane lesson range', () => {
    const errors = validateGrammarSeed([
      point({ exercises: [exercise('あ＿＿。')], lesson: 5, lessonTo: 3 }),
    ]);
    expect(errors).toEqual(
      expect.arrayContaining(['p1: needs at least 5 exercises', 'p1: lessonTo must be >= lesson']),
    );
  });
});

describe('the real grammar.json', () => {
  const points = loadGrammarSeed(fs.readFileSync(grammarSeedFilePath(), 'utf8'));

  it('is valid', () => {
    expect(validateGrammarSeed(points)).toEqual([]);
  });

  it('covers the planned topics', () => {
    expect(points.map((p) => p.code)).toEqual([
      'n5-particles',
      'l14-te-forms',
      'l19-ta-koto',
      'l34-toori-ato',
      'l35-ba-nara',
      'l36-you-ni',
      'l37-passive',
    ]);
    expect(points.reduce((sum, p) => sum + p.exercises.length, 0)).toBeGreaterThanOrEqual(50);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- grammar-seed`
Expected: FAIL, `Cannot find module './grammar-seed'`.

- [ ] **Step 3: Implement**

`src/grammar/seed/grammar-seed.ts`:

```ts
import * as path from 'path';

import { JlptLevel } from '../../vocabulary/constants/word.constant';

export const BLANK = '＿＿';
export const MIN_EXERCISES_PER_POINT = 5;

export interface GrammarExerciseSeed {
  sentence: string;
  answer: string;
  distractors: string[];
  translationEn: string;
  translationRu: string;
}

export interface GrammarPointSeed {
  code: string;
  lesson: number;
  lessonTo: number | null;
  level: JlptLevel;
  title: string;
  ruleEn: string;
  ruleRu: string;
  exercises: GrammarExerciseSeed[];
}

export function grammarSeedFilePath(): string {
  return path.join(__dirname, 'grammar.json');
}

export function loadGrammarSeed(text: string): GrammarPointSeed[] {
  return (JSON.parse(text) as { points: GrammarPointSeed[] }).points;
}

const isBlank = (text: string | undefined) => !text || text.trim() === '';

export function validateGrammarSeed(points: GrammarPointSeed[]): string[] {
  const errors: string[] = [];
  const codes = new Set<string>();

  for (const point of points) {
    if (codes.has(point.code)) errors.push(`${point.code}: duplicate code`);
    codes.add(point.code);
    if (isBlank(point.title) || isBlank(point.ruleEn) || isBlank(point.ruleRu)) {
      errors.push(`${point.code}: missing title or rule`);
    }
    if (point.lessonTo !== null && point.lessonTo < point.lesson) {
      errors.push(`${point.code}: lessonTo must be >= lesson`);
    }
    if (point.exercises.length < MIN_EXERCISES_PER_POINT) {
      errors.push(`${point.code}: needs at least ${MIN_EXERCISES_PER_POINT} exercises`);
    }

    const sentences = new Set<string>();
    point.exercises.forEach((exercise, i) => {
      const label = `${point.code}#${i + 1}`;
      if (exercise.sentence.split(BLANK).length !== 2) {
        errors.push(`${label}: must contain exactly one ${BLANK}`);
      }
      if (sentences.has(exercise.sentence)) errors.push(`${label}: duplicate sentence`);
      sentences.add(exercise.sentence);
      if (exercise.distractors.length !== 3) {
        errors.push(`${label}: needs exactly 3 distractors`);
      } else {
        const options = [exercise.answer, ...exercise.distractors].map((o) => o.trim());
        if (options.some((o) => o === '') || new Set(options).size !== 4) {
          errors.push(`${label}: answer and distractors must be 4 unique non-empty options`);
        }
      }
      if (isBlank(exercise.translationEn) || isBlank(exercise.translationRu)) {
        errors.push(`${label}: missing translation`);
      }
    });
  }
  return errors;
}
```

`src/grammar/seed/grammar.json`:

```json
{
  "points": [
    {
      "code": "n5-particles",
      "lesson": 1,
      "lessonTo": 10,
      "level": "N5",
      "title": "は・が・を・に・で・と",
      "ruleEn": "は marks the topic; が marks the subject (also with あります/います and 好き/わかります); を marks the direct object; に marks a point in time or a destination; で marks where an action happens or the means (by bus); と means 'together with'.",
      "ruleRu": "は выделяет тему; が — подлежащее (а также с あります/います и 好き/わかります); を — прямое дополнение; に — момент времени или пункт назначения; で — место действия или способ (на автобусе); と — «вместе с».",
      "exercises": [
        { "sentence": "わたし＿＿学生です。", "answer": "は", "distractors": ["を", "に", "で"], "translationEn": "I am a student.", "translationRu": "Я студент." },
        { "sentence": "毎朝 パン＿＿食べます。", "answer": "を", "distractors": ["に", "で", "へ"], "translationEn": "I eat bread every morning.", "translationRu": "Каждое утро я ем хлеб." },
        { "sentence": "明日 京都＿＿行きます。", "answer": "に", "distractors": ["を", "で", "が"], "translationEn": "Tomorrow I will go to Kyoto.", "translationRu": "Завтра я поеду в Киото." },
        { "sentence": "図書館＿＿本を読みます。", "answer": "で", "distractors": ["に", "を", "が"], "translationEn": "I read books at the library.", "translationRu": "Я читаю книги в библиотеке." },
        { "sentence": "友達＿＿映画を見ました。", "answer": "と", "distractors": ["を", "に", "へ"], "translationEn": "I watched a film with a friend.", "translationRu": "Я посмотрел фильм с другом." },
        { "sentence": "机の上に 本＿＿あります。", "answer": "が", "distractors": ["を", "で", "へ"], "translationEn": "There is a book on the desk.", "translationRu": "На столе лежит книга." },
        { "sentence": "バス＿＿会社へ行きます。", "answer": "で", "distractors": ["を", "に", "が"], "translationEn": "I go to the office by bus.", "translationRu": "Я езжу на работу на автобусе." },
        { "sentence": "7時＿＿起きます。", "answer": "に", "distractors": ["で", "を", "が"], "translationEn": "I get up at 7 o'clock.", "translationRu": "Я встаю в 7 часов." },
        { "sentence": "わたしは 日本料理＿＿好きです。", "answer": "が", "distractors": ["を", "に", "で"], "translationEn": "I like Japanese food.", "translationRu": "Мне нравится японская кухня." }
      ]
    },
    {
      "code": "l14-te-forms",
      "lesson": 14,
      "lessonTo": 15,
      "level": "N5",
      "title": "〜てください・〜ています・〜てもいいです",
      "ruleEn": "Use the て-form: 〜てください asks someone to do something, 〜ています describes an action in progress (or a state), 〜てもいいです gives or asks for permission.",
      "ruleRu": "Используйте て-форму: 〜てください — вежливая просьба, 〜ています — действие в процессе (или состояние), 〜てもいいです — разрешение («можно»).",
      "exercises": [
        { "sentence": "ここに 名前を＿＿ください。", "answer": "書いて", "distractors": ["書き", "書く", "書いた"], "translationEn": "Please write your name here.", "translationRu": "Пожалуйста, напишите здесь своё имя." },
        { "sentence": "今 雨が＿＿います。", "answer": "降って", "distractors": ["降り", "降る", "降った"], "translationEn": "It is raining now.", "translationRu": "Сейчас идёт дождь." },
        { "sentence": "写真を＿＿もいいですか。", "answer": "撮って", "distractors": ["撮り", "撮る", "撮った"], "translationEn": "May I take a photo?", "translationRu": "Можно сфотографировать?" },
        { "sentence": "ちょっと＿＿ください。", "answer": "待って", "distractors": ["待ち", "待つ", "待った"], "translationEn": "Please wait a moment.", "translationRu": "Подождите, пожалуйста, минутку." },
        { "sentence": "田中さんは 今 電話を＿＿います。", "answer": "かけて", "distractors": ["かけ", "かける", "かけた"], "translationEn": "Mr Tanaka is on the phone now.", "translationRu": "Танака-сан сейчас разговаривает по телефону." },
        { "sentence": "この部屋で たばこを＿＿もいいです。", "answer": "吸って", "distractors": ["吸い", "吸う", "吸った"], "translationEn": "You may smoke in this room.", "translationRu": "В этой комнате можно курить." },
        { "sentence": "もう一度 ＿＿ください。", "answer": "言って", "distractors": ["言い", "言う", "言った"], "translationEn": "Please say it once more.", "translationRu": "Скажите, пожалуйста, ещё раз." },
        { "sentence": "子どもたちは 公園で＿＿います。", "answer": "遊んで", "distractors": ["遊び", "遊ぶ", "遊んだ"], "translationEn": "The children are playing in the park.", "translationRu": "Дети играют в парке." }
      ]
    },
    {
      "code": "l19-ta-koto",
      "lesson": 19,
      "lessonTo": null,
      "level": "N5",
      "title": "〜たことがあります",
      "ruleEn": "た-form + ことがあります talks about past experience: 'I have done it (at least once)'. The negative 〜たことがありません means 'I have never done it'.",
      "ruleRu": "た-форма + ことがあります — опыт в прошлом: «мне доводилось…». Отрицание 〜たことがありません — «никогда не…».",
      "exercises": [
        { "sentence": "富士山に＿＿ことがあります。", "answer": "登った", "distractors": ["登って", "登ります", "登ろう"], "translationEn": "I have climbed Mt Fuji.", "translationRu": "Я поднимался на Фудзи." },
        { "sentence": "着物を＿＿ことがありません。", "answer": "着た", "distractors": ["着て", "着ます", "着よう"], "translationEn": "I have never worn a kimono.", "translationRu": "Я никогда не надевала кимоно." },
        { "sentence": "北海道へ＿＿ことがありますか。", "answer": "行った", "distractors": ["行って", "行きます", "行こう"], "translationEn": "Have you ever been to Hokkaido?", "translationRu": "Вы когда-нибудь были на Хоккайдо?" },
        { "sentence": "馬に＿＿ことがあります。", "answer": "乗った", "distractors": ["乗って", "乗ります", "乗ろう"], "translationEn": "I have ridden a horse.", "translationRu": "Мне доводилось ездить на лошади." },
        { "sentence": "日本の映画を＿＿ことがありますか。", "answer": "見た", "distractors": ["見て", "見ます", "見よう"], "translationEn": "Have you ever seen a Japanese film?", "translationRu": "Вы когда-нибудь смотрели японский фильм?" },
        { "sentence": "納豆を＿＿ことがありますか。", "answer": "食べた", "distractors": ["食べて", "食べます", "食べよう"], "translationEn": "Have you ever eaten natto?", "translationRu": "Вы когда-нибудь пробовали натто?" }
      ]
    },
    {
      "code": "l34-toori-ato",
      "lesson": 34,
      "lessonTo": null,
      "level": "N4",
      "title": "〜とおりに・〜たあとで",
      "ruleEn": "〜とおりに means 'exactly as': Vた + とおりに or Nの + とおりに (説明書のとおりに). 〜たあとで means 'after doing': always the た-form (or Nの + あとで).",
      "ruleRu": "〜とおりに — «точно так, как»: Vた + とおりに или Nの + とおりに (説明書のとおりに). 〜たあとで — «после того как»: всегда た-форма (или Nの + あとで).",
      "exercises": [
        { "sentence": "説明書の＿＿に 組み立ててください。", "answer": "とおり", "distractors": ["あと", "まえ", "あいだ"], "translationEn": "Please assemble it as the manual says.", "translationRu": "Соберите, пожалуйста, как написано в инструкции." },
        { "sentence": "先生が＿＿とおりに、発音してください。", "answer": "言った", "distractors": ["言って", "言い", "言わ"], "translationEn": "Please pronounce it the way the teacher said.", "translationRu": "Произнесите так, как сказал учитель." },
        { "sentence": "仕事が＿＿あとで、飲みに行きませんか。", "answer": "終わった", "distractors": ["終わる", "終わって", "終わり"], "translationEn": "Shall we go for a drink after work?", "translationRu": "Не сходить ли нам выпить после работы?" },
        { "sentence": "食事の＿＿で、薬を飲んでください。", "answer": "あと", "distractors": ["とおり", "ため", "ながら"], "translationEn": "Please take the medicine after meals.", "translationRu": "Принимайте лекарство после еды." },
        { "sentence": "地図の＿＿に 行ったら、すぐ駅に着きました。", "answer": "とおり", "distractors": ["あと", "まえ", "あいだ"], "translationEn": "I followed the map and got to the station right away.", "translationRu": "Я пошёл по карте и сразу вышел к станции." },
        { "sentence": "シャワーを＿＿あとで、寝ます。", "answer": "浴びた", "distractors": ["浴びる", "浴びて", "浴び"], "translationEn": "I go to bed after taking a shower.", "translationRu": "Я ложусь спать после душа." },
        { "sentence": "宿題を＿＿あとで、テレビを見ます。", "answer": "した", "distractors": ["する", "して", "し"], "translationEn": "I'll watch TV after doing my homework.", "translationRu": "Я посмотрю телевизор после того, как сделаю домашнее задание." }
      ]
    },
    {
      "code": "l35-ba-nara",
      "lesson": 35,
      "lessonTo": null,
      "level": "N4",
      "title": "〜ば・〜なら",
      "ruleEn": "〜ば means 'if'. Verbs change the final -u to -eba (押す→押せば, ある→あれば); い-adjectives change 〜い to 〜ければ (安い→安ければ, いい→よければ). N + なら means 'if it's about N' and picks up the other person's topic to give advice.",
      "ruleRu": "〜ば — «если». У глаголов конечное -u меняется на -eba (押す→押せば, ある→あれば); у い-прилагательных 〜い → 〜ければ (安い→安ければ, いい→よければ). N + なら — «если речь о N»: подхватывает тему собеседника, чтобы дать совет.",
      "exercises": [
        { "sentence": "雨が＿＿、試合は中止です。", "answer": "降れば", "distractors": ["降るば", "降りば", "降れ"], "translationEn": "If it rains, the match will be cancelled.", "translationRu": "Если пойдёт дождь, матч отменят." },
        { "sentence": "もう少し＿＿、買います。", "answer": "安ければ", "distractors": ["安いば", "安くば", "安かれば"], "translationEn": "If it were a bit cheaper, I would buy it.", "translationRu": "Если бы было чуть дешевле, я бы купила." },
        { "sentence": "このボタンを＿＿、ドアが開きます。", "answer": "押せば", "distractors": ["押すば", "押しば", "押さば"], "translationEn": "If you press this button, the door opens.", "translationRu": "Если нажать эту кнопку, дверь откроется." },
        { "sentence": "時間が＿＿、手伝います。", "answer": "あれば", "distractors": ["あるば", "ありば", "あれ"], "translationEn": "If I have time, I'll help.", "translationRu": "Если будет время, я помогу." },
        { "sentence": "天気が＿＿、山に登りましょう。", "answer": "よければ", "distractors": ["いいば", "よいば", "いければ"], "translationEn": "If the weather is good, let's climb the mountain.", "translationRu": "Если будет хорошая погода, поднимемся в горы." },
        { "sentence": "パソコン＿＿、秋葉原がいいですよ。", "answer": "なら", "distractors": ["が", "を", "ば"], "translationEn": "If it's a computer you want, Akihabara is good.", "translationRu": "Если вам нужен компьютер, то лучше в Акихабару." },
        { "sentence": "温泉に入る＿＿、箱根がいいですよ。", "answer": "なら", "distractors": ["が", "を", "ば"], "translationEn": "If you want to go to a hot spring, Hakone is good.", "translationRu": "Если хотите в онсэн, советую Хаконэ." }
      ]
    },
    {
      "code": "l36-you-ni",
      "lesson": 36,
      "lessonTo": null,
      "level": "N4",
      "title": "〜ように・〜ようになります・〜ようにします",
      "ruleEn": "Plain non-past or ない-form (often potential) + ように means 'so that…'. 〜ようになります means 'come to (be able to) do', a change. 〜ようにします / 〜ようにしています means 'make an effort / make a habit of doing'.",
      "ruleRu": "Простая форма настоящего времени или ない-форма (часто потенциальная) + ように — «чтобы…». 〜ようになります — «стать способным / начать делать» (изменение). 〜ようにします / 〜ようにしています — «стараться / взять за привычку».",
      "exercises": [
        { "sentence": "日本語が＿＿ように、毎日練習しています。", "answer": "上手になる", "distractors": ["上手になった", "上手になって", "上手になろう"], "translationEn": "I practise every day so that I get good at Japanese.", "translationRu": "Я тренируюсь каждый день, чтобы хорошо знать японский." },
        { "sentence": "かぜを＿＿ように、気をつけてください。", "answer": "ひかない", "distractors": ["ひいた", "ひいて", "ひこう"], "translationEn": "Be careful not to catch a cold.", "translationRu": "Берегитесь, чтобы не простудиться." },
        { "sentence": "毎日 練習して、泳げる＿＿なりました。", "answer": "ように", "distractors": ["ために", "ながら", "そうに"], "translationEn": "After practising every day, I became able to swim.", "translationRu": "Тренируясь каждый день, я научилась плавать." },
        { "sentence": "最近 野菜を＿＿ようにしています。", "answer": "食べる", "distractors": ["食べた", "食べて", "食べよう"], "translationEn": "Recently I make a point of eating vegetables.", "translationRu": "В последнее время я стараюсь есть овощи." },
        { "sentence": "日本に来て、さしみが＿＿ようになりました。", "answer": "食べられる", "distractors": ["食べられた", "食べられて", "食べられよう"], "translationEn": "Since coming to Japan, I have become able to eat sashimi.", "translationRu": "Приехав в Японию, я начала есть сасими." },
        { "sentence": "遅刻しない＿＿、早く家を出ます。", "answer": "ように", "distractors": ["ようと", "ことに", "ながら"], "translationEn": "I leave home early so as not to be late.", "translationRu": "Я выхожу из дома пораньше, чтобы не опоздать." },
        { "sentence": "夜は 甘いものを食べない＿＿しています。", "answer": "ように", "distractors": ["ことを", "ために", "ばかり"], "translationEn": "I try not to eat sweets at night.", "translationRu": "Я стараюсь не есть сладкое по вечерам." },
        { "sentence": "子どもが＿＿ように、字を大きく書きました。", "answer": "読める", "distractors": ["読めた", "読めて", "読もう"], "translationEn": "I wrote the letters large so that the children could read them.", "translationRu": "Я написала крупно, чтобы дети могли прочитать." },
        { "sentence": "やっと 漢字が少し＿＿ようになりました。", "answer": "書ける", "distractors": ["書けた", "書けて", "書こう"], "translationEn": "At last I can write a little kanji.", "translationRu": "Наконец-то я немного научилась писать кандзи." }
      ]
    },
    {
      "code": "l37-passive",
      "lesson": 37,
      "lessonTo": null,
      "level": "N4",
      "title": "受身 〜られます",
      "ruleEn": "Passive: group 1 -u → -aremasu (踏む→踏まれます), group 2 -ru → -raremasu (建てる→建てられます), する→されます, 来る→こられます. The doer takes に. The passive also expresses being bothered by someone's action (足を踏まれました).",
      "ruleRu": "Пассив: группа 1 -u → -aremasu (踏む→踏まれます), группа 2 -ru → -raremasu (建てる→建てられます), する→されます, 来る→こられます. Деятель обозначается に. Пассив также передаёт неприятное воздействие (足を踏まれました — «мне наступили на ногу»).",
      "exercises": [
        { "sentence": "わたしは 先生に＿＿。", "answer": "ほめられました", "distractors": ["ほめました", "ほめさせました", "ほめましょう"], "translationEn": "I was praised by the teacher.", "translationRu": "Меня похвалил учитель." },
        { "sentence": "電車の中で 隣の人に足を＿＿。", "answer": "踏まれました", "distractors": ["踏みました", "踏んでいました", "踏みたいです"], "translationEn": "On the train, the person next to me stepped on my foot.", "translationRu": "В поезде сосед наступил мне на ногу." },
        { "sentence": "このお寺は 800年前に＿＿。", "answer": "建てられました", "distractors": ["建てられます", "建ちられました", "建てています"], "translationEn": "This temple was built 800 years ago.", "translationRu": "Этот храм был построен 800 лет назад." },
        { "sentence": "弟に ケーキを＿＿。", "answer": "食べられました", "distractors": ["食べました", "食べています", "食べたいです"], "translationEn": "My little brother ate my cake (to my annoyance).", "translationRu": "Младший брат съел мой торт (к моей досаде)." },
        { "sentence": "この歌は 世界中で＿＿います。", "answer": "歌われて", "distractors": ["歌われ", "歌われる", "歌いられて"], "translationEn": "This song is sung all over the world.", "translationRu": "Эту песню поют по всему миру." },
        { "sentence": "わたしは 母に 日記を＿＿。", "answer": "読まれました", "distractors": ["読まりました", "読められました", "読みられました"], "translationEn": "My mother read my diary.", "translationRu": "Мама прочитала мой дневник." },
        { "sentence": "オリンピックは 4年に一度＿＿。", "answer": "開かれます", "distractors": ["開かります", "開きられます", "開かれよう"], "translationEn": "The Olympics are held once every four years.", "translationRu": "Олимпиада проводится раз в четыре года." }
      ]
    }
  ]
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- grammar-seed`
Expected: PASS (5 tests). If the real-file test lists errors, fix the content, not the validator.

- [ ] **Step 5: Commit**

```bash
git add src/grammar/seed
git commit -m "feat(grammar): add grammar exercise content with seed validation"
```

---

### Task 2: Entities, migration, progress and seed command

**Files:**
- Modify: `src/progress/constants/quiz-type.constant.ts` (add `Grammar`, `WORD_QUIZ_TYPES`)
- Modify: `src/quiz/dtos/quiz-answer-input.dto.ts`, `src/explanations/dtos/explanation-input.dto.ts` (`@IsIn(WORD_QUIZ_TYPES)`)
- Create: `src/grammar/entities/grammar-point.entity.ts`, `src/grammar/entities/grammar-exercise.entity.ts`
- Create: `src/progress/entities/user-exercise-progress.entity.ts`
- Modify: `src/progress/entities/answer-log.entity.ts` (`wordId` nullable, `exerciseId`)
- Create: `migrations/1791849600003-CreateGrammar.ts`
- Create: `src/progress/repositories/user-exercise-progress.repository.ts`
- Modify: `src/progress/services/progress.service.ts` (add `recordExerciseAnswer`), `src/progress/progress.module.ts`
- Create: `src/grammar/repositories/grammar-point.repository.ts` (`upsertSeed`)
- Create: `src/grammar/grammar.module.ts` (repositories only for now), `src/seed-grammar.ts`, script `seed:grammar`
- Test: `src/progress/services/progress.service.spec.ts`

**Interfaces:**
- Produces:
  - `QuizType.Grammar = 'grammar'`, `WORD_QUIZ_TYPES = [QuizType.Vocabulary, QuizType.Verb]`
  - `GrammarPoint { id; code; lesson; lessonTo: number | null; level; title; ruleEn; ruleRu; exercises: GrammarExercise[] }`
  - `GrammarExercise { id; pointId; point: GrammarPoint; sentence; answer; distractors: string[]; translationEn; translationRu }`
  - `ProgressService.recordExerciseAnswer(userId: number, exerciseId: number, isCorrect: boolean, now: Date): Promise<{ box: number; nextReviewAt: Date }>`
  - `GrammarPointRepository.upsertSeed(points: GrammarPointSeed[]): Promise<{ points: number; exercises: number }>`

- [ ] **Step 1: Write the failing test**

`src/progress/services/progress.service.spec.ts`:

```ts
import { AppLogger } from '../../shared/logger/logger.service';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import { QuizType } from '../constants/quiz-type.constant';
import { AnswerLogRepository } from '../repositories/answer-log.repository';
import { UserExerciseProgressRepository } from '../repositories/user-exercise-progress.repository';
import { UserWordProgressRepository } from '../repositories/user-word-progress.repository';
import { ProgressService } from './progress.service';

const DAY = 24 * 60 * 60 * 1000;

describe('ProgressService.recordExerciseAnswer', () => {
  const now = new Date('2026-10-13T10:00:00Z');

  function setup(existing: object | null) {
    const exerciseProgress = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockResolvedValue({}),
    };
    const answerLog = { save: jest.fn().mockResolvedValue({}) };
    const service = new ProgressService(
      {} as UserWordProgressRepository,
      exerciseProgress as unknown as UserExerciseProgressRepository,
      answerLog as unknown as AnswerLogRepository,
      {} as WordRepository,
      { setContext: jest.fn() } as unknown as AppLogger,
    );
    return { service, exerciseProgress, answerLog };
  }

  it('creates progress for a first correct answer and logs it as grammar', async () => {
    const { service, exerciseProgress, answerLog } = setup(null);
    await expect(service.recordExerciseAnswer(7, 3, true, now)).resolves.toEqual({
      box: 2,
      nextReviewAt: new Date(now.getTime() + 2 * DAY),
    });
    expect(exerciseProgress.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, exerciseId: 3, box: 2, correctCount: 1, wrongCount: 0 }),
    );
    expect(answerLog.save).toHaveBeenCalledWith({
      userId: 7,
      wordId: null,
      exerciseId: 3,
      quizType: QuizType.Grammar,
      isCorrect: true,
      createdAt: now,
    });
  });

  it('drops an existing exercise back to box 1 on a wrong answer', async () => {
    const { service, exerciseProgress } = setup({ id: 1, userId: 7, exerciseId: 3, box: 4, correctCount: 3, wrongCount: 0 });
    await expect(service.recordExerciseAnswer(7, 3, false, now)).resolves.toEqual({
      box: 1,
      nextReviewAt: new Date(now.getTime() + DAY),
    });
    expect(exerciseProgress.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, box: 1, correctCount: 3, wrongCount: 1 }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- progress.service`
Expected: FAIL, `Cannot find module '../repositories/user-exercise-progress.repository'`.

- [ ] **Step 3: Quiz type and word DTOs**

Replace `src/progress/constants/quiz-type.constant.ts` with:

```ts
export enum QuizType {
  Vocabulary = 'vocabulary',
  Verb = 'verb',
  Grammar = 'grammar',
}

// Quiz types that are answered against a vocabulary word.
export const WORD_QUIZ_TYPES = [QuizType.Vocabulary, QuizType.Verb];
```

In `src/quiz/dtos/quiz-answer-input.dto.ts` and `src/explanations/dtos/explanation-input.dto.ts`:
- replace `@IsEnum(QuizType)` on `quizType` with `@IsIn(WORD_QUIZ_TYPES)`;
- change the Swagger decorator to `@ApiProperty({ enum: WORD_QUIZ_TYPES })`;
- import `IsIn` from `class-validator` and `WORD_QUIZ_TYPES` next to `QuizType`;
- keep `IsEnum` only where it is still used.

- [ ] **Step 4: Entities**

`src/grammar/entities/grammar-point.entity.ts`:

```ts
import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { GrammarExercise } from './grammar-exercise.entity';

@Entity('grammar_points')
@Unique('UQ_grammar_points_code', ['code'])
export class GrammarPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  code: string;

  @Column({ type: 'smallint' })
  lesson: number;

  @Column({ type: 'smallint', nullable: true })
  lessonTo: number | null;

  @Column({ type: 'varchar', length: 2 })
  level: JlptLevel;

  @Column({ length: 100 })
  title: string;

  @Column({ type: 'text' })
  ruleEn: string;

  @Column({ type: 'text' })
  ruleRu: string;

  @OneToMany(() => GrammarExercise, (exercise) => exercise.point)
  exercises: GrammarExercise[];
}
```

`src/grammar/entities/grammar-exercise.entity.ts`:

```ts
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { GrammarPoint } from './grammar-point.entity';

@Entity('grammar_exercises')
@Unique('UQ_grammar_exercises_point_sentence', ['pointId', 'sentence'])
export class GrammarExercise {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pointId: number;

  @ManyToOne(() => GrammarPoint, (point) => point.exercises, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pointId' })
  point: GrammarPoint;

  @Column({ length: 255 })
  sentence: string;

  @Column({ length: 100 })
  answer: string;

  @Column({ type: 'jsonb' })
  distractors: string[];

  @Column({ length: 255 })
  translationEn: string;

  @Column({ length: 255 })
  translationRu: string;
}
```

`src/progress/entities/user-exercise-progress.entity.ts`:

```ts
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { GrammarExercise } from '../../grammar/entities/grammar-exercise.entity';
import { User } from '../../user/entities/user.entity';

@Entity('user_exercise_progress')
@Unique('UQ_user_exercise_progress_user_exercise', ['userId', 'exerciseId'])
export class UserExerciseProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  exerciseId: number;

  @ManyToOne(() => GrammarExercise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exerciseId' })
  exercise: GrammarExercise;

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

In `src/progress/entities/answer-log.entity.ts`:
- change the `wordId` column to `@Column({ type: 'integer', nullable: true }) wordId: number | null;`;
- add after the `word` relation:

```ts
  @Column({ type: 'integer', nullable: true })
  exerciseId: number | null;

  @ManyToOne(() => GrammarExercise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exerciseId' })
  exercise: GrammarExercise;
```

(import `GrammarExercise`).

- [ ] **Step 5: Migration**

`migrations/1791849600003-CreateGrammar.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGrammar1791849600003 implements MigrationInterface {
  name = 'CreateGrammar1791849600003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "grammar_points" (
        "id" SERIAL NOT NULL,
        "code" character varying(50) NOT NULL,
        "lesson" smallint NOT NULL,
        "lessonTo" smallint,
        "level" character varying(2) NOT NULL,
        "title" character varying(100) NOT NULL,
        "ruleEn" text NOT NULL,
        "ruleRu" text NOT NULL,
        CONSTRAINT "UQ_grammar_points_code" UNIQUE ("code"),
        CONSTRAINT "PK_grammar_points" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "grammar_exercises" (
        "id" SERIAL NOT NULL,
        "pointId" integer NOT NULL,
        "sentence" character varying(255) NOT NULL,
        "answer" character varying(100) NOT NULL,
        "distractors" jsonb NOT NULL,
        "translationEn" character varying(255) NOT NULL,
        "translationRu" character varying(255) NOT NULL,
        CONSTRAINT "UQ_grammar_exercises_point_sentence" UNIQUE ("pointId", "sentence"),
        CONSTRAINT "PK_grammar_exercises" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grammar_exercises_point" FOREIGN KEY ("pointId") REFERENCES "grammar_points"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_exercise_progress" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "exerciseId" integer NOT NULL,
        "box" smallint NOT NULL DEFAULT 1,
        "nextReviewAt" TIMESTAMP NOT NULL,
        "correctCount" integer NOT NULL DEFAULT 0,
        "wrongCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_user_exercise_progress_user_exercise" UNIQUE ("userId", "exerciseId"),
        CONSTRAINT "PK_user_exercise_progress" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_exercise_progress_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_exercise_progress_exercise" FOREIGN KEY ("exerciseId") REFERENCES "grammar_exercises"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(`ALTER TABLE "answer_log" ALTER COLUMN "wordId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "answer_log" ADD "exerciseId" integer`);
    await queryRunner.query(
      `ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_exercise" FOREIGN KEY ("exerciseId") REFERENCES "grammar_exercises"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "answer_log" WHERE "wordId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP CONSTRAINT "FK_answer_log_exercise"`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP COLUMN "exerciseId"`);
    await queryRunner.query(`ALTER TABLE "answer_log" ALTER COLUMN "wordId" SET NOT NULL`);
    await queryRunner.query(`DROP TABLE "user_exercise_progress"`);
    await queryRunner.query(`DROP TABLE "grammar_exercises"`);
    await queryRunner.query(`DROP TABLE "grammar_points"`);
  }
}
```

- [ ] **Step 6: Progress repository and service method**

`src/progress/repositories/user-exercise-progress.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { UserExerciseProgress } from '../entities/user-exercise-progress.entity';

@Injectable()
export class UserExerciseProgressRepository extends Repository<UserExerciseProgress> {
  constructor(private dataSource: DataSource) {
    super(UserExerciseProgress, dataSource.createEntityManager());
  }
}
```

In `src/progress/services/progress.service.ts`:
- add the constructor parameter `private exerciseProgressRepository: UserExerciseProgressRepository` right after `progressRepository`;
- add the method:

```ts
  async recordExerciseAnswer(
    userId: number,
    exerciseId: number,
    isCorrect: boolean,
    now: Date,
  ): Promise<{ box: number; nextReviewAt: Date }> {
    const existing = await this.exerciseProgressRepository.findOne({
      where: { userId, exerciseId },
    });
    const next = applyAnswer(existing?.box ?? null, isCorrect, now);

    await this.exerciseProgressRepository.save({
      ...existing,
      userId,
      exerciseId,
      box: next.box,
      nextReviewAt: next.nextReviewAt,
      correctCount: (existing?.correctCount ?? 0) + (isCorrect ? 1 : 0),
      wrongCount: (existing?.wrongCount ?? 0) + (isCorrect ? 0 : 1),
    });
    await this.answerLogRepository.save({
      userId,
      wordId: null,
      exerciseId,
      quizType: QuizType.Grammar,
      isCorrect,
      createdAt: now,
    });

    return next;
  }
```

In `src/progress/progress.module.ts`, add `UserExerciseProgress` to `TypeOrmModule.forFeature([...])` and `UserExerciseProgressRepository` to `providers`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- progress.service`
Expected: PASS (2 tests).

- [ ] **Step 8: Grammar repository, module and seed command**

`src/grammar/repositories/grammar-point.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { GrammarExercise } from '../entities/grammar-exercise.entity';
import { GrammarPoint } from '../entities/grammar-point.entity';
import { GrammarPointSeed } from '../seed/grammar-seed';

@Injectable()
export class GrammarPointRepository extends Repository<GrammarPoint> {
  constructor(private dataSource: DataSource) {
    super(GrammarPoint, dataSource.createEntityManager());
  }

  async upsertSeed(points: GrammarPointSeed[]): Promise<{ points: number; exercises: number }> {
    const exercises = this.manager.getRepository(GrammarExercise);
    let exerciseCount = 0;
    for (const { exercises: exerciseSeeds, ...pointSeed } of points) {
      const existing = await this.findOne({ where: { code: pointSeed.code } });
      const point = await this.save({ ...existing, ...pointSeed });
      for (const exerciseSeed of exerciseSeeds) {
        const current = await exercises.findOne({
          where: { pointId: point.id, sentence: exerciseSeed.sentence },
        });
        await exercises.save({ ...current, ...exerciseSeed, pointId: point.id });
        exerciseCount++;
      }
    }
    return { points: points.length, exercises: exerciseCount };
  }
}
```

`src/grammar/grammar.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgressModule } from '../progress/progress.module';
import { SharedModule } from '../shared/shared.module';
import { GrammarExercise } from './entities/grammar-exercise.entity';
import { GrammarPoint } from './entities/grammar-point.entity';
import { GrammarPointRepository } from './repositories/grammar-point.repository';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([GrammarPoint, GrammarExercise]), ProgressModule],
  providers: [GrammarPointRepository],
  exports: [GrammarPointRepository],
})
export class GrammarModule {}
```

Add `GrammarModule` to `imports` in `src/app.module.ts`.

`src/seed-grammar.ts`:

```ts
import * as fs from 'fs';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { GrammarPointRepository } from './grammar/repositories/grammar-point.repository';
import { grammarSeedFilePath, loadGrammarSeed, validateGrammarSeed } from './grammar/seed/grammar-seed';

async function bootstrap() {
  const points = loadGrammarSeed(fs.readFileSync(grammarSeedFilePath(), 'utf8'));
  const errors = validateGrammarSeed(points);
  if (errors.length > 0) {
    throw new Error(`grammar.json is invalid:\n${errors.join('\n')}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const result = await app.get(GrammarPointRepository).upsertSeed(points);
  console.log(`grammar: ${result.points} points, ${result.exercises} exercises`);
  await app.close();
}
bootstrap();
```

In `package.json` `scripts`, add after `seed:words`:

```json
"seed:grammar": "ts-node -r tsconfig-paths/register src/seed-grammar.ts",
```

- [ ] **Step 9: Migrate, seed twice, run all suites**

```bash
npm run migration:run
npm run seed:grammar
npm run seed:grammar
npm test
npm run test:e2e
```

Expected: `CreateGrammar1791849600003` executes on the dev DB, which has existing `answer_log` rows. Both seed runs print `grammar: 7 points, 53 exercises`. Check the row count stays the same:

```bash
docker compose exec -T pgsqldb psql -U root -d example_db -tAc 'select count(*) from grammar_exercises'
```

All unit tests and all e2e tests pass (the existing quiz and explanation e2e still return 400 for `quizType: 'kanji'`).

- [ ] **Step 10: Commit**

```bash
git add src migrations package.json
git commit -m "feat(grammar): add grammar tables, exercise progress and seed command"
```

---

### Task 3: Question building and answer checking

**Files:**
- Create: `src/grammar/domain/grammar-quiz.ts`
- Test: `src/grammar/domain/grammar-quiz.spec.ts`

**Interfaces:**
- Consumes: `shuffle`, `Rng` (`src/quiz/domain/quiz-builder.ts`); `GrammarExercise`, `GrammarPoint` (Task 2).
- Produces:
  - `interface GrammarQuestion { exerciseId; lesson; pointTitle; sentence; translation: { en; ru }; options: string[] }`
  - `buildGrammarQuestion(exercise: GrammarExercise & { point: GrammarPoint }, rng?: Rng): GrammarQuestion`
  - `isCorrectGrammarAnswer(exercise: GrammarExercise, answer: string): boolean`

- [ ] **Step 1: Write the failing test**

`src/grammar/domain/grammar-quiz.spec.ts`:

```ts
import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { GrammarExercise } from '../entities/grammar-exercise.entity';
import { GrammarPoint } from '../entities/grammar-point.entity';
import { buildGrammarQuestion, isCorrectGrammarAnswer } from './grammar-quiz';

const point = {
  id: 6,
  code: 'l36-you-ni',
  lesson: 36,
  lessonTo: null,
  level: JlptLevel.N4,
  title: '〜ように',
  ruleEn: 'rule',
  ruleRu: 'правило',
} as GrammarPoint;

const exercise = {
  id: 42,
  pointId: 6,
  point,
  sentence: '遅刻しない＿＿、早く家を出ます。',
  answer: 'ように',
  distractors: ['ようと', 'ことに', 'ながら'],
  translationEn: 'I leave home early so as not to be late.',
  translationRu: 'Я выхожу из дома пораньше, чтобы не опоздать.',
} as GrammarExercise & { point: GrammarPoint };

describe('buildGrammarQuestion', () => {
  it('exposes the sentence, translations and 4 shuffled options without the answer key', () => {
    const question = buildGrammarQuestion(exercise);
    expect(question).toEqual({
      exerciseId: 42,
      lesson: 36,
      pointTitle: '〜ように',
      sentence: '遅刻しない＿＿、早く家を出ます。',
      translation: { en: exercise.translationEn, ru: exercise.translationRu },
      options: expect.any(Array),
    });
    expect([...question.options].sort()).toEqual(['ことに', 'ながら', 'ように', 'ようと'].sort());
  });

  it('shuffles with the given rng', () => {
    const first = buildGrammarQuestion(exercise, () => 0).options;
    const last = buildGrammarQuestion(exercise, () => 0.99).options;
    expect(first).not.toEqual(last);
  });
});

describe('isCorrectGrammarAnswer', () => {
  it('matches exactly after trimming', () => {
    expect(isCorrectGrammarAnswer(exercise, 'ように')).toBe(true);
    expect(isCorrectGrammarAnswer(exercise, ' ように ')).toBe(true);
    expect(isCorrectGrammarAnswer(exercise, 'ようと')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- grammar-quiz`
Expected: FAIL, `Cannot find module './grammar-quiz'`.

- [ ] **Step 3: Implement**

`src/grammar/domain/grammar-quiz.ts`:

```ts
import { Rng, shuffle } from '../../quiz/domain/quiz-builder';
import { GrammarExercise } from '../entities/grammar-exercise.entity';
import { GrammarPoint } from '../entities/grammar-point.entity';

export interface GrammarQuestion {
  exerciseId: number;
  lesson: number;
  pointTitle: string;
  sentence: string;
  translation: { en: string; ru: string };
  options: string[];
}

export function buildGrammarQuestion(
  exercise: GrammarExercise & { point: GrammarPoint },
  rng: Rng = Math.random,
): GrammarQuestion {
  return {
    exerciseId: exercise.id,
    lesson: exercise.point.lesson,
    pointTitle: exercise.point.title,
    sentence: exercise.sentence,
    translation: { en: exercise.translationEn, ru: exercise.translationRu },
    options: shuffle([exercise.answer, ...exercise.distractors], rng),
  };
}

export function isCorrectGrammarAnswer(exercise: GrammarExercise, answer: string): boolean {
  return answer.trim() === exercise.answer;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- grammar-quiz`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/grammar/domain
git commit -m "feat(grammar): build grammar questions and check answers"
```

---

### Task 4: Grammar endpoints and e2e

**Files:**
- Create: `src/grammar/repositories/grammar-exercise.repository.ts`
- Create: `src/grammar/dtos/grammar-quiz-query.dto.ts`, `src/grammar/dtos/grammar-answer-input.dto.ts`, `src/grammar/dtos/grammar-output.dto.ts`
- Create: `src/grammar/services/grammar.service.ts`, `src/grammar/controllers/grammar.controller.ts`
- Modify: `src/grammar/grammar.module.ts`
- Test: `test/nihongo/grammar.e2e-spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3, `ProgressService.recordExerciseAnswer`.
- Produces the HTTP API from the spec: `GET /grammar/lessons`, `GET /quiz/grammar`, `POST /grammar/answer`.

- [ ] **Step 1: Write the failing e2e test**

`test/nihongo/grammar.e2e-spec.ts`:

```ts
import * as fs from 'fs';

import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { GrammarExercise } from '../../src/grammar/entities/grammar-exercise.entity';
import { GrammarPointRepository } from '../../src/grammar/repositories/grammar-point.repository';
import { grammarSeedFilePath, loadGrammarSeed } from '../../src/grammar/seed/grammar-seed';
import { closeDBAfterTest } from '../test-utils';
import { createNihongoTestApp, registerAndLogin } from './nihongo-test-utils';

describe('Grammar (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createNihongoTestApp();
    await app.get(GrammarPointRepository).upsertSeed(loadGrammarSeed(fs.readFileSync(grammarSeedFilePath(), 'utf8')));
    token = await registerAndLogin(app, 'grammar-user');
  });

  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer ' + token);
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + token).send(body);

  it('lists lessons in order with their points', async () => {
    const response = await get('/grammar/lessons').expect(HttpStatus.OK);
    const lessons = response.body.data;
    expect(lessons.map((l: { lesson: number }) => l.lesson)).toEqual([1, 14, 19, 34, 35, 36, 37]);
    const l36 = lessons.find((l: { lesson: number }) => l.lesson === 36);
    expect(l36).toEqual({
      lesson: 36,
      lessonTo: null,
      level: 'N4',
      points: [expect.objectContaining({ code: 'l36-you-ni', exerciseCount: 9 })],
    });
  });

  it('returns a lesson quiz without answers, unique and with 4 options', async () => {
    const response = await get('/quiz/grammar?lesson=36&count=20').expect(HttpStatus.OK);
    const questions = response.body.data;
    expect(questions).toHaveLength(9);
    expect(new Set(questions.map((q: { exerciseId: number }) => q.exerciseId)).size).toBe(9);
    for (const q of questions) {
      expect(Object.keys(q).sort()).toEqual(['exerciseId', 'lesson', 'options', 'pointTitle', 'sentence', 'translation']);
      expect(new Set(q.options).size).toBe(4);
      expect(q.sentence).toContain('＿＿');
    }
  });

  it('matches range lessons, mixes all lessons and returns [] for an empty lesson', async () => {
    const range = await get('/quiz/grammar?lesson=3').expect(HttpStatus.OK);
    expect(range.body.data.length).toBeGreaterThan(0);
    expect(range.body.data.every((q: { lesson: number }) => q.lesson === 1)).toBe(true);

    const all = await get('/quiz/grammar?lesson=all&count=5').expect(HttpStatus.OK);
    expect(all.body.data).toHaveLength(5);

    const empty = await get('/quiz/grammar?lesson=49').expect(HttpStatus.OK);
    expect(empty.body.data).toEqual([]);
  });

  it('validates the query', async () => {
    await get('/quiz/grammar?lesson=abc').expect(HttpStatus.BAD_REQUEST);
    await get('/quiz/grammar?lesson=36&count=21').expect(HttpStatus.BAD_REQUEST);
  });

  it('records answers, returns the rule and counts them in the summary', async () => {
    const exercise = await app
      .get(GrammarPointRepository)
      .manager.getRepository(GrammarExercise)
      .findOneOrFail({ where: { sentence: '遅刻しない＿＿、早く家を出ます。' } });

    const correct = await post('/grammar/answer', { exerciseId: exercise.id, answer: 'ように' }).expect(HttpStatus.OK);
    expect(correct.body.data).toEqual(
      expect.objectContaining({ isCorrect: true, correctAnswer: 'ように', newBox: 2 }),
    );
    expect(correct.body.data.rule.ru).toContain('ように');

    const wrong = await post('/grammar/answer', { exerciseId: exercise.id, answer: 'ために' }).expect(HttpStatus.OK);
    expect(wrong.body.data).toEqual(expect.objectContaining({ isCorrect: false, newBox: 1 }));

    const summary = await get('/progress/summary?level=N5').expect(HttpStatus.OK);
    expect(summary.body.data).toEqual(expect.objectContaining({ streakDays: 1, accuracy7d: 0.5, learned: 0 }));
  });

  it('rejects bad answers', async () => {
    await post('/grammar/answer', { exerciseId: 999999, answer: 'x' }).expect(HttpStatus.NOT_FOUND);
    await post('/grammar/answer', { exerciseId: 1, answer: '' }).expect(HttpStatus.BAD_REQUEST);
    await post('/grammar/answer', { exerciseId: 1, answer: 'x'.repeat(101) }).expect(HttpStatus.BAD_REQUEST);
  });

  it('keeps word endpoints closed to the grammar quiz type', async () => {
    await post('/quiz/answer', { quizType: 'grammar', wordId: 1, answer: 'x' }).expect(HttpStatus.BAD_REQUEST);
    await post('/explanations', { quizType: 'grammar', wordId: 1, chosenAnswer: 'x', language: 'en' }).expect(HttpStatus.BAD_REQUEST);
  });

  it('requires a token', () => request(app.getHttpServer()).get('/grammar/lessons').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- grammar`
Expected: FAIL with 404 on `/grammar/lessons`.

- [ ] **Step 3: Repository, DTOs, service, controller, module**

`src/grammar/repositories/grammar-exercise.repository.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { UserExerciseProgress } from '../../progress/entities/user-exercise-progress.entity';
import { GrammarExercise } from '../entities/grammar-exercise.entity';

@Injectable()
export class GrammarExerciseRepository extends Repository<GrammarExercise> {
  constructor(private dataSource: DataSource) {
    super(GrammarExercise, dataSource.createEntityManager());
  }

  async getByIdWithPoint(id: number): Promise<GrammarExercise> {
    const exercise = await this.findOne({ where: { id }, relations: { point: true } });
    if (!exercise) {
      throw new NotFoundException();
    }
    return exercise;
  }

  // Due exercises first, then never-answered ones, then the rest; random inside each group.
  findForQuiz(userId: number, lesson: number | null, count: number): Promise<GrammarExercise[]> {
    const query = this.createQueryBuilder('e')
      .innerJoinAndSelect('e.point', 'p')
      .leftJoin(UserExerciseProgress, 'up', 'up.exerciseId = e.id AND up.userId = :userId', { userId });
    if (lesson !== null) {
      query.where(':lesson BETWEEN p.lesson AND COALESCE(p."lessonTo", p.lesson)', { lesson });
    }
    return query
      .addSelect(
        `CASE WHEN up."nextReviewAt" <= :now THEN 0 WHEN up."id" IS NULL THEN 1 ELSE 2 END`,
        'priority',
      )
      .setParameter('now', new Date())
      .orderBy('priority', 'ASC')
      .addOrderBy('up.nextReviewAt', 'ASC', 'NULLS LAST')
      .addOrderBy('RANDOM()')
      .limit(count)
      .getMany();
  }
}
```

`src/grammar/dtos/grammar-quiz-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class GrammarQuizQueryInput {
  @ApiPropertyOptional({ description: 'Lesson number 1–50 or "all" (default)', example: '36' })
  @IsOptional()
  @Matches(/^(all|[1-9]|[1-4][0-9]|50)$/)
  lesson = 'all';

  @ApiPropertyOptional({ description: '1–20, defaults to 10', type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  count = 10;
}
```

`src/grammar/dtos/grammar-answer-input.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class GrammarAnswerInput {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  exerciseId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  answer: string;
}
```

`src/grammar/dtos/grammar-output.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { JlptLevel } from '../../vocabulary/constants/word.constant';

export class LocalizedTextOutput {
  @ApiProperty()
  en: string;

  @ApiProperty()
  ru: string;
}

export class GrammarPointSummaryOutput {
  @ApiProperty()
  id: number;

  @ApiProperty()
  code: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  exerciseCount: number;
}

export class GrammarLessonOutput {
  @ApiProperty()
  lesson: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  lessonTo: number | null;

  @ApiProperty({ enum: JlptLevel })
  level: JlptLevel;

  @ApiProperty({ type: [GrammarPointSummaryOutput] })
  points: GrammarPointSummaryOutput[];
}

export class GrammarQuestionOutput {
  @ApiProperty()
  exerciseId: number;

  @ApiProperty()
  lesson: number;

  @ApiProperty()
  pointTitle: string;

  @ApiProperty({ description: 'Sentence with one ＿＿ blank' })
  sentence: string;

  @ApiProperty({ type: LocalizedTextOutput })
  translation: LocalizedTextOutput;

  @ApiProperty({ type: [String] })
  options: string[];
}

export class GrammarAnswerOutput {
  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty()
  correctAnswer: string;

  @ApiProperty()
  newBox: number;

  @ApiProperty()
  nextReviewAt: Date;

  @ApiProperty({ type: LocalizedTextOutput })
  rule: LocalizedTextOutput;
}
```

`src/grammar/services/grammar.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import { ProgressService } from '../../progress/services/progress.service';
import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { buildGrammarQuestion, isCorrectGrammarAnswer } from '../domain/grammar-quiz';
import { GrammarAnswerInput } from '../dtos/grammar-answer-input.dto';
import { GrammarAnswerOutput, GrammarLessonOutput, GrammarQuestionOutput } from '../dtos/grammar-output.dto';
import { GrammarExerciseRepository } from '../repositories/grammar-exercise.repository';
import { GrammarPointRepository } from '../repositories/grammar-point.repository';

@Injectable()
export class GrammarService {
  constructor(
    private pointRepository: GrammarPointRepository,
    private exerciseRepository: GrammarExerciseRepository,
    private progressService: ProgressService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(GrammarService.name);
  }

  async getLessons(ctx: RequestContext): Promise<GrammarLessonOutput[]> {
    this.logger.log(ctx, `${this.getLessons.name} was called`);
    const points = await this.pointRepository.find({
      relations: { exercises: true },
      order: { lesson: 'ASC', id: 'ASC' },
    });

    const lessons = new Map<string, GrammarLessonOutput>();
    for (const point of points) {
      const key = `${point.lesson}-${point.lessonTo ?? ''}`;
      const lesson = lessons.get(key) ?? { lesson: point.lesson, lessonTo: point.lessonTo, level: point.level, points: [] };
      lesson.points.push({ id: point.id, code: point.code, title: point.title, exerciseCount: point.exercises.length });
      lessons.set(key, lesson);
    }
    return [...lessons.values()];
  }

  async getQuiz(ctx: RequestContext, lesson: string, count: number): Promise<GrammarQuestionOutput[]> {
    this.logger.log(ctx, `${this.getQuiz.name} was called`);
    const exercises = await this.exerciseRepository.findForQuiz(
      ctx.user!.id,
      lesson === 'all' ? null : Number(lesson),
      count,
    );
    return exercises.map((exercise) => buildGrammarQuestion(exercise));
  }

  async answer(ctx: RequestContext, input: GrammarAnswerInput): Promise<GrammarAnswerOutput> {
    this.logger.log(ctx, `${this.answer.name} was called`);
    const exercise = await this.exerciseRepository.getByIdWithPoint(input.exerciseId);
    const isCorrect = isCorrectGrammarAnswer(exercise, input.answer);
    const { box, nextReviewAt } = await this.progressService.recordExerciseAnswer(
      ctx.user!.id,
      exercise.id,
      isCorrect,
      new Date(),
    );
    return {
      isCorrect,
      correctAnswer: exercise.answer,
      newBox: box,
      nextReviewAt,
      rule: { en: exercise.point.ruleEn, ru: exercise.point.ruleRu },
    };
  }
}
```

`src/grammar/controllers/grammar.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BaseApiErrorResponse, BaseApiResponse, SwaggerBaseApiResponse } from '../../shared/dtos/base-api-response.dto';
import { ReqContext } from '../../shared/request-context/req-context.decorator';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { GrammarAnswerInput } from '../dtos/grammar-answer-input.dto';
import { GrammarAnswerOutput, GrammarLessonOutput, GrammarQuestionOutput } from '../dtos/grammar-output.dto';
import { GrammarQuizQueryInput } from '../dtos/grammar-quiz-query.dto';
import { GrammarService } from '../services/grammar.service';

@ApiTags('grammar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class GrammarController {
  constructor(private readonly grammarService: GrammarService) {}

  @Get('grammar/lessons')
  @ApiOperation({ summary: 'Grammar lessons (≈ Minna no Nihongo) with their points' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([GrammarLessonOutput]) })
  async getLessons(@ReqContext() ctx: RequestContext): Promise<BaseApiResponse<GrammarLessonOutput[]>> {
    const lessons = await this.grammarService.getLessons(ctx);
    return { data: lessons, meta: { count: lessons.length } };
  }

  @Get('quiz/grammar')
  @ApiOperation({ summary: 'Fill-in-the-blank grammar quiz for a lesson or all lessons' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse([GrammarQuestionOutput]) })
  async getQuiz(
    @ReqContext() ctx: RequestContext,
    @Query() query: GrammarQuizQueryInput,
  ): Promise<BaseApiResponse<GrammarQuestionOutput[]>> {
    const questions = await this.grammarService.getQuiz(ctx, query.lesson, query.count);
    return { data: questions, meta: { count: questions.length } };
  }

  @Post('grammar/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check a grammar answer, update progress and return the rule' })
  @ApiResponse({ status: HttpStatus.OK, type: SwaggerBaseApiResponse(GrammarAnswerOutput) })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: BaseApiErrorResponse })
  async answer(
    @ReqContext() ctx: RequestContext,
    @Body() input: GrammarAnswerInput,
  ): Promise<BaseApiResponse<GrammarAnswerOutput>> {
    const result = await this.grammarService.answer(ctx, input);
    return { data: result, meta: {} };
  }
}
```

Update `src/grammar/grammar.module.ts`:
- `providers: [GrammarPointRepository, GrammarExerciseRepository, GrammarService, JwtAuthStrategy]`;
- `controllers: [GrammarController]`;
- add the matching imports.

- [ ] **Step 4: Run e2e to verify it passes, then all suites and lint**

```bash
npm run test:e2e -- grammar
npm test
npm run test:e2e
npm run lint
```

Expected: grammar e2e 8/8, all suites green, and lint shows only the 2 pre-existing starter errors. If ordering by the `priority` alias fails, use the CASE expression directly in `orderBy` (same fallback as `WordRepository.findForQuiz`).

- [ ] **Step 5: Commit**

```bash
git add src/grammar test/nihongo/grammar.e2e-spec.ts
git commit -m "feat(grammar): add lessons, grammar quiz and answer endpoints"
```

---

### Task 5: Frontend — lessons page, grammar quiz, dashboard card (`nihongo-web`)

**Files:**
- Modify: `src/lib/api/types.ts`, `src/lib/api/endpoints.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/ru.ts`
- Modify: `src/features/quiz/QuizResult.tsx` (generic mistake prompt), `src/features/quiz/QuizSession.tsx`
- Create: `src/features/grammar/GrammarSentence.tsx`, `src/features/grammar/GrammarLessonsPage.tsx`, `src/features/grammar/GrammarQuizPage.tsx`, `src/features/grammar/GrammarSession.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx`, `src/features/dashboard/ModeCard.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: the API from Task 4.
- Produces: routes `/grammar` and `/quiz/grammar?lesson=N|all`. `Mistake` becomes `{ id: number; prompt: ReactNode; chosen: string; correctAnswer: string }`.

- [ ] **Step 1: Types and endpoints**

Append to `src/lib/api/types.ts`:

```ts
export interface GrammarPointSummary {
  id: number;
  code: string;
  title: string;
  exerciseCount: number;
}

export interface GrammarLesson {
  lesson: number;
  lessonTo: number | null;
  level: Level;
  points: GrammarPointSummary[];
}

export interface GrammarQuestion {
  exerciseId: number;
  lesson: number;
  pointTitle: string;
  sentence: string;
  translation: { en: string; ru: string };
  options: string[];
}

export interface GrammarAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  newBox: number;
  nextReviewAt: string;
  rule: { en: string; ru: string };
}
```

Append to `src/lib/api/endpoints.ts` (and extend the type import):

```ts
export async function getGrammarLessons(): Promise<GrammarLesson[]> {
  const { data } = await api.get<Envelope<GrammarLesson[]>>('/grammar/lessons');
  return data.data;
}

export async function getGrammarQuiz(lesson: number | 'all', count = 10): Promise<GrammarQuestion[]> {
  const { data } = await api.get<Envelope<GrammarQuestion[]>>('/quiz/grammar', { params: { lesson, count } });
  return data.data;
}

export async function submitGrammarAnswer(input: { exerciseId: number; answer: string }): Promise<GrammarAnswerResult> {
  const { data } = await api.post<Envelope<GrammarAnswerResult>>('/grammar/answer', input);
  return data.data;
}
```

- [ ] **Step 2: Strings (both dictionaries)**

Add to `en.ts` before `} as const;`:

```ts
  'mode.grammar.title': 'Grammar',
  'mode.grammar.description': 'Fill in the blank: particles and forms from Minna no Nihongo lessons.',
  'grammar.subtitle': 'Pick a lesson. Lesson numbers follow Minna no Nihongo (approximately).',
  'grammar.allLessons': 'All lessons mixed',
  'grammar.lesson': 'Lesson {lesson}',
  'grammar.lessonRange': 'Lessons {from}–{to}',
  'grammar.studyingNow': 'studying now',
  'grammar.exercises': 'Exercises: {count}',
  'grammar.loadError': 'Could not load lessons',
  'grammar.prompt': 'Fill in the blank',
  'grammar.empty': 'No exercises for this lesson yet',
  'grammar.practise': 'Practise',
  'grammar.backToLessons': 'Back to lessons',
  'mistake.nextHint': 'Enter — next',
```

Add to `ru.ts`:

```ts
  'mode.grammar.title': 'Грамматика',
  'mode.grammar.description': 'Заполните пропуск: частицы и формы из уроков Minna no Nihongo.',
  'grammar.subtitle': 'Выберите урок. Номера уроков — по Minna no Nihongo (примерно).',
  'grammar.allLessons': 'Все уроки вперемешку',
  'grammar.lesson': 'Урок {lesson}',
  'grammar.lessonRange': 'Уроки {from}–{to}',
  'grammar.studyingNow': 'сейчас изучаю',
  'grammar.exercises': 'Упражнений: {count}',
  'grammar.loadError': 'Не удалось загрузить уроки',
  'grammar.prompt': 'Заполните пропуск',
  'grammar.empty': 'Для этого урока пока нет упражнений',
  'grammar.practise': 'Тренировать',
  'grammar.backToLessons': 'К урокам',
  'mistake.nextHint': 'Enter — дальше',
```

Run: `npx vitest run`. Expected: 7/7 (the dictionary test confirms the keys and placeholders match).

- [ ] **Step 3: Generic mistakes in `QuizResult`**

In `src/features/quiz/QuizResult.tsx`:
- import `ReactNode` from `react`;
- replace the `Mistake` interface with:

```ts
export interface Mistake {
  id: number;
  prompt: ReactNode;
  chosen: string;
  correctAnswer: string;
}
```

- replace the `<li key={m.question.wordId} …>` body's first `<span className="font-jp text-xl">…</span>` with `{m.prompt}`, and set `key={m.id}`;
- remove the now-unused `Question` import.

In `src/features/quiz/QuizSession.tsx`, change the `setMistakes` call to:

```tsx
        setMistakes((list) => [
          ...list,
          {
            id: question.wordId,
            prompt: (
              <span className="font-jp text-xl">
                {question.kanji ?? question.kana}
                {question.kanji && <span className="ml-2 text-sm text-muted-foreground">{question.kana}</span>}
              </span>
            ),
            chosen: variables.answer,
            correctAnswer: res.correctAnswer,
          },
        ]);
```

- [ ] **Step 4: Grammar components**

`src/features/grammar/GrammarSentence.tsx`:

```tsx
import { cn } from '@/lib/utils';

const BLANK = '＿＿';

// Renders the sentence with its blank as an underlined slot, optionally filled in.
export function GrammarSentence({ sentence, fill, className }: { sentence: string; fill?: string; className?: string }) {
  const [before, after] = sentence.split(BLANK);
  return (
    <span className={cn('font-jp break-keep', className)}>
      {before}
      <span
        className={cn(
          'mx-1 inline-block min-w-[3em] border-b-2 px-1 text-center',
          fill ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'border-primary text-primary',
        )}
      >
        {fill ?? '　'}
      </span>
      {after}
    </span>
  );
}
```

`src/features/grammar/GrammarLessonsPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Shuffle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getGrammarLessons } from '@/lib/api/endpoints';
import { getErrorMessage } from '@/lib/api/errors';
import { GrammarLesson } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

// The lessons the learner is working through right now (≈ Minna no Nihongo).
const STUDYING_NOW = { from: 34, to: 37 };

const isStudyingNow = (lesson: GrammarLesson) =>
  lesson.lesson >= STUDYING_NOW.from && lesson.lesson <= STUDYING_NOW.to;

export function GrammarLessonsPage() {
  const { t } = useI18n();
  const lessons = useQuery({ queryKey: ['grammar-lessons'], queryFn: getGrammarLessons, staleTime: Infinity });
  const ordered = [...(lessons.data ?? [])].sort(
    (a, b) => Number(isStudyingNow(b)) - Number(isStudyingNow(a)) || a.lesson - b.lesson,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-jp text-sm text-primary">文法</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t('mode.grammar.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('grammar.subtitle')}</p>
        </div>
        <Link to="/quiz/grammar?lesson=all" className={buttonVariants({ variant: 'outline' })}>
          <Shuffle className="size-4" /> {t('grammar.allLessons')}
        </Link>
      </div>

      {lessons.isPending && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}
      {lessons.isError && (
        <EmptyState title={t('grammar.loadError')}>
          <p>{getErrorMessage(lessons.error, t)}</p>
          <Button variant="outline" className="mt-3" onClick={() => lessons.refetch()}>
            {t('common.tryAgain')}
          </Button>
        </EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {ordered.map((lesson) => {
          const exerciseCount = lesson.points.reduce((sum, p) => sum + p.exerciseCount, 0);
          return (
            <Card key={`${lesson.lesson}-${lesson.lessonTo}`} className={cn(isStudyingNow(lesson) && 'border-primary/50')}>
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    {lesson.lessonTo
                      ? t('grammar.lessonRange', { from: lesson.lesson, to: lesson.lessonTo })
                      : t('grammar.lesson', { lesson: lesson.lesson })}
                  </h2>
                  <Badge variant="outline">{lesson.level}</Badge>
                  {isStudyingNow(lesson) && <Badge>{t('grammar.studyingNow')}</Badge>}
                </div>
                <ul className="space-y-1">
                  {lesson.points.map((point) => (
                    <li key={point.id} className="font-jp text-base">
                      {point.title}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <span className="text-xs text-muted-foreground">{t('grammar.exercises', { count: exerciseCount })}</span>
                  <Link to={`/quiz/grammar?lesson=${lesson.lesson}`} className={buttonVariants({ size: 'sm' })}>
                    {t('grammar.practise')} <ArrowRight className="size-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

`src/features/grammar/GrammarSession.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { submitGrammarAnswer } from '@/lib/api/endpoints';
import { getErrorMessage } from '@/lib/api/errors';
import { GrammarAnswerResult, GrammarQuestion } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n/language-context';

import { OptionButton, OptionState } from '../quiz/OptionButton';
import { Mistake, QuizResult } from '../quiz/QuizResult';
import { GrammarSentence } from './GrammarSentence';

const ADVANCE_DELAY_MS = 900;

export function GrammarSession({ questions, onRestart }: { questions: GrammarQuestion[]; onRestart: () => void }) {
  const queryClient = useQueryClient();
  const { t, language } = useI18n();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarAnswerResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);

  const question = questions[index] as GrammarQuestion | undefined;
  const finished = index >= questions.length;

  const answer = useMutation({
    mutationFn: submitGrammarAnswer,
    onSuccess: (res, variables) => {
      setResult(res);
      if (res.isCorrect) {
        setCorrectCount((c) => c + 1);
      } else if (question) {
        setMistakes((list) => [
          ...list,
          {
            id: question.exerciseId,
            prompt: <GrammarSentence sentence={question.sentence} fill={res.correctAnswer} className="text-lg" />,
            chosen: variables.answer,
            correctAnswer: res.correctAnswer,
          },
        ]);
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t));
      setSelected(null);
    },
  });

  const next = useCallback(() => {
    setResult(null);
    setSelected(null);
    setIndex((i) => i + 1);
  }, []);

  useEffect(() => {
    if (!result?.isCorrect) return;
    const timer = setTimeout(next, ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [result, next]);

  useEffect(() => {
    if (finished) {
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    }
  }, [finished, queryClient]);

  const choose = useCallback(
    (option: string) => {
      if (!question || selected !== null) return;
      setSelected(option);
      answer.mutate({ exerciseId: question.exerciseId, answer: option });
    },
    [answer, question, selected],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (result && !result.isCorrect && event.key === 'Enter') {
        // preventDefault also stops a focused button from firing its own click.
        event.preventDefault();
        next();
        return;
      }
      const n = Number(event.key);
      if (question && Number.isInteger(n) && n >= 1 && n <= question.options.length) {
        choose(question.options[n - 1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choose, question, result, next]);

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
        <Badge variant="outline">{t('grammar.lesson', { lesson: question.lesson })}</Badge>
        <span className="truncate font-jp text-sm font-medium">{question.pointTitle}</span>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {index + 1} / {questions.length}
        </span>
      </div>
      <Progress value={(index / questions.length) * 100} />
      <div key={question.exerciseId} className="flex animate-in flex-col items-center gap-4 py-8 text-center fade-in slide-in-from-bottom-2">
        <p className="text-sm text-muted-foreground">{t('grammar.prompt')}</p>
        <GrammarSentence
          sentence={question.sentence}
          fill={result ? result.correctAnswer : undefined}
          className="text-3xl leading-relaxed sm:text-4xl"
        />
        <p className="text-sm text-muted-foreground">{question.translation[language]}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {question.options.map((option, i) => (
          <OptionButton
            key={option}
            index={i}
            label={option}
            state={stateOf(option)}
            japanese
            disabled={selected !== null}
            onClick={() => choose(option)}
          />
        ))}
      </div>
      {result && !result.isCorrect ? (
        <div className="animate-in space-y-4 fade-in slide-in-from-bottom-2">
          <Card className="border-primary/30">
            <CardContent className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">{t('explanation.rule')}</p>
              <p className="text-sm leading-relaxed">{result.rule[language]}</p>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between">
            <p className="hidden text-xs text-muted-foreground sm:block">{t('mistake.nextHint')}</p>
            <Button className="ml-auto" onClick={next}>
              {t('mistake.next')} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="hidden text-center text-xs text-muted-foreground sm:block">{t('quiz.tip')}</p>
      )}
    </div>
  );
}
```

`src/features/grammar/GrammarQuizPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getGrammarQuiz } from '@/lib/api/endpoints';
import { getErrorMessage } from '@/lib/api/errors';
import { useI18n } from '@/lib/i18n/language-context';

import { GrammarSession } from './GrammarSession';

function parseLesson(value: string | null): number | 'all' {
  const lesson = Number(value);
  return Number.isInteger(lesson) && lesson >= 1 && lesson <= 50 ? lesson : 'all';
}

export function GrammarQuizPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const lesson = parseLesson(searchParams.get('lesson'));
  const [round, setRound] = useState(0);

  const quiz = useQuery({
    queryKey: ['grammar-quiz', lesson, round],
    queryFn: () => getGrammarQuiz(lesson),
    staleTime: Infinity,
    gcTime: 0,
  });

  if (quiz.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="mx-auto h-32 w-full" />
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
      <EmptyState title={t('quiz.loadError')}>
        <p>{getErrorMessage(quiz.error, t)}</p>
        <Button variant="outline" className="mt-3" onClick={() => quiz.refetch()}>
          {t('common.tryAgain')}
        </Button>
      </EmptyState>
    );
  }

  if (quiz.data.length === 0) {
    return (
      <EmptyState title={t('grammar.empty')}>
        <Link to="/grammar" className="text-primary underline-offset-4 hover:underline">
          {t('grammar.backToLessons')}
        </Link>
      </EmptyState>
    );
  }

  return <GrammarSession key={round} questions={quiz.data} onRestart={() => setRound((r) => r + 1)} />;
}
```

- [ ] **Step 5: Dashboard card and routes**

In `src/features/dashboard/DashboardPage.tsx`:
- change the mode-card grid to `grid gap-4 md:grid-cols-2 lg:grid-cols-3`;
- add a third card:

```tsx
            <ModeCard
              kanji="文法"
              title={t('mode.grammar.title')}
              description={t('mode.grammar.description')}
              to="/grammar"
            />
```

In `src/features/dashboard/ModeCard.tsx`, keep text clear of the kanji in the narrower three-column layout:
- the kanji span uses `text-6xl` at all sizes, at `-top-2 -right-1`;
- the title and description use `pr-28`, with no `sm:` overrides;
- the description keeps `break-keep`.

In `src/App.tsx`, import the two pages and add to the `AppLayout` children, **before** `quiz/:type`:

```tsx
          { path: 'grammar', element: <GrammarLessonsPage /> },
          { path: 'quiz/grammar', element: <GrammarQuizPage /> },
```

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run
npm run build
npm run lint
```

Expected: Vitest 7/7, build OK, and lint shows only the shadcn `components/ui` warnings.

```bash
git add -A
git commit -m "feat: grammar lessons page and fill-in-the-blank grammar quiz"
```

---

### Task 6: Browser check and final review

- [ ] **Step 1: Seed the dev DB** (if not done in Task 2): `npm run seed:grammar` in the backend.
- [ ] **Step 2: Manual run-through in RU and EN at 1440 px:**
  1. The dashboard shows three cards; no text overlaps the kanji.
  2. `/grammar` lists lessons 34–37 first with the "studying now" badge, then lessons 1–10, 14–15 and 19.
  3. Lesson 36 quiz: the sentence shows the blank and the translation is in the UI language.
  4. A correct answer fills the blank in green and auto-advances.
  5. A wrong answer shows red/green options, the blank filled with the right answer, the "Rule" card in the UI language, and "Next".
  6. **(Review Focus #5)** Tab to "Next", press Enter: the counter goes up by exactly 1.
  7. The result screen lists the mistakes as full sentences with the answer filled in.
  8. "All lessons mixed" works. The dashboard streak and accuracy change after a round.
- [ ] **Step 3: 375 px and dark mode**: no horizontal scroll, and long sentences wrap without breaking Japanese words mid-word.
- [ ] **Step 4: Final whole-branch review** with a fresh reviewer, covering both repos. Give the reviewer the Review Focus list. Item 1 (ambiguous exercises) needs a careful read of `grammar.json` by a reviewer who knows Japanese grammar.
