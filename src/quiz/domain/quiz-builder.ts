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

interface WordQuestion {
  wordId: number;
  kanji: string | null;
  kana: string;
  options: string[];
}

export interface VocabularyQuestion extends WordQuestion {
  // Russian label for each option (same order); English when a word has no translation.
  optionsRu: string[];
}

export interface VerbQuestion extends WordQuestion {
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
  const label = (w: Word) => ({ en: w.meaningEn, ru: w.meaningRu ?? w.meaningEn });
  const others = pool.filter((w) => w.id !== word.id);
  const candidates = [
    ...shuffle(others.filter((w) => w.partOfSpeech === word.partOfSpeech), rng),
    ...shuffle(others.filter((w) => w.partOfSpeech !== word.partOfSpeech), rng),
  ].map(label);

  // Options must be distinct in both languages (big/large are both «большой»).
  const chosen = [label(word)];
  for (const candidate of candidates) {
    if (chosen.length === OPTIONS_PER_QUESTION) break;
    if (chosen.some((o) => o.en === candidate.en || o.ru === candidate.ru)) continue;
    chosen.push(candidate);
  }

  const options = shuffle(chosen, rng);
  return {
    wordId: word.id,
    kanji: word.kanji,
    kana: word.kana,
    options: options.map((o) => o.en),
    optionsRu: options.map((o) => o.ru),
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
