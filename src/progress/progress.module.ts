import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { SharedModule } from '../shared/shared.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { ProgressController } from './controllers/progress.controller';
import { AnswerLog } from './entities/answer-log.entity';
import { UserExerciseProgress } from './entities/user-exercise-progress.entity';
import { UserWordProgress } from './entities/user-word-progress.entity';
import { AnswerLogRepository } from './repositories/answer-log.repository';
import { UserExerciseProgressRepository } from './repositories/user-exercise-progress.repository';
import { UserWordProgressRepository } from './repositories/user-word-progress.repository';
import { ProgressService } from './services/progress.service';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([
      UserWordProgress,
      UserExerciseProgress,
      AnswerLog,
    ]),
    VocabularyModule,
  ],
  providers: [
    ProgressService,
    UserWordProgressRepository,
    UserExerciseProgressRepository,
    AnswerLogRepository,
    JwtAuthStrategy,
  ],
  controllers: [ProgressController],
  exports: [ProgressService],
})
export class ProgressModule {}
