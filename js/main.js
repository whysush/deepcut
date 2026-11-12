// Game controller: state machine, input, timing, UI panels, scoring and persistence.

import { getHoles } from './course.js';
import { prepareHole, step, simulateShot, DT, BALL_R } from './physics.js';
import { judge, tierToPower, categoryById } from './judge.js';
import { createRenderer, tierColor } from './render.js';
import { todayKey, puzzleNumber, hashSeed, categorySequence, scoreName, shareText } from './daily.js';
import { sfx, unlockAudio, isMuted, setMuted } from './sound.js';

const MAX_STROKES = 8;
const ANSWER_SECONDS = 40;
const SITE_URL = 'https://whysush.in/';
const TIER_LABEL = ['', 'First thing anyone says', 'Very common', 'Common', 'Well known', 'Middle of the road', 'Uncommon', 'Niche', 'Deep cut', 'Specialist', 'Legendary'];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('course'), prompt: $('prompt'), answer: $('answer'), form: $('answerForm'), swing: $('swingBtn'), hint: $('hint'),
  ask: $('askView'), reveal: $('revealView'), revealAnswer: $('revealAnswer'), revealTier: $('revealTier'), meter: $('meter'), verdict: $('verdict'),
  timerBar: $('timerBar'), toast: $('toast'), holeNum: $('holeNum'), holeName: $('holeName'), par: $('par'), strokes: $('strokes'),
  intro: $('introDialog'), holeDialog: $('holeDialog'), finalDialog: $('finalDialog'),
};

// ---------------------------------------------------------------- persistence (best effort)
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode etc. */ } },
};

// ---------------------------------------------------------------- game state
const renderer = createRenderer(el.canvas);
const HOLES = getHoles().map(prepareHole);
let game;

function newGame(mode) {
  const dateKey = todayKey();
  const seed = mode === 'daily' ? hashSeed(`deepcut-${dateKey}`) : (Math.random() * 2 ** 32) >>> 0;
  game = {
    mode, dateKey, number: puzzleNumber(dateKey), seed,
    nextCat: categorySequence(seed),
    holeIdx: 0, scores: [], answers: [], used: new Set(),
    phase: 'idle', strokes: 0, ball: null, lastRest: null, aim: 0, cat: null,
    preview: null, previewPath: null, previewKey: '', trail: [], confetti: null,
    deadline: 0, judging: false,
  };
  startHole(0);
}

function hole() { return HOLES[game.holeIdx]; }

function startHole(i) {
  game.holeIdx = i;
  const h = hole();
  game.strokes = 0;
  game.ball = { x: h.tee[0], y: h.tee[1], vx: 0, vy: 0 };
  game.lastRest = [...h.tee];
  game.sinkAnim = null; game.splash = null; game.ballHidden = false; game.confetti = null;
  renderer.setHole(h);
  el.holeNum.textContent = `Hole ${i + 1} of ${HOLES.length}`;
  el.holeName.textContent = h.name;
  el.par.textContent = h.par;
  updateStrokes();
  nextStroke();
}

function updateStrokes() { el.strokes.textContent = game.strokes; }

function nextStroke() {
  const h = hole();
  game.cat = categoryById(game.nextCat());
  game.aim = Math.atan2(h.cup[1] - game.ball.y, h.cup[0] - game.ball.x);
  game.previewKey = '';
  game.trail = [];
  game.phase = 'aim';
  el.prompt.textContent = game.cat.prompt;
  el.answer.value = '';
  el.answer.disabled = false;
  el.swing.disabled = false;
  el.ask.hidden = false;
  el.reveal.hidden = true;
  el.hint.hidden = game.holeIdx > 0 || game.strokes > 0;
  game.deadline = performance.now() + ANSWER_SECONDS * 1000;
  if (window.matchMedia('(min-width: 900px)').matches) el.answer.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- aim + tier preview
function computePreview() {
  const h = hole(), b = game.ball;
  const key = `${game.holeIdx}:${b.x.toFixed(1)}:${b.y.toFixed(1)}:${game.aim.toFixed(4)}`;
  if (key === game.previewKey) return;
  game.previewKey = key;
  const preview = [];
  let longest = null;
  for (let t = 1; t <= 10; t++) {
    const r = simulateShot(h, b.x, b.y, game.aim, h.vmax * Math.sqrt(tierToPower(t)), { recordEvery: 3 });
    preview.push({ tier: t, x: r.x, y: r.y, result: r.result });
    longest = r;
  }
  game.preview = preview;
  game.previewPath = longest.path;
}

function setAimToward(lx, ly) {
  if (game.phase !== 'aim') return;
  const b = game.ball;
  if (Math.hypot(lx - b.x, ly - b.y) < BALL_R * 1.5) return;
  game.aim = Math.atan2(ly - b.y, lx - b.x);
}

function nudgeAim(deg) {
  if (game.phase !== 'aim') return;
  game.aim += (deg * Math.PI) / 180;
  sfx.tick();
}

let dragging = false;
el.canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (game.phase !== 'aim') return;
  dragging = true;
  el.canvas.setPointerCapture(e.pointerId);
  setAimToward(...renderer.toLogical(e.clientX, e.clientY));
  if (document.activeElement === el.answer && e.pointerType === 'touch') el.answer.blur();
});
el.canvas.addEventListener('pointermove', (e) => { if (dragging) setAimToward(...renderer.toLogical(e.clientX, e.clientY)); });
const endDrag = () => { dragging = false; };
el.canvas.addEventListener('pointerup', endDrag);
el.canvas.addEventListener('pointercancel', endDrag);

