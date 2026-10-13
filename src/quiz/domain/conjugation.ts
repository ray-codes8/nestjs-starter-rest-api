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
