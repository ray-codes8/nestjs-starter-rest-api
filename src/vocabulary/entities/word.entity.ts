import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import {
  JlptLevel,
  PartOfSpeech,
  VerbGroup,
} from '../constants/word.constant';

@Entity('words')
export class Word {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kanji: string | null;

  @Column({ length: 100 })
  kana: string;

  @Column({ length: 150 })
  romaji: string;

  @Column({ length: 255 })
  meaningEn: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  meaningRu: string | null;

  @Column({ type: 'varchar', length: 20 })
  partOfSpeech: PartOfSpeech;

  @Column({ type: 'smallint', nullable: true })
  verbGroup: VerbGroup | null;

  @Index('IDX_words_level')
  @Column({ type: 'varchar', length: 2 })
  level: JlptLevel;

  @Column({ type: 'smallint', nullable: true })
  lesson: number | null;
}
