# Security Policy

TrueLabels is an allergen-safety tool. A defect that causes the app to report a product as
`SAFE` when it is not is a safety issue, not merely a bug, and will be treated with
corresponding priority.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

Only the latest released version receives fixes. Because the scan pipeline is offline and
the rule set is bundled with the app, a fix requires an app update or an over-the-air
update — there is no server-side component that can mitigate a bad verdict.

## Reporting a vulnerability

**Please do not open a public issue for a vulnerability.**

Report it privately to the maintainer via GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/2skyrider6/TrueLabels/security/advisories/new)

If private reporting is unavailable, contact the maintainer directly through the email listed
on their GitHub profile.

Please include:

- a description of the issue and its impact
- steps to reproduce, or a fixture if one is easier
- the affected screen and app version
- anything you have already identified about the verdict path involved

## What counts as a security issue

Include, but not limited to:

- a path that presents an `unverified` or unreadable label as a clean `SAFE` verdict
- a false negative in allergen or additive detection that could reach a user
- any leakage of on-device data off the device
- a dependency vulnerability that is reachable from the app

## Response expectations

This is a small project maintained by volunteers, so please allow reasonable time for a
response. The intent is:

- acknowledgement within 7 days
- an assessment of severity and safety impact within a further 14 days
- a coordinated disclosure timeline agreed with you before publication

We will credit reporters who wish to be credited, and keep reporters anonymous otherwise.

## Scope

TrueLabels runs the entire analysis on the device. There is no TrueLabels account, server, or
upload. The only outbound network request the app can make is a barcode lookup to
[Open Food Facts](https://world.openfoodfacts.org), which is a third-party service covered by
its own policy. Telemetry, where enabled, goes to Sentry and is opt-in via configuration.
