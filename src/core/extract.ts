// One chat in, a list of checked orders out.
// Gemma's whole job: find each order and copy the exact words for every detail.
// Everything that turns words into a date, a weight or a rupee amount happens in code.
import { type Chat, type Message, transcript, recent, fmtDate } from './whatsapp.ts';
import { parseTime, resolveWhen, type When } from './when.ts';
import { cleanCakeMessage, findQuote, laterChange, parseAmount, parseCount, parseEggless, parseSizeKg } from './fields.ts';

export type Generate = (prompt: string) => Promise<string>;

export interface RawOrder {
  item: string | null;
  size: string | null;
  eggless: string | null;
  day: string | null;
  time: string | null;
  cake_message: string | null;
  price: string | null;
  advance: string | null;
  pickup_or_delivery: string | null;
}

export interface Flag {
  field: keyof RawOrder | 'order';
  note: string;
  line?: number; // index into messages
}

export interface Order {
  customer: string;
  item: string;
  sizeKg: number | null;
  count: number | null;
  sizeText: string | null;
  eggless: boolean | null;
  when: When | null;
  whenText: string | null;
  cakeMessage: string | null;
  price: number | null;
  advance: number | null;
  handover: 'pickup' | 'delivery' | null;
  address: string | null;
  flags: Flag[];
  sources: number[]; // message indexes the details came from
  messages: Message[];
}

export function buildPrompt(text: string): string {
  return `You read WhatsApp chats between a home baker and a customer. Messages mix Hindi and English.

Find every order the customer placed in this chat. For each order, copy the customer's or baker's EXACT words for each detail, character for character, from one message. Do not translate, explain, convert or calculate anything. If a detail is not in the chat, use null. If the customer changed a detail later, copy the latest words. Skip orders the customer cancelled. A customer only asking prices, or talking about a past order, is not an order.

Fields:
- item: what they want, e.g. "chocolate truffle cake", "12 cupcakes"
- size: the exact words for weight or quantity, e.g. "1 kg", "aadha kilo", "2 dozen"
- eggless: the exact words about eggs, e.g. "eggless please", "egg chalega"
- day: the exact words for the day they want it, e.g. "kal shaam", "Sunday", "25th Oct"
- time: the exact words for the time they want it, e.g. "6 baje", "4pm", "lunch time"
- cake_message: the exact text to write on the cake
- price: the exact words with the total price, e.g. "1200 hoga"
- advance: the exact words about money already paid, e.g. "500 bhej diya"
- pickup_or_delivery: the exact words about pickup or delivery or the address

Reply with JSON only, no other text:
{"orders":[{"item":...,"size":...,"eggless":...,"day":...,"time":...,"cake_message":...,"price":...,"advance":...,"pickup_or_delivery":...}]}
If there is no order in the chat, reply {"orders":[]}.

Chat:
${text}`;
}

