# Manual Entry Vertical Slice

## What to build

Allow the Review Client to create a captured item without using the Capture Client. Manual Entry should use metadata search, let the user choose/edit Printing Identity fields, and create a session item with rarity, condition, edition, language, and quantity.

## Acceptance criteria

- [ ] The user can manually add a card inside a Pricing Session.
- [ ] Manual Entry uses metadata search to select a card candidate.
- [ ] The user can edit card name, Set Code, Passcode, rarity, edition, language, condition, and quantity.
- [ ] Rarity uses the deduplicated searchable rarity dropdown with aliases.
- [ ] Condition uses the condition dropdown and defaults to Mint.
- [ ] Card Language defaults to English.
- [ ] Card Edition defaults to 1st Edition with Limited Edition and Unlimited options.
- [ ] Manual Entry can exist without a Best Frame.

## Blocked by

- [0003 Pricing Session Dashboard](./0003-pricing-session-dashboard.md)
- [0005 Card Metadata Cache And Search](./0005-card-metadata-cache-and-search.md)
