import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import './style.css';
import { unzipSync, strFromU8 } from 'fflate';
import { parseChat, nameFromFile, guessBaker, senders, fmtTime, type Chat, type Message } from './core/whatsapp.ts';
import { extractOrders, checkOrder, confirmation, dayLabel, parseReply, type Order } from './core/extract.ts';
import { CASES, BAKER, toExport } from './core/samples.ts';
import { hasWebGpu, loadGemma, generate, modelIsCached } from './llm.ts';
import recorded from './recorded.json';

const app = document.querySelector<HTMLDivElement>('#app')!;
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
  state.mode = null;
  render();
}

// ---------- reading ----------

async function readAll() {
  state.error = null;
  state.orders = [];
  const now = civilNow();
  const isSample = state.baker === BAKER;
  const gpu = state.gpu ?? (state.gpu = await hasWebGpu());

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
      state.orders.push(...(await extractOrders(chat, state.baker, now, generate)));
    } catch (e) {
      console.warn(chat.name, e);
    }
    state.progress.done++;
    render();
  }
  state.progress = null;
  state.status = '';
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
      return parseReply(reply)
        .filter((r) => r.item || r.day || r.size)
        .map((r) => checkOrder(r, chat.name, messages));
    } catch {
      return [];
    }
  });
  render();
}

// ---------- view ----------

function dayKey(o: Order): number {
  return o.when?.date ? o.when.date.getTime() : Number.MAX_SAFE_INTEGER;
}

function timeRank(o: Order): number {
  const t = o.when?.time;
  if (!t) return 99;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))? (am|pm)$/);
  if (!m) return { morning: 9, afternoon: 14, evening: 18, night: 21 }[t] ?? 99;
  return ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) + Number(m[2] ?? 0) / 60;
}

