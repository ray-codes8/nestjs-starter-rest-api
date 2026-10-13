import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGrammar1791849600003 implements MigrationInterface {
  name = 'CreateGrammar1791849600003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "grammar_points" (
        "id" SERIAL NOT NULL,
        "code" character varying(50) NOT NULL,
        "lesson" smallint NOT NULL,
        "lessonTo" smallint,
        "level" character varying(2) NOT NULL,
        "title" character varying(100) NOT NULL,
        "ruleEn" text NOT NULL,
        "ruleRu" text NOT NULL,
        CONSTRAINT "UQ_grammar_points_code" UNIQUE ("code"),
        CONSTRAINT "PK_grammar_points" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "grammar_exercises" (
        "id" SERIAL NOT NULL,
        "pointId" integer NOT NULL,
        "sentence" character varying(255) NOT NULL,
        "answer" character varying(100) NOT NULL,
        "distractors" jsonb NOT NULL,
        "translationEn" character varying(255) NOT NULL,
        "translationRu" character varying(255) NOT NULL,
        CONSTRAINT "UQ_grammar_exercises_point_sentence" UNIQUE ("pointId", "sentence"),
        CONSTRAINT "PK_grammar_exercises" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grammar_exercises_point" FOREIGN KEY ("pointId") REFERENCES "grammar_points"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_exercise_progress" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "exerciseId" integer NOT NULL,
        "box" smallint NOT NULL DEFAULT 1,
        "nextReviewAt" TIMESTAMP NOT NULL,
        "correctCount" integer NOT NULL DEFAULT 0,
        "wrongCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_user_exercise_progress_user_exercise" UNIQUE ("userId", "exerciseId"),
        CONSTRAINT "PK_user_exercise_progress" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_exercise_progress_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_exercise_progress_exercise" FOREIGN KEY ("exerciseId") REFERENCES "grammar_exercises"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(`ALTER TABLE "answer_log" ALTER COLUMN "wordId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "answer_log" ADD "exerciseId" integer`);
    await queryRunner.query(
      `ALTER TABLE "answer_log" ADD CONSTRAINT "FK_answer_log_exercise" FOREIGN KEY ("exerciseId") REFERENCES "grammar_exercises"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "answer_log" WHERE "wordId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP CONSTRAINT "FK_answer_log_exercise"`);
    await queryRunner.query(`ALTER TABLE "answer_log" DROP COLUMN "exerciseId"`);
    await queryRunner.query(`ALTER TABLE "answer_log" ALTER COLUMN "wordId" SET NOT NULL`);
    await queryRunner.query(`DROP TABLE "user_exercise_progress"`);
    await queryRunner.query(`DROP TABLE "grammar_exercises"`);
    await queryRunner.query(`DROP TABLE "grammar_points"`);
  }
}
