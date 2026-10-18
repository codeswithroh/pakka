import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import './style.css';
import { unzipSync, strFromU8 } from 'fflate';
import { parseChat, nameFromFile, guessBaker, senders, fmtTime, recent, transcript, type Chat, type Message } from './core/whatsapp.ts';
import { checkChat, buildPrompt, confirmation, dayLabel, parseReply, type Order, type Skipped } from './core/extract.ts';
import { CASES, BAKER, toExport, shiftRecordedReply } from './core/samples.ts';
import { hasWebGpu, loadGemma, generate, modelIsCached } from './llm.ts';
import recorded from './recorded.json';
import { icon } from './icons.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
let forceReplay = false;
const DAY = 86_400_000;

// "Now" as a civil time, in the same frame the chat parser uses.
function civilNow(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
}

interface State {
  chats: Chat[];
  baker: string | null;
  orders: Order[];
  skipped: Skipped[];
  progress: { done: number; total: number; current: string } | null;
  status: string;
  fraction: number | null;
  mode: 'live' | 'recorded' | null;
  error: string | null;
  gpu: boolean | null;
  cached: boolean;
  checked: Set<string>;
}

const state: State = {
  chats: [],
  baker: null,
  orders: [],
  skipped: [],
  progress: null,
  status: '',
  fraction: null,
  mode: null,
  error: null,
  gpu: null,
  cached: false,
  checked: new Set(),
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rupees = (n: number) => '₹' + n.toLocaleString('en-IN');
const key = (o: Order, i: number) => `${o.customer}|${o.item}|${i}`;

// ---------- input ----------

async function readFiles(files: FileList | File[]) {
  const chats: Chat[] = [];
  for (const f of Array.from(files)) {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.txt$/i.test(e.name) });
      for (const [name, data] of Object.entries(entries)) {
        const chatName = /^_chat\.txt$/i.test(name.replace(/^.*\//, '')) ? nameFromFile(f.name) : nameFromFile(name);
        chats.push(parseChat(strFromU8(data), chatName));
      }
    } else {
      chats.push(parseChat(await f.text(), nameFromFile(f.name)));
    }
  }
  addChats(chats.filter((c) => c.messages.length));
}

function addChats(chats: Chat[]) {
  if (!chats.length) {
    state.error = "Couldn't find any WhatsApp messages in that. Export the chat as .txt (Without media) and try again.";
    return render();
  }
  state.error = null;
  state.chats.push(...chats);
  state.baker = guessBaker(state.chats) ?? state.baker;
  render();
}

function loadSamples() {
  const now = civilNow();
  state.chats = CASES.map((c) => parseChat(toExport(c, now), c.customer));
  state.baker = BAKER;
  state.orders = [];
  state.skipped = [];
  state.mode = null;
  render();
}

// ---------- reading ----------

async function readAll() {
  state.error = null;
  state.orders = [];
  state.skipped = [];
  const now = civilNow();
  const isSample = state.baker === BAKER;
  const gpu = forceReplay ? false : (state.gpu ?? (state.gpu = await hasWebGpu()));

  if (!gpu) {
    if (!isSample) {
      state.error = "This browser can't run Gemma (it needs WebGPU: Chrome or Edge on a laptop or a recent Android phone, or Safari 26). Your chats stay where they are. Try the sample chats to see a recorded run.";
      return render();
    }
    return replayRecorded(now);
  }

  try {
    state.status = 'Getting Gemma ready…';
    render();
    await loadGemma((msg, f) => {
      state.status = msg;
      state.fraction = f ?? null;
      renderStatus();
    });
  } catch (e) {
    console.warn(e);
    if (isSample) return replayRecorded(now);
    state.error = `Gemma couldn't start on this device: ${(e as Error).message}`;
    state.status = '';
    return render();
  }

  state.mode = 'live';
  state.fraction = null;
  state.progress = { done: 0, total: state.chats.length, current: '' };
  for (const chat of state.chats) {
    state.progress.current = chat.name;
    state.status = `Gemma is reading ${chat.name}'s chat…`;
    renderStatus();
    try {
      const messages = recent(chat, now);
      if (messages.some((m) => m.sender !== state.baker)) {
        const prompt = buildPrompt(transcript(messages, state.baker));
        let raws;
        try {
          raws = parseReply(await generate(prompt));
        } catch {
          raws = parseReply(await generate(prompt + '\n\nReply with the JSON object only.'));
        }
        const { orders, skipped } = checkChat(raws, chat.name, messages);
        state.orders.push(...orders);
        state.skipped.push(...skipped);
      }
    } catch (e) {
      console.warn(chat.name, e);
    }
    state.progress.done++;
    render();
  }
  state.progress = null;
  state.status = '';
  animateNext = true;
  render();
}

