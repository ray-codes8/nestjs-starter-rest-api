import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthStrategy } from '../auth/strategies/jwt-auth.strategy';
import { SharedModule } from '../shared/shared.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { ExplanationController } from './controllers/explanation.controller';
import {
  ClaudeExplanationGenerator,
  DEFAULT_EXPLANATION_MODEL,
} from './domain/claude-explanation-generator';
import {
  EXPLANATION_GENERATOR,
  ExplanationGenerator,
} from './domain/explanation-generator';
import { Explanation } from './entities/explanation.entity';
import { ExplanationRepository } from './repositories/explanation.repository';
import { ExplanationService } from './services/explanation.service';

// Without an API key the feature is off: the service answers 503 for uncached mistakes.
function createExplanationGenerator(
  config: ConfigService,
): ExplanationGenerator | null {
  const apiKey = config.get<string>('anthropic.apiKey');
  if (!apiKey) {
    return null;
  }
  return new ClaudeExplanationGenerator(
    new Anthropic({ apiKey }),
    config.get<string>('anthropic.model') ?? DEFAULT_EXPLANATION_MODEL,
  );
}

@Module({
  imports: [SharedModule, TypeOrmModule.forFeature([Explanation]), VocabularyModule],
  providers: [
    ExplanationService,
    ExplanationRepository,
    JwtAuthStrategy,
    {
      provide: EXPLANATION_GENERATOR,
      inject: [ConfigService],
      useFactory: createExplanationGenerator,
    },
  ],
  controllers: [ExplanationController],
})
export class ExplanationsModule {}
