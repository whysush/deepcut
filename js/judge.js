// Answer judging: curated obscurity tiers first, live Wikipedia lookup for anything off-list.

import { CATEGORIES } from './data/categories.js';

/** Lower-case, strip accents/punctuation, collapse spaces, drop leading articles. */
export function normalize(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+\+/g, 'pp').replace(/#/g, ' sharp')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(a|an|the)\s+/, '')
    .replace(/\s+/g, ' ');
}
const squash = (s) => s.replace(/ /g, '');

/** Plural / spelling variants of a normalised answer to try against the index. */
function variants(n) {
  const out = new Set([n]);
  const words = n.split(' ');
  const last = words[words.length - 1];
  const swap = (w) => out.add([...words.slice(0, -1), w].join(' '));
  if (last.length > 3) {
    if (last.endsWith('ies')) swap(last.slice(0, -3) + 'y');
    if (last.endsWith('es')) swap(last.slice(0, -2));
    if (last.endsWith('s') && !last.endsWith('ss')) swap(last.slice(0, -1));
  }
  return [...out];
}

/** Optimal-string-alignment (Damerau–Levenshtein) distance with early exit above max. */
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[m];
}

const allowedTypos = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : 2);

/** Build lookup structures for a category (cached). */
const cache = new Map();
export function indexCategory(cat) {
  if (cache.has(cat.id)) return cache.get(cat.id);
  const exact = new Map();   // normalised alias (and its space-free form) -> entry
  const entries = [];
  cat.tiers.forEach((line, ti) => {
    if (!line) return;
    for (const raw of line.split('|')) {
      const aliases = raw.split('/').map((a) => a.trim()).filter(Boolean);
      if (!aliases.length) continue;
      const entry = { name: aliases[0], tier: ti + 1, keys: [] };
      for (const a of aliases) {
        const n = normalize(a);
        if (!n) continue;
        entry.keys.push(squash(n));
        if (!exact.has(n)) exact.set(n, entry);
        if (!exact.has(squash(n))) exact.set(squash(n), entry);
      }
      entries.push(entry);
    }
  });
  const nope = new Map();
  for (const [aliases, reason] of Object.entries(cat.nope || {})) {
    for (const a of aliases.split('|')) nope.set(squash(normalize(a)), reason);
  }
  const idx = { exact, entries, nope, nounKey: squash(normalize(cat.noun)) };
  cache.set(cat.id, idx);
  return idx;
}

/**
 * Judge against the curated list only (synchronous).
 * Returns { status, name?, tier?, reason?, typo? } where status is one of:
 *   'ok' | 'nope' | 'used' | 'empty' | 'unknown'
 * usedKeys: Set of entry names already played this round (repeats are not allowed).
 */
