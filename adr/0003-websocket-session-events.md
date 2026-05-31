# WebSocket session events

The app will use tRPC for normal typed client-server operations and a small WebSocket channel for live pricing session events. SQLite remains the source of truth; WebSocket events notify connected review and capture clients about session changes such as new captured items, review updates, and price changes.
