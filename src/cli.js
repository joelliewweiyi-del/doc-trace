#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { processPdf } from './index.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: doc-trace <file.pdf> [--rules | --llm] [--json]');
  process.exit(2);
}
const extractor = args.includes('--llm') ? 'llm' : args.includes('--rules') ? 'rules' : 'auto';
const result = await processPdf(await readFile(file), { extractor });

if (args.includes('--json')) {
  const { pages, ...rest } = result;
  console.log(JSON.stringify(rest, null, 2));
} else if (!result.type) {
  console.log(`${file}: ${result.error}`);
} else {
  console.log(`${file}: ${result.type} (${result.pages.length} page${result.pages.length === 1 ? '' : 's'}, extractor: ${result.extractor})\n`);
  const mark = { traced: '✓', rejected: '✗', missing: '·' };
  for (const f of result.fields) {
    const where = f.status === 'traced' ? `p.${f.page} "${f.quote}"` : f.reason;
    console.log(`${mark[f.status]} ${f.label.padEnd(16)} ${String(f.value ?? '').padEnd(34)} ${where}`);
  }
}
// A rejected field is a failed extraction: exit non-zero so scripts notice.
process.exitCode = result.fields.some((f) => f.status === 'rejected') ? 1 : 0;
