import { HttpStatus, INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import request from 'supertest';

import { GrammarExercise } from '../../src/grammar/entities/grammar-exercise.entity';
import { GrammarPointRepository } from '../../src/grammar/repositories/grammar-point.repository';
import { grammarSeedFilePath, loadGrammarSeed } from '../../src/grammar/seed/grammar-seed';
import { closeDBAfterTest } from '../test-utils';
import { createNihongoTestApp, registerAndLogin } from './nihongo-test-utils';

describe('Grammar (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createNihongoTestApp();
    await app.get(GrammarPointRepository).upsertSeed(loadGrammarSeed(fs.readFileSync(grammarSeedFilePath(), 'utf8')));
    token = await registerAndLogin(app, 'grammar-user');
  });

  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer ' + token);
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + token).send(body);

  it('lists lessons in order with their points', async () => {
    const response = await get('/grammar/lessons').expect(HttpStatus.OK);
    const lessons = response.body.data;
    expect(lessons.map((l: { lesson: number }) => l.lesson)).toEqual([1, 14, 19, 34, 35, 36, 37]);
    const l36 = lessons.find((l: { lesson: number }) => l.lesson === 36);
    expect(l36).toEqual({
      lesson: 36,
      lessonTo: null,
      level: 'N4',
      points: [expect.objectContaining({ code: 'l36-you-ni', exerciseCount: 9 })],
    });
  });

  it('returns a lesson quiz without answers, unique and with 4 options', async () => {
    const response = await get('/quiz/grammar?lesson=36&count=20').expect(HttpStatus.OK);
    const questions = response.body.data;
    expect(questions).toHaveLength(9);
    expect(new Set(questions.map((q: { exerciseId: number }) => q.exerciseId)).size).toBe(9);
    for (const q of questions) {
      expect(Object.keys(q).sort()).toEqual(['exerciseId', 'lesson', 'options', 'pointTitle', 'readings', 'sentence', 'translation']);
      expect(new Set(q.options).size).toBe(4);
      expect(q.sentence).toContain('＿＿');
    }
  });

  it('matches range lessons, mixes all lessons and returns [] for an empty lesson', async () => {
    const range = await get('/quiz/grammar?lesson=3').expect(HttpStatus.OK);
    expect(range.body.data.length).toBeGreaterThan(0);
    expect(range.body.data.every((q: { lesson: number }) => q.lesson === 1)).toBe(true);

    const all = await get('/quiz/grammar?lesson=all&count=5').expect(HttpStatus.OK);
    expect(all.body.data).toHaveLength(5);

    const empty = await get('/quiz/grammar?lesson=49').expect(HttpStatus.OK);
    expect(empty.body.data).toEqual([]);
  });

  it('validates the query', async () => {
    await get('/quiz/grammar?lesson=abc').expect(HttpStatus.BAD_REQUEST);
    await get('/quiz/grammar?lesson=36&count=21').expect(HttpStatus.BAD_REQUEST);
  });

  it('records answers, returns the rule and counts them in the summary', async () => {
    const exercise = await app
      .get(GrammarPointRepository)
      .manager.getRepository(GrammarExercise)
      .findOneOrFail({ where: { sentence: '遅刻しない＿＿、早く家を出ます。' } });

    const correct = await post('/grammar/answer', { exerciseId: exercise.id, answer: 'ように' }).expect(HttpStatus.OK);
    expect(correct.body.data).toEqual(
      expect.objectContaining({ isCorrect: true, correctAnswer: 'ように', newBox: 2 }),
    );
    expect(correct.body.data.rule.ru).toContain('ように');

    const wrong = await post('/grammar/answer', { exerciseId: exercise.id, answer: 'ために' }).expect(HttpStatus.OK);
    expect(wrong.body.data).toEqual(expect.objectContaining({ isCorrect: false, newBox: 1 }));

    const summary = await get('/progress/summary?level=N5').expect(HttpStatus.OK);
    expect(summary.body.data).toEqual(expect.objectContaining({ streakDays: 1, accuracy7d: 0.5, learned: 0 }));
  });

  it('rejects bad answers', async () => {
    await post('/grammar/answer', { exerciseId: 999999, answer: 'x' }).expect(HttpStatus.NOT_FOUND);
    await post('/grammar/answer', { exerciseId: 1, answer: '' }).expect(HttpStatus.BAD_REQUEST);
    await post('/grammar/answer', { exerciseId: 1, answer: 'x'.repeat(101) }).expect(HttpStatus.BAD_REQUEST);
  });

  it('keeps word endpoints closed to the grammar quiz type', async () => {
    await post('/quiz/answer', { quizType: 'grammar', wordId: 1, answer: 'x' }).expect(HttpStatus.BAD_REQUEST);
    await post('/explanations', { quizType: 'grammar', wordId: 1, chosenAnswer: 'x', language: 'en' }).expect(HttpStatus.BAD_REQUEST);
  });

  it('requires a token', () => request(app.getHttpServer()).get('/grammar/lessons').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