/** No WebGPU: run the checker live on replies Gemma 4 E2B gave for these chats in our eval. */
function replayRecorded(now: Date) {
  state.mode = 'recorded';
  state.status = '';
  const replies = recorded as Record<string, string>;
  state.orders = CASES.flatMap((c, i) => {
    const reply = replies[c.id];
    if (!reply) return [];
    const chat = state.chats[i];
    const messages = chat.messages.filter((m) => m.at.getTime() >= now.getTime() - 10 * DAY);
    try {
      const { orders, skipped } = checkChat(parseReply(shiftRecordedReply(reply, now)), chat.name, messages);
      state.skipped.push(...skipped);
      return orders;
    } catch {
      return [];
    }
  });
  animateNext = true;
  render();
}

// ---------- view ----------

type Tab = 'sheet' | 'chats';
let tab: Tab = 'sheet';
let filter: 'all' | 'check' | number = 'all';
// Cards rise in once, when a sheet first appears, not on every re-render (a tap on "Mark checked" shouldn't replay it).
let animateNext = false;
const openChats = new Set<string>();

function dayKey(o: Order): number {
  return o.when?.date ? o.when.date.getTime() : Number.MAX_SAFE_INTEGER;
}

function timeRank(o: Order): number {
  const t = o.when?.time;
  if (!t) return 99;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))? (am|pm)$/);
  if (!m) return { morning: 9, afternoon: 14, evening: 18, night: 21 }[t] ?? 99;
  return (Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0) + Number(m[2] ?? 0) / 60;
}

function relDay(d: Date, withDate = true): string {
  const today = civilNow();
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.round((d.getTime() - t0) / DAY);
  const label = dayLabel(d);
  const rel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff < 0 ? 'Past' : '';
  if (!rel) return label;
  return withDate ? `${rel} · ${label}` : rel;
}

const openFlags = (o: Order, i: number) => o.flags.filter((f) => !state.checked.has(key(o, i) + f.field));
const sizeLabel = (o: Order) => (o.sizeKg ? `${o.sizeKg} kg` : o.count ? `${o.count} pcs` : '—');

// ----- sidebar -----

function sidebar(): string {
  const n = state.orders.length;
  const navItem = (id: Tab, ico: string, label: string, count: number | string) =>
    `<button class="nav-item ${tab === id ? 'is-active' : ''}" data-tab="${id}">${icon(ico)}<span>${label}</span>${count !== '' ? `<span class="nav-count">${count}</span>` : ''}</button>`;
  return `
  <aside class="side noprint">
    <div class="brand"><img src="/icon.svg" alt="" width="32" height="32" /><span>Pakka</span></div>
    <nav class="nav" aria-label="Sections">
      ${navItem('sheet', 'listChecks', 'Bake sheet', n || '')}
      ${navItem('chats', 'messageCircle', 'Chats', state.chats.length || '')}
    </nav>
    ${modelCard()}
    <p class="side-note">${icon('circleOff')}<span>Chats never leave this device. No account, no server.</span></p>
  </aside>`;
}

