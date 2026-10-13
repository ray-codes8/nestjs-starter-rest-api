import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { JlptLevel } from './vocabulary/constants/word.constant';
import {
  loadRuMeanings,
  loadWordSeeds,
  ruMeaningsFilePath,
  wordKey,
  WordSeed,
  wordSeedFilePath,
} from './vocabulary/seed/word-seed';
import {
  buildTranslationRequests,
  ChunkResult,
  estimateBatchCostUsd,
  parseTranslationResults,
} from './vocabulary/translation/ru-translation';

dotenv.config();

const BATCH_FILE = path.join(path.dirname(ruMeaningsFilePath()), 'ru-meanings.batch.json');
// Rough output per word, plus some thinking per chunk (low effort).
const OUTPUT_TOKENS_PER_WORD = 25;
const OUTPUT_TOKENS_PER_CHUNK = 1000;

interface BatchFile {
  batchId: string;
  expectedIds: string[];
  collected: boolean;
}

function untranslatedSeeds(): WordSeed[] {
  const existing = loadRuMeanings();
  return [JlptLevel.N5, JlptLevel.N4]
    .flatMap((level) => loadWordSeeds(fs.readFileSync(wordSeedFilePath(level), 'utf8'), level))
    .filter((seed) => !existing[wordKey(seed)]);
}

function readBatchFile(): BatchFile | null {
  return fs.existsSync(BATCH_FILE) ? (JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8')) as BatchFile) : null;
}

async function estimate(client: Anthropic) {
  const seeds = untranslatedSeeds();
  const requests = buildTranslationRequests(seeds);
  let inputTokens = 0;
  for (const request of requests) {
    const { input_tokens } = await client.messages.countTokens({
      model: request.params.model,
      system: request.params.system,
      messages: request.params.messages,
    });
    inputTokens += input_tokens;
  }
  const outputTokens = seeds.length * OUTPUT_TOKENS_PER_WORD + requests.length * OUTPUT_TOKENS_PER_CHUNK;
  console.log(`words to translate: ${seeds.length} in ${requests.length} requests`);
  console.log(`input tokens: ${inputTokens}, estimated output tokens: ~${outputTokens}`);
  console.log(`estimated cost (batch, 50%): ~$${estimateBatchCostUsd(inputTokens, outputTokens).toFixed(2)}`);
}

async function submit(client: Anthropic) {
  const current = readBatchFile();
  if (current && !current.collected) {
    throw new Error(`Batch ${current.batchId} is not collected yet. Run --collect first.`);
  }
  const seeds = untranslatedSeeds();
  if (seeds.length === 0) {
    console.log('Nothing to translate.');
    return;
  }
  const requests = buildTranslationRequests(seeds);
  const batch = await client.messages.batches.create({ requests });
  const file: BatchFile = { batchId: batch.id, expectedIds: [...new Set(seeds.map(wordKey))], collected: false };
  fs.writeFileSync(BATCH_FILE, JSON.stringify(file, null, 2) + '\n');
  console.log(`submitted batch ${batch.id}: ${requests.length} requests, ${file.expectedIds.length} words`);
}

async function collect(client: Anthropic) {
  const file = readBatchFile();
  if (!file || file.collected) {
    console.log('No batch to collect.');
    return;
  }
  const batch = await client.messages.batches.retrieve(file.batchId);
  if (batch.processing_status !== 'ended') {
    console.log(`batch ${batch.id}: ${batch.processing_status}`, batch.request_counts);
    return;
  }

  const results: ChunkResult[] = [];
  for await (const entry of await client.messages.batches.results(file.batchId)) {
    if (entry.result.type === 'succeeded') {
      const textBlock = entry.result.message.content.find((block) => block.type === 'text');
      results.push({
        customId: entry.custom_id,
        status: entry.result.message.stop_reason === 'end_turn' ? 'succeeded' : 'errored',
        text: textBlock && textBlock.type === 'text' ? textBlock.text : undefined,
      });
    } else {
      results.push({ customId: entry.custom_id, status: entry.result.type });
    }
  }

  const { meanings, problems } = parseTranslationResults(results, file.expectedIds);
  const merged = { ...loadRuMeanings(), ...meanings };
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(ruMeaningsFilePath(), JSON.stringify(sorted, null, 2) + '\n');
  fs.writeFileSync(BATCH_FILE, JSON.stringify({ ...file, collected: true }, null, 2) + '\n');

  console.log(`saved ${Object.keys(meanings).length} new translations (${Object.keys(sorted).length} total)`);
  if (problems.length > 0) {
    console.log(`${problems.length} problems (run --submit again to retry the missing words):`);
    problems.slice(0, 50).forEach((p) => console.log(`  ${p}`));
  }
}

async function main() {
  const step = process.argv[2];
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (step === '--estimate') return estimate(client);
  if (step === '--submit') return submit(client);
  if (step === '--collect') return collect(client);
  console.log('usage: npm run translate:meanings -- --estimate | --submit | --collect');
}

main().catch((error: Error) => {
  // Error class and message only: never echo request options or keys.
  console.error(`${error.name}: ${error.message}`);
  process.exit(1);
});
