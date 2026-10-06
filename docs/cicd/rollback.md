# Rollback procedure

Two independent release channels need two rollback strategies:

| Layer | Mechanism | Time to effect | Reversible |
|---|---|---|---|
| OTA update (EAS Update) | republish previous update | next app launch | yes — republish the newer update again |
| Store build (TestFlight / Play) | store-side rollback | minutes–hours (review for iOS) | no — needs a new build version |

## Decision tree

1. **JS-only bug** (logic, UI, rules, OCR parsing) and the app
   already runs a build with expo-updates → **OTA rollback** (fast).
2. **Native crash, broken native module, corrupt bundle, or the
   affected builds never received an OTA update** → **store
   rollback** (slow).
3. **Active rollout causing harm at scale and you need time to
   decide** → **pause the channel** (freeze).

## 1. OTA rollback (EAS Update)

Find the update to roll back to:

```sh
npx eas-cli update:view            # interactive picker
npx eas-cli branch:view version-1.0 --json
```

Roll back the latest update on the channel's branch (republishes the
previous update):

```sh
# non-interactive: pass the update group id of the CURRENT (bad) update
npx eas-cli update:rollback <BAD_UPDATE_GROUP_ID> -p all --force-end-active-rollout --non-interactive

# or let the CLI pick it interactively
npx eas-cli update:rollback

# fastlane equivalent
fastlane rollback_ota group:<BAD_UPDATE_GROUP_ID>
fastlane rollback_ota                 # interactive picker
```

If the bad update was the **first** update ever published, the
rollback reverts to the update embedded in the build:

```sh
npx eas-cli update:rollback <FIRST_UPDATE_GROUP_ID> -p all --force-end-active-rollout --non-interactive
# fastlane equivalent: fastlane rollback_embedded group:<ID>
```

**Freeze instead of revert** while investigating:

```sh
npx eas-cli channel:pause production --non-interactive   # clients keep their current update, get no new ones
npx eas-cli channel:resume production --non-interactive  # lift the freeze
# fastlane: fastlane pause_channel channel:production / resume_channel
```

**Graduated rollback** (if the bad release was a rollout):

```sh
npx eas-cli channel:rollout production --action view --json
npx eas-cli channel:rollout production --action edit --percent 0
npx eas-cli channel:rollout production --action end --outcome revert
```

After any OTA rollback, verify in Sentry that crash volume drops on
the affected release, then republish the fixed JS as a normal OTA
update (`fastlane ota` / the dev/staging pipeline).

## 2. Store rollback

### iOS (TestFlight / App Store)

- **Still in TestFlight, not promoted**: expire the build —
  App Store Connect → TestFlight → select build → **Stop Testing**
  / remove from the group, then distribute the previous build.
- **Already on the App Store**: Apple has no un-publish. Options:
  1. Prepare a fixed build (`X.Y.Z+1`) and submit expedited review
     (request review escalation via App Store Connect if the issue is
     severe).
  2. If the breakage came from an OTA update layered on that build,
     do the OTA rollback above — it fixes every installed copy of
     the store build without a new App Store release.
- Remove the bad build from the `Truelabels Internal` group so
  internal testers stop installing it.

### Android (Play Internal / production)

- **Internal track**: Play Console → Internal testing → manage
  releases → **Discard** the bad release (internal tracks allow
  discarding before it is rolled to production).
- **Production track**: Play Console → Production → the bad release
  → **Halt rollout** (serves 0% while keeping the version
  available), or **Roll back to previous version** (re-promotes the
  prior artifact).
- Halt via API/automation requires the Play service-account key;
  store it as a GitHub secret (`PLAY_SERVICE_ACCOUNT_JSON`) and use
  the Google Play API — do not commit the key.

## 3. Nuclear option

If a build is fundamentally broken and OTA cannot fix it (e.g. the
JS bundle fails to load at startup):

1. `fastlane pause_channel channel:production` (freeze OTA).
2. Halt the Play rollout / stop TestFlight distribution.
3. Build and ship `X.Y.Z+1` with the fix — the version bump
   guarantees a higher build number, which both stores require.
4. Communicate: release notes, TestFlight group message, and a
   Sentry release tag for the fix version.

## Post-rollback

- [ ] Confirm in Sentry: crash-free sessions recovering on the
      affected version.
- [ ] Confirm in EAS Insights: adoption of the rolled-back update.
- [ ] Root-cause the failure; add a regression test and a Maestro
      flow covering the broken path.
- [ ] Re-run the release pipeline from the `staging` branch before
      re-tagging.
