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
