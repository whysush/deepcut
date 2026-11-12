// Canvas renderer for the course. Logical space 400 x 640 is scaled to fit the canvas.

import { BALL_R, CUP_R, WALL_PAD } from './physics.js';
import { rng } from './daily.js';

export const W = 400, H = 640;

const C = {
  turf: '#46b35f', stripe: '#40aa58', rail: '#e9b56c', railDark: '#7b4b22', railLight: '#f6d39b',
  sand: '#f2d593', sandDot: '#d9b56a', water: '#3b8cf0', waterLight: '#8cc2ff', cup: '#13281c',
  flag: '#ee3d33', ball: '#ffffff', ink: '#17263c', shadow: 'rgba(23, 38, 60, 0.22)',
};

/** Tier 1..10 -> marker colour: cool green for common answers, through yellow, to hot red for deep cuts. */
export function tierColor(t) {
  const stops = [[1, [154, 214, 170]], [5, [255, 201, 60]], [10, [238, 61, 51]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
  const f = (t - a[0]) / Math.max(1, b[0] - a[0]);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function polyPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1, ox = 0, oy = 0, dpr = 1;
  let view = { x: 0, y: 0, w: W, h: H }; // logical rectangle to fit on screen (the current hole's bounds)
  let cssW = 1, cssH = 1;
  const speckleCache = new WeakMap();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    cssW = r.width; cssH = r.height;
    fit();
  }

  // Screen strips kept clear for the overlay buttons (sound/help at the top, fine-aim at the bottom).
  const INSET = { top: 52, bottom: 62, left: 8, right: 8 };
  function fit() {
    const aw = Math.max(50, cssW - INSET.left - INSET.right), ah = Math.max(50, cssH - INSET.top - INSET.bottom);
    scale = Math.min(aw / view.w, ah / view.h);
    ox = INSET.left + (aw - view.w * scale) / 2 - view.x * scale;
    oy = INSET.top + (ah - view.h * scale) / 2 - view.y * scale;
  }

  /** Zoom to a hole: its outer polygon plus room for rails, shadow and the flag. */
  function setHole(h) {
    const xs = h.outer.map((p) => p[0]), ys = h.outer.map((p) => p[1]);
    const pad = 18;
    view = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad - 6, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 + 14 };
    fit();
  }

  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return [(clientX - r.left - ox) / scale, (clientY - r.top - oy) / scale];
  }

  function speckles(poly) {
    if (speckleCache.has(poly)) return speckleCache.get(poly);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const r = rng(Math.round(xs[0] * 31 + ys[0] * 17));
    const pts = [];
    for (let i = 0; i < 160; i++) pts.push([Math.min(...xs) + r() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + r() * (Math.max(...ys) - Math.min(...ys)), 0.6 + r() * 1.1]);
    speckleCache.set(poly, pts);
    return pts;
  }

  function drawCourse(h, t) {
    // Drop shadow + turf with mowing stripes.
    ctx.save();
    ctx.translate(0, 7);
    polyPath(ctx, h.outer); ctx.fillStyle = C.shadow; ctx.fill();
    ctx.restore();
    ctx.save();
    polyPath(ctx, h.outer); ctx.clip();
    ctx.fillStyle = C.turf; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.stripe;
    for (let y = -H; y < H * 2; y += 56) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.35); ctx.fillRect(-W, y - H, W * 2, 28); ctx.restore(); }
    // Sand bunkers.
    for (const s of h.sand) {
      polyPath(ctx, s); ctx.fillStyle = C.sand; ctx.fill();
      ctx.save(); polyPath(ctx, s); ctx.clip();
      ctx.fillStyle = C.sandDot;
      for (const [x, y, r] of speckles(s)) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      polyPath(ctx, s); ctx.strokeStyle = 'rgba(160,120,50,0.45)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // Water with drifting ripples.
    for (const w of h.water) {
      polyPath(ctx, w); ctx.fillStyle = C.water; ctx.fill();
      ctx.save(); polyPath(ctx, w); ctx.clip();
      ctx.strokeStyle = C.waterLight; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.6;
      const ys = w.map((p) => p[1]);
      for (let y = Math.min(...ys) + 10; y < Math.max(...ys); y += 14) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const yy = y + Math.sin(x * 0.07 + t * 1.6 + y) * 2.2;
          x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    // Rails on the outer boundary: dark outline, wood, highlight.
    ctx.lineJoin = 'round';
    polyPath(ctx, h.outer);
    ctx.strokeStyle = C.railDark; ctx.lineWidth = WALL_PAD * 2 + 4; ctx.stroke();
    ctx.strokeStyle = C.rail; ctx.lineWidth = WALL_PAD * 2; ctx.stroke();
    ctx.strokeStyle = C.railLight; ctx.lineWidth = 2; ctx.stroke();
    // Solid blocks.
    for (const b of h.blocks || []) {
      ctx.save(); ctx.translate(0, 5); polyPath(ctx, b); ctx.strokeStyle = C.shadow; ctx.lineWidth = WALL_PAD * 2; ctx.stroke(); ctx.fillStyle = C.shadow; ctx.fill(); ctx.restore();
      polyPath(ctx, b);
      ctx.strokeStyle = C.railDark; ctx.lineWidth = WALL_PAD * 2 + 4; ctx.stroke();
      ctx.fillStyle = C.rail; ctx.fill();
      ctx.strokeStyle = C.rail; ctx.lineWidth = WALL_PAD * 2; ctx.stroke();
      ctx.strokeStyle = C.railLight; ctx.lineWidth = 2; ctx.stroke();
    }
    // Bumpers.
    for (const p of h.bumpers) {
      ctx.beginPath(); ctx.arc(p.x + 1, p.y + 5, p.r, 0, Math.PI * 2); ctx.fillStyle = C.shadow; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = C.flag; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    }
    // Tee mat.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(h.tee[0] - 16, h.tee[1] - 10, 32, 20);
  }

  function drawCup(h, t, flagAlpha) {
    const [cx, cy] = h.cup;
    ctx.beginPath(); ctx.arc(cx, cy, CUP_R + 2.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, CUP_R, 0, Math.PI * 2); ctx.fillStyle = C.cup; ctx.fill();
    if (flagAlpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = flagAlpha;
    ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 50); ctx.stroke();
    const wave = Math.sin(t * 3) * 3;
    ctx.beginPath(); ctx.moveTo(cx, cy - 50); ctx.quadraticCurveTo(cx + 14, cy - 46 + wave, cx + 28, cy - 41 + wave * 1.4); ctx.lineTo(cx, cy - 32); ctx.closePath();
    ctx.fillStyle = C.flag; ctx.fill();
    ctx.restore();
  }

  function drawBall(x, y, alpha = 1, r = BALL_R) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.ellipse(x + 2, y + 4, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fillStyle = C.shadow; ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d8dde3');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(23,38,60,0.35)'; ctx.stroke();
    ctx.restore();
  }

  function drawPreview(s) {
    const { preview, previewPath } = s;
    if (!preview) return;
    // Dotted line of the strongest shot.
    if (previewPath && previewPath.length > 1) {
      ctx.save();
      ctx.setLineDash([2, 7]); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath();
      previewPath.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
      ctx.restore();
    }
    // Tier markers where each obscurity level would stop. Sinking tiers are grouped into one badge at the cup.
    const sinking = preview.filter((p) => p.result === 'sunk').map((p) => p.tier);
    ctx.font = '700 10px Figtree, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of preview) {
      if (p.result === 'sunk') continue;
      const r = 8.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.result === 'water' ? '#2a5fb0' : tierColor(p.tier);
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.fillStyle = p.result === 'water' ? '#fff' : C.ink;
      ctx.fillText(String(p.tier), p.x, p.y + 0.5);
    }
    if (sinking.length) {
      const label = sinking.length === 1 ? `${sinking[0]}` : `${sinking[0]}–${sinking[sinking.length - 1]}`;
      const [cx, cy] = s.hole.cup;
      ctx.font = '800 12px Figtree, system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 26;
      const bx = cx + 22, by = cy + 8;
      ctx.beginPath(); ctx.roundRect(bx - 4, by - 11, tw, 22, 11);
      ctx.fillStyle = '#ffc93c'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
      ctx.fillStyle = C.ink; ctx.textAlign = 'left';
      ctx.fillText(`⛳ ${label}`, bx + 3, by + 0.5);
    }
  }

  function draw(s, t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    const h = s.hole;
    drawCourse(h, t);
    const dBall = s.ball ? Math.hypot(s.ball.x - h.cup[0], s.ball.y - h.cup[1]) : 999;
    drawCup(h, t, Math.min(1, Math.max(0.15, (dBall - 25) / 60)));
    if (s.showPreview) drawPreview(s);
    // Trail.
    if (s.trail && s.trail.length > 1) {
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 1; i < s.trail.length; i++) {
        ctx.globalAlpha = (i / s.trail.length) * 0.5;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = BALL_R * 1.2 * (i / s.trail.length);
        ctx.beginPath(); ctx.moveTo(...s.trail[i - 1]); ctx.lineTo(...s.trail[i]); ctx.stroke();
      }
      ctx.restore();
    }
    if (s.ball && !s.ballHidden) drawBall(s.ball.x, s.ball.y);
    if (s.sinkAnim) {
      const k = Math.min(1, (t - s.sinkAnim.t0) / 0.35);
      drawBall(h.cup[0], h.cup[1], 1 - k, BALL_R * (1 - 0.5 * k));
    }
    if (s.splash) {
      const k = (t - s.splash.t0) / 0.7;
      if (k < 1) {
        ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2.5;
        for (const m of [1, 1.7]) { ctx.beginPath(); ctx.arc(s.splash.x, s.splash.y, 6 + 26 * k * m, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
    if (s.confetti) {
      for (const c of s.confetti) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = c.color; ctx.fillRect(-3, -5, 6, 10); ctx.restore();
      }
    }
  }

  return { resize, draw, toLogical, setHole };
}
