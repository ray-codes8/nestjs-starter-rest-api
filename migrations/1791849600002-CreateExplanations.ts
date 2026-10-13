import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExplanations1791849600002 implements MigrationInterface {
  name = 'CreateExplanations1791849600002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "explanations" (
        "id" SERIAL NOT NULL,
        "wordId" integer NOT NULL,
        "quizType" character varying(20) NOT NULL,
        "form" character varying(10) NOT NULL DEFAULT '',
        "chosenAnswer" character varying(255) NOT NULL,
        "language" character varying(2) NOT NULL,
        "payload" jsonb NOT NULL,
        "model" character varying(100) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_explanations_key" UNIQUE ("wordId", "quizType", "form", "chosenAnswer", "language"),
        CONSTRAINT "PK_explanations" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "explanations" ADD CONSTRAINT "FK_explanations_word" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "explanations"`);
  }
}
