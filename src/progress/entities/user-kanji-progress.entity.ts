import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { Kanji } from '../../kanji/entities/kanji.entity';
import { User } from '../../user/entities/user.entity';
import { QuizType } from '../constants/quiz-type.constant';

@Entity('user_kanji_progress')
@Unique('UQ_user_kanji_progress', ['userId', 'kanjiId', 'quizType'])
export class UserKanjiProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  kanjiId: number;

  @ManyToOne(() => Kanji, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kanjiId' })
  kanji: Kanji;

  @Column({ type: 'varchar', length: 20 })
  quizType: QuizType;

  @Column({ type: 'smallint', default: 1 })
  box: number;

  @Column({ type: 'timestamp' })
  nextReviewAt: Date;

  @Column({ default: 0 })
  correctCount: number;

  @Column({ default: 0 })
  wrongCount: number;
}
