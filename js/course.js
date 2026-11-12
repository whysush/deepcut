// The nine holes. Logical coordinates: 400 wide x 640 tall, y down.
// outer: playable boundary polygon (rails drawn on its edges). blocks: solid rail polygons inside the course.
// bumpers: round posts { x, y, r }. sand / water: polygons. tee / cup: [x, y].
// vmax / aceAngle come from tools/calibrate.mjs (see js/data/calibration.js).

import { CALIBRATION } from './data/calibration.js';

export const HOLES = [
  {
    name: 'First Cut', par: 3,
    outer: [[110, 50], [290, 50], [290, 600], [110, 600]],
    tee: [200, 545], cup: [200, 115],
  },
  {
    name: 'Dogleg', par: 3,
    outer: [[50, 60], [350, 60], [350, 230], [200, 230], [200, 600], [50, 600]],
    tee: [125, 545], cup: [290, 140],
  },
  {
    name: 'Bumper Alley', par: 3,
    outer: [[80, 50], [320, 50], [320, 600], [80, 600]],
    bumpers: [{ x: 200, y: 420, r: 16 }, { x: 135, y: 300, r: 14 }, { x: 265, y: 300, r: 14 }, { x: 200, y: 200, r: 14 }],
    tee: [200, 555], cup: [200, 105],
  },
  {
    name: 'Bridge Over Water', par: 3,
    outer: [[70, 50], [330, 50], [330, 600], [70, 600]],
    water: [[[70, 265], [172, 265], [172, 375], [70, 375]], [[228, 265], [330, 265], [330, 375], [228, 375]]],
    tee: [200, 550], cup: [200, 120],
  },
  {
    name: 'The Bunker', par: 3,
    outer: [[60, 60], [340, 60], [340, 420], [220, 600], [60, 600]],
    sand: [[[165, 205], [334, 205], [334, 262], [165, 262]], [[66, 300], [140, 300], [140, 385], [66, 385]]],
    tee: [120, 550], cup: [270, 130],
  },
  {
    name: 'U-Turn', par: 4,
    outer: [[50, 50], [350, 50], [350, 600], [50, 600]],
    blocks: [[[185, 175], [215, 175], [215, 600], [185, 600]]],
    tee: [115, 550], cup: [285, 540],
  },
  {
    name: 'Zigzag', par: 4,
    outer: [[50, 50], [350, 50], [350, 600], [50, 600]],
    blocks: [[[50, 385], [250, 385], [250, 415], [50, 415]], [[150, 225], [350, 225], [350, 255], [150, 255]]],
    tee: [120, 550], cup: [280, 110],
  },
  {
    name: 'Diamond', par: 3,
    outer: [[200, 40], [360, 200], [360, 450], [200, 610], [40, 450], [40, 200]],
    blocks: [[[200, 255], [255, 330], [200, 405], [145, 330]]],
    tee: [200, 560], cup: [200, 100],
  },
  {
    name: 'Grand Finale', par: 4,
    outer: [[50, 50], [350, 50], [350, 600], [50, 600]],
    water: [[[50, 285], [170, 285], [170, 372], [50, 372]]],
    sand: [[[248, 180], [350, 180], [350, 258], [248, 258]]],
    bumpers: [{ x: 232, y: 455, r: 14 }, { x: 120, y: 205, r: 14 }, { x: 282, y: 335, r: 12 }],
    blocks: [[[200, 115], [228, 115], [228, 190], [200, 190]]],
    tee: [300, 555], cup: [150, 105],
  },
];

/** Holes merged with their calibration (vmax, ace angle). */
export function getHoles() {
  return HOLES.map((h, i) => ({ ...h, ...(CALIBRATION[i] || {}) }));
}
