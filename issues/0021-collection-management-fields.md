# Collection Management Fields

## What to build

Add collection management metadata and quantity splitting. Card Records should support optional Notes, Storage Location, and Disposition, and the desktop should let the user split quantities when condition, storage, or other fields differ.

## Acceptance criteria

- [ ] Pricing Sessions, card records, and Manual Prices support optional Notes where applicable.
- [ ] Card Records support optional Storage Location.
- [ ] Card Records support Disposition values Keep, Trade, Sell, and Undecided.
- [ ] Disposition defaults to Undecided.
- [ ] The user can split a quantity into separate rows with different fields.
- [ ] Split rows preserve Session Provenance where possible.
- [ ] Session and collection totals update after splits.

## Blocked by

- [0009 Collection Aggregation](./0009-collection-aggregation.md)
