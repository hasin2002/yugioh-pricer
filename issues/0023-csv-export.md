# CSV Export

## What to build

Add CSV export for current Pricing Session, active collection, Review Queue, and archived sessions where useful. Exports should populate known fields and leave missing fields empty rather than failing.

## Acceptance criteria

- [ ] The user can export the current Pricing Session to CSV.
- [ ] The user can export the active collection to CSV.
- [ ] The user can export the Review Queue to CSV.
- [ ] Archived sessions can be exported or included through an explicit option.
- [ ] CSV columns include card name, Set Code, rarity, edition, language, condition, quantity, selected estimated value, price basis/source, stale/missing price flags, session name, Storage Location, Disposition, and Notes.
- [ ] Missing optional data produces empty CSV fields rather than errors.

## Blocked by

- [0009 Collection Aggregation](./0009-collection-aggregation.md)
- [0022 Search And Filters](./0022-search-and-filters.md)
