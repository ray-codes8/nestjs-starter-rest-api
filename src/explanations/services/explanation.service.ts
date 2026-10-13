import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { checkAnswer } from '../../quiz/domain/answer-checker';
import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import {
  EXPLANATION_GENERATOR,
  ExplanationGenerator,
} from '../domain/explanation-generator';
import { ExplanationInput } from '../dtos/explanation-input.dto';
import { ExplanationOutput } from '../dtos/explanation-output.dto';
import {
  ExplanationKey,
  ExplanationRepository,
} from '../repositories/explanation.repository';

@Injectable()
export class ExplanationService {
  constructor(
    private wordRepository: WordRepository,
    private explanationRepository: ExplanationRepository,
    @Inject(EXPLANATION_GENERATOR)
    private generator: ExplanationGenerator | null,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ExplanationService.name);
  }

  async explain(
    ctx: RequestContext,
    input: ExplanationInput,
  ): Promise<ExplanationOutput> {
    this.logger.log(ctx, `${this.explain.name} was called`);

    const word = await this.wordRepository.getById(input.wordId);
    const { isCorrect, correctAnswer } = checkAnswer(word, {
      quizType: input.quizType,
      answer: input.chosenAnswer,
      form: input.form,
    });
    if (isCorrect) {
      throw new BadRequestException('Nothing to explain: the answer is correct');
    }

    const form = input.quizType === QuizType.Verb ? (input.form ?? null) : null;
    const key: ExplanationKey = {
      wordId: word.id,
      quizType: input.quizType,
      form: form ?? '',
      chosenAnswer: input.chosenAnswer,
      language: input.language,
    };

    const cached = await this.explanationRepository.findCached(key);
    if (cached) {
      return { ...cached.payload, cached: true };
    }
    if (!this.generator) {
      throw new ServiceUnavailableException('AI explanations are not configured');
    }

    let payload;
    try {
      payload = await this.generator.generate({
        kanji: word.kanji,
        kana: word.kana,
        meaningEn: word.meaningEn,
        quizType: input.quizType,
        form,
        correctAnswer,
        chosenAnswer: input.chosenAnswer,
        language: input.language,
      });
    } catch (error) {
      this.logger.warn(ctx, 'Explanation generation failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw new ServiceUnavailableException('AI explanation unavailable, please try again');
    }

    const saved = await this.explanationRepository.saveOrGetExisting(
      key,
      payload,
      this.generator.model,
    );
    return { ...saved.payload, cached: false };
  }
}
