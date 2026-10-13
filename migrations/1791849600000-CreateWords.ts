import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWords1791849600000 implements MigrationInterface {
  name = 'CreateWords1791849600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "words" (
        "id" SERIAL NOT NULL,
        "kanji" character varying(100),
        "kana" character varying(100) NOT NULL,
        "romaji" character varying(150) NOT NULL,
        "meaningEn" character varying(255) NOT NULL,
        "meaningRu" character varying(255),
        "partOfSpeech" character varying(20) NOT NULL,
        "verbGroup" smallint,
        "level" character varying(2) NOT NULL,
        "lesson" smallint,
        CONSTRAINT "PK_words" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_words_level" ON "words" ("level")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_words_level"`);
    await queryRunner.query(`DROP TABLE "words"`);
  }
}