function modelCard(): string {
  let line = state.cached ? 'Saved on this device' : 'Downloads once · about 2 GB';
  let pct: number | null = null;
  if (state.mode === 'recorded') line = 'Recorded run (no download)';
  if (state.mode === 'live' && !state.progress) line = 'Ready on this device';
  if (state.status) {
    line = state.status;
    pct = state.fraction !== null ? Math.round(state.fraction * 100) : state.progress ? Math.round((state.progress.done / state.progress.total) * 100) : null;
  }
  return `
  <div class="model-card" id="model-card">
    <div class="model-head">${icon('cpu')}<strong>Gemma 4 E2B</strong></div>
    <p>${esc(line)}</p>
    <div class="bar ${state.status && pct === null ? 'busy' : ''}"><span style="--p:${(pct ?? (state.mode ? 100 : 0)) / 100}"></span></div>
    ${state.progress ? `<p class="small">${state.progress.done} of ${state.progress.total} chats read</p>` : ''}
  </div>`;
}

// ----- empty state / intake -----

function intake(): string {
  const n = state.chats.length;
  const needBaker = n > 0 && !state.baker;
  const people = needBaker ? [...new Set(state.chats.flatMap(senders))] : [];
  return `
  <section class="intake">
    <h1 class="display">Your WhatsApp orders, as <mark>tomorrow's bake sheet.</mark></h1>
    <p class="lede">Gemma 4 reads each chat on this device and copies every detail word for word. Pakka checks the words against the chat, works out what “kal” means, and flags anything you should confirm before you bake.</p>

    <ol class="how">
      <li class="how-step">
        <span class="how-n">1</span>
        <div class="how-art"><div class="bubble">kal shaam 6 baje 1 kg truffle chahiye, eggless please</div></div>
        <p><b>Export the chat.</b> In WhatsApp: ⋮ → More → Export chat → Without media.</p>
      </li>
      <li class="how-step">
        <span class="how-n">2</span>
        <div class="how-art"><span class="quote">day: <q>kal shaam</q></span><span class="quote">size: <q>1 kg</q></span></div>
        <p><b>Gemma copies the words.</b> It never does the date maths. Code does, and it shows its working.</p>
      </li>
      <li class="how-step">
        <span class="how-n">3</span>
        <div class="how-art"><div class="mini-card"><b>Tomorrow · 6:00 pm</b><span>1 kg truffle</span><span class="pill pill-ok">Eggless</span></div></div>
        <p><b>Bake from the sheet.</b> Send each customer a confirmation in one tap.</p>
      </li>
    </ol>

    <div class="intake-actions">
      <label class="btn btn-primary file">${icon('upload')}Add WhatsApp chats<input id="files" type="file" accept=".txt,.zip,text/plain,application/zip" multiple hidden /></label>
      <button class="btn btn-outline" id="samples">${icon('play')}Try ${CASES.length} sample chats</button>
      <button class="btn-link" id="replay">See a recorded run (no download)</button>
    </div>
    <details class="paste"><summary>Or paste a chat</summary>
      <textarea id="paste" rows="5" placeholder="17/10/26, 9:42 pm - Priya: kal shaam 6 baje tak 1 kg chocolate truffle chahiye"></textarea>
      <button class="btn btn-outline btn-sm" id="add-paste">Add pasted chat</button>
    </details>
    ${state.error ? `<p class="alert alert-warn">${icon('triangleAlert')}<span>${esc(state.error)}</span></p>` : ''}
    ${
      n
        ? `<div class="ready">
            <div class="ready-head"><strong>${n} chat${n > 1 ? 's' : ''} ready</strong><button class="btn-link" id="clear">Clear</button></div>
            <div class="chips">${state.chats.map((c) => `<span class="chip">${esc(c.name)}</span>`).join('')}</div>
            ${needBaker ? `<label class="who-me">Which name is you? <select id="baker"><option value="">Choose…</option>${people.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>` : ''}
            <button class="btn btn-primary" id="read" ${needBaker || state.progress ? 'disabled' : ''}>${icon('listChecks')}Make the bake sheet</button>
          </div>`
        : ''
    }
  </section>`;
}

