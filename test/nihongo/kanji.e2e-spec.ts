import { HttpStatus, INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { KanjiRepository } from '../../src/kanji/repositories/kanji.repository';
import { closeDBAfterTest } from '../test-utils';
import { createNihongoTestApp, registerAndLogin } from './nihongo-test-utils';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const card = (number: number, kanji: string, meaningEn: string, meaningRu: string, compounds: [string, string][]) => ({
  number, kanji, kun: ['よみ'], on: ['ヨミ'], meaningEn, meaningRu, strokes: 4, originEn: 'picture', originRu: 'рисунок',
  compounds: compounds.map(([word, reading]) => ({ word, reading, meaningEn: 'm', meaningRu: 'м' })),
  picture: `${String(number).padStart(3, '0')}.png`, page: 26,
});

describe('Kanji (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanji-'));
    fs.mkdirSync(path.join(dir, 'pictures'));
    fs.writeFileSync(path.join(dir, 'pictures', '061.png'), PNG);
    process.env.KANJI_DIR = dir;
    app = await createNihongoTestApp();
    token = await registerAndLogin(app, 'kanji-user');
  });

  const get = (p: string) => request(app.getHttpServer()).get(p).set('Authorization', 'Bearer ' + token);
  const post = (p: string, body: object) => request(app.getHttpServer()).post(p).set('Authorization', 'Bearer ' + token).send(body);

  it('reports an empty range before import', async () => {
    const response = await get('/kanji/ranges').expect(HttpStatus.OK);
    expect(response.body.data).toEqual({ total: 0, from: 0, to: 0 });
  });

  describe('with kanji', () => {
    beforeAll(async () => {
      await app.get(KanjiRepository).upsertSeed([
        card(61, '牛', 'cow', 'корова', [['牛肉', 'ぎゅうにく'], ['水牛', 'すいぎゅう']]),
        card(62, '馬', 'horse', 'лошадь', [['馬車', 'ばしゃ']]),
        card(63, '魚', 'fish', 'рыба', [['金魚', 'きんぎょ'], ['人魚', 'にんぎょ']]),
        card(64, '貝', 'shell', 'ракушка', [['貝', 'かい']]),
        card(65, '雨', 'rain', 'дождь', []),
      ]);
    });

    it('reports the range', async () => {
      expect((await get('/kanji/ranges').expect(HttpStatus.OK)).body.data).toEqual({ total: 5, from: 61, to: 65 });
    });

    it('serves the three quiz types without leaking answers', async () => {
      const picture = (await get('/quiz/kanji?type=picture&from=61&to=65').expect(HttpStatus.OK)).body.data;
      expect(picture).toHaveLength(5);
      expect(Object.keys(picture[0]).sort()).toEqual(['kanjiId', 'options', 'pictureUrl']);
      expect(new Set(picture[0].options).size).toBe(4);

      const meaning = (await get('/quiz/kanji?type=meaning&from=61&to=62').expect(HttpStatus.OK)).body.data;
      expect(meaning).toHaveLength(2);
      expect(Object.keys(meaning[0]).sort()).toEqual(['character', 'kanjiId', 'options', 'optionsRu']);

      const reading = (await get('/quiz/kanji?type=reading&from=61&to=65').expect(HttpStatus.OK)).body.data;
      expect(reading).toHaveLength(4); // 雨 has no compounds
      expect(Object.keys(reading[0]).sort()).toEqual(['compoundId', 'kanjiId', 'options', 'word']);
    });

    it('validates the query', async () => {
      await get('/quiz/kanji?type=kanji&from=1&to=10').expect(HttpStatus.BAD_REQUEST);
      await get('/quiz/kanji?type=picture&from=1&to=10&count=21').expect(HttpStatus.BAD_REQUEST);
    });

    it('checks answers and returns the card', async () => {
      const [q] = (await get('/quiz/kanji?type=picture&from=61&to=61').expect(HttpStatus.OK)).body.data;
      const correct = await post('/kanji/answer', { type: 'picture', kanjiId: q.kanjiId, answer: '牛' }).expect(HttpStatus.OK);
      expect(correct.body.data).toEqual(expect.objectContaining({ isCorrect: true, correctAnswer: '牛', newBox: 2 }));
      expect(correct.body.data.card).toEqual(expect.objectContaining({ character: '牛', pictureUrl: 'kanji-pictures/061.png' }));
      expect(correct.body.data.card.compounds).toHaveLength(2);

      const [r] = (await get('/quiz/kanji?type=reading&from=62&to=62').expect(HttpStatus.OK)).body.data;
      await post('/kanji/answer', { type: 'reading', kanjiId: r.kanjiId, compoundId: r.compoundId, answer: 'ばしゃ' }).expect(HttpStatus.OK);
      await post('/kanji/answer', { type: 'reading', kanjiId: q.kanjiId, compoundId: r.compoundId, answer: 'ばしゃ' }).expect(HttpStatus.BAD_REQUEST);
      await post('/kanji/answer', { type: 'reading', kanjiId: q.kanjiId, answer: 'x' }).expect(HttpStatus.BAD_REQUEST);
      await post('/kanji/answer', { type: 'picture', kanjiId: 999999, answer: 'x' }).expect(HttpStatus.NOT_FOUND);
    });

    it('serves pictures without auth and refuses other paths', async () => {
      await request(app.getHttpServer()).get('/kanji-pictures/061.png').expect(HttpStatus.OK).expect('Content-Type', /png/);
      await request(app.getHttpServer()).get('/kanji-pictures/062.png').expect(HttpStatus.NOT_FOUND);
      await request(app.getHttpServer()).get('/kanji-pictures/..%2F.env').expect(HttpStatus.NOT_FOUND);
      await request(app.getHttpServer()).get('/kanji-pictures/abc.png').expect(HttpStatus.NOT_FOUND);
    });
  });

  it('requires a token for the quiz', () => request(app.getHttpServer()).get('/kanji/ranges').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    delete process.env.KANJI_DIR;
    await app.close();
    await closeDBAfterTest();
  });
});
