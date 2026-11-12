// Top-down mini-golf physics. Logical course units; the course is 400 x 640, y points down.
//
// Model:
//   rolling friction: constant deceleration A_TURF (A_SAND inside sand), applied along the velocity
//   walls/blocks: polygon edges padded by WALL_PAD (the visible rail); bounce keeps the tangential component and
//                 multiplies the normal component by -E_WALL
//   bumpers: circular posts, normal restitution E_BUMPER
//   cup: the ball drops if its centre is within CUP_R while slower than V_CAPTURE
//   water: entering a water polygon ends the shot (penalty stroke, ball returns to where it was hit from)
//
// Key property used for calibration: friction never changes direction and a bounce scales the velocity vector by a
// direction-only factor, so the *path* of a shot does not depend on launch speed. Along the path, speed^2 evolves as
//   v^2 <- v^2 - 2*A*ds        (rolling)
//   v^2 <- k * v^2             (bounce, k = |v_out|^2 / |v_in|^2, independent of speed)
// so at any point v^2 = M * v0^2 - F for path constants M, F that a single trace can measure.

export const BALL_R = 7;
export const CUP_R = 12;
export const WALL_PAD = 6;
export const A_TURF = 150;
export const A_SAND = 620;
export const E_WALL = 0.78;
export const E_BUMPER = 0.92;
export const V_CAPTURE = 175;
export const V_STOP = 4;
export const DT = 1 / 240;

/** Precompute segments for a hole: every polygon edge of the outer boundary and of the solid blocks. */
export function prepareHole(hole) {
  const segs = [];
  const addPoly = (pts) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  };
  addPoly(hole.outer);
  for (const b of hole.blocks || []) addPoly(b);
  return { ...hole, segs, bumpers: hole.bumpers || [], sand: hole.sand || [], water: hole.water || [] };
}

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Resolve collisions of ball b ({x, y, vx, vy}) against walls and bumpers, in place.
 * Returns the energy factor k = |v_out|^2/|v_in|^2 of all bounces this step (1 if none).
 */
function collide(h, b) {
  let k = 1;
  const rr = BALL_R + WALL_PAD;
  for (const s of h.segs) {
    const ex = s[2] - s[0], ey = s[3] - s[1];
    const len2 = ex * ex + ey * ey;
    let t = ((b.x - s[0]) * ex + (b.y - s[1]) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s[0] + t * ex, cy = s[1] + t * ey;
    const dx = b.x - cx, dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 1e-12) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x += nx * (rr - d); b.y += ny * (rr - d);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const before = b.vx * b.vx + b.vy * b.vy;
      b.vx -= (1 + E_WALL) * vn * nx; b.vy -= (1 + E_WALL) * vn * ny;
      if (before > 1e-9) k *= (b.vx * b.vx + b.vy * b.vy) / before;
    }
  }
  for (const p of h.bumpers) {
    const dx = b.x - p.x, dy = b.y - p.y, rr2 = BALL_R + p.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr2 * rr2 || d2 < 1e-12) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x += nx * (rr2 - d); b.y += ny * (rr2 - d);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const before = b.vx * b.vx + b.vy * b.vy;
      b.vx -= (1 + E_BUMPER) * vn * nx; b.vy -= (1 + E_BUMPER) * vn * ny;
      if (before > 1e-9) k *= (b.vx * b.vx + b.vy * b.vy) / before;
    }
  }
  return k;
}

const inSand = (h, x, y) => h.sand.some((p) => pointInPoly(x, y, p));
const inWater = (h, x, y) => h.water.some((p) => pointInPoly(x, y, p));

/**
 * Advance the ball by one time step DT. Returns null while rolling, or 'sunk' | 'water' | 'stopped'.
 * Collisions with the rails register on b.bounced (for sound/FX).
 */
export function step(h, b) {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < V_STOP) { b.vx = b.vy = 0; return 'stopped'; }
  const a = inSand(h, b.x, b.y) ? A_SAND : A_TURF;
  const ns = Math.max(0, speed - a * DT);
  b.vx *= ns / speed; b.vy *= ns / speed;
  b.x += b.vx * DT; b.y += b.vy * DT;
  const k = collide(h, b);
  b.bounced = k < 0.999;
  const dc = Math.hypot(b.x - h.cup[0], b.y - h.cup[1]);
  if (dc < CUP_R && Math.hypot(b.vx, b.vy) < V_CAPTURE) return 'sunk';
  if (inWater(h, b.x, b.y)) return 'water';
  return null;
}

