// The eval. Runs every hand-written chat through Gemma 4 E2B two ways and scores the bake sheet:
//   baseline: Gemma reads the chat and writes the final values itself (dates, kg, rupees).
//   pakka:    Gemma only copies words; code checks them against the chat and does the reading.
// Dates are scored three ways: right, asked (flagged for the baker), wrong (confidently wrong).
import { CASES, BAKER, toExport, type Case, type Expected } from '../src/core/samples.ts';
import { parseChat, recent, transcript } from '../src/core/whatsapp.ts';
import { extractOrders, checkOrder, parseReply, type Order, type Generate } from '../src/core/extract.ts';

export const NOW = new Date(Date.UTC(2026, 9, 17, 22, 30)); // Saturday 17 Oct 2026, 10:30 pm
const DAY = 86_400_000;

export interface Pred {
  item: string;
  kg: number | null;
  count: number | null;
  eggless: boolean | null;
  dayOffset: number | null;
  sure: boolean;
  time: string | null;
  message: string | null;
  price: number | null;
  advance: number | null;
}

function fromOrder(o: Order): Pred {
  const base = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
  return {
    item: o.item,
    kg: o.sizeKg,
    count: o.count,
    eggless: o.eggless,
    dayOffset: o.when?.date ? Math.round((o.when.date.getTime() - base) / DAY) : null,
    sure: !!o.when?.sure,
    time: o.when?.time ?? null,
    message: o.cakeMessage,
    price: o.price,
    advance: o.advance,
  };
}

const BASELINE_PROMPT = (chat: string) => `You read WhatsApp chats between a home baker and a customer. Messages mix Hindi and English.
Today is Saturday, 17 October 2026, 10:30 pm.

Find every order the customer placed. For each order give:
- item (string)
- kg (number or null), count (number of pieces or null)
- eggless (true, false or null if not said)
- date (YYYY-MM-DD the customer wants it, or null)
- time (like "6:00 pm", or null)
- cake_message (text to write on the cake, or null)
- price (total in rupees, number or null), advance (rupees already paid, number or null)

Reply with JSON only: {"orders":[...]}. If there is no order, reply {"orders":[]}.

Chat:
${chat}`;

