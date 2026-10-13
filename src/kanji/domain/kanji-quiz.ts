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
