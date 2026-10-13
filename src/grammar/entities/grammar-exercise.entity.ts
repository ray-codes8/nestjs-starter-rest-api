import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { GrammarPoint } from './grammar-point.entity';

@Entity('grammar_exercises')
@Unique('UQ_grammar_exercises_point_sentence', ['pointId', 'sentence'])
export class GrammarExercise {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pointId: number;

  @ManyToOne(() => GrammarPoint, (point) => point.exercises, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pointId' })
  point: GrammarPoint;

  @Column({ length: 255 })
  sentence: string;

  @Column({ length: 100 })
  answer: string;

  @Column({ type: 'jsonb' })
  distractors: string[];

  // Furigana for the sentence and its options: word or kanji → kana.
  @Column({ type: 'jsonb', default: {} })
  readings: Record<string, string>;

  @Column({ length: 255 })
  translationEn: string;

  @Column({ length: 255 })
  translationRu: string;
}
