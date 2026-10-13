import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgressModule } from '../progress/progress.module';
import { SharedModule } from '../shared/shared.module';
import { GrammarExercise } from './entities/grammar-exercise.entity';
import { GrammarPoint } from './entities/grammar-point.entity';
import { GrammarPointRepository } from './repositories/grammar-point.repository';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([GrammarPoint, GrammarExercise]), ProgressModule],
  providers: [GrammarPointRepository],
  exports: [GrammarPointRepository],
})
export class GrammarModule {}
