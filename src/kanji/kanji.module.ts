import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { ProgressModule } from '../progress/progress.module';
import { SharedModule } from '../shared/shared.module';
import { KanjiController } from './controllers/kanji.controller';
import { KanjiPictureController } from './controllers/kanji-picture.controller';
import { Kanji } from './entities/kanji.entity';
import { KanjiCompound } from './entities/kanji-compound.entity';
import { KanjiRepository } from './repositories/kanji.repository';
import { KanjiCompoundRepository } from './repositories/kanji-compound.repository';
import { KanjiService } from './services/kanji.service';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([Kanji, KanjiCompound]), ProgressModule],
  providers: [KanjiRepository, KanjiCompoundRepository, KanjiService, JwtAuthStrategy],
  controllers: [KanjiController, KanjiPictureController],
  exports: [KanjiRepository],
})
export class KanjiModule {}
