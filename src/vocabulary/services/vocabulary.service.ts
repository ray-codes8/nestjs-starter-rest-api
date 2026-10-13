import { Injectable } from '@nestjs/common';
import { plainToClass } from 'class-transformer';

import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { JlptLevel } from '../constants/word.constant';
import { WordOutput } from '../dtos/word-output.dto';
import { WordRepository } from '../repositories/word.repository';

@Injectable()
export class VocabularyService {
  constructor(
    private repository: WordRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(VocabularyService.name);
  }

  async getWords(
    ctx: RequestContext,
    level: JlptLevel,
    limit: number,
    offset: number,
  ): Promise<{ words: WordOutput[]; count: number }> {
    this.logger.log(ctx, `${this.getWords.name} was called`);

    const [words, count] = await this.repository.findAndCount({
      where: { level },
      order: { id: 'ASC' },
      take: limit,
      skip: offset,
    });

    return {
      words: plainToClass(WordOutput, words, { excludeExtraneousValues: true }),
      count,
    };
  }
}