// ----- stats + filters -----

function stats(): string {
  const list = state.orders;
  const kg = list.reduce((n, o) => n + (o.sizeKg ?? 0), 0);
  const eggless = list.filter((o) => o.eggless).length;
  const due = list.reduce((n, o) => n + (o.price !== null ? o.price - (o.advance ?? 0) : 0), 0);
  const paid = list.reduce((n, o) => n + (o.advance ?? 0), 0);
  const flagged = list.filter((o, i) => openFlags(o, i).length).length;
  const days = new Set(list.filter((o) => o.when?.date).map(dayKey)).size;
  const card = (ico: string, value: string, label: string, foot: string, pill = '') => `
    <div class="stat">
      <div class="stat-top"><span class="stat-ico">${icon(ico)}</span><div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div></div>
      <div class="stat-foot"><span>${foot}</span>${pill}</div>
    </div>`;
  return `
  <div class="stats">
    ${card('cakeSlice', String(list.length), 'Orders', `from ${state.chats.length} chats · ${days} days`)}
    ${card('weight', `${kg} kg`, 'Cake to bake', `${eggless} eggless`)}
    ${card('wallet', rupees(due), 'To collect', `${rupees(paid)} already paid`)}
    ${card('triangleAlert', String(flagged), 'To confirm', flagged ? 'before you bake' : 'nothing to confirm', flagged ? '<span class="pill pill-warn">Check</span>' : '<span class="pill pill-ok">All clear</span>')}
  </div>`;
}

function filters(): string {
  const days = [...new Set(state.orders.map(dayKey))].sort((a, b) => a - b);
  const flagged = state.orders.filter((o, i) => openFlags(o, i).length).length;
  const chip = (val: string, label: string, active: boolean) => `<button class="fchip ${active ? 'is-active' : ''}" data-filter="${val}">${label}</button>`;
  return `
  <div class="filters noprint" role="toolbar" aria-label="Filter orders">
    ${chip('all', 'All days', filter === 'all')}
    ${days.map((k) => chip(String(k), k === Number.MAX_SAFE_INTEGER ? 'Day unclear' : relDay(new Date(k), false) === dayLabel(new Date(k)) ? dayLabel(new Date(k)) : relDay(new Date(k), false), filter === k)).join('')}
    ${flagged ? chip('check', `${icon('triangleAlert')}To confirm · ${flagged}`, filter === 'check') : ''}
  </div>`;
}

// ----- order card -----

