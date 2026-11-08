/* CHAMPIONS — all the points, money, ranking and bill-split math.
   Pure functions only (no screen code), so it can be tested on its own. */
(function (root) {
  'use strict';

  /** Round to cents without floating-point surprises (works for negatives too). */
  function r2(x) {
    const v = Number(x) || 0;
    const sign = v < 0 ? -1 : 1;
    return (sign * Math.round(Math.abs(v) * 100 + 1e-7)) / 100;
  }

  /** Who pays how much of the bill, by number of players. Last place first. */
  const DEFAULT_SPLITS = {
    2: [100],
    3: [60, 40],
    4: [50, 30, 20],
    5: [40, 30, 20, 10],
    6: [40, 30, 20, 10],
    7: [40, 30, 20, 10],
    8: [40, 30, 20, 10],
    9: [40, 30, 20, 10],
    10: [40, 30, 20, 10],
    11: [40, 30, 20, 10],
    12: [40, 30, 20, 10],
  };

  const DEFAULT_SETTINGS = {
    currency: '€',
    pointValue: 10, // 1 point = 10 € → "full" money for a round = points × 10 €
    stakePicks: [1, 2, 3, 4, 5], // points offered before each round
    quickAmounts: [5, 10], // smaller money a player may choose to play instead of full
    tableFee: 5, // every round winner pays this for the table
    potThreshold: 10, // the pot fee depends on what the winner played compared with this
    potFeeBelow: 0, // winner played under 10 €
    potFeeAt: 5, // winner played exactly 10 €
    potFeeAbove: 10, // winner played over 10 €
    tableToInvoice: false, // also use the table money to pay the bill?
    splits: DEFAULT_SPLITS,
    theme: 'felt',
    sound: true,
  };

  /** Pot fee the round winner pays, based on the money the winner played. */
  function potFee(played, s) {
    const t = Number(s.potThreshold);
    if (played > t + 1e-9) return Number(s.potFeeAbove) || 0;
    if (Math.abs(played - t) <= 1e-9) return Number(s.potFeeAt) || 0;
    return Number(s.potFeeBelow) || 0;
  }

  /** Full money for a round: points × point value (2 points → 20 €). */
  function fullAmount(points, s) {
    return r2(points * Number(s.pointValue));
  }

  /**
   * Build the stored record of one round.
   * order:   player ids from 1st (winner) to last. Players sitting out are not in it.
   * amounts: { playerId: money that player played } (5, 10 or the full amount …)
   *
   * Points depend only on the place, never on the money:
   *   1st gets (players × points), 2nd one step less, … last gets 1 × points.
   * Money: only the winner collects. Each other player pays the winner what they
   *   played, but never more than the winner played (winner on 5 € gets 5 € from
   *   everyone; winner on 20 € gets 20 / 10 / 5 € from the 20 / 10 / 5 € players).
   *   The winner then pays the table fee and the pot fee.
   */
  function buildRound(points, order, amounts, s) {
    const n = order.length;
    const full = fullAmount(points, s);
    const played = (id) => r2(amounts && amounts[id] != null ? amounts[id] : full);
    const winnerPlayed = n ? played(order[0]) : 0;
    const paid = order.map((id, i) => (i === 0 ? 0 : r2(Math.min(played(id), winnerPlayed))));
    const winnings = r2(paid.reduce((a, b) => a + b, 0));
    const results = order.map((playerId, i) => {
      const winner = i === 0;
      return {
        playerId,
        place: i + 1,
        pts: r2((n - i) * points),
        played: played(playerId),
        won: winner ? winnings : 0,
        lost: paid[i],
        table: winner ? r2(s.tableFee) : 0,
        pot: winner ? r2(potFee(winnerPlayed, s)) : 0,
      };
    });
    return { points, full, order: order.slice(), results };
  }

  /** Give tied entries the same rank (1, 1, 3 …). key(a) returns a comparable value. */
  function assignRanks(sorted, key) {
    sorted.forEach((p, i) => {
      const prev = sorted[i - 1];
      p.rank = prev && key(prev) === key(p) ? prev.rank : i + 1;
    });
    return sorted;
  }

  /** Everything about one night: per-player totals, ranking, champion(s), pot. */
  function nightSummary(night) {
    const per = new Map();
    const get = (id) => {
      if (!per.has(id)) {
        per.set(id, { playerId: id, pts: 0, won: 0, lost: 0, table: 0, pot: 0, roundsWon: 0, roundsPlayed: 0 });
      }
      return per.get(id);
    };
    (night.playerIds || []).forEach(get);
    let potTotal = 0;
    let tableTotal = 0;
    for (const round of night.rounds || []) {
      for (const r of round.results) {
        const p = get(r.playerId);
        p.pts += r.pts;
        p.won += r.won;
        p.lost += r.lost;
        p.table += r.table;
        p.pot += r.pot;
        p.roundsPlayed += 1;
        if (r.place === 1) p.roundsWon += 1;
        potTotal += r.pot;
        tableTotal += r.table;
      }
    }
    const players = [...per.values()].map((p) => {
      const fees = r2(p.table + p.pot);
      const money = r2(p.won - p.lost);
      return {
        ...p,
        pts: r2(p.pts),
        won: r2(p.won),
        lost: r2(p.lost),
        table: r2(p.table),
        pot: r2(p.pot),
        fees,
        money, // won − lost
        net: r2(money - fees), // after table + pot fees
      };
    });
    players.sort((a, b) => b.pts - a.pts || b.roundsWon - a.roundsWon || b.money - a.money);
    assignRanks(players, (p) => p.pts);

    const rounds = (night.rounds || []).length;
    const top = players.length ? players[0].pts : 0;
    const allEqual = players.every((p) => p.pts === top);
    const champions = rounds > 0 && !allEqual ? players.filter((p) => p.pts === top).map((p) => p.playerId) : [];
    return { players, potTotal: r2(potTotal), tableTotal: r2(tableTotal), champions, rounds };
  }

  /** Bill shares (percent, last place first) for a number of players. */
  function sharesFor(n, s) {
    const sp = (s && s.splits) || DEFAULT_SPLITS;
    if (Array.isArray(sp[n]) && sp[n].length) return sp[n].map(Number);
    const below = Object.keys(sp)
      .map(Number)
      .filter((k) => k <= n && Array.isArray(sp[k]) && sp[k].length)
      .sort((a, b) => b - a);
    return below.length ? sp[below[0]].map(Number) : [100];
  }

  /**
   * Split the bill. The pot (and optionally the table money) is taken off first;
   * the rest is paid by the lowest-ranked players by percentage.
   * Players tied on points share their places' percentages equally
   * (e.g. 50 % and 30 % tied → 40 % each).
   * bill: { invoice, shares, tableToInvoice }
   */
  function billPlan(summary, bill) {
    const invoice = r2(bill.invoice);
    const covered = r2(summary.potTotal + (bill.tableToInvoice ? summary.tableTotal : 0));
    const remaining = r2(Math.max(0, invoice - covered));
    const leftover = r2(Math.max(0, covered - invoice));
    const n = summary.players.length;
    const raw = Array.from({ length: n }, (_, i) => Math.max(0, Number((bill.shares || [])[i]) || 0));
    const total = raw.reduce((a, b) => a + b, 0);
    const pct = total > 0 ? raw.map((x) => (x * 100) / total) : raw.map(() => 100 / (n || 1));

    // lowest points first = biggest share
    const asc = summary.players.slice().sort((a, b) => a.pts - b.pts);
    const lines = [];
    for (let i = 0; i < asc.length; ) {
      let j = i;
      while (j + 1 < asc.length && asc[j + 1].pts === asc[i].pts) j++;
      const groupPct = pct.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
      for (let k = i; k <= j; k++) {
        lines.push({ playerId: asc[k].playerId, rank: asc[k].rank, pct: groupPct, tied: j > i, amount: r2((remaining * groupPct) / 100) });
      }
      i = j + 1;
    }
    // put any rounding cent on the biggest payer so the total is exact
    const drift = r2(remaining - lines.reduce((a, l) => a + l.amount, 0));
    if (drift && lines.length) {
      const big = lines.reduce((m, l) => (l.amount > m.amount ? l : m));
      big.amount = r2(big.amount + drift);
    }
    return {
      invoice,
      covered,
      remaining,
      leftover,
      potTotal: summary.potTotal,
      tableTotal: summary.tableTotal,
      tableToInvoice: !!bill.tableToInvoice,
      lines,
    };
  }

  /** Bill amount per player id for a finished night (0 when no bill). */
  function billByPlayer(night, summary) {
    const out = {};
    if (!night.bill) return out;
    for (const l of billPlan(summary, night.bill).lines) out[l.playerId] = l.amount;
    return out;
  }

  /** Totals per player over many finished nights (for week / month / all-time). */
  function aggregate(nights) {
    const per = new Map();
    for (const night of nights) {
      if (night.status !== 'finished') continue;
      const sum = nightSummary(night);
      if (!sum.rounds) continue;
      const bill = billByPlayer(night, sum);
      for (const p of sum.players) {
        if (!per.has(p.playerId)) {
          per.set(p.playerId, {
            playerId: p.playerId, nights: 0, champions: 0, pts: 0, won: 0, lost: 0, fees: 0,
            bill: 0, roundsWon: 0, roundsPlayed: 0, bestNight: null,
          });
        }
        const a = per.get(p.playerId);
        a.nights += 1;
        a.pts += p.pts;
        a.won += p.won;
        a.lost += p.lost;
        a.fees += p.fees;
        a.bill += bill[p.playerId] || 0;
        a.roundsWon += p.roundsWon;
        a.roundsPlayed += p.roundsPlayed;
        if (a.bestNight === null || p.pts > a.bestNight) a.bestNight = p.pts;
        if (sum.champions.includes(p.playerId)) a.champions += 1;
      }
    }
    return [...per.values()].map((a) => {
      const money = r2(a.won - a.lost);
      return {
        ...a,
        pts: r2(a.pts),
        won: r2(a.won),
        lost: r2(a.lost),
        fees: r2(a.fees),
        bill: r2(a.bill),
        money,
        total: r2(money - a.fees - a.bill), // what they are really up or down
        avgPts: a.nights ? r2(a.pts / a.nights) : 0,
      };
    });
  }

  /** Sort standings by points or by champion titles; ties share a rank. */
  function sortStandings(list, by) {
    const byPts = (a, b) => b.pts - a.pts || b.champions - a.champions || b.money - a.money;
    const byChamps = (a, b) => b.champions - a.champions || b.pts - a.pts || b.money - a.money;
    const sorted = list.slice().sort(by === 'champions' ? byChamps : byPts);
    return assignRanks(sorted, by === 'champions' ? (p) => `${p.champions}|${p.pts}` : (p) => p.pts);
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Date range for a week (Mon–Sun), month, year or all time. offset 0 = current, -1 = previous … */
  function periodRange(type, offset, now) {
    now = now || new Date();
    let start;
    let end;
    if (type === 'week') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    } else if (type === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    } else if (type === 'year') {
      start = new Date(now.getFullYear() + offset, 0, 1);
      end = new Date(start.getFullYear() + 1, 0, 1);
    } else {
      return { type: 'all', start: null, end: null };
    }
    return { type, start: isoDate(start), end: isoDate(end), startDate: start, endDate: end };
  }

  function inRange(dateStr, range) {
    return !range.start || (dateStr >= range.start && dateStr < range.end);
  }

  const Calc = {
    r2, DEFAULT_SETTINGS, DEFAULT_SPLITS, potFee, fullAmount, buildRound, nightSummary,
    sharesFor, billPlan, billByPlayer, aggregate, sortStandings, isoDate, periodRange, inRange,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof self !== 'undefined' ? self : this);
