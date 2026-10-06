# Release checklist

Releases ship from git tags (`vMAJOR.MINOR.PATCH`). The `release`
workflow runs automatically on tag push; this checklist covers what
automation cannot decide.

## 1. Preflight (before tagging)

- [ ] All PRs merged into `staging` have green `PR checks` (lint,
      typecheck, unit tests, bundle check, security review).
- [ ] Staging build (`staging` pipeline) passed Maestro UI tests on
      the emulator and was installed from TestFlight / Play Internal
      by QA.
- [ ] Sentry staging environment shows no new unresolved crashes from
      the staging build; release health (crash-free sessions) is
      green.
- [ ] `app.json` `expo.version` is the version you are releasing.
      Bump it first if not:
      ```sh
      npm run version:bump -- patch   # or: minor | major
      # equivalent: fastlane bump type:patch
      ```
- [ ] Replace placeholders before the first real release:
      - `app.json` → `@sentry/react-native/expo` plugin:
        `organization` and `project` slugs (currently
        `REPLACE_WITH_SENTRY_ORG_SLUG` / `REPLACE_WITH_SENTRY_PROJECT_SLUG`).
      - `.env.production` → `EXPO_PUBLIC_SENTRY_DSN` (currently
        `REPLACE_WITH_PRODUCTION_DSN`).
- [ ] Secrets present in the CI secret store (GitHub Actions →
      Settings → Secrets): `EAS_TOKEN`, `SENTRY_AUTH_TOKEN`,
      `EXPO_APPLE_ID`, `EXPO_APPLE_APP_SPECIFIC_PASSWORD`.
- [ ] Secrets present in EAS (project → Environment variables):
      `SENTRY_AUTH_TOKEN` with **sensitive** visibility.
- [ ] Signing credentials configured once per app:
      `npx eas-cli credentials:configure-build -p ios` and
      `-p android` (EAS-managed store; nothing lands in git).
- [ ] EAS Update channels exist: `development`, `staging`,
      `production` (`npx eas-cli channel:list`).
- [ ] TestFlight group `Truelabels Internal` exists (auto-created by
      `--auto-testflight-setup` on first submit).

## 2. Tag and release

- [ ] Commit the version bump, then tag:
      ```sh
      git add app.json package.json
      git commit -m "chore(release): vX.Y.Z"
      git tag vX.Y.Z
      git push && git push origin vX.Y.Z
      ```
      (or `fastlane bump type:patch` + push — the lane does all four steps.)
- [ ] Watch the **Release pipeline** run:
      1. Quality gate (lint · typecheck · unit tests · bundle check · security)
      2. `verify-version` — tag must equal `app.json` version
      3. EAS Build `production` profile (both platforms, store-signed,
         remote build-number auto-increment, source maps uploaded to Sentry)
      4. Submit: iOS → TestFlight (Truelabels Internal),
         Android → Play Internal track
      5. Sentry release created for `X.Y.Z`
      6. Draft GitHub Release

## 3. Verify the beta (gate before promoting)

- [ ] Install the build from TestFlight and Play Internal on physical
      devices (at least one iOS, one Android).
- [ ] Smoke test: scan a barcode, OCR a label, analyse typed
      ingredients, open history, check offline behaviour.
- [ ] Sentry: the new release `X.Y.Z` appears under the
      `production` environment with symbolicated stack traces
      (source maps uploaded).
- [ ] Crash-free session rate ≥ 99.5% for the build in beta;
      no new fatal issues.
- [ ] EAS Insights / `eas channel:insights` shows the expected
      adoption for the production channel.

## 4. Promote to production

- [ ] **iOS**: App Store Connect → TestFlight → promote the build
      from Internal to the production App Store submission; complete
      the store review metadata and submit for review.
- [ ] **Android**: Play Console → Internal testing → promote the
      release to Production (roll out staged, e.g. 10% → 100%).
- [ ] Publish the draft GitHub Release with changelog notes.
- [ ] Optional OTA safety net: the production channel is paused
      until the store build is live (`eas channel:pause production`),
      then resumed (`eas channel:resume production`).

## 5. Post-release

- [ ] Monitor Sentry + EAS Insights for 24h: crash rate, ANRs,
      session replays.
- [ ] Verify OTA updates still deliver on the production channel.
- [ ] Only ship OTA updates on top of the store build from now on
      (`eas update --branch <next> --channel production`); see
      rollback.md for why.

## Rollback

If anything fails after promotion, follow
[rollback.md](rollback.md). OTA rollbacks take effect on next app
launch; store rollbacks require a new build or a Play Console
rollout halt.
