import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { User } from '../../user/entities/user.entity';
import { Word } from '../../vocabulary/entities/word.entity';

@Entity('user_word_progress')
@Unique('UQ_user_word_progress_user_word', ['userId', 'wordId'])
export class UserWordProgress {
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

  @Column({ type: 'smallint', default: 1 })
  box: number;

  @Column({ type: 'timestamp' })
  nextReviewAt: Date;

  @Column({ default: 0 })
  correctCount: number;

  @Column({ default: 0 })
  wrongCount: number;
}
