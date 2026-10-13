import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { GrammarExercise } from '../../grammar/entities/grammar-exercise.entity';
import { User } from '../../user/entities/user.entity';

@Entity('user_exercise_progress')
@Unique('UQ_user_exercise_progress_user_exercise', ['userId', 'exerciseId'])
export class UserExerciseProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  exerciseId: number;

  @ManyToOne(() => GrammarExercise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exerciseId' })
  exercise: GrammarExercise;

  @Column({ type: 'smallint', default: 1 })
  box: number;

  @Column({ type: 'timestamp' })
  nextReviewAt: Date;

  @Column({ default: 0 })
  correctCount: number;

  @Column({ default: 0 })
  wrongCount: number;
}
