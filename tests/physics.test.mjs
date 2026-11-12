import { getHoles } from '../js/course.js';
import { prepareHole, simulateShot, pointInPoly } from '../js/physics.js';

let failures = 0;
const check = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!cond) failures++; };
const speed = (h, power) => h.vmax * Math.sqrt(power);

for (const [i, raw] of getHoles().entries()) {
  const h = prepareHole(raw);
  const tag = `hole ${i + 1} ${h.name}`;
  check(`${tag}: tee and cup on the course`, pointInPoly(...h.tee, h.outer) && pointInPoly(...h.cup, h.outer)
    && !(h.blocks || []).some((b) => pointInPoly(...h.tee, b) || pointInPoly(...h.cup, b)));
  // Tier 10 on the calibrated line drops in the real time-stepped simulation.
  const ace = simulateShot(h, h.tee[0], h.tee[1], h.aceAngle, speed(h, 1.0));
  check(`${tag}: tier 10 on the ace line = hole in one`, ace.result === 'sunk', `(${ace.result})`);
  // Aim tolerance: how many degrees around the ace line still sink at tier 10.
  let tol = 0;
  for (let d = -3; d <= 3; d += 0.1) if (simulateShot(h, h.tee[0], h.tee[1], h.aceAngle + d * Math.PI / 180, speed(h, 1.0)).result === 'sunk') tol += 0.1;
  check(`${tag}: ace line has real aim tolerance`, tol >= 0.5, `${tol.toFixed(1)}° of sinkable aim`);
  // Tier 8 cannot reliably hole in one from the tee (hole-in-one needs a very good answer). Lucky knife-edge
  // bank shots are allowed if their total aim window is at most 1 degree.
  let cheap = 0;
  for (let a = 0; a < 360; a += 0.5) if (simulateShot(h, h.tee[0], h.tee[1], a * Math.PI / 180, speed(h, 0.8)).result === 'sunk') cheap++;
  check(`${tag}: tier 8 aces only as flukes (<= 1°)`, cheap * 0.5 <= 1.0, `${(cheap * 0.5).toFixed(1)}° of aim`);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
