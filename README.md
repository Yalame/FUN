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
5. **Fees** — only the round winner pays: 5 € for the table, plus 5 € to the pot if they played
   up to 10 € (5 € or 10 €), or 10 € if they played more.
6. **The bill** — at the end, everything already paid comes off the bill: the pot (and the table
   money if you tick it), what anyone paid when leaving early, and extra money someone put in.
   The rest is paid by the lowest places still at the table:
   4 players 50/30/20 %, 5–6 players 40/30/20/10 % (3 players 60/40, 2 players 100 — editable).
   Players tied on points share equally (e.g. 50 + 30 → 40 / 40).
7. **Late joiners** — someone joining mid-night can get starting points: last place's points,
   the table average, 0 or any number (changeable later from the Rounds list).
8. **Leaving early** — *Player leaves*: they keep their points and are left out of the bill split.
   When they go they can put money **in the pot** (like a pot fee — quick 5 € / 10 € buttons) and/or
   pay something **toward the bill**; both come off the bill for the others. Undo if they come back.
   **Out at the end = not in the bill:** anyone still marked *Out* on the round screen when you tap
   *We're done* is moved to *Not in the bill* by itself (paid nothing; change it there or put them back).
   On the bill screen ✕ next to a name takes that player out of the split too.
9. **Extra money** — on the bill screen, *Extra money* records someone paying more; it comes off the
   bill for everyone (like the pot) and the payer still takes part in the split.
10. **Champion** — most points of the night (a tie gives two champions).
11. **Fair points** — the main ranking, a league table like football that only goes up.
    Every round adds points by finishing place: 3 for a win down to 0 for last
    (4 players: 3 · 2 · 1 · 0). Rounds are weighted: bigger stakes count more but damped
    (a 4-point round counts double a 1-point round), and tables with more players count more
    (heads-up is mostly luck); weights are scaled so an average round is worth 3 for a win.
    **Missed a night?** Every round the table played without you adds your own average per round,
    pulled toward the group's average until you have played about 10 rounds, and never for more
    rounds than you played. Being away doesn't drop you down, one lucky night can't fake a season,
    and nobody climbs the table without playing. The table shows P (rounds), W, 2nd, 3rd, L (last).

All numbers above can be changed in **Settings**.

## Rankings

Pick a week, month, year or all time, then:

- **Ranking** — podium and a football-style league table by *Fair* points (P · W · 2nd · 3rd · L · Pts),
  *Overall* (game points) or *Champions* (crowns). Tap anyone for their player card with every number.
- **Win/Loss** — who is up and who is down, as a table: W–L (nights ended up – down), money won,
  money lost and net, with a bar from the middle (blue up, red down). Switch between *Table money*
  (won − lost at the table — it adds up to zero over everyone) and *After fees & bills* (what you are
  really up or down). Below it, *Night by night*: every night's result per player, tinted by how big
  it was, with a crown for the champion. The player card also shows who you won the most from and
  lost the most to.
- **Stats** — one table with everything (fair points, earned, missed-round points, P/W/2nd/3rd/L,
  points per round, win %, average finish, game points, crowns, best night, won, lost, cards, fees,
  bills, net); names stay put while the numbers scroll sideways.
  Tap a column to sort.
- **Curves** — how the league position, fair points, game points or money moved night by night. Touch the chart to
  see everyone on that night; tap a name to highlight their line; *Show the numbers* gives the table.
- **Bills** — totals, average bill, how the bills were paid (pot, table, leaving, extra, ranking split),
  who paid what, and every night's bill.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | the app screens (the poker table — leather rail, wooden racetrack, felt — is in `index.html` + `styles.css`; line icons and chip rank badges in `app.js`) |
| `calc.js` | all the math (points, money, fees, bill, leavers and their pot money, extra money, fair points, curves, bill stats, win / loss, head to head) |
| `charts.js` | the ranking curves and trend lines (plain SVG, works offline) |
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
