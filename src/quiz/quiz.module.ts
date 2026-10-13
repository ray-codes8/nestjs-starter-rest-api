import { Module } from '@nestjs/common';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { ProgressModule } from '../progress/progress.module';
import { SharedModule } from '../shared/shared.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { QuizController } from './controllers/quiz.controller';
import { QuizService } from './services/quiz.service';

@Module({
  imports: [SharedModule, VocabularyModule, ProgressModule],
  providers: [QuizService, JwtAuthStrategy],
  controllers: [QuizController],
})
export class QuizModule {}
