import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { VALIDATION_PIPE_OPTIONS } from '../../src/shared/constants';
import {
  JlptLevel,
  PartOfSpeech,
} from '../../src/vocabulary/constants/word.constant';
import { Word } from '../../src/vocabulary/entities/word.entity';
import { WordRepository } from '../../src/vocabulary/repositories/word.repository';
import { createDBEntities, resetDBBeforeTest } from '../test-utils';

export const createNihongoTestApp = async (): Promise<INestApplication> => {
  await resetDBBeforeTest();
  await createDBEntities();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  await app.init();
  return app;
};

export const registerAndLogin = async (
  app: INestApplication,
  username: string,
): Promise<string> => {
  const password = 'password123';
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: username, username, password, email: `${username}@example.com` })
    .expect(HttpStatus.CREATED);

  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password })
    .expect(HttpStatus.OK);

  return response.body.data.accessToken;
};

export const seedTestWords = async (app: INestApplication): Promise<Word[]> => {
  const base = { meaningRu: null, lesson: null, level: JlptLevel.N5 };
  return app.get(WordRepository).save([
    { ...base, kanji: '本', kana: 'ほん', romaji: 'hon', meaningEn: 'book', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '水', kana: 'みず', romaji: 'mizu', meaningEn: 'water', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '山', kana: 'やま', romaji: 'yama', meaningEn: 'mountain', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '犬', kana: 'いぬ', romaji: 'inu', meaningEn: 'dog', partOfSpeech: PartOfSpeech.Noun, verbGroup: null },
    { ...base, kanji: '書く', kana: 'かく', romaji: 'kaku', meaningEn: 'to write', partOfSpeech: PartOfSpeech.Verb, verbGroup: 1 },
    { ...base, kanji: '食べる', kana: 'たべる', romaji: 'taberu', meaningEn: 'to eat', partOfSpeech: PartOfSpeech.Verb, verbGroup: 2 },
  ]);
};
