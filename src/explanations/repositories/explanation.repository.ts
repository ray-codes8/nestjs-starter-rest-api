import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { ExplanationLanguage } from '../constants/explanation-language.constant';
import { ExplanationPayload } from '../domain/explanation-schema';
import { Explanation } from '../entities/explanation.entity';

export interface ExplanationKey {
  wordId: number;
  quizType: QuizType;
  form: string;
  chosenAnswer: string;
  language: ExplanationLanguage;
}

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class ExplanationRepository extends Repository<Explanation> {
  constructor(private dataSource: DataSource) {
    super(Explanation, dataSource.createEntityManager());
  }

  findCached(key: ExplanationKey): Promise<Explanation | null> {
    return this.findOne({ where: { ...key } });
  }

  async saveOrGetExisting(
    key: ExplanationKey,
    payload: ExplanationPayload,
    model: string,
  ): Promise<Explanation> {
    try {
      return await this.save(this.create({ ...key, payload, model }));
    } catch (error) {
      // Two identical requests raced; the other one already stored it.
      const code = (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code;
      if (error instanceof QueryFailedError && code === UNIQUE_VIOLATION) {
        return this.findOneOrFail({ where: { ...key } });
      }
      throw error;
    }
  }
}
