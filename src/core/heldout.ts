// Held-out chats: written after the checker rules were frozen, run once, not tuned on.
// Same format as samples.ts. Day 0 is Saturday 17 Oct 2026 in the eval.
import { BAKER, type Case } from './samples.ts';

export const HELDOUT: Case[] = [
  {
    id: 'h-correction',
    customer: 'Ishita',
    trap: 'customer corrects the day',
    lines: [
      [0, '19:00', 'Ishita', 'didi kal ke liye 1 kg blueberry cheesecake ho jayega?'],
      [0, '19:04', BAKER, 'kal full hai 😔 parso chalega?'],
      [0, '19:06', 'Ishita', 'ok parso hi de do, shaam 5 baje'],
      [0, '19:07', BAKER, '1600 hoga'],
    ],
    expect: [{ item: 'cheesecake', kg: 1, day: 2, time: '5:00 pm', price: 1600, advance: null }],
  },
  {
    id: 'h-tonight',
    customer: 'Manav',
    lines: [
      [0, '12:10', 'Manav', 'urgent! aaj raat 9 baje tak half kg chocolate cake mil sakta hai?'],
      [0, '12:12', BAKER, 'haan, 600'],
      [0, '12:13', 'Manav', 'great, upar likhna "Sorry Babe" 🙈'],
    ],
    expect: [{ item: 'chocolate', kg: 0.5, day: 0, time: '9:00 pm', message: 'Sorry Babe', price: 600, advance: null }],
  },
  {
    id: 'h-november',
    customer: 'Ritu',
    lines: [
      [0, '10:30', 'Ritu', 'Hello! 2nd Nov ko mere bete ka birthday hai'],
      [0, '10:31', 'Ritu', '3 kg ka Spiderman theme cake chahiye, eggless'],
      [0, '10:40', BAKER, 'Theme cake 3 kg ₹3,600. 1500 advance please'],
      [0, '10:55', 'Ritu', '1500 paid on GPay'],
    ],
    expect: [{ item: 'spiderman', kg: 3, eggless: true, day: 16, price: 3600, advance: 1500 }],
  },
  {
    id: 'h-complaint-then-order',
    customer: 'Deepak',
    trap: 'past "kal" complaint, then a new order',
    lines: [
      [0, '09:15', 'Deepak', 'kal wala cake thoda zyada meetha tha'],
      [0, '09:20', BAKER, 'noted, sorry! next time kam meetha'],
      [0, '09:22', 'Deepak', 'koi baat nahi. Monday ko 1 kg ka less sweet pineapple chahiye, 7 baje shaam'],
    ],
    expect: [{ item: 'pineapple', kg: 1, day: 2, time: '7:00 pm', price: null, advance: null }],
  },
  {
    id: 'h-english-dat',
    customer: 'Sara',
    lines: [
      [0, '16:45', 'Sara', 'Hi! Could I order 2 pounds of lemon drizzle cake for the day after tomorrow?'],
      [0, '16:47', BAKER, 'Of course! ₹1,100. Pickup time?'],
      [0, '16:48', 'Sara', 'Around 4pm. No eggs please, my mom is vegetarian'],
    ],
    expect: [{ item: 'lemon', kg: 1, eggless: true, day: 2, time: '4:00 pm', price: 1100, advance: null }],
  },
  {
    id: 'h-devanagari-parso',
    customer: 'Sunita ji',
    lines: [
      [0, '07:50', 'Sunita ji', 'परसों सुबह 10 बजे 1 किलो फ्रूट केक चाहिए'],
      [0, '08:10', BAKER, 'ji, 1000 hoga'],
      [0, '08:12', 'Sunita ji', '500 भेज दिए हैं'],
    ],
    expect: [{ item: 'केक', kg: 1, day: 2, time: '10:00 am', price: 1000, advance: 500 }],
  },
  {
    id: 'h-just-chatting',
    customer: 'Kiran',
    trap: 'thanks and a photo, no order',
    lines: [
      [0, '20:00', 'Kiran', 'Cake was a hit at the party yesterday!! Everyone asked for your number'],
      [0, '20:01', 'Kiran', '<Media omitted>'],
      [0, '20:05', BAKER, 'Aww thank you so much Kiran! ❤️'],
    ],
    expect: [],
  },
  {
    id: 'h-k-advance',
    customer: 'Arnav',
    lines: [
      [0, '09:00', 'Arnav', 'bro Friday ko 2 kg red velvet for office party'],
      [0, '09:05', BAKER, '2400 for 2 kg'],
      [0, '11:00', 'Arnav', 'sent 1.2k advance'],
      [0, '11:01', 'Arnav', 'delivery at 3 pm to WeWork, Sector 44'],
    ],
    expect: [{ item: 'red velvet', kg: 2, day: 6, time: '3:00 pm', price: 2400, advance: 1200 }],
  },
];
