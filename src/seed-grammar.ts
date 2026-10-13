import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';

import { AppModule } from './app.module';
import { GrammarPointRepository } from './grammar/repositories/grammar-point.repository';
import { grammarSeedFilePath, loadGrammarSeed, validateGrammarSeed } from './grammar/seed/grammar-seed';

async function bootstrap() {
  const points = loadGrammarSeed(fs.readFileSync(grammarSeedFilePath(), 'utf8'));
  const errors = validateGrammarSeed(points);
  if (errors.length > 0) {
    throw new Error(`grammar.json is invalid:\n${errors.join('\n')}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const result = await app.get(GrammarPointRepository).upsertSeed(points);
  console.log(`grammar: ${result.points} points, ${result.exercises} exercises`);
  await app.close();
}
bootstrap();
