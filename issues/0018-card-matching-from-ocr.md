# Card Matching From OCR

## What to build

Convert OCR Evidence into card candidates using the local card metadata cache. Matching should support partial data, assign Review Reasons, and create Review Items or otherwise identified items that still require Rarity Confirmation.

## Acceptance criteria

- [ ] Name plus Set Code can produce a high-confidence Printing Identity candidate.
- [ ] Set Code only can produce or narrow candidates where metadata supports it.
- [ ] Name only creates an ambiguous result that requires review.
- [ ] Passcode only can identify the card family but does not count as full Printing Identity.
- [ ] Matching assigns Rarity Review when only rarity confirmation is missing.
- [ ] Matching assigns Identification Review when trusted Printing Identity is missing.
- [ ] User-Confirmed Values take precedence over OCR and source suggestions.

## Blocked by

- [0005 Card Metadata Cache And Search](./0005-card-metadata-cache-and-search.md)
- [0008 Review Workflow](./0008-review-workflow.md)
- [0017 Server-Side OCR Pipeline](./0017-server-side-ocr-pipeline.md)