export function parseReply(reply: string): RawOrder[] {
  const start = reply.search(/[[{]/);
  const end = Math.max(reply.lastIndexOf('}'), reply.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('No JSON in model reply');
  const json = JSON.parse(reply.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
  const list = Array.isArray(json) ? json : Array.isArray(json.orders) ? json.orders : [json];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() && !/^(null|none|n\/a|not mentioned)$/i.test(v.trim()) ? v.trim() : null);
  return list
    .filter((o: unknown) => o && typeof o === 'object')
    .map((o: Record<string, unknown>) => ({
      item: str(o.item),
      size: str(o.size),
      eggless: str(o.eggless),
      day: str(o.day ?? o.when),
      time: str(o.time),
      cake_message: str(o.cake_message),
      price: str(o.price),
      advance: str(o.advance),
      pickup_or_delivery: str(o.pickup_or_delivery),
    }));
}

/** Check every quote against the chat and turn quotes into values. Never throws. */
export function checkOrder(raw: RawOrder, customer: string, messages: Message[]): Order {
  const flags: Flag[] = [];
  const sources = new Set<number>();

  // A quote that is not in the chat is a made-up detail: drop it and say so.
  const grounded = (field: keyof RawOrder): { text: string | null; at: number } => {
    const text = raw[field];
    if (!text) return { text: null, at: -1 };
    const at = findQuote(text, messages);
    if (at < 0) {
      flags.push({ field, note: `Gemma wrote "${text}", but those words aren't in the chat. Left blank.` });
      return { text: null, at: -1 };
    }
    sources.add(at);
    return { text, at };
  };

  const item = grounded('item');
  const size = grounded('size');
  const egg = grounded('eggless');
  const when = grounded('day');
  const time = grounded('time');
  const msg = grounded('cake_message');
  const price = grounded('price');
  const adv = grounded('advance');
  const hand = grounded('pickup_or_delivery');

  const sizeKg = parseSizeKg(size.text);
  const count = sizeKg === null ? parseCount(size.text) : null;
  if (size.text && sizeKg === null && count === null) flags.push({ field: 'size', note: `Couldn't read a size from "${size.text}".`, line: size.at });
  const changedSize = laterChange(size.at, messages, parseSizeKg, sizeKg);
  if (changedSize) {
    flags.push({ field: 'size', note: `A later message says ${changedSize.value} kg. Did they change it?`, line: changedSize.index });
  }

  const eggless = parseEggless(egg.text);
  if (egg.text && eggless === null) flags.push({ field: 'eggless', note: `"${egg.text}": eggless or not?`, line: egg.at });

  let resolved: When | null = null;
  if (when.text) {
    // The day is read relative to the message it came from; the time may come from another one.
    resolved = resolveWhen(when.text, messages[when.at].text, messages[when.at].at);
    if (time.text) {
      // "6 baje" alone is am-or-pm; the words around it ("shaam", "kal shaam") usually settle it.
      const t = parseTime(`${time.text} ${messages[time.at].text} ${when.text}`);
      if (t.time) resolved = { ...resolved, time: t.time, timeGuessed: t.guessed };
    }
    if (!resolved.sure) flags.push({ field: 'day', note: resolved.why, line: when.at });
    else if (resolved.timeGuessed) flags.push({ field: 'time', note: `"${time.text ?? when.text}": guessed ${resolved.time}. Confirm am/pm.`, line: time.at >= 0 ? time.at : when.at });
  } else {
    flags.push({ field: 'day', note: 'No day found. Ask when they want it.' });
  }

  const priceN = parseAmount(price.text);
  const advN = parseAmount(adv.text);
  if (adv.text && advN === null) flags.push({ field: 'advance', note: `Couldn't read an amount from "${adv.text}".`, line: adv.at });
  if (priceN !== null && advN !== null && advN > priceN) flags.push({ field: 'advance', note: `Advance ₹${advN} is more than the price ₹${priceN}.` });

  const handText = hand.text ? hand.text.toLowerCase() : '';
  const handover = /pick|le\s?ja|lene|collect|aake|aa ke|aaungi|aaunga/.test(handText)
    ? 'pickup'
    : /deliver|bhej|send|address|ghar|flat|sector|road|nagar|colony/.test(handText)
      ? 'delivery'
      : null;

  return {
    customer,
    item: displayItem(item.text, size.text) ?? 'Order (item unclear)',
    sizeKg,
    count,
    sizeText: size.text,
    eggless,
    when: resolved,
    whenText: [when.text, time.text].filter(Boolean).join(' · ') || null,
    cakeMessage: cleanCakeMessage(msg.text),
    price: priceN,
    advance: advN,
    handover,
    address: handover === 'delivery' ? hand.text : null,
    flags: item.text ? flags : [{ field: 'item', note: 'Not sure what was ordered.' }, ...flags],
    sources: [...sources].sort((a, b) => a - b),
    messages,
  };
}

/** "half kg red velvet" next to a "0.5 kg" column reads twice; drop the size words from the item. */
function displayItem(item: string | null, size: string | null): string | null {
  if (!item) return null;
  let out = item;
  if (size && out.toLowerCase().includes(size.toLowerCase())) {
    const rest = out.replace(new RegExp(size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
    if (rest) out = rest;
  }
  out = out.replace(/^\s*(\d+(\.\d+)?\s*(kg|kgs|kilo|gm|g|lb|pound)s?|half\s*kg|aadha\s*kilo|\d+\s*dozen|\d+)\s+(ka\s+|of\s+)?/i, '').trim();
  return out || item;
}

export async function extractOrders(chat: Chat, baker: string | null, now: Date, generate: Generate): Promise<Order[]> {
  const messages = recent(chat, now);
  if (!messages.some((m) => m.sender !== baker)) return [];
  const prompt = buildPrompt(transcript(messages, baker));
  let raws: RawOrder[];
  try {
    raws = parseReply(await generate(prompt));
  } catch {
    // One retry with a nudge; small models sometimes start with prose.
    raws = parseReply(await generate(prompt + '\n\nReply with the JSON object only.'));
  }
  return checkChat(raws, chat.name, messages).orders;
}

export interface Skipped {
  customer: string;
  item: string;
  why: string;
}

const CANCEL = /\b(cancel|cancelled|canceled|nahi chahiye|nahin chahiye|mat banana|mat banao|rehne do|rahne do|don'?t need|not needed|no longer)\b/i;
const ENQUIRY = /\b(kitna|kitne|kitni|price|rate|how much|cost|charges?)\b|\?\s*$/i;
const normItem = (s: string) => s.toLowerCase().replace(/\b\d+(\.\d+)?\s*(kg|kilo|gm|g|dozen|pcs)?\b|\bcake\b|[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Check every order Gemma found in one chat, then apply three rules about the chat as a whole:
 * a repeated item is one order with the latest details; an order the customer cancelled later
 * comes off the sheet; a price question with no day and no money paid is an enquiry, not an order.
 */
export function checkChat(raws: RawOrder[], customer: string, messages: Message[]): { orders: Order[]; skipped: Skipped[] } {
  const skipped: Skipped[] = [];
  const merged: RawOrder[] = [];
  for (const r of raws.filter((r) => r.item || r.day || r.size)) {
    const same = merged.find((m) => m.item && r.item && normItem(m.item) && normItem(m.item) === normItem(r.item));
    if (!same) {
      merged.push({ ...r });
      continue;
    }
    // Later details win; anything the later copy left out keeps its earlier value.
    for (const k of Object.keys(r) as (keyof RawOrder)[]) if (r[k]) same[k] = r[k];
  }

  const orders: Order[] = [];
  for (const raw of merged) {
    const o = checkOrder(raw, customer, messages);
    const last = o.sources.length ? Math.max(...o.sources) : -1;
    const cancel = messages.findIndex((m, i) => i >= last && last >= 0 && m.sender === messages[last].sender && CANCEL.test(m.text));
    const cancelAfter = cancel >= 0 ? cancel : messages.findIndex((m, i) => i > last && CANCEL.test(m.text));
    if (cancelAfter >= 0 && cancelAfter >= last) {
      skipped.push({ customer, item: o.item, why: `Cancelled in the chat: "${messages[cancelAfter].text}"` });
      continue;
    }
    const itemLine = raw.item ? messages[o.sources.find((i) => messages[i].text.toLowerCase().includes(raw.item!.toLowerCase().split(' ').pop()!)) ?? -1] : undefined;
    if (!raw.day && o.advance === null && itemLine && ENQUIRY.test(itemLine.text)) {
      skipped.push({ customer, item: o.item, why: `Only asked the price: "${itemLine.text}"` });
      continue;
    }
    orders.push(o);
  }
  return { orders, skipped };
}

/** WhatsApp text the baker can send back. The customer is the last check. */
export function confirmation(o: Order): string {
  const lines = [`Hi ${o.customer.split(' ')[0]}! Confirming your order 🎂`];
  const size = o.sizeKg ? `${o.sizeKg} kg ` : o.count ? `${o.count} × ` : '';
  lines.push(`• ${size}${o.item}${o.eggless === true ? ' (eggless)' : o.eggless === false ? ' (with egg)' : ''}`);
  if (o.when?.date) lines.push(`• ${dayLabel(o.when.date)}${o.when.time ? `, ${o.when.time}` : ''}${o.handover ? ` (${o.handover})` : ''}`);
  if (o.cakeMessage) lines.push(`• On the cake: "${o.cakeMessage}"`);
  if (o.price !== null) {
    const bal = o.advance !== null ? ` · advance ₹${o.advance} received · balance ₹${o.price - o.advance}` : '';
    lines.push(`• Total ₹${o.price}${bal}`);
  } else if (o.advance !== null) lines.push(`• Advance ₹${o.advance} received`);
  lines.push('Sab sahi hai? Reply 👍 to confirm.');
  return lines.join('\n');
}

export function dayLabel(d: Date): string {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${wd} ${d.getUTCDate()} ${mo}`;
}

export { fmtDate };
