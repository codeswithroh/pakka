// Parse a WhatsApp "Export chat" .txt (Android and iPhone formats) into messages.
// Dates are kept as "civil" times: a Date whose UTC fields are the wall-clock time in the
// chat, so nothing shifts when the phone and the chat disagree about time zones.

export interface Message {
  at: Date;
  sender: string;
  text: string;
}

export interface Chat {
  name: string; // usually the customer, from the file name or the most frequent other sender
  messages: Message[];
}

// Android: 17/10/2026, 9:41 pm - Priya: hi      (also 17/10/26, 21:41 - Priya: hi)
// iPhone:  [17/10/26, 9:41:05 PM] Priya: hi
const LINE =
  /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?([^:]{1,60}?):\s([\s\S]*)$/i;

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;

export function civil(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi));
}

export function parseChat(raw: string, name = ''): Chat {
  const messages: Message[] = [];
  const lines = raw.replace(INVISIBLE, '').replace(/ | /g, ' ').split(/\r?\n/);
  // Most exports are day-first; switch to month-first only if a "day" is ever > 12 in slot two.
  const monthFirst = lines.some((l) => {
    const m = l.match(LINE);
    return m && Number(m[2]) > 12;
  });

  for (const line of lines) {
    const m = line.match(LINE);
    if (!m) {
      // A continuation of the previous message (multi-line text), or a system notice.
      if (messages.length && line.trim()) messages[messages.length - 1].text += '\n' + line;
      continue;
    }
    const [, a, b, yy, hh, mm, ampm, sender, text] = m;
    const day = Number(monthFirst ? b : a);
    const month = Number(monthFirst ? a : b);
    let year = Number(yy);
    if (year < 100) year += 2000;
    let hour = Number(hh);
    if (ampm) {
      const pm = /p/i.test(ampm);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const body = text.trim();
    if (/^<media omitted>$|^this message was deleted$|^you deleted this message$/i.test(body)) continue;
    messages.push({ at: civil(year, month, day, hour, Number(mm)), sender: sender.trim(), text: body });
  }

  return { name: name || guessName(messages), messages };
}

function guessName(messages: Message[]): string {
  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Chat';
}

/** "WhatsApp Chat with Priya Sharma.txt" -> "Priya Sharma" */
export function nameFromFile(file: string): string {
  const base = file.replace(/^.*[\\/]/, '').replace(/\.(txt|zip)$/i, '');
  return base.replace(/^WhatsApp Chat (with|-)\s*/i, '').trim();
}

/** The baker is whoever appears in every chat (or is picked by hand when there is one chat). */
export function guessBaker(chats: Chat[]): string | null {
  if (chats.length < 2) return null;
  const sets = chats.map((c) => new Set(c.messages.map((m) => m.sender)));
  const common = [...sets[0]].filter((s) => sets.every((set) => set.has(s)));
  return common[0] ?? null;
}

export function senders(chat: Chat): string[] {
  return [...new Set(chat.messages.map((m) => m.sender))];
}

/** Only the recent part of a long chat matters for upcoming orders. */
export function recent(chat: Chat, now: Date, days = 10): Message[] {
  const from = now.getTime() - days * 86_400_000;
  return chat.messages.filter((m) => m.at.getTime() >= from);
}

export function fmtTime(d: Date): string {
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

export function fmtDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
}

/** The transcript Gemma reads: numbered lines so it can point at them. */
export function transcript(messages: Message[], baker: string | null): string {
  return messages
    .map((m, i) => {
      const who = baker && m.sender === baker ? `Baker (${m.sender})` : `Customer (${m.sender})`;
      return `[${i + 1}] ${fmtDate(m.at)} ${fmtTime(m.at)} ${who}: ${m.text}`;
    })
    .join('\n');
}
