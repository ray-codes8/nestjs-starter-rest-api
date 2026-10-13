import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { VerbForm } from '../../quiz/domain/conjugation';
import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import {
  JlptLevel,
  PartOfSpeech,
} from '../../vocabulary/constants/word.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import { ExplanationLanguage } from '../constants/explanation-language.constant';
import {
  ExplanationGenerator,
  ExplanationUnavailableError,
} from '../domain/explanation-generator';
import { ExplanationPayload } from '../domain/explanation-schema';
import { ExplanationRepository } from '../repositories/explanation.repository';
import { ExplanationService } from './explanation.service';

const taberu: Word = {
  id: 2,
  kanji: '食べる',
  kana: 'たべる',
  romaji: 'taberu',
  meaningEn: 'to eat',
  meaningRu: null,
  partOfSpeech: PartOfSpeech.Verb,
  verbGroup: 2,
  level: JlptLevel.N5,
  lesson: null,
};

const payload: ExplanationPayload = {
  explanation: 'Group 2 verbs drop る and add て.',
  rule: 'る-verbs: stem + て.',
  example: { japanese: 'ご飯を食べて、寝ます。', reading: 'ごはんをたべて、ねます。', translation: 'I eat and sleep.' },
};

const ctx = { user: { id: 7 } } as RequestContext;
const verbInput = {
  quizType: QuizType.Verb,
  wordId: taberu.id,
  chosenAnswer: '食べって',
  form: VerbForm.Te,
  language: ExplanationLanguage.En,
};

function setup(options: { cached?: ExplanationPayload; generator?: ExplanationGenerator | null } = {}) {
  const words = { getById: jest.fn().mockResolvedValue(taberu) };
  const explanations = {
    findCached: jest.fn().mockResolvedValue(options.cached ? { payload: options.cached } : null),
    saveOrGetExisting: jest.fn().mockImplementation(async (_key, saved) => ({ payload: saved })),
  };
  const generator =
    options.generator === undefined
      ? { model: 'test-model', generate: jest.fn().mockResolvedValue(payload) }
      : options.generator;
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn() };
  const service = new ExplanationService(
    words as unknown as WordRepository,
    explanations as unknown as ExplanationRepository,
    generator,
    logger as unknown as AppLogger,
  );
  return { service, words, explanations, generator };
}

describe('ExplanationService', () => {
  it('returns a cached explanation without calling the generator', async () => {
    const { service, generator, explanations } = setup({ cached: payload });
    await expect(service.explain(ctx, verbInput)).resolves.toEqual({ ...payload, cached: true });
    expect(generator!.generate).not.toHaveBeenCalled();
    expect(explanations.findCached).toHaveBeenCalledWith({
      wordId: 2,
      quizType: QuizType.Verb,
      form: VerbForm.Te,
      chosenAnswer: '食べって',
      language: ExplanationLanguage.En,
    });
  });

  it('generates, saves and returns a new explanation with the server-side correct answer', async () => {
    const { service, generator, explanations } = setup();
    await expect(service.explain(ctx, verbInput)).resolves.toEqual({ ...payload, cached: false });
    expect(generator!.generate).toHaveBeenCalledWith({
      kanji: '食べる',
      kana: 'たべる',
      meaningEn: 'to eat',
      meaningRu: null,
      quizType: QuizType.Verb,
      form: VerbForm.Te,
      correctAnswer: '食べて',
      chosenAnswer: '食べって',
      language: ExplanationLanguage.En,
    });
    expect(explanations.saveOrGetExisting).toHaveBeenCalledWith(
      expect.objectContaining({ wordId: 2, form: VerbForm.Te }),
      payload,
      'test-model',
    );
  });

  it('uses an empty form in the cache key for vocabulary answers', async () => {
    const { service, explanations } = setup();
    await service.explain(ctx, {
      quizType: QuizType.Vocabulary,
      wordId: 2,
      chosenAnswer: 'to drink',
      form: VerbForm.Te,
      language: ExplanationLanguage.Ru,
    });
    expect(explanations.findCached).toHaveBeenCalledWith(expect.objectContaining({ form: '', language: ExplanationLanguage.Ru }));
  });

  it('rejects a correct answer with 400', async () => {
    const { service } = setup();
    await expect(service.explain(ctx, { ...verbInput, chosenAnswer: '食べて' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a verb answer without form with 400', async () => {
    const { service } = setup();
    await expect(service.explain(ctx, { ...verbInput, form: undefined })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 503 when no generator is configured and nothing is cached', async () => {
    const { service } = setup({ generator: null });
    await expect(service.explain(ctx, verbInput)).rejects.toThrow(
      new ServiceUnavailableException('AI explanations are not configured'),
    );
  });

  it('still serves cached explanations when no generator is configured', async () => {
    const { service } = setup({ generator: null, cached: payload });
    await expect(service.explain(ctx, verbInput)).resolves.toEqual({ ...payload, cached: true });
  });

  it('maps generator failures to 503', async () => {
    const failing = { model: 'm', generate: jest.fn().mockRejectedValue(new ExplanationUnavailableError('boom')) };
    const { service } = setup({ generator: failing });
    await expect(service.explain(ctx, verbInput)).rejects.toThrow(
      new ServiceUnavailableException('AI explanation unavailable, please try again'),
    );
  });
});
