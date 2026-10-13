import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { UserExerciseProgress } from '../entities/user-exercise-progress.entity';

@Injectable()
export class UserExerciseProgressRepository extends Repository<UserExerciseProgress> {
  constructor(private dataSource: DataSource) {
    super(UserExerciseProgress, dataSource.createEntityManager());
  }
}
