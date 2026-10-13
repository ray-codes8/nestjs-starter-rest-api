import * as path from 'path';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { KANJI, toRubySegments } from '../domain/ruby';

export const BLANK = '＿＿';
export const MIN_EXERCISES_PER_POINT = 5;

export interface GrammarExerciseSeed {
  sentence: string;
  answer: string;
  distractors: string[];
  // Furigana for this sentence and its options: word or kanji → kana.
  readings: Record<string, string>;
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
const KANA_ONLY = /^[\u3040-\u30ff]+$/;

function readingErrors(label: string, exercise: GrammarExerciseSeed): string[] {
  const errors: string[] = [];
  const readings = exercise.readings ?? {};
  const texts = [exercise.sentence, exercise.answer, ...exercise.distractors];
  const missing = new Set<string>();
  for (const text of texts) {
    for (const segment of toRubySegments(text, readings)) {
      if (segment.reading === undefined) {
        [...segment.text].filter((c) => KANJI.test(c)).forEach((c) => missing.add(c));
      }
    }
  }
  missing.forEach((kanji) => errors.push(`${label}: missing reading for ${kanji}`));
  for (const [key, reading] of Object.entries(readings)) {
    if (!texts.some((text) => text.includes(key))) {
      errors.push(`${label}: unused reading for ${key}`);
    } else if (!KANA_ONLY.test(reading)) {
      errors.push(`${label}: reading for ${key} must be kana`);
    }
  }
  return errors;
}

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
      errors.push(...readingErrors(label, exercise));
    });
  }
  return errors;
}
