import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { KanjiCompound } from './kanji-compound.entity';

@Entity('kanji')
@Unique('UQ_kanji_number', ['number'])
export class Kanji {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'smallint' })
  number: number;

  @Column({ length: 4 })
  character: string;

  @Column({ type: 'jsonb' })
  kunReadings: string[];

  @Column({ type: 'jsonb' })
  onReadings: string[];

  @Column({ length: 255 })
  meaningEn: string;

  @Column({ length: 255 })
  meaningRu: string;

  @Column({ type: 'smallint' })
  strokes: number;

  @Column({ type: 'text' })
  originEn: string;

  @Column({ type: 'text' })
  originRu: string;

  @Column({ length: 20 })
  picture: string;

  @OneToMany(() => KanjiCompound, (compound) => compound.kanji)
  compounds: KanjiCompound[];
}
