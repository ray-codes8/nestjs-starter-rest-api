import { Injectable } from '@nestjs/common';

import { ProgressService } from '../../progress/services/progress.service';
import { AppLogger } from '../../shared/logger/logger.service';
import { RequestContext } from '../../shared/request-context/request-context.dto';
import { buildGrammarQuestion, isCorrectGrammarAnswer } from '../domain/grammar-quiz';
import { GrammarAnswerInput } from '../dtos/grammar-answer-input.dto';
import { GrammarAnswerOutput, GrammarLessonOutput, GrammarQuestionOutput } from '../dtos/grammar-output.dto';
import { GrammarExerciseRepository } from '../repositories/grammar-exercise.repository';
import { GrammarPointRepository } from '../repositories/grammar-point.repository';

@Injectable()
export class GrammarService {
  constructor(
    private pointRepository: GrammarPointRepository,
    private exerciseRepository: GrammarExerciseRepository,
    private progressService: ProgressService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(GrammarService.name);
  }

  async getLessons(ctx: RequestContext): Promise<GrammarLessonOutput[]> {
    this.logger.log(ctx, `${this.getLessons.name} was called`);
    const points = await this.pointRepository.find({
      relations: { exercises: true },
      order: { lesson: 'ASC', id: 'ASC' },
    });

    const lessons = new Map<string, GrammarLessonOutput>();
    for (const point of points) {
      const key = `${point.lesson}-${point.lessonTo ?? ''}`;
      const lesson = lessons.get(key) ?? { lesson: point.lesson, lessonTo: point.lessonTo, level: point.level, points: [] };
      lesson.points.push({ id: point.id, code: point.code, title: point.title, exerciseCount: point.exercises.length });
      lessons.set(key, lesson);
    }
    return [...lessons.values()];
  }

  async getQuiz(ctx: RequestContext, lesson: string, count: number): Promise<GrammarQuestionOutput[]> {
    this.logger.log(ctx, `${this.getQuiz.name} was called`);
    const exercises = await this.exerciseRepository.findForQuiz(
      ctx.user!.id,
      lesson === 'all' ? null : Number(lesson),
      count,
    );
    return exercises.map((exercise) => buildGrammarQuestion(exercise));
  }

  async answer(ctx: RequestContext, input: GrammarAnswerInput): Promise<GrammarAnswerOutput> {
    this.logger.log(ctx, `${this.answer.name} was called`);
    const exercise = await this.exerciseRepository.getByIdWithPoint(input.exerciseId);
    const isCorrect = isCorrectGrammarAnswer(exercise, input.answer);
    const { box, nextReviewAt } = await this.progressService.recordExerciseAnswer(
      ctx.user!.id,
      exercise.id,
      isCorrect,
      new Date(),
    );
    return {
      isCorrect,
      correctAnswer: exercise.answer,
      newBox: box,
      nextReviewAt,
      rule: { en: exercise.point.ruleEn, ru: exercise.point.ruleRu },
    };
  }
}
