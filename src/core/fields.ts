// Gemma copies words out of the chat; these functions turn the words into values.
// Each one returns null rather than guess.
import { romanise } from './when.ts';

/** "1 kg", "1.5kg", "half kg", "aadha kilo", "500 gm", "2 pound" -> kilograms */
export function parseSizeKg(quote: string | null): number | null {
  if (!quote) return null;
  const s = romanise(quote).replace(/½/g, '0.5');
  if (/\b(half|aadha|adha|aada|1\/2)\s*(kg|kilo|kgs)\b/.test(s)) return 0.5;
  if (/\b(dedh|derh)\s*(kg|kilo|kgs)?\b/.test(s)) return 1.5;
  if (/\b(dhai|dhaai|adhai)\s*(kg|kilo|kgs)?\b/.test(s)) return 2.5;
  if (/\b(paune|pauna)\s*(kg|kilo)\b/.test(s)) return 0.75;
  if (/\b(ek|one)\s*(kg|kilo)\b/.test(s)) return 1;
  if (/\b(do|two)\s*(kg|kilo)\b/.test(s)) return 2;
  const kg = s.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|किलो)\b/);
  if (kg) return Number(kg[1]);
  const g = s.match(/(\d{3,4})\s*(g|gm|gms|gram|grams)\b/);
  if (g) return Number(g[1]) / 1000;
  const lb = s.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)\b/);
  if (lb) return Math.round(Number(lb[1]) * 0.4536 * 4) / 4;
  return null;
}

/** "12 cupcakes", "2 dozen", "1 dozen brownies" -> pieces (for non-cake items) */
export function parseCount(quote: string | null): number | null {
  if (!quote) return null;
  const s = romanise(quote);
  const doz = s.match(/(\d+|half|aadha|ek|one|do|two)\s*dozen/);
  if (doz) {
    const n = { half: 0.5, aadha: 0.5, ek: 1, one: 1, do: 2, two: 2 }[doz[1]] ?? Number(doz[1]);
    return n * 12;
  }
  const pcs = s.match(/(\d+)\s*(pcs|pieces|piece|nos|cupcakes|brownies|cookies|jar|jars|box|boxes|tub|tubs|pc)?\b/);
  if (pcs && !/kg|kilo|gm|gram|lb|pound/.test(s)) return Number(pcs[1]);
  return null;
}

/** true = eggless, false = with egg, null = not said */
export function parseEggless(quote: string | null): boolean | null {
  if (!quote) return null;
  const s = romanise(quote);
  if (/\b(egg\s?less|eggles|egless|bina\s?ande?|bina\s?egg|without\s?eggs?|no\s?eggs?|egg\s?free|anda\s?nahi|ande\s?ke\s?bina|veg\s?only|pure\s?veg|jain)\b/.test(s)) return true;
  if (/\b(with\s?eggs?|egg\s?wala|egg\s?vala|anda\s?chalega|egg\s?chalega|egg\s?is\s?fine|egg\s?ok|non[\s-]?veg)\b/.test(s)) return false;
  return null;
}

/** "₹1200", "Rs. 1,200", "1.2k", "500 advance", "baarah sau" (not handled -> null) */
export function parseAmount(quote: string | null): number | null {
  if (!quote) return null;
  const s = romanise(quote).replace(/,(?=\d{2,3}\b)/g, '');
  const k = s.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (k) return Math.round(Number(k[1]) * 1000);
  const m = s.match(/(?:₹|rs\.?|inr|rupees?)\s*(\d{2,6})|(\d{2,6})\s*(?:₹|rs\.?|\/-|rupees?|rupay|rupaye|ka|ki|ke|hoga|hogi|total|advance|bhej|sent|paid|done|gpay|paytm|phonepe|upi)/);
  if (m) return Number(m[1] ?? m[2]);
  const bare = s.match(/\b(\d{3,6})\b/);
  return bare ? Number(bare[1]) : null;
}

/** "upar likh dena 'Happy Birthday Riya'" -> "Happy Birthday Riya" */
export function cleanCakeMessage(quote: string | null): string | null {
  if (!quote) return null;
  let s = quote.trim();
  const quoted = s.match(/["“”'‘’]([^"“”'‘’]{2,60})["“”'‘’]/);
  if (quoted) return quoted[1].trim();
  s = s
    .replace(/^(message|msg|naam|name|text|likhna|likh dena|upar likh dena|upar likhna|cake pe likhna|cake par likhna|write)\s*[:\-–]?\s*/i, '')
    .replace(/\s*(likh dena|likhna|likh do|likhwana|likh dijiye|write on (it|top)|on top|upar)\s*(please|plz|pls)?\s*$/i, '');
  return s.trim() || null;
}

// --- grounding: did Gemma copy this from the chat, or make it up? ---

export function normalise(s: string): string {
  return romanise(s)
    .normalize('NFKC')
    .replace(/[“”"'‘’`]/g, '')
    .replace(/[^\p{L}\p{N}₹.\s]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Index of the message that contains the quote, or -1 if Gemma made it up. */
export function findQuote(quote: string | null, messages: { text: string }[]): number {
  if (!quote) return -1;
  const q = normalise(quote);
  if (!q) return -1;
  // Search newest first: if a detail was repeated, the latest mention is the one that counts.
  for (let i = messages.length - 1; i >= 0; i--) if (normalise(messages[i].text).includes(q)) return i;
  // Small models trim or join words. Accept a quote whose words all sit in one message, in order.
  const words = q.split(' ').filter((w) => w.length > 1);
  if (!words.length) return -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = normalise(messages[i].text);
    let from = 0;
    let ok = true;
    for (const w of words) {
      const at = t.indexOf(w, from);
      if (at < 0) {
        ok = false;
        break;
      }
      from = at + w.length;
    }
    if (ok) return i;
  }
  return -1;
}

/**
 * Customers change their minds ("actually 1.5 kg kar do"). If a later message mentions a
 * different value of the same kind, the earlier quote is stale.
 */
export function laterChange<T>(
  quoteIndex: number,
  messages: { text: string }[],
  parse: (s: string) => T | null,
  value: T | null,
): { index: number; value: T } | null {
  if (quoteIndex < 0 || value === null) return null;
  for (let i = messages.length - 1; i > quoteIndex; i--) {
    const v = parse(messages[i].text);
    if (v !== null && v !== value) return { index: i, value: v };
  }
  return null;
}
