# Card Metadata Cache And Search

## What to build

Create a local card metadata cache backed by YGOPRODeck data. The cache should support fast lookup by card name, Set Code, and Passcode, refresh when older than 12 hours, refresh on local server restart, and refresh manually.

## Acceptance criteria

- [ ] The app can fetch and persist YGOPRODeck card metadata locally.
- [ ] Metadata refreshes on local server restart.
- [ ] Metadata refreshes when older than 12 hours.
- [ ] The user can manually refresh metadata.
- [ ] Search supports card name, Set Code, and Passcode.
- [ ] Search results expose enough data to build a Printing Identity candidate.
- [ ] Pricing for newly scanned or manually added cards is not treated as satisfied by metadata cache alone.

## Blocked by

- [0001 Scaffold Local-First App Shell](./0001-scaffold-local-first-app-shell.md)
