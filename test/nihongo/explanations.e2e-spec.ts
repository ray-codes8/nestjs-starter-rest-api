import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { EXPLANATION_GENERATOR } from '../../src/explanations/domain/explanation-generator';
import { Word } from '../../src/vocabulary/entities/word.entity';
import { closeDBAfterTest } from '../test-utils';
import {
  createNihongoTestApp,
  registerAndLogin,
  seedTestWords,
} from './nihongo-test-utils';

const fakeGenerator = {
  model: 'fake-model',
  generate: jest.fn(async (input: { language: string; correctAnswer: string }) => ({
    explanation: `[${input.language}] The correct answer is ${input.correctAnswer}.`,
    rule: 'rule',
    example: { japanese: '本を読みます。', reading: 'ほんをよみます。', translation: 'I read a book.' },
  })),
};

describe('ExplanationController (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let words: Word[];

  beforeAll(async () => {
    app = await createNihongoTestApp((builder) =>
      builder.overrideProvider(EXPLANATION_GENERATOR).useValue(fakeGenerator),
    );
    words = await seedTestWords(app);
    token = await registerAndLogin(app, 'explain-user');
  });

  const explain = (body: object) =>
    request(app.getHttpServer())
      .post('/explanations')
      .set('Authorization', 'Bearer ' + token)
      .send(body);

  it('explains a wrong verb answer, then serves it from the cache', async () => {
    const taberu = words.find((w) => w.kana === 'たべる')!;
    const body = { quizType: 'verb', wordId: taberu.id, chosenAnswer: '食べって', form: 'te', language: 'en' };

    const first = await explain(body).expect(HttpStatus.OK);
    expect(first.body.data).toEqual(
      expect.objectContaining({ explanation: '[en] The correct answer is 食べて.', cached: false }),
    );
    expect(first.body.data.example.japanese).toBe('本を読みます。');

    const second = await explain(body).expect(HttpStatus.OK);
    expect(second.body.data.cached).toBe(true);
    expect(fakeGenerator.generate).toHaveBeenCalledTimes(1);
  });

  it('caches each language separately', async () => {
    const book = words.find((w) => w.kana === 'ほん')!;
    const base = { quizType: 'vocabulary', wordId: book.id, chosenAnswer: 'water' };
    const en = await explain({ ...base, language: 'en' }).expect(HttpStatus.OK);
    const ru = await explain({ ...base, language: 'ru' }).expect(HttpStatus.OK);
    expect(en.body.data.explanation).toContain('[en]');
    expect(ru.body.data.explanation).toContain('[ru]');
    expect(ru.body.data.cached).toBe(false);
  });

  it('rejects invalid requests', async () => {
    const book = words.find((w) => w.kana === 'ほん')!;
    const taberu = words.find((w) => w.kana === 'たべる')!;
    await explain({ quizType: 'vocabulary', wordId: book.id, chosenAnswer: 'book', language: 'en' }).expect(HttpStatus.BAD_REQUEST);
    await explain({ quizType: 'verb', wordId: taberu.id, chosenAnswer: 'x', language: 'en' }).expect(HttpStatus.BAD_REQUEST);
    await explain({ quizType: 'vocabulary', wordId: book.id, chosenAnswer: 'x'.repeat(256), language: 'en' }).expect(HttpStatus.BAD_REQUEST);
    await explain({ quizType: 'vocabulary', wordId: book.id, chosenAnswer: 'water', language: 'de' }).expect(HttpStatus.BAD_REQUEST);
    await explain({ quizType: 'vocabulary', wordId: 99999, chosenAnswer: 'water', language: 'en' }).expect(HttpStatus.NOT_FOUND);
  });

  it('survives two identical requests racing for the same cache entry', async () => {
    const book = words.find((w) => w.kana === 'ほん')!;
    const body = { quizType: 'vocabulary', wordId: book.id, chosenAnswer: 'mountain', language: 'en' };
    const [a, b] = await Promise.all([explain(body), explain(body)]);
    expect(a.status).toBe(HttpStatus.OK);
    expect(b.status).toBe(HttpStatus.OK);
    expect(a.body.data.explanation).toBe(b.body.data.explanation);
  });

  it('requires a token', () =>
    request(app.getHttpServer())
      .post('/explanations')
      .send({ quizType: 'vocabulary', wordId: 1, chosenAnswer: 'x', language: 'en' })
      .expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
