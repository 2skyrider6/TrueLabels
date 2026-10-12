<div align="center">

# TrueLabels

### Scan a food label. Know what's in it. No account, no upload, no network.

**An offline-first food allergen and additive scanner that works entirely on your phone.**

[![Quality gate](https://github.com/2skyrider6/TrueLabels/actions/workflows/quality.yml/badge.svg)](https://github.com/2skyrider6/TrueLabels/actions/workflows/quality.yml)
[![PR checks](https://github.com/2skyrider6/TrueLabels/actions/workflows/pr.yml/badge.svg)](https://github.com/2skyrider6/TrueLabels/actions/workflows/pr.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Expo](https://img.shields.io/badge/Expo-SDK%2057-000020.svg?logo=expo&logoColor=white)](https://docs.expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB.svg?logo=react&logoColor=black)](https://reactnative.dev/)
[![Tests](https://img.shields.io/badge/tests-Jest-C21325.svg?logo=jest&logoColor=white)](#testing)

</div>

---

## Why this exists

If you have a food allergy, reading an ingredient panel is not a convenience — it is a safety
check you perform several times a week, under time pressure, in a shop aisle.

Existing solutions ask you to upload a photo of the pack to a server, trust a black-box
verdict, and hand over a phone number or email. **TrueLabels does the opposite: it reads the
label on your device, shows you exactly which ingredient triggered which rule, and sends
nothing anywhere.**

The design principle that shapes every part of this codebase is this:

> **A scanner that cannot read a label must never report it as safe.**

That single constraint drives the architecture below. When the app is unsure, it says so —
loudly — instead of guessing.

---

## What it does

| Capability | Detail |
| --- | --- |
| **On-device label OCR** | Photograph the ingredient panel; text is read locally with ML Kit. The image never leaves the phone. |
| **Barcode lookup** | Scan a barcode and pull product data from [Open Food Facts](https://world.openfoodfacts.org), with attribution preserved. |
| **Allergen detection** | Declared allergens, `may contain` cross-contamination warnings, and additives, matched against a bundled rule set. |
| **Additive identification** | Regulatory additive codes (e.g. `INS 330`) surfaced as monospaced pills with a plain-English descriptor. |
| **Dietary marks** | FSSAI-style green/brown vegetarian indicators, shown as recognisable regulatory squares. |
| **0–100 safety score** | A scored verdict meter that makes a result legible at a glance, with the flag detail always one tap away. |
| **Local history** | Every scan is stored in on-device SQLite, so you can look up a product again with no signal at all. |
| **Typed entry** | If the photo is poor, paste the ingredient text and analyse it without the camera. |

## Try it

```bash
# 1. Clone
git clone https://github.com/2skyrider6/TrueLabels.git
cd TrueLabels

# 2. Install dependencies
npm install

# 3. Run the checks
npm run typecheck
npm run lint
npm test

# 4. Start the dev server
npx expo start
```

Then scan a real pack. A packet of biscuits, a jam jar, or a tub of yoghurt will exercise the
allergen path. **A photograph of a blank wall or a price sticker will exercise the abstention
path** — which is the more interesting one, and the reason this app exists.

> Camera and OCR need a development build. Expo Go bundles a limited set of native modules, so
> use `npx expo run:android` or `eas build --profile development` for the full scanner.

---

## The safety design (the interesting part)

Most of this repository's care went into **not saying things it cannot justify**. Four
mechanisms enforce that.

### 1. Coverage gating

Every scan carries a `coverage` verdict — `verified` or `unverified` — decided entirely on
device. A label in a language the bundled rule set cannot read is marked `unverified`, and an
`unverified` label is **never** presented as a clean bill of health.

The bundled `ruleset.json` contains only Latin-script match terms, so coverage of, say, a
Devanagari or Han-script label is structurally zero. Rather than silently returning nothing,
the app detects the script and says so.

### 2. Asymmetric trust

`src/ai/coverage.ts` encodes a deliberate asymmetry:

> A CAUTION or UNSAFE verdict from hard-to-read text is still trustworthy, because a false
> positive merely adds a flag a user can dismiss. **A false SAFE is the outcome that can hurt
> someone.**

Coverage is therefore only ever downgraded for a *clean* verdict. Flagging something wrongly
costs a user one dismissed alert; clearing something wrongly could cost far more.

### 3. Refusing to over-read

OCR routinely finds text that is not an ingredient list. `"Toll free 1800-123-4567 / MRP
Rs.45.00"` parses into two perfectly plausible ingredient items, so the engine would happily
report *sufficient data* on a photo of a price sticker. The app carries a
`foundHeader` signal through from ingredient-section extraction and feeds it into coverage,
so a nonsense capture is not presented as a trusted result.

### 4. Never inferring what it cannot see

The vegetarian/non-vegetarian mark is shown as **"Mark not analysed"** rather than a guessed
verdict, because reading the green or brown mark requires image recognition this app does not
perform. The ingredient analysis is stated to be the authoritative signal instead.

The same rule applies to the safety score: it is derived from the verdict, never the other way
round, and an unreadable or unverified label is held in the critical band regardless of what
the engine concluded.

---

## Architecture

```
app/                     Screens (Expo Router)
  index.tsx                Barcode scan + entry points
  label-scan.tsx           Camera capture for the ingredient panel
  paste.tsx                Manual ingredient entry
  result.tsx               Verdict, safety meter, allergens, additives
  history.tsx              Local scan history

src/
  rules/                  The offline rule engine
    ruleset.json            Bundled rules (allergens, additives, substances)
    parser.ts               Ingredient / declaration / trace extraction
    engine.ts               Match + veto evaluation -> verdict

  ocr/                    On-device OCR and ingredient-section extraction
  ai/                     Coverage assessment and the safety gate
    coverage.ts             "Is this verdict allowed to look clean?"
    merge.ts                presentVerdict — the single truth gate
  off/                    Open Food Facts barcode client
  db/                     SQLite schema, migrations, history
  components/             Design system (`ui.tsx`) and animation primitives
  theme/                  Design tokens (colours, type, spacing, elevation)
```

### Design system

The UI is a token-driven **"Clinical Purity & Consumer Trust"** system: deep navy for
authority, emerald/amber/red reserved strictly for verdict semantics, and desaturated
incident colours so a red flag means *unsafe* and never merely *decorated*. The 0–100 score
renders in a banded meter whose boundaries match the verdict colours, so the score can never
disagree with the verdict.

---

## Testing

Two Jest projects, deliberately separated:

- **`unit`** — the parser, rule engine, OFF client, storage, and coverage logic in plain Node.
  Fast enough to run on every save, with no React Native runtime.
- **`ui`** — screens and hooks through `jest-expo`, with every native module replaced by a fake
  in `test/setup.ts`. Nothing touches a real camera, network, database, or filesystem.

```bash
npm test              # everything
npm run test:coverage # with coverage
npm run eval:baseline # the release-gate evaluation suite
```

The UI suite is built on one rule: **no wall-clock waiting.** Every async dependency resolves
immediately or on a fake timer, because a test that only passes on a fast machine is not a test.

### The evaluation gate

`src/ai/eval/report.test.ts` is a release gate, not just a test. It measures the pipeline
against a gold set and asserts `falseSafeRate` stays at **0**, `allergenRecall` stays at or above
**95%**, and `abstentionRate` stays at **100%**. The gate is currently green on all three.

It caught a real bug worth telling, because it is exactly the failure this architecture exists to
prevent — and because it failed *silently*:

Every ruleset term was compiled as `\bterm\b`. `\b` is defined by `\w`, which is `[A-Za-z0-9_]`
in every engine, so a term written in Devanagari, Tamil or Han had no boundary it could ever
match at. The regex compiled without error and simply never fired. The ruleset carried several
hundred non-Latin terms — they were there — and coverage correctly reported those scripts as
readable *because they were in the ruleset*. So a Devanagari label declaring wheat and peanut
came back **SAFE and trusted**, and nothing downstream could see that the matching had been
structurally impossible rather than merely incomplete. Eleven of the eighteen gold cases failed
that way.

The fix asserts Unicode-aware boundaries instead, and the suite now carries a regression test
for both halves of the contract: that a non-Latin term matches, and that a word sharing only a
prefix does not.

### What the gate does not yet prove

The gold set is eighteen curated cases. It demonstrates that the abstention and coverage
mechanisms work, not that rule coverage is broad. Inflected forms are listed as explicit terms
per language, so any language whose morphology has not yet been curated will still miss — a
Bengali pack reading `গমের আটা` needs the inflected `গমের` term alongside the base `গম`. That
breadth is the ongoing work, and it is where contributions are most valuable.

---

## Contributing

Contributions are welcome, and safety-relevant ones especially so. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request — the expectations for
anything touching the verdict path are stricter than the rest of the codebase.

Good first contributions:

- **Rule coverage** — adding allergen or additive terms to `ruleset.json` for
  under-represented languages and regional products.
- **Tests** — extending the UI or unit suites.
- **Accessibility** — every screen is screen-reader navigable; gaps are worth filing.
- **Documentation.**

## Roadmap

- [ ] Broaden rule coverage for inflected languages, where each form needs its own term
- [ ] Vegan and diet-profile rule sets beyond vegetarian marking
- [ ] Category and additive-density heuristics for a judgment call
- [ ] Localisation of the UI itself
- [ ] Optional, opt-in telemetry with truly anonymised events

## Community

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md) — please report vulnerabilities privately

## License

Released under the [MIT License](LICENSE).

Ingredient data is provided by [Open Food Facts](https://world.openfoodfacts.org) under the
Open Database License. On-device text recognition uses Google ML Kit.
