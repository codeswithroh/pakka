// Turn the words a customer used ("kal shaam 6 baje", "Sunday", "25th") into a date and time.
// Gemma never does this part. It only copies the words; this file decides what they mean,
// relative to when the message was sent, and says so when it can't be sure.
//
// The hard case: in Hindi, "kal" means both yesterday and tomorrow, and "parso" means both the
// day before yesterday and the day after tomorrow. Only the verb tense tells them apart.

export interface When {
  date: Date | null; // civil date (UTC fields = wall clock), midnight
  time: string | null; // "6:00 pm", or null if no time was given
  timeGuessed: boolean; // "6 baje" with no subah/shaam: we guessed am/pm
  sure: boolean;
  why: string; // shown to the baker when not sure
}

const DAY = 86_400_000;

const DEVANAGARI: [RegExp, string][] = [
  [/कल/g, 'kal'],
  [/आज/g, 'aaj'],
  [/परसों|परसो/g, 'parso'],
  [/सुबह/g, 'subah'],
  [/शाम/g, 'shaam'],
  [/रात/g, 'raat'],
  [/दोपहर/g, 'dopahar'],
  [/बजे/g, 'baje'],
  [/आधा/g, 'aadha'],
  [/डेढ़|डेढ/g, 'dedh'],
  [/किलो/g, 'kilo'],
  [/बिना/g, 'bina'],
  [/अंडे|अंडा/g, 'ande'],
  [/चाहिए|चाहिये/g, 'chahiye'],
  [/देना/g, 'dena'],
  [/था|थी|थे/g, 'tha'],
];

export function romanise(s: string): string {
  let out = s;
  for (const [re, to] of DEVANAGARI) out = out.replace(re, to);
  return out.toLowerCase();
}

