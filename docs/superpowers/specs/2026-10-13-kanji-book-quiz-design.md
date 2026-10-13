# Kanji Book Quiz — Design

Date: 2026-10-13
Status: approved in brainstorming, pending written-spec review

## Goal

Quizzes for the first 100 kanji of the learner's own book, «にほんごチャレンジ かんじ N4-5»
(ASK Publishing), using the book's pictographs. There are three question types:
- picture → kanji
- kanji → meaning
- compound word → reading

After every answer the app shows the kanji card "as in the book": the pictograph, the origin note,
the readings and the compounds.

Branches: `feature/kanji` in both repos.

## Copyright and storage

The book's scans, cropped pictographs and extracted text stay on the learner's machine in
`local/kanji/`, which is already gitignored. The repository contains only the code: the importer,
the module and the UI. Without the import, the kanji module is empty and the UI explains how to
import. Original pictographs (own SVGs) can replace the book's images later for a public version.

## Source

- PDF path: `KANJI_BOOK_PDF` in `.env` (here `~/Desktop/japanese/Kanji_N4-5_001-280.pdf`, 280
  scanned pages at 600 dpi with no text layer). PDF page = book page.
- Kanji cards start on page 26 (#1–3 山・川・田) with up to 3 cards per page. Exercise pages sit
  between lessons. Kanji 1–100 lie within pages 26–95.
- Card layout (see p. 66):
  - a frame with the number and the big kanji;
  - readings, meanings and the stroke order;
  - a row with the kun/on readings, the pictograph cell and the origin note;
  - a table of compounds with readings and meanings (EN/KO/PT; we keep EN).

## Importer — `npm run kanji:import -- <step>` (`src/kanji-import.ts`)

Output goes to `local/kanji/`.

| Step | Does | Cost |
|---|---|---|
| `--render` | Renders pages 26–95 to `pages/page-NNN.png` at 200 dpi (poppler `pdftoppm`) | free |
| `--crop` | Finds card frames and each card's pictograph cell, and writes `crops/page-NNN-S.png` (S = slot 1..3 top-down). Pages without card frames are skipped. Also writes `crops/index.json` with `{ page, slot }` | free |
| `--estimate` | Counts tokens for the OCR requests and prints a dollar estimate | free |
| `--submit` | Message Batch, one request per page that has cards. Model `claude-opus-5-5`, effort `low`, JSON-schema output. Refuses to run while a batch is uncollected | paid, after user approval |
| `--collect` | Parses the results and joins cards to crops by (page, slot order). Writes `kanji.json` and `pictures/NNN.png` (by kanji number). Reports problems | free |
| `--review` | Writes `review.html`: a grid of every card with its picture and the extracted text, for visual checking | free |

- OCR schema per page: `cards: [{ number, kanji, kun: string[], on: string[], meaningEn,
  meaningRu, strokes, originEn, originRu, compounds: [{ word, reading, meaningEn, meaningRu }] }]`.
  Cards are listed top to bottom. `kun` is in hiragana and `on` in katakana, as printed.
  Translations to Russian are produced in the same request.
- Frame detection works on the grayscale page:
  - long horizontal and vertical dark runs give the outer card rectangles;
  - the pictograph cell is the middle cell of the card's second row (between the readings
    column and the origin text column);
  - if detection finds a count different from the OCR card count, `--collect` reports the page
    as a problem instead of guessing.
- Validation in `--collect`:
  - numbers 1–100 complete, with no duplicates;
  - every card has a kanji, at least one reading and a picture;
  - `kun` matches hiragana and `on` matches katakana, after stripping okurigana markers such as
    「・」 and 「-」;
  - every compound has a word, a kana reading and a meaning.

## Data

- `kanji`: id, number (unique), character, kun jsonb, on jsonb, meaningEn, meaningRu, strokes,
  originEn, originRu, picture (file name).
