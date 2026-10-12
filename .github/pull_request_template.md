## Summary

<!-- What does this change do, and why? One or two sentences. -->

## Type of change

- [ ] Rule set addition or correction
- [ ] Scan pipeline (camera, OCR, barcode)
- [ ] Verdict, coverage, or safety logic
- [ ] UI or design system
- [ ] History, storage, or migrations
- [ ] Build, CI, or tooling
- [ ] Documentation

## Safety review

<!-- This section matters most. Answer honestly; an empty section will be queried. -->

Does this change anything that could affect what verdict a user is shown?

- [ ] No
- [ ] Yes — and I have described the impact below

<!-- If yes, explain the impact on the abstention path, and confirm you ran
     `npm run eval:baseline` and the false-safe rate did not increase. -->

## Checks run

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run eval:baseline` (required for verdict-path changes)

## Test plan

<!-- How did you verify this? Include the input and the expected output. For a rule
     addition, include a case that exercises the `exclude` path. -->

## Screenshots

<!-- If this is a visual change. -->

## Notes for reviewers

<!-- Anything worth knowing, including anything you were unsure about. -->