// Press-and-hold fine aim buttons.
for (const [id, dir] of [['aimLeft', -1], ['aimRight', 1]]) {
  const btn = $(id);
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    nudgeAim(dir * 0.4);
    let n = 0;
    timer = setInterval(() => { n++; nudgeAim(dir * (n > 12 ? 1.2 : 0.4)); }, 70);
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nudgeAim(dir * 0.4); } });
}
window.addEventListener('keydown', (e) => {
  if (game?.phase !== 'aim') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (document.activeElement === el.answer && el.answer.value) return; // let the caret move while typing
    e.preventDefault();
    nudgeAim((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 3 : 0.4));
  }
});

// ---------------------------------------------------------------- swing
el.form.addEventListener('submit', (e) => { e.preventDefault(); unlockAudio(); swing(el.answer.value); });

async function swing(text, timedOut = false) {
  if (game.phase !== 'aim' || game.judging) return;
  game.judging = true;
  game.phase = 'judging';
  el.answer.disabled = true; el.swing.disabled = true;
  const cat = game.cat;
  let res;
  if (timedOut) res = { status: 'nope', reason: "Time's up. The ball barely moves." };
  else {
    const slow = setTimeout(() => toast('Checking Wikipedia…'), 300);
    res = await judge(cat, text, game.used);
    clearTimeout(slow);
    hideToast();
  }
  game.judging = false;
  const ok = res.status === 'ok';
  if (ok) game.used.add(`${cat.id}:${res.name}`);
  game.answers.push({ hole: game.holeIdx, cat: cat.prompt, text: text.trim(), name: ok ? res.name : text.trim(), tier: ok ? res.tier : 0, source: res.source });
  await showReveal(ok ? res.name : (text.trim() || '…'), res);
  launch(tierToPower(ok ? res.tier : 0));
}

function buildMeter() {
  el.meter.innerHTML = '';
  for (let t = 1; t <= 10; t++) { const i = document.createElement('i'); i.style.setProperty('--c', tierColor(t)); el.meter.appendChild(i); }
}
buildMeter();

function showReveal(name, res) {
  return new Promise((resolve) => {
    game.phase = 'reveal';
    el.ask.hidden = true; el.reveal.hidden = false;
    el.revealAnswer.textContent = name;
    const ok = res.status === 'ok';
    el.revealAnswer.classList.toggle('nope', !ok);
    const tier = ok ? res.tier : 0;
    el.revealTier.textContent = tier;
    const cells = [...el.meter.children];
    cells.forEach((c) => c.classList.remove('on'));
    if (ok) {
      const extra = res.source === 'wikipedia'
        ? `Off our list, so we checked Wikipedia: about ${res.views.toLocaleString()} views a day.`
        : res.typo ? 'Spelling forgiven.' : '';
      el.verdict.innerHTML = '';
      el.verdict.append(TIER_LABEL[tier]);
      if (extra) { const s = document.createElement('small'); s.textContent = extra; el.verdict.append(s); }
    } else {
      el.verdict.innerHTML = '';
      el.verdict.append(res.reason || 'Not accepted.');
      const s = document.createElement('small'); s.textContent = 'Dribble shot.'; el.verdict.append(s);
      sfx.nope();
    }
    if (reducedMotion || !ok) {
      cells.forEach((c, i) => c.classList.toggle('on', i < tier));
      setTimeout(resolve, ok ? 500 : 1400);
      return;
    }
    let i = 0;
    const iv = setInterval(() => {
      if (i < tier) { cells[i].classList.add('on'); sfx.tick(); i++; }
      else { clearInterval(iv); setTimeout(resolve, 420); }
    }, 70);
  });
}

