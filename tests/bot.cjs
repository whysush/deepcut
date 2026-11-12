// Bot playthrough of a full daily round: aims at the cup, reads the tier preview, answers with a list entry of the
// tier that sinks (or the farthest tier that stays short). Verifies scorecard, share text and persistence.
// Usage: node tests/bot.cjs [outDir]   (expects a static server on :8080)
const { chromium, devices } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.click('#startBtn');
  let shots = 0;
  for (let guard = 0; guard < 4000; guard++) {
    const state = await p.evaluate(() => {
      const g = window.__deepcut.game;
      return { phase: g.phase, hole: g.holeIdx, holeOpen: document.getElementById('holeDialog').open, finalOpen: document.getElementById('finalDialog').open };
    });
    if (state.finalOpen) break;
    if (state.holeOpen) { await p.click('#nextHoleBtn'); await p.waitForTimeout(150); continue; }
    if (state.phase !== 'aim') { await p.waitForTimeout(150); continue; }
    await p.waitForTimeout(80); // let the preview compute
    const word = await p.evaluate(() => {
      const d = window.__deepcut, g = d.game, h = d.HOLES[g.holeIdx], b = g.ball;
      // Tiers this category can actually answer (non-empty tier with an unused entry).
      const pickWord = (t) => { const line = g.cat.tiers[t - 1]; if (!line) return null; for (const e of line.split('|')) { const w = e.split('/')[0]; if (!g.used.has(`${g.cat.id}:${w}`)) return w; } return null; };
      let best = null;
      for (let deg = 0; deg < 360; deg += 1) {
        const a = deg * Math.PI / 180;
        for (let t = 1; t <= 10; t++) {
          if (!pickWord(t)) continue;
          const r = d.simulateShot(h, b.x, b.y, a, h.vmax * Math.sqrt(d.tierToPower(t)));
          if (r.result === 'water') continue;
          const dist = r.result === 'sunk' ? -10 + Math.abs(t - 5.5) * 0.01 : Math.hypot(r.x - h.cup[0], r.y - h.cup[1]);
          if (!best || dist < best.dist) best = { dist, a, t };
        }
      }
      g.aim = best.a;
      return pickWord(best.t);
    });
    await p.fill('#answer', word);
    await p.click('#swingBtn');
    shots++;
    await p.waitForTimeout(400);
  }
  await p.screenshot({ path: `${out}/final.png` });
  const res = await p.evaluate(() => ({
    total: document.getElementById('finalTotal').textContent, rel: document.getElementById('finalRel').textContent,
    scores: window.__deepcut.game.scores, stored: !!localStorage.getItem(`deepcut:daily:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`),
  }));
  await p.click('#shareBtn').catch(() => {});
  const shareTxt = await p.evaluate(() => navigator.clipboard.readText().catch(() => '(clipboard unavailable)'));
  console.log('shots', shots, JSON.stringify(res));
  console.log('share:\n' + shareTxt);
  // Reload: the finished daily must show the scorecard instead of a new round.
  await p.reload();
  await p.waitForTimeout(500);
  console.log('after reload, final open:', await p.evaluate(() => document.getElementById('finalDialog').open));
  console.log('errors:', errors.length ? errors : 'none');
  await b.close();
})();
