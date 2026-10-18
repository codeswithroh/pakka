import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChat } from '../src/core/whatsapp.ts';
import { checkOrder, confirmation, parseReply } from '../src/core/extract.ts';
import { CASES, BAKER, toExport } from '../src/core/samples.ts';

const NOW = new Date(Date.UTC(2026, 9, 17, 22, 30));
const chatOf = (id: string) => {
  const c = CASES.find((x) => x.id === id)!;
  return parseChat(toExport(c, NOW), c.customer);
};

test('parses Android and iPhone exports', () => {
  const a = parseChat('17/10/26, 9:42 pm - Priya: kal chahiye\nsecond line\n17/10/26, 9:43 pm - Neha: ok');
  assert.equal(a.messages.length, 2);
  assert.equal(a.messages[0].text, 'kal chahiye\nsecond line');
  assert.equal(a.messages[0].at.getUTCHours(), 21);
  const i = parseChat('[17/10/26, 9:42:05 PM] Priya: kal chahiye\n[17/10/26, 9:43:10 PM] Neha: ok');
  assert.equal(i.messages.length, 2);
  assert.equal(i.messages[1].sender, 'Neha');
});

test('a detail Gemma made up is dropped and flagged', () => {
  const chat = chatOf('priya-truffle');
  const [raw] = parseReply('{"orders":[{"item":"chocolate truffle","size":"1 kg","eggless":"eggless please","day":"tomorrow evening","time":"6 baje","cake_message":"Happy Birthday Riya","price":"1200 hoga","advance":"500 advance bhej diya"}]}');
  const o = checkOrder(raw, chat.name, chat.messages);
  assert.equal(o.when, null); // "tomorrow evening" is not in the chat
  assert.ok(o.flags.some((f) => f.field === 'day' && /aren't in the chat/.test(f.note)));
  assert.equal(o.sizeKg, 1);
  assert.equal(o.price, 1200);
  assert.equal(o.advance, 500);
});

test('copied words become a checked order', () => {
  const chat = chatOf('priya-truffle');
  const [raw] = parseReply('Here you go:\n```json\n{"orders":[{"item":"chocolate truffle","size":"1 kg","eggless":"eggless please","day":"kal shaam","time":"6 baje","cake_message":"upar likh dena \\"Happy Birthday Riya\\"","price":"1200 hoga","advance":"500 advance bhej diya",}]}\n```');
  const o = checkOrder(raw, chat.name, chat.messages);
  assert.equal(o.when?.date?.toISOString().slice(0, 10), '2026-10-18');
  assert.equal(o.when?.time, '6:00 pm');
  assert.equal(o.cakeMessage, 'Happy Birthday Riya');
  assert.equal(o.eggless, true);
  assert.deepEqual(o.flags, []);
  assert.match(confirmation(o), /balance ₹700/);
});

test('a later size change is caught', () => {
  const chat = chatOf('ananya-changed');
  const [raw] = parseReply('{"orders":[{"item":"black forest","size":"1 kg","day":"Sunday","time":"1 baje"}]}');
  const o = checkOrder(raw, chat.name, chat.messages);
  assert.ok(o.flags.some((f) => f.field === 'size' && /1.5 kg/.test(f.note)));
});

test('"kal" about yesterday is not scheduled as tomorrow', () => {
  const chat = chatOf('rahul-yesterday');
  const [raw] = parseReply('{"orders":[{"item":"red velvet","day":"kal"}]}');
  const o = checkOrder(raw, chat.name, chat.messages);
  assert.equal(o.when?.sure, false);
  assert.equal(o.when?.date?.toISOString().slice(0, 10), '2026-10-16');
});

test('every sample chat parses', () => {
  for (const c of CASES) assert.equal(parseChat(toExport(c, NOW)).messages.length, c.lines.length, c.id);
  assert.ok(BAKER);
});