- `kanji_compounds`: id, kanjiId FK, word, reading, meaningEn, meaningRu; unique (kanjiId, word).
- `user_kanji_progress`: userId, kanjiId, quizType (`kanji-picture` | `kanji-meaning` |
  `kanji-reading`), box, nextReviewAt, counts; unique (userId, kanjiId, quizType). Uses `applyAnswer`.
- `answer_log` gains a nullable `kanjiId`. `QuizType` gains the three kanji types. The word
  endpoints still accept only the word types.
- `npm run seed:kanji` upserts from `local/kanji/kanji.json` by number, and compounds by (kanji, word).
  If the file is missing, it prints a hint and does nothing.

## API (JWT; pictures excepted)

- `GET /kanji-pictures/:file` serves `local/kanji/pictures/*.png` as static files without auth
  (needed by `<img>`; local personal app). Only the `NNN.png` pattern is allowed.
- `GET /kanji/ranges` returns `{ total, from, to }` so the UI can offer ranges (1–50, 51–100, all).
- `GET /quiz/kanji?type=picture|meaning|reading&from=1&to=100&count=10`:
  - selection: due items first, then new ones, then the rest, among kanji with from ≤ number ≤ to;
  - `picture` returns `{ kanjiId, pictureUrl, options: string[4] }` (kanji characters from the range);
  - `meaning` returns `{ kanjiId, character, options, optionsRu }`, English canonical, as in the
    vocabulary quiz;
  - `reading` returns `{ kanjiId, compoundId, word, options: string[4] }`, where the options are
    readings of other compounds, preferring ones of similar length;
  - options are unique, and the answer is never sent.
- `POST /kanji/answer` takes `{ type, kanjiId, compoundId?, answer }` and returns
  `{ isCorrect, correctAnswer, newBox, nextReviewAt, card }`:
  - `card` = `{ number, character, kun, on, meaningEn, meaningRu, strokes, originEn, originRu,
    pictureUrl, compounds }`;
  - an unknown kanji or compound returns 404, and a compound that does not belong to the kanji
    returns 400.

## Frontend

- The dashboard gets a fourth card, "Кандзи / 漢字", linking to `/kanji`.
- `/kanji`: pick a range (1–50, 51–100, all) and a question type. If no kanji are imported, show an
  empty state with the import hint.
- `/quiz/kanji?type=…&from=…&to=…` reuses the quiz layout.
- The picture question shows the pictograph large with the kanji options, the meaning question
  shows the kanji large, and the reading question shows the compound word.
- After each answer (correct or wrong):
  - the `KanjiCard` appears: picture → kanji, the origin in the UI language, kun/on, the meaning,
    and the compounds with furigana;
  - "Next" (Enter) advances, with no auto-advance, because the card is the learning moment;
  - the result screen lists the mistakes.
- All new strings go into both `en.ts` and `ru.ts`.

## Testing

- Unit:
  - frame and cell detection on a synthetic grayscale image with drawn rectangles;
  - the OCR result parser and validator (complete, duplicate, missing reading, wrong kana script);
  - the crop-to-card join (count mismatch reported);
  - the question builders for the three types (unique options, the answer included, no leak);
  - answer checking.
- e2e: ranges, the three quiz types, answers (404/400), and the picture route serving only valid
  names (with a test fixture image written to a temp dir).
- Manual:
  - the review HTML for all 100 cards (the learner skims it);
  - a browser run-through.

## Risks

- **Frame detection on some scans** (skew, broken lines). Mitigation: count check against OCR,
  plus the review page. Fallback: fixed relative coordinates for that page, recorded in
  `local/kanji/overrides.json`.
- **OCR mistakes in readings.** Mitigation: script validation, the review page, and hand edits
  in `kanji.json` (re-run `seed:kanji`).

## Out of scope

Kanji 101–310 (same command later with a wider page range), stroke-order animation, a writing
practice, and committing book content.
