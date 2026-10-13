import { Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';

import { ProgressService } from '../../progress/services/progress.service';
import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import { checkAnswer } from '../domain/answer-checker';
import { VerbForm } from '../domain/conjugation';
import {
  buildVerbQuestion,
  buildVocabularyQuestion,
  shuffle,
} from '../domain/quiz-builder';
import { QuizAnswerInput } from '../dtos/quiz-answer-input.dto';
import {
  QuizAnswerOutput,
  VerbQuestionOutput,
  VocabularyQuestionOutput,
} from '../dtos/quiz-output.dto';

@Injectable()
export class QuizService {
  constructor(
    private wordRepository: WordRepository,
    private progressService: ProgressService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(QuizService.name);
  }

  async getVocabularyQuiz(
    ctx: RequestContext,
    level: JlptLevel,
    count: number,
  ): Promise<VocabularyQuestionOutput[]> {
    this.logger.log(ctx, `${this.getVocabularyQuiz.name} was called`);

    const selected = await this.wordRepository.findForQuiz(ctx.user!.id, level, count, false);
    if (selected.length === 0) {
      return [];
    }
    const pool = await this.wordRepository.find({ where: { level } });
    return selected.map((word) => buildVocabularyQuestion(word, pool));
  }

  async getVerbQuiz(
    ctx: RequestContext,
    level: JlptLevel,
    count: number,
  ): Promise<VerbQuestionOutput[]> {
    this.logger.log(ctx, `${this.getVerbQuiz.name} was called`);

    const selected = await this.wordRepository.findForQuiz(ctx.user!.id, level, count, true);
    if (selected.length === 0) {
      return [];
    }
    const pool = await this.wordRepository.find({
      where: { level, verbGroup: Not(IsNull()) },
    });
    const forms = Object.values(VerbForm);
    return selected.map((word) =>
      buildVerbQuestion(word, shuffle(forms)[0], pool),
    );
  }

  async answer(
    ctx: RequestContext,
    input: QuizAnswerInput,
  ): Promise<QuizAnswerOutput> {
    this.logger.log(ctx, `${this.answer.name} was called`);

    const word = await this.wordRepository.getById(input.wordId);
    const { isCorrect, correctAnswer } = checkAnswer(word, input);
    const { box, nextReviewAt } = await this.progressService.recordAnswer(
      ctx.user!.id,
      word.id,
      input.quizType,
      isCorrect,
      new Date(),
    );

    return { isCorrect, correctAnswer, newBox: box, nextReviewAt };
  }
}
