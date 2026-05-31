# eBay Comparison And Value Basis

## What to build

Add optional eBay comparison pricing with server-only credentials. eBay should run in the background, store Comparison Evidence and eBay Price Snapshots, and support a global Estimated Value Basis switch with clear fallback behavior.

## Acceptance criteria

- [ ] eBay credentials are read only on the server from environment variables.
- [ ] If eBay credentials are missing, eBay features are hidden or disabled gracefully.
- [ ] eBay comparison can run in the background for reviewed items.
- [ ] eBay Comparison Evidence includes matched listing details where permitted by the API.
- [ ] eBay creates its own Price Snapshot separate from YGOPRODeck.
- [ ] The user can globally switch Estimated Value Basis between YGOPRODeck and eBay.
- [ ] eBay basis falls back to YGOPRODeck when eBay pricing is missing.
- [ ] UK evidence links are preferred where possible, falling back to non-UK links when needed.

## Blocked by

- [0007 Baseline YGOPRODeck Pricing](./0007-baseline-ygoprodeck-pricing.md)
- [0009 Collection Aggregation](./0009-collection-aggregation.md)
- [0012 GBP Currency Conversion](./0012-gbp-currency-conversion.md)
