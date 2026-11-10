/* CHAMPIONS — team sync helpers. Pure functions (no network, no screen),
   so the merge rules can be tested on their own: node tests/sync.test.js

   How merging works when two phones have different data:
   - players and nights: the most recently changed copy wins (updatedAt)
   - rounds and late-join entries inside a night: kept from both phones
   - anything deleted stays deleted (a "tombstone" remembers the delete time)
   - money rules (settings): the most recently changed set wins;
     look & sound stay personal to each phone */
(function (root) {
  'use strict';

  const FILE = 'champions-data.json';
  const SHARED_SETTINGS = [
    'currency', 'pointValue', 'stakePicks', 'quickAmounts', 'tableFee',
    'potThreshold', 'potFeeBelow', 'potFeeAt', 'potFeeAbove', 'tableToInvoice', 'splits',
  ];
  const KINDS = ['nights', 'players', 'rounds', 'joins'];

  const ts = (x) => Number(x && x.updatedAt) || 0;
  const newer = (x, y) => (ts(y) > ts(x) ? y : x);

  function emptyDeleted() {
    return { nights: {}, players: {}, rounds: {}, joins: {} };
  }

  function mergeDeleted(a, b) {
    const out = emptyDeleted();
    for (const src of [a, b]) {
      if (!src) continue;
      for (const k of KINDS) {
        for (const [id, t] of Object.entries(src[k] || {})) out[k][id] = Math.max(out[k][id] || 0, Number(t) || 0);
      }
    }
    return out;
  }

  /** Union of two lists by id; pick(a, b) decides when both have the same id. */
  function unionById(listA, listB, pick) {
    const map = new Map();
    for (const x of listA || []) if (x && x.id) map.set(x.id, x);
    for (const y of listB || []) {
      if (!y || !y.id) continue;
      const x = map.get(y.id);
      map.set(y.id, x ? pick(x, y) : y);
    }
    return [...map.values()];
  }

  function mergeNight(x, y) {
    const base = newer(x, y);
    const other = base === x ? y : x;
    const playerIds = (base.playerIds || []).slice();
    for (const id of other.playerIds || []) if (!playerIds.includes(id)) playerIds.push(id);
    const rounds = unionById(base.rounds, other.rounds, (a) => a);
    const joins = unionById(base.joins, other.joins, newer);
    return { ...base, playerIds, rounds, joins };
  }

  /** Combine this phone's data with the team data. Returns new data for this phone. */
  function mergeData(local, remote) {
    if (!remote || typeof remote !== 'object') return local;
    const deleted = mergeDeleted(local.deleted, remote.deleted);
    const alive = (kind, item) => !(deleted[kind][item.id] && deleted[kind][item.id] >= ts(item));

    const players = unionById(local.players, remote.players, newer).filter((p) => alive('players', p));

    const nightMap = new Map();
    for (const n of local.nights || []) if (n && n.id) nightMap.set(n.id, n);
    for (const n of remote.nights || []) {
      if (!n || !n.id) continue;
      const m = nightMap.get(n.id);
      nightMap.set(n.id, m ? mergeNight(m, n) : n);
    }
    const nights = [...nightMap.values()]
      .filter((n) => alive('nights', n))
      .map((n) => ({
        ...n,
        rounds: (n.rounds || []).filter((r) => !deleted.rounds[r.id]).sort((a, b) => (a.at || 0) - (b.at || 0)),
        joins: (n.joins || []).filter((j) => !deleted.joins[j.id]),
      }));

    let settings = local.settings;
    let settingsUpdatedAt = Number(local.settingsUpdatedAt) || 0;
    if (remote.settings && (Number(remote.settingsUpdatedAt) || 0) > settingsUpdatedAt) {
      settings = { ...local.settings };
      for (const k of SHARED_SETTINGS) if (k in remote.settings) settings[k] = remote.settings[k];
      settingsUpdatedAt = Number(remote.settingsUpdatedAt) || 0;
    }
    return { ...local, players, nights, deleted, settings, settingsUpdatedAt };
  }

  /** What gets uploaded: everything except personal look & sound and backup dates. */
  function toPayload(db) {
    const settings = {};
    for (const k of SHARED_SETTINGS) if (db.settings && k in db.settings) settings[k] = db.settings[k];
    return {
      app: 'CHAMPIONS',
      version: 1,
      players: db.players || [],
      nights: db.nights || [],
      deleted: mergeDeleted(db.deleted, null),
      settings,
      settingsUpdatedAt: Number(db.settingsUpdatedAt) || 0,
    };
  }

  /** A stable text form of the data, to tell whether two copies are the same. */
  function fingerprint(payload) {
    if (!payload) return '';
    const byId = (a, b) => String(a.id).localeCompare(String(b.id));
    const sortKeys = (v) => {
      if (Array.isArray(v)) return v.map(sortKeys);
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]);
        return o;
      }
      return v;
    };
    const p = toPayload(payload);
    p.players = p.players.slice().sort(byId);
    p.nights = p.nights
      .map((n) => ({ ...n, joins: (n.joins || []).slice().sort(byId) }))
      .sort(byId);
    return JSON.stringify(sortKeys(p));
  }

  /**
   * First time a phone joins the team: if it already has players with the same
   * names as the team's, use the team's players (so "Reza" is not there twice).
   */
  function adoptRemoteIds(local, remote) {
    const remotePlayers = (remote && remote.players) || [];
    const map = {};
    for (const p of local.players || []) {
      if (remotePlayers.some((r) => r.id === p.id)) continue;
      const same = remotePlayers.find((r) => String(r.name).toLowerCase() === String(p.name).toLowerCase());
      if (same) map[p.id] = same.id;
    }
    if (!Object.keys(map).length) return local;
    const re = (id) => map[id] || id;
    return {
      ...local,
      players: (local.players || []).filter((p) => !map[p.id]),
      nights: (local.nights || []).map((n) => ({
        ...n,
        playerIds: [...new Set((n.playerIds || []).map(re))],
        rounds: (n.rounds || []).map((r) => ({
          ...r,
          order: (r.order || []).map(re),
          results: (r.results || []).map((x) => ({ ...x, playerId: re(x.playerId) })),
        })),
        joins: (n.joins || []).map((j) => ({ ...j, playerId: re(j.playerId) })),
      })),
    };
  }

  /** Read "https://gist.github.com/owner/id", "owner/id" … into { owner, id }. */
  function parseTeamLink(text) {
    const t = String(text || '').trim();
    const m = t.match(/gist\.github(?:usercontent)?\.com\/([A-Za-z0-9-]+)\/([0-9a-f]{20,})/i) || t.match(/^([A-Za-z0-9-]+)\/([0-9a-f]{20,})$/i);
    return m ? { owner: m[1], id: m[2].toLowerCase() } : null;
  }

  /* ---------- password lock (encryption) ----------
     The team password is turned into a key (PBKDF2), and the team data is
     encrypted with it (AES-GCM) before it leaves a phone. */
  const ITERATIONS = 600000;
  const subtle = () => (typeof crypto !== 'undefined' ? crypto : globalThis.crypto).subtle;
  const rand = (n) => (typeof crypto !== 'undefined' ? crypto : globalThis.crypto).getRandomValues(new Uint8Array(n));
  function toB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(text) {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const newSalt = () => toB64(rand(16));

  /** Password + salt → key (as text, to remember on this phone). */
  async function deriveKey(password, salt, iter) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations: iter || ITERATIONS }, base, 256);
    return toB64(new Uint8Array(bits));
  }
  const aesKey = (key) => subtle().importKey('raw', fromB64(key), 'AES-GCM', false, ['encrypt', 'decrypt']);

  /** Encrypt content into the file that is stored on GitHub. */
  async function seal(key, salt, content, iter) {
    const iv = rand(12);
    const data = await subtle().encrypt({ name: 'AES-GCM', iv }, await aesKey(key), new TextEncoder().encode(JSON.stringify(content)));
    return { app: 'CHAMPIONS', enc: 1, iter: iter || ITERATIONS, salt, iv: toB64(iv), data: toB64(new Uint8Array(data)) };
  }
  /** Decrypt the stored file. Throws when the password (key) is wrong. */
  async function unseal(key, file) {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, await aesKey(key), fromB64(file.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  const SyncLib = {
    ITERATIONS, newSalt, deriveKey, seal, unseal,
    FILE, SHARED_SETTINGS, emptyDeleted, mergeData, adoptRemoteIds, toPayload, fingerprint, parseTeamLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = SyncLib;
  else root.SyncLib = SyncLib;
})(typeof self !== 'undefined' ? self : this);
