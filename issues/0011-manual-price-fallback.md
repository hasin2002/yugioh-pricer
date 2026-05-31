# Manual Price Fallback

## What to build

Allow the user to enter a Manual Price when external pricing sources do not provide a usable price. Manual Price should create a user-entered Price Snapshot with optional source Notes and act as the final fallback for Estimated Value.

## Acceptance criteria

- [ ] The user can add a Manual Price to an item.
- [ ] Manual Price stores amount, timestamp, user-entered source label, and optional Note.
- [ ] Manual Price is visibly identified as user-entered.
- [ ] Manual Price is used as final fallback when selected basis and source fallback are missing.
- [ ] Manual Price does not hide underlying Pricing Issues from external sources.

## Blocked by

- [0007 Baseline YGOPRODeck Pricing](./0007-baseline-ygoprodeck-pricing.md)
- [0009 Collection Aggregation](./0009-collection-aggregation.md)
