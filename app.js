/* CHAMPIONS — screens and interactions. All the math lives in calc.js. */
(() => {
  'use strict';
  const C = window.Calc;
  const Y = window.SyncLib;
  const KEY = 'champions.v1';
  const APP_VERSION = '1.0';
  const EMOJIS = ['🦁', '🐯', '🦊', '🐺', '🦅', '🐻', '🐼', '🦈', '🐙', '🦄', '🐲', '🦖', '🐸', '🐵', '🦉', '🐝', '🦂', '🐊', '🦬', '🐆', '🦩', '🐧', '🐳', '🦍', '🐗', '🦓', '🐍', '🦚'];
  const CHIP_COLORS = ['#e23b3b', '#2f6fe0', '#1f9d55', '#222226', '#8e44ad', '#e67e22', '#c99a06'];
  const THEMES = {
    felt: { name: 'Vegas', swatch: 'radial-gradient(circle at 50% 20%, #1f8f55, #04210f)', color: '#0a3a22' },
    royal: { name: 'Royal', swatch: 'radial-gradient(circle at 50% 20%, #5134b5, #0b0626)', color: '#1a1240' },
    ruby: { name: 'Ruby', swatch: 'radial-gradient(circle at 50% 20%, #b1213b, #220308)', color: '#3a0912' },
    ocean: { name: 'Ocean', swatch: 'radial-gradient(circle at 50% 20%, #1a6aa3, #020d1a)', color: '#0b2236' },
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
    return `${sign}${txt} ${S().currency}`;
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
  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank));
  const medalTxt = (rank) => (rank <= 3 ? medal(rank) : `${rank}.`);
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
  const logo = (small) => `<header class="logo ${small ? 'small' : ''}">${CROWN}<h1>CHAMPIONS</h1>${small ? '' : '<p>Poker night · points · the bill</p>'}</header>`;

  /* ================= UI state ================= */
  const ui = {
    tab: 'play',
    view: 'home', // play tab: home | setup | bill | report
    setup: null,
    draft: null,
    reportId: null,
    historyId: null,
    rank: { type: 'month', offset: 0, by: 'points' },
    billInput: '',
    billTable: false,
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
        const inp = root.querySelector('input, textarea');
        const input = inp ? inp.value : null;
        root.innerHTML = '';
        root.onclick = null;
        root.onkeydown = null;
        if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
        resolve({ value, input });
        if (renderPending) setTimeout(() => renderPending && render(), 60);
      };
      root.onclick = (e) => {
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
    const billBy = C.billByPlayer(night, sum);
    const L = [];
    L.push(`🏆 CHAMPIONS — ${fmtDate(night.date)}`);
    if (sum.champions.length) {
      const top = sum.players[0];
      L.push(`👑 Champion: ${namesJoin(sum.champions)} with ${ptsTxt(top.pts)} points`);
    }
    L.push('', `Ranking (${plural(sum.rounds, 'round')}):`);
    for (const p of sum.players) {
      L.push(`${medalTxt(p.rank)} ${P(p.playerId).name} — ${ptsTxt(p.pts)} pts${p.start ? ` (incl. ${ptsTxt(p.start)} start pts)` : ''} · won ${money(p.won)} · lost ${money(p.lost)} · fees ${money(p.fees)}`);
    }
    L.push('', `🍯 Pot: ${money(sum.potTotal)} · 🪑 Table: ${money(sum.tableTotal)}`);
    if (plan) {
      L.push(`🧾 Bill ${money(plan.invoice)} − ${plan.tableToInvoice ? 'pot + table' : 'pot'} ${money(plan.covered)} = ${money(plan.remaining)} to pay`);
      for (const l of plan.lines) if (l.amount > 0) L.push(`   • ${P(l.playerId).name}: ${pctTxt(l.pct)} → ${money(l.amount)}${l.tied ? ' (tied)' : ''}`);
      if (plan.leftover > 0) L.push(`   ${money(plan.leftover)} left over in the pot`);
    }
    L.push('', 'Tonight overall (money − fees − bill):');
    for (const p of sum.players) L.push(`   ${P(p.playerId).name}: ${money(p.net - (billBy[p.playerId] || 0), true)}`);
    return L.join('\n');
  }

  /* ================= team sync ================= */
  // The team's shared data lives in a secret GitHub gist. Every phone reads it
  // (no limit, no login); phones with the team key also save to it.
  const TEAM_DEFAULT = { owner: 'Yalame', id: '' };
  const SYNC_KEY = `${KEY}.sync`;
  function loadSync() {
    let st = {};
    try {
      st = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') || {};
    } catch (_) {
      st = {};
    }
    if (!st.id && !st.disconnected && TEAM_DEFAULT.id) Object.assign(st, TEAM_DEFAULT);
    return st;
  }
  let sync = loadSync();
  function saveSync() {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (_) { /* ignore */ }
  }
  const syncOn = () => !!(sync.owner && sync.id);
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
  async function fetchTeamData() {
    if (canWrite()) {
      const r = await fetch(`${API()}/gists/${sync.id}`, { headers: ghHeaders(sync.token), cache: 'no-store' });
      if (!r.ok) throw new Error(syncError(r.status));
      const g = await r.json();
      const f = g.files && g.files[Y.FILE];
      if (!f) return null;
      return parseTeamText(f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content);
    }
    const r = await fetch(`${RAW()}/${sync.owner}/${sync.id}/raw/${Y.FILE}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(syncError(r.status));
    return parseTeamText(await r.text());
  }
  async function pushTeamData() {
    const r = await fetch(`${API()}/gists/${sync.id}`, {
      method: 'PATCH',
      headers: { ...ghHeaders(sync.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [Y.FILE]: { content: JSON.stringify(Y.toPayload(db)) } } }),
    });
    if (r.status === 403 || r.status === 404) throw new Error('This team key can’t save the team data (wrong GitHub account?).');
    if (!r.ok) throw new Error(syncError(r.status));
    sync.lastPush = Date.now();
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
      if (canWrite() && Y.fingerprint(db) !== Y.fingerprint(remote)) await pushTeamData();
      sync.lastSync = Date.now();
      sync.error = null;
      if (manual) toast('☁️ Synced with the team');
    } catch (e) {
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
      text = '⚠️ Sync problem';
    } else if (!sync.lastSync) text = '☁️ Connecting to the team…';
    else text = `☁️ ${canWrite() ? 'Team sync' : 'View only'} · ${agoTxt(sync.lastSync)}`;
    return `<button class="sync-chip ${kind}" data-action="syncTap">${text}</button>`;
  }
  const syncBar = () => (syncOn() ? `<div class="sync-bar"><span class="sync-slot">${syncChip()}</span></div>` : '');
  function updateSyncChips() {
    document.querySelectorAll('.sync-slot').forEach((el) => {
      el.innerHTML = syncChip();
    });
  }

  function syncCard() {
    if (!syncOn()) {
      return `
      <section class="card" id="sync-card">
        <h3>☁️ Team sync</h3>
        <p class="hint" style="margin:0 0 10px">Share one history between all your phones. Paste the team link (a GitHub gist address).</p>
        <div class="add-row">
          <input class="text-in" id="team-link" placeholder="https://gist.github.com/…" autocomplete="off" autocapitalize="off" spellcheck="false" data-enter="connectTeam" aria-label="Team link">
          <button class="secondary" data-action="connectTeam">Connect</button>
        </div>
      </section>`;
    }
    const link = `https://gist.github.com/${encodeURIComponent(sync.owner)}/${encodeURIComponent(sync.id)}`;
    return `
      <section class="card" id="sync-card">
        <div class="card-head"><h3>☁️ Team sync</h3><span class="sync-slot">${syncChip()}</span></div>
        <ul class="calc-lines">
          <li><span>Team data</span><b><a href="${link}" target="_blank" rel="noopener">${esc(sync.owner)}/${esc(sync.id.slice(0, 7))}…</a></b></li>
          <li><span>This phone</span><b>${canWrite() ? '✅ saves to the team' : '👀 view only'}</b></li>
          <li><span>Last synced</span><b>${sync.lastSync ? DATE_TIME_FMT.format(new Date(sync.lastSync)) : 'not yet'}</b></li>
        </ul>
        ${sync.error ? `<p class="hint warn">⚠️ ${esc(sync.error)}</p>` : ''}
        ${canWrite()
          ? `<div class="btn-row"><button class="secondary" data-action="syncManual">🔄 Sync now</button><button class="ghost" data-action="removeKey">Remove key</button></div>`
          : `<p class="hint" style="margin:12px 0 8px">To enter games from this phone, paste the <b>team key</b> (ask ${esc(sync.owner)}). Without it, this phone follows the team's games live.</p>
          <div class="add-row">
            <input class="text-in" type="password" id="team-key" placeholder="Team key" autocomplete="off" autocapitalize="off" spellcheck="false" data-enter="saveKey" aria-label="Team key">
            <button class="secondary" data-action="saveKey">Save</button>
          </div>
          <button class="link" data-action="syncManual" style="margin-top:8px">🔄 Sync now</button>`}
        <details style="margin-top:12px"><summary class="muted">How does ${esc(sync.owner)} make a team key?</summary>
          <ol class="rules">
            <li>Open <a href="https://github.com/settings/tokens/new?description=CHAMPIONS%20team%20key&amp;scopes=gist" target="_blank" rel="noopener">this GitHub page</a> while signed in as ${esc(sync.owner)}.</li>
            <li>Leave only <b>gist</b> ticked, pick an expiry, tap <b>Generate token</b>.</li>
            <li>Paste it here, and send it privately to the other scorekeepers.</li>
          </ol>
          <p class="hint">A gist-only key can change ${esc(sync.owner)}'s gists — not the app or any repository.</p>
        </details>
        <button class="link" data-action="disconnectTeam" style="margin-top:6px;color:var(--ink-3)">Disconnect this phone</button>
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
    let html = '';
    if (ui.tab === 'play') html = renderPlay();
    else if (ui.tab === 'rankings') html = renderRankings();
    else if (ui.tab === 'history') html = renderHistory();
    else if (ui.tab === 'players') html = renderPlayers();
    else html = renderSettings();
    app.innerHTML = `<div class="${opts.animate ? 'view-enter' : ''}">${html}</div>`;
    renderTabbar();
    if (opts.top) window.scrollTo({ top: 0 });
  }
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
    const needBackup = finished.length >= 3 && (!db.lastBackup || Date.now() - db.lastBackup > 30 * 864e5);
    const installHint = !isStandalone() && isIOS();
    return `
      ${logo()}
      ${syncBar()}
      <button class="cta" data-action="newNight">
        <span class="cta-icon">🃏</span>
        <span><b>Start tonight</b><small>Pick the players and deal the first round</small></span>
      </button>

      ${installHint ? `<section class="card notice"><span class="ico">📲</span><div><b>Install on your iPhone</b><p>Tap <b>Share</b> <span aria-hidden="true">⬆️</span> then <b>Add to Home Screen</b>.</p></div></section>` : ''}
      ${needBackup ? `<section class="card notice"><span class="ico">💾</span><div style="flex:1"><b>Save a backup</b><p>Keep your history safe — takes 2 seconds.</p></div><button class="link" data-action="exportData">Backup</button></section>` : ''}

      ${last && lastSum.champions.length ? `
      <section class="card">
        <div class="card-head"><h3>Last champion</h3><button class="link" data-action="openNight" data-id="${last.id}">See night →</button></div>
        <div class="last-champ">
          ${lastSum.champions.map((id) => avatar(id, 'lg')).join('')}
          <div><b>👑 ${esc(namesJoin(lastSum.champions))}</b><span class="muted">${fmtDate(last.date)} · ${ptsTxt(lastSum.players[0].pts)} points</span></div>
        </div>
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h3>${MONTH_FMT.format(new Date())}</h3><button class="link" data-action="tab" data-tab="rankings">Full ranking →</button></div>
        ${month.length ? `<div class="mini-board">${month.slice(0, 5).map((p) => `
          <div class="row">
            <span class="rk ${p.rank <= 3 ? 'medal' : ''}">${medal(p.rank)}</span>
            ${avatar(p.playerId)}
            <span class="nm"><span class="name">${nameOf(p.playerId)}</span><small>${plural(p.nights, 'night')} · ${moneyHtml(p.total, true)}</small></span>
            <span class="crowns" title="Champion nights">${p.champions ? `👑${p.champions}` : ''}</span>
            <span class="score">${ptsTxt(p.pts)}<small>pts</small></span>
          </div>`).join('')}</div>` : `<div class="empty"><span class="big">🂡</span>No finished nights this month yet.<br>Start one and crown a champion!</div>`}
      </section>

      <div class="stats3">
        <div class="stat"><b>${finished.length}</b><small>nights</small></div>
        <div class="stat"><b>${totalRounds}</b><small>rounds</small></div>
        <div class="stat"><b>${esc(money(totalPot))}</b><small>pot total</small></div>
      </div>`;
  }

  function monthStandings() {
    const range = C.periodRange('month', 0);
    return C.sortStandings(C.aggregate(finishedNights().filter((n) => C.inRange(n.date, range))), 'points');
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
        <button class="primary" data-action="startNight" ${ready ? '' : 'disabled'}>${ready ? 'Shuffle up & deal 🃏' : `Pick ${st.count - n > 0 ? st.count - n + ' more' : n - st.count + ' fewer'}`}</button>
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
    d.order = d.order.filter((id) => night.playerIds.includes(id) && !d.out[id]);
    return d;
  }
  /** Everything the round screen needs, computed once. */
  function roundState(night) {
    const d = draftFor(night);
    const s = S();
    const full = C.fullAmount(d.points, s);
    const active = night.playerIds.filter((id) => !d.out[id]);
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
        <div class="pills"><span class="pill">🍯 Pot ${moneyHtml(sum.potTotal)}</span><span class="pill">🪑 Table ${moneyHtml(sum.tableTotal)}</span></div>
      </div>
      <section class="card notice"><span class="ico">👀</span><div><b>Following the team's game live</b><p>New rounds appear by themselves. To enter rounds on this phone, add the team key in Settings.</p></div></section>
      ${scoreboard(night, sum)}
      ${roundsCard(night, false)}`;
  }

  function scoreboard(night, sum) {
    return `
      <section class="card">
        <div class="card-head"><h3>Tonight's table</h3><span class="muted">${plural(night.rounds.length, 'round')}</span></div>
        <div class="board">${sum.players.map((p) => `
          <div class="board-row">
            <span class="rk ${night.rounds.length && p.rank <= 3 ? 'medal' : ''}">${night.rounds.length ? medal(p.rank) : '·'}</span>
            ${avatar(p.playerId)}
            <span class="nm"><span class="name">${nameOf(p.playerId)}${sum.champions.includes(p.playerId) ? ' 👑' : ''}</span>
              <small>${p.start ? `${ptsTxt(p.start)} start pts · ` : ''}${plural(p.roundsWon, 'win')} · money <span class="${cls(p.net)}">${moneyHtml(p.net, true)}</span> after fees</small></span>
            <span class="score">${ptsTxt(p.pts)}<small>pts</small></span>
          </div>`).join('')}</div>
      </section>`;
  }

  /** Rounds and late joins in order (newest first while playing). */
  function roundsCard(night, editable) {
    const items = night.rounds.map((r, i) => ({ key: i + 1, html: roundRow(r, i, editable) }));
    for (const j of night.joins || []) items.push({ key: (j.afterRound || 0) + 0.5, html: joinRow(j, editable) });
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
      <div class="round-no">＋<small>joined</small></div>
      <div class="round-main"><b>${avatar(j.playerId, 'sm')} ${nameOf(j.playerId)} joined after round ${j.afterRound}</b>
        <small>started with ${ptsTxt(j.pts)} pts</small></div>
      ${editable ? `<button class="icon-btn" data-action="editJoin" data-id="${j.id}" aria-label="Change starting points of ${nameOf(j.playerId)}">✎</button>` : ''}
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
          <button class="${isCustom ? 'on' : ''}" data-action="setAmt" data-id="${id}" data-v="custom" aria-label="Other amount">${isCustom ? C.r2(v) : '✎'}</button>
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
        ? `<span>🥇 <b>${nameOf(d.order[0])}</b> wins · tap the rest in order (${remaining.length - 1} more)</span>`
        : '<span>👆 Tap who won, then 2nd, 3rd … down to last</span>';
    } else {
      const w = preview.results[0];
      previewHtml = `<span>🥇 <b>${nameOf(w.playerId)}</b> +${ptsTxt(w.pts)} pts · wins <b class="pos">${moneyHtml(w.won)}</b></span>
        <span>pays ${moneyHtml(w.table)} table + ${moneyHtml(w.pot)} pot → <b class="${cls(w.won - w.table - w.pot)}">${moneyHtml(w.won - w.table - w.pot, true)}</b></span>`;
    }

    return `
      ${syncBar()}
      <div class="game-top">
        <div><span class="eyebrow">Tonight · ${fmtDate(night.date)}</span><h2>Round ${roundNo}</h2></div>
        <div class="pills"><span class="pill">🍯 Pot ${moneyHtml(sum.potTotal)}</span><span class="pill">🪑 Table ${moneyHtml(sum.tableTotal)}</span></div>
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
        <div class="bets">${night.playerIds.map(betRow).join('')}</div>
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
        <button class="secondary" data-action="addLate">＋ Player joins</button>
        <button class="danger" data-action="finishNight">🏁 We're done</button>
      </div>`;
  }

  function roundRow(r, i, deletable) {
    const w = r.results[0];
    const others = r.results.slice(1).map((x) => `${esc(P(x.playerId).name)} ${x.place}. −${C.r2(x.lost)}`).join(' · ');
    return `<div class="round-row">
      <div class="round-no">R${i + 1}<small>${ptsTxt(r.points)} pt${r.points === 1 ? '' : 's'}</small></div>
      <div class="round-main"><b>🥇 ${nameOf(w.playerId)} +${ptsTxt(w.pts)} pts · ${moneyHtml(w.won, true)}</b>
        <small>played ${moneyHtml(w.played)} · table ${moneyHtml(w.table)} · pot ${moneyHtml(w.pot)}</small>
        <small>${others}</small></div>
      ${deletable ? `<button class="icon-btn" data-action="deleteRound" data-id="${r.id}" aria-label="Delete round ${i + 1}">✕</button>` : ''}
    </div>`;
  }

  /* ---------- the bill ---------- */
  function billPreview(night) {
    const sum = C.nightSummary(night);
    const invoice = parseNum(ui.billInput);
    const plan = C.billPlan(sum, { invoice: Number.isFinite(invoice) ? invoice : 0, shares: C.sharesFor(sum.players.length, S()), tableToInvoice: ui.billTable });
    const shares = C.sharesFor(sum.players.length, S());
    return `
      <ul class="calc-lines">
        <li><span>Bill</span><b>${moneyHtml(plan.invoice)}</b></li>
        <li><span>− Pot collected</span><b>${moneyHtml(sum.potTotal)}</b></li>
        ${plan.tableToInvoice ? `<li><span>− Table money</span><b>${moneyHtml(sum.tableTotal)}</b></li>` : ''}
        <li class="total"><span>Still to pay</span><b>${moneyHtml(plan.remaining)}</b></li>
        ${plan.leftover > 0 ? `<li><span>Left over in the pot</span><b class="pos">${moneyHtml(plan.leftover)}</b></li>` : ''}
      </ul>
      <p class="hint">${sum.players.length} players → last place pays ${shares.map((x) => `${x}%`).join(' · ')}. Players tied on points share equally.</p>
      <div style="margin-top:8px">${plan.lines.map((l) => `
        <div class="pay-row ${l.amount > 0 ? '' : 'free'}">
          ${avatar(l.playerId, 'sm')}
          <span class="nm"><span class="name">${nameOf(l.playerId)}${l.tied ? '<span class="tie-tag">tied</span>' : ''}</span><small>${ordinal(l.rank)} place</small></span>
          <span class="pct">${pctTxt(l.pct)}</span>
          <span class="amt">${l.amount > 0 ? moneyHtml(l.amount) : '—'}</span>
        </div>`).join('')}</div>`;
  }

  function renderBill(night) {
    const sum = C.nightSummary(night);
    return `
      <h2 class="page-title">🏁 That's it for tonight</h2>
      <p class="page-sub">${plural(night.rounds.length, 'round')} played · pot ${moneyHtml(sum.potTotal)} · table ${moneyHtml(sum.tableTotal)}</p>
      <section class="card">
        <h3>How much is the bill?</h3>
        <div class="money-in" style="margin-top:10px">
          <input id="bill-input" inputmode="decimal" placeholder="0" value="${esc(ui.billInput)}" data-input="bill" data-enter="confirmBill" aria-label="Bill amount">
          <span>${esc(S().currency)}</span>
        </div>
        <label class="check"><input type="checkbox" data-change="billTable" ${ui.billTable ? 'checked' : ''}> Also use the table money (${moneyHtml(sum.tableTotal)}) for the bill</label>
      </section>
      <section class="card" id="bill-preview">${billPreview(night)}</section>
      <div class="stack">
        <button class="primary" data-action="confirmBill">Crown the champion 👑</button>
        <button class="ghost" data-action="backToGame">← Back to the table</button>
      </div>`;
  }

  /* ---------- night report ---------- */
  function renderReport(night, fresh) {
    const sum = C.nightSummary(night);
    const plan = night.bill ? C.billPlan(sum, night.bill) : null;
    const billBy = C.billByPlayer(night, sum);
    const champs = sum.champions;
    const canReopen = !activeNight();
    return `
      ${fresh ? '' : '<button class="link" data-action="closeNight">← All nights</button>'}
      <div class="champ-banner">
        <div class="rays"></div>
        <span class="eyebrow">${champs.length > 1 ? 'Champions' : 'Champion'} of the night · ${fmtDate(night.date)}</span>
        ${champs.length ? `${CROWN}<div class="avs">${champs.map((id) => avatar(id, 'xl')).join('')}</div>
          <h2>${esc(namesJoin(champs))}</h2>
          <p class="champ-pts">${ptsTxt(sum.players[0].pts)} points · ${plural(sum.players[0].roundsWon, 'round')} won</p>`
          : '<h2>No champion</h2><p class="champ-pts">Everyone finished level.</p>'}
      </div>

      <section class="card">
        <h3>🧾 The bill</h3>
        ${plan ? `
        <ul class="calc-lines">
          <li><span>Bill</span><b>${moneyHtml(plan.invoice)}</b></li>
          <li><span>− ${plan.tableToInvoice ? 'Pot + table' : 'Pot'}</span><b>${moneyHtml(plan.covered)}</b></li>
          <li class="total"><span>Paid by players</span><b>${moneyHtml(plan.remaining)}</b></li>
          ${plan.leftover > 0 ? `<li><span>Left over in the pot</span><b class="pos">${moneyHtml(plan.leftover)}</b></li>` : ''}
        </ul>
        ${plan.lines.filter((l) => l.amount > 0).map((l) => `
          <div class="pay-row">${avatar(l.playerId, 'sm')}<span class="nm"><span class="name">${nameOf(l.playerId)}${l.tied ? '<span class="tie-tag">tied</span>' : ''}</span></span>
          <span class="pct">${pctTxt(l.pct)}</span><span class="amt">${moneyHtml(l.amount)}</span></div>`).join('')}`
          : '<p class="muted">No bill was entered for this night.</p>'}
        ${!plan || plan.tableToInvoice ? '' : `<p class="hint">Table money collected: <b>${moneyHtml(sum.tableTotal)}</b></p>`}
      </section>

      <section class="card">
        <h3>Who won, who lost</h3>
        ${sum.players.map((p) => {
          const bill = billBy[p.playerId] || 0;
          const total = C.r2(p.net - bill);
          return `<div class="res ${champs.includes(p.playerId) ? 'is-champ' : ''}">
            <div class="res-head"><span class="rk ${p.rank <= 3 ? 'medal' : ''}">${medal(p.rank)}</span>${avatar(p.playerId)}
              <span class="nm"><span class="name">${nameOf(p.playerId)}${champs.includes(p.playerId) ? ' 👑' : ''}</span><small>${plural(p.roundsWon, 'round')} won of ${p.roundsPlayed}${p.start ? ` · joined late with ${ptsTxt(p.start)} pts` : ''}</small></span>
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
        <button class="primary" data-action="shareNight" data-id="${night.id}">📤 Share the report</button>
        ${fresh ? '<button class="secondary" data-action="doneReport">Done</button>' : ''}
        <div class="btn-row" style="margin:0">
          <button class="ghost" data-action="reopenNight" data-id="${night.id}" ${canReopen ? '' : 'disabled title="Finish the current night first"'}>↩︎ Reopen night</button>
          <button class="danger" data-action="deleteNight" data-id="${night.id}">🗑 Delete night</button>
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
  function rankingData() {
    const { type, offset, by } = ui.rank;
    const range = C.periodRange(type, offset);
    const nights = finishedNights().filter((n) => C.inRange(n.date, range));
    const list = C.sortStandings(C.aggregate(nights), by);
    return { range, nights, list };
  }
  function renderRankings() {
    const { type, offset, by } = ui.rank;
    const { range, nights, list } = rankingData();
    const topPts = C.sortStandings(list, 'points')[0];
    const topCh = C.sortStandings(list, 'champions')[0];
    const types = [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All time']];
    return `
      <h2 class="page-title">🏆 Rankings</h2>
      <div class="segbar">${types.map(([k, l]) => `<button class="${type === k ? 'on' : ''}" data-action="rankType" data-v="${k}">${l}</button>`).join('')}</div>
      ${type !== 'all' ? `<div class="period-nav">
        <button class="icon-btn" data-action="rankShift" data-d="-1" aria-label="Previous">◀</button>
        <b>${periodLabel(range)}</b>
        <button class="icon-btn" data-action="rankShift" data-d="1" aria-label="Next" ${offset >= 0 ? 'disabled style="opacity:.3"' : ''}>▶</button>
      </div>` : ''}
      ${list.length ? `
      <div class="kings">
        <div class="king"><small>⭐ Most points</small>${avatar(topPts.playerId, 'lg')}<span class="nm">${nameOf(topPts.playerId)}</span><span class="big">${ptsTxt(topPts.pts)} pts</span></div>
        <div class="king"><small>👑 Most crowns</small>${topCh.champions ? `${avatar(topCh.playerId, 'lg')}<span class="nm">${nameOf(topCh.playerId)}</span><span class="big">${topCh.champions}× champ</span>` : '<span class="nm">—</span>'}</div>
      </div>
      <section class="card">
        <div class="card-head"><h3>${plural(nights.length, 'night')}</h3>
          <div class="segbar" style="margin:0;width:190px"><button class="${by === 'points' ? 'on' : ''}" data-action="rankBy" data-v="points">Points</button><button class="${by === 'champions' ? 'on' : ''}" data-action="rankBy" data-v="champions">Crowns</button></div>
        </div>
        <div class="rank-head"><span class="rk">#</span><span class="nm">Player</span><span class="crowns">👑</span><span class="score" style="min-width:52px">Pts</span></div>
        ${list.map((p) => `
          <div class="rank-row ${p.rank === 1 ? 'top1' : ''}">
            <span class="rk ${p.rank <= 3 ? 'medal' : ''}">${medal(p.rank)}</span>
            ${avatar(p.playerId)}
            <span class="nm"><span class="name">${nameOf(p.playerId)}</span>
              <small>${plural(p.nights, 'night')} · ${plural(p.roundsWon, 'round')} won · <span class="${cls(p.total)}">${moneyHtml(p.total, true)}</span></small></span>
            <span class="crowns">${p.champions || '·'}</span>
            <span class="score" style="min-width:52px">${ptsTxt(p.pts)}</span>
          </div>`).join('')}
        <p class="hint">Money shown is after table, pot and bill. 👑 = champion nights.</p>
      </section>
      <button class="primary" data-action="shareRanking">📤 Share this report</button>`
      : `<section class="card"><div class="empty"><span class="big">🂮</span>No finished nights in this period.</div></section>`}`;
  }
  function rankingText() {
    const { range, nights, list } = rankingData();
    const L = [`🏆 CHAMPIONS — ${periodLabel(range)}`, `${plural(nights.length, 'night')} played`, ''];
    const topPts = C.sortStandings(list, 'points')[0];
    const topCh = C.sortStandings(list, 'champions')[0];
    if (topPts) L.push(`⭐ Most points: ${P(topPts.playerId).name} (${ptsTxt(topPts.pts)})`);
    if (topCh && topCh.champions) L.push(`👑 Most crowns: ${P(topCh.playerId).name} (${topCh.champions}×)`);
    L.push('');
    for (const p of list) {
      L.push(`${medalTxt(p.rank)} ${P(p.playerId).name} — ${ptsTxt(p.pts)} pts · 👑${p.champions} · ${money(p.total, true)} (${plural(p.nights, 'night')})`);
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
        <span class="night-main"><b>${sum.champions.length ? `👑 ${esc(namesJoin(sum.champions))}` : 'No champion'}</b>
          <small>${plural(n.playerIds.length, 'player')} · ${plural(sum.rounds, 'round')}${n.bill ? ` · bill ${moneyHtml(n.bill.invoice)}` : ''}</small></span>
        <span class="score">${sum.champions.length ? ptsTxt(sum.players[0].pts) : ''}<small>${sum.champions.length ? 'pts' : ''}</small></span>
      </button>`;
    }).join('');
    return `
      <h2 class="page-title">📅 History</h2>
      ${syncBar()}
      <p class="page-sub">Every night, its champion and the full report.</p>
      ${live ? `<button class="night" data-action="tab" data-tab="play">
        <span class="night-date"><b>${toDate(live.date).getDate()}</b><small>NOW</small></span>
        <span class="night-main"><b><span class="live-dot"></span>Game in progress</b><small>${plural(live.playerIds.length, 'player')} · ${plural(live.rounds.length, 'round')}</small></span>
        <span class="link">Open →</span></button>` : ''}
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
        <span class="nm"><span class="name">${esc(p.name)}</span><small>${st ? `${plural(st.nights, 'night')} · 👑 ${st.champions} · ${ptsTxt(st.pts)} pts · ${moneyHtml(st.total, true)}` : 'No nights yet'}</small></span>
        <span class="acts">
          <button class="icon-btn" data-action="renamePlayer" data-id="${p.id}" aria-label="Rename ${esc(p.name)}">✎</button>
          <button class="icon-btn" data-action="toggleHide" data-id="${p.id}" aria-label="${p.hidden ? 'Show' : 'Hide'} ${esc(p.name)}">${p.hidden ? '↩︎' : '🙈'}</button>
          ${!st && !db.nights.some((n) => n.playerIds.includes(p.id)) ? `<button class="icon-btn" data-action="deletePlayer" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">🗑</button>` : ''}
        </span>
      </div>`;
    };
    return `
      <h2 class="page-title">👥 Players</h2>
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
      <h2 class="page-title">⚙️ Settings</h2>

      <section class="card">
        <h3>How CHAMPIONS counts</h3>
        <ol class="rules">
          <li>Before every round you choose the <b>points</b>. 1 point = <b>${moneyHtml(s.pointValue)}</b>.</li>
          <li>Each player plays <b>${(s.quickAmounts || []).map((q) => moneyHtml(q)).join(', ')}</b> or the <b>full amount</b> (points × ${moneyHtml(s.pointValue)}).</li>
          <li><b>Points</b> only depend on your place: winner gets players × points, each next place one step less, last gets 1 × points.</li>
          <li><b>Money</b>: only the winner collects. Each player pays the winner what they played, but never more than the winner played.</li>
          <li>The winner pays <b>${moneyHtml(s.tableFee)}</b> for the table, plus <b>${moneyHtml(s.potFeeAt)}</b> to the pot if they played ${moneyHtml(s.potThreshold)}, or <b>${moneyHtml(s.potFeeAbove)}</b> if they played more${s.potFeeBelow ? `, or ${moneyHtml(s.potFeeBelow)} if less` : ''}.</li>
          <li>At the end, the pot is taken off the bill. The rest is paid by the lowest places (e.g. 4 players: 50 · 30 · 20 %). Ties share equally.</li>
          <li>Someone <b>joining late</b> can get starting points: last place's points, the table average, 0 or any number.</li>
          <li>The <b>champion</b> of the night is whoever has the most points.</li>
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
          <button class="secondary" data-action="exportData">💾 Save backup</button>
          <button class="secondary" data-action="pickImport">📂 Load backup</button>
        </div>
        <p class="hint">Last backup: <b>${db.lastBackup ? DATE_FMT.format(new Date(db.lastBackup)) : 'never'}</b> · ${plural(db.players.length, 'player')} · ${plural(db.nights.length, 'night')}</p>
      </section>

      <section class="card">
        <h3>Install the app</h3>
        <ol class="rules">
          <li><b>iPhone:</b> open the app link in <b>Safari</b> → Share ⬆️ → <b>Add to Home Screen</b>.</li>
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
        body: `<p style="font-size:18px">🥇 <b>${nameOf(w.playerId)}</b> wins ${moneyHtml(w.won)} and +${ptsTxt(w.pts)} pts</p>
          <p>Keep playing? Pick the points for round ${night.rounds.length + 1}:</p>
          <div class="chips">${picks.map((p, i) => `<button class="pchip ${p === round.points ? 'sel' : ''}" data-modal-value="pts:${p}"><span class="disc" style="--c:${CHIP_COLORS[i % CHIP_COLORS.length]}"><b>${p}</b></span><small>${moneyHtml(C.fullAmount(p, S()))}</small></button>`).join('')}</div>`,
        buttons: [
          { label: `Next round with ${ptsTxt(round.points)} pt${round.points === 1 ? '' : 's'} ▶`, value: `pts:${round.points}`, kind: 'primary' },
          { label: "🏁 We're done for tonight", value: 'done', kind: 'danger' },
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
      if (!(await confirmBox(`Delete round ${idx + 1}?`, `🥇 ${nameOf(r.results[0].playerId)} +${ptsTxt(r.results[0].pts)} pts · ${moneyHtml(r.results[0].won)}<br>Its points, money and fees will be removed.`, 'Delete round'))) return;
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
      ui.billInput = '';
      ui.billTable = !!S().tableToInvoice;
      go({ view: 'bill' });
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
      night.bill = { invoice: C.r2(invoice), shares: C.sharesFor(night.playerIds.length, S()), tableToInvoice: ui.billTable };
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
      sfx.tap();
      render();
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
    connectTeam: () => {
      const t = Y.parseTeamLink(($('#team-link') || {}).value);
      if (!t) return toast('Paste the gist link, like https://gist.github.com/name/1234…', 3500);
      sync = { owner: t.owner, id: t.id };
      saveSync();
      render();
      syncNow(true);
    },
    saveKey: async () => {
      const el = $('#team-key');
      const key = el ? el.value.trim() : '';
      if (!key) return toast('Paste the team key first');
      try {
        const r = await fetch(`${API()}/user`, { headers: ghHeaders(key), cache: 'no-store' });
        if (r.status === 401) return toast('GitHub did not accept that key', 3000);
        if (!r.ok) return toast(syncError(r.status), 3000);
        const u = await r.json();
        if (String(u.login).toLowerCase() !== String(sync.owner).toLowerCase()) {
          return toast(`That key belongs to ${u.login}, but the team data belongs to ${sync.owner}`, 4500);
        }
      } catch (_) {
        return toast('No internet — try again', 3000);
      }
      sync.token = key;
      sync.error = null;
      saveSync();
      render();
      syncNow(true);
    },
    removeKey: async () => {
      if (!(await confirmBox('Remove the team key?', 'This phone becomes view-only.', 'Remove key'))) return;
      delete sync.token;
      saveSync();
      render();
    },
    disconnectTeam: async () => {
      if (!(await confirmBox('Disconnect this phone?', 'This phone stops syncing. Everything already on it stays here.', 'Disconnect'))) return;
      sync = { disconnected: true };
      saveSync();
      render();
    },
    pickImport: () => $('#import-file').click(),
    resetAll: async () => {
      if (!(await confirmBox('Erase everything?', syncOn() ? 'This erases this phone’s copy only — the team data comes back at the next sync. To leave the team, use “Disconnect this phone” first.' : 'All players, nights and settings on this device will be deleted. Save a backup first if you might need them.', 'Erase everything'))) return;
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

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ }));
  }
})();
