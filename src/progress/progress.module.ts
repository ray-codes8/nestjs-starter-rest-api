import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { SharedModule } from '../shared/shared.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { ProgressController } from './controllers/progress.controller';
import { AnswerLog } from './entities/answer-log.entity';
import { UserWordProgress } from './entities/user-word-progress.entity';
import { AnswerLogRepository } from './repositories/answer-log.repository';
import { UserWordProgressRepository } from './repositories/user-word-progress.repository';
import { ProgressService } from './services/progress.service';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([UserWordProgress, AnswerLog]),
    VocabularyModule,
  ],
  providers: [
    ProgressService,
    UserWordProgressRepository,
    AnswerLogRepository,
    JwtAuthStrategy,
  ],
  controllers: [ProgressController],
  exports: [ProgressService],
})
export class ProgressModule {}
