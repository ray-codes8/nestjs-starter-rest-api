import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { UserKanjiProgress } from '../../progress/entities/user-kanji-progress.entity';
import { Kanji } from '../entities/kanji.entity';
import { KanjiCompound } from '../entities/kanji-compound.entity';
import { KanjiData } from '../seed/kanji-seed';

@Injectable()
export class KanjiRepository extends Repository<Kanji> {
  constructor(private dataSource: DataSource) {
    super(Kanji, dataSource.createEntityManager());
  }

  async upsertSeed(cards: KanjiData[]): Promise<number> {
    const compounds = this.manager.getRepository(KanjiCompound);
    for (const card of cards) {
      const existing = await this.findOne({ where: { number: card.number } });
      const kanji = await this.save({
        ...existing,
        number: card.number,
        character: card.kanji,
        kunReadings: card.kun,
        onReadings: card.on,
        meaningEn: card.meaningEn,
        meaningRu: card.meaningRu,
        strokes: card.strokes,
        originEn: card.originEn,
        originRu: card.originRu,
        picture: card.picture,
      });
      for (const compound of card.compounds) {
        const current = await compounds.findOne({ where: { kanjiId: kanji.id, word: compound.word } });
        await compounds.save({ ...current, ...compound, kanjiId: kanji.id });
      }
    }
    return cards.length;
  }

  async getByIdWithCompounds(id: number): Promise<Kanji> {
    const kanji = await this.findOne({ where: { id }, relations: { compounds: true } });
    if (!kanji) {
      throw new NotFoundException();
    }
    return kanji;
  }

  // Due kanji first, then never-answered ones, then the rest; random inside each group.
  findForQuiz(userId: number, quizType: QuizType, from: number, to: number, count: number): Promise<Kanji[]> {
    return this.createQueryBuilder('k')
      .leftJoin(UserKanjiProgress, 'up', 'up.kanjiId = k.id AND up.userId = :userId AND up.quizType = :quizType', {
        userId,
        quizType,
      })
      .where('k.number BETWEEN :from AND :to', { from, to })
      .addSelect(`CASE WHEN up."nextReviewAt" <= :now THEN 0 WHEN up."id" IS NULL THEN 1 ELSE 2 END`, 'priority')
      .setParameter('now', new Date())
      .orderBy('priority', 'ASC')
      .addOrderBy('RANDOM()')
      .limit(count)
      .getMany();
  }
}
