// Headless playthrough: loads the game, checks for errors, plays shots, takes screenshots.
// Usage: node tests/browser.cjs [outDir]   (expects a static server on :8080)
const { chromium, devices } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await phone.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/1-intro.png` });
  await p.click('#startBtn');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/2-aim.png` });
  const prompt = await p.textContent('#prompt');
  console.log('prompt:', prompt);
  // Answer with something common from whatever category came up.
  const pick = await p.evaluate(() => {
    const g = window.__deepcut.game; return g.cat.tiers[1].split('|')[0].split('/')[0];
  });
  await p.fill('#answer', pick);
  await p.click('#swingBtn');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/3-reveal.png` });
  await p.waitForFunction(() => ['aim', 'sunk'].includes(window.__deepcut.game.phase) && window.__deepcut.game.strokes === 1, null, { timeout: 15000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/4-after-shot.png` });
  const st = await p.evaluate(() => { const g = window.__deepcut.game; return { phase: g.phase, strokes: g.strokes, ball: [g.ball.x | 0, g.ball.y | 0], answers: g.answers }; });
  console.log('after shot 1:', JSON.stringify(st));
  // Invalid answer -> dribble
  await p.fill('#answer', 'not a real thing xyz');
  await p.click('#swingBtn');
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/5-nope.png` });
  await p.waitForFunction(() => window.__deepcut.game.strokes === 2 && window.__deepcut.game.phase === 'aim', null, { timeout: 20000 });
  // Force a hole-in-one on hole 2 via the test hook: aim at the calibrated ace line and answer a tier-10.
  await p.evaluate(() => { const d = window.__deepcut; d.newGame('practice'); });
  await p.waitForTimeout(200);
  const ace = await p.evaluate(async () => {
    const d = window.__deepcut, g = d.game, h = d.HOLES[0];
    g.aim = h.aceAngle;
    const ten = g.cat.tiers.map((t, i) => [t, i]).filter(([t]) => t).pop();
    const word = ten[0].split('|')[0].split('/')[0];
    await d.swing(word);
    return { word, tier: ten[1] + 1, cat: g.cat.id };
  });
  console.log('ace attempt:', JSON.stringify(ace));
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `${out}/6-hole-dialog.png` });
  const holeDone = await p.evaluate(() => ({ open: document.getElementById('holeDialog').open, name: document.getElementById('scoreName').textContent }));
  console.log('hole dialog:', JSON.stringify(holeDone));
  // Desktop layout
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await desk.newPage();
  d.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message));
  await d.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await d.click('#startBtn');
  await d.mouse.move(500, 300);
  await d.waitForTimeout(400);
  await d.screenshot({ path: `${out}/7-desktop.png` });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
