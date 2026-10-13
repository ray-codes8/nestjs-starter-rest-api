import * as fs from 'fs';
import * as path from 'path';

import { KanjiCardOcr } from '../import/kanji-ocr';

// One imported card as stored in kanji.json (the picture is the cropped file name).
export type KanjiData = Omit<KanjiCardOcr, 'picture'> & { picture: string; page: number };

export function loadKanjiFile(dir: string): KanjiData[] | null {
  const file = path.join(dir, 'kanji.json');
  if (!fs.existsSync(file)) {
    return null;
  }
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { cards: KanjiData[] }).cards;
}
