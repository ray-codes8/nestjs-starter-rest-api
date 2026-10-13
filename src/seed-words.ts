import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';

import { AppModule } from './app.module';
import { JlptLevel } from './vocabulary/constants/word.constant';
import { WordRepository } from './vocabulary/repositories/word.repository';
import {
  loadRuMeanings,
  loadWordSeeds,
  wordSeedFilePath,
} from './vocabulary/seed/word-seed';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repository = app.get(WordRepository);
  const ruMeanings = loadRuMeanings();

  for (const level of [JlptLevel.N5, JlptLevel.N4]) {
    const seeds = loadWordSeeds(
      fs.readFileSync(wordSeedFilePath(level), 'utf8'),
      level,
      ruMeanings,
    );
    const { inserted, updated } = await repository.upsertSeeds(seeds);
    console.log(
      `${level}: ${inserted} inserted, ${updated} updated, ${seeds.filter((s) => s.meaningRu).length} with Russian`,
    );
  }

  await app.close();
}
bootstrap();
