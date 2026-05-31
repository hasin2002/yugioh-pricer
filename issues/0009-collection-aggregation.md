# Collection Aggregation

## What to build

Derive the Personal Collection from captured/session items. Collection rows should aggregate by Printing Identity and Condition while preserving Session Provenance and excluding Archived Sessions from Collection Estimated Value and default views.

## Acceptance criteria

- [ ] Successfully Scanned Items from non-archived sessions contribute to the Personal Collection.
- [ ] Review Items persist but do not contribute to Collection Estimated Value.
- [ ] Archived Session items are excluded from Collection Estimated Value by default.
- [ ] Collection rows aggregate by Printing Identity and Condition.
- [ ] Aggregated rows preserve Session Provenance back to contributing sessions/items.
- [ ] Opening a session still shows its own Session Estimated Value, even when archived.
- [ ] Collection aggregation is derived from captured/session items rather than a manually synchronized summary copy.

## Blocked by

- [0008 Review Workflow](./0008-review-workflow.md)