function relDay(d: Date): string {
  const today = civilNow();
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.round((d.getTime() - t0) / DAY);
  const label = dayLabel(d);
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Tomorrow · ${label}`;
  if (diff < 0) return `${label} · already past`;
  return label;
}

function orderCard(o: Order, i: number): string {
  const k = key(o, i);
  const open = o.flags.filter((f) => !state.checked.has(k + f.field));
  const size = o.sizeKg ? `${o.sizeKg} kg` : o.count ? `${o.count} pcs` : '';
  const egg =
    o.eggless === true ? '<span class="tag tag-egg">Eggless</span>' : o.eggless === false ? '<span class="tag">With egg</span>' : '<span class="tag tag-q">Egg? not said</span>';
  const money =
    o.price !== null
      ? `<span>${rupees(o.price)}</span>${o.advance !== null ? `<span class="muted">· ${rupees(o.advance)} paid</span><strong class="due">${rupees(o.price - o.advance)} due</strong>` : '<strong class="due">nothing paid yet</strong>'}`
      : o.advance !== null
        ? `<span class="muted">price not agreed · ${rupees(o.advance)} paid</span>`
        : '<span class="muted">price not agreed in chat</span>';
  const highlight = new Set(o.sources);
  const flagLines = new Set(open.map((f) => f.line).filter((n): n is number => n !== undefined));
  const chatLines = o.messages
    .map(
      (m: Message, idx: number) =>
        `<li class="${highlight.has(idx) ? 'src' : ''} ${flagLines.has(idx) ? 'flagged' : ''}"><span class="who">${esc(m.sender)} · ${fmtTime(m.at)}</span>${esc(m.text)}</li>`,
    )
    .join('');
  return `
  <article class="order ${open.length ? 'has-flags' : ''}" data-key="${esc(k)}">
    <div class="time">${esc(o.when?.time ?? '—')}</div>
    <div class="body">
      <header><h3>${esc(o.customer)}</h3>${o.handover ? `<span class="hand">${o.handover}</span>` : ''}</header>
      <p class="item"><strong>${esc(size)}</strong> ${esc(o.item)}</p>
      <div class="tags">${egg}</div>
      ${o.cakeMessage ? `<p class="plaque">“${esc(o.cakeMessage)}”</p>` : ''}
      ${o.address ? `<p class="muted small">📍 ${esc(o.address)}</p>` : ''}
      <p class="money">${money}</p>
      ${open
        .map(
          (f) =>
            `<div class="flag"><span>⚠︎ ${esc(f.note)}</span><button class="link" data-check="${esc(k + f.field)}">Checked</button></div>`,
        )
        .join('')}
      <details><summary>From the chat</summary><ol class="chat">${chatLines}</ol></details>
      <div class="actions">
        <button class="ghost" data-copy="${i}">Copy confirmation for WhatsApp</button>
      </div>
    </div>
  </article>`;
}

function sheet(): string {
  if (!state.orders.length) return '';
  const groups = new Map<number, Order[]>();
  state.orders.forEach((o) => {
    const k = dayKey(o);
    groups.set(k, [...(groups.get(k) ?? []), o]);
  });
  const days = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const flagged = state.orders.filter((o, i) => o.flags.some((f) => !state.checked.has(key(o, i) + f.field))).length;
  return `
  <section class="sheet">
    <div class="sheet-head">
      <div>
        <h2>Bake sheet</h2>
        <p class="muted">${state.orders.length} orders from ${state.chats.length} chats${flagged ? ` · <strong class="warn">${flagged} to check before you bake</strong>` : ' · all checked'}</p>
        ${state.mode === 'recorded' ? '<p class="note">This browser can\'t run Gemma, so you\'re seeing the replies Gemma 4 E2B gave for these sample chats in our test run, checked live against the chats here.</p>' : ''}
      </div>
      <button class="ghost noprint" id="print">Print</button>
    </div>
    ${days
      .map(([k, list]) => {
        const kg = list.reduce((n, o) => n + (o.sizeKg ?? 0), 0);
        const due = list.reduce((n, o) => n + (o.price !== null ? o.price - (o.advance ?? 0) : 0), 0);
        const eggless = list.filter((o) => o.eggless).length;
        const label = k === Number.MAX_SAFE_INTEGER ? 'Day not clear · ask first' : relDay(new Date(k));
        return `
        <div class="day">
          <h3 class="day-label">${label}</h3>
          <p class="day-sum">${list.length} order${list.length > 1 ? 's' : ''}${kg ? ` · ${kg} kg of cake` : ''}${eggless ? ` · ${eggless} eggless` : ''}${due ? ` · ${rupees(due)} to collect` : ''}</p>
          ${list
            .sort((a, b) => timeRank(a) - timeRank(b))
            .map((o) => orderCard(o, state.orders.indexOf(o)))
            .join('')}
        </div>`;
      })
      .join('')}
  </section>`;
}

function intake(): string {
  const n = state.chats.length;
  const needBaker = n > 0 && !state.baker;
  const people = needBaker ? [...new Set(state.chats.flatMap(senders))] : [];
  return `
  <section class="intake noprint">
    <ol class="steps">
      <li>In WhatsApp, open a customer's chat → <b>⋮</b> → <b>More</b> → <b>Export chat</b> → <b>Without media</b>.</li>
      <li>Save it, then add it here. Add as many chats as you like.</li>
    </ol>
    <div class="buttons">
      <label class="primary file">Add WhatsApp chats<input id="files" type="file" accept=".txt,.zip,text/plain,application/zip" multiple hidden /></label>
      <button class="ghost" id="samples">Try ${CASES.length} sample chats</button>
    </div>
    <details class="paste"><summary>Or paste a chat</summary>
      <textarea id="paste" rows="6" placeholder="17/10/26, 9:42 pm - Priya: kal shaam 6 baje tak 1 kg chocolate truffle chahiye"></textarea>
      <button class="ghost" id="add-paste">Add pasted chat</button>
    </details>
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}
    ${
      n
        ? `<div class="ready">
            <p><strong>${n} chat${n > 1 ? 's' : ''} ready:</strong> ${state.chats.map((c) => esc(c.name)).join(', ')}</p>
            ${needBaker ? `<label class="who-me">Which one is you? <select id="baker"><option value="">Choose…</option>${people.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>` : ''}
            <div class="buttons">
              <button class="primary" id="read" ${needBaker || state.progress ? 'disabled' : ''}>Make the bake sheet</button>
              <button class="link" id="clear">Clear</button>
            </div>
          </div>`
        : ''
    }
    <div id="status">${statusHtml()}</div>
  </section>`;
}

function statusHtml(): string {
  if (!state.status) return '';
  const pct = state.fraction !== null ? Math.round(state.fraction * 100) : state.progress ? Math.round((state.progress.done / state.progress.total) * 100) : null;
  return `<div class="status"><p>${esc(state.status)}</p>${pct !== null ? `<div class="bar"><span style="width:${pct}%"></span></div>` : '<div class="bar busy"><span></span></div>'}${state.progress ? `<p class="muted small">${state.progress.done} of ${state.progress.total} chats read</p>` : ''}</div>`;
}

function renderStatus() {
  const el = document.querySelector('#status');
  if (el) el.innerHTML = statusHtml();
}

function render() {
  app.innerHTML = `
  <main>
    <header class="hero noprint">
      <div class="brand"><img src="/icon.svg" alt="" width="40" height="40" /><span>Pakka</span></div>
      <h1>Your WhatsApp orders,<br/>as tomorrow's bake sheet.</h1>
      <p class="lede">For home bakers who take orders on WhatsApp. Gemma 4 reads the chats <b>on this phone</b> and copies every detail word for word. Pakka checks each one against the chat, works out what “kal” means, and tells you what to confirm before you bake.</p>
      <p class="privacy">🔒 Chats never leave this device. ${state.cached ? 'Gemma is saved here and works offline.' : 'First use downloads Gemma once (about 2 GB, Wi-Fi recommended).'}</p>
    </header>
    ${intake()}
    ${sheet()}
    <footer class="noprint">
      <p>Open source · Gemma 4 E2B running in your browser with MediaPipe on WebGPU · <a href="https://github.com/codeswithroh/pakka">github.com/codeswithroh/pakka</a></p>
    </footer>
  </main>`;
  bind();
}

function bind() {
  document.querySelector<HTMLInputElement>('#files')?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) readFiles(files);
  });
  document.querySelector('#samples')?.addEventListener('click', loadSamples);
  document.querySelector('#add-paste')?.addEventListener('click', () => {
    const text = document.querySelector<HTMLTextAreaElement>('#paste')!.value;
    const chat = parseChat(text);
    addChats(chat.messages.length ? [chat] : []);
  });
  document.querySelector('#baker')?.addEventListener('change', (e) => {
    state.baker = (e.target as HTMLSelectElement).value || null;
    render();
  });
  document.querySelector('#read')?.addEventListener('click', readAll);
  document.querySelector('#clear')?.addEventListener('click', () => {
    Object.assign(state, { chats: [], baker: null, orders: [], mode: null, error: null });
    state.checked.clear();
    render();
  });
  document.querySelector('#print')?.addEventListener('click', () => window.print());
  document.querySelectorAll<HTMLButtonElement>('[data-check]').forEach((b) =>
    b.addEventListener('click', () => {
      state.checked.add(b.dataset.check!);
      render();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const text = confirmation(state.orders[Number(b.dataset.copy)]);
      try {
        await navigator.clipboard.writeText(text);
        b.textContent = 'Copied. Paste it in their chat.';
      } catch {
        prompt('Copy this:', text);
      }
    }),
  );
}

render();
modelIsCached().then((c) => {
  state.cached = c;
  if (c) render();
});

// Let a shared link open straight into the demo: /?demo
if (new URLSearchParams(location.search).has('demo')) loadSamples();
