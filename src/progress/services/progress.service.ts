import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import { QuizType } from '../constants/quiz-type.constant';
import { applyAnswer } from '../domain/leitner';
import { computeStreak, toDayString } from '../domain/streak';
import { ProgressSummaryOutput } from '../dtos/progress-summary-output.dto';
import { AnswerLogRepository } from '../repositories/answer-log.repository';
import { UserWordProgressRepository } from '../repositories/user-word-progress.repository';

const ACCURACY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STREAK_WINDOW_MS = 400 * 24 * 60 * 60 * 1000;

@Injectable()
export class ProgressService {
  constructor(
    private progressRepository: UserWordProgressRepository,
    private answerLogRepository: AnswerLogRepository,
    private wordRepository: WordRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ProgressService.name);
  }

  async recordAnswer(
    userId: number,
    wordId: number,
    quizType: QuizType,
    isCorrect: boolean,
    now: Date,
  ): Promise<{ box: number; nextReviewAt: Date }> {
    const existing = await this.progressRepository.findOne({
      where: { userId, wordId },
    });
    const next = applyAnswer(existing?.box ?? null, isCorrect, now);

    await this.progressRepository.save({
      ...existing,
      userId,
      wordId,
      box: next.box,
      nextReviewAt: next.nextReviewAt,
      correctCount: (existing?.correctCount ?? 0) + (isCorrect ? 1 : 0),
      wrongCount: (existing?.wrongCount ?? 0) + (isCorrect ? 0 : 1),
    });
    await this.answerLogRepository.save({
      userId,
      wordId,
      quizType,
      isCorrect,
      createdAt: now,
    });

    return next;
  }

  async getSummary(
    ctx: RequestContext,
    level: JlptLevel,
    now: Date = new Date(),
  ): Promise<ProgressSummaryOutput> {
    this.logger.log(ctx, `${this.getSummary.name} was called`);
    const userId = ctx.user!.id;

    const [total, learned, dueToday, activeDays, accuracy7d] =
      await Promise.all([
        this.wordRepository.count({ where: { level } }),
        this.progressRepository.countLearned(userId, level),
        this.progressRepository.countDue(userId, level, now),
        this.answerLogRepository.getActiveDays(
          userId,
          new Date(now.getTime() - STREAK_WINDOW_MS),
        ),
        this.answerLogRepository.getAccuracySince(
          userId,
          new Date(now.getTime() - ACCURACY_WINDOW_MS),
        ),
      ]);

    return {
      total,
      learned,
      dueToday,
      streakDays: computeStreak(activeDays, toDayString(now)),
      accuracy7d,
    };
  }
}
