import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { Kanji } from '../entities/kanji.entity';
import { KanjiCompound } from '../entities/kanji-compound.entity';
import { KanjiData } from '../seed/kanji-seed';

@Injectable()
export class KanjiRepository extends Repository<Kanji> {
  constructor(private dataSource: DataSource) {
    super(Kanji, dataSource.createEntityManager());
  }

  async upsertSeed(cards: KanjiData[]): Promise<number> {
    const compounds = this.manager.getRepository(KanjiCompound);
    for (const card of cards) {
      const existing = await this.findOne({ where: { number: card.number } });
      const kanji = await this.save({
        ...existing,
        number: card.number,
        character: card.kanji,
        kunReadings: card.kun,
        onReadings: card.on,
        meaningEn: card.meaningEn,
        meaningRu: card.meaningRu,
        strokes: card.strokes,
        originEn: card.originEn,
        originRu: card.originRu,
        picture: card.picture,
      });
      for (const compound of card.compounds) {
        const current = await compounds.findOne({ where: { kanjiId: kanji.id, word: compound.word } });
        await compounds.save({ ...current, ...compound, kanjiId: kanji.id });
      }
    }
    return cards.length;
  }
}