function orderCard(o: Order, i: number, n: number): string {
  const k = key(o, i);
  const flags = openFlags(o, i);
  // The day is already the group heading; the card leads with the time (or the day, when filtered to "To confirm").
  const when = filter === 'check' && o.when?.date ? `${relDay(o.when.date)}${o.when.time ? ` · ${o.when.time}` : ''}` : (o.when?.time ?? 'Any time');
  const status = flags.length ? `<span class="pill pill-warn">${icon('triangleAlert')}Confirm ${flags.length}</span>` : `<span class="pill pill-ok">${icon('check')}Ready</span>`;
  const egg =
    o.eggless === true
      ? `<span class="pill pill-ok">${icon('eggOff')}Eggless</span>`
      : o.eggless === false
        ? `<span class="pill pill-muted">${icon('egg')}With egg</span>`
        : `<span class="pill pill-warn">${icon('egg')}Egg not said</span>`;
  const total = o.price !== null ? rupees(o.price) : '—';
  const balance =
    o.price !== null
      ? o.advance !== null
        ? `${rupees(o.price - o.advance)} due <span class="muted">· ${rupees(o.advance)} paid</span>`
        : `${rupees(o.price)} due <span class="muted">· nothing paid yet</span>`
      : o.advance !== null
        ? `<span class="muted">Price not agreed · ${rupees(o.advance)} paid</span>`
        : '<span class="muted">Price not agreed in chat</span>';
  const src = new Set(o.sources);
  const flagLines = new Set(flags.map((f) => f.line).filter((x): x is number => x !== undefined));
  const showChat = openChats.has(k);
  return `
  <article class="ocard ${flags.length ? 'has-flags' : ''}" style="--i:${n}">
    <header class="ometa">
      <div><span class="olabel">${filter === 'check' ? 'For' : 'Time'}</span><span class="ovalue">${esc(when)}</span></div>
      <div><span class="olabel">Customer</span><span class="ovalue">${esc(o.customer)}</span></div>
      <div><span class="olabel">Total</span><span class="ovalue">${total}</span></div>
      <div><span class="olabel">Handover</span><span class="ovalue">${o.handover ? o.handover[0].toUpperCase() + o.handover.slice(1) : '—'}</span></div>
      <div class="ostatus">${status}</div>
    </header>
    <div class="obody">
      <div class="othumb">${icon('cakeSlice')}</div>
      <div class="oinfo">
        <h3>${esc(o.item)}</h3>
        <div class="tags">${egg}</div>
        ${o.cakeMessage ? `<p class="plaque"><span>On the cake</span>“${esc(o.cakeMessage)}”</p>` : ''}
        ${o.address ? `<p class="muted small">${esc(o.address)}</p>` : ''}
        ${flags
          .map(
            (f) => `<div class="flag">${icon('triangleAlert')}<span>${esc(f.note)}</span><button class="btn-link" data-check="${esc(k + f.field)}">Mark checked</button></div>`,
          )
          .join('')}
      </div>
      <div class="oside">
        <div class="qty"><span class="olabel">Size</span><span class="qty-box">${sizeLabel(o)}</span></div>
        <button class="btn btn-primary btn-sm" data-copy="${i}">${icon('copy')}Copy confirmation</button>
        <button class="btn btn-outline btn-sm" data-chat="${esc(k)}" aria-expanded="${showChat}">${icon('messageCircle')}${showChat ? 'Hide chat' : 'View chat'}</button>
      </div>
    </div>
    ${
      showChat
        ? `<ol class="chat">${o.messages
            .map(
              (m: Message, idx: number) =>
                `<li class="${src.has(idx) ? 'src' : ''} ${flagLines.has(idx) ? 'flagged' : ''}"><span class="who">${esc(m.sender)} · ${fmtTime(m.at)}</span>${esc(m.text)}</li>`,
            )
            .join('')}</ol>`
        : ''
    }
    <footer class="ofoot"><span class="olabel">Balance</span><span>${balance}</span></footer>
  </article>`;
}

function sheet(): string {
  const visible = state.orders
    .map((o, i) => ({ o, i }))
    .filter(({ o, i }) => (filter === 'all' ? true : filter === 'check' ? openFlags(o, i).length > 0 : dayKey(o) === filter));
  const groups = new Map<number, { o: Order; i: number }[]>();
  for (const v of visible) groups.set(dayKey(v.o), [...(groups.get(dayKey(v.o)) ?? []), v]);
  let n = 0;
  return `
  <section class="sheet ${animateNext ? 'enter' : ''}">
    ${[...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, list]) => {
        const kg = list.reduce((s, { o }) => s + (o.sizeKg ?? 0), 0);
        const label = k === Number.MAX_SAFE_INTEGER ? 'Day not clear · ask first' : relDay(new Date(k));
        return `
        <div class="day">
          <div class="day-head"><h2>${label}</h2><span class="muted">${list.length} order${list.length > 1 ? 's' : ''}${kg ? ` · ${kg} kg` : ''}</span></div>
          ${list
            .sort((a, b) => timeRank(a.o) - timeRank(b.o))
            .map(({ o, i }) => orderCard(o, i, n++))
            .join('')}
        </div>`;
      })
      .join('')}
    ${
      state.skipped.length && filter === 'all'
        ? `<div class="day">
            <div class="day-head"><h2>Left off the sheet</h2><span class="muted">Gemma saw these; Pakka left them off</span></div>
            ${state.skipped.map((s) => `<div class="skipped">${icon('circleOff')}<div><strong>${esc(s.customer)}</strong> · ${esc(s.item)}<p class="muted small">${esc(s.why)}</p></div></div>`).join('')}
          </div>`
        : ''
    }
  </section>`;
}

