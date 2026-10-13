import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { QuizType } from '../../src/progress/constants/quiz-type.constant';
import { ProgressService } from '../../src/progress/services/progress.service';
import { Word } from '../../src/vocabulary/entities/word.entity';
import { closeDBAfterTest } from '../test-utils';
import {
  createNihongoTestApp,
  registerAndLogin,
  seedTestWords,
} from './nihongo-test-utils';

describe('QuizController (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let words: Word[];

  beforeAll(async () => {
    app = await createNihongoTestApp();
    words = await seedTestWords(app);
    token = await registerAndLogin(app, 'quiz-user');
  });

  const auth = (req: request.Test) => req.set('Authorization', 'Bearer ' + token);
  const server = () => app.getHttpServer();

  it('returns at most the available words, without duplicates or answers', async () => {
    const response = await auth(request(server()).get('/quiz/vocabulary?level=N5&count=20')).expect(HttpStatus.OK);
    const questions = response.body.data;
    expect(questions).toHaveLength(6);
    expect(new Set(questions.map((q: { wordId: number }) => q.wordId)).size).toBe(6);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(Object.keys(q).sort()).toEqual(['kana', 'kanji', 'options', 'wordId']);
    }
  });

  it('defaults count to 10 and validates it', async () => {
    await auth(request(server()).get('/quiz/vocabulary?level=N5')).expect(HttpStatus.OK);
    await auth(request(server()).get('/quiz/vocabulary?level=N5&count=21')).expect(HttpStatus.BAD_REQUEST);
    await auth(request(server()).get('/quiz/vocabulary?level=N5&count=0')).expect(HttpStatus.BAD_REQUEST);
  });

  it('returns an empty list for a level without words', async () => {
    const response = await auth(request(server()).get('/quiz/vocabulary?level=N4')).expect(HttpStatus.OK);
    expect(response.body.data).toEqual([]);
  });

  it('returns only verbs with a target form for the verb quiz', async () => {
    const response = await auth(request(server()).get('/quiz/verbs?level=N5')).expect(HttpStatus.OK);
    expect(response.body.data).toHaveLength(2);
    for (const q of response.body.data) {
      expect(['masu', 'te', 'nai', 'ta']).toContain(q.form);
      expect(q.options).toHaveLength(4);
    }
  });

  it('records a correct then a wrong answer and updates the summary', async () => {
    const book = words.find((w) => w.kana === 'ほん')!;

    const correct = await auth(request(server()).post('/quiz/answer'))
      .send({ quizType: 'vocabulary', wordId: book.id, answer: 'book' })
      .expect(HttpStatus.OK);
    expect(correct.body.data).toEqual(
      expect.objectContaining({ isCorrect: true, correctAnswer: 'book', newBox: 2, nextReviewAt: expect.any(String) }),
    );

    const wrong = await auth(request(server()).post('/quiz/answer'))
      .send({ quizType: 'vocabulary', wordId: book.id, answer: 'water' })
      .expect(HttpStatus.OK);
    expect(wrong.body.data).toEqual(expect.objectContaining({ isCorrect: false, correctAnswer: 'book', newBox: 1 }));

    const summary = await auth(request(server()).get('/progress/summary?level=N5')).expect(HttpStatus.OK);
    expect(summary.body.data).toEqual({ total: 6, learned: 0, dueToday: 0, streakDays: 1, accuracy7d: 0.5 });
  });

  it('accepts a verb answer in kana', async () => {
    const taberu = words.find((w) => w.kana === 'たべる')!;
    const response = await auth(request(server()).post('/quiz/answer'))
      .send({ quizType: 'verb', wordId: taberu.id, answer: 'たべて', form: 'te' })
      .expect(HttpStatus.OK);
    expect(response.body.data).toEqual(expect.objectContaining({ isCorrect: true, correctAnswer: '食べて' }));
  });

  it('rejects malformed answers with 4xx', async () => {
    const taberu = words.find((w) => w.kana === 'たべる')!;
    const book = words.find((w) => w.kana === 'ほん')!;
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'verb', wordId: taberu.id, answer: '食べて' }).expect(HttpStatus.BAD_REQUEST);
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'verb', wordId: book.id, answer: 'x', form: 'te' }).expect(HttpStatus.BAD_REQUEST);
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'vocabulary', wordId: 99999, answer: 'x' }).expect(HttpStatus.NOT_FOUND);
    await auth(request(server()).post('/quiz/answer')).send({ quizType: 'kanji', wordId: book.id, answer: 'x' }).expect(HttpStatus.BAD_REQUEST);
  });

  it('puts a word that became due an hour ago first, whatever the server timezone', async () => {
    const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub as number;
    const dog = words.find((w) => w.kana === 'いぬ')!;
    // Wrong answer 25 h ago → box 1 → due 1 h ago.
    await app.get(ProgressService).recordAnswer(userId, dog.id, QuizType.Vocabulary, false, new Date(Date.now() - 25 * 60 * 60 * 1000));

    const response = await auth(request(server()).get('/quiz/vocabulary?level=N5&count=1')).expect(HttpStatus.OK);
    expect(response.body.data[0].wordId).toBe(dog.id);
  });

  it('requires a token', () => request(server()).get('/quiz/vocabulary?level=N5').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
