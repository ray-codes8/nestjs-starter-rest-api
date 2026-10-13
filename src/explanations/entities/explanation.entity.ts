import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { QuizType } from '../../progress/constants/quiz-type.constant';
import { Word } from '../../vocabulary/entities/word.entity';
import { ExplanationLanguage } from '../constants/explanation-language.constant';
import { ExplanationPayload } from '../domain/explanation-schema';

@Entity('explanations')
@Unique('UQ_explanations_key', [
  'wordId',
  'quizType',
  'form',
  'chosenAnswer',
  'language',
])
export class Explanation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  wordId: number;

  @ManyToOne(() => Word, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wordId' })
  word: Word;

  @Column({ type: 'varchar', length: 20 })
  quizType: QuizType;

  // Empty string for vocabulary, so the unique key works (NULLs never collide).
  @Column({ type: 'varchar', length: 10, default: '' })
  form: string;

  @Column({ length: 255 })
  chosenAnswer: string;

  @Column({ type: 'varchar', length: 2 })
  language: ExplanationLanguage;

  @Column({ type: 'jsonb' })
  payload: ExplanationPayload;

  @Column({ length: 100 })
  model: string;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
