// node eval/rescore.ts eval/results/run-*.json
// Re-scores recorded Gemma replies with the current checker code. No model needed, so the
// numbers in the README can be reproduced by anyone from the committed replies.
import fs from 'node:fs';
import { CASES } from '../src/core/samples.ts';
import { baselinePreds, pakkaPreds, score, empty, type Tally } from './bench.ts';

const file = process.argv[2];
const run = JSON.parse(fs.readFileSync(file, 'utf8'));
const tallies: Record<string, Tally> = { baseline: empty(), pakka: empty() };
const replies: Record<string, string> = {};

for (const row of run.results) {
  const c = CASES.find((x) => x.id === row.id);
  if (!c) continue;
  if (row.baseline) score(c.expect, baselinePreds(row.baseline.reply), tallies.baseline);
  if (row.pakka) {
    replies[c.id] = row.pakka.reply;
    const { preds, orders } = pakkaPreds(c, row.pakka.reply);
    score(c.expect, preds, tallies.pakka);
    if (process.argv.includes('-v')) {
      console.log(c.id, JSON.stringify(preds.map((p) => [p.item, p.kg ?? p.count, p.dayOffset, p.sure ? '' : '?', p.time, p.message, p.price, p.advance])));
      for (const o of orders) for (const f of o.flags) console.log('   ⚠', f.field, f.note);
    }
  }
}

for (const [m, t] of Object.entries(tallies)) {
  console.log(`\n${m}`);
  for (const [f, s] of Object.entries(t.fields)) console.log(`  ${f.padEnd(14)} ${s.right}/${s.total}`);
  console.log(`  dates          right ${t.dates.right} · asked ${t.dates.asked} · confidently wrong ${t.dates.wrong} · missing ${t.dates.missing}`);
  console.log(`  phantom orders ${t.phantom} · missed orders ${t.missed}`);
}

// The app's no-WebGPU demo replays these replies through the live checker.
if (process.argv.includes('--write-recorded')) fs.writeFileSync('src/recorded.json', JSON.stringify(replies, null, 2) + '\n');
