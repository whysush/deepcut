// Tiny synthesized sound effects (no audio files). All calls are no-ops until the first user gesture.

let ctx = null;
let muted = false;
try { muted = localStorage.getItem('deepcut:muted') === '1'; } catch { /* storage unavailable */ }

export function unlockAudio() {
  if (ctx || muted) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('deepcut:muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (!m) unlockAudio();
}

function blip({ freq = 440, to = freq, dur = 0.08, type = 'sine', gain = 0.2, noise = false }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(ctx.destination);
  if (noise) {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    src.buffer = buf; src.connect(f); f.connect(g); src.start(t);
    return;
  }
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  o.connect(g); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  hit: (power) => { blip({ freq: 900 + 600 * power, to: 300, dur: 0.07, type: 'triangle', gain: 0.25 }); blip({ freq: 2500, dur: 0.03, noise: true, gain: 0.15 }); },
  bounce: () => blip({ freq: 1800, dur: 0.04, noise: true, gain: 0.12 }),
  sink: () => { blip({ freq: 520, to: 260, dur: 0.18, type: 'sine', gain: 0.3 }); setTimeout(() => blip({ freq: 780, to: 390, dur: 0.22, type: 'sine', gain: 0.22 }), 120); },
  splash: () => blip({ freq: 700, dur: 0.35, noise: true, gain: 0.25 }),
  tick: () => blip({ freq: 1200, dur: 0.03, type: 'square', gain: 0.05 }),
  nope: () => blip({ freq: 220, to: 150, dur: 0.18, type: 'sawtooth', gain: 0.08 }),
  ace: () => [0, 110, 220, 360].forEach((d, i) => setTimeout(() => blip({ freq: [523, 659, 784, 1047][i], dur: 0.25, type: 'triangle', gain: 0.18 }), d)),
};
