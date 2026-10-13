import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

import { Box, cropPicture } from './kanji/import/crop';
import {
  buildOcrRequest,
  KanjiCardOcr,
  mergeCards,
  normalizeCard,
  readPageResult,
  validateKanjiCards,
} from './kanji/import/kanji-ocr';
import { KanjiData, loadKanjiFile } from './kanji/seed/kanji-seed';
import { estimateBatchCostUsd } from './vocabulary/translation/ru-translation';

dotenv.config();

const DIR = path.resolve(process.env.KANJI_DIR || 'local/kanji');
const PAGES_DIR = path.join(DIR, 'pages');
const PICTURES_DIR = path.join(DIR, 'pictures');
const BATCH_FILE = path.join(DIR, 'ocr.batch.json');
const OCR_MAX_HEIGHT = 1568;
const OUTPUT_TOKENS_PER_PAGE = 1500;

function pageRange(): number[] {
  const arg = process.argv.find((a) => a.startsWith('--pages='));
  const [from, to] = (arg ? arg.split('=')[1] : '26-95').split('-').map(Number);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
const pagePath = (page: number) => path.join(PAGES_DIR, `page-${String(page).padStart(3, '0')}.png`);

function render() {
  const pdf = process.env.KANJI_BOOK_PDF;
  if (!pdf || !fs.existsSync(pdf)) throw new Error('Set KANJI_BOOK_PDF in .env to the book PDF');
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  const pages = pageRange();
  execFileSync('pdftoppm', ['-f', String(pages[0]), '-l', String(pages[pages.length - 1]), '-r', '200', '-gray', '-png', pdf, path.join(PAGES_DIR, 'page')]);
  console.log(`rendered ${pages.length} pages to ${PAGES_DIR}`);
}

async function ocrRequests() {
  return Promise.all(
    pageRange().map(async (page) => {
      const png = await sharp(pagePath(page)).resize({ height: OCR_MAX_HEIGHT, withoutEnlargement: true }).png().toBuffer();
      return buildOcrRequest(page, png.toString('base64'));
    }),
  );
}

async function estimate(client: Anthropic) {
  let input = 0;
  for (const request of await ocrRequests()) {
    const { input_tokens } = await client.messages.countTokens({ model: request.params.model, messages: request.params.messages });
    input += input_tokens;
  }
  const pages = pageRange().length;
  const output = pages * OUTPUT_TOKENS_PER_PAGE;
  console.log(`pages: ${pages}, input tokens: ${input}, estimated output: ~${output}`);
  console.log(`estimated cost (batch, 50%): ~$${estimateBatchCostUsd(input, output).toFixed(2)}`);
}

async function submit(client: Anthropic) {
  if (fs.existsSync(BATCH_FILE) && !JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8')).collected) {
    throw new Error('The previous OCR batch is not collected yet. Run --collect first.');
  }
  const batch = await client.messages.batches.create({ requests: await ocrRequests() });
  fs.writeFileSync(BATCH_FILE, JSON.stringify({ batchId: batch.id, pages: pageRange(), collected: false }, null, 2));
  console.log(`submitted OCR batch ${batch.id} for ${pageRange().length} pages`);
}

async function collect(client: Anthropic) {
  const file = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8')) as { batchId: string; collected: boolean };
  const batch = await client.messages.batches.retrieve(file.batchId);
  if (batch.processing_status !== 'ended') {
    console.log(`batch ${batch.id}: ${batch.processing_status}`, batch.request_counts);
    return;
  }

  const problems: string[] = [];
  const cards: (KanjiCardOcr & { page: number })[] = [];
  const okPages: number[] = [];
  for await (const entry of await client.messages.batches.results(file.batchId)) {
    const { page, cards: pageCards, problem } = readPageResult(entry);
    if (!pageCards) {
      problems.push(problem!);
      continue;
    }
    okPages.push(page);
    pageCards.forEach((card) => cards.push({ ...normalizeCard(card), page }));
  }

  const inRange = cards.filter((c) => c.number >= 1 && c.number <= 100);
  // Field checks for this batch; completeness is checked on the merged set below.
  problems.push(...validateKanjiCards(inRange, 1, 0));

  const overridesFile = path.join(DIR, 'overrides.json');
  const overrides: Record<string, Box> = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {};
  fs.mkdirSync(PICTURES_DIR, { recursive: true });
  const data: KanjiData[] = [];
  for (const card of inRange.sort((a, b) => a.number - b.number)) {
    const picture = `${String(card.number).padStart(3, '0')}.png`;
    try {
      await cropPicture(pagePath(card.page), overrides[card.number] ?? card.picture, path.join(PICTURES_DIR, picture));
    } catch (error) {
      problems.push(`#${card.number}: ${(error as Error).message}`);
    }
    data.push({ ...card, picture });
  }
  // Re-reading a few pages keeps every other page's cards.
  // Only pages that were read successfully replace their earlier cards.
  const merged = mergeCards(loadKanjiFile(DIR) ?? [], data, okPages);
  const numbers = new Set(merged.map((c) => c.number));
  for (let n = 1; n <= 100; n++) {
    if (!numbers.has(n)) problems.push(`#${n}: missing`);
  }
  fs.writeFileSync(path.join(DIR, 'kanji.json'), JSON.stringify({ cards: merged }, null, 2));
  fs.writeFileSync(BATCH_FILE, JSON.stringify({ ...file, collected: true }, null, 2));
  console.log(`saved ${data.length} kanji (${merged.length} total), ${problems.length} problems`);
  problems.forEach((p) => console.log(`  ${p}`));
}

function review() {
  const { cards } = JSON.parse(fs.readFileSync(path.join(DIR, 'kanji.json'), 'utf8')) as { cards: Array<KanjiCardOcr & { picture: string }> };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rows = cards
    .map(
      (c) => `<div class="card"><img src="pictures/${c.picture}"><div><b>${c.number} ${esc(c.kanji)}</b> ${esc(c.kun.join('、'))} / ${esc(c.on.join('、'))}<br>${esc(c.meaningEn)} — ${esc(c.meaningRu)} (${c.strokes})<br><small>${esc(c.originEn)}</small><br><small>${c.compounds.map((x) => `${esc(x.word)} ${esc(x.reading)} ${esc(x.meaningEn)}`).join(' · ')}</small></div></div>`,
    )
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Kanji import review</title><style>body{font-family:sans-serif;margin:16px}.card{display:flex;gap:12px;border-bottom:1px solid #ddd;padding:8px}img{width:220px;height:auto;border:1px solid #eee}</style>${rows}`;
  fs.writeFileSync(path.join(DIR, 'review.html'), html);
  console.log(`open ${path.join(DIR, 'review.html')}`);
}

async function main() {
  const step = process.argv[2];
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (step === '--render') return render();
  if (step === '--estimate') return estimate(client);
  if (step === '--submit') return submit(client);
  if (step === '--collect') return collect(client);
  if (step === '--review') return review();
  console.log('usage: npm run kanji:import -- --render | --estimate | --submit | --collect | --review [--pages=26-95]');
}

main().catch((error: Error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exit(1);
});
