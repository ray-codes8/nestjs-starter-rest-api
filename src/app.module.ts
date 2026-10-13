import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArticleModule } from './article/article.module';
import { AuthModule } from './auth/auth.module';
import { ExplanationsModule } from './explanations/explanations.module';
import { ProgressModule } from './progress/progress.module';
import { QuizModule } from './quiz/quiz.module';
import { SharedModule } from './shared/shared.module';
import { UserModule } from './user/user.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';

@Module({
  imports: [
    SharedModule,
    UserModule,
    AuthModule,
    ArticleModule,
    VocabularyModule,
    ProgressModule,
    QuizModule,
    ExplanationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
