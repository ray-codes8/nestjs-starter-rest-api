import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { UserExerciseProgress } from '../../progress/entities/user-exercise-progress.entity';
import { GrammarExercise } from '../entities/grammar-exercise.entity';

@Injectable()
export class GrammarExerciseRepository extends Repository<GrammarExercise> {
  constructor(private dataSource: DataSource) {
    super(GrammarExercise, dataSource.createEntityManager());
  }

  async getByIdWithPoint(id: number): Promise<GrammarExercise> {
    const exercise = await this.findOne({ where: { id }, relations: { point: true } });
    if (!exercise) {
      throw new NotFoundException();
    }
    return exercise;
  }

  // Due exercises first, then never-answered ones, then the rest; random inside each group.
  findForQuiz(userId: number, lesson: number | null, count: number): Promise<GrammarExercise[]> {
    const query = this.createQueryBuilder('e')
      .innerJoinAndSelect('e.point', 'p')
      .leftJoin(UserExerciseProgress, 'up', 'up.exerciseId = e.id AND up.userId = :userId', { userId });
    if (lesson !== null) {
      query.where(':lesson BETWEEN p.lesson AND COALESCE(p."lessonTo", p.lesson)', { lesson });
    }
    return query
      .addSelect(
        `CASE WHEN up."nextReviewAt" <= :now THEN 0 WHEN up."id" IS NULL THEN 1 ELSE 2 END`,
        'priority',
      )
      .setParameter('now', new Date())
      .orderBy('priority', 'ASC')
      .addOrderBy('up.nextReviewAt', 'ASC', 'NULLS LAST')
      .addOrderBy('RANDOM()')
      .limit(count)
      .getMany();
  }
}
