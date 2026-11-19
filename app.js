/* CHAMPIONS — screens and interactions. All the math lives in calc.js. */
(() => {
  'use strict';
  const C = window.Calc;
  const Y = window.SyncLib;
  const K = window.Charts;
  const KEY = 'champions.v1';
  const APP_VERSION = '2.2';
  const EMOJIS = ['🦁', '🐯', '🦊', '🐺', '🦅', '🐻', '🐼', '🦈', '🐙', '🦄', '🐲', '🦖', '🐸', '🐵', '🦉', '🐝', '🦂', '🐊', '🦬', '🐆', '🦩', '🐧', '🐳', '🦍', '🐗', '🦓', '🐍', '🦚'];
  const CHIP_COLORS = ['#e23b3b', '#2f6fe0', '#1f9d55', '#222226', '#8e44ad', '#e67e22', '#c99a06'];
  const THEMES = {
    felt: { name: 'Vegas', swatch: 'radial-gradient(circle at 50% 30%, #23935a, #0b4428 60%, #041a0e)', color: '#0a2418' },
    royal: { name: 'Royal', swatch: 'radial-gradient(circle at 50% 30%, #5b3fc4, #2a1a6a 60%, #0c0726)', color: '#140d33' },
    ruby: { name: 'Ruby', swatch: 'radial-gradient(circle at 50% 30%, #c22a45, #6a0f20 60%, #1e0308)', color: '#220810' },
    ocean: { name: 'Ocean', swatch: 'radial-gradient(circle at 50% 30%, #2378b5, #0d3a5e 60%, #03101d)', color: '#071827' },
  };

  /* ================= helpers ================= */
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const parseNum = (v) => {
    const x = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, ''));
    return Number.isFinite(x) ? x : NaN;
  };
  const parseList = (v) => String(v || '').split(/[,;\s]+/).map(parseNum).filter((x) => Number.isFinite(x) && x >= 0);
  const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

  /* ================= data ================= */
  function freshDb() {
    return { version: 1, players: [], nights: [], settings: clone(C.DEFAULT_SETTINGS), settingsUpdatedAt: 0, deleted: Y.emptyDeleted(), lastBackup: null };
  }
  function normalize(d) {
    const base = freshDb();
    if (!d || typeof d !== 'object') return base;
    const settings = { ...base.settings, ...(d.settings || {}) };
    settings.splits = { ...base.settings.splits, ...((d.settings && d.settings.splits) || {}) };
    return {
      version: 1,
      players: Array.isArray(d.players) ? d.players : [],
      nights: Array.isArray(d.nights) ? d.nights : [],
      settings,
      settingsUpdatedAt: Number(d.settingsUpdatedAt) || 0,
      deleted: { ...Y.emptyDeleted(), ...(d.deleted || {}) },
      lastBackup: d.lastBackup || null,
    };
  }
  function loadDb() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : freshDb();
    } catch (e) {
      console.error('Could not read saved data', e);
      try { if (raw) localStorage.setItem(`${KEY}.unreadable.${Date.now()}`, raw); } catch (_) { /* ignore */ }
      return freshDb();
    }
  }
  let db = loadDb();
  function saveLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      toast('⚠️ Could not save on this device');
    }
  }
  /** Save on this phone, and send to the team when this phone has the team key. */
  function save() {
    saveLocal();
    scheduleSync();
  }
  // Remember when things change, so phones can merge their data correctly.
  const touch = (o) => {
    if (o) o.updatedAt = Date.now();
    return o;
  };
  const tomb = (kind, id) => {
    db.deleted = db.deleted || Y.emptyDeleted();
    db.deleted[kind][id] = Date.now();
  };
  const markSettings = () => {
    db.settingsUpdatedAt = Date.now();
  };
  // A random id for this phone: the phone that starts a night can always score it.
  const DEVICE_ID = (() => {
    try {
      let id = localStorage.getItem(`${KEY}.device`);
      if (!id) {
        id = Math.random().toString(36).slice(2, 12);
        localStorage.setItem(`${KEY}.device`, id);
      }
      return id;
    } catch (_) {
      return 'this-device';
    }
  })();
  // Ask the browser to keep our data (helps on iPhone / Safari).
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) { /* ignore */ }

  const S = () => db.settings;
  const P = (id) => db.players.find((p) => p.id === id) || { id, name: 'Unknown', emoji: '❔', hue: 0 };
  const nameOf = (id) => esc(P(id).name);
  /** The night being played: one started on this phone first, else the newest. */
  const activeNight = () => {
    const live = db.nights.filter((n) => n.status === 'active');
    return live.find((n) => n.device === DEVICE_ID) || live.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
  };
  const nightById = (id) => db.nights.find((n) => n.id === id);
  const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0);
  const finishedNights = () => db.nights.filter((n) => n.status === 'finished' && n.rounds.length).sort(byNewest);
  /** Players still at the table tonight (everyone who has not left early). */
  const seatedIds = (night) => {
    const gone = C.leavesBy(night);
    return night.playerIds.filter((id) => !gone.has(id));
  };
  /** Players marked Out on the round screen of this night (sitting out right now). */
  const outNow = (night) => {
    const d = ui.draft && ui.draft.nightId === night.id ? ui.draft : null;
    return d ? seatedIds(night).filter((id) => d.out && d.out[id]) : [];
  };
  /** The last round a player played tonight (0 = none yet). */
  const lastRoundOf = (night, id) => {
    let last = 0;
    (night.rounds || []).forEach((r, i) => {
      if (r.results.some((x) => x.playerId === id)) last = i + 1;
    });
    return last;
  };
  /** "left after round 6", "out after round 6", "out all night" … */
  const leftTxt = (after, out) => {
    const n = Number(after) || 0;
    if (out) return n ? `out after round ${n}` : 'out all night';
    return n ? `left after round ${n}` : 'left before round 1';
  };

  function addPlayer(rawName) {
    const name = String(rawName || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!name) return null;
    const existing = db.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.hidden = false;
      touch(existing);
      save();
      return existing;
    }
    const used = new Set(db.players.map((p) => p.emoji));
    const free = EMOJIS.filter((e) => !used.has(e));
    const pool = free.length ? free : EMOJIS;
    const p = {
      id: uid(),
      name,
      emoji: pool[Math.floor(Math.random() * pool.length)],
      hue: Math.floor(Math.random() * 360),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.players.push(p);
    save();
    return p;
  }

  /** Players sorted by who played most recently, then by name. */
  function playersByRecent() {
    const last = {};
    for (const n of db.nights) for (const id of n.playerIds) last[id] = Math.max(last[id] || 0, n.startedAt || 0);
    return db.players
      .filter((p) => !p.hidden)
      .sort((a, b) => (last[b.id] || 0) - (last[a.id] || 0) || a.name.localeCompare(b.name));
  }

  /* ================= formatting ================= */
  function money(v, signed = false) {
    v = C.r2(v);
    const a = Math.abs(v);
    const txt = Number.isInteger(a) ? String(a) : a.toFixed(2);
    const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
    return `${sign}${txt} ${S().currency}`; // no line break between the number and €
  }
  const moneyHtml = (v, signed = false) => esc(money(v, signed));
  function ptsTxt(v, signed = false) {
    v = C.r2(v);
    const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
    return `${sign}${Math.abs(v)}`;
  }
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
  const DATE_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
  const DAYMON_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  const DATE_TIME_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const DAYMONYEAR_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const toDate = (iso) => new Date(`${iso}T12:00:00`);
  const fmtDate = (iso) => DATE_FMT.format(toDate(iso));
  const pctTxt = (x) => `${Math.round(x * 10) / 10}%`;
  const pct0 = (x) => `${Math.round(x * 100)}%`;
  const fairTxt = (v) => (Math.round((Number(v) || 0) * 10) / 10).toFixed(1); // fair points, one decimal
  /** Money without the currency sign, for table columns that say the currency in the header. */
  function moneyNum(v, signed = false) {
    v = C.r2(v);
    const a = Math.abs(v);
    const txt = Number.isInteger(a) ? String(a) : a.toFixed(2);
    return `${v < 0 ? '−' : signed && v > 0 ? '+' : ''}${txt}`;
  }
  /** Rank badge: a gold / silver / bronze poker chip for the top 3, a plain number after that. */
  const medal = (rank) => (rank >= 1 && rank <= 3 ? `<span class="rchip r${rank}">${rank}</span>` : `<span class="rnum">${rank}</span>`);
  const MEDAL_TXT = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const medalTxt = (rank) => MEDAL_TXT[rank] || `${rank}.`; // for shared text
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const namesJoin = (ids) => ids.map((id) => P(id).name).join(' & ');

  function avatar(id, size = '') {
    const p = P(id);
    return `<span class="av ${size}" style="--h:${p.hue | 0}">${p.emoji}</span>`;
  }
  const CROWN = '<svg class="crown" viewBox="0 0 64 48" aria-hidden="true"><path d="M5 17l13 11L32 7l14 21 13-11-5 25H10z" fill="url(#g-gold)" stroke="#7a5200" stroke-width="2" stroke-linejoin="round"/><circle cx="5" cy="16" r="4" fill="url(#g-gold)" stroke="#7a5200" stroke-width="1.6"/><circle cx="32" cy="6" r="4" fill="url(#g-gold)" stroke="#7a5200" stroke-width="1.6"/><circle cx="59" cy="16" r="4" fill="url(#g-gold)" stroke="#7a5200" stroke-width="1.6"/><rect x="10" y="40" width="44" height="6" rx="2" fill="url(#g-gold)" stroke="#7a5200" stroke-width="1.6"/><circle cx="32" cy="32" r="3.2" fill="#e5484d"/><circle cx="20" cy="34" r="2.4" fill="#2f6fe0"/><circle cx="44" cy="34" r="2.4" fill="#1f9d55"/></svg>';
  const logo = (small) => `<header class="logo ${small ? 'small' : ''}">${CROWN}<h1>CHAMPIONS</h1>${small ? '' : '<p><i class="suit">♠</i><span>Poker night · points · the bill</span><i class="suit red">♦</i></p>'}</header>`;

  /* line icons (24 × 24), drawn in the text color */
  const svgIcon = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    pot: svgIcon('<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/>'),
    table: svgIcon('<path d="M3 9h18M6 9l1.5-4h9L18 9M6 9v10M18 9v10M6 14h12"/>'),
    bill: svgIcon('<path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    door: svgIcon('<path d="M13 4H6v16h7"/><path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5"/>'),
    join: svgIcon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>'),
    flag: svgIcon('<path d="M5 21V4M5 4h12l-2.5 4.5L17 13H5"/>'),
    share: svgIcon('<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/>'),
    trash: svgIcon('<path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13M10 11v5.5M14 11v5.5"/>'),
    undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    edit: svgIcon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    x: svgIcon('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
    plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
    plusCircle: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
    trophy: svgIcon('<path d="M8 21h8M12 16.5V21M7 4h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/>'),
    grid: svgIcon('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>'),
    curve: svgIcon('<path d="M4 4v16h16"/><path d="M7.5 15l3.5-4.5 3 2.5 5-6.5"/>'),
    updown: svgIcon('<path d="M7 20V5M3.5 8.5 7 5l3.5 3.5M17 4v15M13.5 15.5 17 19l3.5-3.5"/>'),
    stats: svgIcon('<path d="M5 20v-8M10 20V5M15 20v-6M20 20V10"/>'),
    phone: svgIcon('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
    download: svgIcon('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>'),
    upload: svgIcon('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>'),
    lock: svgIcon('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/>'),
    cloud: svgIcon('<path d="M7 18.5h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.4-1.4A4.5 4.5 0 0 0 7 18.5z"/>'),
    alert: svgIcon('<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>'),
    sync: svgIcon('<path d="M20 11a8 8 0 0 0-14.3-4.8L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.8L20 16M20 20v-4h-4"/>'),
    eye: svgIcon('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svgIcon('<path d="M3 3l18 18M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    chevL: svgIcon('<path d="M15 5l-7 7 7 7"/>'),
    chevR: svgIcon('<path d="M9 5l7 7-7 7"/>'),
    cards: svgIcon('<rect x="3" y="6.5" width="11" height="15" rx="2"/><path d="M9.5 3.6l8.7 2.3a2 2 0 0 1 1.4 2.5l-3 11.4"/>'),
    calendar: svgIcon('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    crown: '<svg class="ic ic-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5l4.6 4 4.4-7.5 4.4 7.5 4.6-4-1.8 10.5H4.8z"/></svg>',
  };
  /** A small gold crown and a count: "♛ 2" */
  const crowns = (n) => (n ? `<span class="crowns-n">${IC.crown}${n}</span>` : '');

  /* ================= UI state ================= */
  const ui = {
    tab: 'play',
    view: 'home', // play tab: home | setup | bill | report
    setup: null,
    draft: null,
    reportId: null,
    historyId: null,
    // rankings: period, ranking kind, sub-view, table sort, curve metric, highlighted player, win/loss money (cards | net)
    rank: { type: 'month', offset: 0, by: 'fair', view: 'board', sort: null, metric: 'rank', focus: null, money: 'cards' },
    billInput: '',
    billTable: false,
    billExtras: [], // [{ playerId, amount }] extra money toward tonight's bill
    newPlayer: '',
    showHidden: false,
  };

  /* ================= sounds ================= */
  let actx = null;
  function tones(notes) {
    if (!S().sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + 0.01;
      for (const [freq, at, dur, type = 'triangle', gain = 0.09] of notes) {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(actx.destination);
        o.start(t0 + at);
        o.stop(t0 + at + dur + 0.05);
      }
    } catch (_) { /* sound is optional */ }
  }
  const sfx = {
    chip: () => tones([[2100, 0, 0.05, 'square', 0.025], [2800, 0.035, 0.07, 'square', 0.02]]),
    tap: () => tones([[880, 0, 0.06, 'sine', 0.05]]),
    win: () => tones([[523, 0, 0.14], [659, 0.1, 0.14], [784, 0.2, 0.14], [1047, 0.3, 0.4]]),
    champ: () => tones([[392, 0, 0.18], [523, 0.16, 0.18], [659, 0.32, 0.18], [784, 0.48, 0.3], [659, 0.7, 0.14], [784, 0.82, 0.14], [1047, 0.96, 0.7, 'triangle', 0.12]]),
  };

  /* ================= confetti ================= */
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function confetti(power = 1) {
    if (reducedMotion()) return;
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.display = 'block';
    const colors = ['#f5c542', '#fff2b0', '#ffffff', '#e5484d', '#3ddc84', '#4aa3ff', '#ff8fd1'];
    const parts = Array.from({ length: Math.round(110 * power) }, () => ({
      x: W * (0.15 + Math.random() * 0.7),
      y: H * (0.3 + Math.random() * 0.1),
      vx: (Math.random() - 0.5) * 13,
      vy: -Math.random() * 15 - 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 9,
      c: colors[Math.floor(Math.random() * colors.length)],
      suit: Math.random() < 0.18 ? '♠♥♦♣'[Math.floor(Math.random() * 4)] : null,
    }));
    const start = performance.now();
    const dur = 2400 + 900 * power;
    cancelAnimationFrame(confetti.raf);
    const frame = (t) => {
      const el = t - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.38;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - el / dur);
        if (p.suit) {
          ctx.fillStyle = p.suit === '♥' || p.suit === '♦' ? '#ff4d5a' : '#ffffff';
          ctx.font = '22px serif';
          ctx.fillText(p.suit, -7, 7);
        } else {
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 2);
        }
        ctx.restore();
      }
      if (el < dur) confetti.raf = requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, W, H);
        cv.style.display = 'none';
      }
    };
    confetti.raf = requestAnimationFrame(frame);
  }

  /* ================= toast & modal ================= */
  function toast(msg, ms = 2200) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), ms);
  }

  /**
   * Show a dialog. Buttons: [{ label, value, kind }]. Any element inside the body
   * with data-modal-value also closes it with that value.
   * Resolves { value, input } (input = text of the first input, if any). Dismiss → value null.
   */
  function ask({ title, body = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }], dismissable = true }) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      const prevFocus = document.activeElement;
      root.innerHTML = `
        <div class="modal-back" data-modal-value="__dismiss">
          <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title.replace(/<[^>]+>/g, ''))}">
            <h3>${title}</h3>
            ${body ? `<div class="modal-body">${body}</div>` : '<div style="height:14px"></div>'}
            <div class="modal-btns">${buttons
              .map((b, i) => `<button class="${b.kind || 'ghost'}" data-modal-value="#${i}">${b.label}</button>`)
              .join('')}</div>
          </div>
        </div>`;
      const close = (value) => {
        const all = [...root.querySelectorAll('input, textarea')];
        const input = all.length ? all[0].value : null;
        // fields with data-k come back by name: { pot: '5', paid: '' }
        const inputs = Object.fromEntries(all.filter((x) => x.dataset.k).map((x) => [x.dataset.k, x.value]));
        root.innerHTML = '';
        root.onclick = null;
        root.onkeydown = null;
        if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
        resolve({ value, input, inputs });
        if (renderPending) setTimeout(() => renderPending && render(), 60);
      };
      root.onclick = (e) => {
        // quick amounts fill a field without closing the dialog
        const fill = e.target.closest('[data-fill]');
        if (fill) {
          const inp = root.querySelector(`input[data-k="${fill.dataset.fill}"]`);
          if (inp) inp.value = fill.dataset.v;
          root.querySelectorAll(`[data-fill="${fill.dataset.fill}"]`).forEach((b) => b.classList.toggle('on', b === fill));
          return;
        }
        const el = e.target.closest('[data-modal-value]');
        if (!el) return;
        const v = el.dataset.modalValue;
        if (v === '__dismiss') {
          if (e.target === el && dismissable) close(null);
          return;
        }
        close(v.startsWith('#') ? buttons[+v.slice(1)].value : v);
      };
      root.onkeydown = (e) => {
        if (e.key === 'Escape' && dismissable) close(null);
        if (e.key === 'Enter' && e.target.matches('input')) {
          e.preventDefault();
          const prim = buttons.findIndex((b) => b.kind === 'primary');
          if (prim >= 0) close(buttons[prim].value);
        }
      };
      requestAnimationFrame(() => {
        const inp = root.querySelector('input');
        if (inp) {
          inp.focus();
          inp.select && inp.select();
        } else {
          const b = root.querySelector('.modal-btns button');
          b && b.focus({ preventScroll: true });
        }
      });
    });
  }
  async function confirmBox(title, body, okLabel = 'Yes', kind = 'danger') {
    const r = await ask({ title, body, buttons: [{ label: okLabel, value: true, kind }, { label: 'Cancel', value: false }] });
    return r.value === true;
  }
  async function askNumber(title, value, suffix = S().currency, hint = '') {
    const r = await ask({
      title,
      body: `<div class="money-in"><input inputmode="decimal" value="${esc(value ?? '')}" placeholder="0" aria-label="${esc(title)}"><span>${esc(suffix)}</span></div>${hint ? `<p class="hint">${hint}</p>` : ''}`,
      buttons: [{ label: 'OK', value: 'ok', kind: 'primary' }, { label: 'Cancel', value: null }],
    });
    if (r.value !== 'ok') return null;
    const n = parseNum(r.input);
    if (!Number.isFinite(n) || n < 0) {
      toast('Please type a number');
      return null;
    }
    return C.r2(n);
  }
  /**
   * Someone leaves (or is taken out of the bill): what they put in the pot and what they
   * pay toward the bill. Both come off the bill for the others. Returns { pot, paid } or null.
   */
  async function askLeaveMoney(id, cur = {}, atBill = false) {
    const s = S();
    const fees = [...new Set([s.potFeeBelow, s.potFeeAt, s.potFeeAbove].map(Number).filter((v) => v > 0))].sort((a, b) => a - b);
    const field = (k, label, sub, v, quick = []) => `
      <div class="money-field">
        <span class="mf-label"><b>${label}</b><small>${sub}</small></span>
        <div class="money-in sm"><input inputmode="decimal" data-k="${k}" value="${Number(v) > 0 ? esc(String(v)) : ''}" placeholder="0" aria-label="${label}"><span>${esc(s.currency)}</span></div>
        ${quick.length ? `<div class="quick-fill">${quick.map((q) => `<button type="button" class="qf ${Number(v || 0) === q ? 'on' : ''}" data-fill="${k}" data-v="${q}">${moneyHtml(q)}</button>`).join('')}</div>` : ''}
      </div>`;
    const r = await ask({
      title: atBill ? `${nameOf(id)} is not in the bill` : `${nameOf(id)} leaves`,
      body: `<p class="hint" style="margin:0 0 4px">They keep their points and are left out of the bill split.</p>
        ${field('pot', 'Puts in the pot', 'like a pot fee', cur.pot, [0, ...fees])}
        ${field('paid', 'Pays toward the bill', 'their part of the bill, if any', cur.paid)}
        <p class="hint">Both come off the bill for the others. Leave empty for nothing.</p>`,
      buttons: [{ label: 'OK', value: 'ok', kind: 'primary' }, { label: 'Cancel', value: null }],
    });
    if (r.value !== 'ok') return null;
    const num = (x) => (String(x == null ? '' : x).trim() === '' ? 0 : parseNum(x));
    const pot = num(r.inputs.pot);
    const paid = num(r.inputs.paid);
    if (![pot, paid].every((v) => Number.isFinite(v) && v >= 0)) {
      toast('Please type a number');
      return null;
    }
    return { pot: C.r2(pot), paid: C.r2(paid) };
  }
  /** "pot 5 € · paid 20 €" for someone who left (empty when they paid nothing). */
  const leftMoneyTxt = (pot, paid) => [Number(pot) > 0 ? `pot ${money(pot)}` : '', Number(paid) > 0 ? `paid ${money(paid)}` : ''].filter(Boolean).join(' · ');

  async function askText(title, value = '', placeholder = '') {
    const r = await ask({
      title,
      body: `<input class="text-in" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="24" autocomplete="off" aria-label="${esc(title)}">`,
      buttons: [{ label: 'Save', value: 'ok', kind: 'primary' }, { label: 'Cancel', value: null }],
    });
    return r.value === 'ok' ? String(r.input || '').trim() : null;
  }

  /** Ask how many points a late joiner starts with, showing the table so far. */
  async function askStartPoints(night, p) {
    const list = C.nightSummary(night).players;
    const all = list.map((x) => x.pts);
    const low = Math.min(...all);
    const avg = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
    const lowNames = list.filter((x) => x.pts === low).map((x) => P(x.playerId).name).join(' & ');
    const r = await ask({
      title: `Starting points for ${esc(p.name)}`,
      body: `<p>Points after ${plural(night.rounds.length, 'round')}:</p>
        <div class="mini-table">${list.map((x) => `<div>${avatar(x.playerId, 'sm')}<span>${nameOf(x.playerId)}</span><b>${ptsTxt(x.pts)} pts</b></div>`).join('')}</div>
        <p class="hint">${esc(p.name)} gets points from the next round on. How many to start with?</p>`,
      buttons: [
        { label: `Same as last place · ${ptsTxt(low)} pts <small>(${esc(lowNames)})</small>`, value: low, kind: 'primary' },
        { label: `Table average · ${ptsTxt(avg)} pts`, value: avg, kind: 'secondary' },
        { label: 'Start from 0', value: 0, kind: 'secondary' },
        { label: 'Other number…', value: 'custom' },
      ],
    });
    if (r.value === null || r.value === undefined) return null;
    if (r.value === 'custom') return askNumber(`Starting points for ${p.name}`, '', 'pts');
    return Number(r.value) || 0;
  }

  /* ================= sharing ================= */
  async function shareText(text, title = 'CHAMPIONS') {
    if (navigator.share && isTouch()) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('📋 Copied — paste it in your group chat');
    } catch (_) {
      ask({ title: 'Copy this report', body: `<textarea readonly>${esc(text)}</textarea>`, buttons: [{ label: 'Close', value: null, kind: 'primary' }] });
    }
  }

  function nightText(night) {
    const sum = C.nightSummary(night);
    const plan = night.bill ? C.billPlan(sum, night.bill) : null;
    const billBy = plan ? plan.byPlayer : {};
    const L = [];
    L.push(`🏆 CHAMPIONS — ${fmtDate(night.date)}`);
    if (sum.champions.length) {
      const top = sum.players[0];
      L.push(`👑 Champion: ${namesJoin(sum.champions)} with ${ptsTxt(top.pts)} points`);
    }
    L.push('', `Ranking (${plural(sum.rounds, 'round')}):`);
    for (const p of sum.players) {
      L.push(`${medalTxt(p.rank)} ${P(p.playerId).name} — ${ptsTxt(p.pts)} pts${p.start ? ` (incl. ${ptsTxt(p.start)} start pts)` : ''}${p.left ? ` · ${leftTxt(p.leftAfter, p.leftOut)}` : ''} · won ${money(p.won)} · lost ${money(p.lost)} · fees ${money(p.fees)}`);
    }
    L.push('', `🍯 Pot: ${money(sum.potTotal)} · 🪑 Table: ${money(sum.tableTotal)}`);
    if (plan) {
      const off = [`pot ${money(plan.potTotal)}`];
      if (plan.tableToInvoice) off.push(`table ${money(plan.tableUsed)}`);
      if (plan.leftTotal) off.push(`paid when leaving ${money(plan.leftTotal)}`);
      if (plan.extrasTotal) off.push(`extra ${money(plan.extrasTotal)}`);
      L.push(`🧾 Bill ${money(plan.invoice)} − ${off.join(' − ')} = ${money(plan.remaining)} for ${plural(plan.payers, 'player')}`);
      for (const l of plan.leavers) L.push(`   👋 ${P(l.playerId).name} ${leftTxt(l.afterRound, l.out)}${leftMoneyTxt(l.pot, l.paid) ? ` · ${leftMoneyTxt(l.pot, l.paid)}` : ''} · not in the bill`);
      for (const e of plan.extras) L.push(`   ➕ ${P(e.playerId).name} paid ${money(e.amount)} extra`);
      for (const l of plan.lines) if (l.amount > 0) L.push(`   • ${P(l.playerId).name}: ${pctTxt(l.pct)} → ${money(l.amount)}${l.tied ? ' (tied)' : ''}`);
      if (plan.leftover > 0) L.push(`   ${money(plan.leftover)} left over`);
    }
    L.push('', 'Tonight overall (money − fees − bill):');
    for (const p of sum.players) L.push(`   ${P(p.playerId).name}: ${money(p.net - (billBy[p.playerId] || 0), true)}`);
    return L.join('\n');
  }

  /* ================= team sync ================= */
  // The team's shared data lives in a secret GitHub gist. Every phone reads it
  // (no limit, no login); phones with the team key also save to it.
  const TEAM_DEFAULT = { owner: 'Yalame', id: '85907d46e3e37bebdc6a07780090f9b4' };
  const SYNC_KEY = `${KEY}.sync`;
  function loadSync() {
    let st = {};
    try {
      st = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') || {};
    } catch (_) {
      st = {};
    }
    // always the team's file (st.api is set only by local tests)
    if (!st.api) Object.assign(st, TEAM_DEFAULT);
    return st;
  }
  let sync = loadSync();
  function saveSync() {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (_) { /* ignore */ }
  }
  /** Unlocked = this phone knows the team password (its key). */
  const syncOn = () => !!sync.key;
  const canWrite = () => syncOn() && !!sync.token;
  /** Can this phone enter rounds for this night? */
  const canScore = (night) => !syncOn() || canWrite() || night.device === DEVICE_ID;
  let syncBusy = false;
  let syncAgain = false;
  let syncTimer = null;
  let renderPending = false;

  // GitHub addresses (sync.api / sync.raw can point elsewhere for testing only)
  const API = () => sync.api || 'https://api.github.com';
  const RAW = () => sync.raw || 'https://gist.githubusercontent.com';
  const ghHeaders = (token) => ({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  function syncError(status) {
    if (status === 401) return 'The team key was not accepted — paste it again in Settings.';
    if (status === 403 || status === 429) return 'GitHub is busy (too many requests) — trying again soon.';
    if (status === 404) return 'Team data not found — check the team link in Settings.';
    return `GitHub error ${status} — trying again soon.`;
  }
  function parseTeamText(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error('The team data file is damaged.');
    }
  }
  class LockedOut extends Error {}
  /** The stored team file as it is on GitHub (still encrypted). */
  async function fetchTeamFile() {
    let text;
    if (sync.key && sync.token) {
      const r = await fetch(`${API()}/gists/${sync.id}`, { headers: ghHeaders(sync.token), cache: 'no-store' });
      if (!r.ok) throw new Error(syncError(r.status));
      const g = await r.json();
      const f = g.files && g.files[Y.FILE];
      text = f ? (f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content) : '';
    } else {
      const r = await fetch(`${RAW()}/${sync.owner}/${sync.id}/raw/${Y.FILE}?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(syncError(r.status));
      text = await r.text();
    }
    return parseTeamText(text);
  }
  /** Download and unlock the team data. Null when no team has been set up yet. */
  async function fetchTeamData() {
    const file = await fetchTeamFile();
    if (!file || !file.enc) return null;
    if (file.salt !== sync.salt) throw new LockedOut('The team password was changed. Enter the new one.');
    let content;
    try {
      content = await Y.unseal(sync.key, file);
    } catch (_) {
      throw new LockedOut('The team password was changed. Enter the new one.');
    }
    if (content.token && content.token !== sync.token) sync.token = content.token;
    return content.payload || null;
  }
  async function pushTeamData() {
    const file = await Y.seal(sync.key, sync.salt, { payload: Y.toPayload(db), token: sync.token });
    const r = await fetch(`${API()}/gists/${sync.id}`, {
      method: 'PATCH',
      headers: { ...ghHeaders(sync.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [Y.FILE]: { content: JSON.stringify(file) } } }),
    });
    if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error('The GitHub key no longer works — replace it in Settings → Team.');
    if (!r.ok) throw new Error(syncError(r.status));
    sync.lastPush = Date.now();
  }

  /* ----- the lock screen ----- */
  const lock = { state: 'loading', file: null, msg: '', busy: false };
  /** Look at the team file to know whether to ask for the password or to set one up. */
  async function checkTeamFile() {
    lock.state = 'loading';
    render();
    try {
      const file = await fetchTeamFile();
      lock.file = file && file.enc ? file : null;
      lock.state = lock.file ? 'ready' : 'new';
    } catch (e) {
      lock.state = 'error';
    }
    render();
  }
  function lockOut(msg) {
    delete sync.key;
    delete sync.salt;
    delete sync.token;
    sync.lastSync = null;
    saveSync();
    lock.msg = msg || '';
    checkTeamFile();
  }
  function renderLock() {
    const head = `${logo()}<div class="lock-ico">${IC.lock}</div>`;
    const note = lock.msg ? `<p class="hint warn" style="text-align:center">${esc(lock.msg)}</p>` : '';
    if (lock.state === 'loading') return `${head}<section class="card"><div class="empty">Connecting…</div></section>`;
    if (lock.state === 'error') {
      return `${head}<section class="card" style="text-align:center"><p>No connection. The password is checked online the first time.</p>
        <button class="primary" data-action="lockRetry">Try again</button></section>`;
    }
    if (lock.state === 'new') {
      return `${head}
        <section class="card">
          <h3>Set up your team</h3>
          <p class="hint" style="margin:0 0 12px">Choose the team password. Everything is locked with it, so make it long — four or five random words work well. You will share it with your players.</p>
          <input class="text-in lock-in" id="lock-pass" type="text" placeholder="New team password" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="New team password">
          <p class="hint" style="margin:14px 0 8px">GitHub key of ${esc(sync.owner)} (starts with ghp_). Needed once, only here — the others just need the password.</p>
          <input class="text-in lock-in" id="lock-token" type="password" placeholder="GitHub key" value="${esc(sync.token || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" data-enter="lockSetup" aria-label="GitHub key">
          ${note}
          <button class="primary" data-action="lockSetup" style="margin-top:14px" ${lock.busy ? 'disabled' : ''}>${lock.busy ? 'Locking…' : 'Lock and start'}</button>
        </section>`;
    }
    return `${head}
      <section class="card">
        <h3>Team password</h3>
        <p class="hint" style="margin:0 0 12px">Enter it once — this phone remembers it.</p>
        <input class="text-in lock-in" id="lock-pass" type="password" placeholder="Password" autocomplete="current-password" autocapitalize="off" spellcheck="false" data-enter="lockOpen" aria-label="Team password">
        ${note}
        <button class="primary" data-action="lockOpen" style="margin-top:14px" ${lock.busy ? 'disabled' : ''}>${lock.busy ? 'Opening…' : 'Open'}</button>
      </section>`;
  }
  async function checkGithubKey(key) {
    const r = await fetch(`${API()}/user`, { headers: ghHeaders(key), cache: 'no-store' });
    if (r.status === 401) return 'GitHub did not accept that key.';
    if (!r.ok) return syncError(r.status);
    const u = await r.json();
    if (String(u.login).toLowerCase() !== String(sync.owner).toLowerCase()) return `That key belongs to ${u.login}, not ${sync.owner}.`;
    return null;
  }
  const uiBusy = () => $('#modal-root').childElementCount > 0;

  /** Download the team data, merge it with this phone's, upload if this phone has news. */
  async function syncNow(manual = false) {
    if (!syncOn()) return;
    if (syncBusy) {
      syncAgain = true;
      return;
    }
    if (uiBusy()) {
      // never change data under an open dialog — try again in a moment
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => syncNow(manual), 3000);
      return;
    }
    if (navigator.onLine === false) {
      sync.error = 'Offline — will sync when back online.';
      updateSyncChips();
      return;
    }
    syncBusy = true;
    sync.lastTry = Date.now();
    updateSyncChips();
    try {
      const remote = await fetchTeamData();
      if (uiBusy()) {
        syncAgain = true;
        return;
      }
      let local = db;
      if (remote && !sync.adopted) local = Y.adoptRemoteIds(local, remote);
      const merged = remote ? Y.mergeData(local, remote) : local;
      if (Y.fingerprint(merged) !== Y.fingerprint(db) || merged !== db) {
        const changed = Y.fingerprint(merged) !== Y.fingerprint(db);
        db = merged;
        saveLocal();
        if (changed) softRender();
      }
      sync.adopted = true;
      // money rules saved by an older version (e.g. 5 € to the pot for a winner on 5 €): upgrade once, for the whole team
      if (C.upgradeRules(db.settings)) {
        markSettings();
        saveLocal();
        softRender();
      }
      if (canWrite() && Y.fingerprint(db) !== Y.fingerprint(remote)) await pushTeamData();
      sync.lastSync = Date.now();
      sync.error = null;
      if (manual) toast('☁️ Synced with the team');
    } catch (e) {
      if (e instanceof LockedOut) {
        lockOut(e.message);
        return;
      }
      sync.error = (e && e.message && !/fetch|network|load failed/i.test(e.message)) ? e.message : 'No connection to GitHub — trying again soon.';
      if (manual) toast(`⚠️ ${sync.error}`, 3500);
    } finally {
      syncBusy = false;
      saveSync();
      updateSyncChips();
      if (syncAgain) {
        syncAgain = false;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => syncNow(), 1500);
      }
    }
  }
  function scheduleSync() {
    if (!canWrite()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), 1200);
  }
  /** Redraw after new team data arrived — but not while someone is typing or a dialog is open. */
  function softRender() {
    const el = document.activeElement;
    const typing = el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && el.type !== 'checkbox';
    if (uiBusy() || typing) {
      renderPending = true;
      return;
    }
    render();
  }
  function startSync() {
    if (syncOn()) syncNow();
    setInterval(() => {
      if (!syncOn() || syncBusy || document.visibilityState !== 'visible') return;
      const gap = activeNight() ? 15000 : 60000; // faster while a game is on
      if (Date.now() - (sync.lastTry || 0) >= gap) syncNow();
    }, 5000);
    setInterval(updateSyncChips, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncNow();
    });
    window.addEventListener('online', () => syncNow());
    document.addEventListener('focusout', () => setTimeout(() => {
      if (renderPending) softRender();
    }, 150));
  }
  function agoTxt(t) {
    const sec = Math.round((Date.now() - t) / 1000);
    if (sec < 45) return 'just now';
    const min = Math.round(sec / 60);
    return min < 60 ? `${min} min ago` : DATE_TIME_FMT.format(new Date(t));
  }
  function syncChip() {
    if (!syncOn()) return '';
    let text;
    let kind = '';
    if (sync.error) {
      kind = 'err';
      text = `${IC.alert}Sync problem`;
    } else if (!sync.lastSync) text = `${IC.cloud}Connecting to the team…`;
    else text = `${IC.lock}Team sync · ${agoTxt(sync.lastSync)}`;
    return `<button class="sync-chip ${kind}" data-action="syncTap">${text}</button>`;
  }
  const syncBar = () => (syncOn() ? `<div class="sync-bar"><span class="sync-slot">${syncChip()}</span></div>` : '');
  function updateSyncChips() {
    document.querySelectorAll('.sync-slot').forEach((el) => {
      el.innerHTML = syncChip();
    });
  }

  function syncCard() {
    return `
      <section class="card" id="sync-card">
        <div class="card-head"><h3>${IC.lock}Team</h3><span class="sync-slot">${syncChip()}</span></div>
        <ul class="calc-lines">
          <li><span>Data</span><b>locked with the team password</b></li>
          <li><span>Last synced</span><b>${sync.lastSync ? DATE_TIME_FMT.format(new Date(sync.lastSync)) : 'not yet'}</b></li>
        </ul>
        ${sync.error ? `<p class="hint warn">${IC.alert} ${esc(sync.error)}</p>` : ''}
        <p class="hint">To add a phone: open the app there and type the team password. That is all.</p>
        <div class="btn-row"><button class="secondary" data-action="syncManual">${IC.sync}Sync now</button><button class="secondary" data-action="changePassword">${IC.lock}Password</button></div>
        <div class="btn-row" style="margin-bottom:0"><button class="ghost" data-action="replaceKey">Replace GitHub key</button><button class="ghost" data-action="lockPhone">Sign out this phone</button></div>
      </section>`;
  }

  /* ================= rendering ================= */
  const DRAFT_KEY = `${KEY}.draft`;
  function keepDraft() {
    try {
      if (ui.draft && activeNight()) localStorage.setItem(DRAFT_KEY, JSON.stringify(ui.draft));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (_) { /* not important */ }
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      const night = activeNight();
      if (d && night && d.nightId === night.id && Array.isArray(d.order)) ui.draft = d;
    } catch (_) { /* ignore */ }
  }

  function render(opts = {}) {
    renderPending = false;
    keepDraft();
    const app = $('#app');
    if (!syncOn()) {
      // locked: nothing of the team is shown without the password
      const keep = {};
      app.querySelectorAll('.lock-in').forEach((el) => { keep[el.id] = el.value; });
      app.innerHTML = `<div class="lock-screen">${renderLock()}</div>`;
      app.querySelectorAll('.lock-in').forEach((el) => { if (keep[el.id]) el.value = keep[el.id]; });
      $('#tabbar').innerHTML = '';
      return;
    }
    let html = '';
    if (ui.tab === 'play') html = renderPlay();
    else if (ui.tab === 'rankings') html = renderRankings();
    else if (ui.tab === 'history') html = renderHistory();
    else if (ui.tab === 'players') html = renderPlayers();
    else html = renderSettings();
    // keep sideways scroll positions (wide tables) when the screen is redrawn
    const keep = {};
    app.querySelectorAll('[data-keep]').forEach((el) => { keep[el.dataset.keep] = el.scrollLeft; });
    app.innerHTML = `<div class="${opts.animate ? 'view-enter' : ''}">${html}</div>`;
    app.querySelectorAll('[data-keep]').forEach((el) => { if (keep[el.dataset.keep]) el.scrollLeft = keep[el.dataset.keep]; });
    renderTabbar();
    drawCharts();
    if (opts.top) window.scrollTo({ top: 0 });
  }

  /* ---------- charts: drawn once the screen is on the page, at its real width ---------- */
  const chartJobs = {};
  function drawCharts(onlyResized = false) {
    document.querySelectorAll('[data-chart]').forEach((host) => {
      const job = chartJobs[host.dataset.chart];
      if (!job) return;
      const w = String(host.clientWidth);
      if (onlyResized && host.dataset.w === w) return;
      host.dataset.w = w;
      K.lineChart(host, job);
    });
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => drawCharts(true), 150);
  });
  const go = (patch) => {
    Object.assign(ui, patch);
    render({ animate: true, top: true });
  };

  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="11" height="15" rx="2"/><path d="M9.5 3.6l8.7 2.3a2 2 0 0 1 1.4 2.5l-3 11.4"/><path d="M8.5 11.2c-1.4 1.3-2.4 2.2-2.4 3.4a1.3 1.3 0 0 0 2.4.7 1.3 1.3 0 0 0 2.4-.7c0-1.2-1-2.1-2.4-3.4z"/></svg>',
    rankings: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 16.5V21M7 4h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/></svg>',
    history: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3v3H8z"/></svg>',
    players: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 6.2"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  };
  function renderTabbar() {
    const tabs = [['play', 'Play'], ['rankings', 'Rankings'], ['history', 'History'], ['players', 'Players'], ['settings', 'Settings']];
    const live = !!activeNight();
    $('#tabbar').innerHTML = `<div class="tabbar-in">${tabs
      .map(([k, label]) => `<button class="${ui.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}" aria-label="${label}" ${ui.tab === k ? 'aria-current="page"' : ''}>${ICONS[k]}<span>${label}</span>${k === 'play' && live && ui.tab !== 'play' ? '<i class="dot"></i>' : ''}</button>`)
      .join('')}</div>`;
  }

  /* ---------- PLAY tab ---------- */
  function renderPlay() {
    const night = activeNight();
    if (night) return ui.view === 'bill' && canScore(night) ? renderBill(night) : renderGame(night);
    if (ui.view === 'setup' && ui.setup) return renderSetup();
    if (ui.view === 'report' && ui.reportId && nightById(ui.reportId)) return renderReport(nightById(ui.reportId), true);
    return renderHome();
  }

  function renderHome() {
    const finished = finishedNights();
    const last = finished[0];
    const lastSum = last && C.nightSummary(last);
    const month = monthStandings();
    const totalRounds = finished.reduce((a, n) => a + n.rounds.length, 0);
    const totalPot = finished.reduce((a, n) => a + C.nightSummary(n).potTotal, 0);
    const bills = C.billStats(finished);
    const needBackup = finished.length >= 3 && (!db.lastBackup || Date.now() - db.lastBackup > 30 * 864e5);
    const installHint = !isStandalone() && isIOS();
    return `
      ${logo()}
      ${syncBar()}
      <button class="cta" data-action="newNight">
        <span class="cta-chip" aria-hidden="true"><span>♠</span></span>
        <span class="cta-txt"><b>Start tonight</b><small>Pick the players and deal the first round</small></span>
        <span class="cta-go" aria-hidden="true">${IC.chevR}</span>
      </button>

      ${installHint ? `<section class="card notice"><span class="ico">${IC.phone}</span><div><b>Install on your iPhone</b><p>Tap <b>Share</b> then <b>Add to Home Screen</b>.</p></div></section>` : ''}
      ${needBackup ? `<section class="card notice"><span class="ico">${IC.download}</span><div style="flex:1"><b>Save a backup</b><p>Keep your history safe — takes 2 seconds.</p></div><button class="link" data-action="exportData">Backup</button></section>` : ''}

      ${last && lastSum.champions.length ? `
      <button class="card hero" data-action="openNight" data-id="${last.id}" aria-label="Last champion: ${esc(namesJoin(lastSum.champions))}, ${fmtDate(last.date)}. Open the night">
        <span class="hero-rays" aria-hidden="true"></span>
        <span class="eyebrow">${IC.crown}Last champion · ${DAYMON_FMT.format(toDate(last.date))}</span>
        <span class="hero-row">
          <span class="hero-avs">${lastSum.champions.map((id) => avatar(id, 'lg')).join('')}</span>
          <span class="hero-txt"><b>${esc(namesJoin(lastSum.champions))}</b><small>${ptsTxt(lastSum.players[0].pts)} points · ${plural(lastSum.players[0].roundsWon, 'round')} won</small></span>
          <span class="hero-go" aria-hidden="true">${IC.chevR}</span>
        </span>
      </button>` : ''}

      <section class="card">
        <div class="card-head"><h3>${MONTH_FMT.format(new Date())}</h3><button class="link" data-action="openRanking">Full ranking${IC.chevR}</button></div>
        ${month.length ? `<div class="mini-board">${month.slice(0, 5).map((p, i) => `
          <button class="row" data-action="showPlayer" data-id="${p.playerId}" data-scope="month" style="--i:${i}">
            <span class="rk">${medal(p.rank)}</span>
            ${avatar(p.playerId)}
            <span class="nm"><span class="name">${nameOf(p.playerId)}${p.provisional ? '<i class="tag">new</i>' : ''}</span><small>${plural(p.roundsPlayed, 'round')} · ${plural(p.roundsWon, 'win')} · <span class="${cls(p.total)}">${moneyHtml(p.total, true)}</span></small></span>
            <span class="crowns" title="Champion nights">${crowns(p.champions)}</span>
            <span class="score">${fairTxt(p.fair)}<small>fair pts</small></span>
          </button>`).join('')}</div>` : `<div class="empty"><span class="big">🂡</span>No finished nights this month yet.<br>Start one and crown a champion!</div>`}
      </section>

      <div class="tiles">
        <div class="tile"><span class="t-ico">${IC.calendar}</span><small>Nights</small><b>${finished.length}</b></div>
        <div class="tile"><span class="t-ico">${IC.cards}</span><small>Rounds</small><b>${totalRounds}</b></div>
        <div class="tile"><span class="t-ico">${IC.pot}</span><small>Pot collected</small><b>${esc(money(totalPot))}</b></div>
        <div class="tile"><span class="t-ico">${IC.bill}</span><small>Bills paid</small><b>${esc(money(bills.totals.invoice))}</b></div>
      </div>`;
  }

  function monthStandings() {
    const range = C.periodRange('month', 0);
    return C.sortStandings(C.aggregate(finishedNights().filter((n) => C.inRange(n.date, range))), 'fair');
  }

  /* ---------- new night setup ---------- */
  function renderSetup() {
    const st = ui.setup;
    if (st.step === 1) {
      return `
        ${logo(true)}
        <section class="card" style="text-align:center">
          <h2 class="page-title">How many are we tonight?</h2>
          <div class="counter">
            <button data-action="setupCount" data-d="-1" aria-label="Fewer players">−</button>
            <output aria-live="polite">${st.count}</output>
            <button data-action="setupCount" data-d="1" aria-label="More players">+</button>
          </div>
          <div class="quick-count">${[2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((n) => `<button class="${st.count === n ? 'on' : ''}" data-action="setupSet" data-n="${n}">${n}</button>`).join('')}</div>
        </section>
        <div class="stack">
          <button class="primary" data-action="setupNext">Next: who's playing? →</button>
          <button class="ghost" data-action="setupCancel">Cancel</button>
        </div>`;
    }
    const list = playersByRecent();
    const n = st.selected.length;
    const ready = n === st.count;
    return `
      <h2 class="page-title">Who's playing? <span class="badge ${ready ? 'ok' : ''}">${n} / ${st.count}</span></h2>
      <p class="page-sub">Tap saved players or add a new name — new players are remembered for next time.</p>
      <section class="card">
        <div class="add-row">
          <input class="text-in" id="setup-name" placeholder="New player name" maxlength="24" autocomplete="off" value="${esc(st.newName)}" data-input="setupName" data-enter="setupAdd" aria-label="New player name">
          <button class="secondary" data-action="setupAdd">Add</button>
        </div>
        ${list.length ? `<div class="pick-grid">${list.map((p) => {
          const i = st.selected.indexOf(p.id);
          return `<button class="ptile ${i >= 0 ? 'on' : ''}" data-action="setupPick" data-id="${p.id}" aria-pressed="${i >= 0}">
            ${i >= 0 ? `<span class="seat">${i + 1}</span>` : ''}${avatar(p.id, 'lg')}<span class="pname">${esc(p.name)}</span></button>`;
        }).join('')}</div>` : '<div class="empty">No saved players yet — add the first name above.</div>'}
      </section>
      <div class="stack">
        <button class="primary" data-action="startNight" ${ready ? '' : 'disabled'}>${ready ? `${IC.cards}Shuffle up &amp; deal` : `Pick ${st.count - n > 0 ? st.count - n + ' more' : n - st.count + ' fewer'}`}</button>
        <button class="ghost" data-action="setupBack">← Back</button>
      </div>`;
  }

  /* ---------- the game (rounds) ---------- */
  function lastPoints(night) {
    if (night.rounds.length) return night.rounds[night.rounds.length - 1].points;
    return S().stakePicks[0] || 1;
  }
  function draftFor(night) {
    if (!ui.draft || ui.draft.nightId !== night.id) {
      ui.draft = { nightId: night.id, points: lastPoints(night), amounts: {}, out: {}, order: [] };
    }
    const d = ui.draft;
    const seated = seatedIds(night);
    d.order = d.order.filter((id) => seated.includes(id) && !d.out[id]);
    return d;
  }
  /** Everything the round screen needs, computed once. */
  function roundState(night) {
    const d = draftFor(night);
    const s = S();
    const full = C.fullAmount(d.points, s);
    const active = seatedIds(night).filter((id) => !d.out[id]);
    const remaining = active.filter((id) => !d.order.includes(id));
    const complete = active.length >= 2 && remaining.length <= 1;
    const order = complete ? d.order.concat(remaining) : d.order.slice();
    const amounts = {};
    for (const id of active) amounts[id] = d.amounts[id] != null ? d.amounts[id] : full;
    const preview = complete ? C.buildRound(d.points, order, amounts, s) : null;
    return { d, s, full, active, remaining, complete, order, amounts, preview };
  }

  function renderWatch(night) {
    const sum = C.nightSummary(night);
    return `
      ${syncBar()}
      <div class="game-top">
        <div><span class="eyebrow"><span class="live-dot"></span>Live · ${fmtDate(night.date)}</span><h2>Round ${night.rounds.length + 1}</h2></div>
        <div class="pills"><span class="pill">${IC.pot}Pot <b>${moneyHtml(sum.potTotal)}</b></span><span class="pill">${IC.table}Table <b>${moneyHtml(sum.tableTotal)}</b></span></div>
      </div>
      <section class="card notice"><span class="ico">${IC.eye}</span><div><b>Following the team's game live</b><p>New rounds appear by themselves. To enter rounds on this phone, add the team key in Settings.</p></div></section>
      ${scoreboard(night, sum)}
      ${roundsCard(night, false)}`;
  }

  function scoreboard(night, sum) {
    return `
      <section class="card">
        <div class="card-head"><h3>Tonight's table</h3><span class="muted">${plural(night.rounds.length, 'round')}</span></div>
        <div class="board">${sum.players.map((p) => `
          <div class="board-row ${p.left ? 'is-left' : ''}">
            <span class="rk">${night.rounds.length ? medal(p.rank) : '<span class="rnum">·</span>'}</span>
            ${avatar(p.playerId)}
            <span class="nm"><span class="name">${nameOf(p.playerId)}${sum.champions.includes(p.playerId) ? IC.crown : ''}${p.left ? `<i class="tag">${p.leftOut ? 'out' : 'left'}</i>` : ''}</span>
              <small>${p.left ? `${leftTxt(p.leftAfter, p.leftOut)}${leftMoneyTxt(p.leftPot, p.leftPaid) ? ` · ${esc(leftMoneyTxt(p.leftPot, p.leftPaid))}` : ''} · ` : ''}${p.start ? `${ptsTxt(p.start)} start pts · ` : ''}${plural(p.roundsWon, 'win')} · money <span class="${cls(p.net)}">${moneyHtml(p.net, true)}</span> after fees</small></span>
            <span class="score">${ptsTxt(p.pts)}<small>pts</small></span>
          </div>`).join('')}</div>
      </section>`;
  }

  /** Rounds and late joins in order (newest first while playing). */
  function roundsCard(night, editable) {
    const items = night.rounds.map((r, i) => ({ key: i + 1, html: roundRow(r, i, editable) }));
    for (const j of night.joins || []) items.push({ key: (j.afterRound || 0) + 0.5, html: joinRow(j, editable) });
    for (const [, l] of C.leavesBy(night)) items.push({ key: (l.afterRound || 0) + 0.75, html: leaveRow(l, editable) });
    if (!items.length) return '';
    items.sort((a, b) => a.key - b.key);
    if (editable) items.reverse();
    return `
      <section class="card">
        <h3>Rounds</h3>
        ${items.map((x) => x.html).join('')}
      </section>`;
  }
  function joinRow(j, editable) {
    return `<div class="round-row join-row">
      <div class="round-no">${IC.join}<small>joined</small></div>
      <div class="round-main"><b>${avatar(j.playerId, 'sm')} ${nameOf(j.playerId)} joined after round ${j.afterRound}</b>
        <small>started with ${ptsTxt(j.pts)} pts</small></div>
      ${editable ? `<button class="icon-btn" data-action="editJoin" data-id="${j.id}" aria-label="Change starting points of ${nameOf(j.playerId)}">${IC.edit}</button>` : ''}
    </div>`;
  }
  function leaveRow(l, editable) {
    return `<div class="round-row join-row leave-row">
      <div class="round-no">${IC.door}<small>${l.out ? 'out' : 'left'}</small></div>
      <div class="round-main"><b>${avatar(l.playerId, 'sm')} ${nameOf(l.playerId)} ${leftTxt(l.afterRound, l.out)}</b>
        <small>${Number(l.pot) > 0 ? `put ${moneyHtml(l.pot)} in the pot · ` : ''}${Number(l.paid) > 0 ? `paid ${moneyHtml(l.paid)} toward the bill · ` : ''}not in the bill split</small></div>
      ${editable ? `<button class="icon-btn" data-action="editLeave" data-id="${l.id}" aria-label="Change what ${nameOf(l.playerId)} paid">${IC.edit}</button>
        <button class="icon-btn" data-action="undoLeave" data-id="${l.id}" aria-label="${nameOf(l.playerId)} is back at the table">${IC.undo}</button>` : ''}
    </div>`;
  }

  function renderGame(night) {
    if (!canScore(night)) return renderWatch(night);
    const rs = roundState(night);
    const { d, s, full, active, remaining, complete, preview } = rs;
    const sum = C.nightSummary(night);
    const roundNo = night.rounds.length + 1;
    const picks = s.stakePicks.length ? s.stakePicks : [1, 2, 3];
    const customPts = !picks.includes(d.points);

    const chip = (p, i) => `<button class="pchip ${d.points === p ? 'sel' : ''}" data-action="setPoints" data-v="${p}" aria-pressed="${d.points === p}" aria-label="${p} points">
        <span class="disc" style="--c:${CHIP_COLORS[i % CHIP_COLORS.length]}"><b>${p}</b></span><small>${moneyHtml(C.fullAmount(p, s))}</small></button>`;

    const quick = (s.quickAmounts || []).filter((q) => q > 0 && q < full);
    const betRow = (id) => {
      const out = !!d.out[id];
      const v = d.amounts[id];
      const isFull = !out && (v == null || v === full);
      const isCustom = !out && v != null && v !== full && !quick.includes(v);
      return `<div class="bet ${out ? 'is-out' : ''}">
        <div class="bet-who">${avatar(id, 'sm')}<b>${nameOf(id)}</b><span class="bet-amt">${out ? 'sits out' : `plays ${moneyHtml(v != null ? v : full)}`}</span></div>
        <div class="seg" role="group" aria-label="Money for ${nameOf(id)}">
          ${quick.map((q) => `<button class="${!out && v === q ? 'on' : ''}" data-action="setAmt" data-id="${id}" data-v="${q}">${q}</button>`).join('')}
          <button class="wide ${isFull ? 'on' : ''}" data-action="setAmt" data-id="${id}" data-v="full">Full ${C.r2(full)}</button>
          <button class="${isCustom ? 'on' : ''}" data-action="setAmt" data-id="${id}" data-v="custom" aria-label="Other amount">${isCustom ? C.r2(v) : IC.edit}</button>
          <button class="out ${out ? 'on' : ''}" data-action="setAmt" data-id="${id}" data-v="out">Out</button>
        </div>
      </div>`;
    };

    const n = active.length;
    const tile = (id) => {
      const idx = d.order.indexOf(id);
      const autoLast = idx < 0 && complete && remaining.length === 1;
      const place = idx >= 0 ? idx + 1 : autoLast ? n : null;
      const p = place ? C.r2((n - place + 1) * d.points) : null;
      return `<button class="ptile ${place === 1 ? 'first' : ''} ${place ? 'placed' : ''} ${autoLast ? 'auto' : ''}" data-action="tapOrder" data-id="${id}" aria-label="${nameOf(id)}${place ? `, place ${place}` : ''}">
        ${place ? `<span class="place p${Math.min(place, 4)}">${place}</span>` : ''}
        ${avatar(id, 'lg')}<span class="pname">${nameOf(id)}</span>
        ${place ? `<span class="ppts">+${ptsTxt(p)} pts${autoLast ? ' · last' : ''}</span>` : `<span class="ppts wait">tap → ${ordinal(d.order.length + 1)}</span>`}
      </button>`;
    };

    let previewHtml;
    if (n < 2) previewHtml = '<span class="warn">At least 2 players must play this round.</span>';
    else if (!complete) {
      previewHtml = d.order.length
        ? `<span>${medal(1)} <b>${nameOf(d.order[0])}</b> wins · tap the rest in order (${remaining.length - 1} more)</span>`
        : '<span>Tap who won, then 2nd, 3rd … down to last</span>';
    } else {
      const w = preview.results[0];
      previewHtml = `<span>${medal(1)} <b>${nameOf(w.playerId)}</b> +${ptsTxt(w.pts)} pts · wins <b class="pos">${moneyHtml(w.won)}</b></span>
        <span>pays ${moneyHtml(w.table)} table + ${moneyHtml(w.pot)} pot → <b class="${cls(w.won - w.table - w.pot)}">${moneyHtml(w.won - w.table - w.pot, true)}</b></span>`;
    }

    return `
      ${syncBar()}
      <div class="game-top">
        <div><span class="eyebrow">Tonight · ${fmtDate(night.date)}</span><h2>Round ${roundNo}</h2></div>
        <div class="pills"><span class="pill">${IC.pot}Pot <b>${moneyHtml(sum.potTotal)}</b></span><span class="pill">${IC.table}Table <b>${moneyHtml(sum.tableTotal)}</b></span></div>
      </div>

      <section class="card">
        <h3 class="step"><i>1</i>How many points this round?</h3>
        <div class="chips">
          ${picks.map(chip).join('')}
          <button class="pchip ${customPts ? 'sel' : ''}" data-action="customPoints" aria-label="Other number of points">
            <span class="disc" style="--c:#6b6b78"><b>${customPts ? d.points : '✎'}</b></span><small>${customPts ? moneyHtml(full) : 'other'}</small></button>
        </div>
        <p class="hint">1 point = <b>${moneyHtml(s.pointValue)}</b> · this round full = <b>${moneyHtml(full)}</b> · winner gets <b>${ptsTxt(n * d.points)}</b> pts, last gets <b>${ptsTxt(d.points)}</b></p>
      </section>

      <section class="card">
        <h3 class="step"><i>2</i>How much money does each player play?</h3>
        <div class="bets">${seatedIds(night).map(betRow).join('')}</div>
        <p class="hint">Money never changes points — only your place does. You lose at most what you play, and at most what the winner played.</p>
      </section>

      <section class="card" id="order-card">
        <div class="card-head" style="margin-bottom:0"><h3 class="step"><i>3</i>Who finished where?</h3>${d.order.length ? '<button class="link" data-action="clearOrder">Reset</button>' : ''}</div>
        <div class="order-grid">${active.map(tile).join('')}</div>
      </section>

      <div class="savebar" id="savebar">
        <div class="preview">${previewHtml}</div>
        <button class="primary" data-action="saveRound" ${complete ? '' : 'disabled'}>Save round ${roundNo} ✓</button>
      </div>

      ${scoreboard(night, sum)}

      ${roundsCard(night, true)}

      <div class="btn-row">
        <button class="secondary" data-action="addLate">${IC.join}Player joins</button>
        <button class="secondary" data-action="leavePlayer">${IC.door}Player leaves</button>
      </div>
      <button class="danger" data-action="finishNight">${IC.flag}We're done — the bill</button>
      ${outNow(night).length ? `<p class="hint center">Marked <b>Out</b> at the end = not in the bill: ${esc(namesJoin(outNow(night)))}.</p>` : ''}`;
  }

  function roundRow(r, i, deletable) {
    const w = r.results[0];
    const others = r.results.slice(1).map((x) => `${esc(P(x.playerId).name)} ${x.place}. −${C.r2(x.lost)}`).join(' · ');
    return `<div class="round-row">
      <div class="round-no">R${i + 1}<small>${ptsTxt(r.points)} pt${r.points === 1 ? '' : 's'}</small></div>
      <div class="round-main"><b>${medal(1)} ${nameOf(w.playerId)} +${ptsTxt(w.pts)} pts · <span class="pos">${moneyHtml(w.won, true)}</span></b>
        <small>played ${moneyHtml(w.played)} · table ${moneyHtml(w.table)} · pot ${moneyHtml(w.pot)}</small>
        <small>${others}</small></div>
      ${deletable ? `<button class="icon-btn" data-action="deleteRound" data-id="${r.id}" aria-label="Delete round ${i + 1}">${IC.x}</button>` : ''}
    </div>`;
  }

  /* ---------- the bill ---------- */
  /** The bill as typed so far (amount, table money, extra money), split the way it would be saved. */
  function billDraft(night) {
    const sum = C.nightSummary(night);
    const typed = parseNum(ui.billInput);
    const payers = sum.players.filter((p) => !p.left).length;
    const bill = { invoice: Number.isFinite(typed) ? typed : 0, shares: C.sharesFor(payers, S()), tableToInvoice: ui.billTable, extras: ui.billExtras };
    return { sum, bill, plan: C.billPlan(sum, bill) };
  }
  /** Bill − what is already paid = what the ranking split pays; one row per player at the table. */
  function billLines(plan) {
    return `
      <ul class="calc-lines">
        <li><span>Bill</span><b>${moneyHtml(plan.invoice)}</b></li>
        <li><span>− Pot${plan.leftPotTotal > 0 ? ` <small>incl. ${moneyHtml(plan.leftPotTotal)} from players leaving</small>` : ''}</span><b>${moneyHtml(plan.potTotal)}</b></li>
        ${plan.tableToInvoice ? `<li><span>− Table money</span><b>${moneyHtml(plan.tableUsed)}</b></li>` : ''}
        ${plan.leavers.filter((l) => l.paid > 0).map((l) => `<li><span>− ${nameOf(l.playerId)} <small>paid when leaving</small></span><b>${moneyHtml(l.paid)}</b></li>`).join('')}
        ${plan.extras.map((e) => `<li><span>− ${nameOf(e.playerId)} <small>extra</small></span><b>${moneyHtml(e.amount)}</b></li>`).join('')}
        <li class="total"><span>Split by ranking</span><b>${moneyHtml(plan.remaining)}</b></li>
        ${plan.leftover > 0 ? `<li><span>Left over</span><b class="pos">${moneyHtml(plan.leftover)}</b></li>` : ''}
      </ul>`;
  }
  /** A thin bar: how this bill was paid (pot, table, leaving, extra, players). */
  function billBar(parts, tall = false) {
    const shown = parts.filter((p) => p.v > 0);
    const whole = shown.reduce((a, p) => a + p.v, 0);
    if (!whole) return '';
    const label = shown.map((p) => `${p.label} ${money(p.v)}`).join(', ');
    return `<div class="${tall ? 'seg-tall' : 'seg-thin'}" role="img" aria-label="${esc(label)}">${shown.map((p) => {
      const share = p.v / whole;
      return `<span style="flex:${share.toFixed(4)};background:${p.c}" title="${esc(`${p.label}: ${money(p.v)}`)}">${tall && share >= 0.14 ? `<b>${Math.round(share * 100)}%</b>` : ''}</span>`;
    }).join('')}</div>`;
  }
  const billParts = (x) => [
    { k: 'pot', label: 'Pot', v: x.pot, c: K.PALETTE[0] },
    { k: 'table', label: 'Table money', v: x.table, c: K.PALETTE[1] },
    { k: 'left', label: 'Paid when leaving', v: x.left, c: K.PALETTE[2] },
    { k: 'extras', label: 'Extra money', v: x.extras, c: K.PALETTE[3] },
    { k: 'players', label: 'Players by ranking', v: x.players, c: K.PALETTE[4] },
  ];
  const planParts = (plan) => billParts({ pot: plan.potTotal, table: plan.tableUsed, left: plan.leftTotal, extras: plan.extrasTotal, players: plan.remaining });
  function billLegend(parts) {
    return `<div class="legend static">${parts.filter((p) => p.v > 0).map((p) => `<span class="lg-item"><i class="sq" style="background:${p.c}"></i>${p.label} <b>${moneyHtml(p.v)}</b></span>`).join('')}</div>`;
  }

  function billPreview(night) {
    const { plan, bill } = billDraft(night);
    const canTakeOut = plan.payers > 1;
    return `
      <h3>${IC.bill}The split</h3>
      ${billLines(plan)}
      ${billBar(planParts(plan))}
      <p class="hint">${plural(plan.payers, 'player')} in the bill → last place pays ${bill.shares.map((x) => `${x}%`).join(' · ')}. Tied players share equally.${plan.leavers.length ? ` Not in the bill: ${esc(namesJoin(plan.leavers.map((l) => l.playerId)))}.` : ''}</p>
      ${plan.payers ? `<div class="pay-list">${plan.lines.map((l) => `
        <div class="pay-row ${l.amount > 0 ? '' : 'free'}">
          ${avatar(l.playerId, 'sm')}
          <span class="nm"><span class="name">${nameOf(l.playerId)}${l.tied ? '<span class="tie-tag">tied</span>' : ''}</span><small>${ordinal(l.rank)} place</small></span>
          <span class="pct">${pctTxt(l.pct)}</span>
          <span class="amt">${l.amount > 0 ? moneyHtml(l.amount) : '—'}</span>
          ${canTakeOut ? `<button class="icon-btn sm" data-action="leavePlayer" data-id="${l.playerId}" aria-label="Take ${nameOf(l.playerId)} out of the bill">${IC.x}</button>` : ''}
        </div>`).join('')}</div>
        ${canTakeOut ? `<p class="hint">${IC.x} takes someone out of the bill (they left, or don't pay tonight).</p>` : ''}` : '<p class="hint warn">Nobody is left at the table to pay the rest.</p>'}`;
  }

  function renderBill(night) {
    const sum = C.nightSummary(night);
    const leaves = C.leavesBy(night);
    const leavers = sum.players.filter((p) => p.left);
    return `
      <h2 class="page-title">That's it for tonight</h2>
      <p class="page-sub">${plural(night.rounds.length, 'round')} played · pot ${moneyHtml(sum.potTotal)} · table ${moneyHtml(sum.tableTotal)}</p>
      <section class="card">
        <h3>${IC.bill}How much is the bill?</h3>
        <div class="money-in" style="margin-top:10px">
          <input id="bill-input" inputmode="decimal" placeholder="0" value="${esc(ui.billInput)}" data-input="bill" data-enter="confirmBill" aria-label="Bill amount">
          <span>${esc(S().currency)}</span>
        </div>
        <label class="check"><input type="checkbox" data-change="billTable" ${ui.billTable ? 'checked' : ''}> Also use the table money (${moneyHtml(sum.tableTotal)}) for the bill</label>
      </section>

      <section class="card">
        <div class="card-head"><h3>${IC.door}Not in the bill</h3><button class="link" data-action="leavePlayer">${IC.plus}Take out</button></div>
        ${leavers.length ? leavers.map((p) => {
          const l = leaves.get(p.playerId);
          return `<div class="pay-row">
            ${avatar(p.playerId, 'sm')}
            <span class="nm"><span class="name">${nameOf(p.playerId)}</span><small>${leftTxt(p.leftAfter, p.leftOut)} · ${esc(leftMoneyTxt(p.leftPot, p.leftPaid) || 'paid nothing')}</small></span>
            <span class="amt">${moneyHtml(C.r2(p.leftPot + p.leftPaid))}</span>
            <button class="icon-btn" data-action="editLeave" data-id="${l.id}" aria-label="Change what ${nameOf(p.playerId)} paid">${IC.edit}</button>
            <button class="icon-btn" data-action="undoLeave" data-id="${l.id}" aria-label="Put ${nameOf(p.playerId)} back in the bill">${IC.undo}</button>
          </div>`;
        }).join('') : '<p class="muted">Everybody at the table is in the bill.</p>'}
        <p class="hint">Players who left, or were still marked <b>Out</b> when you finished. They are left out of the split. What they put in the pot or paid toward the bill comes off the bill. ${IC.edit} changes it, ${IC.undo} puts someone back in.</p>
      </section>

      <section class="card">
        <div class="card-head"><h3>${IC.plusCircle}Extra money</h3><button class="link" data-action="addExtra">${IC.plus}Add</button></div>
        ${ui.billExtras.length ? ui.billExtras.map((e, i) => `<div class="pay-row">
            ${avatar(e.playerId, 'sm')}
            <span class="nm"><span class="name">${nameOf(e.playerId)}</span><small>paid extra toward the bill</small></span>
            <span class="amt">${moneyHtml(e.amount)}</span>
            <button class="icon-btn" data-action="removeExtra" data-i="${i}" aria-label="Remove the extra money of ${nameOf(e.playerId)}">${IC.x}</button>
          </div>`).join('') : '<p class="muted">Nobody paid extra.</p>'}
        <p class="hint">Extra money comes off the bill for everyone, like the pot. The rest is split by ranking.</p>
      </section>

      <section class="card" id="bill-preview">${billPreview(night)}</section>
      <div class="stack">
        <button class="primary" data-action="confirmBill">${IC.crown}Crown the champion</button>
        <button class="ghost" data-action="backToGame">${IC.chevL}Back to the table</button>
      </div>`;
  }

  /* ---------- night report ---------- */
  function renderReport(night, fresh) {
    const sum = C.nightSummary(night);
    const plan = night.bill ? C.billPlan(sum, night.bill) : null;
    const billBy = plan ? plan.byPlayer : {};
    const champs = sum.champions;
    const canReopen = !activeNight();
    return `
      ${fresh ? '' : `<button class="link back" data-action="closeNight">${IC.chevL}All nights</button>`}
      <div class="champ-banner">
        <div class="rays"></div>
        <span class="eyebrow">${champs.length > 1 ? 'Champions' : 'Champion'} of the night · ${fmtDate(night.date)}</span>
        ${champs.length ? `${CROWN}<div class="avs">${champs.map((id) => avatar(id, 'xl')).join('')}</div>
          <h2>${esc(namesJoin(champs))}</h2>
          <p class="champ-pts">${ptsTxt(sum.players[0].pts)} points · ${plural(sum.players[0].roundsWon, 'round')} won</p>`
          : '<h2>No champion</h2><p class="champ-pts">Everyone finished level.</p>'}
      </div>

      <section class="card">
        <h3>${IC.bill}The bill</h3>
        ${plan ? `
        ${billLines(plan)}
        ${billBar(planParts(plan))}
        ${billLegend(planParts(plan))}
        ${plan.lines.filter((l) => l.amount > 0).map((l) => `
          <div class="pay-row">${avatar(l.playerId, 'sm')}<span class="nm"><span class="name">${nameOf(l.playerId)}${l.tied ? '<span class="tie-tag">tied</span>' : ''}</span><small>${ordinal(l.rank)} place</small></span>
          <span class="pct">${pctTxt(l.pct)}</span><span class="amt">${moneyHtml(l.amount)}</span></div>`).join('')}
        ${plan.leavers.length ? `<p class="hint">Not in the bill: ${plan.leavers.map((l) => `${nameOf(l.playerId)}${leftMoneyTxt(l.pot, l.paid) ? ` (${esc(leftMoneyTxt(l.pot, l.paid))})` : ''}`).join(', ')}.</p>` : ''}`
          : '<p class="muted">No bill was entered for this night.</p>'}
        ${!plan || plan.tableToInvoice ? '' : `<p class="hint">Table money collected: <b>${moneyHtml(sum.tableTotal)}</b></p>`}
      </section>

      <section class="card">
        <h3>${IC.updown}Who won, who lost</h3>
        ${sum.players.map((p) => {
          const bill = billBy[p.playerId] || 0;
          const total = C.r2(p.net - bill);
          return `<div class="res ${champs.includes(p.playerId) ? 'is-champ' : ''}">
            <div class="res-head"><span class="rk">${medal(p.rank)}</span>${avatar(p.playerId)}
              <span class="nm"><span class="name">${nameOf(p.playerId)}${champs.includes(p.playerId) ? IC.crown : ''}${p.left ? `<i class="tag">${p.leftOut ? 'out' : 'left'}</i>` : ''}</span><small>${plural(p.roundsWon, 'round')} won of ${p.roundsPlayed}${p.start ? ` · joined late with ${ptsTxt(p.start)} pts` : ''}${p.left ? ` · ${leftTxt(p.leftAfter, p.leftOut)}` : ''}</small></span>
              <span class="res-pts">${ptsTxt(p.pts)}<small>pts</small></span></div>
            <div class="res-grid">
              <div><small>Won</small><b class="${p.won ? 'pos' : 'zero'}">${moneyHtml(p.won, true)}</b></div>
              <div><small>Lost</small><b class="${p.lost ? 'neg' : 'zero'}">${moneyHtml(-p.lost)}</b></div>
              <div><small>Table+pot</small><b class="${p.fees ? 'neg' : 'zero'}">${moneyHtml(-p.fees)}</b></div>
              <div><small>Bill</small><b class="${bill ? 'neg' : 'zero'}">${moneyHtml(-bill)}</b></div>
            </div>
            <div class="res-total"><span>Tonight overall</span><b class="${cls(total)}">${moneyHtml(total, true)}</b></div>
          </div>`;
        }).join('')}
      </section>

      <details class="card">
        <summary>All ${plural(night.rounds.length, 'round')}</summary>
        ${roundsCard(night, false).replace(/<section class="card">\s*<h3>Rounds<\/h3>|<\/section>\s*$/g, '')}
      </details>

      <div class="stack">
        <button class="primary" data-action="shareNight" data-id="${night.id}">${IC.share}Share the report</button>
        ${fresh ? '<button class="secondary" data-action="doneReport">Done</button>' : ''}
        <div class="btn-row" style="margin:0">
          <button class="ghost" data-action="reopenNight" data-id="${night.id}" ${canReopen ? '' : 'disabled title="Finish the current night first"'}>${IC.undo}Reopen</button>
          <button class="danger" data-action="deleteNight" data-id="${night.id}">${IC.trash}Delete</button>
        </div>
      </div>`;
  }

  /* ---------- RANKINGS tab ---------- */
  function periodLabel(range) {
    if (range.type === 'all') return 'All time';
    if (range.type === 'year') return String(range.startDate.getFullYear());
    if (range.type === 'month') return MONTH_FMT.format(range.startDate);
    const endIncl = new Date(range.endDate.getFullYear(), range.endDate.getMonth(), range.endDate.getDate() - 1);
    return `${DAYMON_FMT.format(range.startDate)} – ${DAYMONYEAR_FMT.format(endIncl)}`;
  }
  const RANK_KINDS = [
    ['fair', 'Fair', 'fair points'],
    ['points', 'Overall', 'game points'],
    ['champions', 'Champions', 'crowns'],
  ];
  const RANK_HINT = {
    fair: '<b>Fair points</b> work like a football table and only go up: every round gives <b>3</b> for a win down to <b>0</b> for last (4 players: 3 · 2 · 1 · 0). Bigger stakes count more (a 4-point round counts double a 1-point round), and so do bigger tables (less luck than heads-up). P = rounds played · W = wins · L = last places.',
    fair2: `<b>Missed a night?</b> Every round the table played without you adds your own average per round — pulled toward the group's until you have played about ${C.FILL_PRIOR} rounds, and never for more rounds than you played. Being away doesn't drop you down, and nobody climbs without playing. <i class="tag">new</i> = fewer than ${C.FILL_PRIOR} rounds so far.`,
    points: '<b>Overall</b> — all game points added up (the points of the nights, start points included). It rewards playing a lot as much as playing well; Fair points are fair to whoever missed a night.',
    champions: '<b>Champions</b> — nights won (most points of the night; a tie crowns both). The same number of crowns is split by fair points.',
  };
  const kindOf = () => (ui.rank.by === 'points' || ui.rank.by === 'champions' ? ui.rank.by : 'fair');

  /** The nights and standings of a period: the one picked in Rankings, or 'month' / 'all'. */
  function rankingData(scope) {
    const { type, offset } = ui.rank;
    const range = scope === 'month' ? C.periodRange('month', 0) : scope === 'all' ? C.periodRange('all', 0) : C.periodRange(type, offset);
    const nights = finishedNights().filter((n) => C.inRange(n.date, range));
    const all = C.aggregate(nights);
    return { range, nights, all, list: C.sortStandings(all, kindOf()) };
  }
  /** One color per player for the curves: the 8 most active players (all time) get the hues, in a fixed order. */
  function playerColors() {
    const seen = new Set();
    const order = C.aggregate(db.nights)
      .sort((a, b) => b.roundsPlayed - a.roundsPlayed || (P(a.playerId).createdAt || 0) - (P(b.playerId).createdAt || 0))
      .map((a) => {
        seen.add(a.playerId);
        return a.playerId;
      });
    for (const p of db.players) if (!seen.has(p.id)) order.push(p.id);
    return K.colorMap(order);
  }
  /** Fair points after each night, per player (player card). */
  function fairTrends(steps) {
    const out = {};
    steps.forEach((s, i) => {
      for (const x of s.standings) {
        if (!out[x.playerId]) out[x.playerId] = new Array(steps.length).fill(null);
        out[x.playerId][i] = x.fair;
      }
    });
    return out;
  }

  function renderRankings() {
    const { type, offset, view } = ui.rank;
    const data = rankingData();
    const types = [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All time']];
    const views = [['board', IC.trophy, 'Ranking'], ['money', IC.updown, 'Win/Loss'], ['table', IC.grid, 'Stats'], ['curves', IC.curve, 'Curves'], ['bills', IC.bill, 'Bills']];
    let body;
    if (!data.nights.length) body = '<section class="card"><div class="empty"><span class="big">🂮</span>No finished nights in this period.</div></section>';
    else if (view === 'table') body = statsView(data);
    else if (view === 'money') body = moneyView(data);
    else if (view === 'curves') body = curvesView(data);
    else if (view === 'bills') body = billsView(data);
    else body = boardView(data);
    return `
      <h2 class="page-title">Rankings</h2>
      <div class="filters">
        <div class="segbar">${types.map(([k, l]) => `<button class="${type === k ? 'on' : ''}" data-action="rankType" data-v="${k}" aria-pressed="${type === k}">${l}</button>`).join('')}</div>
        ${type !== 'all' ? `<div class="period-nav">
          <button class="icon-btn" data-action="rankShift" data-d="-1" aria-label="Previous">${IC.chevL}</button>
          <b>${periodLabel(data.range)}</b>
          <button class="icon-btn" data-action="rankShift" data-d="1" aria-label="Next" ${offset >= 0 ? 'disabled' : ''}>${IC.chevR}</button>
        </div>` : ''}
      </div>
      <nav class="viewtabs" aria-label="Ranking views">${views.map(([k, ico, l]) => `<button class="${view === k ? 'on' : ''}" data-action="rankView" data-v="${k}" aria-pressed="${view === k}">${ico}<span>${l}</span></button>`).join('')}</nav>
      ${body}`;
  }

  /* --- ranking: podium + a football-style league table --- */
  function boardView({ nights, list }) {
    const by = kindOf();
    const metric = (p) => (by === 'fair' ? [fairTxt(p.fair), 'pts'] : by === 'points' ? [ptsTxt(p.pts), 'pts'] : [String(p.champions), p.champions === 1 ? 'crown' : 'crowns']);
    const pod = (p, place) => {
      if (!p) return '<div class="pod pod-none" aria-hidden="true"></div>';
      const [v, u] = metric(p);
      return `<button class="pod pod${place}" data-action="showPlayer" data-id="${p.playerId}" aria-label="${ordinal(p.rank)}: ${nameOf(p.playerId)}, ${v} ${u}">
        ${place === 1 ? CROWN : ''}
        ${avatar(p.playerId, place === 1 ? 'xl' : 'lg')}
        <span class="pod-name">${nameOf(p.playerId)}</span>
        <span class="pod-val">${v}<small>${u}</small></span>
        <span class="pod-step"><span>${p.rank}</span></span>
      </button>`;
    };
    const cols = {
      fair: [['P', 'rounds played', (p) => p.roundsPlayed], ['W', 'wins (1st)', (p) => p.roundsWon], ['2nd', '2nd places', (p) => p.p2], ['3rd', '3rd places', (p) => p.p3], ['L', 'last places', (p) => p.plast]],
      points: [['N', 'nights', (p) => p.nights], ['P', 'rounds played', (p) => p.roundsPlayed], ['W', 'wins (1st)', (p) => p.roundsWon], [IC.crown, 'crowns', (p) => p.champions]],
      champions: [['N', 'nights', (p) => p.nights], ['W', 'wins (1st)', (p) => p.roundsWon], ['Fair', 'fair points', (p) => fairTxt(p.fair)]],
    }[by];
    const keyHead = { fair: 'Pts', points: 'Pts', champions: IC.crown }[by];
    const table = `<div class="league" style="--cols:${cols.length}">
        <div class="lt-row lt-head" aria-hidden="true"><span class="c-rk">#</span><span class="c-name">Player</span>${cols.map(([h, t]) => `<span class="c-n" title="${t}">${h}</span>`).join('')}<span class="c-key">${keyHead}</span></div>
        ${list.map((p, i) => {
          const [v, u] = metric(p);
          return `<button class="lt-row ${p.rank === 1 ? 'top1' : ''}" style="--i:${i}" data-action="showPlayer" data-id="${p.playerId}" aria-label="${ordinal(p.rank)}: ${nameOf(p.playerId)}, ${v} ${u}, ${plural(p.roundsPlayed, 'round')}">
            <span class="c-rk">${medal(p.rank)}</span>
            <span class="c-name">${avatar(p.playerId, 'sm')}<span class="tname">${nameOf(p.playerId)}</span>${by === 'fair' && p.provisional ? '<i class="tag">new</i>' : ''}</span>
            ${cols.map(([, , f]) => `<span class="c-n">${f(p)}</span>`).join('')}
            <span class="c-key">${v}</span>
          </button>`;
        }).join('')}
      </div>`;
    return `
      <div class="segbar kinds">${RANK_KINDS.map(([k, l]) => `<button class="${by === k ? 'on' : ''}" data-action="rankBy" data-v="${k}" aria-pressed="${by === k}">${l}</button>`).join('')}</div>
      ${list.length > 1 ? `<div class="podium">${pod(list[1], 2)}${pod(list[0], 1)}${pod(list[2], 3)}</div>` : ''}
      <section class="card board-card">
        <div class="card-head"><h3>${by === 'fair' ? 'League table' : by === 'points' ? 'Overall' : 'Champions'}</h3><span class="muted">${plural(nights.length, 'night')}</span></div>
        ${table}
        <p class="hint">Tap a player for all their numbers.</p>
        <details class="explain"><summary>${by === 'fair' ? 'How fair points work' : 'How this ranking works'}</summary>
          <p class="hint">${RANK_HINT[by]}</p>
          ${by === 'fair' ? `<p class="hint">${RANK_HINT.fair2}</p>` : ''}
        </details>
      </section>
      <button class="primary" data-action="shareRanking">${IC.share}Share this ranking</button>`;
  }

  /* --- stats: one wide table, sticky names, sortable --- */
  const STAT_COLS = [
    { k: 'fair', h: 'Fair pts', f: (p) => fairTxt(p.fair) },
    { k: 'lp', h: 'Earned', f: (p) => fairTxt(p.lp) },
    { k: 'filled', h: 'Missed +', f: (p) => (p.filled ? `+${fairTxt(p.filled)}` : '·') },
    { k: 'roundsPlayed', h: 'P', f: (p) => p.roundsPlayed },
    { k: 'roundsWon', h: 'W', f: (p) => p.roundsWon },
    { k: 'p2', h: '2nd', f: (p) => p.p2 },
    { k: 'p3', h: '3rd', f: (p) => p.p3 },
    { k: 'plast', h: 'L', f: (p) => p.plast },
    { k: 'ppr', h: 'Pts / round', f: (p) => p.ppr.toFixed(2) },
    { k: 'winRate', h: 'Win %', f: (p) => pct0(p.winRate) },
    { k: 'avgResult', h: 'Avg finish', f: (p) => Math.round(p.avgResult) },
    { k: 'pts', h: 'Game pts', f: (p) => ptsTxt(p.pts) },
    { k: 'champions', h: IC.crown, f: (p) => p.champions || '·' },
    { k: 'nights', h: 'Nights', f: (p) => p.nights },
    { k: 'bestNight', h: 'Best night', f: (p) => ptsTxt(p.bestNight || 0) },
    { k: 'won', h: 'Won', cur: true, f: (p) => moneyNum(p.won), c: (p) => (p.won ? 'pos' : 'zero') },
    { k: 'lost', h: 'Lost', cur: true, f: (p) => moneyNum(-p.lost), c: (p) => (p.lost ? 'neg' : 'zero') },
    { k: 'money', h: 'Cards', cur: true, f: (p) => moneyNum(p.money, true), c: (p) => cls(p.money) },
    { k: 'fees', h: 'Fees', cur: true, f: (p) => moneyNum(-p.fees), c: (p) => (p.fees ? 'neg' : 'zero') },
    { k: 'bill', h: 'Bills', cur: true, f: (p) => moneyNum(-p.bill), c: (p) => (p.bill ? 'neg' : 'zero') },
    { k: 'total', h: 'Net', cur: true, f: (p) => moneyNum(p.total, true), c: (p) => cls(p.total) },
  ];
  const defaultSort = () => ({ k: { points: 'pts', champions: 'champions' }[kindOf()] || 'fair', dir: -1 });
  function statsView({ range, all }) {
    const sort = ui.rank.sort || defaultSort();
    const val = (p) => Number(p[sort.k]) || 0;
    const rows = all.slice().sort((a, b) => (val(a) - val(b)) * sort.dir || b.fair - a.fair);
    const cur = esc(S().currency);
    return `
      <section class="card table-card">
        <div class="card-head"><h3>All stats</h3><span class="muted">${periodLabel(range)}</span></div>
        <p class="hint" style="margin:0 0 10px">Tap a column to sort · swipe sideways for more · tap a name for the player card.</p>
        <div class="stat-scroll" data-keep="stats" tabindex="0" role="region" aria-label="All stats, scrolls sideways">
          <table class="stat-table">
            <thead><tr><th class="sticky" scope="col">Player</th>${STAT_COLS.map((c) => {
              const on = sort.k === c.k;
              return `<th scope="col" class="${on ? 'on' : ''}" aria-sort="${on ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button data-action="rankSort" data-k="${c.k}">${c.h}${c.cur ? ` <small>${cur}</small>` : ''}<i aria-hidden="true">${on ? (sort.dir < 0 ? '▾' : '▴') : ''}</i></button></th>`;
            }).join('')}</tr></thead>
            <tbody>${rows.map((p, i) => `<tr>
              <th class="sticky" scope="row"><button data-action="showPlayer" data-id="${p.playerId}"><span class="rk">${i + 1}</span>${avatar(p.playerId, 'sm')}<span class="tname">${nameOf(p.playerId)}</span></button></th>
              ${STAT_COLS.map((c) => `<td class="${c.c ? c.c(p) : ''}${sort.k === c.k ? ' on' : ''}">${c.f(p)}</td>`).join('')}
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <ul class="col-help">
          <li><b>Fair pts</b> the league table: earned + missed rounds filled at their average</li>
          <li><b>Earned</b> league points from the rounds played (3 for a win … 0 for last, weighted)</li>
          <li><b>P · W · 2nd · 3rd · L</b> rounds played, wins, 2nd and 3rd places, last places</li>
          <li><b>Avg finish</b> 100 = always 1st, 0 = always last</li>
          <li><b>Game pts</b> the points of the nights (they decide each night's champion)</li>
          <li><b>Won · Lost</b> money taken from / paid to the others in the rounds · <b>Cards</b> won − lost</li>
          <li><b>Fees</b> table + pot (as winner, or put in when leaving) · <b>Bills</b> share, extra, when leaving · <b>Net</b> all of it</li>
        </ul>
      </section>`;
  }

  /* --- win / loss: who is up, who is down — as a table, and night by night --- */
  const MONEY_MODES = [['cards', 'Table money'], ['net', 'After fees & bills']];
  function moneyView({ range, nights }) {
    const mode = ui.rank.money === 'net' ? 'net' : 'cards';
    const t = C.moneyTable(nights, mode);
    const list = t.players;
    if (!list.length) return '<section class="card"><div class="empty"><span class="big">🂮</span>No money moved in this period.</div></section>';
    const cur = esc(S().currency);
    const overall = mode === 'net';
    const maxAbs = Math.max(1, ...list.map((p) => Math.abs(p.value)));
    const top = list[0];
    const low = list[list.length - 1];
    let best = null;
    for (const r of t.nights) {
      for (const [id, c] of Object.entries(r.cells)) if (!best || c.value > best.value) best = { id, value: c.value, date: r.date };
    }
    const wl = (p) => `${p.up}–${p.down}`;
    // a bar from the middle: right = up, left = down (the sign is printed too)
    const bar = (v) => {
      const w = Math.min(50, (Math.abs(v) / maxAbs) * 50);
      return `<span class="dbar" aria-hidden="true"><i class="${v >= 0 ? 'up' : 'down'}" style="${v >= 0 ? 'left' : 'right'}:50%;width:${w.toFixed(1)}%"></i></span>`;
    };
    const rows = list.map((p, i) => `
      <button class="wl-row ${p.rank === 1 && p.value > 0 ? 'top1' : ''}" style="--i:${i}" data-action="showPlayer" data-id="${p.playerId}"
        aria-label="${ordinal(p.rank)}: ${nameOf(p.playerId)}, ${p.up} nights up and ${p.down} down, won ${moneyHtml(p.won)}, lost ${moneyHtml(p.lost)}${overall ? `, fees and bills ${moneyHtml(p.costs)}` : ''}, ${overall ? 'net' : 'table money'} ${moneyHtml(p.value, true)}">
        <span class="c-rk">${medal(p.rank)}</span>
        <span class="c-name">${avatar(p.playerId, 'sm')}<span class="tname">${nameOf(p.playerId)}</span></span>
        <span class="c-n">${wl(p)}</span>
        <span class="c-n">${moneyNum(p.won)}</span>
        <span class="c-n">${p.lost ? moneyNum(-p.lost) : '0'}</span>
        ${overall ? `<span class="c-n">${p.costs ? moneyNum(-p.costs) : '0'}</span>` : ''}
        <span class="c-key ${cls(p.value)}">${moneyNum(p.value, true)}</span>
        ${bar(p.value)}
      </button>`).join('');
    // night by night: one row per night, one column per player (same order as the table)
    const tint = (v) => (v ? ` style="--a:${(0.16 + 0.5 * Math.min(1, Math.abs(v) / maxAbs)).toFixed(2)}"` : '');
    const ledger = `<div class="stat-scroll" data-keep="ledger" tabindex="0" role="region" aria-label="Win and loss night by night, scrolls sideways">
        <table class="stat-table ledger">
          <thead><tr><th class="sticky" scope="col">Night</th>${list.map((p) => `<th scope="col"><span class="lg-head">${avatar(p.playerId, 'sm')}<span>${nameOf(p.playerId)}</span></span></th>`).join('')}</tr></thead>
          <tbody>${t.nights.map((r) => `<tr>
            <th class="sticky" scope="row"><button data-action="openNight" data-id="${r.nightId}"><b>${esc(DAYMON_FMT.format(toDate(r.date)))}</b><small>${plural(r.rounds, 'round')}</small></button></th>
            ${list.map((p) => {
              const c = r.cells[p.playerId];
              if (!c) return '<td class="gone">·</td>';
              return `<td class="${c.value > 0 ? 'up' : c.value < 0 ? 'down' : 'even'}"${tint(c.value)}>${moneyNum(c.value, true)}${c.champion ? IC.crown : ''}</td>`;
            }).join('')}
          </tr>`).join('')}</tbody>
          <tfoot><tr><th class="sticky" scope="row">Total</th>${list.map((p) => `<td class="${cls(p.value)}">${moneyNum(p.value, true)}</td>`).join('')}</tr></tfoot>
        </table>
      </div>`;
    return `
      <div class="segbar money-mode">${MONEY_MODES.map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-action="rankMoney" data-v="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
      <div class="tiles">
        <div class="tile"><span class="t-ico">${IC.updown}</span><small>Most up</small><b class="${cls(top.value)}">${moneyHtml(top.value, true)}</b><span>${nameOf(top.playerId)} · ${wl(top)} nights</span></div>
        <div class="tile"><span class="t-ico">${IC.updown}</span><small>Most down</small><b class="${cls(low.value)}">${moneyHtml(low.value, true)}</b><span>${nameOf(low.playerId)} · ${wl(low)} nights</span></div>
        <div class="tile"><span class="t-ico">${IC.crown}</span><small>Best night</small><b class="${cls(best ? best.value : 0)}">${moneyHtml(best ? best.value : 0, true)}</b><span>${best ? `${nameOf(best.id)} · ${esc(DAYMON_FMT.format(toDate(best.date)))}` : '—'}</span></div>
        <div class="tile"><span class="t-ico">${IC.pot}</span><small>On the table</small><b>${moneyHtml(t.moved)}</b><span>won &amp; lost · ${plural(t.rounds, 'round')}</span></div>
      </div>
      <section class="card wl-card">
        <div class="card-head"><h3>${IC.updown}Win / Loss</h3><span class="muted">${esc(periodLabel(range))}</span></div>
        <div class="wl ${overall ? '' : 'cards'}">
          <div class="wl-row wl-head" aria-hidden="true"><span class="c-rk">#</span><span class="c-name">Player</span><span class="c-n" title="nights up – nights down">W–L</span><span class="c-n">Won</span><span class="c-n">Lost</span>${overall ? '<span class="c-n" title="fees + bills">Costs</span>' : ''}<span class="c-key">Net ${cur}</span></div>
          ${rows}
        </div>
        <ul class="col-help">
          <li><b>W–L</b> nights you ended up · nights you ended down</li>
          <li><b>Won · Lost</b> money taken from / paid to the others in the rounds</li>
          ${overall ? `<li><b>Costs</b> table + pot fees, and your part of the bills</li>
          <li><b>Net</b> won − lost − costs: what you are really up or down</li>` : `<li><b>Net</b> won − lost at the table. Over everyone it adds up to zero. Switch to “After fees &amp; bills” for what you are really up or down.</li>`}
        </ul>
      </section>
      <section class="card table-card">
        <div class="card-head"><h3>${IC.calendar}Night by night</h3><span class="muted">${plural(t.nights.length, 'night')}</span></div>
        <p class="hint" style="margin:0 0 10px">${overall ? 'Each night after fees and bills.' : 'Table money of each night (won − lost).'} <span class="sw up"></span>up · <span class="sw down"></span>down · ${IC.crown} champion. Tap a date to open the night.</p>
        ${ledger}
      </section>`;
  }

  /* --- curves: how the table moved, night by night --- */
  const CURVES = {
    rank: { label: 'Position', title: 'League position after each night', sub: 'Position by fair points — #1 is the top.' },
    fair: { label: 'Fair pts', title: 'Fair points, night by night', sub: 'Like a football table: every round adds points, missed rounds are filled fairly.' },
    pts: { label: 'Game pts', title: 'Game points added up, night by night', sub: 'All points of the nights, start points included.' },
    total: { label: 'Money', title: 'Money overall, night by night', sub: 'Cards won − lost − fees − bills, added up.' },
  };
  function curvesView({ nights, list }) {
    const m = CURVES[ui.rank.metric] ? ui.rank.metric : 'rank';
    const def = CURVES[m];
    const steps = C.timeline(nights);
    const colors = playerColors();
    const pick = (x) => (m === 'rank' ? x.rank : m === 'fair' ? x.fair : m === 'pts' ? x.pts : x.total);
    const series = list.map((p) => ({
      id: p.playerId,
      name: P(p.playerId).name,
      color: colors[p.playerId] || K.OTHER,
      values: steps.map((s) => {
        const x = s.standings.find((q) => q.playerId === p.playerId);
        return x ? pick(x) : null;
      }),
    }));
    const valueTxt = m === 'total' ? (v) => money(v, true) : m === 'fair' ? (v) => fairTxt(v) : m === 'rank' ? (v) => `#${v}` : (v) => ptsTxt(v);
    const labels = steps.map((s) => DAYMON_FMT.format(toDate(s.date)));
    const focus = series.some((s) => s.id === ui.rank.focus) ? ui.rank.focus : null;
    chartJobs.curves = {
      labels,
      titles: steps.map((s) => fmtDate(s.date)),
      series,
      focus,
      format: m === 'total' ? (v) => moneyNum(v, true) : (v) => ptsTxt(Math.round(v)),
      tipFormat: valueTxt,
      invert: m === 'rank',
      zero: m !== 'rank',
      height: 260,
      label: `${def.title}, ${plural(steps.length, 'night')}`,
      emptyText: 'No nights in this period yet.',
    };
    const table = `<div class="stat-scroll" data-keep="curve-table"><table class="stat-table mini">
        <thead><tr><th class="sticky" scope="col">Player</th>${labels.map((l) => `<th scope="col">${esc(l)}</th>`).join('')}</tr></thead>
        <tbody>${series.map((s) => `<tr><th class="sticky" scope="row"><span class="tkey" style="background:${s.color}"></span><span class="tname">${esc(s.name)}</span></th>${s.values.map((v) => `<td>${v == null ? '·' : esc(valueTxt(v))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    return `
      <div class="segbar">${Object.entries(CURVES).map(([k, c]) => `<button class="${m === k ? 'on' : ''}" data-action="rankMetric" data-v="${k}" aria-pressed="${m === k}">${c.label}</button>`).join('')}</div>
      <section class="card chart-card">
        <h3>${def.title}</h3>
        <p class="chart-sub">${def.sub} Touch the chart to see everyone on that night.</p>
        <div class="legend" role="group" aria-label="Highlight a player">${series.map((s) => `<button class="lg-item ${focus === s.id ? 'on' : ''} ${focus && focus !== s.id ? 'dim' : ''}" data-action="rankFocus" data-id="${s.id}" aria-pressed="${focus === s.id}"><i class="ln" style="background:${s.color}"></i>${esc(s.name)}</button>`).join('')}</div>
        <div class="chart" data-chart="curves"></div>
        ${steps.length < 2 ? '<p class="hint">Only one night in this period — choose Month, Year or All time to watch the curves grow.</p>' : ''}
        <details class="table-view"><summary>Show the numbers</summary>${table}</details>
      </section>`;
  }

  /* --- bills: what was paid, how, and by whom --- */
  function billsView({ nights }) {
    const st = C.billStats(nights);
    const t = st.totals;
    if (!t.nights) return '<section class="card"><div class="empty"><span class="big">🧾</span>No bills entered in this period.</div></section>';
    const parts = billParts(t);
    const before = C.r2(t.pot + t.table + t.left + t.extras);
    const whole = before + t.players;
    const share = (v) => (whole ? Math.round((v / whole) * 100) : 0);
    const maxPaid = Math.max(1, ...st.players.map((p) => p.total));
    const kinds = [['share', K.PALETTE[4], 'Share of the split'], ['extra', K.PALETTE[3], 'Extra money'], ['left', K.PALETTE[2], 'Paid when leaving']];
    return `
      <div class="tiles">
        <div class="tile"><small>Bills</small><b>${moneyHtml(t.invoice)}</b><span>${plural(t.nights, 'night')}</span></div>
        <div class="tile"><small>Average bill</small><b>${moneyHtml(st.avg)}</b><span>per night</span></div>
        <div class="tile"><small>Paid before the split</small><b>${moneyHtml(before)}</b><span>${share(before)}% · pot, table, leaving, extra</span></div>
        <div class="tile"><small>Split by ranking</small><b>${moneyHtml(t.players)}</b><span>${share(t.players)}% · lowest places pay</span></div>
      </div>
      <section class="card">
        <h3>How the bills were paid</h3>
        ${billBar(parts, true)}
        ${billLegend(parts)}
        ${t.leftover ? `<p class="hint">${moneyHtml(t.leftover)} was left over (more was paid in than the bills).</p>` : ''}
      </section>
      <section class="card">
        <h3>Who paid the bills</h3>
        <div class="legend static">${kinds.map(([, c, l]) => `<span class="lg-item"><i class="sq" style="background:${c}"></i>${l}</span>`).join('')}</div>
        ${st.players.map((p) => `<button class="payer" data-action="showPlayer" data-id="${p.playerId}">
          <span class="payer-top">${avatar(p.playerId, 'sm')}<span class="nm"><span class="name">${nameOf(p.playerId)}</span><small>paid ${p.paidNights} of ${plural(p.nights, 'night')} · ⌀ ${moneyHtml(p.avg)}</small></span><b>${moneyHtml(p.total)}</b></span>
          <span class="hbar-track"><span class="hbar" style="width:${Math.max(p.total > 0 ? 3 : 0, (p.total / maxPaid) * 100).toFixed(1)}%">${kinds.filter(([k]) => p[k] > 0).map(([k, c]) => `<i style="flex:${p[k]};background:${c}"></i>`).join('')}</span></span>
          <small class="payer-parts">share ${moneyHtml(p.share)}${p.extra ? ` · extra ${moneyHtml(p.extra)}` : ''}${p.left ? ` · when leaving ${moneyHtml(p.left)}` : ''} · pot fees ${moneyHtml(p.potFees)}</small>
        </button>`).join('')}
        <p class="hint">Pot fees are what they put in the pot (as round winners, or when leaving) — the pot pays the bill first.</p>
      </section>
      <section class="card">
        <h3>Night by night</h3>
        ${st.rows.map((r) => `<button class="bill-night" data-action="openNight" data-id="${r.nightId}">
          <span class="bn-head"><b>${fmtDate(r.date)}</b><span>${moneyHtml(r.invoice)}</span></span>
          ${billBar(billParts(r))}
          <small>${billParts(r).filter((x) => x.v > 0).map((x) => `${x.label} ${moneyHtml(x.v)}`).join(' · ')}${r.leftover ? ` · left over ${moneyHtml(r.leftover)}` : ''}</small>
        </button>`).join('')}
      </section>`;
  }

  /** A player's card: every number of the period, plus their fair-points curve. */
  function playerCard(id, scope) {
    const data = rankingData(scope);
    const p = data.all.find((x) => x.playerId === id);
    if (!p) return null;
    const fair = C.sortStandings(data.all, 'fair').find((x) => x.playerId === id);
    const steps = C.timeline(data.nights);
    const trend = fairTrends(steps)[id] || [];
    const spark = steps.length > 1 ? K.sparkline(trend, { width: 280, height: 56 }) : '';
    const tiles = [
      ['Fair points', fairTxt(p.fair), `#${fair.rank} of ${data.all.length} in the table${p.provisional ? ' · new' : ''}`],
      ['Earned + missed', `${fairTxt(p.lp)} + ${fairTxt(p.filled)}`, !p.filledRounds ? 'played every round'
        : p.missedRounds > p.filledRounds ? `${p.filledRounds} of ${p.missedRounds} missed rounds filled at ${p.perRound.toFixed(2)} (up to rounds played)`
          : `${plural(p.filledRounds, 'missed round')} filled at ${p.perRound.toFixed(2)}`],
      ['Rounds', `P ${p.roundsPlayed} · W ${p.roundsWon}`, `2nd ${p.p2} · 3rd ${p.p3} · last ${p.plast}`],
      ['Per round', p.ppr.toFixed(2), `win ${pct0(p.winRate)} · avg finish ${Math.round(p.avgResult)}`],
      ['Game points', ptsTxt(p.pts), `${ptsTxt(p.avgPts)} a night`],
      ['Crowns', String(p.champions), `champion ${p.champions === 1 ? 'once' : `${p.champions} times`} in ${plural(p.nights, 'night')}`],
      ['Best night', `${ptsTxt(p.bestNight || 0)} pts`, p.leftEarly ? `left early ${p.leftEarly}×` : ''],
      ['Cards', money(p.money, true), `won ${money(p.won)} · lost ${money(p.lost)}`],
      ['Fees', money(p.fees), `pot ${money(p.potFees)} · table ${money(p.tableFees)}`],
      ['Bills paid', money(p.bill), `${p.billNights} ${p.billNights === 1 ? 'night' : 'nights'} · most ${money(p.billMax)}`],
      ['Overall', money(p.total, true), 'cards − fees − bills'],
    ];
    // head to head: who they won the most from, and lost the most to
    const flows = C.headToHead(data.nights);
    const rivals = data.all.filter((x) => x.playerId !== id).map((x) => ({ id: x.playerId, v: C.vs(flows, id, x.playerId) }));
    const fav = rivals.filter((x) => x.v > 0).sort((a, b) => b.v - a.v)[0];
    const nem = rivals.filter((x) => x.v < 0).sort((a, b) => a.v - b.v)[0];
    if (fav || nem) {
      tiles.push(['Won most from', fav ? P(fav.id).name : '—', fav ? `${money(fav.v, true)} against them` : 'nobody yet']);
      tiles.push(['Lost most to', nem ? P(nem.id).name : '—', nem ? `${money(nem.v, true)} against them` : 'nobody yet']);
    }
    return {
      title: `${avatar(id, 'lg')}<span class="pc-name">${nameOf(id)}</span>`,
      body: `<p class="pc-period">${esc(periodLabel(data.range))} · ${plural(p.nights, 'night')}</p>
        ${spark ? `<div class="pc-spark">${spark}<small>fair points, night by night</small></div>` : ''}
        <div class="ptiles">${tiles.map(([l, v, s]) => `<div class="${l === 'Overall' ? cls(p.total) : ''}"><small>${l}</small><b>${esc(v)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`).join('')}</div>`,
    };
  }

  function rankingText() {
    const { range, nights, all } = rankingData();
    const by = kindOf();
    const list = C.sortStandings(all, by);
    const kind = RANK_KINDS.find(([k]) => k === by);
    const L = [`🏆 CHAMPIONS — ${periodLabel(range)}`, `${plural(nights.length, 'night')} played · ranked by ${kind ? kind[2] : 'fair points'}`, ''];
    const fair = C.sortStandings(all, 'fair')[0];
    const crowns = C.sortStandings(all, 'champions')[0];
    if (fair) L.push(`⚖️ Top of the table: ${P(fair.playerId).name} (${fairTxt(fair.fair)} fair pts)`);
    if (crowns && crowns.champions) L.push(`👑 Most crowns: ${P(crowns.playerId).name} (${crowns.champions}×)`);
    L.push('');
    for (const p of list) {
      L.push(`${medalTxt(p.rank)} ${P(p.playerId).name} — ${fairTxt(p.fair)} fair pts · P ${p.roundsPlayed} W ${p.roundsWon} L ${p.plast} · 👑${p.champions} · ${money(p.total, true)}`);
    }
    const st = C.billStats(nights);
    if (st.totals.nights) {
      L.push('', `🧾 Bills: ${money(st.totals.invoice)} over ${plural(st.totals.nights, 'night')} — pot ${money(st.totals.pot)}, split by ranking ${money(st.totals.players)}`);
    }
    return L.join('\n');
  }

  /* ---------- HISTORY tab ---------- */
  function renderHistory() {
    if (ui.historyId && nightById(ui.historyId)) return renderReport(nightById(ui.historyId), false);
    const live = activeNight();
    const nights = finishedNights();
    let lastMonth = '';
    const rows = nights.map((n) => {
      const sum = C.nightSummary(n);
      const d = toDate(n.date);
      const m = MONTH_FMT.format(d);
      const head = m !== lastMonth ? `<h4 class="month-label">${m}</h4>` : '';
      lastMonth = m;
      return `${head}<button class="night" data-action="openNight" data-id="${n.id}">
        <span class="night-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</small></span>
        <span class="night-main"><b>${sum.champions.length ? `${IC.crown}${esc(namesJoin(sum.champions))}` : 'No champion'}</b>
          <small>${plural(n.playerIds.length, 'player')} · ${plural(sum.rounds, 'round')}${n.bill ? ` · bill ${moneyHtml(n.bill.invoice)}` : ''}</small></span>
        <span class="score">${sum.champions.length ? ptsTxt(sum.players[0].pts) : ''}<small>${sum.champions.length ? 'pts' : ''}</small></span>
      </button>`;
    }).join('');
    return `
      <h2 class="page-title">History</h2>
      ${syncBar()}
      <p class="page-sub">Every night, its champion and the full report.</p>
      ${live ? `<button class="night" data-action="tab" data-tab="play">
        <span class="night-date"><b>${toDate(live.date).getDate()}</b><small>NOW</small></span>
        <span class="night-main"><b><span class="live-dot"></span>Game in progress</b><small>${plural(live.playerIds.length, 'player')} · ${plural(live.rounds.length, 'round')}</small></span>
        <span class="link">Open${IC.chevR}</span></button>` : ''}
      ${rows || (live ? '' : '<section class="card"><div class="empty"><span class="big">🂠</span>No nights yet. Your history will show up here.</div></section>')}`;
  }

  /* ---------- PLAYERS tab ---------- */
  function renderPlayers() {
    const all = C.aggregate(db.nights);
    const statsBy = Object.fromEntries(all.map((a) => [a.playerId, a]));
    const visible = db.players.filter((p) => !p.hidden).sort((a, b) => a.name.localeCompare(b.name));
    const hidden = db.players.filter((p) => p.hidden);
    const row = (p) => {
      const st = statsBy[p.id];
      return `<div class="prow">
        <button class="av-btn" data-action="cycleEmoji" data-id="${p.id}" aria-label="Change avatar of ${esc(p.name)}">${avatar(p.id, 'lg')}</button>
        <span class="nm"><span class="name">${esc(p.name)}</span><small>${st ? `${fairTxt(st.fair)} fair pts · ${plural(st.nights, 'night')} · <span class="crowns-n">${IC.crown}${st.champions}</span> · <span class="${cls(st.total)}">${moneyHtml(st.total, true)}</span>` : 'No nights yet'}</small></span>
        <span class="acts">
          ${st ? `<button class="icon-btn" data-action="showPlayer" data-id="${p.id}" data-scope="all" aria-label="All-time numbers of ${esc(p.name)}">${IC.stats}</button>` : ''}
          <button class="icon-btn" data-action="renamePlayer" data-id="${p.id}" aria-label="Rename ${esc(p.name)}">${IC.edit}</button>
          <button class="icon-btn" data-action="toggleHide" data-id="${p.id}" aria-label="${p.hidden ? 'Show' : 'Hide'} ${esc(p.name)}">${p.hidden ? IC.eye : IC.eyeOff}</button>
          ${!st && !db.nights.some((n) => n.playerIds.includes(p.id)) ? `<button class="icon-btn" data-action="deletePlayer" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">${IC.trash}</button>` : ''}
        </span>
      </div>`;
    };
    return `
      <h2 class="page-title">Players</h2>
      <p class="page-sub">Everyone you add is saved for the next game. Tap an avatar to change it.</p>
      <section class="card">
        <div class="add-row">
          <input class="text-in" placeholder="Add a player" maxlength="24" autocomplete="off" value="${esc(ui.newPlayer)}" data-input="newPlayer" data-enter="addPlayer" aria-label="New player name">
          <button class="secondary" data-action="addPlayer">Add</button>
        </div>
      </section>
      <section class="card">
        ${visible.length ? visible.map(row).join('') : '<div class="empty">No players yet.</div>'}
      </section>
      ${hidden.length ? `<details class="card" ${ui.showHidden ? 'open' : ''}><summary>Hidden players (${hidden.length})</summary>${hidden.map(row).join('')}</details>` : ''}`;
  }

  /* ---------- SETTINGS tab ---------- */
  /** "5 € to the pot if they played up to 10 €, or 10 € if they played more" */
  function potRuleText(s) {
    const t = moneyHtml(s.potThreshold);
    if (Number(s.potFeeBelow) === Number(s.potFeeAt)) {
      return `<b>${moneyHtml(s.potFeeAt)}</b> to the pot if they played up to ${t}, or <b>${moneyHtml(s.potFeeAbove)}</b> if they played more`;
    }
    return `<b>${moneyHtml(s.potFeeAt)}</b> to the pot if they played ${t}, <b>${moneyHtml(s.potFeeAbove)}</b> if more, and <b>${moneyHtml(s.potFeeBelow)}</b> if less`;
  }
  function renderSettings() {
    const s = S();
    const numField = (key, label, sub = '') => `<div class="field"><label for="f-${key}">${label}${sub ? `<small>${sub}</small>` : ''}</label>
      <input id="f-${key}" inputmode="decimal" value="${esc(s[key])}" data-change="setNum" data-key="${key}"></div>`;
    const splitRows = [];
    for (let n = 2; n <= 12; n++) {
      const arr = s.splits[n] || [];
      const total = arr.reduce((a, b) => a + Number(b), 0);
      splitRows.push(`<div class="field"><label for="sp-${n}">${n} players</label>
        <input id="sp-${n}" class="wide" value="${esc(arr.join(', '))}" data-change="setSplit" data-n="${n}" inputmode="text">
        <span class="sum ${Math.abs(total - 100) < 0.01 ? 'zero' : 'neg'}">${total}%</span></div>`);
    }
    return `
      <h2 class="page-title">Settings</h2>

      <section class="card">
        <h3>How CHAMPIONS counts</h3>
        <ol class="rules">
          <li>Before every round you choose the <b>points</b>. 1 point = <b>${moneyHtml(s.pointValue)}</b>.</li>
          <li>Each player plays <b>${(s.quickAmounts || []).map((q) => moneyHtml(q)).join(', ')}</b> or the <b>full amount</b> (points × ${moneyHtml(s.pointValue)}).</li>
          <li><b>Points</b> only depend on your place: winner gets players × points, each next place one step less, last gets 1 × points.</li>
          <li><b>Money</b>: only the winner collects. Each player pays the winner what they played, but never more than the winner played.</li>
          <li>Only the round winner pays fees: <b>${moneyHtml(s.tableFee)}</b> for the table, plus ${potRuleText(s)}.</li>
          <li>At the end, the pot comes off the bill — and so does what anyone paid when leaving early, and any extra money. The rest is paid by the lowest places still at the table (e.g. 4 players: 50 · 30 · 20 %). Ties share equally.</li>
          <li>Someone <b>joining late</b> can get starting points: last place's points, the table average, 0 or any number.</li>
          <li>Someone <b>leaving early</b> keeps their points and is left out of the bill split. When they go they can put money in the <b>pot</b> and/or pay toward the bill — both come off the bill. Anyone still marked <b>Out</b> when you finish is left out of the bill too.</li>
          <li>The <b>champion</b> of the night is whoever has the most points.</li>
          <li><b>Fair points</b> make the league table, like football: every round adds 3 for a win down to 0 for last, bigger stakes and bigger tables count more, and rounds you missed are filled with your own average (pulled toward the group's until about ${C.FILL_PRIOR} rounds, never for more rounds than you played).</li>
        </ol>
      </section>

      <section class="card">
        <h3>Money rules</h3>
        ${numField('pointValue', `1 point is worth (${esc(s.currency)})`)}
        <div class="field"><label for="f-stakePicks">Points to choose from<small>shown before each round</small></label>
          <input id="f-stakePicks" class="wide" value="${esc(s.stakePicks.join(', '))}" data-change="setList" data-key="stakePicks"></div>
        <div class="field"><label for="f-quickAmounts">Smaller money options<small>besides the full amount</small></label>
          <input id="f-quickAmounts" class="wide" value="${esc((s.quickAmounts || []).join(', '))}" data-change="setList" data-key="quickAmounts"></div>
        ${numField('tableFee', 'Table fee', 'winner pays every round')}
        ${numField('potThreshold', 'Pot fee depends on', 'what the winner played, compared with this')}
        ${numField('potFeeBelow', 'Pot fee if winner played less')}
        ${numField('potFeeAt', 'Pot fee if winner played exactly that')}
        ${numField('potFeeAbove', 'Pot fee if winner played more')}
        <div class="field"><label>Table money also pays the bill<small>default for the end of the night</small></label>
          <span class="switch"><input type="checkbox" data-change="setBool" data-key="tableToInvoice" ${s.tableToInvoice ? 'checked' : ''} aria-label="Table money also pays the bill"><span></span></span></div>
        <p class="hint">Changes apply to new rounds. Rounds already played keep the rules they were played with.</p>
      </section>

      <section class="card">
        <h3>Who pays the bill</h3>
        <p class="hint" style="margin:0 0 6px">Percent for last place first, then second-last … Places not listed pay nothing.</p>
        ${splitRows.join('')}
      </section>

      <section class="card">
        <h3>Look &amp; sound</h3>
        <div class="themes" style="margin:12px 0">${Object.entries(THEMES).map(([k, t]) => `<button class="theme-btn ${s.theme === k ? 'on' : ''}" data-action="setTheme" data-v="${k}"><i style="background:${t.swatch}"></i>${t.name}</button>`).join('')}</div>
        <div class="field"><label>Sounds</label><span class="switch"><input type="checkbox" data-change="setBool" data-key="sound" ${s.sound ? 'checked' : ''} aria-label="Sounds"><span></span></span></div>
        <div class="field"><label for="f-currency">Currency symbol</label><input id="f-currency" value="${esc(s.currency)}" maxlength="3" data-change="setText" data-key="currency"></div>
      </section>

      ${syncCard()}

      <section class="card">
        <h3>Backup &amp; history</h3>
        <p class="hint" style="margin:0 0 12px">Your history is saved on this device. Save a backup now and then (to Files, iCloud Drive or a chat) so it is never lost — or to move it to another phone or Mac.</p>
        <div class="btn-row" style="margin:0">
          <button class="secondary" data-action="exportData">${IC.download}Save backup</button>
          <button class="secondary" data-action="pickImport">${IC.upload}Load backup</button>
        </div>
        <p class="hint">Last backup: <b>${db.lastBackup ? DATE_FMT.format(new Date(db.lastBackup)) : 'never'}</b> · ${plural(db.players.length, 'player')} · ${plural(db.nights.length, 'night')}</p>
      </section>

      <section class="card">
        <h3>Install the app</h3>
        <ol class="rules">
          <li><b>iPhone:</b> open the app link in <b>Safari</b> → <b>Share</b> → <b>Add to Home Screen</b>.</li>
          <li><b>Mac (Safari):</b> File → <b>Add to Dock</b>. <b>Chrome:</b> the install icon in the address bar.</li>
          <li>It works offline once installed.</li>
        </ol>
      </section>

      <button class="danger" data-action="resetAll">Erase everything</button>
      <p class="hint" style="text-align:center">CHAMPIONS v${APP_VERSION}</p>`;
  }

  /* ================= actions ================= */
  const actions = {
    tab: (ds) => {
      sfx.tap();
      const patch = { tab: ds.tab };
      if (ds.tab === 'history') patch.historyId = null;
      if (ds.tab === 'play' && ui.view === 'report' && ui.tab !== 'play') patch.view = 'home';
      go(patch);
    },

    /* --- setup --- */
    newNight: () => {
      if (activeNight()) return go({ tab: 'play', view: 'home' });
      const lastCount = finishedNights()[0] ? finishedNights()[0].playerIds.length : 4;
      go({ view: 'setup', setup: { step: 1, count: lastCount, selected: [], newName: '' } });
    },
    setupCount: (ds) => {
      ui.setup.count = Math.max(2, Math.min(12, ui.setup.count + Number(ds.d)));
      sfx.tap();
      render();
    },
    setupSet: (ds) => {
      ui.setup.count = Number(ds.n);
      sfx.tap();
      render();
    },
    setupNext: () => {
      ui.setup.step = 2;
      render({ animate: true, top: true });
    },
    setupBack: () => {
      ui.setup.step = 1;
      render({ animate: true, top: true });
    },
    setupCancel: () => go({ view: 'home', setup: null }),
    setupPick: (ds) => {
      const st = ui.setup;
      const i = st.selected.indexOf(ds.id);
      if (i >= 0) st.selected.splice(i, 1);
      else if (st.selected.length >= st.count) {
        toast(`Already ${st.count} players — tap one to remove, or go back and change the number`);
        return;
      } else st.selected.push(ds.id);
      sfx.chip();
      render();
    },
    setupAdd: () => {
      const st = ui.setup;
      const input = $('#setup-name');
      const p = addPlayer(input ? input.value : st.newName);
      if (!p) return toast('Type a name first');
      st.newName = '';
      if (!st.selected.includes(p.id)) {
        if (st.selected.length < st.count) st.selected.push(p.id);
        else toast(`${p.name} saved — remove someone to add them tonight`);
      }
      sfx.chip();
      render();
      const again = $('#setup-name');
      if (again && st.selected.length < st.count) again.focus();
    },
    startNight: () => {
      const st = ui.setup;
      if (st.selected.length !== st.count) return;
      const night = {
        id: uid(),
        date: C.isoDate(new Date()),
        startedAt: Date.now(),
        status: 'active',
        playerIds: st.selected.slice(),
        rounds: [],
        joins: [],
        device: DEVICE_ID,
        updatedAt: Date.now(),
      };
      db.nights.push(night);
      save();
      ui.draft = null;
      sfx.win();
      go({ view: 'game', setup: null });
      toast(syncOn() && !canWrite() ? 'Good luck! This phone has no team key, so tonight stays on this phone only.' : 'Good luck everyone! 🍀', syncOn() && !canWrite() ? 4500 : 2200);
    },

    /* --- rounds --- */
    setPoints: (ds) => {
      ui.draft.points = Number(ds.v);
      sfx.chip();
      render();
    },
    customPoints: async () => {
      const v = await askNumber('How many points?', ui.draft.points, 'pts', `1 point = ${money(S().pointValue)}`);
      if (v == null || v <= 0) return;
      ui.draft.points = v;
      render();
    },
    setAmt: async (ds) => {
      const d = ui.draft;
      const id = ds.id;
      if (ds.v === 'out') {
        d.out[id] = !d.out[id];
        if (d.out[id]) d.order = d.order.filter((x) => x !== id);
      } else if (ds.v === 'full') {
        delete d.out[id];
        delete d.amounts[id];
      } else if (ds.v === 'custom') {
        const v = await askNumber(`Money for ${P(id).name}`, d.amounts[id] != null ? d.amounts[id] : '', S().currency);
        if (v == null) return;
        delete d.out[id];
        if (v <= 0) d.out[id] = true;
        else d.amounts[id] = v;
      } else {
        delete d.out[id];
        d.amounts[id] = Number(ds.v);
      }
      sfx.chip();
      render();
    },
    tapOrder: (ds) => {
      const d = ui.draft;
      const i = d.order.indexOf(ds.id);
      if (i >= 0) d.order.splice(i, 1);
      else d.order.push(ds.id);
      if (d.order[0] === ds.id && i < 0) sfx.win();
      else sfx.chip();
      render();
    },
    clearOrder: () => {
      ui.draft.order = [];
      render();
    },
    saveRound: async () => {
      const night = activeNight();
      if (!night) return;
      const rs = roundState(night);
      if (!rs.complete) {
        const bar = $('#savebar');
        bar && bar.classList.add('shake');
        setTimeout(() => bar && bar.classList.remove('shake'), 450);
        return toast('Tap the finishing order first');
      }
      const round = { id: uid(), at: Date.now(), ...C.buildRound(rs.d.points, rs.order, rs.amounts, rs.s) };
      night.rounds.push(round);
      touch(night);
      save();
      const w = round.results[0];
      const keepOut = { ...rs.d.out };
      ui.draft = { nightId: night.id, points: round.points, amounts: {}, out: keepOut, order: [] };
      sfx.win();
      confetti(0.7);
      render();

      const picks = S().stakePicks.length ? S().stakePicks : [1, 2, 3];
      const r = await ask({
        title: `Round ${night.rounds.length} saved!`,
        body: `<p class="saved-line">${medal(1)} <b>${nameOf(w.playerId)}</b> wins ${moneyHtml(w.won)} and +${ptsTxt(w.pts)} pts</p>
          <p>Keep playing? Pick the points for round ${night.rounds.length + 1}:</p>
          <div class="chips">${picks.map((p, i) => `<button class="pchip ${p === round.points ? 'sel' : ''}" data-modal-value="pts:${p}"><span class="disc" style="--c:${CHIP_COLORS[i % CHIP_COLORS.length]}"><b>${p}</b></span><small>${moneyHtml(C.fullAmount(p, S()))}</small></button>`).join('')}</div>`,
        buttons: [
          { label: `Next round with ${ptsTxt(round.points)} pt${round.points === 1 ? '' : 's'} ▶`, value: `pts:${round.points}`, kind: 'primary' },
          { label: `${IC.flag}We're done for tonight`, value: 'done', kind: 'danger' },
        ],
      });
      if (r.value === 'done') return actions.finishNight();
      if (r.value && String(r.value).startsWith('pts:')) {
        ui.draft.points = Number(String(r.value).slice(4));
        sfx.chip();
      }
      render({ top: true });
    },
    deleteRound: async (ds) => {
      const night = activeNight();
      const idx = night.rounds.findIndex((r) => r.id === ds.id);
      if (idx < 0) return;
      const r = night.rounds[idx];
      if (!(await confirmBox(`Delete round ${idx + 1}?`, `${medal(1)} ${nameOf(r.results[0].playerId)} +${ptsTxt(r.results[0].pts)} pts · ${moneyHtml(r.results[0].won)}<br>Its points, money and fees will be removed.`, 'Delete round'))) return;
      const live = activeNight();
      if (!live) return;
      live.rounds = live.rounds.filter((x) => x.id !== ds.id);
      tomb('rounds', ds.id);
      touch(live);
      save();
      render();
      toast('Round deleted');
    },
    addLate: async () => {
      const night = activeNight();
      const others = playersByRecent().filter((p) => !night.playerIds.includes(p.id));
      const r = await ask({
        title: 'Who joins the table?',
        body: `<input class="text-in" placeholder="New player name" maxlength="24" autocomplete="off" aria-label="New player name">
          ${others.length ? `<div class="pick-grid">${others.map((p) => `<button class="ptile" data-modal-value="id:${p.id}">${avatar(p.id, 'lg')}<span class="pname">${esc(p.name)}</span></button>`).join('')}</div>` : ''}`,
        buttons: [{ label: 'Add new name', value: 'new', kind: 'primary' }, { label: 'Cancel', value: null }],
      });
      let p = null;
      if (r.value && String(r.value).startsWith('id:')) p = P(String(r.value).slice(3));
      else if (r.value === 'new') p = addPlayer(r.input);
      if (!p || !p.name || night.playerIds.includes(p.id)) return;
      let start = 0;
      if (night.rounds.length) {
        const pick = await askStartPoints(night, p);
        if (pick == null) return;
        start = pick;
      }
      const live = activeNight();
      if (!live || live.playerIds.includes(p.id)) return;
      live.playerIds.push(p.id);
      if (live.rounds.length) {
        live.joins = live.joins || [];
        live.joins.push({ id: uid(), playerId: p.id, pts: start, afterRound: live.rounds.length, at: Date.now(), updatedAt: Date.now() });
      }
      touch(live);
      save();
      render();
      toast(`${p.name} joined${start ? ` with ${ptsTxt(start)} pts` : ''} 🃏`);
    },
    editJoin: async (ds) => {
      const n0 = activeNight();
      const j0 = n0 && (n0.joins || []).find((x) => x.id === ds.id);
      if (!j0) return;
      const v = await askNumber(`Starting points for ${P(j0.playerId).name}`, j0.pts, 'pts', 'Set 0 to remove the head start.');
      if (v == null) return;
      const night = activeNight();
      const j = night && (night.joins || []).find((x) => x.id === ds.id);
      if (!j) return;
      j.pts = v;
      touch(j);
      touch(night);
      save();
      render();
    },
    /* --- leaving early --- */
    /** Someone leaves the table (or, on the bill screen, is taken out of the bill split). ds.id skips the picker. */
    leavePlayer: async (ds = {}) => {
      const night = activeNight();
      if (!night) return;
      const seated = seatedIds(night);
      if (seated.length < 2) return toast('At least one player has to stay for the bill');
      const atBill = ui.view === 'bill';
      let id = ds.id && seated.includes(ds.id) ? ds.id : null;
      if (!id) {
        const r = await ask({
          title: atBill ? 'Who is not in the bill?' : 'Who is leaving?',
          body: `<p class="hint" style="margin:0 0 4px">${atBill ? 'They keep their points and are left out of the split. They can still put money in the pot or pay something toward the bill.' : 'They keep their points and are left out of the bill split. When they go they can put money in the pot and/or pay toward the bill.'}</p>
            <div class="pick-grid">${seated.map((x) => `<button class="ptile" data-modal-value="id:${x}">${avatar(x, 'lg')}<span class="pname">${nameOf(x)}</span></button>`).join('')}</div>`,
          buttons: [{ label: 'Cancel', value: null }],
        });
        if (!r.value || !String(r.value).startsWith('id:')) return;
        id = String(r.value).slice(3);
      }
      const m = await askLeaveMoney(id, {}, atBill);
      if (!m) return;
      const live = activeNight();
      if (!live || !seatedIds(live).includes(id) || seatedIds(live).length < 2) return;
      live.leaves = live.leaves || [];
      live.leaves.push({ id: uid(), playerId: id, paid: m.paid, pot: m.pot, afterRound: atBill ? lastRoundOf(live, id) : live.rounds.length, at: Date.now(), updatedAt: Date.now() });
      if (ui.draft && ui.draft.nightId === live.id) ui.draft.order = ui.draft.order.filter((x) => x !== id);
      touch(live);
      save();
      sfx.chip();
      render();
      const paidTxt = leftMoneyTxt(m.pot, m.paid);
      toast(atBill ? `${P(id).name} is not in the bill${paidTxt ? ` · ${paidTxt}` : ''}` : `👋 ${P(id).name} left${paidTxt ? ` · ${paidTxt}` : ''}`);
    },
    editLeave: async (ds) => {
      const n0 = activeNight();
      const l0 = n0 && (n0.leaves || []).find((x) => x.id === ds.id);
      if (!l0) return;
      const m = await askLeaveMoney(l0.playerId, { pot: l0.pot || 0, paid: l0.paid || 0 }, ui.view === 'bill');
      if (!m) return;
      const night = activeNight();
      const l = night && (night.leaves || []).find((x) => x.id === ds.id);
      if (!l) return;
      l.paid = m.paid;
      l.pot = m.pot;
      touch(l);
      touch(night);
      save();
      render();
    },
    undoLeave: async (ds) => {
      const n0 = activeNight();
      const l0 = n0 && (n0.leaves || []).find((x) => x.id === ds.id);
      if (!l0) return;
      if (!(await confirmBox(`${nameOf(l0.playerId)} is back?`, 'They sit at the table again and take part in the bill split.', 'Yes, back at the table', 'primary'))) return;
      const night = activeNight();
      if (!night) return;
      const gone = (night.leaves || []).filter((x) => x.playerId === l0.playerId);
      night.leaves = (night.leaves || []).filter((x) => x.playerId !== l0.playerId);
      gone.forEach((x) => tomb('leaves', x.id));
      // no longer marked Out either, so they stay in the split
      if (ui.draft && ui.draft.nightId === night.id && ui.draft.out) delete ui.draft.out[l0.playerId];
      touch(night);
      save();
      render();
      toast(`${P(l0.playerId).name} is back at the table 🃏`);
    },
    /* --- extra money toward the bill --- */
    addExtra: async () => {
      const night = activeNight();
      if (!night) return;
      const r = await ask({
        title: 'Who paid extra?',
        body: `<p class="hint" style="margin:0 0 4px">Extra money comes off the bill for everyone, like the pot.</p>
          <div class="pick-grid">${night.playerIds.map((id) => `<button class="ptile" data-modal-value="id:${id}">${avatar(id, 'lg')}<span class="pname">${nameOf(id)}</span></button>`).join('')}</div>`,
        buttons: [{ label: 'Cancel', value: null }],
      });
      if (!r.value || !String(r.value).startsWith('id:')) return;
      const id = String(r.value).slice(3);
      const v = await askNumber(`How much extra did ${nameOf(id)} pay?`, '', S().currency, 'It comes off the bill before the split.');
      if (v == null || v <= 0) return;
      ui.billExtras.push({ playerId: id, amount: v });
      sfx.chip();
      render();
    },
    removeExtra: (ds) => {
      ui.billExtras.splice(Number(ds.i), 1);
      render();
    },
    finishNight: async () => {
      const night = activeNight();
      if (!night) return;
      if (!night.rounds.length) {
        if (await confirmBox('No rounds played', 'Cancel tonight’s game? Nothing will be saved.', 'Cancel the night')) {
          db.nights = db.nights.filter((n) => n.id !== night.id);
          tomb('nights', night.id);
          save();
          ui.draft = null;
          go({ view: 'home' });
        }
        return;
      }
      // whoever is still marked Out has left the table: they are not in the bill split
      const outs = outNow(night);
      const moveOut = outs.length > 0 && outs.length < seatedIds(night).length; // somebody has to stay for the bill
      if (moveOut) {
        const now = Date.now();
        night.leaves = night.leaves || [];
        for (const id of outs) {
          night.leaves.push({ id: uid(), playerId: id, paid: 0, afterRound: lastRoundOf(night, id), out: true, at: now, updatedAt: now });
        }
        touch(night);
        save();
      }
      ui.billInput = '';
      ui.billTable = !!S().tableToInvoice;
      ui.billExtras = [];
      go({ view: 'bill' });
      if (moveOut) toast(`${namesJoin(outs)} ${outs.length > 1 ? 'were' : 'was'} Out → not in the bill`, 3200);
      setTimeout(() => {
        const inp = $('#bill-input');
        inp && inp.focus();
      }, 250);
    },
    backToGame: () => go({ view: 'game' }),
    confirmBill: () => {
      const night = activeNight();
      if (!night) return;
      const raw = ui.billInput.trim();
      const invoice = raw === '' ? 0 : parseNum(raw);
      if (!Number.isFinite(invoice) || invoice < 0) return toast('Type the bill amount (or 0)');
      // the ranking split is between the players still at the table
      const extras = ui.billExtras.filter((e) => e.amount > 0).map((e) => ({ playerId: e.playerId, amount: C.r2(e.amount) }));
      night.bill = { invoice: C.r2(invoice), shares: C.sharesFor(seatedIds(night).length, S()), tableToInvoice: ui.billTable };
      if (extras.length) night.bill.extras = extras;
      ui.billExtras = [];
      night.status = 'finished';
      night.endedAt = Date.now();
      touch(night);
      save();
      ui.draft = null;
      go({ view: 'report', reportId: night.id });
      sfx.champ();
      confetti(1.6);
      setTimeout(() => confetti(1), 900);
    },
    doneReport: () => go({ view: 'home', reportId: null }),
    shareNight: (ds) => shareText(nightText(nightById(ds.id))),
    openNight: (ds) => go({ tab: 'history', historyId: ds.id }),
    closeNight: () => go({ historyId: null }),
    reopenNight: async (ds) => {
      if (activeNight()) return toast('Finish the current night first');
      const night = nightById(ds.id);
      if (!(await confirmBox('Reopen this night?', 'You can add or delete rounds, then finish it again with the bill.', 'Reopen', 'primary'))) return;
      const again = nightById(ds.id);
      if (!again || activeNight()) return;
      again.status = 'active';
      again.device = DEVICE_ID;
      delete again.bill;
      delete again.endedAt;
      touch(again);
      save();
      ui.draft = null;
      go({ tab: 'play', view: 'game', historyId: null, reportId: null });
    },
    deleteNight: async (ds) => {
      const night = nightById(ds.id);
      if (!night) return;
      if (!(await confirmBox('Delete this night?', `${fmtDate(night.date)} — ${plural(night.rounds.length, 'round')}.<br>This removes it from all rankings and can’t be undone.`, 'Delete for good'))) return;
      db.nights = db.nights.filter((n) => n.id !== night.id);
      tomb('nights', night.id);
      save();
      go({ historyId: null, reportId: null, view: 'home' });
      toast('Night deleted');
    },

    /* --- rankings --- */
    rankType: (ds) => {
      ui.rank.type = ds.v;
      ui.rank.offset = 0;
      sfx.tap();
      render();
    },
    rankShift: (ds) => {
      ui.rank.offset = Math.min(0, ui.rank.offset + Number(ds.d));
      sfx.tap();
      render();
    },
    rankBy: (ds) => {
      ui.rank.by = ds.v;
      ui.rank.sort = null;
      sfx.tap();
      render();
    },
    rankView: (ds) => {
      ui.rank.view = ds.v;
      sfx.tap();
      render();
    },
    rankMoney: (ds) => {
      ui.rank.money = ds.v === 'net' ? 'net' : 'cards';
      sfx.tap();
      render();
    },
    rankSort: (ds) => {
      const s = ui.rank.sort;
      const cur = s || defaultSort();
      ui.rank.sort = cur.k === ds.k ? { k: ds.k, dir: -cur.dir } : { k: ds.k, dir: -1 };
      sfx.tap();
      render();
    },
    rankMetric: (ds) => {
      ui.rank.metric = ds.v;
      sfx.tap();
      render();
    },
    rankFocus: (ds) => {
      ui.rank.focus = ui.rank.focus === ds.id ? null : ds.id;
      render();
    },
    openRanking: () => {
      Object.assign(ui.rank, { type: 'month', offset: 0, view: 'board' });
      go({ tab: 'rankings' });
    },
    showPlayer: (ds) => {
      const card = playerCard(ds.id, ds.scope);
      if (!card) return;
      sfx.tap();
      ask({ title: card.title, body: card.body, buttons: [{ label: 'Close', value: null, kind: 'primary' }] });
    },
    shareRanking: () => shareText(rankingText()),

    /* --- players --- */
    addPlayer: () => {
      const input = document.querySelector('[data-input="newPlayer"]');
      const p = addPlayer(input ? input.value : ui.newPlayer);
      if (!p) return toast('Type a name first');
      ui.newPlayer = '';
      sfx.chip();
      render();
      toast(`${p.name} added`);
    },
    renamePlayer: async (ds) => {
      const p = P(ds.id);
      const name = await askText('Rename player', p.name);
      if (!name) return;
      if (db.players.some((x) => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) return toast('That name is already taken');
      const again = db.players.find((x) => x.id === ds.id);
      if (!again) return;
      again.name = name.slice(0, 24);
      touch(again);
      save();
      render();
    },
    cycleEmoji: (ds) => {
      const p = P(ds.id);
      const i = EMOJIS.indexOf(p.emoji);
      p.emoji = EMOJIS[(i + 1) % EMOJIS.length];
      if (Math.random() < 0.5) p.hue = (p.hue + 47) % 360;
      touch(p);
      save();
      sfx.tap();
      render();
    },
    toggleHide: (ds) => {
      const p = P(ds.id);
      p.hidden = !p.hidden;
      if (p.hidden) ui.showHidden = false;
      touch(p);
      save();
      render();
      toast(p.hidden ? `${p.name} hidden from the player list (history kept)` : `${p.name} is back`);
    },
    deletePlayer: async (ds) => {
      const p = P(ds.id);
      if (db.nights.some((n) => n.playerIds.includes(p.id))) return toast('Players with history can only be hidden');
      if (!(await confirmBox(`Delete ${esc(p.name)}?`, '', 'Delete'))) return;
      db.players = db.players.filter((x) => x.id !== p.id);
      tomb('players', p.id);
      save();
      render();
    },

    /* --- settings --- */
    setTheme: (ds) => {
      S().theme = ds.v;
      save();
      applyTheme();
      render();
    },
    exportData: () => exportData(),
    syncTap: () => {
      go({ tab: 'settings' });
      setTimeout(() => {
        const c = $('#sync-card');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      syncNow(true);
    },
    syncManual: () => syncNow(true),
    lockRetry: () => checkTeamFile(),
    lockOpen: async () => {
      const pass = ($('#lock-pass') || {}).value || '';
      if (!pass || lock.busy || !lock.file) return;
      lock.busy = true;
      lock.msg = '';
      render();
      try {
        const key = await Y.deriveKey(pass, lock.file.salt, lock.file.iter);
        const content = await Y.unseal(key, lock.file);
        sync.key = key;
        sync.salt = lock.file.salt;
        sync.token = content.token;
        sync.adopted = false;
        sync.error = null;
        saveSync();
        lock.busy = false;
        sfx.win();
        render({ animate: true });
        syncNow();
      } catch (_) {
        lock.busy = false;
        lock.msg = 'That password is not right.';
        render();
        const el = $('#lock-pass');
        if (el) {
          el.value = '';
          el.focus();
        }
      }
    },
    lockSetup: async () => {
      const pass = (($('#lock-pass') || {}).value || '').trim();
      const token = (($('#lock-token') || {}).value || '').trim();
      if (lock.busy) return;
      const fail = (m) => {
        lock.busy = false;
        lock.msg = m;
        render();
      };
      if (pass.length < 12) return fail('Use at least 12 characters — a few random words is best.');
      if (!token) return fail('Paste the GitHub key.');
      lock.busy = true;
      lock.msg = '';
      render();
      try {
        const bad = await checkGithubKey(token);
        if (bad) return fail(bad);
        const again = await fetchTeamFile();
        if (again && again.enc) {
          lock.busy = false;
          return checkTeamFile(); // someone set it up meanwhile
        }
        const salt = Y.newSalt();
        sync.salt = salt;
        sync.token = token;
        sync.key = await Y.deriveKey(pass, salt);
        await pushTeamData();
        sync.adopted = true;
        sync.lastSync = Date.now();
        sync.error = null;
        saveSync();
        lock.busy = false;
        sfx.champ();
        render({ animate: true });
        toast('🔒 Locked. Share the password with your players.', 4000);
      } catch (e) {
        delete sync.key;
        delete sync.salt;
        fail(e && e.message && !/fetch|network|load failed/i.test(e.message) ? e.message : 'No connection — try again.');
      }
    },
    changePassword: async () => {
      const ans = await ask({
        title: 'New team password',
        body: '<input class="text-in" placeholder="At least 12 characters" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="New team password">',
        buttons: [{ label: 'Next', value: 'ok', kind: 'primary' }, { label: 'Cancel', value: null }],
      });
      if (ans.value !== 'ok') return;
      const pass = String(ans.input || '').trim();
      if (pass.length < 12) return toast('Use at least 12 characters', 3000);
      if (!(await confirmBox('Change the password?', 'Every other phone will be asked for the new password.', 'Change it', 'primary'))) return;
      const old = { key: sync.key, salt: sync.salt };
      try {
        const remote = await fetchTeamData(); // take in the latest before re-locking
        if (remote) db = Y.mergeData(db, remote);
        saveLocal();
        sync.salt = Y.newSalt();
        sync.key = await Y.deriveKey(pass, sync.salt);
        await pushTeamData();
        saveSync();
        render();
        toast('Password changed ✓');
      } catch (e) {
        Object.assign(sync, old);
        toast(`⚠️ Not changed: ${e && e.message ? e.message : 'no connection'}`, 4000);
      }
    },
    replaceKey: async () => {
      const r = await ask({
        title: 'Replace GitHub key',
        body: `<p>Paste a new key of ${esc(sync.owner)} (gist only). All phones get it by themselves.</p><input class="text-in" type="password" autocomplete="off" autocapitalize="off" aria-label="GitHub key">`,
        buttons: [{ label: 'Save', value: 'ok', kind: 'primary' }, { label: 'Cancel', value: null }],
      });
      const key = String(r.input || '').trim();
      if (r.value !== 'ok' || !key) return;
      const old = sync.token;
      try {
        const bad = await checkGithubKey(key);
        if (bad) return toast(bad, 4000);
        sync.token = key;
        await pushTeamData();
        sync.error = null;
        saveSync();
        render();
        toast('GitHub key replaced ✓');
      } catch (e) {
        sync.token = old;
        toast('⚠️ No connection — try again', 3000);
      }
    },
    lockPhone: async () => {
      if (!(await confirmBox('Sign out this phone?', 'The team data is removed from this phone. You need the password to get back in.', 'Sign out'))) return;
      const theme = S().theme;
      db = freshDb();
      db.settings.theme = theme;
      saveLocal();
      ui.draft = null;
      Object.assign(ui, { tab: 'play', view: 'home' });
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* ignore */ }
      lockOut('');
    },
    pickImport: () => $('#import-file').click(),
    resetAll: async () => {
      if (!(await confirmBox('Erase everything?', 'This erases this phone’s copy only — the team data comes back at the next sync.', 'Erase everything'))) return;
      if (!(await confirmBox('Really sure?', 'This cannot be undone.', 'Yes, erase it all'))) return;
      db = freshDb();
      save();
      applyTheme();
      ui.draft = null;
      go({ tab: 'play', view: 'home' });
      toast('Everything erased');
    },
  };

  const inputs = {
    setupName: (v) => { if (ui.setup) ui.setup.newName = v; },
    newPlayer: (v) => { ui.newPlayer = v; },
    bill: (v) => {
      ui.billInput = v;
      const box = $('#bill-preview');
      const night = activeNight();
      if (box && night) box.innerHTML = billPreview(night);
    },
  };

  const changes = {
    billTable: (el) => {
      ui.billTable = el.checked;
      const box = $('#bill-preview');
      if (box) box.innerHTML = billPreview(activeNight());
    },
    setNum: (el) => {
      const v = parseNum(el.value);
      if (!Number.isFinite(v) || v < 0) {
        el.value = S()[el.dataset.key];
        return toast('Please type a number');
      }
      S()[el.dataset.key] = C.r2(v);
      markSettings();
      save();
      toast('Saved ✓', 1200);
    },
    setList: (el) => {
      const list = [...new Set(parseList(el.value).filter((x) => x > 0))].sort((a, b) => a - b);
      if (el.dataset.key === 'stakePicks' && !list.length) {
        el.value = S().stakePicks.join(', ');
        return toast('Give at least one number of points');
      }
      S()[el.dataset.key] = list.slice(0, 8);
      el.value = S()[el.dataset.key].join(', ');
      markSettings();
      save();
      toast('Saved ✓', 1200);
    },
    setSplit: (el) => {
      const n = Number(el.dataset.n);
      const list = parseList(el.value).slice(0, n);
      S().splits[n] = list.length ? list : [100];
      markSettings();
      save();
      const total = S().splits[n].reduce((a, b) => a + b, 0);
      el.value = S().splits[n].join(', ');
      const sum = el.parentElement.querySelector('.sum');
      if (sum) {
        sum.textContent = `${total}%`;
        sum.className = `sum ${Math.abs(total - 100) < 0.01 ? 'zero' : 'neg'}`;
      }
      toast(Math.abs(total - 100) < 0.01 ? 'Saved ✓' : `Saved — adds up to ${total}%, it will be scaled to 100%`, 2000);
    },
    setBool: (el) => {
      S()[el.dataset.key] = el.checked;
      if (Y.SHARED_SETTINGS.includes(el.dataset.key)) markSettings();
      save();
      if (el.dataset.key === 'sound' && el.checked) sfx.chip();
    },
    setText: (el) => {
      const v = el.value.trim();
      if (!v) return;
      S()[el.dataset.key] = v.slice(0, 3);
      markSettings();
      save();
      render();
    },
    importFile: (el) => {
      const file = el.files && el.files[0];
      el.value = '';
      if (file) importData(file);
    },
  };

  /* ================= backup ================= */
  async function exportData() {
    const json = JSON.stringify({ app: 'CHAMPIONS', exportedAt: new Date().toISOString(), ...db }, null, 2);
    const name = `champions-backup-${C.isoDate(new Date())}.json`;
    const markDone = () => {
      db.lastBackup = Date.now();
      save();
      render();
      toast('💾 Backup saved');
    };
    let file = null;
    try { file = new File([json], name, { type: 'application/json' }); } catch (_) { /* old browsers */ }
    if (file && isTouch() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'CHAMPIONS backup' });
        return markDone();
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markDone();
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (_) {
        return toast('That file is not a CHAMPIONS backup');
      }
      if (!data || !Array.isArray(data.players) || !Array.isArray(data.nights)) return toast('That file is not a CHAMPIONS backup');
      const when = data.exportedAt ? DATE_FMT.format(new Date(data.exportedAt)) : 'unknown date';
      const r = await ask({
        title: 'Load backup?',
        body: `<p>Backup from <b>${esc(when)}</b>: ${plural(data.players.length, 'player')}, ${plural(data.nights.length, 'night')}.</p>
          <p><b>Merge</b> adds missing players and nights to what is here.<br><b>Replace</b> swaps everything for the backup.</p>`,
        buttons: syncOn()
          ? [{ label: 'Merge into the team', value: 'merge', kind: 'primary' }, { label: 'Cancel', value: null }]
          : [{ label: 'Merge', value: 'merge', kind: 'primary' }, { label: 'Replace everything', value: 'replace', kind: 'danger' }, { label: 'Cancel', value: null }],
      });
      if (r.value === 'replace') {
        db = normalize(data);
      } else if (r.value === 'merge') {
        const incoming = normalize(data);
        const idMap = {};
        for (const p of incoming.players) {
          const same = db.players.find((x) => x.id === p.id) || db.players.find((x) => x.name.toLowerCase() === String(p.name).toLowerCase());
          if (same) idMap[p.id] = same.id;
          else {
            db.players.push(p);
            idMap[p.id] = p.id;
          }
        }
        const remap = (id) => idMap[id] || id;
        let added = 0;
        for (const n of incoming.nights) {
          if (db.nights.some((x) => x.id === n.id)) continue;
          if (n.status === 'active' && activeNight()) continue;
          n.playerIds = n.playerIds.map(remap);
          n.updatedAt = Date.now();
          for (const rd of n.rounds) {
            rd.order = (rd.order || []).map(remap);
            for (const res of rd.results) res.playerId = remap(res.playerId);
          }
          for (const j of n.joins || []) j.playerId = remap(j.playerId);
          for (const l of n.leaves || []) l.playerId = remap(l.playerId);
          for (const e of (n.bill && n.bill.extras) || []) e.playerId = remap(e.playerId);
          db.nights.push(n);
          added++;
        }
        toast(`Merged — ${plural(added, 'night')} added`);
      } else return;
      save();
      applyTheme();
      ui.draft = null;
      go({ tab: 'play', view: 'home' });
      if (r.value === 'replace') toast('Backup loaded ✓');
    };
    reader.readAsText(file);
  }

  /* ================= wiring ================= */
  function applyTheme() {
    const t = THEMES[S().theme] ? S().theme : 'felt';
    document.body.className = `theme-${t}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEMES[t].color);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || el.closest('#modal-root')) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el.dataset, el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest('[data-input]');
    if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el.value, el);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest && e.target.closest('[data-change]');
    if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target.closest && e.target.closest('[data-enter]');
    if (el && !el.closest('#modal-root') && actions[el.dataset.enter]) {
      e.preventDefault();
      actions[el.dataset.enter](el.dataset, el, e);
    }
  });
  // keep other open tabs/windows in sync
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      db = loadDb();
      render();
    }
  });

  applyTheme();
  restoreDraft();
  if (activeNight()) ui.view = 'game';
  render({ animate: true });
  startSync();
  if (!syncOn()) checkTeamFile();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ }));
  }
})();