// ----- right panel: day summary -----

function summary(): string {
  const list = state.orders.filter((o, i) => (filter === 'all' ? true : filter === 'check' ? openFlags(o, i).length > 0 : dayKey(o) === filter));
  const title = filter === 'all' ? 'All days' : filter === 'check' ? 'To confirm' : filter === Number.MAX_SAFE_INTEGER ? 'Day not clear' : relDay(new Date(filter));
  const kg = list.reduce((n, o) => n + (o.sizeKg ?? 0), 0);
  const pcs = list.reduce((n, o) => n + (o.count ?? 0), 0);
  const total = list.reduce((n, o) => n + (o.price ?? 0), 0);
  const paid = list.reduce((n, o) => n + (o.advance ?? 0), 0);
  return `
  <aside class="summary noprint">
    <h2>Summary</h2>
    <p class="muted small">${esc(title)}</p>
    <ul class="sum-list">
      ${list
        .slice()
        .sort((a, b) => dayKey(a) - dayKey(b) || timeRank(a) - timeRank(b))
        .map((o) => `<li><span class="sum-size">${sizeLabel(o)}</span><span class="sum-item">${esc(o.item)}<small>${esc(o.customer)}${o.eggless ? ' · eggless' : ''}</small></span></li>`)
        .join('')}
    </ul>
    <dl class="sum-totals">
      <div><dt>Cake</dt><dd>${kg} kg${pcs ? ` + ${pcs} pcs` : ''}</dd></div>
      <div><dt>Agreed in chats</dt><dd>${rupees(total)}</dd></div>
      <div><dt>Advance paid</dt><dd>− ${rupees(paid)}</dd></div>
      <div class="sum-due"><dt>To collect</dt><dd>${rupees(total - paid)}</dd></div>
    </dl>
    <button class="btn btn-primary btn-block" id="print">${icon('printer')}Print bake sheet</button>
  </aside>`;
}

// ----- chats tab (table) -----

function chatsTable(): string {
  if (!state.chats.length) return intake();
  const read = state.mode !== null;
  const rows = state.chats.map((c) => {
    const orders = state.orders.filter((o) => o.customer === c.name).length;
    const skip = state.skipped.find((s) => s.customer === c.name);
    const last = c.messages.at(-1);
    const pill = !read
      ? '<span class="pill pill-info">Not read</span>'
      : orders
        ? `<span class="pill pill-ok">${orders} order${orders > 1 ? 's' : ''}</span>`
        : skip
          ? `<span class="pill pill-muted">${/Cancel/.test(skip.why) ? 'Cancelled' : 'Enquiry'}</span>`
          : '<span class="pill pill-muted">No order</span>';
    return `<tr><td><strong>${esc(c.name)}</strong></td><td>${c.messages.length}</td><td class="truncate">${esc(last?.text ?? '')}</td><td>${last ? `${dayLabel(last.at)} · ${fmtTime(last.at)}` : ''}</td><td class="right">${pill}</td></tr>`;
  });
  return `
  <section class="table-card">
    <div class="table-head"><div><h2>Chats</h2><p class="muted small">Every chat you added, and what Pakka found in it.</p></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Customer</th><th>Messages</th><th>Last message</th><th>When</th><th class="right">Result</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>
  </section>`;
}

// ----- page -----

