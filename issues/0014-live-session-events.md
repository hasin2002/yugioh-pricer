# Live Session Events

## What to build

Add WebSocket session events so the Review Client updates live as Pricing Session data changes. SQLite remains the source of truth; events notify clients about changes and trigger refetch or local patching.

## Acceptance criteria

- [ ] The app exposes a WebSocket channel for Pricing Session events.
- [ ] Connected Review Clients receive updates for new items, review changes, quantity changes, price changes, and session status changes.
- [ ] Events do not replace SQLite as source of truth.
- [ ] Reconnecting a client resynchronizes current session state.
- [ ] Live updates are visible without manually refreshing the browser.

## Blocked by

- [0003 Pricing Session Dashboard](./0003-pricing-session-dashboard.md)
- [0008 Review Workflow](./0008-review-workflow.md)
