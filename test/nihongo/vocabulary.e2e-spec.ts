import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';

import { closeDBAfterTest } from '../test-utils';
import {
  createNihongoTestApp,
  registerAndLogin,
  seedTestWords,
} from './nihongo-test-utils';

describe('VocabularyController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createNihongoTestApp();
    await seedTestWords(app);
    token = await registerAndLogin(app, 'vocab-user');
  });

  it('lists words of a level with a count', async () => {
    const response = await request(app.getHttpServer())
      .get('/vocabulary?level=N5&limit=2&offset=0')
      .set('Authorization', 'Bearer ' + token)
      .expect(HttpStatus.OK);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.count).toBe(6);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({ kana: expect.any(String), meaningEn: expect.any(String), meaningRu: null, level: 'N5' }),
    );
  });

  it('returns an empty list for a level without words', async () => {
    const response = await request(app.getHttpServer())
      .get('/vocabulary?level=N4')
      .set('Authorization', 'Bearer ' + token)
      .expect(HttpStatus.OK);
    expect(response.body.data).toEqual([]);
  });

  it('rejects an unknown level', () =>
    request(app.getHttpServer())
      .get('/vocabulary?level=N9')
      .set('Authorization', 'Bearer ' + token)
      .expect(HttpStatus.BAD_REQUEST));

  it('requires a token', () =>
    request(app.getHttpServer()).get('/vocabulary?level=N5').expect(HttpStatus.UNAUTHORIZED));

  afterAll(async () => {
    await app.close();
    await closeDBAfterTest();
  });
});
