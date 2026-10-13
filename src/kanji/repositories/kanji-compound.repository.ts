import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { KanjiCompound } from '../entities/kanji-compound.entity';

@Injectable()
export class KanjiCompoundRepository extends Repository<KanjiCompound> {
  constructor(private dataSource: DataSource) {
    super(KanjiCompound, dataSource.createEntityManager());
  }
}
