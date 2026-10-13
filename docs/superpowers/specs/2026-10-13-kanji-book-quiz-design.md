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
| `--estimate` | Counts tokens for the OCR requests and prints a dollar estimate | free |
| `--submit` | Message Batch, one request per page that has cards. Model `claude-opus-5-5`, effort `low`, JSON-schema output. Refuses to run while a batch is uncollected | paid, after user approval |
| `--collect` | Parses the results. Crops each card's pictograph from the 200 dpi page by the box Claude returned, insets it a few px and trims white margins. Writes `kanji.json` and `pictures/NNN.png` (by kanji number). Reports problems | free |
| `--review` | Writes `review.html`: a grid of every card with its picture and the extracted text, for visual checking | free |

- OCR schema per page: `cards: [{ number, kanji, kun: string[], on: string[], meaningEn,
  meaningRu, strokes, originEn, originRu, compounds: [{ word, reading, meaningEn, meaningRu }],
  picture: { x0, y0, x1, y1 } }]`, where the picture box is the pictograph cell in page fractions (0..1).
  Cards are listed top to bottom. `kun` is in hiragana and `on` in katakana, as printed.
  Translations to Russian are produced in the same request.
- Pictograph cropping uses the box from the OCR (revised after a spike: frame detection by pixel
  heuristics found only about a third of the cells on these skewed scans).
  - Spike on pages 26 and 66 ($0.03): every box was tight around the drawing cell.
  - The crop is inset by 1% of the box size to drop border lines, then white margins are trimmed.
  - Boxes outside 0..1, or degenerate ones, are reported as problems.
  - `local/kanji/overrides.json` can replace a box by kanji number.
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
  - crop geometry (fractions → pixels, inset, bounds, degenerate boxes) on a synthetic image, with border lines removed by the inset and trim;
  - the OCR result parser and validator (complete, duplicate, missing reading, wrong kana script);
  - the question builders for the three types (unique options, the answer included, no leak);
  - answer checking.
- e2e: ranges, the three quiz types, answers (404/400), and the picture route serving only valid
  names (with a test fixture image written to a temp dir).
- Manual:
  - the review HTML for all 100 cards (the learner skims it);
  - a browser run-through.

## Risks

- **Imprecise boxes from the OCR.** Mitigation: inset and trim, the review page, and per-kanji box
  overrides in `local/kanji/overrides.json`.
- **OCR mistakes in readings.** Mitigation: script validation, the review page, and hand edits
  in `kanji.json` (re-run `seed:kanji`).

## Out of scope

Kanji 101–310 (same command later with a wider page range), stroke-order animation, a writing
practice, and committing book content.
