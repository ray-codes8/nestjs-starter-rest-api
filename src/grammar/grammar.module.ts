import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { ProgressModule } from '../progress/progress.module';
import { SharedModule } from '../shared/shared.module';
import { GrammarController } from './controllers/grammar.controller';
import { GrammarExercise } from './entities/grammar-exercise.entity';
import { GrammarPoint } from './entities/grammar-point.entity';
import { GrammarExerciseRepository } from './repositories/grammar-exercise.repository';
import { GrammarPointRepository } from './repositories/grammar-point.repository';
import { GrammarService } from './services/grammar.service';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([GrammarPoint, GrammarExercise]),
    ProgressModule,
  ],
  providers: [
    GrammarPointRepository,
    GrammarExerciseRepository,
    GrammarService,
    JwtAuthStrategy,
  ],
  controllers: [GrammarController],
  exports: [GrammarPointRepository],
})
export class GrammarModule {}