export function baselinePreds(reply: string): Pred[] {
  const preds: Pred[] = [];
  try {
    const s = reply.slice(reply.search(/[[{]/), Math.max(reply.lastIndexOf('}'), reply.lastIndexOf(']')) + 1);
    const j = JSON.parse(s);
    const list = Array.isArray(j) ? j : j.orders ?? [];
    for (const o of list) {
      const d = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? Date.parse(o.date + 'T00:00:00Z') : null;
      const base = Date.UTC(2026, 9, 17);
      preds.push({
        item: String(o.item ?? ''),
        kg: typeof o.kg === 'number' ? o.kg : null,
        count: typeof o.count === 'number' ? o.count : null,
        eggless: typeof o.eggless === 'boolean' ? o.eggless : null,
        dayOffset: d === null ? null : Math.round((d - base) / DAY),
        sure: d !== null, // the baseline never says "not sure"
        time: typeof o.time === 'string' ? o.time.toLowerCase().replace(/^(\d{1,2})\s?(am|pm)$/, '$1:00 $2').replace(/^0/, '') : null,
        message: typeof o.cake_message === 'string' ? o.cake_message : null,
        price: typeof o.price === 'number' ? o.price : null,
        advance: typeof o.advance === 'number' ? o.advance : null,
      });
    }
  } catch {
    // unparseable reply: no orders
  }
  return preds;
}

export async function baseline(c: Case, generate: Generate): Promise<{ preds: Pred[]; reply: string }> {
  const chat = parseChat(toExport(c, NOW), c.customer);
  const reply = await generate(BASELINE_PROMPT(transcript(recent(chat, NOW), BAKER)));
  return { preds: baselinePreds(reply), reply };
}

/** Re-run Pakka's checker on a recorded Gemma reply (no model needed). */
export function pakkaPreds(c: Case, reply: string): { preds: Pred[]; orders: Order[] } {
  const chat = parseChat(toExport(c, NOW), c.customer);
  const messages = recent(chat, NOW);
  let raws: ReturnType<typeof parseReply> = [];
  try {
    raws = parseReply(reply);
  } catch {
    // no JSON: no orders
  }
  const orders = raws.filter((r) => r.item || r.day || r.size).map((r) => checkOrder(r, chat.name, messages));
  return { preds: orders.map(fromOrder), orders };
}

export async function pakka(c: Case, generate: Generate): Promise<{ preds: Pred[]; reply: string; orders: Order[] }> {
  const chat = parseChat(toExport(c, NOW), c.customer);
  let reply = '';
  const orders = await extractOrders(chat, BAKER, NOW, async (p) => (reply = await generate(p)));
  return { preds: orders.map(fromOrder), reply, orders };
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

type Score = Record<string, { right: number; total: number }>;
export interface Tally {
  fields: Score;
  dates: { right: number; asked: number; wrong: number; missing: number };
  phantom: number; // orders invented where there were none
  missed: number; // expected orders not found
}

export function score(exp: Expected[], preds: Pred[], t: Tally) {
  const used = new Set<number>();
  for (const e of exp) {
    const i = preds.findIndex((p, k) => !used.has(k) && norm(p.item).includes(norm(e.item)));
    const j = i >= 0 ? i : preds.findIndex((_, k) => !used.has(k));
    if (j < 0) {
      t.missed++;
      continue;
    }
    used.add(j);
    const p = preds[j];
    const field = (name: string, ok: boolean) => {
      t.fields[name] ??= { right: 0, total: 0 };
      t.fields[name].total++;
      if (ok) t.fields[name].right++;
    };
    if (e.kg !== undefined) field('size', e.kg === null ? p.kg === null : p.kg === e.kg);
    if (e.count !== undefined) field('size', e.count === null ? p.count === null : p.count === e.count);
    if (e.eggless !== undefined) field('eggless', p.eggless === e.eggless);
    if (e.time !== undefined) field('time', norm(p.time) === norm(e.time));
    if (e.message !== undefined) field('cake message', norm(p.message) === norm(e.message));
    if (e.price !== undefined) field('price', p.price === e.price);
    if (e.advance !== undefined) field('advance', p.advance === e.advance);
    if (e.day !== undefined) {
      if (e.day === 'flag') {
        if (!p.sure) t.dates.right++;
        else t.dates.wrong++;
      } else if (p.dayOffset === null) t.dates.missing++;
      else if (!p.sure) t.dates.asked++;
      else if (p.dayOffset === e.day) t.dates.right++;
      else t.dates.wrong++;
    }
  }
  t.phantom += preds.length - used.size;
}

export const empty = (): Tally => ({ fields: {}, dates: { right: 0, asked: 0, wrong: 0, missing: 0 }, phantom: 0, missed: 0 });

export async function runEval(generate: Generate, log: (line: string) => void, only?: string[]) {
  const cases = only?.length ? CASES.filter((c) => only.includes(c.id)) : CASES;
  const results: Record<string, unknown>[] = [];
  const tallies: Record<string, Tally> = { baseline: empty(), pakka: empty() };
  const timings: Record<string, number[]> = { baseline: [], pakka: [] };
  log(`${cases.length} chats · ${cases.reduce((n, c) => n + c.expect.length, 0)} orders`);
  for (const c of cases) {
    const row: Record<string, unknown> = { id: c.id, trap: c.trap, expect: c.expect };
    for (const m of ['baseline', 'pakka'] as const) {
      const t0 = performance.now();
      const r = m === 'baseline' ? await baseline(c, generate) : await pakka(c, generate);
      const ms = Math.round(performance.now() - t0);
      timings[m].push(ms);
      score(c.expect, r.preds, tallies[m]);
      row[m] = { ms, reply: r.reply, preds: r.preds, flags: 'orders' in r ? (r.orders as Order[]).map((o) => o.flags) : undefined };
      log(`${m.padEnd(8)} ${c.id.padEnd(22)} ${String(ms).padStart(6)}ms  ${JSON.stringify(r.preds.map((p) => [p.item, p.kg ?? p.count, p.dayOffset, p.sure ? '' : '?', p.time, p.price, p.advance]))}`);
    }
    results.push(row);
  }
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [m, t] of Object.entries(tallies)) {
    log(`\n${m}  (median ${median(timings[m])} ms per chat)`);
    for (const [f, s] of Object.entries(t.fields)) log(`  ${f.padEnd(14)} ${s.right}/${s.total}`);
    log(`  dates          right ${t.dates.right} · asked ${t.dates.asked} · confidently wrong ${t.dates.wrong} · missing ${t.dates.missing}`);
    log(`  phantom orders ${t.phantom} · missed orders ${t.missed}`);
  }
  return { now: NOW, tallies, timings, results };
}
