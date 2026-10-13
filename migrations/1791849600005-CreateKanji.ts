import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKanji1791849600005 implements MigrationInterface {
  name = 'CreateKanji1791849600005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "kanji" (
      "id" SERIAL NOT NULL, "number" smallint NOT NULL, "character" character varying(4) NOT NULL,
      "kunReadings" jsonb NOT NULL, "onReadings" jsonb NOT NULL,
      "meaningEn" character varying(255) NOT NULL, "meaningRu" character varying(255) NOT NULL,
      "strokes" smallint NOT NULL, "originEn" text NOT NULL, "originRu" text NOT NULL,
      "picture" character varying(20) NOT NULL,
      CONSTRAINT "UQ_kanji_number" UNIQUE ("number"), CONSTRAINT "PK_kanji" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "kanji_compounds" (
      "id" SERIAL NOT NULL, "kanjiId" integer NOT NULL, "word" character varying(50) NOT NULL,
      "reading" character varying(100) NOT NULL, "meaningEn" character varying(255) NOT NULL,
      "meaningRu" character varying(255) NOT NULL,
      CONSTRAINT "UQ_kanji_compounds_kanji_word" UNIQUE ("kanjiId", "word"),
      CONSTRAINT "PK_kanji_compounds" PRIMARY KEY ("id"),
      CONSTRAINT "FK_kanji_compounds_kanji" FOREIGN KEY ("kanjiId") REFERENCES "kanji"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "user_kanji_progress" (
      "id" SERIAL NOT NULL, "userId" integer NOT NULL, "kanjiId" integer NOT NULL,
      "quizType" character varying(20) NOT NULL, "box" smallint NOT NULL DEFAULT 1,
      "nextReviewAt" TIMESTAMP NOT NULL, "correctCount" integer NOT NULL DEFAULT 0,
      "wrongCount" integer NOT NULL DEFAULT 0,
      CONSTRAINT "UQ_user_kanji_progress" UNIQUE ("userId", "kanjiId", "quizType"),
      CONSTRAINT "PK_user_kanji_progress" PRIMARY KEY ("id"),
      CONSTRAINT "FK_user_kanji_progress_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_user_kanji_progress_kanji" FOREIGN KEY ("kanjiId") REFERENCES "kanji"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`ALTER TABLE "answer_log" ADD "kanjiId" integer`);
    await queryRunner.query(`ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_kanji" FOREIGN KEY ("kanjiId") REFERENCES "kanji"("id") ON DELETE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "answer_log" WHERE "kanjiId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP CONSTRAINT "FK_answer_log_kanji"`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP COLUMN "kanjiId"`);
    await queryRunner.query(`DROP TABLE "user_kanji_progress"`);
    await queryRunner.query(`DROP TABLE "kanji_compounds"`);
    await queryRunner.query(`DROP TABLE "kanji"`);
  }
}