function launch(power) {
  const h = hole();
  const v = h.vmax * Math.sqrt(power);
  game.lastRest = [game.ball.x, game.ball.y];
  game.ball.vx = Math.cos(game.aim) * v;
  game.ball.vy = Math.sin(game.aim) * v;
  game.strokes++;
  updateStrokes();
  game.trail = [];
  game.phase = 'rolling';
  game.acc = 0;
  game.stepCount = 0;
  sfx.hit(power);
}

// ---------------------------------------------------------------- shot resolution
function onShotEnd(result) {
  const h = hole();
  if (result === 'sunk') {
    game.phase = 'sunk';
    game.ballHidden = true;
    game.sinkAnim = { t0: performance.now() / 1000 };
    sfx.sink();
    const score = game.strokes;
    game.scores[game.holeIdx] = score;
    if (score === 1) { sfx.ace(); if (!reducedMotion) burstConfetti(); }
    setTimeout(() => showHoleDialog(score, h.par), score === 1 ? 1300 : 750);
    return;
  }
  if (result === 'water') {
    sfx.splash();
    game.splash = { x: game.ball.x, y: game.ball.y, t0: performance.now() / 1000 };
    game.strokes++;
    updateStrokes();
    toast('Splash. One-stroke penalty.');
    game.ball.x = game.lastRest[0]; game.ball.y = game.lastRest[1];
  }
  game.ball.vx = game.ball.vy = 0;
  if (game.strokes >= MAX_STROKES) {
    game.phase = 'sunk';
    game.scores[game.holeIdx] = MAX_STROKES;
    toast('Picked up. Max strokes reached.');
    setTimeout(() => showHoleDialog(MAX_STROKES, h.par, true), 900);
    return;
  }
  setTimeout(nextStroke, result === 'water' ? 900 : 250);
}

function bestAnswerOnHole(i) {
  return game.answers.filter((a) => a.hole === i && a.tier > 0).sort((a, b) => b.tier - a.tier)[0];
}

function showHoleDialog(score, par, pickedUp = false) {
  $('scoreName').textContent = pickedUp ? 'Picked up' : scoreName(score, par);
  $('scoreLine').textContent = `${score} stroke${score === 1 ? '' : 's'} on a par ${par}`;
  const best = bestAnswerOnHole(game.holeIdx);
  $('scoreBest').textContent = best ? `Deepest cut: ${best.name} (${best.tier}/10)` : '';
  const last = game.holeIdx === HOLES.length - 1;
  $('nextHoleBtn').textContent = last ? 'See scorecard' : 'Next hole';
  el.holeDialog.showModal();
}

$('nextHoleBtn').addEventListener('click', () => {
  el.holeDialog.close();
  if (game.holeIdx < HOLES.length - 1) startHole(game.holeIdx + 1);
  else finishRound();
});

function deepestCut() {
  return game.answers.filter((a) => a.tier > 0).sort((a, b) => b.tier - a.tier)[0] || null;
}

function finishRound() {
  game.phase = 'done';
  const result = { scores: game.scores, deepest: deepestCut(), answers: game.answers, number: game.number };
  if (game.mode === 'daily') store.set(`deepcut:daily:${game.dateKey}`, result);
  showFinal(result, game.mode === 'daily');
}

let shareString = '';
function showFinal(result, daily) {
  const pars = HOLES.map((h) => h.par);
  const total = result.scores.reduce((a, b) => a + b, 0), parTotal = pars.reduce((a, b) => a + b, 0);
  const diff = total - parTotal;
  $('finalKicker').textContent = daily ? `Deep Cut #${result.number}` : 'Practice round';
  $('finalTotal').textContent = total;
  $('finalRel').textContent = diff === 0 ? 'even par' : diff > 0 ? `+${diff}` : `${diff}`;
  const grid = $('scorecard');
  grid.innerHTML = '';
  HOLES.forEach((h, i) => { const d = document.createElement('div'); d.className = 'h'; d.textContent = i + 1; grid.append(d); });
  HOLES.forEach((h) => { const d = document.createElement('div'); d.className = 'p'; d.textContent = h.par; grid.append(d); });
  result.scores.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 's ' + (s === 1 ? 'ace' : s < pars[i] ? 'under' : s > pars[i] ? 'over' : '');
    d.textContent = s; grid.append(d);
  });
  $('deepest').textContent = result.deepest ? `Deepest cut: ${result.deepest.name} (${result.deepest.tier}/10)` : 'No accepted answers this round.';
  const list = $('answerList');
  list.innerHTML = '';
  for (const a of result.answers) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = a.tier ? a.name : (a.text || '(no answer)');
    const em = document.createElement('em'); em.textContent = ` ${a.cat.replace(/^Name an? /, '')}`; left.append(em);
    const b = document.createElement('b'); b.textContent = a.tier || '×'; if (a.tier) b.style.setProperty('--c', tierColor(a.tier));
    li.append(left, b); list.append(li);
  }
  shareString = shareText({ number: result.number, daily, scores: result.scores, pars, deepest: result.deepest, url: SITE_URL });
  $('practiceBtn').textContent = daily ? 'Play a practice round' : 'Play another practice round';
  updateCountdown();
  if (!el.finalDialog.open) el.finalDialog.showModal();
}

