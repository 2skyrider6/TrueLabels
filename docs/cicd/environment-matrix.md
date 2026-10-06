# CI/CD environment matrix

Three environments are separated by **branch**, **EAS build profile**, **env
file**, **EAS Update channel**, and **Sentry environment**. Nothing
environment-specific is hardcoded in the app: the active environment is baked
into the bundle at build time from `.env.<environment>` (synced to
`.env.local` by `scripts/sync-env.js` before every build/OTA publish).

| | **Development** | **Staging** | **Production** |
|---|---|---|---|
| Git ref | `develop` branch | `staging` branch | tag `v*.*.*` |
| Workflow | `.github/workflows/dev.yml` | `.github/workflows/staging.yml` | `.github/workflows/release.yml` |
| EAS build profile | `development` (dev client) | `staging` (signed, store dist) | `production` (signed, store dist) |
| Env file | `.env.development` | `.env.staging` | `.env.production` |
| `EXPO_PUBLIC_APP_ENV` | `development` | `staging` | `production` |
| API base URL | staging API proxy | staging API proxy | Open Food Facts (direct) |
| Log level | `debug` | `info` | `error` |
| Distribution | Orbit / Expo dashboard | TestFlight + Play Internal | TestFlight + Play Internal, then promoted to App Store / Play production |
| EAS Update channel | `development` | `staging` | `production` |
| Sentry environment | `development` (DSN empty = disabled) | `staging` | `production` |
| Build number (versionCode / iOS build number) | not incremented | auto-incremented (EAS remote) | auto-incremented (EAS remote) |
| User-facing version | `1.0.0` (dev) | from `app.json` | from git tag via `scripts/bump-version.js` |

## Versioning

- **Semantic version** (`app.json` `expo.version` + `package.json`): owned by
  git tags. `fastlane bump` / `npm run version:bump` bumps semver, commits,
  and tags. The release pipeline **fails** if the tag does not match
  `app.json` (`verify-version` job), so an unbumped version can never ship.
- **Build number** (`android.versionCode`, `ios.buildNumber`): managed by EAS
  with `cli.appVersionSource: "remote"` + `autoIncrement: true` on the
  `staging` and `production` profiles. EAS increments remotely on every build,
  which prevents App Store / Play rejections from duplicate build numbers.
  Inspect with `npx eas-cli build:version:get -p all`; sync locally with
  `npx eas-cli build:version:sync`.

## Secrets

Secrets live **only** in the CI secret store and the EAS credential store.
Keystores, certificates, `.p8` keys, service-account JSON and auth tokens are
never committed (`.gitignore` blocks `*.jks`, `*.p8`, `*.p12`, `*.key`,
`*.mobileprovision`, `*.pem`, `credentials.json`).

| Secret | Where it lives | Used by |
|---|---|---|
| `EAS_TOKEN` | GitHub Actions secrets | all `eas` commands in CI |
| `SENTRY_AUTH_TOKEN` | GitHub Actions secrets **and** EAS secrets (sensitive visibility) | source-map upload during EAS Build, `sentry-expo-upload-sourcemaps`, `sentry-cli` releases |
| `EXPO_APPLE_ID` | GitHub Actions secrets | `eas submit -p ios` (TestFlight) |
| `EXPO_APPLE_APP_SPECIFIC_PASSWORD` | GitHub Actions secrets | `eas submit -p ios` (TestFlight) |
| `SENTRY_ORG` / `SENTRY_PROJECT` | committed as placeholders in `app.json` plugin config — replace before first release | Sentry release naming |
| `EXPO_PUBLIC_SENTRY_DSN` | `.env.staging` / `.env.production` (DSNs are public by design, not secrets) | crash reporting init |
| iOS distribution certificate + provisioning profile | EAS credential store (`eas credentials:configure-build -p ios`) | EAS Build iOS signing |
| Android upload key + release keystore | EAS credential store (`eas credentials:configure-build -p android`) | EAS Build Android signing |

`EXPO_PUBLIC_*` values are inlined into the bundle in plain text — never put
private keys, tokens, or passwords in them. Build-time secrets (e.g.
`SENTRY_AUTH_TOKEN`) are non-`EXPO_PUBLIC_` EAS secrets and never reach the
bundle.

## Security baseline

The blocking security gate is `npm audit --omit=dev --audit-level=critical`
plus `actions/dependency-review-action` on PRs and `npx expo-doctor`. As of
this writing, the Expo SDK 57 dependency tree carries **known high-severity
advisories in transitive framework packages** (`@expo/metro`, `metro`,
`react-native`, `expo-updates`, `braces`, `micromatch`, `source-map-js`,
`node-forge`, …). These are not fixable from app code; they clear when Expo
ships a patched SDK. They are reported as a non-blocking warning until then —
do not silently raise the gate to `--audit-level=high` before upgrading the
SDK, or every pipeline run will fail.

## Local setup

```sh
npm ci
node scripts/sync-env.js development   # writes .env.local (gitignored)
npx expo start
```

Switch environments locally with `node scripts/sync-env.js staging|production`
or `eas env:pull production` (pulls EAS-stored env vars into `.env.local`).
