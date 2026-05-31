# Baseline YGOPRODeck Pricing

## What to build

Fetch YGOPRODeck baseline Price Snapshots for session items and calculate Session Estimated Value from priced items. Pricing failures should produce clear Pricing Issues, and Unpriced Items should be visible but excluded from totals.

## Acceptance criteria

- [ ] A session item can fetch a YGOPRODeck Price Snapshot.
- [ ] Price Snapshots preserve observed amount, source, currency where available, and timestamp.
- [ ] Session Estimated Value uses priced session items and Card Quantity.
- [ ] Review Items are excluded from Session Estimated Value.
- [ ] Pricing unavailable and no price found are shown as distinct Pricing Issues.
- [ ] Unpriced Items remain visible and are excluded from Estimated Value.
- [ ] Newly added cards fetch fresh pricing rather than relying on metadata cache.

## Blocked by

- [0006 Manual Entry Vertical Slice](./0006-manual-entry-vertical-slice.md)
