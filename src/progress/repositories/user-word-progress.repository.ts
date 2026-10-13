import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { LEARNED_MIN_BOX } from '../domain/leitner';
import { UserWordProgress } from '../entities/user-word-progress.entity';

@Injectable()
export class UserWordProgressRepository extends Repository<UserWordProgress> {
  constructor(private dataSource: DataSource) {
    super(UserWordProgress, dataSource.createEntityManager());
  }

  countLearned(userId: number, level: JlptLevel): Promise<number> {
    return this.createQueryBuilder('p')
      .innerJoin('p.word', 'w')
      .where('p.userId = :userId', { userId })
      .andWhere('w.level = :level', { level })
      .andWhere('p.box >= :minBox', { minBox: LEARNED_MIN_BOX })
      .getCount();
  }

  countDue(userId: number, level: JlptLevel, now: Date): Promise<number> {
    return this.createQueryBuilder('p')
      .innerJoin('p.word', 'w')
      .where('p.userId = :userId', { userId })
      .andWhere('w.level = :level', { level })
      .andWhere('p.nextReviewAt <= :now', { now })
      .getCount();
  }
}
