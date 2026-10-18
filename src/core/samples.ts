// Test chats, written by hand. They're modelled on how WhatsApp orders to home bakers read,
// but every chat and name is made up. The demo uses the same chats, shifted so "today" is today.
// Each message: [days before "now", "HH:MM", sender, text]. The baker is always "Neha (me)".
// `expect` is what a careful human would write on the bake sheet. `day` is the offset from the
// day "now" falls on; "flag" means a careful human would ask before baking.

export const BAKER = 'Neha (me)';

export type Line = [number, string, string, string];

export interface Expected {
  item: string; // a word that must appear in the item
  kg?: number | null;
  count?: number | null;
  eggless?: boolean | null;
  day?: number | 'flag';
  time?: string | null;
  message?: string | null;
  price?: number | null;
  advance?: number | null;
}

export interface Case {
  id: string;
  customer: string;
  trap?: string; // what this chat is testing
  lines: Line[];
  expect: Expected[];
}

export const CASES: Case[] = [
  {
    id: 'priya-truffle',
    customer: 'Priya',
    lines: [
      [0, '21:41', 'Priya', 'hi didi'],
      [0, '21:42', 'Priya', 'kal shaam 6 baje tak 1 kg chocolate truffle chahiye, eggless please'],
      [0, '21:42', 'Priya', 'upar likh dena "Happy Birthday Riya"'],
      [0, '21:45', BAKER, 'done ji, 1200 hoga'],
      [0, '21:50', 'Priya', '500 advance bhej diya gpay pe'],
    ],
    expect: [{ item: 'truffle', kg: 1, eggless: true, day: 1, time: '6:00 pm', message: 'Happy Birthday Riya', price: 1200, advance: 500 }],
  },
  {
    id: 'rahul-yesterday',
    customer: 'Rahul',
    trap: '"kal" meaning yesterday, then a new order',
    lines: [
      [0, '10:02', 'Rahul', 'kal jo red velvet liya tha sabko bahut pasand aaya 😍'],
      [0, '10:03', BAKER, 'thank you so much!! 🙏'],
      [0, '10:05', 'Rahul', 'ab {+3} ko office ke liye 2 kg pineapple chahiye, 4 baje tak'],
      [0, '10:06', BAKER, '2 kg pineapple 1400 ka hoga'],
      [0, '10:06', 'Rahul', 'ok done'],
    ],
    expect: [{ item: 'pineapple', kg: 2, eggless: null, day: 3, time: '4:00 pm', message: null, price: 1400, advance: null }],
  },
  {
    id: 'ananya-changed',
    customer: 'Ananya',
    trap: 'customer changes the size',
    lines: [
      [1, '19:10', 'Ananya', 'Hi! {+1} ke liye 1 kg black forest book karna hai'],
      [1, '19:12', BAKER, 'Sure! kis time chahiye?'],
      [1, '19:15', 'Ananya', 'lunch time, 1 baje tak'],
      [0, '09:30', 'Ananya', 'actually guests badh gaye, 1.5 kg kar do please'],
      [0, '09:40', BAKER, 'ok 1.5 kg, 1350 total'],
    ],
    expect: [{ item: 'black forest', kg: 1.5, eggless: null, day: 1, time: '1:00 pm', message: null, price: 1350, advance: null }],
  },
  {
    id: 'meera-devanagari',
    customer: 'Meera Aunty',
    trap: 'Devanagari script',
    lines: [
      [0, '08:15', 'Meera Aunty', 'नमस्ते बेटा'],
      [0, '08:16', 'Meera Aunty', 'कल शाम 7 बजे आधा किलो बटरस्कॉच केक चाहिए, बिना अंडे का'],
      [0, '08:17', 'Meera Aunty', 'ऊपर "Happy Anniversary" लिख देना'],
      [0, '08:30', BAKER, 'ji aunty, 650 hoga'],
    ],
    expect: [{ item: 'बटरस्कॉच', kg: 0.5, eggless: true, day: 1, time: '7:00 pm', message: 'Happy Anniversary', price: 650, advance: null }],
  },
  {
    id: 'kabir-cupcakes',
    customer: 'Kabir',
    lines: [
      [0, '13:00', 'Kabir', 'Hey, do you do cupcakes?'],
      [0, '13:05', BAKER, 'yes! 60 each, min 6'],
      [0, '13:07', 'Kabir', 'great, 12 cupcakes for parso, vanilla and chocolate mix'],
      [0, '13:08', 'Kabir', 'pickup around 11 am'],
    ],
    expect: [{ item: 'cupcake', count: 12, eggless: null, day: 2, time: '11:00 am', message: null, price: null, advance: null }],
  },
  {
    id: 'sneha-two-orders',
    customer: 'Sneha',
    trap: 'two orders in one chat',
    lines: [
      [0, '18:20', 'Sneha', 'Didi kal ke liye 1 kg rasmalai cake, eggless'],
      [0, '18:21', 'Sneha', 'aur {+5} ko 2 dozen brownies bhi chahiye school ke liye'],
      [0, '18:25', BAKER, 'cake 1300, brownies 960'],
      [0, '18:26', 'Sneha', '1000 advance bheja hai'],
    ],
    expect: [
      { item: 'rasmalai', kg: 1, eggless: true, day: 1, time: null, message: null, price: 1300 },
      { item: 'brownie', count: 24, eggless: null, day: 5, time: null, message: null, price: 960 },
    ],
  },
  {
    id: 'arjun-no-order',
    customer: 'Arjun',
    trap: 'just asking prices, no order',
    lines: [
      [0, '16:00', 'Arjun', 'hi, 1 kg chocolate cake ka kitna hai?'],
      [0, '16:02', BAKER, '1000 for chocolate, 1200 for truffle'],
      [0, '16:03', 'Arjun', 'ok thanks, will let you know'],
    ],
    expect: [],
  },
  {
    id: 'fatima-same-weekday',
    customer: 'Fatima',
    trap: 'names today\'s weekday',
    lines: [
      [0, '11:00', 'Fatima', 'Assalamualaikum! {+0} ko 1 kg mango cake milega? eggless'],
      [0, '11:02', BAKER, 'haan ji, 1100'],
    ],
    expect: [{ item: 'mango', kg: 1, eggless: true, day: 'flag', time: null, message: null, price: 1100, advance: null }],
  },
  {
    id: 'vikram-date',
    customer: 'Vikram',
    lines: [
      [0, '20:00', 'Vikram', 'Need a 2 kg photo cake on {date+8} for my daughter\'s birthday'],
      [0, '20:01', 'Vikram', 'Message: Happy 5th Birthday Aarohi'],
      [0, '20:05', BAKER, 'Photo cake 2 kg will be ₹2,200. 50% advance please'],
      [0, '20:20', 'Vikram', 'Sent 1100 on PhonePe'],
      [0, '20:21', 'Vikram', 'Delivery to B-204, Green Park Society, 6 pm'],
    ],
    expect: [{ item: 'photo', kg: 2, eggless: null, day: 8, time: '6:00 pm', message: 'Happy 5th Birthday Aarohi', price: 2200, advance: 1100 }],
  },
  {
    id: 'pooja-parso-past',
    customer: 'Pooja',
    trap: '"parso" meaning the day before yesterday',
    lines: [
      [0, '12:30', 'Pooja', 'parso jo cake bheja tha woh thoda dry tha 😕'],
      [0, '12:35', BAKER, 'so sorry! next time extra soak karungi'],
    ],
    expect: [],
  },
  {
    id: 'rohan-egg-ok',
    customer: 'Rohan',
    lines: [
      [0, '17:45', 'Rohan', 'bhai kal raat 8 baje 1 kg Nutella cake, egg chalega'],
      [0, '17:46', 'Rohan', 'naam: Kunal'],
      [0, '17:50', BAKER, '1250 hoga bhai'],
      [0, '17:51', 'Rohan', 'theek hai, ghar pe deliver kar dena'],
    ],
    expect: [{ item: 'nutella', kg: 1, eggless: false, day: 1, time: '8:00 pm', message: 'Kunal', price: 1250, advance: null }],
  },
  {
    id: 'divya-half',
    customer: 'Divya',
    lines: [
      [0, '09:00', 'Divya', 'good morning! aaj shaam ke liye half kg red velvet ho jayega?'],
      [0, '09:05', BAKER, 'haan ho jayega, 5 baje tak. 700'],
      [0, '09:06', 'Divya', 'perfect 👍 bina ande ka please'],
    ],
    expect: [{ item: 'red velvet', kg: 0.5, eggless: true, day: 0, message: null, price: 700, advance: null }],
  },
  {
    id: 'sameer-mixed-tense',
    customer: 'Sameer',
    trap: 'past and future in one sentence',
    lines: [
      [0, '15:00', 'Sameer', 'kal wala cake mast tha, waisa hi ek aur chahiye 1 kg'],
      [0, '15:02', BAKER, 'thank you! kab chahiye?'],
      [0, '15:03', 'Sameer', '{+2} evening'],
    ],
    expect: [{ item: 'cake', kg: 1, eggless: null, day: 2, time: 'evening', message: null, price: null, advance: null }],
  },
  {
    id: 'kavya-next-sunday',
    customer: 'Kavya',
    trap: '"next Sunday"',
    lines: [
      [0, '14:10', 'Kavya', 'Next {+1} ko 1.5 kg fresh fruit cake chahiye'],
      [0, '14:11', 'Kavya', 'eggless'],
      [0, '14:20', BAKER, '1500 total, 500 advance'],
      [0, '14:30', 'Kavya', 'done, 500 sent'],
    ],
    expect: [{ item: 'fruit', kg: 1.5, eggless: true, day: 'flag', time: null, message: null, price: 1500, advance: 500 }],
  },
  {
    id: 'aman-tomorrow-english',
    customer: 'Aman',
    lines: [
      [0, '22:10', 'Aman', 'Can I get a 1kg chocolate cake tomorrow by 5pm?'],
      [0, '22:11', 'Aman', 'Write "Congrats Shreya" on it'],
      [0, '22:15', BAKER, 'Yes, 1000. Pickup or delivery?'],
      [0, '22:16', 'Aman', 'pickup'],
    ],
    expect: [{ item: 'chocolate', kg: 1, eggless: null, day: 1, time: '5:00 pm', message: 'Congrats Shreya', price: 1000, advance: null }],
  },
  {
    id: 'nisha-dedh',
    customer: 'Nisha',
    lines: [
      [0, '19:30', 'Nisha', 'didi dedh kilo ka kitkat cake banana hai {+4} ko'],
      [0, '19:31', 'Nisha', 'shaam 7 baje pickup karungi'],
      [0, '19:35', BAKER, '1800 hoga, kitkat extra lagega'],
      [0, '19:36', 'Nisha', 'thik hai, 800 abhi bhej rahi hu'],
      [0, '19:40', 'Nisha', 'bhej diya 800'],
    ],
    expect: [{ item: 'kitkat', kg: 1.5, eggless: null, day: 4, time: '7:00 pm', message: null, price: 1800, advance: 800 }],
  },
  {
    id: 'tanvi-cancel',
    customer: 'Tanvi',
    trap: 'order then cancelled',
    lines: [
      [1, '18:00', 'Tanvi', 'kal ke liye 1 kg butterscotch book kar do'],
      [1, '18:05', BAKER, 'done 900'],
      [0, '08:00', 'Tanvi', 'sorry didi party cancel ho gayi, order cancel kar do 🙏'],
    ],
    expect: [],
  },
  {
    id: 'harsh-guessed-time',
    customer: 'Harsh',
    trap: 'time with no am/pm',
    lines: [
      [0, '11:20', 'Harsh', 'parso 1 kg coffee walnut cake chahiye, 3 baje'],
      [0, '11:25', BAKER, '1300'],
    ],
    expect: [{ item: 'coffee', kg: 1, eggless: null, day: 2, time: '3:00 pm', message: null, price: 1300, advance: null }],
  },
];

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

/**
 * Weekday and date names in the chats are written relative to "day 0" ({+3} = the weekday three
 * days after it, {date+8} = "25th Oct" style), so the traps still work whatever today is.
 */
function fill(text: string, day0: Date): string {
  return text
    .replace(/\{\+(\d+)\}/g, (_, n) => WD[(day0.getUTCDay() + Number(n)) % 7])
    .replace(/\{date\+(\d+)\}/g, (_, n) => {
      const d = new Date(day0.getTime() + Number(n) * 86_400_000);
      return `${ord(d.getUTCDate())} ${MON[d.getUTCMonth()]}`;
    });
}

/** Turn a case into WhatsApp-export text, dated so that `now` is the evening of "day 0". */
export function toExport(c: Case, now: Date): string {
  const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return c.lines
    .map(([daysAgo, hhmm, who, raw]) => {
      const text = fill(raw, day0);
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
      const [h, m] = hhmm.split(':').map(Number);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yy = String(d.getUTCFullYear()).slice(2);
      return `${dd}/${mo}/${yy}, ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} - ${who}: ${text}`;
    })
    .join('\n');
}
