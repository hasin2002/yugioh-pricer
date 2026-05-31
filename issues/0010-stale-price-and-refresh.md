# Stale Price And Refresh

## What to build

Mark Price Snapshots older than seven days as Stale Prices while still counting them in Estimated Value. Add confirmed per-item refresh and bulk refresh behavior that skips archived sessions and Review Items by default.

## Acceptance criteria

- [ ] Price Snapshots older than seven days are marked stale.
- [ ] Stale Prices still count toward Estimated Value.
- [ ] Totals visibly indicate when stale data is included.
- [ ] The user can refresh an individual item after a confirmation dialog.
- [ ] The user can refresh all pricing after a confirmation dialog.
- [ ] Bulk refresh skips Archived Sessions by default.
- [ ] Bulk refresh skips Review Items by default.

## Blocked by

- [0007 Baseline YGOPRODeck Pricing](./0007-baseline-ygoprodeck-pricing.md)
- [0009 Collection Aggregation](./0009-collection-aggregation.md)
