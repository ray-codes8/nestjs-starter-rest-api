import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { AnswerLog } from '../entities/answer-log.entity';

@Injectable()
export class AnswerLogRepository extends Repository<AnswerLog> {
  constructor(private dataSource: DataSource) {
    super(AnswerLog, dataSource.createEntityManager());
  }

  async getActiveDays(userId: number): Promise<string[]> {
    const rows = await this.createQueryBuilder('a')
      .select(`DISTINCT TO_CHAR(a."createdAt", 'YYYY-MM-DD')`, 'day')
      .where('a.userId = :userId', { userId })
      .orderBy('day', 'DESC')
      .limit(400)
      .getRawMany<{ day: string }>();
    return rows.map((row) => row.day);
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
