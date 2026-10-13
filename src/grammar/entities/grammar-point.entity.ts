import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { JlptLevel } from '../../vocabulary/constants/word.constant';
import { GrammarExercise } from './grammar-exercise.entity';

@Entity('grammar_points')
@Unique('UQ_grammar_points_code', ['code'])
export class GrammarPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  code: string;

  @Column({ type: 'smallint' })
  lesson: number;

  @Column({ type: 'smallint', nullable: true })
  lessonTo: number | null;

  @Column({ type: 'varchar', length: 2 })
  level: JlptLevel;

  @Column({ length: 100 })
  title: string;

  @Column({ type: 'text' })
  ruleEn: string;

  @Column({ type: 'text' })
  ruleRu: string;

  @OneToMany(() => GrammarExercise, (exercise) => exercise.point)
  exercises: GrammarExercise[];
}
