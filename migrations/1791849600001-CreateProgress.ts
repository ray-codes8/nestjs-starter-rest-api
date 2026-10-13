import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProgress1791849600001 implements MigrationInterface {
  name = 'CreateProgress1791849600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_word_progress" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "wordId" integer NOT NULL,
        "box" smallint NOT NULL DEFAULT 1,
        "nextReviewAt" TIMESTAMP NOT NULL,
        "correctCount" integer NOT NULL DEFAULT 0,
        "wrongCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_user_word_progress_user_word" UNIQUE ("userId", "wordId"),
        CONSTRAINT "PK_user_word_progress" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_word_progress" ADD CONSTRAINT "FK_user_word_progress_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_word_progress" ADD CONSTRAINT "FK_user_word_progress_word" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE TABLE "answer_log" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "wordId" integer NOT NULL,
        "quizType" character varying(20) NOT NULL,
        "isCorrect" boolean NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_answer_log" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_answer_log_createdAt" ON "answer_log" ("createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_word" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "answer_log"`);
    await queryRunner.query(`DROP TABLE "user_word_progress"`);
  }
}
