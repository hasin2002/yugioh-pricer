# GBP Currency Conversion

## What to build

Display all Estimated Values in GBP while preserving source amounts and currencies on Price Snapshots. Fetch exchange rates from a reliable free public API where possible, cache rates daily, and use stale fallback when fresh rates are unavailable.

## Acceptance criteria

- [ ] Display Currency is GBP.
- [ ] Price Snapshots preserve original source amount and currency.
- [ ] Non-GBP prices are converted for Estimated Value.
- [ ] Exchange rates are fetched and cached daily.
- [ ] If fresh exchange rates fail, the app can use cached rates up to seven days old with a visible stale-rate indicator.
- [ ] If no usable exchange rate exists, affected items are treated as unpriced for GBP totals and shown clearly.

## Blocked by

- [0007 Baseline YGOPRODeck Pricing](./0007-baseline-ygoprodeck-pricing.md)
