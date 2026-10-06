# UI tests (Maestro)

Flows in `flows/` run against a **development client** build (dev clients can
load updates from any EAS Update channel, so the same APK exercises staging
and production OTA code).

## Run locally

```sh
# 1. Build an Android dev client and install it
npx eas-cli build -p android -e development --wait
npx eas-cli build:download --dev-client -p android
adb install truelabels-*.apk
adb shell pm grant com.truelabels.app android.permission.CAMERA

# 2. Run all flows
maestro test tests/e2e/flows

# Or a single flow
maestro test tests/e2e/flows/manual-barcode-lookup.yaml
```

## Run in CI

The `dev` and `staging` GitHub Actions pipelines build the dev client, boot an
Android emulator on the runner, install the APK, and run every flow in
`tests/e2e/flows` (see `.github/workflows/dev.yml`).

## Adding a flow

1. Add `flows/<name>.yaml` with `appId: com.truelabels.app`.
2. Target accessibility labels (they are stable across layouts):
   - `Open scan history`, `Scan label`, `Type ingredients`
   - `Barcode number`, `Look up`, `Ingredients text`, `Analyse ingredients`
3. Network-dependent flows (barcode lookup) must tolerate slow CI connections:
   wrap the expected screen in `extendedWaitFor` with a 30s timeout.

## Maestro Cloud (optional)

To run flows on real devices instead of an emulator, set `MAESTRO_API_KEY` in
the CI secret store and replace the emulator step with:

```sh
maestro test --env MAPI_KEY="$MAESTRO_API_KEY" tests/e2e/flows
```

Maestro Cloud needs the app binary uploaded first:
`maestro test --upload <path-to-apk> ...`.
