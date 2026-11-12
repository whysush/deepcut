# Deep Cut ⛳

**Mini golf where obscure answers hit harder.** Play it: **https://whysush.in**

Every stroke asks a question: *Name a fish.* Your answer's obscurity sets the power of the shot.
`salmon` barely taps the ball. `anglerfish` sends it. `sarcastic fringehead` can sink a hole in one.

Every hole comes down to the same decision. The numbered dots on your aim line show where each obscurity level (1–10)
would stop, so near the cup you might *want* a common answer, and from the tee you need a deep cut.
Everyone plays the same course with the same questions each day, and the result shares Wordle-style.

## How it works

The site is plain HTML, CSS and ES modules with no build step, no server and no API keys. Everything runs in the browser.

**Judging answers (`js/judge.js`, `js/data/categories.js`)**
- 18 categories and about 3,100 hand-ranked answers in obscurity tiers 1–10 (fish, birds, cheeses, Indian dishes,
  capitals, elements, programming languages and more).
- Matching handles case, accents, plurals, aliases (`clown fish` → `clownfish`), `C++`/`C#`, and typos
  (Damerau–Levenshtein). Typo ties resolve to the *more common* entry, so a misspelling never earns extra power.
- Common wrong answers get a specific correction (`dolphin` → "That's a mammal").
- **Off-list answers are checked live on Wikipedia** from the browser. The article's short description is checked
  against a per-category pattern (e.g. "species of fish", but not "fish sauce"), and obscurity comes from the article's
  daily pageviews: fewer views means a deeper cut.

**Physics and calibration (`js/physics.js`, `tools/calibrate.mjs`)**
- Top-down rolling physics: constant friction, restitution on rails and bumpers, sand, water hazards, and a cup that
  captures slow balls.
- A shot's *path* doesn't depend on its launch speed: friction never turns the ball, and a bounce scales velocity by
  a direction-only factor. So along any aim line, `v² = M·v₀² − F` for constants that a single trace can measure.
  The calibrator sweeps 3,600 aim angles per hole, computes the exact launch-speed window that drops the ball, and
  sets each hole's max power so that **only a tier-10 answer on a good line holes in one**.
- Tier → power maps to carry *distance* linearly (`v₀ = vmax·√(tier/10)`), so every tier step means the same
  extra roll.

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Tests

```bash
node tests/judge.test.mjs     # data integrity, matching, Wikipedia fallback (mocked)
node tests/physics.test.mjs   # every hole: tier 10 aces on the calibrated line, tier 8 can't (beyond 1° flukes)
node tools/calibrate.mjs      # re-run after editing holes or physics constants
# Browser playthroughs (needs Playwright + a server on :8080):
node tests/browser.cjs out/   # UI flow + screenshots
node tests/bot.cjs out/       # full 9-hole round, scorecard, share text, persistence
```

## Adding questions

Add a category to `js/data/categories.js`: a prompt, ten tier strings (`answer/alias|answer|...`), optional `nope`
corrections, and a `wiki` validator (or `wiki: null` for closed sets like countries).
