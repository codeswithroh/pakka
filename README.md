# Pakka

**A home baker's WhatsApp orders, turned into tomorrow's bake sheet.**
Gemma 4 reads the chats on the baker's own phone. Code checks every detail against the chat.

Live: **https://pakka-gamma.vercel.app** · recorded run, no download: **https://pakka-gamma.vercel.app/?replay**

In Hindi, *kal* means tomorrow and also yesterday. *"Kal shaam 6 baje 1 kg truffle chahiye"* is an order.
*"Kal jo cake liya tha, sabko pasand aaya"* is a thank-you. Pakka's rule: when it isn't sure, it asks the baker. It doesn't guess.

## How it works

1. Export chats from WhatsApp (**⋮ → More → Export chat → Without media**) and add the `.txt` / `.zip` files.
2. **Gemma 4 E2B** runs in the browser (MediaPipe LLM Inference on WebGPU, ~2 GB, downloaded once and cached).
   It finds each order and **copies the exact words** for each detail. It never converts or calculates.
3. **Code does the reading**, and every step is unit-tested:
   - `findQuote()` checks each quote is really in the chat. Made-up details are dropped and flagged.
   - `when.ts` turns "kal shaam 6 baje", "parso", "Sunday", "25 tarikh", "कल शाम 7 बजे" into a date, relative to when the
     message was sent, and flags "kal"/"parso" when the tense says it's about the past.
   - `fields.ts` reads sizes ("aadha kilo", "dedh kg", "2 dozen"), money ("1.2k", "₹1,450", "500 bhej diya") and eggs.
   - `laterChange()` notices when a customer changed the size later in the chat.
4. The bake sheet groups orders by day with totals, amber notes for anything to confirm, the source chat lines, and a
   **Copy confirmation** message for the customer to check.

No server, no account, no API key. Chats never leave the device.

## Eval

{{README_RESULTS}}

18 hand-written chats (20 orders, plus chats with no order), including traps: *kal* about yesterday, *parso* about a
complaint, a size changed the next morning, a cancellation, price questions only, Devanagari, two orders in one chat,
"next Sunday", and a weekday named on the same weekday. The chats are made up; see `src/core/samples.ts`.

- `/eval.html` (in any WebGPU browser) runs every chat through Gemma twice: **Gemma alone** (told today's date, asked
  for finished values) and **Pakka** (Gemma copies, code reads). It saves every raw reply.
- `node eval/rescore.ts eval/results/<run>.json -v` re-scores the committed replies with the current code. No model needed.

## Run it

```bash
npm install
npm run dev        # app at localhost:5173
npm test           # parser, date and checker tests (no model)
npm run build && npx vite preview   # then open /eval.html for the eval
```

## Layout

```
src/core/whatsapp.ts   export parser (Android + iPhone formats)
src/core/when.ts       day/time resolution, kal/parso tense check
src/core/fields.ts     size, money, eggless parsers; quote grounding; change detection
src/core/extract.ts    the prompt, reply parsing, checkOrder(), confirmation message
src/core/samples.ts    the 18 test chats with expected bake-sheet values
src/llm.ts             Gemma 4 E2B via MediaPipe on WebGPU, cached in the Cache API
eval/                  the eval page, the benchmark, the rescorer, recorded results
```

Built for the DEV Hacktoberfest Open-Source AI Challenge (Week 2: Side Hustle). MIT licensed.