export function judgeLocal(cat, answer, usedKeys = new Set()) {
  const n = normalize(answer);
  if (!n || n.length < 2) return { status: 'empty', reason: 'Type an answer to swing.' };
  const idx = indexCategory(cat);
  const vs = variants(n);
  for (const v of vs) {
    const r = idx.nope.get(squash(v));
    if (r) return { status: 'nope', reason: r };
  }
  if (vs.some((v) => squash(v) === idx.nounKey)) return { status: 'nope', reason: `Very funny. Name a specific ${cat.noun}.` };
  let hit = null;
  for (const v of vs) { hit = idx.exact.get(v) || idx.exact.get(squash(v)); if (hit) break; }
  let typo = false;
  if (!hit) {
    // Typo tolerance on the space-free form. Ties go to the more common entry (lower tier) so typos never earn power.
    const q = squash(n);
    const maxD = allowedTypos(q.length);
    if (maxD > 0) {
      let best = null, bestD = maxD + 1;
      for (const e of idx.entries) for (const k of e.keys) {
        if (Math.abs(k.length - q.length) > maxD) continue;
        const d = editDistance(q, k, maxD);
        if (d < bestD || (d === bestD && best && e.tier < best.tier)) { bestD = d; best = e; }
      }
      if (best && bestD <= maxD) { hit = best; typo = true; }
    }
  }
  if (!hit) return { status: 'unknown' };
  if (usedKeys.has(`${cat.id}:${hit.name}`)) return { status: 'used', name: hit.name, reason: `${cap(hit.name)} was already played. Name another.` };
  return { status: 'ok', name: hit.name, tier: hit.tier, typo, source: 'list' };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- Wikipedia fallback

/** Pageviews per day -> obscurity tier for off-list answers (off-list answers start at tier 5). */
export function tierFromViews(perDay) {
  if (perDay >= 3000) return 5;
  if (perDay >= 800) return 6;
  if (perDay >= 200) return 7;
  if (perDay >= 60) return 8;
  if (perDay >= 15) return 9;
  return 10;
}

/** Does the Wikipedia page text satisfy the category's validator? */
export function wikiMatches(cat, text) {
  if (!cat.wiki) return false;
  return cat.wiki.all.every((re) => re.test(text)) && !(cat.wiki.none || []).some((re) => re.test(text));
}

/** Is the article title a plausible reading of what the player typed? */
export function titleMatches(answer, title, extract = '') {
  const a = squash(normalize(answer));
  const t = squash(normalize(title.replace(/\s*\(.*?\)\s*/g, ' ')));
  if (!a || !t) return false;
  if (a === t || t.includes(a) && a.length >= 5 || a.includes(t) && t.length >= 5) return true;
  if (editDistance(a, t, 2) <= allowedTypos(a.length)) return true;
  // Scientific-name titles: accept if the typed common name appears in the first sentence.
  return a.length >= 6 && squash(normalize(extract)).includes(a);
}

const ymd = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

async function fetchJSON(url, signal, fetchImpl) {
  const r = await fetchImpl(url, { signal, headers: { 'Api-User-Agent': 'DeepCutGolf/1.0 (github.com/whysush/deepcut)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/**
 * Look an off-list answer up on Wikipedia. Resolves to { status: 'ok', name, tier, views, source: 'wikipedia' }
 * or { status: 'unknown' | 'offline' }. Never throws. timeoutMs bounds the whole lookup.
 */
export async function judgeWikipedia(cat, answer, { timeoutMs = 4500, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (!cat.wiki || !fetchImpl) return { status: 'unknown' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const q = encodeURIComponent(answer.trim());
    const searchUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*'
      + `&generator=search&gsrsearch=${q}&gsrlimit=4&redirects=1`
      + '&prop=description|extracts|pageprops&exintro=1&explaintext=1&exsentences=2&exlimit=4&ppprop=disambiguation';
    const data = await fetchJSON(searchUrl, ctrl.signal, fetchImpl);
    const pages = (data?.query?.pages || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const page = pages.find((p) => !p.pageprops?.hasOwnProperty('disambiguation')
      && titleMatches(answer, p.title, p.extract || '')
      && wikiMatches(cat, `${p.description || ''}. ${(p.extract || '').slice(0, 300)}`));
    if (!page) return { status: 'unknown' };
    const end = new Date(now.getTime() - 2 * 86400e3), start = new Date(end.getTime() - 29 * 86400e3);
    let perDay = 0;
    try {
      const title = encodeURIComponent(page.title.replace(/ /g, '_'));
      const pv = await fetchJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${title}/daily/${ymd(start)}/${ymd(end)}`, ctrl.signal, fetchImpl);
      const items = pv?.items || [];
      perDay = items.reduce((s, it) => s + (it.views || 0), 0) / Math.max(1, items.length);
    } catch {
      perDay = 100; // pageviews unavailable: treat as a mid-niche article (tier 8)
    }
    return { status: 'ok', name: page.title.replace(/\s*\(.*?\)\s*$/, '').toLowerCase(), tier: tierFromViews(perDay), views: Math.round(perDay), source: 'wikipedia', description: page.description || '' };
  } catch (e) {
    return { status: e?.name === 'AbortError' ? 'offline' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Full judgement: list first, then Wikipedia for unknown answers in open categories. */
export async function judge(cat, answer, usedKeys, opts) {
  const local = judgeLocal(cat, answer, usedKeys);
  if (local.status !== 'unknown') return local;
  if (!cat.wiki) return { status: 'nope', reason: `That's not on the list of ${cat.noun === 'country' ? 'countries' : cat.noun + 's'}.` };
  const w = await judgeWikipedia(cat, answer, opts);
  if (w.status === 'ok') {
    if (usedKeys?.has(`${cat.id}:${w.name}`)) return { status: 'used', name: w.name, reason: `${cap(w.name)} was already played.` };
    // Off-list answer that is actually a list entry under its Wikipedia title: use the curated tier.
    const relisted = judgeLocal(cat, w.name, usedKeys);
    if (relisted.status === 'ok') return relisted;
    return w;
  }
  if (w.status === 'offline') return { status: 'nope', reason: "Couldn't verify that one (offline?). Try something more common." };
  return { status: 'nope', reason: `The caddie has never heard of that ${cat.noun}.` };
}

/**
 * Obscurity tier (1..10) -> fraction of the hole's maximum carry distance. Invalid answers still dribble the ball.
 * The game converts this to launch speed as vmax * sqrt(power), because rolling distance grows with speed squared.
 */
export function tierToPower(tier) { return tier ? tier / 10 : 0.06; }

export function categoryById(id) { return CATEGORIES.find((c) => c.id === id); }
export { CATEGORIES };
