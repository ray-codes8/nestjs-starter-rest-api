import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGrammarReadings1791849600004 implements MigrationInterface {
  name = 'AddGrammarReadings1791849600004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "grammar_exercises" ADD "readings" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "grammar_exercises" DROP COLUMN "readings"`);
  }
}