/** Simulate a full shot to completion. Returns { result, x, y, path: [[x,y]...] (every 4th step), steps }. */
export function simulateShot(h, x, y, angle, v0, { maxSteps = 240 * 12, recordEvery = 4 } = {}) {
  const b = { x, y, vx: Math.cos(angle) * v0, vy: Math.sin(angle) * v0 };
  const path = [[x, y]];
  for (let i = 0; i < maxSteps; i++) {
    const r = step(h, b);
    if (i % recordEvery === 0) path.push([b.x, b.y]);
    if (r) { path.push([b.x, b.y]); return { result: r, x: b.x, y: b.y, path, steps: i }; }
  }
  return { result: 'stopped', x: b.x, y: b.y, path, steps: maxSteps };
}

/**
 * Trace a shot's geometry from (x, y) at `angle` with no friction loss, tracking the affine speed map
 * v^2 = M*v0^2 - F (see header). Returns the launch-speed interval that drops the ball in the cup on first
 * arrival, or null if the path never reaches the cup (or hits water first).
 */
export function sinkWindow(h, x, y, angle, { maxLen = 5000, ds = 1.5 } = {}) {
  const b = { x, y, vx: Math.cos(angle), vy: Math.sin(angle) };
  let M = 1, F = 0, len = 0;
  const unit = ds / DT; // move ds per step: speed = ds / DT with unit direction
  b.vx *= unit; b.vy *= unit;
  while (len < maxLen) {
    const a = inSand(h, b.x, b.y) ? A_SAND : A_TURF;
    b.x += b.vx * DT; b.y += b.vy * DT;
    len += ds;
    F += 2 * a * ds;
    const k = collide(h, b);
    if (k < 0.999) {
      M *= k; F *= k;
      const s = Math.hypot(b.vx, b.vy); b.vx *= unit / s; b.vy *= unit / s; // keep geometric stepping at constant ds
    }
    if (inWater(h, b.x, b.y)) return null;
    if (Math.hypot(b.x - h.cup[0], b.y - h.cup[1]) < CUP_R - 1) {
      // Arrive with v^2 in (0, V_CAPTURE^2):  F/M < v0^2 < (F + V_CAPTURE^2)/M
      return { lo: Math.sqrt(F / M), hi: Math.sqrt((F + V_CAPTURE * V_CAPTURE) / M), len };
    }
    if (M < 0.02) return null; // energy gone after many bounces
  }
  return null;
}

/**
 * Calibrate a hole: find the aim that allows a hole-in-one with the widest margin and set vmax so that a
 * perfect (power 1.0) shot sits in the middle of that sink window. Angular sweep at `steps` resolution.
 */
export function calibrate(h, steps = 3600) {
  let best = null;
  const windows = new Array(steps);
  for (let i = 0; i < steps; i++) windows[i] = sinkWindow(h, h.tee[0], h.tee[1], (i / steps) * Math.PI * 2);
  for (let i = 0; i < steps; i++) {
    const w = windows[i];
    if (!w) continue;
    // Robustness: count neighbours that also sink, so the chosen line is not a knife edge.
    let width = 0;
    for (let j = 1; j < 40; j++) { if (windows[(i + j) % steps]) width++; else break; }
    for (let j = 1; j < 40; j++) { if (windows[(i - j + steps) % steps]) width++; else break; }
    // Among lines that are not knife edges (at least ~0.8 degrees of aim tolerance), take the gentlest one:
    // vmax sets the power of every shot on the hole, so an energy-wasting bank line would make all shots too strong.
    if (width < Math.round(steps * 0.8 / 360)) continue;
    const score = -w.lo;
    if (!best || score > best.score) best = { score, angle: (i / steps) * Math.PI * 2, lo: w.lo, hi: w.hi, width };
  }
  if (!best) return null;
  const vmax = Math.sqrt((best.lo * best.lo + best.hi * best.hi) / 2);
  return { vmax, aceAngle: best.angle, aceWindowDeg: (best.width + 1) * 360 / steps, lo: best.lo, hi: best.hi };
}
