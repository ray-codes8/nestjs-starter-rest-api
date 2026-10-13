import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Between, In } from 'typeorm';

import { ProgressService } from '../../progress/services/progress.service';
import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import {
  buildMeaningQuestion,
  buildPictureQuestion,
  buildReadingQuestion,
  checkKanjiAnswer,
  KanjiQuizKind,
  KIND_TO_QUIZ_TYPE,
  toKanjiCard,
} from '../domain/kanji-quiz';
import { KanjiAnswerInput } from '../dtos/kanji-answer-input.dto';
import { KanjiAnswerOutput, KanjiQuestionOutput, KanjiRangesOutput } from '../dtos/kanji-output.dto';
import { KanjiRepository } from '../repositories/kanji.repository';
import { KanjiCompoundRepository } from '../repositories/kanji-compound.repository';

@Injectable()
export class KanjiService {
  constructor(
    private kanjiRepository: KanjiRepository,
    private compoundRepository: KanjiCompoundRepository,
    private progressService: ProgressService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(KanjiService.name);
  }

  async getRanges(ctx: RequestContext): Promise<KanjiRangesOutput> {
    this.logger.log(ctx, `${this.getRanges.name} was called`);
    const row = await this.kanjiRepository
      .createQueryBuilder('k')
      .select('COUNT(*)', 'total')
      .addSelect('MIN(k.number)', 'from')
      .addSelect('MAX(k.number)', 'to')
      .getRawOne<{ total: string; from: number | null; to: number | null }>();
    return { total: Number(row?.total ?? 0), from: Number(row?.from ?? 0), to: Number(row?.to ?? 0) };
  }

  async getQuiz(
    ctx: RequestContext,
    type: KanjiQuizKind,
    from: number,
    to: number,
    count: number,
  ): Promise<KanjiQuestionOutput[]> {
    this.logger.log(ctx, `${this.getQuiz.name} was called`);
    const selected = await this.kanjiRepository.findForQuiz(ctx.user!.id, KIND_TO_QUIZ_TYPE[type], from, to, count);
    if (selected.length === 0) {
      return [];
    }
    const pool = await this.kanjiRepository.find({ where: { number: Between(from, to) } });
    if (type === 'picture') {
      return selected.map((kanji) => buildPictureQuestion(kanji, pool));
    }
    if (type === 'meaning') {
      return selected.map((kanji) => buildMeaningQuestion(kanji, pool));
    }

    const compounds = await this.compoundRepository.find({ where: { kanjiId: In(pool.map((k) => k.id)) } });
    return selected.flatMap((kanji) => {
      const own = compounds.filter((c) => c.kanjiId === kanji.id);
      if (own.length === 0) return [];
      const compound = own[Math.floor(Math.random() * own.length)];
      return [buildReadingQuestion(kanji, compound, compounds)];
    });
  }

  async answer(ctx: RequestContext, input: KanjiAnswerInput): Promise<KanjiAnswerOutput> {
    this.logger.log(ctx, `${this.answer.name} was called`);
    const kanji = await this.kanjiRepository.getByIdWithCompounds(input.kanjiId);

    let compound = null;
    if (input.type === 'reading') {
      if (!input.compoundId) {
        throw new BadRequestException('compoundId is required for reading answers');
      }
      compound = kanji.compounds.find((c) => c.id === input.compoundId) ?? null;
      if (!compound) {
        const exists = await this.compoundRepository.findOne({ where: { id: input.compoundId } });
        if (exists) {
          throw new BadRequestException('The compound does not belong to this kanji');
        }
        throw new NotFoundException();
      }
    }

    const { isCorrect, correctAnswer } = checkKanjiAnswer(input.type, kanji, compound, input.answer);
    const { box, nextReviewAt } = await this.progressService.recordKanjiAnswer(
      ctx.user!.id,
      kanji.id,
      KIND_TO_QUIZ_TYPE[input.type],
      isCorrect,
      new Date(),
    );
    return { isCorrect, correctAnswer, newBox: box, nextReviewAt, card: toKanjiCard(kanji) };
  }
}
