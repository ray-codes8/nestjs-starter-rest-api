import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { toDayString } from '../domain/streak';
import { AnswerLog } from '../entities/answer-log.entity';

@Injectable()
export class AnswerLogRepository extends Repository<AnswerLog> {
  constructor(private dataSource: DataSource) {
    super(AnswerLog, dataSource.createEntityManager());
  }

  async getActiveDays(userId: number, since: Date): Promise<string[]> {
    const rows = await this.createQueryBuilder('a')
      .select('a.createdAt', 'createdAt')
      .where('a.userId = :userId', { userId })
      .andWhere('a.createdAt >= :since', { since })
      .getRawMany<{ createdAt: Date }>();
    // Days are derived in JS so they use the same calendar as toDayString(now).
    return [...new Set(rows.map((row) => toDayString(new Date(row.createdAt))))];
  }

  async getAccuracySince(userId: number, since: Date): Promise<number | null> {
    const row = await this.createQueryBuilder('a')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE a."isCorrect")', 'correct')
      .where('a.userId = :userId', { userId })
      .andWhere('a.createdAt >= :since', { since })
      .getRawOne<{ total: string; correct: string }>();

    const total = Number(row?.total ?? 0);
    return total === 0 ? null : Number(row?.correct ?? 0) / total;
  }
}