function header(): string {
  const days = state.orders.filter((o) => o.when?.date).map((o) => o.when!.date!);
  const range = days.length ? `${dayLabel(new Date(Math.min(...days.map((d) => d.getTime()))))} – ${dayLabel(new Date(Math.max(...days.map((d) => d.getTime()))))}` : '';
  return `
  <header class="page-head">
    <div>
      <h1>${tab === 'sheet' ? 'Bake sheet' : 'Chats'}</h1>
      <p class="muted">${range}${state.mode === 'recorded' ? ' · <span class="pill pill-info">Recorded run</span>' : state.mode === 'live' ? ' · read on this device' : ''}</p>
    </div>
    <div class="head-actions noprint">
      <button class="btn btn-outline btn-sm" id="clear">Start over</button>
    </div>
  </header>
  ${state.mode === 'recorded' && tab === 'sheet' ? '<p class="alert alert-info noprint">These are the replies Gemma 4 E2B gave for the sample chats in my test run. Pakka\'s checker is running on them live, against the chats dated to today.</p>' : ''}`;
}

function render() {
  const hasSheet = state.orders.length > 0 || (state.mode !== null && !state.progress);
  let main: string;
  if (tab === 'chats') main = (state.chats.length ? header() : '') + chatsTable();
  else if (hasSheet) main = header() + stats() + filters() + sheet();
  else main = intake();
  app.innerHTML = `
  <div class="shell ${hasSheet && tab === 'sheet' ? 'with-summary' : ''}">
    ${sidebar()}
    <main class="main">${main}</main>
    ${hasSheet && tab === 'sheet' ? summary() : ''}
  </div>`;
  bind();
  animateNext = false;
}

function renderStatus() {
  const el = document.querySelector('#model-card');
  if (el) el.outerHTML = modelCard();
}

function bind() {
  const on = (sel: string, ev: string, fn: (e: Event) => void) => document.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
  on('#files', 'change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) readFiles(files);
  });
  on('#samples', 'click', loadSamples);
  on('#replay', 'click', () => {
    forceReplay = true;
    loadSamples();
    readAll();
  });
  on('#add-paste', 'click', () => {
    const chat = parseChat(document.querySelector<HTMLTextAreaElement>('#paste')!.value);
    addChats(chat.messages.length ? [chat] : []);
  });
  on('#baker', 'change', (e) => {
    state.baker = (e.target as HTMLSelectElement).value || null;
    render();
  });
  on('#read', 'click', () => {
    tab = 'sheet';
    readAll();
  });
  on('#clear', 'click', () => {
    Object.assign(state, { chats: [], baker: null, orders: [], skipped: [], mode: null, error: null });
    state.checked.clear();
    filter = 'all';
    tab = 'sheet';
    render();
  });
  on('#print', 'click', () => window.print());
  on('[data-tab]', 'click', (e) => {
    tab = (e.currentTarget as HTMLElement).dataset.tab as Tab;
    render();
  });
  on('[data-filter]', 'click', (e) => {
    const v = (e.currentTarget as HTMLElement).dataset.filter!;
    filter = v === 'all' || v === 'check' ? v : Number(v);
    render();
  });
  on('[data-check]', 'click', (e) => {
    state.checked.add((e.currentTarget as HTMLElement).dataset.check!);
    render();
  });
  on('[data-chat]', 'click', (e) => {
    const k = (e.currentTarget as HTMLElement).dataset.chat!;
    if (openChats.has(k)) openChats.delete(k);
    else openChats.add(k);
    render();
  });
  on('[data-copy]', 'click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const text = confirmation(state.orders[Number(b.dataset.copy)]);
    try {
      await navigator.clipboard.writeText(text);
      b.innerHTML = `${icon('check')}Copied`;
    } catch {
      prompt('Copy this:', text);
    }
  });
}

render();
modelIsCached().then((c) => {
  state.cached = c;
  if (c) renderStatus();
});

// Shared links can open straight into the demo: /?demo or /?replay
const params = new URLSearchParams(location.search);
if (params.has('demo')) loadSamples();
if (params.has('replay')) {
  forceReplay = true;
  loadSamples();
  readAll();
}
