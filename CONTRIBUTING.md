# Contributing to TrueLabels

Thank you for considering a contribution. This project is an allergen-safety tool, so the
expectations are slightly stricter than a typical app repository — specifically for anything
that can influence what verdict a user is shown.

Nothing here is meant to gatekeep. If you are unsure whether a change is safe, open an issue
or a draft pull request and ask.

## Ground rules

1. **Never make a label look safer than the evidence supports.** A false `SAFE` can hurt
   someone; a false `CAUTION` costs a user one dismissed alert. When in doubt, escalate.
2. **Preserve the abstention path.** If the app cannot read a label, it must say so. Do not
   "improve" a `NOT READ` or `NOT VERIFIED` state into a verdict.
3. **Keep the safety gate in one place.** `presentVerdict` in `src/ai/merge.ts` is the single
   authority for what may be presented as clean. Do not reimplement or bypass it.
4. **No network in tests.** Nothing in either Jest project touches a real camera, network,
   database, or filesystem.
5. **No wall-clock waits in tests.** Every async dependency resolves immediately or on a fake
   timer.

## Before you open a pull request

These four commands must all pass. The CI quality gate runs the same set.

```bash
npm run typecheck
npm run lint
npm test
```

If you touch the verdict path, the rule engine, or coverage logic, also run:

```bash
npm run eval:baseline
```

## Adding a rule

Rules live in `src/rules/ruleset.json`. Each rule has `match` terms, an optional `exclude`
veto list, a `severity`, a `label`, a `reason`, and a `category`.

The `exclude` list matters more than it looks. Bare ingredient names are ambiguous —
`butter` means milk in "butter" but not in "peanut butter", and `lecithin` is soy only when
the source is declared. **A rule added without an `exclude` list where one is needed will
produce false positives**, which erodes trust in the app.

When adding a rule, prefer:

- terms that are already lowercase and stem-trimmed to how they appear on real packs
- an `exclude` list covering the ambiguous contexts you can think of
- a `reason` written for a non-expert, in the second person ("contains milk solids…")
- a `category` from the existing set: `allergen`, `additive`, `substance`

Please add a test for the new rule in `src/rules/engine.test.ts`, including at least one case
that exercises the `exclude` path if the rule has one.

## Tests

There are two Jest projects, configured in `jest.config.js`:

- `unit` — pure logic in plain Node, no React Native runtime. Use this for rules, parsing, and
  coverage decisions.
- `ui` — screens and hooks through `jest-expo`, with all native modules faked in
  `test/setup.ts`. Use this for anything rendering.

New behaviour needs a test. Bug fixes need a test that fails without the fix.

## Style

- Match the surrounding code. Comments in this repository explain *why*, not *what* — follow
  that convention rather than narrating obvious lines.
- No wildcard re-exports, no new dependencies without discussion.
- Keep `src/` free of screens, and `app/` free of business logic. Screens compose; the domain
  decides.

## Release gating

`src/ai/eval/report.test.ts` is a release gate, not just a test. It asserts the evaluation
false-safe rate stays at zero. If your change moves that number, it is a release blocker
regardless of what else passes.

## Getting help

Open an issue. For anything you would rather not disclose publicly, use the contact in
[SECURITY.md](SECURITY.md).
