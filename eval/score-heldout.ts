// node eval/score-heldout.ts [-v] : scores the held-out replies in eval/results/heldout.json.
import fs from 'node:fs';
import { HELDOUT } from '../src/core/heldout.ts';
import { baselinePreds, pakkaPreds, score, empty, type Tally } from './bench.ts';

const run = JSON.parse(fs.readFileSync('eval/results/heldout.json', 'utf8'));
const tallies: Record<string, Tally> = { baseline: empty(), pakka: empty() };
for (const c of HELDOUT) {
  const r = run.replies[c.id];
  score(c.expect, baselinePreds(r.baseline), tallies.baseline);
  const { preds, orders } = pakkaPreds(c, r.pakka);
  score(c.expect, preds, tallies.pakka);
  if (process.argv.includes('-v')) {
    console.log(c.id, 'B', JSON.stringify(baselinePreds(r.baseline).map((p) => [p.item, p.kg ?? p.count, p.dayOffset, p.time, p.message, p.price, p.advance])));
    console.log(' '.repeat(c.id.length), 'P', JSON.stringify(preds.map((p) => [p.item, p.kg ?? p.count, p.dayOffset, p.sure ? '' : '?', p.time, p.message, p.price, p.advance])));
    for (const o of orders) for (const f of o.flags) console.log('   ⚠', f.field, f.note);
  }
}
for (const [m, t] of Object.entries(tallies)) {
  console.log(`\n${m}`);
  for (const [f, s] of Object.entries(t.fields)) console.log(`  ${f.padEnd(14)} ${s.right}/${s.total}`);
  console.log(`  dates          right ${t.dates.right} · asked ${t.dates.asked} · confidently wrong ${t.dates.wrong} · missing ${t.dates.missing}`);
  console.log(`  phantom orders ${t.phantom} · missed orders ${t.missed}`);
}
