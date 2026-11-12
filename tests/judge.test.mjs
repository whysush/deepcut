import { CATEGORIES, judgeLocal, judge, categoryById, normalize, indexCategory } from '../js/judge.js';

let failures = 0;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!cond) failures++; };

// Data integrity: no answer key appears twice inside a category (would make tiers ambiguous).
for (const cat of CATEGORIES) {
  const seen = new Map(); const dups = [];
  let entryId = 0;
  for (const [ti, line] of cat.tiers.entries()) for (const raw of (line || '').split('|')) {
    entryId++;
    for (const a of raw.split('/')) {
      const k = normalize(a).replace(/ /g, ''); if (!k) continue;
      const prev = seen.get(k);
      if (prev && prev.id !== entryId) dups.push(`${a} (t${prev.tier} & t${ti + 1})`);
      else seen.set(k, { id: entryId, tier: ti + 1 });
    }
  }
  // Nope entries must not shadow accepted answers.
  const idx = indexCategory(cat);
  const shadow = [...idx.nope.keys()].filter((k) => idx.exact.has(k));
  check(`${cat.id}: ${idx.entries.length} answers, no duplicate keys`, dups.length === 0, dups.slice(0, 6).join(', '));
  check(`${cat.id}: nope list does not shadow answers`, shadow.length === 0, shadow.join(', '));
}

const fish = categoryById('fish');
const t = (cat, a, used) => judgeLocal(categoryById(cat), a, used);
check('salmon is common', t('fish', 'salmon').tier === 1);
check('anglerfish is niche', t('fish', 'Anglerfish').tier >= 6, `tier ${t('fish', 'Anglerfish').tier}`);
check('plural + case: "Salmons"', t('fish', 'Salmons').name === 'salmon');
check('alias: "angler fish"', t('fish', 'angler fish').name === 'anglerfish');
check('typo: "anglerfsh"', t('fish', 'anglerfsh').name === 'anglerfish' && t('fish', 'anglerfsh').typo);
check('short words need exact match: "cad" is not cod', t('fish', 'cad').status === 'unknown');
check('nope: dolphin is a mammal', t('fish', 'dolphin').status === 'nope');
check('nope: category word itself', t('fish', 'fish').status === 'nope');
check('used answers rejected', t('fish', 'tuna', new Set(['fish:tuna'])).status === 'used');
check('accents: "Gruyère"', t('cheese', 'Gruyère').name === 'gruyere');
check('C++ normalises', t('code', 'C++').name === 'c++');
check('C# normalises', t('code', 'C#').name === 'c#');
check('html is nope', t('code', 'HTML').status === 'nope');
check('leading article: "the T-Rex"', t('dino', 'the T-Rex').tier === 1);
check('sarcastic fringehead is tier 10', t('fish', 'sarcastic fringehead').tier === 10);
check('ngerulmud is tier 10', t('capital', 'Ngerulmud').tier === 10);
check('mumbai is not a capital', t('capital', 'Mumbai').status === 'nope');
check('tomato accepted as fruit (niche)', t('fruit', 'tomato').status === 'ok');

// Closed categories reject unknowns without network.
const r1 = await judge(categoryById('country'), 'Wakanda', new Set(), { fetchImpl: () => { throw new Error('should not fetch'); } });
check('closed category: unknown -> nope, no network', r1.status === 'nope');

// Wikipedia fallback with a mocked fetch (realistic API payloads).
const mock = (pages, views) => async (url) => ({
  ok: true,
  json: async () => (url.includes('api.php') ? { query: { pages } } : { items: Array.from({ length: 28 }, () => ({ views })) }),
});
const pinkPage = [{ pageid: 1, index: 1, title: 'Bluespotted cornetfish', description: 'Species of fish', extract: 'The bluespotted cornetfish is a very long, thin reef fish.' }];
const r2 = await judge(fish, 'bluespotted cornetfish', new Set(), { fetchImpl: mock(pinkPage, 42) });
check('wikipedia: off-list fish accepted', r2.status === 'ok' && r2.source === 'wikipedia', JSON.stringify(r2));
check('wikipedia: 42 views/day -> tier 9', r2.tier === 9);
const sauce = [{ pageid: 2, index: 1, title: 'Fish sauce', description: 'Condiment made from fermented fish', extract: 'Fish sauce is a liquid condiment.' }];
const r3 = await judge(fish, 'fish sauce', new Set(), { fetchImpl: mock(sauce, 9000) });
check('wikipedia: "fish sauce" rejected', r3.status === 'nope');
const unrelated = [{ pageid: 3, index: 1, title: 'Atlantic salmon', description: 'Species of fish', extract: 'The Atlantic salmon is a species of ray-finned fish.' }];
const r4 = await judge(fish, 'qwertyfish', new Set(), { fetchImpl: mock(unrelated, 5000) });
check('wikipedia: unrelated search hit rejected', r4.status === 'nope');
const r5 = await judge(fish, 'zzzz', new Set(), { fetchImpl: async () => { throw Object.assign(new Error('x'), { name: 'TypeError' }); } });
check('wikipedia: network failure -> graceful nope', r5.status === 'nope');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
