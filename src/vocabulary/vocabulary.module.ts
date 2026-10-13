import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { SharedModule } from '../shared/shared.module';
import { VocabularyController } from './controllers/vocabulary.controller';
import { Word } from './entities/word.entity';
import { WordRepository } from './repositories/word.repository';
import { VocabularyService } from './services/vocabulary.service';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([Word])],
  providers: [VocabularyService, WordRepository, JwtAuthStrategy],
  controllers: [VocabularyController],
  exports: [WordRepository],
})
export class VocabularyModule {}
