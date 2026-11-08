# 🏆 CHAMPIONS — poker night scorekeeper

A small app for the team's poker nights: points per round, money, table & pot fees,
the bill split, the champion of every night, and week / month / all-time rankings.
It runs in any browser and installs on iPhone and Mac like a normal app. Works offline.

## The rules it uses

1. **Points per round** — before every round you pick the points (1 point = 10 €).
2. **Money per player** — each player plays 5 €, 10 € or the full amount (points × 10 €), or sits out.
3. **Points by place** — winner gets *players × points*, each next place one step less, last gets *1 × points*.
   Money never changes points.
4. **Money** — only the winner collects. Each player pays the winner what they played,
   but never more than the winner played (winner on 5 € gets 5 € from everyone).
5. **Fees** — the winner pays 5 € for the table, plus 5 € to the pot if they played 10 €,
   or 10 € if they played more (0 € if less).
6. **The bill** — at the end the pot is taken off the bill; the rest is paid by the lowest places:
   4 players 50/30/20 %, 5–6 players 40/30/20/10 % (3 players 60/40, 2 players 100 — editable).
   Players tied on points share equally (e.g. 50 + 30 → 40 / 40).
7. **Champion** — most points of the night (a tie gives two champions).

All numbers above can be changed in **Settings**.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | the app screens |
| `calc.js` | all the math (points, money, fees, bill, rankings) |
| `tests/calc.test.js` | checks the math — run `node tests/calc.test.js` |
| `sw.js`, `manifest.webmanifest`, `icons/` | install on home screen + offline |
| `Start CHAMPIONS.command` | double-click to open it on this Mac |

## Where the history lives

On the device, in the browser's storage for the address you open it from.
Use **Settings → Save backup** now and then (to Files / iCloud Drive / a chat),
and **Load backup** to restore it or move it to another device (merge or replace).

## Install

- **Mac:** double-click `Start CHAMPIONS.command` (or open `http://localhost:8777`).
  In Safari: File → Add to Dock. In Chrome: the install icon in the address bar.
- **iPhone:** the app must be online at an `https://` address (e.g. GitHub Pages).
  Open that address in Safari → Share → **Add to Home Screen**.

When you change the files, bump `VERSION` in `sw.js` so installed copies refresh.
