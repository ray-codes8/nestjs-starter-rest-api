import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';

import { Word } from '../entities/word.entity';
import { WordSeed } from '../seed/word-seed';

@Injectable()
export class WordRepository extends Repository<Word> {
  constructor(private dataSource: DataSource) {
    super(Word, dataSource.createEntityManager());
  }

  async getById(id: number): Promise<Word> {
    const word = await this.findOne({ where: { id } });
    if (!word) {
      throw new NotFoundException();
    }

    return word;
  }

  async upsertSeeds(
    seeds: WordSeed[],
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    for (const seed of seeds) {
      const existing = await this.findOne({
        where: {
          kana: seed.kana,
          kanji: seed.kanji ?? IsNull(),
          level: seed.level,
        },
      });
      await this.save({ ...existing, ...seed });
      if (existing) {
        updated++;
      } else {
        inserted++;
      }
    }
    return { inserted, updated };
  }
}
