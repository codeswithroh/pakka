// node eval/prompts.ts > prompts.json : the exact prompts for the held-out chats, so they can be
// sent to an already-loaded Gemma (see eval/heldout.md).
import { HELDOUT } from '../src/core/heldout.ts';
import { BAKER, toExport } from '../src/core/samples.ts';
import { parseChat, recent, transcript } from '../src/core/whatsapp.ts';
import { buildPrompt } from '../src/core/extract.ts';
import { BASELINE_PROMPT, NOW } from './bench.ts';

const out: Record<string, { pakka: string; baseline: string }> = {};
for (const c of HELDOUT) {
  const t = transcript(recent(parseChat(toExport(c, NOW), c.customer), NOW), BAKER);
  out[c.id] = { pakka: buildPrompt(t), baseline: BASELINE_PROMPT(t) };
}
console.log(JSON.stringify(out));
