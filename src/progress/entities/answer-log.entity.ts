import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { GrammarExercise } from '../../grammar/entities/grammar-exercise.entity';
import { User } from '../../user/entities/user.entity';
import { Word } from '../../vocabulary/entities/word.entity';
import { QuizType } from '../constants/quiz-type.constant';

@Entity('answer_log')
export class AnswerLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'integer', nullable: true })
  wordId: number | null;

  @ManyToOne(() => Word, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wordId' })
  word: Word;

  @Column({ type: 'integer', nullable: true })
  exerciseId: number | null;

  @ManyToOne(() => GrammarExercise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exerciseId' })
  exercise: GrammarExercise;

  @Column({ type: 'varchar', length: 20 })
  quizType: QuizType;

  @Column()
  isCorrect: boolean;

  @Index('IDX_answer_log_createdAt')
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
