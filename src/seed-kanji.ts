import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';

import { AppModule } from './app.module';
import { KanjiRepository } from './kanji/repositories/kanji.repository';
import { loadKanjiFile } from './kanji/seed/kanji-seed';

dotenv.config();

async function bootstrap() {
  const dir = process.env.KANJI_DIR || 'local/kanji';
  const cards = loadKanjiFile(dir);
  if (!cards) {
    console.log(`No kanji.json in ${dir}. Run npm run kanji:import first.`);
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule);
  const count = await app.get(KanjiRepository).upsertSeed(cards);
  console.log(`kanji: ${count} seeded`);
  await app.close();
}
bootstrap();