function updateCountdown() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  $('nextCourse').textContent = `New course in ${hh}:${mm}:${ss}`;
}
setInterval(() => { if (el.finalDialog.open) updateCountdown(); }, 1000);

$('shareBtn').addEventListener('click', async () => {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text: shareString }); return; }
    await navigator.clipboard.writeText(shareString);
    $('shareBtn').textContent = 'Copied';
    setTimeout(() => { $('shareBtn').textContent = 'Share result'; }, 1600);
  } catch { /* share sheet dismissed */ }
});
$('practiceBtn').addEventListener('click', () => { el.finalDialog.close(); newGame('practice'); });

// ---------------------------------------------------------------- toast, confetti
let toastTimer;
function toast(msg) { el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 2200); }
function hideToast() { el.toast.classList.remove('show'); }

function burstConfetti() {
  const [cx, cy] = hole().cup;
  const colors = ['#ee3d33', '#ffc93c', '#ffffff', '#3b8cf0', '#46b35f'];
  game.confetti = Array.from({ length: 90 }, () => {
    const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 260;
    return { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 180, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, color: colors[Math.floor(Math.random() * colors.length)] };
  });
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (game) {
    if (game.phase === 'rolling') {
      game.acc += dt;
      while (game.acc >= DT && game.phase === 'rolling') {
        game.acc -= DT;
        const r = step(hole(), game.ball);
        if (game.ball.bounced) sfx.bounce();
        if (++game.stepCount % 3 === 0) { game.trail.push([game.ball.x, game.ball.y]); if (game.trail.length > 40) game.trail.shift(); }
        if (r) onShotEnd(r);
      }
    } else if (game.trail.length) {
      game.trail.shift();
    }
    if (game.phase === 'aim') {
      computePreview();
      const left = (game.deadline - now) / 1000;
      el.timerBar.style.transform = `scaleX(${Math.max(0, left / ANSWER_SECONDS)})`;
      el.timerBar.classList.toggle('low', left < 8);
      const blocked = el.intro.open || el.finalDialog.open;
      if (left <= 0 && !blocked) swing(el.answer.value, !el.answer.value.trim());
      if (blocked) game.deadline = now + ANSWER_SECONDS * 1000; // clock waits while a dialog is open
    }
    if (game.confetti) {
      for (const c of game.confetti) { c.vy += 420 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.vx *= 0.99; }
      if (game.confetti.every((c) => c.y > 700)) game.confetti = null;
    }
    renderer.draw({
      hole: hole(), ball: game.ball, ballHidden: game.ballHidden, showPreview: game.phase === 'aim',
      preview: game.preview, previewPath: game.previewPath, trail: game.trail,
      sinkAnim: game.sinkAnim, splash: game.splash, confetti: game.confetti,
    }, now / 1000);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- viewport (mobile keyboards)
function fitViewport() {
  const vv = window.visualViewport;
  document.documentElement.style.setProperty('--app-h', `${Math.round(vv ? vv.height : window.innerHeight)}px`);
  renderer.resize();
}
window.visualViewport?.addEventListener('resize', fitViewport);
window.addEventListener('resize', fitViewport);
new ResizeObserver(() => renderer.resize()).observe($('stage'));

// ---------------------------------------------------------------- chrome buttons + boot
const muteBtn = $('muteBtn');
const syncMute = () => { muteBtn.setAttribute('aria-pressed', String(isMuted())); muteBtn.setAttribute('aria-label', isMuted() ? 'Unmute sound' : 'Mute sound'); };
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); syncMute(); });
syncMute();
$('helpBtn').addEventListener('click', () => el.intro.showModal());
$('startBtn').addEventListener('click', () => {
  unlockAudio();
  el.intro.close();
  store.set('deepcut:seenIntro', true);
  if (game?.phase === 'aim') { game.deadline = performance.now() + ANSWER_SECONDS * 1000; el.answer.focus({ preventScroll: true }); }
});

fitViewport();
newGame('daily');
const finished = store.get(`deepcut:daily:${todayKey()}`);
if (finished && finished.scores?.length === HOLES.length) {
  showFinal(finished, true);
} else if (!store.get('deepcut:seenIntro')) {
  el.intro.showModal();
}
requestAnimationFrame(frame);

// Test hook (used by the automated browser playthrough).
window.__deepcut = { get game() { return game; }, HOLES, swing, newGame, startHole, simulateShot, tierToPower };
