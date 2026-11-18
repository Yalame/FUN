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
    potFeeBelow: 5, // winner played under 10 € (e.g. 5 €)
    potFeeAt: 5, // winner played exactly 10 €
    potFeeAbove: 10, // winner played over 10 €
    tableToInvoice: false, // also use the table money to pay the bill?
    splits: DEFAULT_SPLITS,
    theme: 'felt',
    sound: true,
  };

  /** Version of the money rules stored with the team's settings. */
  const RULES_REV = 2;

  /**
   * Bring money rules saved by an older version up to date (changes s in place).
   * Rules 2: the round winner pays 5 € to the pot whenever they played up to 10 €
   * (before, a winner who played 5 € paid nothing to the pot).
   * Returns true when something changed.
   */
  function upgradeRules(s) {
    if (!s || Number(s.rulesRev) >= RULES_REV) return false;
    if (Number(s.potFeeBelow) === 0) s.potFeeBelow = 5;
    s.rulesRev = RULES_REV;
    return true;
  }

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

  /** Who left the table early: one entry per player (the newest wins if two phones saved one). */
  function leavesBy(night) {
    const out = new Map();
    const t = (x) => Number(x.updatedAt || x.at) || 0;
    for (const l of (night && night.leaves) || []) {
      if (!l || !l.playerId) continue;
      const prev = out.get(l.playerId);
      if (!prev || t(l) >= t(prev)) out.set(l.playerId, l);
    }
    return out;
  }

  /** Everything about one night: per-player totals, ranking, champion(s), pot. */
  function nightSummary(night) {
    const per = new Map();
    const get = (id) => {
      if (!per.has(id)) {
        per.set(id, {
          playerId: id, pts: 0, start: 0, won: 0, lost: 0, table: 0, pot: 0, roundsWon: 0, roundsPlayed: 0,
          left: false, leftPaid: 0, leftAfter: null,
        });
      }
      return per.get(id);
    };
    (night.playerIds || []).forEach(get);
    // players who joined late can be given starting points
    for (const j of night.joins || []) {
      const p = get(j.playerId);
      const v = Number(j.pts) || 0;
      p.start += v;
      p.pts += v;
    }
    // players who left early: what they paid toward the bill when they went
    let leftTotal = 0;
    for (const [id, l] of leavesBy(night)) {
      const p = get(id);
      p.left = true;
      p.leftPaid = r2(Math.max(0, Number(l.paid) || 0));
      p.leftAfter = Number(l.afterRound) || 0;
      leftTotal += p.leftPaid;
    }
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
        start: r2(p.start),
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
    return { players, potTotal: r2(potTotal), tableTotal: r2(tableTotal), leftTotal: r2(leftTotal), champions, rounds };
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
   * Split the bill.
   * First everything that is already paid comes off the bill: the pot (and
   * optionally the table money), what players paid when they left early, and
   * extra money someone put in. The rest is paid by the lowest-ranked players
   * still at the table, by percentage — players who left early are not in the split.
   * Players tied on points share their places' percentages equally
   * (e.g. 50 % and 30 % tied → 40 % each).
   * bill: { invoice, shares, tableToInvoice, extras: [{ playerId, amount }] }
   */
  function billPlan(summary, bill) {
    const invoice = r2(bill.invoice);
    const extras = (bill.extras || [])
      .filter((e) => e && e.playerId && Number(e.amount) > 0)
      .map((e) => ({ playerId: e.playerId, amount: r2(e.amount) }));
    const extrasTotal = r2(extras.reduce((a, e) => a + e.amount, 0));
    const leftTotal = r2(summary.leftTotal || 0);
    const tableUsed = bill.tableToInvoice ? r2(summary.tableTotal) : 0;
    const covered = r2(summary.potTotal + tableUsed + leftTotal + extrasTotal);
    const remaining = r2(Math.max(0, invoice - covered));
    const leftover = r2(Math.max(0, covered - invoice));

    const payers = summary.players.filter((p) => !p.left);
    const n = payers.length;
    const raw = Array.from({ length: n }, (_, i) => Math.max(0, Number((bill.shares || [])[i]) || 0));
    const total = raw.reduce((a, b) => a + b, 0);
    const pct = total > 0 ? raw.map((x) => (x * 100) / total) : raw.map(() => 100 / (n || 1));

    // lowest points first = biggest share
    const asc = payers.slice().sort((a, b) => a.pts - b.pts);
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

    const leavers = summary.players
      .filter((p) => p.left)
      .map((p) => ({ playerId: p.playerId, paid: p.leftPaid, afterRound: p.leftAfter, rank: p.rank }));
    // everything each player paid toward the bill: ranked share + extra + paid when leaving
    const byPlayer = {};
    for (const p of summary.players) byPlayer[p.playerId] = 0;
    for (const l of lines) byPlayer[l.playerId] = r2((byPlayer[l.playerId] || 0) + l.amount);
    for (const e of extras) byPlayer[e.playerId] = r2((byPlayer[e.playerId] || 0) + e.amount);
    for (const l of leavers) byPlayer[l.playerId] = r2((byPlayer[l.playerId] || 0) + l.paid);

    return {
      invoice,
      covered,
      remaining,
      leftover,
      potTotal: summary.potTotal,
      tableTotal: summary.tableTotal,
      tableUsed,
      tableToInvoice: !!bill.tableToInvoice,
      leftTotal,
      extrasTotal,
      extras,
      leavers,
      payers: n,
      lines,
      byPlayer,
    };
  }

  /** Everything each player paid toward the bill of a finished night (empty when no bill). */
  function billByPlayer(night, summary) {
    if (!night.bill) return {};
    return billPlan(summary, night.bill).byPlayer;
  }

  /* ---------- fair points: a football-style league table ----------
     Every round adds league points by finishing place: the winner 3, last 0,
     the places in between evenly (4 players: 3 · 2 · 1 · 0). Rounds are weighted:
       - stake: bigger rounds count more, but damped (square root), so a 4-point
         round counts double a 1-point round, not four times;
       - table: more players = more skill, less luck. A heads-up round counts
         about half of a 4-player round, a 6-player round a bit more.
     Weights are scaled so an average round of the period counts 1 (a win = 3).
     Points only go up, like a football table.
     Missed rounds are filled fairly: for every round the table played without
     you, you get your own average points per round — pulled toward the group
     average until you have played about FILL_PRIOR rounds — but never for more
     rounds than you played yourself. Being away doesn't drop you down the
     table, and nobody climbs it without playing. */
  const WIN_POINTS = 3;
  const FILL_PRIOR = 10;
  const r1 = (x) => Math.round(x * 10) / 10;

  /** How much one round says about skill (before scaling). */
  function roundWeight(points, n) {
    if (!(n > 1)) return 0;
    return Math.sqrt(Math.max(0.01, Number(points) || 1)) * ((n - 1) / (n + 1));
  }
  /** A player's result in one round: 1 for the winner … 0 for last. */
  function roundResult(place, n) {
    return n > 1 ? (n - place) / (n - 1) : 0.5;
  }
  /** Average round weight over every player-round of these nights (the scale for "1 round"). */
  function meanWeight(nights) {
    let sum = 0;
    let count = 0;
    for (const night of nights) {
      for (const round of night.rounds || []) {
        const n = (round.results || []).length;
        if (n < 2) continue;
        sum += roundWeight(round.points, n) * n;
        count += n;
      }
    }
    return count && sum > 0 ? sum / count : 1;
  }
  /** League points for one finish (before the round weight): 3 for a win … 0 for last. */
  function leaguePoints(place, n) {
    return WIN_POINTS * roundResult(place, n);
  }

  /**
   * Fair points of a player who earned `lp` league points over `w` weighted rounds,
   * while the table played `held` weighted rounds in the period.
   * groupAvg: the group's league points per weighted round.
   */
  function fairPoints(lp, w, held, groupAvg) {
    const avg = (lp + FILL_PRIOR * groupAvg) / (w + FILL_PRIOR);
    const missed = Math.max(0, held - w);
    const filledRounds = Math.min(missed, w);
    return { fair: lp + filledRounds * avg, filled: filledRounds * avg, missed, filledRounds, avg };
  }

  const playedNights = (nights) => (nights || []).filter((n) => n && n.status === 'finished' && (n.rounds || []).length);
  const byDate = (a, b) => String(a.date).localeCompare(String(b.date)) || (a.startedAt || 0) - (b.startedAt || 0);
  const leagueSums = () => ({ lp: 0, weightSum: 0, resultSum: 0, p2: 0, p3: 0, plast: 0 });

  /** Add one night's rounds to the players' league sums. Returns the weighted rounds the table played. */
  function addRounds(night, scale, get) {
    let held = 0;
    for (const round of night.rounds || []) {
      const n = (round.results || []).length;
      if (n < 2) continue;
      const w = roundWeight(round.points, n) / scale;
      held += w;
      for (const r of round.results) {
        const a = get(r.playerId);
        if (!a) continue;
        a.lp += leaguePoints(r.place, n) * w;
        a.weightSum += w;
        a.resultSum += roundResult(r.place, n);
        if (r.place === n) a.plast += 1;
        else if (r.place === 2) a.p2 += 1;
        else if (r.place === 3) a.p3 += 1;
      }
    }
    return held;
  }
  /** League points per weighted round over everyone (the "average player"). */
  function groupAverage(list) {
    let lp = 0;
    let w = 0;
    for (const a of list) {
      lp += a.lp;
      w += a.weightSum;
    }
    return w > 0 ? lp / w : WIN_POINTS / 2;
  }

  /** Totals per player over many finished nights (for week / month / all-time). */
  function aggregate(nights) {
    const list = playedNights(nights);
    const scale = meanWeight(list);
    const per = new Map();
    const make = (id) => {
      if (!per.has(id)) {
        per.set(id, {
          playerId: id, nights: 0, champions: 0, pts: 0, won: 0, lost: 0, fees: 0, potFees: 0, tableFees: 0,
          bill: 0, billShare: 0, billExtra: 0, billLeft: 0, billNights: 0, billMax: 0, leftEarly: 0,
          roundsWon: 0, roundsPlayed: 0, bestNight: null, lastDate: '', ...leagueSums(),
        });
      }
      return per.get(id);
    };
    let held = 0;
    for (const night of list) {
      const sum = nightSummary(night);
      const plan = night.bill ? billPlan(sum, night.bill) : null;
      for (const p of sum.players) {
        const a = make(p.playerId);
        a.nights += 1;
        a.pts += p.pts;
        a.won += p.won;
        a.lost += p.lost;
        a.fees += p.fees;
        a.potFees += p.pot;
        a.tableFees += p.table;
        a.roundsWon += p.roundsWon;
        a.roundsPlayed += p.roundsPlayed;
        if (a.bestNight === null || p.pts > a.bestNight) a.bestNight = p.pts;
        if (sum.champions.includes(p.playerId)) a.champions += 1;
        if (p.left) a.leftEarly += 1;
        if (String(night.date) > a.lastDate) a.lastDate = String(night.date);
        if (plan) {
          const paid = plan.byPlayer[p.playerId] || 0;
          const line = plan.lines.find((l) => l.playerId === p.playerId);
          a.bill += paid;
          a.billShare += line ? line.amount : 0;
          a.billExtra += plan.extras.filter((e) => e.playerId === p.playerId).reduce((x, e) => x + e.amount, 0);
          a.billLeft += p.left ? p.leftPaid : 0;
          if (paid > 0) {
            a.billNights += 1;
            a.billMax = Math.max(a.billMax, paid);
          }
        }
      }
      held += addRounds(night, scale, (id) => per.get(id));
    }
    const groupAvg = groupAverage([...per.values()]);
    return [...per.values()].map((a) => {
      const money = r2(a.won - a.lost);
      const f = fairPoints(a.lp, a.weightSum, held, groupAvg);
      return {
        ...a,
        pts: r2(a.pts),
        won: r2(a.won),
        lost: r2(a.lost),
        fees: r2(a.fees),
        potFees: r2(a.potFees),
        tableFees: r2(a.tableFees),
        bill: r2(a.bill),
        billShare: r2(a.billShare),
        billExtra: r2(a.billExtra),
        billLeft: r2(a.billLeft),
        billMax: r2(a.billMax),
        money,
        total: r2(money - a.fees - a.bill), // what they are really up or down
        avgPts: a.nights ? r2(a.pts / a.nights) : 0,
        winRate: a.roundsPlayed ? a.roundsWon / a.roundsPlayed : 0,
        avgResult: a.roundsPlayed ? Math.round((a.resultSum / a.roundsPlayed) * 1000) / 10 : 50,
        lp: r1(a.lp), // league points earned in the rounds played
        fair: r1(f.fair), // + fair points for missed rounds = the table
        filled: r1(f.filled),
        missedRounds: Math.round(f.missed), // about how many average rounds the table played without them
        filledRounds: Math.round(f.filledRounds),
        perRound: Math.round(f.avg * 100) / 100, // the average used to fill missed rounds
        ppr: a.weightSum ? Math.round((a.lp / a.weightSum) * 100) / 100 : 0, // plain league points per round
        evidence: r1(a.weightSum), // how many "average rounds" they played
        provisional: a.weightSum < FILL_PRIOR,
      };
    });
  }

  /** Sort standings by fair points, game points or champion titles; ties share a rank. */
  function sortStandings(list, by) {
    const sorted = list.slice();
    if (by === 'fair' || by === 'rating') {
      sorted.sort((a, b) => b.fair - a.fair || (b.roundsWon || 0) - (a.roundsWon || 0) || (b.lp || 0) - (a.lp || 0) || b.champions - a.champions);
      return assignRanks(sorted, (p) => p.fair);
    }
    if (by === 'champions') {
      sorted.sort((a, b) => b.champions - a.champions || (b.fair || 0) - (a.fair || 0) || b.pts - a.pts);
      return assignRanks(sorted, (p) => `${p.champions}|${p.fair}`);
    }
    sorted.sort((a, b) => b.pts - a.pts || b.champions - a.champions || (b.money || 0) - (a.money || 0));
    return assignRanks(sorted, (p) => p.pts);
  }

  /**
   * The standings after each night, oldest first — for the ranking curves.
   * Uses the same scale as aggregate(nights), so the last step matches the table.
   * [{ nightId, date, played: [ids], standings: [{ playerId, fair, rank, lp, pts, total, champions }] }]
   */
  function timeline(nights) {
    const list = playedNights(nights).slice().sort(byDate);
    const scale = meanWeight(list);
    const acc = new Map();
    const steps = [];
    let held = 0;
    for (const night of list) {
      const sum = nightSummary(night);
      const plan = night.bill ? billPlan(sum, night.bill) : null;
      for (const p of sum.players) {
        if (!acc.has(p.playerId)) acc.set(p.playerId, { playerId: p.playerId, pts: 0, total: 0, champions: 0, roundsWon: 0, ...leagueSums() });
        const a = acc.get(p.playerId);
        a.pts += p.pts;
        a.total += p.net - (plan ? plan.byPlayer[p.playerId] || 0 : 0);
        a.roundsWon += p.roundsWon;
        if (sum.champions.includes(p.playerId)) a.champions += 1;
      }
      held += addRounds(night, scale, (id) => acc.get(id));
      const groupAvg = groupAverage([...acc.values()]);
      const standings = [...acc.values()].map((a) => ({
        playerId: a.playerId,
        fair: r1(fairPoints(a.lp, a.weightSum, held, groupAvg).fair),
        lp: r1(a.lp),
        pts: r2(a.pts),
        total: r2(a.total),
        money: 0,
        champions: a.champions,
        roundsWon: a.roundsWon,
      }));
      steps.push({ nightId: night.id, date: night.date, played: sum.players.map((p) => p.playerId), standings: sortStandings(standings, 'fair') });
    }
    return steps;
  }

  /**
   * Everything about the bills of these nights.
   * totals: sums for the period · rows: one per night (newest first) · players: who paid what.
   */
  function billStats(nights) {
    const list = playedNights(nights).filter((n) => n.bill).sort(byDate).reverse();
    const totals = { nights: 0, invoice: 0, pot: 0, table: 0, left: 0, extras: 0, players: 0, leftover: 0 };
    const rows = [];
    const per = new Map();
    for (const night of list) {
      const sum = nightSummary(night);
      const plan = billPlan(sum, night.bill);
      if (!(plan.invoice > 0)) continue;
      totals.nights += 1;
      totals.invoice += plan.invoice;
      totals.pot += plan.potTotal;
      totals.table += plan.tableUsed;
      totals.left += plan.leftTotal;
      totals.extras += plan.extrasTotal;
      totals.players += plan.remaining;
      totals.leftover += plan.leftover;
      rows.push({
        nightId: night.id,
        date: night.date,
        invoice: plan.invoice,
        pot: plan.potTotal,
        table: plan.tableUsed,
        left: plan.leftTotal,
        extras: plan.extrasTotal,
        players: plan.remaining,
        leftover: plan.leftover,
        payers: plan.payers,
        paid: Object.entries(plan.byPlayer).filter(([, v]) => v > 0).map(([playerId, amount]) => ({ playerId, amount })).sort((a, b) => b.amount - a.amount),
      });
      for (const p of sum.players) {
        if (!per.has(p.playerId)) per.set(p.playerId, { playerId: p.playerId, nights: 0, paidNights: 0, share: 0, extra: 0, left: 0, total: 0, max: 0, potFees: 0 });
        const a = per.get(p.playerId);
        const line = plan.lines.find((l) => l.playerId === p.playerId);
        const extra = plan.extras.filter((e) => e.playerId === p.playerId).reduce((x, e) => x + e.amount, 0);
        const paid = plan.byPlayer[p.playerId] || 0;
        a.nights += 1;
        a.share += line ? line.amount : 0;
        a.extra += extra;
        a.left += p.left ? p.leftPaid : 0;
        a.total += paid;
        a.potFees += p.pot;
        if (paid > 0) a.paidNights += 1;
        a.max = Math.max(a.max, paid);
      }
    }
    for (const k of Object.keys(totals)) if (k !== 'nights') totals[k] = r2(totals[k]);
    const players = [...per.values()]
      .map((a) => ({ ...a, share: r2(a.share), extra: r2(a.extra), left: r2(a.left), total: r2(a.total), max: r2(a.max), potFees: r2(a.potFees), avg: a.nights ? r2(a.total / a.nights) : 0 }))
      .sort((a, b) => b.total - a.total || b.paidNights - a.paidNights);
    return { totals, avg: totals.nights ? r2(totals.invoice / totals.nights) : 0, rows, players };
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
    r2, DEFAULT_SETTINGS, DEFAULT_SPLITS, RULES_REV, upgradeRules, potFee, fullAmount, buildRound, leavesBy, nightSummary,
    sharesFor, billPlan, billByPlayer, roundWeight, roundResult, meanWeight, leaguePoints, fairPoints, WIN_POINTS, FILL_PRIOR,
    aggregate, sortStandings, timeline, billStats, isoDate, periodRange, inRange,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof self !== 'undefined' ? self : this);
