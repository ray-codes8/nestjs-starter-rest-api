import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { QuizType } from '../../src/progress/constants/quiz-type.constant';
import { ProgressService } from '../../src/progress/services/progress.service';
import { RequestContext } from '../../src/shared/request-context/request-context.dto';
import { JlptLevel } from '../../src/vocabulary/constants/word.constant';
import { WordRepository } from '../../src/vocabulary/repositories/word.repository';
import { closeDBAfterTest } from '../test-utils';
import {
  createNihongoTestApp,
  registerAndLogin,
  seedTestWords,
} from './nihongo-test-utils';

describe('ProgressController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createNihongoTestApp();
    await seedTestWords(app);
    token = await registerAndLogin(app, 'progress-user');
  });

  const getSummary = (level: string) =>
    request(app.getHttpServer())
      .get(`/progress/summary?level=${level}`)
      .set('Authorization', 'Bearer ' + token);

  it('returns an empty summary for a new user', async () => {
    const response = await getSummary('N5').expect(HttpStatus.OK);
    expect(response.body.data).toEqual({
      total: 6,
      learned: 0,
      dueToday: 0,
      streakDays: 0,
      accuracy7d: null,
    });
  });

  it('reflects recorded answers', async () => {
    const userId = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString(),
    ).sub as number;
    const progress = app.get(ProgressService);
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const [, , , , verb] = await app.get(WordRepository).find({ order: { id: 'ASC' } });

    // Answered 3 days ago → box 2, review due 1 day ago.
    await progress.recordAnswer(userId, verb.id, QuizType.Verb, true, past);
    await progress.recordAnswer(userId, verb.id + 1, QuizType.Verb, false, new Date());

    const response = await getSummary('N5').expect(HttpStatus.OK);
    expect(response.body.data).toEqual({
      total: 6,
      learned: 0,
      dueToday: 1,
      streakDays: 1,
      accuracy7d: 0.5,
    });
  });

  it('counts the streak by UTC day even when the local date differs', async () => {
    const otherToken = await registerAndLogin(app, 'streak-user');
    const userId = JSON.parse(Buffer.from(otherToken.split('.')[1], 'base64').toString()).sub as number;
    const progress = app.get(ProgressService);
    const [word] = await app.get(WordRepository).find({ order: { id: 'ASC' } });
    // 20:00 UTC is already the next calendar day in UTC+9 (and still the same day in UTC-5).
    const lateEvening = new Date('2026-10-13T20:00:00Z');
    await progress.recordAnswer(userId, word.id, QuizType.Vocabulary, true, lateEvening);

    const ctx = { user: { id: userId } } as RequestContext;
    const summary = await progress.getSummary(ctx, JlptLevel.N5, lateEvening);
    expect(summary.streakDays).toBe(1);
  });

  it('rejects an unknown level', () => getSummary('N1').expect(HttpStatus.BAD_REQUEST));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
