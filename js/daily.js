// Daily seed, numbering, deterministic question order, and the share card.

import { CATEGORIES } from './data/categories.js';

export const LAUNCH = '2026-11-12';

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function puzzleNumber(key = todayKey()) {
  const [y, m, d] = key.split('-').map(Number);
  const [ly, lm, ld] = LAUNCH.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ly, lm - 1, ld)) / 86400e3) + 1;
}

/** String -> 32-bit seed (FNV-1a). */
export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Infinite category sequence for a seed: shuffled decks of all categories, no category twice in a row. */
export function categorySequence(seed) {
  const rand = rng(seed);
  let deck = [], last = null;
  return () => {
    if (!deck.length) {
      deck = CATEGORIES.map((c) => c.id);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      if (deck[deck.length - 1] === last) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    }
    last = deck.pop();
    return last;
  };
}

export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  return { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] ?? (d < 0 ? 'Unreal.' : `+${d}`);
}

export function scoreEmoji(strokes, par) {
  if (strokes === 1) return '⭐';
  const d = strokes - par;
  return d < 0 ? '🟦' : d === 0 ? '🟩' : d === 1 ? '🟨' : '🟥';
}

export function shareText({ number, daily, scores, pars, deepest, url }) {
  const total = scores.reduce((a, b) => a + b, 0), par = pars.reduce((a, b) => a + b, 0);
  const diff = total - par;
  const rel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  const lines = [
    daily ? `Deep Cut #${number}` : 'Deep Cut (practice)',
    `⛳ ${total} (${rel})`,
    scores.map((s, i) => scoreEmoji(s, pars[i])).join(''),
  ];
  if (deepest) lines.push(`Deepest cut: ${deepest.name} (${deepest.tier}/10)`);
  lines.push(url);
  return lines.join('\n');
}
