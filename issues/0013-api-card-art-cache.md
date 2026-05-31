# API Card Art Cache

## What to build

Download API card art lazily for cards that appear in Pricing Sessions or the Personal Collection, store it locally, and serve it from app-controlled storage. The app must not hotlink YGOPRODeck images.

## Acceptance criteria

- [ ] API card art is downloaded on demand for cards that appear in the app.
- [ ] API card art is served locally by the app.
- [ ] The app does not render YGOPRODeck image URLs directly.
- [ ] Card art failure does not block a card from becoming Successfully Scanned.
- [ ] Item details can show API card art and Best Frame separately when both exist.
- [ ] Cached API card art is treated as rebuildable reference media.

## Blocked by

- [0005 Card Metadata Cache And Search](./0005-card-metadata-cache-and-search.md)
- [0006 Manual Entry Vertical Slice](./0006-manual-entry-vertical-slice.md)
