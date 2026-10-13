import { AppLogger } from '../../shared/logger/logger.service';
import { WordRepository } from '../../vocabulary/repositories/word.repository';
import { QuizType } from '../constants/quiz-type.constant';
import { AnswerLogRepository } from '../repositories/answer-log.repository';
import { UserExerciseProgressRepository } from '../repositories/user-exercise-progress.repository';
import { UserWordProgressRepository } from '../repositories/user-word-progress.repository';
import { ProgressService } from './progress.service';

const DAY = 24 * 60 * 60 * 1000;

describe('ProgressService.recordExerciseAnswer', () => {
  const now = new Date('2026-10-13T10:00:00Z');

  function setup(existing: object | null) {
    const exerciseProgress = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockResolvedValue({}),
    };
    const answerLog = { save: jest.fn().mockResolvedValue({}) };
    const service = new ProgressService(
      {} as UserWordProgressRepository,
      exerciseProgress as unknown as UserExerciseProgressRepository,
      answerLog as unknown as AnswerLogRepository,
      {} as WordRepository,
      { setContext: jest.fn() } as unknown as AppLogger,
    );
    return { service, exerciseProgress, answerLog };
  }

  it('creates progress for a first correct answer and logs it as grammar', async () => {
    const { service, exerciseProgress, answerLog } = setup(null);
    await expect(service.recordExerciseAnswer(7, 3, true, now)).resolves.toEqual({
      box: 2,
      nextReviewAt: new Date(now.getTime() + 2 * DAY),
    });
    expect(exerciseProgress.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, exerciseId: 3, box: 2, correctCount: 1, wrongCount: 0 }),
    );
    expect(answerLog.save).toHaveBeenCalledWith({
      userId: 7,
      wordId: null,
      exerciseId: 3,
      quizType: QuizType.Grammar,
      isCorrect: true,
      createdAt: now,
    });
  });

  it('drops an existing exercise back to box 1 on a wrong answer', async () => {
    const { service, exerciseProgress } = setup({ id: 1, userId: 7, exerciseId: 3, box: 4, correctCount: 3, wrongCount: 0 });
    await expect(service.recordExerciseAnswer(7, 3, false, now)).resolves.toEqual({
      box: 1,
      nextReviewAt: new Date(now.getTime() + DAY),
    });
    expect(exerciseProgress.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, box: 1, correctCount: 3, wrongCount: 1 }));
  });
});
