import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  @Column()
  wordId: number;

  @ManyToOne(() => Word, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wordId' })
  word: Word;

  @Column({ type: 'varchar', length: 20 })
  quizType: QuizType;

  @Column()
  isCorrect: boolean;

  @Index('IDX_answer_log_createdAt')
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