const WEEKDAYS: [RegExp, number][] = [
  [/\b(sun(day)?|ravivaar|ravivar|itvaar|itwar|इतवार|रविवार)\b/, 0],
  [/\b(mon(day)?|somvaar|somvar|सोमवार)\b/, 1],
  [/\b(tue(s|sday)?|mangalvaar|mangalvar|mangal|मंगलवार)\b/, 2],
  [/\b(wed(nesday)?|budhvaar|budhvar|budh|बुधवार)\b/, 3],
  [/\b(thu(rs|rsday)?|guruvaar|guruvar|veervar|brihaspativar|गुरुवार)\b/, 4],
  [/\b(fri(day)?|shukravaar|shukravar|shukra|शुक्रवार)\b/, 5],
  [/\b(sat(urday)?|shanivaar|shanivar|shani|शनिवार)\b/, 6],
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Past-tense Hindi/English markers. "kal jo cake liya tha" is yesterday.
const PAST =
  /\b(tha|thi|the|kiya|kiye|liya|liye|diya|diye|gaya|gayi|gaye|mila|mili|aaya|aayi|aaye|hua|hui|khaya|khayi|bheja|bheji|was|were|did|had|yesterday|last)\b/;
// Future/request markers. "kal chahiye" is tomorrow.
const FUTURE =
  /\b(chahiye|chaiye|chahie|chahiye\.|dena|de\s?dena|dedo|de\s?do|bhejna|bhej\s?dena|bana\s?dena|banana|karna|kar\s?dena|hoga|hogi|milega|milegi|ready|deliver|delivery|pickup|pick\s?up|lene|lunga|lungi|aaunga|aaungi|want|need|can you|please|plz|pls|will|order|tak)\b/;

/** The clause of `message` that contains `quote` (split on punctuation and conjunctions). */
function clauseOf(message: string, quote: string): string {
  const msg = romanise(message);
  const q = romanise(quote).trim();
  const parts = msg.split(/[,.!?;\n]+|\s(?:aur|and|but|par|lekin|or)\s/);
  return parts.find((p) => p.includes(q)) ?? parts.find((p) => q.split(/\s+/).some((w) => w.length > 2 && p.includes(w))) ?? msg;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function parseTime(q: string): { time: string | null; guessed: boolean } {
  const s = romanise(q);
  const m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje|bje|o'?clock)?\b/);
  const hasPart = /\b(subah|morning|dopahar|afternoon|shaam|sham|evening|raat|night|tonight|lunch|dinner)\b/.exec(s);
  if (!m || (!m[3] && !hasPart && !/\d[:.]\d{2}/.test(s))) {
    if (hasPart) {
      const part = hasPart[1];
      const label = /subah|morning/.test(part)
        ? 'morning'
        : /dopahar|afternoon|lunch/.test(part)
          ? 'afternoon'
          : /raat|night|tonight|dinner/.test(part)
            ? 'night'
            : 'evening';
      return { time: label, guessed: false };
    }
    return { time: null, guessed: false };
  }
  let h = Number(m[1]);
  const min = m[2] ?? '00';
  if (h > 23 || Number(min) > 59) return { time: null, guessed: false };
  const suffix = (m[3] ?? '').replace(/\./g, '');
  let guessed = false;
  if (suffix === 'pm' && h < 12) h += 12;
  else if (suffix === 'am' && h === 12) h = 0;
  else if (suffix !== 'am' && suffix !== 'pm' && h <= 12) {
    const part = hasPart?.[1] ?? '';
    if (/subah|morning/.test(part)) {
      if (h === 12) h = 0;
    } else if (/dopahar|afternoon|lunch|shaam|sham|evening|raat|night|tonight|dinner/.test(part)) {
      if (h < 12) h += 12;
    } else {
      // "6 baje" with nothing else: cakes go out in the afternoon/evening far more than at dawn.
      if (h >= 1 && h <= 8) h += 12;
      guessed = true;
    }
  }
  const mm = min === '00' ? ':00' : `:${min}`;
  return { time: `${h % 12 || 12}${mm} ${h < 12 ? 'am' : 'pm'}`, guessed };
}

/**
 * @param quote   the words Gemma copied, e.g. "kal shaam 6 baje"
 * @param message the full message those words came from (for tense)
 * @param sentAt  when that message was sent
 */
export function resolveWhen(quote: string, message: string, sentAt: Date): When {
  const q = romanise(quote);
  const base = startOfDay(sentAt);
  const { time, guessed } = parseTime(quote);
  const at = (days: number) => new Date(base.getTime() + days * DAY);
  const result = (date: Date | null, sure: boolean, why = ''): When => ({ date, time, timeGuessed: guessed, sure, why });

  // Relative Hindi/English words. Order matters: "parso" before "kal" ("kal ya parso").
  const relative: [RegExp, number, string][] = [
    [/\b(narso|narson)\b/, 3, 'narso'],
    [/\b(parso|parson|parsoon|day after tomorrow)\b/, 2, 'parso'],
    [/\b(kal|kl|kall|tomorrow|tmrw|tmr|tomorow|tommorow)\b/, 1, 'kal'],
    [/\b(aaj|aj|today|tonight|abhi)\b/, 0, 'aaj'],
  ];
  const hits = relative.filter(([re]) => re.test(q));
  if (hits.length > 1 && !(hits.length === 2 && hits.some((h) => h[2] === 'aaj'))) {
    return result(null, false, `"${quote}" names two different days. Which one did they settle on?`);
  }
  if (hits.length) {
    const [, days, word] = hits[0];
    const twoWay = word === 'kal' || word === 'parso';
    const isHindi = /\b(kal|kl|kall|parso|parson|parsoon|narso|narson)\b/.test(q);
    if (twoWay && isHindi) {
      const clause = clauseOf(message, quote);
      const past = PAST.test(clause);
      const future = FUTURE.test(clause);
      if (past && !future) {
        return result(at(-days), false, `"${word}" here sounds like the past ("${clause.trim()}"), so this may be about an old order.`);
      }
      if (past && future) {
        return result(at(days), false, `"${clause.trim()}" mixes past and future, so "${word}" could be either way.`);
      }
    }
    return result(at(days), true);
  }

  // Explicit date: "25th", "25 oct", "oct 25", "25/10", "25 tarikh"
  const dm =
    q.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/) ??
    q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dm) {
    const [d, mon] = /\d/.test(dm[1]) ? [Number(dm[1]), dm[2]] : [Number(dm[2]), dm[1]];
    const month = MONTHS.indexOf(mon.slice(0, 3));
    let date = new Date(Date.UTC(base.getUTCFullYear(), month, d));
    if (date.getTime() < base.getTime() - 30 * DAY) date = new Date(Date.UTC(base.getUTCFullYear() + 1, month, d));
    return result(date, true);
  }
  const slash = q.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?\b/);
  if (slash && Number(slash[2]) <= 12) {
    return result(new Date(Date.UTC(base.getUTCFullYear(), Number(slash[2]) - 1, Number(slash[1]))), true);
  }
  const nth = q.match(/\b(\d{1,2})\s*(st|nd|rd|th|tarikh|tareekh|ko)\b/);
  if (nth) {
    const d = Number(nth[1]);
    let date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), d));
    if (date < base) date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, d));
    return result(date, true);
  }

  // Weekday: the next one on or after the day the message was sent.
  for (const [re, wd] of WEEKDAYS) {
    if (!re.test(q)) continue;
    let ahead = (wd - base.getUTCDay() + 7) % 7;
    if (ahead === 0) {
      return result(at(7), false, `Sent on a ${dayName(base)} and says "${quote}": today, or a week from today?`);
    }
    if (/\bnext\b|\bagle\b|\bagla\b/.test(q)) {
      // Indian English "next Sunday" usually means the coming one, but not always.
      return result(at(ahead), false, `"${quote}": the coming ${dayName(at(ahead))}, or the one after?`);
    }
    return result(at(ahead), true);
  }

  if (time) return result(base, false, `"${quote}" gives a time but no day.`);
  return result(null, false, `Couldn't read a day from "${quote}".`);
}

export function dayName(d: Date): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
}
