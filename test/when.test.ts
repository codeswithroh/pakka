import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWhen } from '../src/core/when.ts';
import { civil } from '../src/core/whatsapp.ts';
import { parseSizeKg, parseAmount, parseEggless, cleanCakeMessage, findQuote } from '../src/core/fields.ts';

const sat = civil(2026, 10, 17, 21, 41); // Saturday 9:41 pm
const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

test('kal with a request is tomorrow', () => {
  const w = resolveWhen('kal shaam 6 baje', 'kal shaam 6 baje tak 1 kg chocolate truffle chahiye', sat);
  assert.equal(iso(w.date), '2026-10-18');
  assert.equal(w.time, '6:00 pm');
  assert.equal(w.sure, true);
});
test('kal in the past tense is flagged, not scheduled', () => {
  const w = resolveWhen('kal', 'kal jo cake liya tha sabko bahut pasand aaya', sat);
  assert.equal(w.sure, false);
  assert.equal(iso(w.date), '2026-10-16');
});
test('kal next to a payment in another clause is still tomorrow', () => {
  const w = resolveWhen('kal 4 baje', 'kal 4 baje de dena, 500 bhej diya', sat);
  assert.equal(w.sure, true);
  assert.equal(iso(w.date), '2026-10-18');
});
test('Devanagari kal', () => {
  const w = resolveWhen('कल शाम 7 बजे', 'कल शाम 7 बजे चाहिए', sat);
  assert.equal(iso(w.date), '2026-10-18');
  assert.equal(w.time, '7:00 pm');
});
test('parso', () => assert.equal(iso(resolveWhen('parso subah 11', 'parso subah 11 baje ready rakhna', sat).date), '2026-10-19'));
test('weekday', () => assert.equal(iso(resolveWhen('Tuesday 5pm', 'Tuesday 5pm pickup', sat).date), '2026-10-20'));
test('same weekday is ambiguous', () => assert.equal(resolveWhen('Saturday', 'Saturday chahiye', sat).sure, false));
test('next weekday is flagged', () => assert.equal(resolveWhen('next Sunday', 'next Sunday ko chahiye', sat).sure, false));
test('25th', () => assert.equal(iso(resolveWhen('25th', '25th ko birthday hai', sat).date), '2026-10-25'));
test('3rd rolls to next month', () => assert.equal(iso(resolveWhen('3rd', '3rd ko chahiye', sat).date), '2026-11-03'));
test('26 oct', () => assert.equal(iso(resolveWhen('26 Oct', 'need it on 26 Oct', sat).date), '2026-10-26'));
test('baje without part of day is guessed', () => {
  const w = resolveWhen('kal 6 baje', 'kal 6 baje chahiye', sat);
  assert.equal(w.time, '6:00 pm');
  assert.equal(w.timeGuessed, true);
});
test('two days', () => assert.equal(resolveWhen('kal ya parso', 'kal ya parso chahiye', sat).sure, false));

test('sizes', () => {
  assert.equal(parseSizeKg('1 kg'), 1);
  assert.equal(parseSizeKg('1.5kg'), 1.5);
  assert.equal(parseSizeKg('aadha kilo'), 0.5);
  assert.equal(parseSizeKg('half kg'), 0.5);
  assert.equal(parseSizeKg('500 gm'), 0.5);
  assert.equal(parseSizeKg('dedh kilo'), 1.5);
  assert.equal(parseSizeKg('2 pound'), 1);
  assert.equal(parseSizeKg('12 cupcakes'), null);
});
test('money', () => {
  assert.equal(parseAmount('1200 hoga'), 1200);
  assert.equal(parseAmount('₹1,450'), 1450);
  assert.equal(parseAmount('Rs. 900'), 900);
  assert.equal(parseAmount('500 bhej diya gpay pe'), 500);
  assert.equal(parseAmount('1.2k'), 1200);
});
test('eggs', () => {
  assert.equal(parseEggless('eggless please'), true);
  assert.equal(parseEggless('bina ande ka'), true);
  assert.equal(parseEggless('egg chalega'), false);
  assert.equal(parseEggless('maybe'), null);
});
test('cake message', () => {
  assert.equal(cleanCakeMessage('upar likh dena "Happy Birthday Riya"'), 'Happy Birthday Riya');
  assert.equal(cleanCakeMessage('Happy Anniversary Mom & Dad likh dena'), 'Happy Anniversary Mom & Dad');
});
test('quotes must come from the chat', () => {
  const msgs = [{ text: 'hi didi' }, { text: 'kal shaam 6 baje tak 1 kg chocolate truffle chahiye, eggless please' }];
  assert.equal(findQuote('kal shaam 6 baje', msgs), 1);
  assert.equal(findQuote('Kal Shaam 6 baje.', msgs), 1);
  assert.equal(findQuote('tomorrow 6pm', msgs), -1);
});
