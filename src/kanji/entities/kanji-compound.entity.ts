import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { Kanji } from './kanji.entity';

@Entity('kanji_compounds')
@Unique('UQ_kanji_compounds_kanji_word', ['kanjiId', 'word'])
export class KanjiCompound {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  kanjiId: number;

  @ManyToOne(() => Kanji, (kanji) => kanji.compounds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kanjiId' })
  kanji: Kanji;

  @Column({ length: 50 })
  word: string;

  @Column({ length: 100 })
  reading: string;

  @Column({ length: 255 })
  meaningEn: string;

  @Column({ length: 255 })
  meaningRu: string;
}
