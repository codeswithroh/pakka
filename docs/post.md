*This is a submission for the [Hacktoberfest Open-Source AI Challenge: Week 2 (Side Hustle)](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).*

In Hindi, **kal** means tomorrow. It also means yesterday.

*"Kal shaam 6 baje 1 kg truffle chahiye"* is an order for tomorrow evening. *"Kal jo cake liya tha, sabko pasand aaya"* is a thank-you for a cake that already got eaten. Same word. Only the verb tells you which.

If you've ordered a birthday cake in India lately, there's a decent chance it came from someone's home kitchen, and that the whole order happened on WhatsApp: a flavour, a weight, "eggless please", a name to pipe on top, a GPay screenshot. Home bakers run real businesses this way. The order book is the chat list. The night before a busy day means scrolling through every chat, writing tomorrow's cakes into a notebook, and hoping nobody said "actually 1.5 kg kar do" three messages down.

So I built **Pakka** (Hindi for "confirmed, for sure"). You export the chats from WhatsApp and add them. Gemma 4 reads them **on your own phone** and Pakka turns them into tomorrow's bake sheet. The one rule I held it to: **when it isn't sure, it asks you. It doesn't guess.**

## What I Built

![Pakka home screen: add WhatsApp chats, or try 18 sample chats](https://raw.githubusercontent.com/codeswithroh/pakka/main/docs/home.png)

Pakka is a web app for home bakers who take orders on WhatsApp.

1. In WhatsApp: open a customer's chat → **⋮** → **More** → **Export chat** → **Without media**. Do that for each chat with an order.
2. Add the files to Pakka (plain `.txt` or the `.zip` an iPhone makes).
3. Gemma 4 E2B reads each chat in your browser and Pakka builds a bake sheet grouped by day: time, customer, cake, weight, eggless or not, the message for the top, price, advance, and what's still due.
4. Anything Pakka isn't sure about gets an amber note on the card saying exactly why. One tap shows the chat lines it came from.
5. Each order has a **Copy confirmation** button. It writes a short WhatsApp message back to the customer ("1 kg chocolate truffle (eggless), Sun 19 Oct, 6:00 pm, 'Happy Birthday Riya', balance ₹700. Sab sahi hai?"). The customer is the last check.

Nothing is uploaded. No account, no server, no API key. Customer names, phone chats and home addresses stay on the baker's phone.

**Who would pay for this?** A home baker with a dozen orders a week. The work Pakka replaces is the late-night notebook session and the occasional disaster: a cake made with egg for a family that doesn't eat egg, a cake ready a day late, a name spelled wrong in icing. One remade cake costs more than a year of a small app. I'd charge a one-time ₹299, or ₹49 a month with backup across devices. That works because there's no per-chat cost to me: the model runs on the baker's phone.

## Demo

**Live:** https://pakka-gamma.vercel.app

- **Try 18 sample chats** runs Gemma for real in your browser (WebGPU: Chrome or Edge on a laptop or a recent Android phone, Safari 26). The first run downloads the model once, about 2 GB.
- **No time for a 2 GB download?** Open https://pakka-gamma.vercel.app/?replay. It replays the replies Gemma gave in my test run through Pakka's checker, live, with the chats re-dated to today.

![The bake sheet: orders grouped by day, with totals](https://raw.githubusercontent.com/codeswithroh/pakka/main/docs/sheet.png)

![A card Pakka isn't sure about: a weekday named on that same weekday](https://raw.githubusercontent.com/codeswithroh/pakka/main/docs/flag-weekday.png)

![Chats Gemma saw that Pakka left off the sheet: a price question and a cancelled order](https://raw.githubusercontent.com/codeswithroh/pakka/main/docs/skipped.png)

## Code

{% embed https://github.com/codeswithroh/pakka %}

## How I Built It

The stack is small on purpose: TypeScript and Vite, no framework, no backend, deployed as static files on Vercel.

| Piece | What it does |
|---|---|
| **Gemma 4 E2B** (`litert-community/gemma-4-E2B-it-litert-lm`, web build) | Reads each chat and copies the words for each detail |
| **MediaPipe LLM Inference** on WebGPU | Runs Gemma in the browser. Weights stream from Hugging Face and are kept in the Cache API, so later visits don't download them again |
| `whatsapp.ts` | Parses Android and iPhone export formats, multi-line messages, `.zip` exports |
| `when.ts` | Turns "kal shaam 6 baje" into a date and a time, and says when it can't |
| `fields.ts` | Turns "aadha kilo", "dedh kg", "₹1,200", "500 bhej diya", "bina ande ka" into values |
| `extract.ts` | The prompt, plus the checker that holds Gemma's answer up against the chat |

### Gemma copies. Code reads.

The obvious design is to ask Gemma for the finished answer: a date like `2026-10-18`, a weight like `1.5`, `eggless: true`. I tested that design as the baseline. It reads beautifully. Eggless, advance paid, the name for the cake: all right. Then you check the dates. Rahul thanked the baker for yesterday's cake ("kal jo red velvet liya tha…") and in the next message ordered a pineapple cake for Tuesday. Gemma put the pineapple cake on **tomorrow**. Ishita asked for "kal", heard back "kal full hai, parso chalega?", and agreed to parso. Gemma put it on **tomorrow** too.

So I split the job. Gemma does the part small models are good at: **find the order and copy the exact words for each detail**. The prompt says it plainly:

```
For each order, copy the customer's or baker's EXACT words for each detail,
character for character, from one message. Do not translate, explain,
convert or calculate anything.
```

What comes back looks like this:

```json
{"item": "chocolate truffle", "size": "1 kg", "eggless": "eggless please",
 "day": "kal shaam", "time": "6 baje", "cake_message": "upar likh dena \"Happy Birthday Riya\"",
 "price": "1200 hoga", "advance": "500 advance bhej diya"}
```

Then code takes over, and every step is something you can test:

1. **Is the quote really in the chat?** `findQuote()` searches the messages (newest first, ignoring case and punctuation, allowing for a small model that trims a word). If the words aren't there, the detail is dropped and the card says *"Gemma wrote '…', but those words aren't in the chat."* Gemma can't add a detail that isn't in the chat. It can only point at one.
2. **What do the words mean?** "aadha kilo" is 0.5 kg. "1.2k" is ₹1,200. "egg chalega" means with egg. Each parser returns `null` instead of guessing.
3. **Did they change it later?** If a later message mentions a different size, the card asks: *"A later message says 1.5 kg. Did they change it?"*

### Kal is two days

Gemma never decides what "kal" means. It copies "kal shaam" and code works out the day, relative to **when that message was sent**, not when you open the app.

For "kal" and "parso" (which also points both ways: the day before yesterday, or the day after tomorrow), `when.ts` looks at the clause the word sits in. Past-tense markers (*tha, liya, diya, bheja, aaya*) push one way, request markers (*chahiye, dena, ready, pickup, tak*) push the other:

```ts
if (twoWay && isHindi) {
  const clause = clauseOf(message, quote).replace(/\bke\s+liye\b/g, ' '); // "ke liye" = "for"
  const past = PAST.test(clause);
  const future = FUTURE.test(clause);
  if (past && !future) return result(at(-days), false, `"${word}" here sounds like the past…`);
  if (past && future)  return result(at(days),  false, `"${clause}" mixes past and future…`);
}
```

It works per clause because real messages mix tenses: *"kal 4 baje de dena, 500 bhej diya"* has a past verb in it (*bhej diya*, "I sent"), but in a different clause from *kal*. Splitting on commas and *aur / par / lekin* keeps that order on the sheet for tomorrow.

The same file handles the other ways a day gets named: "Sunday" sent on a Sunday (today, or next week?), Indian-English "next Sunday" (usually the coming one, not always), "25th", "25 tarikh", "3rd" when it's already the 17th (next month), and Devanagari (*कल शाम 7 बजे*). Times without am/pm ("6 baje") get read from the words around them (*shaam*, *subah*); when there are none, Pakka guesses afternoon and tells you it guessed.

### Testing it

I wrote **18 WhatsApp chats** by hand to test it. They're modelled on how orders to home bakers read, but every chat and name is made up. Most are ordinary orders. Some are traps: "kal" about yesterday, "parso" about a complaint, a size changed the next morning, an order cancelled, a customer only asking prices, Devanagari script, two orders in one chat, "next Sunday", and a weekday named on that same weekday.

I ran every chat through Gemma 4 E2B twice, in the Chromium browser pane on a Mac mini (M4, 16 GB), with the same runtime the app uses:

- **Gemma alone:** told today's date and asked for the finished values.
- **Pakka:** Gemma copies the words, and the checker and parsers above do the rest.

**Main set: 18 chats, 16 orders.**

| | Gemma alone | Pakka |
|---|---|---|
| Delivery day right | 4 / 16 | **16 / 16** |
| Delivery day **confidently wrong** | 8 | **0** |
| No day at all | 4 | 0 |
| Size | 13 / 16 | 16 / 16 |
| Time | 10 / 15 | 14 / 15 |
| Price | 13 / 16 | 16 / 16 |
| Eggless | 16 / 16 | 16 / 16 |
| Advance paid | 14 / 14 | 14 / 14 |
| Text for the cake | 15 / 16 | 15 / 16 |
| Orders that weren't orders | 3 | 0 |

"Right" for the two ambiguous chats ("Saturday" sent on a Saturday, "next Sunday") means the card asks the baker. Gemma alone has no way to say "not sure" in that format, so those two count against it by design. Take them out and Gemma alone still gets 10 of the other 14 dates wrong or leaves them blank. Pakka gets 0.

Now the part I have to be upfront about. Pakka's **first** run on this set wasn't 16/16. It was 15 right, 1 asked, 0 wrong, with 3 orders that weren't orders: a customer who only asked the price, an order cancelled the next morning, and a size change that Gemma returned as two separate orders. I fixed those with three chat-level rules in code (a price question with no day and no money is an enquiry; a later "cancel kar do" takes the order off; a repeated item is one order with the latest details), plus one bug: "ke liye" ("for") was being read as the past-tense *liye*. Then I re-scored the same recorded replies. That's tuning on the test set, so I wrote **8 new chats** after freezing the code and ran them once:

**Held-out set: 8 new chats, 7 orders, code frozen, run once.**

| | Gemma alone | Pakka |
|---|---|---|
| Delivery day right | 3 / 7 | **6 / 7** |
| Delivery day **confidently wrong** | 4 | **0** |
| Asked the baker | 0 | 1 |
| Size | 6 / 7 | 7 / 7 |
| Price · advance | 7 / 7 · 7 / 7 | 7 / 7 · 7 / 7 |
| Orders that weren't orders | 0 | 0 |

The one it asked about was a real bug: "the day after tomorrow" contains the word "tomorrow", so `when.ts` saw two different days and asked which one. It failed the safe way. That's fixed now (with a test), and the held-out set re-scores 7/7. The numbers in the table are from before the fix.

The row I care most about is **confidently wrong dates**: the cake is on the sheet for the wrong day and nothing warns you. Across both sets, Gemma alone got **12** delivery days confidently wrong, and **5** of those 12 were "tomorrow": for a Tuesday, for a Monday, for *parso* twice (once written परसों), and for a *parso* agreed right after a *kal* was turned down. When it isn't sure, a small model reaches for tomorrow. Pakka got **0** wrong. Same model, same chats. The only difference is who does the date arithmetic.

Here's the Rahul chat on Pakka's sheet. The highlighted lines are where each detail came from. The "kal" message about yesterday's cake isn't highlighted, because nothing on the card came from it:

![Rahul's order: the pineapple cake on the right day, with the chat lines it came from](https://raw.githubusercontent.com/codeswithroh/pakka/main/docs/rahul.png)

The eval page ships with the app (`/eval.html`), and every raw Gemma reply is committed in `eval/results/`. `node eval/rescore.ts <file>` re-scores them with the current checker, no model needed.

Speed: **2.4 seconds per chat** (median) on the M4 once the model is loaded. A dozen chats takes about half a minute. Fine for the night before, not instant.

### What it can't do yet

- **The test set is mine.** I wrote those chats, so they reflect what I thought to test. Real chats will be messier: voice notes, photos of reference cakes, orders split across days.
- **Voice notes are skipped.** Lots of orders arrive as voice notes. Gemma 4 E2B can take audio, so that's the next step, but I haven't built it.
- **Needs WebGPU and 2 GB.** Older Android phones can't run it. The recorded replay shows what Pakka does, but it can't read *your* chats on those phones. And in the browser I tested in, the cached model didn't survive a reload, so it downloaded again. Browsers that cap storage per site will do the same.
- **Exporting is a chore.** One chat at a time from WhatsApp. On Android, a share target that receives the export directly would remove a step.
- **It doesn't know your menu or prices.** It reads what was said. It doesn't check that a 1.5 kg truffle is ₹1,350.

## Why Does Open Innovation Matter?

**Because the chats are private.** A baker's WhatsApp has customers' names, phone numbers, home addresses, their kids' names and birthdays. With an open-weight model running in the browser, none of it goes anywhere. I didn't have to write a privacy policy to make that true. It's just how the app works.

**Because the margins are small.** A home baker makes a few hundred rupees on a cake. A hosted model would charge for every chat, every night. Gemma on the phone costs nothing per chat, so I can sell this for a one-time price.

**Because the kitchen Wi-Fi is bad.** Once Gemma is on the phone, reading chats needs no connection at all.

**Because I could open it up and fix it.** When Gemma wrote finished values, I couldn't see why it got a date wrong. With an open model, I could change what I asked of it, run every test chat through it twice on my own machine for free, and move every judgement I didn't trust out of the model and into code a person can read and test.

## Prize Categories

**Best Use of Gemma.** Gemma 4 E2B runs fully in the browser (MediaPipe LLM Inference on WebGPU), reading Hinglish and Devanagari WhatsApp chats on the baker's own device. The design is built around what a 2B-effective model is good at (finding and copying) and keeps it away from what it isn't (date arithmetic in a language where one word means two days), with an eval to show the difference.

---

*If you know a home baker who lives in WhatsApp, send them the link, and tell me what Pakka got wrong.*
