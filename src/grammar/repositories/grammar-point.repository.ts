import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { GrammarExercise } from '../entities/grammar-exercise.entity';
import { GrammarPoint } from '../entities/grammar-point.entity';
import { GrammarPointSeed } from '../seed/grammar-seed';

@Injectable()
export class GrammarPointRepository extends Repository<GrammarPoint> {
  constructor(private dataSource: DataSource) {
    super(GrammarPoint, dataSource.createEntityManager());
  }

  async upsertSeed(points: GrammarPointSeed[]): Promise<{ points: number; exercises: number }> {
    const exercises = this.manager.getRepository(GrammarExercise);
    let exerciseCount = 0;
    for (const { exercises: exerciseSeeds, ...pointSeed } of points) {
      const existing = await this.findOne({ where: { code: pointSeed.code } });
      const point = await this.save({ ...existing, ...pointSeed });
      for (const exerciseSeed of exerciseSeeds) {
        const current = await exercises.findOne({
          where: { pointId: point.id, sentence: exerciseSeed.sentence },
        });
        await exercises.save({ ...current, ...exerciseSeed, pointId: point.id });
        exerciseCount++;
      }
    }
    return { points: points.length, exercises: exerciseCount };
  }
}
