import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgressModule } from '../progress/progress.module';
import { SharedModule } from '../shared/shared.module';
import { Kanji } from './entities/kanji.entity';
import { KanjiCompound } from './entities/kanji-compound.entity';
import { KanjiRepository } from './repositories/kanji.repository';

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([Kanji, KanjiCompound]), ProgressModule],
  providers: [KanjiRepository],
  exports: [KanjiRepository],
})
export class KanjiModule {}
