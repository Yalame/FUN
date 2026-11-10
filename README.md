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
7. **Late joiners** — someone joining mid-night can get starting points: last place's points,
   the table average, 0 or any number (changeable later from the Rounds list).
8. **Champion** — most points of the night (a tie gives two champions).
9. **Fair score (0–100)** — the week / month / all-time ranking. Each round counts from 100 (won)
   to 0 (last) whatever the table size, rounds for more points weigh more, and the average starts
   at 50 until about 5 rounds are played. This way someone who played one night is compared
   fairly with someone who played three. Plain points and crowns can still be shown.

All numbers above can be changed in **Settings**.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | the app screens |
| `calc.js` | all the math (points, money, fees, bill, rankings) |
| `sync.js` | how phones merge their data for team sync |
| `tests/*.test.js` | checks the math and sync — `node tests/calc.test.js && node tests/sync.test.js` |
| `sw.js`, `manifest.webmanifest`, `icons/` | install on home screen + offline |
| `Start CHAMPIONS.command` | double-click to open it on this Mac |

## Team password and sync

Nothing of the team is shown without the **team password**. The app address is public,
but it only shows a password screen.

- All team data (players, nights, money) is encrypted on the phone with the password
  (PBKDF2 + AES-GCM, see `sync.js`) and stored as unreadable text in one secret GitHub gist.
- **First setup (once, by the owner):** open the app, choose the password, paste a GitHub key
  with only the *gist* permission (<https://github.com/settings/tokens/new?description=CHAMPIONS%20team%20key&scopes=gist>).
- **Every other phone:** open the app, type the password once. The GitHub key travels inside the
  encrypted data, so nobody else has to handle it.
- Phones sync by themselves: every 15 s during a game, every minute otherwise.
  Rounds from all phones are kept, the newest edit wins, deletes stay deleted.
- Settings → Team: change the password (all other phones are asked again), replace the GitHub key,
  or sign a phone out (removes the team data from it).
- The password cannot be recovered. A phone that is still signed in can set a new one.
- Test locally without GitHub: `python3 tests/mock_gist_server.py 8790`.

## Where the history lives

On the device, in the browser's storage for the address you open it from.
Use **Settings → Save backup** now and then (to Files / iCloud Drive / a chat),
and **Load backup** to restore it or move it to another device (merge or replace).

## Install

**Live app: https://yalame.github.io/FUN/**

- **iPhone:** open the link in **Safari** → Share → **Add to Home Screen**.
- **Mac:** open the link in Safari → File → **Add to Dock** (Chrome: the install icon in the address bar).
- **Offline on this Mac without the link:** double-click `Start CHAMPIONS.command` (opens `http://localhost:8777`).
  Note: each address keeps its own history, so stick to one per device.

When you change the files, bump `VERSION` in `sw.js` so installed copies refresh.
