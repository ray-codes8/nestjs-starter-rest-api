import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { UserKanjiProgress } from '../entities/user-kanji-progress.entity';

@Injectable()
export class UserKanjiProgressRepository extends Repository<UserKanjiProgress> {
  constructor(private dataSource: DataSource) {
    super(UserKanjiProgress, dataSource.createEntityManager());
  }
}
