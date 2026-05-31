# Review Workflow

## What to build

Implement the desktop review flow that splits session items into Successfully Scanned and Requires Review. Rarity Confirmation must always be required before success, Review Reasons should distinguish Rarity Review and Identification Review, and completed review should promote items automatically.

## Acceptance criteria

- [ ] Pricing Session UI shows Successfully Scanned and Requires Review sections.
- [ ] Items without Rarity Confirmation remain in Requires Review.
- [ ] Rarity Review is used when the item is otherwise identified but needs rarity confirmation.
- [ ] Identification Review is used when trusted Printing Identity is missing.
- [ ] The user can manually correct all item fields.
- [ ] Completing required fields automatically moves an item to Successfully Scanned.
- [ ] Guarded bulk Rarity Confirmation is available for selected similar items.

## Blocked by

- [0006 Manual Entry Vertical Slice](./0006-manual-entry-vertical-slice.md)
- [0007 Baseline YGOPRODeck Pricing](./0007-baseline-ygoprodeck-pricing.md)
